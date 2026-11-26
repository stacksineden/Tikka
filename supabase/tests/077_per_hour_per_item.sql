-- Per hour and per item: the server multiplies the price for one by how many (kept within the
-- owner's least and most), the booking takes that many hours (or each item's time), the count is
-- kept for Today and receipts, an option sets the price per hour, and deposits follow the total.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c077-000000000001', 'studio77@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c077-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Light Room', 'lightroom77', 'LR', 'Photography', 'Oyo', 'Ibadan', 'Bodija', '#222222', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), jsonb_build_array(
  jsonb_build_object('name', 'Studio shoot', 'price_kobo', 1500000, 'price_kind', 'fixed', 'minutes', 60,
    'unit', 'hour', 'unit_min', 1, 'unit_max', 6,
    'options', jsonb_build_array(jsonb_build_object('label', 'Studio only', 'price_kobo', 1500000, 'minutes', 60),
                                 jsonb_build_object('label', 'With makeup artist', 'price_kobo', 2500000, 'minutes', 60))),
  jsonb_build_object('name', 'Edited photos', 'price_kobo', 500000, 'price_kind', 'fixed', 'minutes', 30,
    'unit', 'item', 'unit_label', 'photo', 'unit_min', 2, 'unit_max', 20, 'unit_minutes', 15),
  jsonb_build_object('name', 'Headshot', 'price_kobo', 1000000, 'price_kind', 'fixed', 'minutes', 30)));
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
reset role;
update public.businesses set hours = '{"weekdays":{"open":true,"from":"08:00","to":"20:00"},"saturday":{"open":true,"from":"08:00","to":"20:00"},"sunday":{"open":true,"from":"08:00","to":"20:00"}}'
where id = (select v from t where k = 'biz');
insert into t select lower(replace(name, ' ', '_')), id from public.business_services where business_id = (select v from t where k = 'biz');

-- The fields are kept by save_services().
do $$
declare s public.business_services := (select x from public.business_services x where id = (select v from t where k = 'studio_shoot'));
begin
  assert s.unit = 'hour' and s.unit_min = 1 and s.unit_max = 6 and s.unit_label is null, 'per hour kept: ' || row_to_json(s)::text;
  assert (select unit = 'item' and unit_label = 'photo' and unit_minutes = 15 from public.business_services where id = (select v from t where k = 'edited_photos')), 'per item kept';
  assert (select unit is null from public.business_services where id = (select v from t where k = 'headshot')), 'ordinary services unchanged';
end $$;

-- Prices before booking (public, amounts only).
set local role anon;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  p jsonb;
begin
  p := public.price_booking(biz, (select v from t where k = 'studio_shoot'), '{"qty":3}', 'test');
  assert (p ->> 'total_kobo')::int = 4500000 and (p ->> 'minutes')::int = 180 and p ->> 'detail' = 'Studio only, 3 hours', '3 hours: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'studio_shoot'), '{"qty":2,"option":1}', 'test');
  assert (p ->> 'total_kobo')::int = 5000000 and p ->> 'detail' = 'With makeup artist, 2 hours', 'the option sets the price per hour: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'studio_shoot'), '{"qty":40}', 'test');
  assert (p ->> 'total_kobo')::int = 9000000 and (p ->> 'qty')::int = 6, 'never more than the most: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'edited_photos'), '{}', 'test');
  assert (p ->> 'total_kobo')::int = 1000000 and (p ->> 'qty')::int = 2 and p ->> 'detail' = '2 photos', 'at least the least: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'edited_photos'), '{"qty":5}', 'test');
  assert (p ->> 'total_kobo')::int = 2500000 and (p ->> 'minutes')::int = 75, '5 photos, 15 minutes each: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'headshot'), '{"qty":9}', 'test');
  assert (p ->> 'total_kobo')::int = 1000000, 'a count means nothing to an ordinary service';
end $$;
reset role;

-- Booking it: priced on the server, the time held is the hours, the count kept.
set local role service_role;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d date := (now() at time zone 'Africa/Lagos')::date + 2;
  r jsonb := public.book_time_v2(biz, (select v from t where k = 'studio_shoot'), (d + time '10:00') at time zone 'Africa/Lagos', 'Tobi', '+2348077000001',
                                 '{"qty":3}', null, null, null, false, 'v1', 'test', null);
  b public.bookings;
begin
  assert r ->> 'kind' = 'booked', 'booked: ' || r::text;
  select * into b from public.bookings where id = (r ->> 'id')::uuid;
  assert b.price_kobo = 4500000 and b.minutes = 180 and b.detail = 'Studio only, 3 hours' and (b.choice ->> 'qty')::int = 3, 'kept: ' || row_to_json(b)::text;
  r := public.book_time_v2(biz, (select v from t where k = 'headshot'), (d + time '12:00') at time zone 'Africa/Lagos', 'Ada', '+2348077000002',
                           '{}', null, null, null, false, 'v2', 'test', null);
  assert r ->> 'kind' = 'taken', 'the 3 hours are held (10:00 to 13:00): ' || r::text;
end $$;
reset role;

-- Not with per-person or event days; per item needs a name; per hour at most 10.
do $$
begin
  begin
    update public.business_services set unit_max = 12 where id = (select v from t where k = 'studio_shoot');
    assert false, 'more than 10 hours';
  exception when check_violation then null;
  end;
  begin
    update public.business_services set unit_label = null where id = (select v from t where k = 'edited_photos');
    assert false, 'per item without a name';
  exception when check_violation then null;
  end;
  begin
    update public.business_services set event_day = true where id = (select v from t where k = 'studio_shoot');
    assert false, 'not with event days';
  exception when check_violation then null;
  end;
end $$;

rollback;
