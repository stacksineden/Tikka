-- A deposit taken by hand keeps the day it was paid.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c093-000000000001', 'owner93@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c093-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Paid On', 'paidon93', 'PO', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Facial","price_kobo":2000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 0, 30, '{}');
insert into t select 'svc', id from public.business_services where business_id = (select v from t where k = 'biz');
insert into t select 'bk', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '1 day', 'Ada', '+2348093000001', true) ->> 'id')::uuid;

do $$
declare
  biz uuid := (select v from t where k = 'biz');
  bk uuid := (select v from t where k = 'bk');
begin
  assert public.record_booking_deposit(biz, bk, 500000, 'cash', now() - interval '3 days') = 'saved', 'saved for 3 days ago';
  assert (select deposit_paid_at::date from public.bookings where id = bk) = (now() - interval '3 days')::date, 'on that day';
  assert public.record_booking_deposit(biz, bk, 500000, 'cash', now() + interval '2 days') = 'bad_date', 'not in the future';
  assert public.record_booking_deposit(biz, bk, 500000, 'cash', now() - interval '200 days') = 'bad_date', 'not too long ago';
  assert public.record_booking_deposit(biz, bk, 600000, 'transfer') = 'saved', 'the old call still works';
  assert (select deposit_paid_at > now() - interval '1 minute' from public.bookings where id = bk), 'and means now';
end $$;

rollback;
