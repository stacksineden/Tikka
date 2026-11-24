-- Business cards (docs/BUSINESS_CARDS.md, PRD B10a; agreed 24 Nov 2026). Free for every business,
-- like posters. In code they're "contact cards" because "card" already means the Tikka card.
--
-- Each card has a permanent code, usetikka.com/c/[code], that always opens the business page
-- (never a drop). A printed card never stops working: removing a card only hides it from the
-- dashboard, and its code still opens the page. Owners only (staff never see cards); writes go
-- through the functions below.

create table public.contact_cards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code char(6) not null unique check (code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$'),
  -- Unset follows the category (lib/contact-cards.ts defaultStyle()).
  style text check (style in ('classic', 'photo', 'minimal', 'bold')),
  -- The Photo style's photo; unset (or deleted) uses the first portfolio photo.
  photo_id uuid references public.business_portfolio (id) on delete set null,
  -- Unset: the business's own card. Set: a person's card ("Funmi Adeyemi", "Founder").
  person_name varchar(40) check (person_name is null or trim(person_name) <> ''),
  person_role varchar(40) check (private.clean_words(person_role)),
  rounded boolean not null default false,
  show_phone boolean not null default true,
  show_instagram boolean not null default true,
  show_place boolean not null default true,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_role is null or person_name is not null)
);
create index contact_cards_business on public.contact_cards (business_id, created_at);

-- Scans per card per day (WAT), once per visitor per day: "23 scans this month".
create table public.contact_card_scans (
  card_id uuid not null references public.contact_cards (id) on delete cascade,
  day date not null,
  scans int not null default 0 check (scans >= 0),
  primary key (card_id, day)
);

alter table public.contact_cards enable row level security;
alter table public.contact_card_scans enable row level security;
create policy "owners read contact cards" on public.contact_cards for select to authenticated
  using (private.is_owner(business_id) or private.is_admin());
create policy "owners read contact card scans" on public.contact_card_scans for select to authenticated
  using (exists (select 1 from public.contact_cards c where c.id = card_id and (private.is_owner(c.business_id) or private.is_admin())));
revoke insert, update, delete on public.contact_cards, public.contact_card_scans from anon, authenticated;

-- Six characters from the code alphabet, unused by any poster or card, so one code always
-- means one thing.
create function private.contact_card_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  c text;
begin
  loop
    select string_agg(substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(private.crypto_random() * 25)::int, 1), '')
    into c from generate_series(1, 6);
    exit when not exists (select 1 from public.contact_cards where code = c)
      and not exists (select 1 from public.posters where code = c);
  end loop;
  return c;
end;
$$;
revoke all on function private.contact_card_code() from public, anon, authenticated;

