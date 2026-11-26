-- Your Tikka listing (docs/HOMEPAGE_PLAN.md): each business chooses whether it shows in Tikka's
-- search (on by default), has a pin on the map, and can add up to 6 photos of its space (the studio,
-- the chairs, the front), which lead its listing before its work.
--
-- Additive: every business stays listed; pins start empty (a starting pin worked out from the area
-- and city is filled in by the server and marked approximate until the owner moves it); no space
-- photos until the owner adds them. search_businesses() keeps its arguments and adds the pin.

/* ------------------------------------------------------------ location and the search switch */

alter table public.businesses
  add column listed boolean not null default true,
  -- Inside Nigeria (roughly 4 to 14 north, 2.5 to 15 east).
  add column lat numeric(8, 5) check (lat between 4 and 14),
  add column lng numeric(8, 5) check (lng between 2.5 and 15),
  -- True for a pin worked out from the area and city; false once the owner places it.
  add column location_approx boolean not null default true,
  add constraint businesses_pin_check check ((lat is null) = (lng is null));

grant update (listed) on public.businesses to authenticated;

-- The owner places their pin (it's then exact). Owners only.
create function public.save_location(p_business uuid, p_lat numeric, p_lng numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner places the pin' using errcode = 'insufficient_privilege';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 4 and 14 or p_lng not between 2.5 and 15 then
    raise exception 'Put the pin in Nigeria' using errcode = 'check_violation';
  end if;
  update public.businesses set lat = round(p_lat, 5), lng = round(p_lng, 5), location_approx = false where id = p_business;
  return true;
end;
$$;

-- A starting pin from the area and city (server only): never over a pin the owner placed.
create function public.set_approx_location(p_business uuid, p_lat numeric, p_lng numeric) returns boolean
language sql security definer set search_path = '' as $$
  update public.businesses set lat = round(p_lat, 5), lng = round(p_lng, 5), location_approx = true
  where id = p_business and (lat is null or location_approx)
    and p_lat between 4 and 14 and p_lng between 2.5 and 15
  returning true;
$$;

/* ------------------------------------------------------------ photos of your space */

create table public.business_space_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  image_path text not null check (char_length(image_path) <= 300),
  thumb_path text check (char_length(thumb_path) <= 300),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index business_space_photos_order on public.business_space_photos (business_id, position);

alter table public.business_space_photos enable row level security;
create policy "read space photos" on public.business_space_photos for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
revoke insert, update, delete on public.business_space_photos from anon, authenticated;

-- Replaces the owner's space photos with these, in order (up to 6). Each photo must be in the
-- owner's own storage folder. Owners only.
create function public.save_space_photos(p_business uuid, p_photos jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner changes the listing' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_photos, '[]')) > 6 then
    raise exception 'Up to 6 photos of your space' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_photos, '[]')) x
             where coalesce(x ->> 'image_path', '') !~ ('^images/' || auth.uid()::text || '/')
                or (x ->> 'thumb_path' is not null and x ->> 'thumb_path' !~ ('^images/' || auth.uid()::text || '/'))) then
    raise exception 'Those photos aren''t yours' using errcode = 'check_violation';
  end if;
  delete from public.business_space_photos where business_id = p_business;
  insert into public.business_space_photos (business_id, image_path, thumb_path, position)
  select p_business, x ->> 'image_path', x ->> 'thumb_path', (o - 1)::int
  from jsonb_array_elements(coalesce(p_photos, '[]')) with ordinality as t(x, o);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The daily clean-up keeps space photos (same as before, plus business_space_photos).
create or replace function public.orphan_media(p_older_than interval default interval '7 days', p_limit int default 500)
returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  with saved as (
    select logo_path as path from public.businesses
    union all select background_value from public.businesses where background_type = 'photo'
    union all select video_path from public.businesses
    union all select video_poster_path from public.businesses
    union all select hero_image_path from public.business_page
    union all select about_image_path from public.business_page
    union all select image_path from public.business_services
    union all select image_path from public.business_portfolio
    union all select thumb_path from public.business_portfolio
    union all select photo_path from public.business_team
    union all select image_path from public.business_space_photos
    union all select thumb_path from public.business_space_photos
  ),
  used as (
    select path from saved
    union all select regexp_replace(path, '\.s\.webp$', '.s-sm.webp') from saved where path ~ '\.s\.webp$'
  )
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('images', 'videos')
    and o.created_at < now() - p_older_than
    and not exists (select 1 from used u where u.path = o.bucket_id || '/' || o.name)
  order by o.created_at
  limit greatest(p_limit, 0);
