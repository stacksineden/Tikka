-- The homepage search (docs/HOMEPAGE_PLAN.md): words, trade, place and days; businesses that go to
-- customers show where they travel; demo, suspended and empty businesses never show; the next free
-- time respects blocked days and the time of day; anyone can search; no one's number comes back.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c069-000000000001', 'hair69@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c069-000000000002', 'photo69@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c069-000000000003', 'demo69@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c069-000000000004', 'empty69@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c069-000000000001","role":"authenticated"}', true);
insert into t select 'hair', public.create_business('Zuri Braids Lab', 'zuribraids69', 'ZQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'hair'), '[{"name":"Knotless braids","price_kobo":1500000,"price_kind":"fixed","minutes":120},{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'hair'), true, 1, 0, 30, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c069-000000000002","role":"authenticated"}', true);
insert into t select 'photo', public.create_business('Lenswork Studio', 'lenswork69', 'LZ', 'Photography', 'Lagos', 'Lagos', 'Lekki', '#222222', '#FFFFFF');
select public.save_services((select v from t where k = 'photo'), '[{"name":"Portrait shoot","price_kobo":4000000,"price_kind":"from","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'photo'), true, 1, 0, 30, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c069-000000000003","role":"authenticated"}', true);
insert into t select 'demo', public.create_business('Zuri Demo Braids', 'zuridemo69', 'DZ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'demo'), '[{"name":"Knotless braids","price_kobo":1500000,"price_kind":"fixed","minutes":60}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c069-000000000004","role":"authenticated"}', true);
insert into t select 'empty', public.create_business('Zuri Empty Braids', 'zuriempty69', 'EZ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;

-- All open 09:00 to 18:00 every day; the hair business is in the shop, the photographer goes to
-- customers anywhere in Lagos state; one demo and one with no services.
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id in (select v from t);
update public.businesses set trades = array['hair'], work_place = 'shop' where id = (select v from t where k = 'hair');
update public.businesses set trades = array['photo'], work_place = 'both', travel_fee_kobo = 500000, travel_reach = 'state' where id = (select v from t where k = 'photo');
update public.businesses set is_demo = true where id = (select v from t where k = 'demo');
-- All of them accepted the listing terms (20261218100000_listing_journey.sql).
update public.businesses set listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26' where id in (select v from t);
-- Tomorrow is fully blocked at the hair business.
insert into public.booking_blocks (business_id, starts_at, ends_at)
values ((select v from t where k = 'hair'),
        ((now() at time zone 'Africa/Lagos')::date + 1)::timestamp at time zone 'Africa/Lagos',
        ((now() at time zone 'Africa/Lagos')::date + 2)::timestamp at time zone 'Africa/Lagos');

create function pg_temp.slugs(r jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'slug'), '{}') from jsonb_array_elements(r) x where x ->> 'slug' like '%69';
$$;
grant execute on function pg_temp.slugs(jsonb) to anon, authenticated, service_role;

-- Anyone can search.
set local role anon;
insert into res select 'braids', public.search_businesses(p_query => 'braids');
insert into res select 'photo', public.search_businesses(p_trade => 'photo');
insert into res select 'ibadan', public.search_businesses(p_place => 'Bodija, Ibadan');
insert into res select 'lagos', public.search_businesses(p_place => 'Ikeja, Lagos');
insert into res select 'oyo', public.search_businesses(p_trade => 'photo', p_place => 'Ibadan');
insert into res select 'tomorrow', public.search_businesses(p_query => 'braids',
  p_from => (now() at time zone 'Africa/Lagos')::date + 1, p_to => (now() at time zone 'Africa/Lagos')::date + 1);
insert into res select 'day3', public.search_businesses(p_query => 'braids',
  p_from => (now() at time zone 'Africa/Lagos')::date + 3, p_to => (now() at time zone 'Africa/Lagos')::date + 3, p_tod => 'evening');
reset role;

do $$
declare
  braids jsonb := (select v from res where k = 'braids');
  hair jsonb := (select x from jsonb_array_elements((select v from res where k = 'braids')) x where x ->> 'slug' = 'zuribraids69');
  day3 jsonb := (select x from jsonb_array_elements((select v from res where k = 'day3')) x where x ->> 'slug' = 'zuribraids69');
begin
  assert pg_temp.slugs(braids) = array['zuribraids69'], 'words find the service; demo and empty never show: ' || pg_temp.slugs(braids)::text;
  assert pg_temp.slugs((select v from res where k = 'photo')) = array['lenswork69'], 'trade';
  assert 'zuribraids69' = any(pg_temp.slugs((select v from res where k = 'ibadan'))) and not ('lenswork69' = any(pg_temp.slugs((select v from res where k = 'ibadan')))), 'place: Ibadan';
  assert 'lenswork69' = any(pg_temp.slugs((select v from res where k = 'lagos'))), 'goes to customers anywhere in Lagos: shows for Ikeja, Lagos';
  assert not ('lenswork69' = any(pg_temp.slugs((select v from res where k = 'oyo')))), 'not outside where it travels';
  assert hair ->> 'from_kobo' = '900000' and (hair ->> 'bookable')::boolean and not (hair ->> 'comes_to_you')::boolean, 'card: ' || hair::text;
  assert hair ->> 'next_free' is not null, 'a next free time';
  assert pg_temp.slugs((select v from res where k = 'tomorrow')) = '{}', 'tomorrow is blocked: not free then';
  assert day3 is not null and extract(hour from (day3 ->> 'next_free')::timestamptz at time zone 'Africa/Lagos') >= 16, 'evening on day 3: ' || coalesce(day3 ->> 'next_free', 'none');
  assert braids::text !~ '\+234', 'no numbers';
end $$;

-- A fully booked business isn't free that day either (capacity 1, a booking from 09:00 to 18:00).
insert into public.bookings (business_id, service_name, minutes, starts_at, ends_at, first_name, phone, source, code, view_token)
values ((select v from t where k = 'photo'), 'Portrait shoot', 540,
        (((now() at time zone 'Africa/Lagos')::date + 4) + time '09:00') at time zone 'Africa/Lagos',
        (((now() at time zone 'Africa/Lagos')::date + 4) + time '18:00') at time zone 'Africa/Lagos',
        'Ada', '+2348030690001', 'owner', 'BK-AAAA69', 'abcdef0123456789abcd0069');
set local role anon;
do $$
begin
  assert pg_temp.slugs(public.search_businesses(p_trade => 'photo',
    p_from => (now() at time zone 'Africa/Lagos')::date + 4, p_to => (now() at time zone 'Africa/Lagos')::date + 4)) = '{}', 'fully booked that day';
end $$;
reset role;

rollback;
