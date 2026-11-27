-- Old page addresses keep working. When an owner changes their page address (businesses.slug),
-- the old one is remembered here, so every link already out there (the business page, a drop's
-- claim link /d/<old>/<drop>, a collection page, the listing) redirects to the new address instead
-- of "page not found". An old address stays the business's own: no other business can take it.
-- The owner can go back to it (the row is then removed, since it's live again).

create table public.old_page_addresses (
  slug text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index old_page_addresses_business on public.old_page_addresses (business_id);

-- No direct access for anyone; reads go through the functions below.
alter table public.old_page_addresses enable row level security;
revoke all on public.old_page_addresses from anon, authenticated;

-- Remember the old address; a live address is never also an old one.
create function private.remember_old_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is distinct from old.slug then
    insert into public.old_page_addresses (slug, business_id) values (old.slug, new.id)
      on conflict (slug) do update set business_id = excluded.business_id, changed_at = now();
    delete from public.old_page_addresses where slug = new.slug;
  end if;
  return new;
end;
$$;

create trigger businesses_remember_old_address
  after update of slug on public.businesses
  for each row execute function private.remember_old_address();

-- Another business can't take someone's old address (the message names "slug" so the app shows
-- "That page address was just taken").
create function private.reject_old_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.old_page_addresses o where o.slug = new.slug and o.business_id <> new.id) then
    raise exception 'slug usetikka.com/% belongs to another business', new.slug using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger businesses_reject_old_address
  before insert or update of slug on public.businesses
  for each row execute function private.reject_old_address();

-- Where an old address points now: the business's current address, or null. Public (the pages
-- call it before saying "not found"); it only reveals what the business page itself shows.
create function public.page_moved_to(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select b.slug
  from public.old_page_addresses o
  join public.businesses b on b.id = o.business_id
  where o.slug = lower(p_slug)
    and not exists (select 1 from public.businesses x where x.slug = lower(p_slug));
$$;
revoke all on function public.page_moved_to(text) from public;
grant execute on function public.page_moved_to(text) to anon, authenticated, service_role;

-- Old addresses of other businesses, so the address picker says "taken" before saving.
create function public.others_old_addresses() returns setof text
language sql stable security definer set search_path = '' as $$
  select o.slug
  from public.old_page_addresses o
  where not exists (
    select 1 from public.business_members m
    where m.business_id = o.business_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;
revoke all on function public.others_old_addresses() from public;
grant execute on function public.others_old_addresses() to authenticated, service_role;

-- Maril kay changed her address on 26 Nov 2026, before this existed; her drop links still use the
-- old one (usetikka.com/d/marilkaybeautyandcontentstudio/induction-glam-drop).
insert into public.old_page_addresses (slug, business_id, changed_at)
select 'marilkaybeautyandcontentstudio', b.id, '2026-11-26T12:00:00Z'
from public.businesses b
where b.id = '48a7db23-be72-4b1e-a940-507f4a574722'
  and not exists (select 1 from public.businesses x where x.slug = 'marilkaybeautyandcontentstudio')
on conflict (slug) do nothing;
