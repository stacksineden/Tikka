-- Getting listed on Tikka (docs/HOMEPAGE_PLAN.md, decided 26 Nov 2026): being in Tikka's search
-- becomes a choice the business makes, with terms. "Listing is free for now. If Tikka adds a fee, it
-- applies only to new customers who find you through Tikka search, with 30 days' notice, and you can
-- leave any time." accept_listing() records the date and the terms' version, and needs at least one
-- photo of the space (unless the business only goes to customers) and a priced service.
--
-- Businesses listed before this keep showing for 14 days (until 10 Dec 2026 00:00 WAT) to accept;
-- after that they leave search until they do. New businesses start unlisted.
--
-- The extras customers compare on (comforts, who it's for, payment, languages) come from fixed lists.
-- A booking made from Tikka's listing page records found_via = 'search' and whether the number was
-- new to the business, so a future fee can only ever touch new customers Tikka found.

alter table public.businesses
  add column listing_terms_at timestamptz,
  add column listing_terms_version text,
  add column listing_grace_until timestamptz,
  add column amenities text[] check (amenities is null or (cardinality(amenities) <= 20 and amenities <@ array[
    'ac', 'power', 'parking', 'wifi', 'waiting', 'women', 'men', 'kids', 'wheelchair', 'cash', 'transfer', 'card']::text[])),
  add column languages text[] check (languages is null or (cardinality(languages) <= 5 and languages <@ array['en', 'pcm', 'yo', 'ig', 'ha']::text[]));
alter table public.businesses alter column listed set default false;

-- Everyone in search today gets the 14 days.
update public.businesses set listing_grace_until = '2026-12-10 00:00:00+01'
where listed and listing_terms_at is null;

-- Who shows in Tikka's search: listed, and either accepted the terms or still inside the 14 days.
create function private.in_search(b public.businesses) returns boolean
language sql stable set search_path = '' as $$
  select b.listed and (b.listing_terms_at is not null or coalesce(b.listing_grace_until > now(), false));
$$;

-- What still stops a business from being listed (owner's checklist): no photo of the space (unless
-- it only goes to customers), no priced service. Empty: ready.
create function private.listing_missing(p_business uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when b.work_place is distinct from 'home'
          and not exists (select 1 from public.business_space_photos s where s.business_id = b.id) then 'space_photo' end,
    case when not exists (select 1 from public.business_services v where v.business_id = b.id and v.price_kind <> 'ask') then 'priced_service' end
  ], null)
  from public.businesses b where b.id = p_business;
$$;

