-- A pay link for a booking's deposit: made from the booking (its name and number), only while it has
-- no deposit and isn't marked paid; paying it records the deposit on that booking by pay link, and
-- Money counts it once, as the deposit. Staff can't make one.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c089-000000000001', 'owner89@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c089-000000000002', 'staff89@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c089-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Deposit Links', 'depositlinks89', 'DL', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Makeup and gele","price_kobo":3020000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 0, 30, '{}');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c089-000000000002', 'staff');
update public.businesses set verified = true where id = (select v from t where k = 'biz');
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Kay Obi', '00000000-0000-4000-c089-000000000001/kyc/id.webp', 'no', 'approved', now());
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 5000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c089-000000000001', '033', 'UBA', '9526', 'KAY OBI', 'ACCT_dl89', 'live');
insert into t select 'svc', id from public.business_services where business_id = (select v from t where k = 'biz');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c089-000000000001","role":"authenticated"}', true);
insert into t select 'bk', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '2 days', 'Bisi', '+2348089000001', true) ->> 'id')::uuid;
insert into t select 'bk2', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '3 days', 'Tola', '+2348089000002', true) ->> 'id')::uuid;
insert into res select 'link', public.create_deposit_link((select v from t where k = 'biz'), (select v from t where k = 'bk'), 1000000, 'live');
-- Tola already sent a transfer: no link for her.
select public.record_booking_deposit((select v from t where k = 'biz'), (select v from t where k = 'bk2'), 500000, 'transfer');
do $$
declare
  l public.pay_links;
begin
  assert (select v from res where k = 'link') ->> 'kind' = 'created', 'created: ' || (select v from res where k = 'link')::text;
  select * into l from public.pay_links where token = (select v from res where k = 'link') ->> 'token';
  assert l.booking_id = (select v from t where k = 'bk') and l.customer_name = 'Bisi' and l.phone = '+2348089000001', 'the booking''s name and number';
  assert l.note like 'Deposit for Makeup and gele, %', 'says what it is: ' || l.note;
  assert public.create_deposit_link((select v from t where k = 'biz'), (select v from t where k = 'bk2'), 1000000, 'live') ->> 'kind' = 'has_deposit', 'not when there is a deposit';
  assert public.create_deposit_link((select v from t where k = 'biz'), gen_random_uuid(), 1000000, 'live') ->> 'kind' = 'not_found', 'a booking of this business';
end $$;
reset role;

-- Staff can't make one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c089-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.create_deposit_link((select v from t where k = 'biz'), (select v from t where k = 'bk'), 1000000, 'live');
    assert false, 'staff must not make deposit links';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Bisi pays: it's her booking's deposit, by pay link.
set local role service_role;
insert into res select 'paid', public.complete_pay_link('pl_' || ((select v from res where k = 'link') ->> 'token') || '_1', 1000000, 15000, null);
reset role;
do $$
declare
  b public.bookings := (select x from public.bookings x where id = (select v from t where k = 'bk'));
begin
  assert (select v from res where k = 'paid') ->> 'kind' = 'paid', 'paid';
  assert b.deposit_paid_kobo = 1000000 and b.deposit_method = 'pay_link' and b.deposit_counts
     and b.deposit_pay_link = (select id from public.pay_links where token = (select v from res where k = 'link') ->> 'token'), 'the deposit is on the booking';
end $$;

-- Money counts it once, as the deposit (not as a sale too).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c089-000000000001","role":"authenticated"}', true);
insert into res select 'ledger', public.get_ledger((select v from t where k = 'biz'));
reset role;
do $$
begin
  assert jsonb_array_length((select v from res where k = 'ledger') -> 'sales') = 0, 'no sale for the deposit link: ' || ((select v from res where k = 'ledger') -> 'sales')::text;
  assert jsonb_array_length((select v from res where k = 'ledger') -> 'pay_links') = 0, 'not listed apart either';
end $$;

rollback;
