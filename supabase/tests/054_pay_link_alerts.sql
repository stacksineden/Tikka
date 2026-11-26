-- Paid pay link alerts: only once paid, only the owner's phones (never staff), the amount, note and
-- first name, never a phone number or email; anonymous and signed-in callers can't read it.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c054-000000000001', 'owner54@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c054-000000000002', 'staff54@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c054-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Pay Alerts', 'payalerts54', 'PA', 'Beauty', 'Lagos', 'Lagos', 'Ikeja', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c054-000000000002', 'staff');
update public.businesses set verified = true where id = (select v from t where k = 'biz');
-- Payments need the owner's ID approved (057).
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c054-000000000001/kyc/id.webp', 'no', 'approved', now());
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 2000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c054-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_payalerts54', 'test');

insert into public.push_subscriptions (business_id, user_id, endpoint, p256dh, auth) values
  ((select v from t where k = 'biz'), '00000000-0000-4000-c054-000000000001', 'https://push.test/owner54', repeat('o', 40), repeat('a', 16)),
  ((select v from t where k = 'biz'), '00000000-0000-4000-c054-000000000002', 'https://push.test/staff54', repeat('s', 40), repeat('b', 16));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c054-000000000001","role":"authenticated"}', true);
insert into res select 'link', public.create_pay_link((select v from t where k = 'biz'), 500000, 'Braids balance', 'Bisi Ade', null, 'test');
reset role;

do $$
declare
  tok text := (select v ->> 'token' from res where k = 'link');
  id uuid := (select p.id from public.pay_links p where p.token = (select v ->> 'token' from res where k = 'link'));
  r jsonb;
begin
  assert public.pay_link_alert(id) is null, 'no alert before it is paid';
  assert public.complete_pay_link('pl_' || tok || '_a1', 500000, 175, 'bisi@mail.test') ->> 'id' = id::text, 'complete returns the link';
  r := public.pay_link_alert(id);
  assert r ->> 'amount_kobo' = '500000' and r ->> 'note' = 'Braids balance' and r ->> 'first_name' = 'Bisi', 'what was paid: ' || r::text;
  assert r ->> 'business_name' = 'Pay Alerts', 'business name';
  assert jsonb_array_length(r -> 'subscriptions') = 1 and r -> 'subscriptions' -> 0 ->> 'endpoint' = 'https://push.test/owner54', 'owner only, never staff';
  assert r::text !~ 'bisi@mail' and r::text !~ '\+234', 'never an email or a number';
  assert public.complete_pay_link('pl_' || tok || '_a1', 500000, 175, null) ->> 'kind' = 'already_paid', 'a repeat is not a new payment';
end $$;

-- Not for browsers.
set local role authenticated;
do $$
begin
  perform public.pay_link_alert(gen_random_uuid());
  raise exception 'authenticated should not reach pay_link_alert';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role anon;
do $$
begin
  perform public.pay_link_alert(gen_random_uuid());
  raise exception 'anon should not reach pay_link_alert';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