-- The owner's cards with their scans, oldest first (the business's own card is made first).
create function public.my_contact_cards(p_business uuid)
returns table (
  id uuid, code text, style text, photo_id uuid, person_name text, person_role text,
  rounded boolean, show_phone boolean, show_instagram boolean, show_place boolean,
  created_at timestamptz, scans_month int, scans_total int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  month_start date := date_trunc('month', now() at time zone 'Africa/Lagos')::date;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can see business cards' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, c.code::text, c.style, c.photo_id, c.person_name::text, c.person_role::text,
           c.rounded, c.show_phone, c.show_instagram, c.show_place, c.created_at,
           coalesce((select sum(s.scans) from public.contact_card_scans s where s.card_id = c.id and s.day >= month_start), 0)::int,
           coalesce((select sum(s.scans) from public.contact_card_scans s where s.card_id = c.id), 0)::int
    from public.contact_cards c
    where c.business_id = p_business and c.removed_at is null
    order by c.created_at, c.id;
end;
$$;

-- A new card: the business's own (no person) or a person's. Up to 20 that aren't removed.
create function public.add_contact_card(p_business uuid, p_person_name text default null, p_person_role text default null)
returns public.contact_cards
language plpgsql security definer set search_path = '' as $$
declare
  c public.contact_cards;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can make business cards' using errcode = 'insufficient_privilege';
  end if;
  -- Locked so two tabs adding at once can't go over.
  perform 1 from public.businesses where id = p_business for update;
  if (select count(*) from public.contact_cards where business_id = p_business and removed_at is null) >= 20 then
    raise exception 'You can have up to 20 business cards' using errcode = 'check_violation';
  end if;
  insert into public.contact_cards (business_id, code, person_name, person_role)
  values (p_business, private.contact_card_code(), nullif(trim(p_person_name), ''), nullif(trim(p_person_role), ''))
  returning * into c;
  return c;
end;
$$;

-- Everything the owner picks. The photo must be one of this business's own photos.
create function public.save_contact_card(
  p_card uuid, p_style text, p_photo uuid, p_person_name text, p_person_role text,
  p_rounded boolean, p_show_phone boolean, p_show_instagram boolean, p_show_place boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  select business_id into b from public.contact_cards where id = p_card and removed_at is null;
  if b is null or not private.is_owner(b) then
    raise exception 'Only the owner can change business cards' using errcode = 'insufficient_privilege';
  end if;
  if p_photo is not null and not exists (
    select 1 from public.business_portfolio p where p.id = p_photo and p.business_id = b and p.kind = 'photo'
  ) then
    raise exception 'Pick one of your own photos' using errcode = 'check_violation';
  end if;
  update public.contact_cards set
    style = p_style,
    photo_id = p_photo,
    person_name = nullif(trim(p_person_name), ''),
    person_role = nullif(trim(p_person_role), ''),
    rounded = coalesce(p_rounded, false),
    show_phone = coalesce(p_show_phone, true),
    show_instagram = coalesce(p_show_instagram, true),
    show_place = coalesce(p_show_place, true),
    updated_at = now()
  where id = p_card;
end;
$$;

-- Removing hides the card from the dashboard. Its code keeps opening the business page, because
-- it may already be printed.
create function public.remove_contact_card(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  select business_id into b from public.contact_cards where id = p_card and removed_at is null;
  if b is null or not private.is_owner(b) then
    raise exception 'Only the owner can remove business cards' using errcode = 'insufficient_privilege';
  end if;
  update public.contact_cards set removed_at = now(), updated_at = now() where id = p_card;
end;
$$;

-- /c/[code] (server only): the business page's slug, counting one scan per visitor per day.
-- Removed cards still open the page; a suspended business's cards open nothing.
create function public.contact_card_scan(p_code text, p_visitor_hash text)
returns table (card_id uuid, business_id uuid, slug text)
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
  b uuid;
  s text;
begin
  select cc.id, bz.id, bz.slug into c, b, s
  from public.contact_cards cc join public.businesses bz on bz.id = cc.business_id
  where cc.code = upper(trim(p_code)) and not bz.suspended;
  if c is null then
    return;
  end if;
  if coalesce(p_visitor_hash, '') <> '' and public.rate_hit('cc:' || c || ':' || p_visitor_hash, 1, 86400) then
    insert into public.contact_card_scans as t (card_id, day, scans)
    values (c, (now() at time zone 'Africa/Lagos')::date, 1)
    -- By name: the function's own card_id output would make (card_id, day) ambiguous.
    on conflict on constraint contact_card_scans_pkey do update set scans = t.scans + 1;
  end if;
  return query select c, b, s;
end;
$$;

revoke all on function
  public.my_contact_cards(uuid),
  public.add_contact_card(uuid, text, text),
  public.save_contact_card(uuid, text, uuid, text, text, boolean, boolean, boolean, boolean),
  public.remove_contact_card(uuid)
from public, anon;
grant execute on function
  public.my_contact_cards(uuid),
  public.add_contact_card(uuid, text, text),
  public.save_contact_card(uuid, text, uuid, text, text, boolean, boolean, boolean, boolean),
  public.remove_contact_card(uuid)
to authenticated;
revoke all on function public.contact_card_scan(text, text) from public, anon, authenticated;
grant execute on function public.contact_card_scan(text, text) to service_role;