$$;
revoke all on function public.orphan_media(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_media(interval, int) to service_role;


/* ------------------------------------------------------------ search: listed only, with the pin */

create or replace function public.search_businesses(
  p_query text default null, p_trade text default null, p_place text default null,
  p_from date default null, p_to date default null, p_tod text default null,
  p_sort text default 'soonest', p_limit int default 24
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
  v_from date := coalesce(p_from, today);
  v_to date := coalesce(p_to, coalesce(p_from, today) + 13);
  v_query text := nullif(lower(trim(coalesce(p_query, ''))), '');
  v_tokens text[] := (select array_agg(trim(x)) from unnest(string_to_array(lower(coalesce(p_place, '')), ',')) x where trim(x) <> '');
  v_tod text := case when p_tod in ('morning', 'afternoon', 'evening') then p_tod end;
  must_be_free boolean := p_from is not null or v_tod is not null;
begin
  if v_to < v_from or v_to > today + 92 then
    v_to := least(greatest(v_to, v_from), today + 92);
  end if;
  return coalesce((
    select jsonb_agg(y.card order by y.n)
    from (
    select x.card, row_number() over (order by
        case when p_sort = 'rating' then -coalesce((x.card ->> 'rating')::numeric, 0) end,
        case when p_sort = 'new' then (x.card ->> 'joined')::timestamptz end desc,
        (x.card ->> 'place_rank')::numeric desc,
        (x.card ->> 'next_free')::timestamptz nulls last,
        -coalesce((x.card ->> 'rating')::numeric, 0)) as n
    from (
      select jsonb_build_object(
          'slug', b.slug, 'name', b.name, 'category', b.category, 'trades', to_jsonb(b.trades),
          'area', b.area, 'city', b.city, 'state', b.state,
          'comes_to_you', coalesce(b.work_place, 'shop') <> 'shop', 'only_comes_to_you', b.work_place = 'home',
          'logo_path', b.logo_path, 'brand_color', b.brand_color,
          'cover_path', coalesce(p.hero_image_path,
            (select f.image_path from public.business_portfolio f where f.business_id = b.id and f.kind = 'photo' order by f.position, f.created_at limit 1)),
          'rating', b.rating_avg, 'reviews', b.rating_count, 'verified', b.verified,
          'from_kobo', (select min(least(coalesce(v.price_kobo, 2147483647),
                          coalesce((select min((o ->> 'price_kobo')::int) from jsonb_array_elements(v.options) o), 2147483647)))
                        from public.business_services v where v.business_id = b.id and v.price_kind <> 'ask'),
          'deposit', coalesce(st.enabled, false) and coalesce(st.deposit_mode, 'off') <> 'off' and private.payments_problem(b.id) is null,
          'bookable', coalesce(st.enabled, false),
          'joined', b.created_at, 'is_new', b.created_at > now() - interval '30 days',
          -- The map pin: never for a business that only goes to customers (no shop to point at).
          'lat', case when b.work_place is distinct from 'home' then b.lat end,
          'lng', case when b.work_place is distinct from 'home' then b.lng end,
          'location_approx', b.location_approx,
          'place_rank', pr.rank,
          'next_free', private.next_free(b.id, v_from, v_to, v_tod)) as card
      from public.businesses b
      left join public.business_page p on p.business_id = b.id
      left join public.booking_settings st on st.business_id = b.id
      cross join lateral (
        select case
          when v_tokens is null then 1
          when exists (select 1 from unnest(v_tokens) t where lower(b.area) = t) then 3
          when exists (select 1 from unnest(v_tokens) t where lower(b.city) = t or lower(b.state) = t) then 2
          -- Goes to customers: shows for where it travels (its state, its city, or its area).
          when coalesce(b.work_place, 'shop') <> 'shop' and exists (select 1 from unnest(v_tokens) t where
                 (b.travel_reach = 'state' and (lower(b.state) = t or t like '%' || lower(b.state) || '%'))
              or (b.travel_reach = 'city' and lower(b.city) = t)
              or (b.travel_reach = 'area' and lower(b.area) = t)) then 1.5
          else 0 end as rank
      ) pr
      where not b.suspended and not b.is_demo and b.listed
        and exists (select 1 from public.business_services v where v.business_id = b.id)
        and pr.rank > 0
        and (p_trade is null or p_trade = ''
             or b.trades @> array[p_trade]
             or (b.trades is null and p_trade = 'photo' and b.category = 'Photography'))
        and (v_query is null
             or lower(b.name) like '%' || v_query || '%'
             or exists (select 1 from public.business_services v where v.business_id = b.id
                        and (lower(v.name) like '%' || v_query || '%' or lower(coalesce(v.group_name, '')) like '%' || v_query || '%')))
    ) x
    where not must_be_free or x.card ->> 'next_free' is not null
    order by n
    limit least(greatest(coalesce(p_limit, 24), 1), 48)
    ) y), '[]'::jsonb);
end;
$$;

revoke all on function public.save_location(uuid, numeric, numeric), public.save_space_photos(uuid, jsonb) from public, anon;
grant execute on function public.save_location(uuid, numeric, numeric), public.save_space_photos(uuid, jsonb) to authenticated;
revoke all on function public.set_approx_location(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.set_approx_location(uuid, numeric, numeric) to service_role;
