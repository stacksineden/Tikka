-- Exact prices: no "from" price any more, and an owner's booking prices its option and how many.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c090-000000000001', 'owner90@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c090-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Exact Studio', 'exactstudio90', 'ES', 'Photography', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[
  {"name":"Photo shoot","price_kobo":400000,"price_kind":"from","minutes":30,"unit":"item","unit_label":"photo","unit_min":1,"unit_max":20,"unit_minutes":15},
  {"name":"Braids","price_kobo":1500000,"price_kind":"fixed","minutes":120,"options":[{"label":"Short","price_kobo":1500000,"minutes":120},{"label":"Long","price_kobo":2500000,"minutes":240}]},
  {"name":"Facial","price_kobo":1000000,"price_kind":"fixed","minutes":60}
]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 0, 30, '{}');
insert into t select 'shoot', id from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Photo shoot';
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Braids';
insert into t select 'facial', id from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Facial';

-- An old client's "from" is saved as fixed.
do $$
begin
  assert (select price_kind from public.business_services where id = (select v from t where k = 'shoot')) = 'fixed', 'from saved as fixed';
end $$;

-- 4 photos at ₦4,000: ₦16,000, an hour (15 min each), "4 photos".
insert into t select 'bk1', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'shoot'),
  date_trunc('hour', now()) + interval '2 days', 'Kemi', '+2348090000001', true, null, '{"qty":4}') ->> 'id')::uuid;
-- Long braids: ₦25,000 for 4 hours.
insert into t select 'bk2', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'braids'),
  date_trunc('hour', now()) + interval '3 days', 'Ada', '+2348090000002', true, null, '{"option":1}') ->> 'id')::uuid;
-- No choice: the first option, as before; a plain service keeps its price.
insert into t select 'bk3', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'braids'),
  date_trunc('hour', now()) + interval '4 days', 'Bisi', '+2348090000003', true) ->> 'id')::uuid;
insert into t select 'bk4', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'facial'),
  date_trunc('hour', now()) + interval '5 days', 'Tolu', '+2348090000004', true, null, '{"qty":9}') ->> 'id')::uuid;
-- Asking for more than the owner allows is kept within it (20 at most).
insert into t select 'bk5', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'shoot'),
  date_trunc('hour', now()) + interval '6 days', 'Femi', '+2348090000005', true, null, '{"qty":99}') ->> 'id')::uuid;

do $$
begin
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk1')) = 1600000, '4 photos = ₦16,000';
  assert (select minutes from public.bookings where id = (select v from t where k = 'bk1')) = 60, '15 min each';
  assert (select detail from public.bookings where id = (select v from t where k = 'bk1')) = '4 photos', 'detail says how many';
  assert (select (choice ->> 'qty')::int from public.bookings where id = (select v from t where k = 'bk1')) = 4, 'choice kept';
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk2')) = 2500000, 'long braids';
  assert (select minutes from public.bookings where id = (select v from t where k = 'bk2')) = 240, 'long takes longer';
  assert (select detail from public.bookings where id = (select v from t where k = 'bk2')) = 'Long', 'option named';
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk3')) = 1500000, 'first option by default';
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk4')) = 1000000, 'plain service ignores qty';
  assert (select detail is null from public.bookings where id = (select v from t where k = 'bk4')), 'no detail for a plain one';
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk5')) = 8000000, 'kept to 20 photos';
  assert not exists (select 1 from public.bookings where price_kind = 'from'), 'no from bookings';
end $$;
reset role;

-- The table refuses "from" now.
do $$
begin
  begin
    update public.business_services set price_kind = 'from' where id = (select v from t where k = 'facial');
    raise exception 'from allowed';
  exception when check_violation then null;
  end;
end $$;

rollback;
