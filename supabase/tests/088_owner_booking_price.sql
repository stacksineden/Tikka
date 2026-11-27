-- A booking the owner adds keeps the service's price, so Today knows what's left after the deposit.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c088-000000000001', 'owner88@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c088-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Price Kept', 'pricekept88', 'PK', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Makeup and gele","price_kobo":3020000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
insert into t select 'svc', id from public.business_services where business_id = (select v from t where k = 'biz');
insert into t select 'bk', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '2 days', 'Kemi', '+2348088000001', true) ->> 'id')::uuid;
do $$
begin
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk')) = 3020000, 'owner booking keeps the price';
  assert (select price_kind from public.bookings where id = (select v from t where k = 'bk')) = 'fixed', 'and its kind';
end $$;
reset role;

-- An old booking without a price, saved as a ₦0 sale with nothing paid: the repair takes the sale back
-- and fills in the price. A ₦0 sale on a booking that had its price stays.
update public.bookings set price_kobo = null, price_kind = null where id = (select v from t where k = 'bk');
insert into public.sales (business_id, name, item, total_kobo, booking_id)
values ((select v from t where k = 'biz'), 'Kemi', 'Makeup and gele', 0, (select v from t where k = 'bk'));
delete from public.sales s using public.bookings b
where s.booking_id = b.id and b.price_kobo is null and s.total_kobo = 0
  and not exists (select 1 from public.sale_payments p where p.sale_id = s.id)
  and not exists (select 1 from public.pay_links l where l.sale_id = s.id);
update public.bookings b set price_kobo = s.price_kobo, price_kind = s.price_kind
from public.business_services s where b.service_id = s.id and b.price_kobo is null and s.price_kobo is not null;
do $$
begin
  assert not exists (select 1 from public.sales where booking_id = (select v from t where k = 'bk')), 'the ₦0 sale is gone';
  assert (select price_kobo from public.bookings where id = (select v from t where k = 'bk')) = 3020000, 'price filled in';
end $$;

rollback;
