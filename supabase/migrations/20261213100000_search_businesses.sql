-- The customer homepage's search (docs/HOMEPAGE_PLAN.md): find businesses by what (words or a
-- trade), where (an area, city or state) and when (a range of days, a time of day), with each one's
-- next free time. Public: it returns only what a business page already shows (name, place, photos,
-- prices, rating), never anyone's booking or number.
--
-- The next free time uses the same checks as booking (private.choice_problem: opening hours,
-- notice, how far ahead, capacity, busy windows with gaps, blocked times, event days), so a time on
-- a card is a time that can be booked. Demo and suspended businesses never show, nor businesses with
-- no services yet. A business that goes to customers also shows for the places it travels to.

-- The shortest a booking can be at this business (its quickest service or option), for free times.
create function private.shortest_minutes(p_business uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(min(least(coalesce(v.minutes, 60),
      coalesce((select min((o ->> 'minutes')::int) from jsonb_array_elements(v.options) o), coalesce(v.minutes, 60)))), 60)
  from public.business_services v where v.business_id = p_business and not v.event_day;
$$;

-- The first free half hour between two days (WAT), optionally in the morning (before 12),
-- afternoon (12 to 4) or evening (after 4). Null when nothing is free or bookings are off.
create function private.next_free(p_business uuid, p_from date, p_to date, p_tod text) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  hours jsonb := (select hours from public.businesses where id = p_business);
  mins int := private.shortest_minutes(p_business);
  today date := (now() at time zone 'Africa/Lagos')::date;
  d date;
  hrs int[];
  m int;
  t timestamptz;
begin
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    return null;
  end if;
  d := greatest(p_from, today);
  while d <= least(p_to, today + s.ahead_days, today + 62) loop
    hrs := private.open_minutes(hours, d);
    if hrs is not null then
      m := hrs[1] + (30 - hrs[1] % 30) % 30;
      while m + mins <= hrs[2] loop
        if p_tod is null or (p_tod = 'morning' and m < 720) or (p_tod = 'afternoon' and m >= 720 and m < 960) or (p_tod = 'evening' and m >= 960) then
          t := (d + make_interval(mins => m))::timestamp at time zone 'Africa/Lagos';
          if t >= now() + make_interval(mins => s.notice_minutes)
             and private.choice_problem(p_business, t, mins, 0, false, null) is null then
            return t;
          end if;
        end if;
        m := m + 30;
      end loop;
    end if;
    d := d + 1;
  end loop;
  return null;
end;
$$;

-- The search. p_query: words (a service or the business's name); p_trade: a trade id ("hair",
-- "photo"…); p_place: "Bodija, Ibadan", "Lagos"…; p_from/p_to: the days (default the next 14);
-- p_tod: morning, afternoon or evening; p_sort: soonest (default), rating or new. With a day range
-- or a time of day asked for, only businesses free then are returned.
create function public.search_businesses(
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
      where not b.suspended and not b.is_demo
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

revoke all on function private.shortest_minutes(uuid), private.next_free(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.search_businesses(text, text, text, date, date, text, text, int) from public;
grant execute on function public.search_businesses(text, text, text, date, date, text, text, int) to anon, authenticated, service_role;