-- The owner's listing: whether they're in search, the terms, the checklist and the extras.
create function public.listing_state(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.businesses%rowtype;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees the listing' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.businesses where id = p_business;
  return jsonb_build_object(
    'listed', b.listed, 'in_search', private.in_search(b) and not b.suspended,
    'terms_at', b.listing_terms_at, 'terms_version', b.listing_terms_version, 'grace_until', b.listing_grace_until,
    'missing', to_jsonb(private.listing_missing(p_business)),
    'amenities', to_jsonb(coalesce(b.amenities, '{}')), 'languages', to_jsonb(coalesce(b.languages, '{}')));
end;
$$;

-- The owner agrees to the terms and goes into search. Refused while something on the checklist is
-- missing ('missing' says what).
create function public.accept_listing(p_business uuid, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  missing text[];
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner lists the business' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_version, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('kind', 'bad_version');
  end if;
  missing := private.listing_missing(p_business);
  if cardinality(missing) > 0 then
    return jsonb_build_object('kind', 'missing', 'missing', to_jsonb(missing));
  end if;
  update public.businesses
  set listed = true, listing_terms_at = now(), listing_terms_version = p_version
  where id = p_business;
  return jsonb_build_object('kind', 'listed');
end;
$$;

-- The extras: only from the fixed lists (unknown ones are dropped).
create function public.save_listing_extras(p_business uuid, p_amenities text[], p_languages text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner changes the listing' using errcode = 'insufficient_privilege';
  end if;
  update public.businesses set
    amenities = nullif(array(select distinct x from unnest(coalesce(p_amenities, '{}')) x
      where x = any (array['ac', 'power', 'parking', 'wifi', 'waiting', 'women', 'men', 'kids', 'wheelchair', 'cash', 'transfer', 'card'])), '{}'),
    languages = nullif(array(select distinct x from unnest(coalesce(p_languages, '{}')) x
      where x = any (array['en', 'pcm', 'yo', 'ig', 'ha'])), '{}')
  where id = p_business;
end;
$$;

-- Where a booking came from: Tikka's listing page. Server only (the booking endpoint calls it right
-- after the booking). New = the number had no booking, sale or Tikka at this business before.
alter table public.bookings
  add column found_via text check (found_via in ('search')),
  add column found_new boolean;

create function public.note_found_via(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
begin
  select * into bk from public.bookings where id = p_booking;
  if not found or bk.found_via is not null then
    return;
  end if;
  update public.bookings set found_via = 'search', found_new = not (
      exists (select 1 from public.bookings o where o.business_id = bk.business_id and o.phone = bk.phone and o.id <> bk.id and o.created_at <= bk.created_at)
      or exists (select 1 from public.sales s where s.business_id = bk.business_id and s.phone = bk.phone)
      or exists (select 1 from public.claims c join public.drops d on d.id = c.drop_id where d.business_id = bk.business_id and c.phone = bk.phone))
  where id = bk.id;
end;
$$;

revoke all on function public.listing_state(uuid), public.accept_listing(uuid, text), public.save_listing_extras(uuid, text[], text[]) from public, anon;
grant execute on function public.listing_state(uuid), public.accept_listing(uuid, text), public.save_listing_extras(uuid, text[], text[]) to authenticated;
revoke all on function public.note_found_via(uuid) from public, anon, authenticated;
grant execute on function public.note_found_via(uuid) to service_role;
revoke all on function private.in_search(public.businesses), private.listing_missing(uuid) from public, anon, authenticated;

-- Search shows only businesses in search (private.in_search()), and their extras.
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
  v_words jsonb := (select coalesce(jsonb_agg(jsonb_build_object('n', w.n, 'p', w.patterns, 't', w.trades)), '[]') from private.search_words(p_query) w);
  v_count int := jsonb_array_length(v_words);
begin
  if v_to < v_from or v_to > today + 92 then
    v_to := least(greatest(v_to, v_from), today + 92);
  end if;
  return coalesce((
    select jsonb_agg(y.card order by y.n)
    from (
    select x.card, row_number() over (order by
        (x.card ->> 'score')::numeric desc,
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
          -- Photos of the space lead (Your Tikka listing), like the listing page; then the page's picture.
          'cover_path', coalesce(
            (select sp.thumb_path from public.business_space_photos sp where sp.business_id = b.id order by sp.position limit 1),
            (select sp.image_path from public.business_space_photos sp where sp.business_id = b.id order by sp.position limit 1),
            p.hero_image_path,
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
          'amenities', to_jsonb(coalesce(b.amenities, '{}')),
          'place_rank', pr.rank,
          'score', m.score,
          'match', case when v_query is null or v_count = 0 then null when m.full then 'all' else 'related' end,
          'next_free', private.next_free(b.id, v_from, v_to, v_tod)) as card
      from public.businesses b
      left join public.business_page p on p.business_id = b.id
      left join public.booking_settings st on st.business_id = b.id
      -- Everything a search can match: the name, category and every service's words.
      cross join lateral (
        select lower(b.name || ' ' || coalesce(b.category, '') || ' ' || coalesce(array_to_string(b.trades, ' '), '') || ' ' || coalesce(string_agg(
          concat_ws(' ', v.name, v.group_name, v.description,
            (select string_agg(o ->> 'name', ' ') from jsonb_array_elements(coalesce(v.options, '[]')) o),
            (select string_agg(e ->> 'name', ' ') from jsonb_array_elements(coalesce(v.extras, '[]')) e)), ' '), '')) as text
        from public.business_services v where v.business_id = b.id
      ) hay
      -- Each word scores 2 when the business's words match it, 1 when the business does that kind of
      -- work; 'all' when every word matched its words (or the whole search is in its name).
      cross join lateral (
        select coalesce(sum(s.pts), 0) :: numeric / greatest(v_count, 1) + case when v_query is not null and lower(b.name) like '%' || v_query || '%' then 2 else 0 end as score,
               (v_query is not null and lower(b.name) like '%' || v_query || '%') or (v_count > 0 and count(*) filter (where s.pts = 2) = v_count) as full
        from (
          select case
            when exists (select 1 from jsonb_array_elements_text(w -> 'p') p where hay.text ~ p) then 2
            when (w -> 't') <> '[]' and exists (select 1 from jsonb_array_elements_text(w -> 't') t
                   where t = any (private.search_business_trades(b.trades, hay.text))) then 1
            else 0 end as pts
          from jsonb_array_elements(v_words) w
        ) s
      ) m
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
      where not b.suspended and not b.is_demo and private.in_search(b)
        and exists (select 1 from public.business_services v where v.business_id = b.id)
        and pr.rank > 0
        and (p_trade is null or p_trade = ''
             or b.trades @> array[p_trade]
             or (b.trades is null and p_trade = 'photo' and b.category = 'Photography'))
        -- A search of only little words ("services") counts as no words.
        and (v_query is null or v_count = 0 or m.score > 0)
    ) x
    where not must_be_free or x.card ->> 'next_free' is not null
    order by n
    limit least(greatest(coalesce(p_limit, 24), 1), 48)
    ) y), '[]'::jsonb);
end;
$$;

revoke all on function public.search_businesses(text, text, text, date, date, text, text, int) from public;
grant execute on function public.search_businesses(text, text, text, date, date, text, text, int) to anon, authenticated, service_role;

-- The owner's bookings say which ones Tikka found (Calendar's "Found you on Tikka").
create or replace function public.get_bookings(p_business uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owner boolean := private.is_owner(p_business);
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team sees its bookings' using errcode = 'insufficient_privilege';
  end if;
  -- Held times waiting for a deposit aren't bookings yet.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'service', b.service_name, 'service_id', b.service_id, 'minutes', b.minutes,
        'starts_at', b.starts_at, 'ends_at', b.ends_at, 'first_name', b.first_name,
        'phone', case when owner then b.phone end, 'source', b.source, 'status', b.status, 'code', b.code,
        'claim_id', b.claim_id, 'lead_id', case when owner then b.lead_id end, 'view_token', case when owner then b.view_token end,
        'moved', b.moved_at is not null, 'created_at', b.created_at,
        'deposit_paid_kobo', b.deposit_paid_kobo, 'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'deposit_counts', b.deposit_counts,
        'detail', b.detail, 'home', b.home_area is not null, 'home_area', case when owner then b.home_area end,
        'event_day', b.event_day, 'gap_minutes', b.gap_minutes,
        -- Found through Tikka search, and whether new to the business (owners only).
        'found_via', b.found_via, 'found_new', case when owner then b.found_new end)
      order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.status <> 'held' and b.starts_at < p_to and b.ends_at > p_from), '[]'::jsonb);
end;
$$;
