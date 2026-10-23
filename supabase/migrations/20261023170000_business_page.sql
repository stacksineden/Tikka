-- The free business page (PRD A5, TECH_PLAN §3, §13): the one-page website at /[slug].
-- Anyone can read a business's page; only its owner changes it (staff can't). The limits the
-- editor shows (lib/page.ts PAGE_LIMITS) are enforced here too, and so is rule 8 on the words
-- the owner writes.

-- Rule 8 in SQL: the same words as lib/page.ts GAMBLING, whole words only.
create function private.clean_words(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') !~* '\m(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\M';
$$;

create table public.business_page (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  hero_image_path text,
  hero_focal_x numeric(4, 3) not null default 0.5 check (hero_focal_x between 0 and 1),
  hero_focal_y numeric(4, 3) not null default 0.5 check (hero_focal_y between 0 and 1),
  headline varchar(60) check (private.clean_words(headline)),
  subline varchar(100) check (private.clean_words(subline)),
  about_image_path text,
  show_team boolean not null default false,
  show_faqs boolean not null default false,
  show_text boolean not null default false,
  text_title varchar(40) check (private.clean_words(text_title)),
  text_body varchar(600) check (private.clean_words(text_body)),
  updated_at timestamptz not null default now(),
  check (not show_text or (coalesce(trim(text_title), '') <> '' and coalesce(trim(text_body), '') <> ''))
);

create table public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_name varchar(30),
  name varchar(40) not null check (trim(name) <> ''),
  description varchar(140),
  price_kobo int check (price_kobo >= 0),
  price_kind text not null default 'fixed' check (price_kind in ('fixed', 'from', 'ask')),
  duration varchar(20),
  image_path text,
  position int not null default 0,
  check (price_kind = 'ask' or price_kobo is not null)
);
create index business_services_order on public.business_services (business_id, position);

create table public.business_portfolio (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo', 'video')),
  image_path text not null,
  thumb_path text not null,
  caption varchar(80),
  duration_s numeric(4, 1),
  bytes int check (bytes > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- Videos: 15 seconds (half a second of grace) and 15 MB at most.
  check (kind = 'photo' or (duration_s between 0 and 15.5 and bytes <= 15 * 1024 * 1024))
);
create index business_portfolio_order on public.business_portfolio (business_id, position);

create table public.business_team (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name varchar(40) not null check (trim(name) <> ''),
  role varchar(40),
  photo_path text,
  position int not null default 0
);
create index business_team_order on public.business_team (business_id, position);

create table public.business_faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  question varchar(120) not null check (trim(question) <> '' and private.clean_words(question)),
  answer varchar(400) not null check (trim(answer) <> '' and private.clean_words(answer)),
  position int not null default 0
);
create index business_faqs_order on public.business_faqs (business_id, position);

-- How many of each a business can have. The business row is locked so two tabs adding at once
-- can't go over.
create function private.page_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  perform 1 from public.businesses where id = new.business_id for update;
  execute format('select count(*) from public.%I where business_id = $1', tg_table_name) into n using new.business_id;
  if n >= cap then
    raise exception 'Up to % on your page', cap using errcode = 'check_violation';
  end if;
  if tg_table_name = 'business_portfolio' and new.kind = 'video'
     and (select count(*) from public.business_portfolio where business_id = new.business_id and kind = 'video') >= 3 then
    raise exception 'Up to 3 videos' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger services_limit before insert on public.business_services for each row execute function private.page_limit('12');
create trigger portfolio_limit before insert on public.business_portfolio for each row execute function private.page_limit('12');
create trigger team_limit before insert on public.business_team for each row execute function private.page_limit('8');
create trigger faqs_limit before insert on public.business_faqs for each row execute function private.page_limit('10');

-- Every business has a page row from the start (the editor only ever updates it).
create function private.add_business_page() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_page (business_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger businesses_page after insert on public.businesses for each row execute function private.add_business_page();
insert into public.business_page (business_id) select id from public.businesses on conflict do nothing;

create function private.touch_page() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger business_page_touch before update on public.business_page for each row execute function private.touch_page();

-- ------------------------------------------------------------------ RLS

alter table public.business_page enable row level security;
alter table public.business_services enable row level security;
alter table public.business_portfolio enable row level security;
alter table public.business_team enable row level security;
alter table public.business_faqs enable row level security;

-- Readable wherever the business is (the businesses policy already hides suspended ones).
create policy "read pages" on public.business_page for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "read services" on public.business_services for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "read portfolio" on public.business_portfolio for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "read team" on public.business_team for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy "read faqs" on public.business_faqs for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));

-- Owners only.
create policy "owners edit page" on public.business_page for update to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners edit services" on public.business_services for all to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners edit portfolio" on public.business_portfolio for all to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners edit team" on public.business_team for all to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));
create policy "owners edit faqs" on public.business_faqs for all to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));

revoke insert, update, delete on public.business_page, public.business_services, public.business_portfolio,
  public.business_team, public.business_faqs from anon;
revoke insert, delete on public.business_page from authenticated;
revoke update on public.business_page from authenticated;
grant update (hero_image_path, hero_focal_x, hero_focal_y, headline, subline, about_image_path, show_team, show_faqs,
  show_text, text_title, text_body) on public.business_page to authenticated;
-- Moving a row to another business is never allowed.
revoke update on public.business_services, public.business_portfolio, public.business_team, public.business_faqs from authenticated;
grant update (group_name, name, description, price_kobo, price_kind, duration, image_path, position) on public.business_services to authenticated;
grant update (caption, position) on public.business_portfolio to authenticated;
grant update (name, role, photo_path, position) on public.business_team to authenticated;
grant update (question, answer, position) on public.business_faqs to authenticated;

-- ------------------------------------------------------ saving lists

-- The editor saves each list whole, in order. These run as the caller, so the owner-only
-- policies and the limits apply exactly as for direct writes. Each returns how many it saved.
create function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, image_path, position)
  select p_business, nullif(trim(s ->> 'group_name'), ''), trim(s ->> 'name'), nullif(trim(s ->> 'description'), ''),
         (s ->> 'price_kobo')::int, coalesce(s ->> 'price_kind', 'fixed'), nullif(trim(s ->> 'duration'), ''),
         nullif(s ->> 'image_path', ''), (o - 1)::int
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.save_team(p_business uuid, p_team jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_team where business_id = p_business;
  insert into public.business_team (business_id, name, role, photo_path, position)
  select p_business, trim(s ->> 'name'), nullif(trim(s ->> 'role'), ''), nullif(s ->> 'photo_path', ''), (o - 1)::int
  from jsonb_array_elements(coalesce(p_team, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.save_faqs(p_business uuid, p_faqs jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_faqs where business_id = p_business;
  insert into public.business_faqs (business_id, question, answer, position)
  select p_business, trim(s ->> 'question'), trim(s ->> 'answer'), (o - 1)::int
  from jsonb_array_elements(coalesce(p_faqs, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Dragging photos and videos into a new order.
create function public.save_portfolio_order(p_business uuid, p_ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.business_portfolio p set position = x.o - 1
  from unnest(p_ids) with ordinality as x(id, o)
  where p.id = x.id and p.business_id = p_business;
$$;

-- -------------------------------------------------------- the page

-- /[slug]: everything the page shows, in one call. Null when there's no such business or it's
-- suspended. No owner-only details, no phone numbers beyond the actions the owner chose to show.
create function public.get_business_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.businesses%rowtype;
  p public.business_page%rowtype;
  in_store boolean;
begin
  select * into b from public.businesses where slug = lower(p_slug) and not suspended;
  if not found then
    return null;
  end if;
  select * into p from public.business_page where business_id = b.id;
  in_store := b.serve_mode = 'in_store';

  return jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.slug, 'category', b.category,
      'state', b.state, 'city', b.city, 'area', b.area, 'tagline', b.tagline, 'about', b.about,
      'brand_color', b.brand_color, 'on_brand_color', b.on_brand_color,
      'background_type', b.background_type, 'background_value', b.background_value,
      'logo_path', b.logo_path, 'video_path', b.video_path, 'video_poster_path', b.video_poster_path,
      'actions', b.actions, 'serve_mode', b.serve_mode, 'verified', b.verified, 'is_demo', b.is_demo,
      'rating', b.rating_avg, 'review_count', b.rating_count,
      -- Online and come-to-you businesses don't show where they are.
      'address', case when in_store then b.address end,
      'hours', case when in_store then b.hours end),
    'page', jsonb_build_object(
      'hero_image_path', p.hero_image_path, 'hero_focal', jsonb_build_object('x', p.hero_focal_x, 'y', p.hero_focal_y),
      'headline', p.headline, 'subline', p.subline, 'about_image_path', p.about_image_path,
      'text', case when p.show_text then jsonb_build_object('title', p.text_title, 'body', p.text_body) end),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'group_name', s.group_name, 'name', s.name, 'description', s.description,
        'price_kobo', s.price_kobo, 'price_kind', s.price_kind, 'duration', s.duration, 'image_path', s.image_path) order by s.position)
      from public.business_services s where s.business_id = b.id), '[]'),
    'portfolio', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'image_path', x.image_path, 'thumb_path', x.thumb_path,
        'caption', x.caption, 'duration_s', x.duration_s) order by x.position, x.created_at)
      from public.business_portfolio x where x.business_id = b.id), '[]'),
    'team', case when p.show_team then coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'role', t.role, 'photo_path', t.photo_path) order by t.position)
      from public.business_team t where t.business_id = b.id), '[]') end,
    'faqs', case when p.show_faqs then coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'question', f.question, 'answer', f.answer) order by f.position)
      from public.business_faqs f where f.business_id = b.id), '[]') end,
    -- Live and upcoming drops: what's in them and how many are left, never the deck.
    'drops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'slug', d.slug, 'title', d.title, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
        'total', d.total_cards,
        'left', d.total_cards - (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop'),
        'legendary', (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'legendary'),
        'rare', (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'rare'),
        'waiting', public.notify_waiting(b.id, d.id)) order by d.starts_at)
      from public.drops d where d.business_id = b.id and d.status = 'published' and d.ends_at > now()), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r)) from public.get_business_reviews(b.id, 0) r), '[]'),
    'following', public.notify_waiting(b.id)
  );
end;
$$;

grant execute on function public.save_services(uuid, jsonb), public.save_team(uuid, jsonb), public.save_faqs(uuid, jsonb),
  public.save_portfolio_order(uuid, uuid[]) to authenticated;
revoke execute on function public.save_services(uuid, jsonb), public.save_team(uuid, jsonb), public.save_faqs(uuid, jsonb),
  public.save_portfolio_order(uuid, uuid[]) from public, anon;
grant execute on function public.get_business_page(text) to anon, authenticated;
revoke all on function private.page_limit(), private.add_business_page(), private.touch_page() from public, anon, authenticated;
grant execute on function private.clean_words(text) to anon, authenticated;
