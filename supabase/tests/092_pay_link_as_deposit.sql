-- "Already paid with a pay link?": a plain pay link the customer paid becomes the booking's deposit,
-- counted once; only this customer's unused, plain payments are offered.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c092-000000000001', 'owner92@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c092-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Deposit Link', 'depositlink92', 'DL', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Bridal makeup","price_kobo":10000000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 0, 30, '{}');
insert into t select 'svc', id from public.business_services where business_id = (select v from t where k = 'biz');
insert into t select 'bk', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '1 day', 'Mihid', '+2348029921532', true) ->> 'id')::uuid;
insert into t select 'bk2', (public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'svc'),
  date_trunc('hour', now()) + interval '2 days', 'Tolu', '+2348029921599', true) ->> 'id')::uuid;
reset role;

-- Paid pay links, as complete_pay_link() leaves them: each made its own sale with one payment.
create function pg_temp.paid_link(p_token text, p_phone text, p_kobo int, p_mode text) returns uuid language plpgsql as $$
declare
  v_sale uuid;
  v_link uuid;
begin
  insert into public.sales (business_id, name, item, total_kobo, phone)
  values ((select v from t where k = 'biz'), 'Mihid', 'Deposit', p_kobo, p_phone) returning id into v_sale;
  insert into public.sale_payments (sale_id, business_id, kobo, method) values (v_sale, (select v from t where k = 'biz'), p_kobo, 'pay_link');
  insert into public.pay_links (business_id, token, amount_kobo, note, subaccount_code, paystack_mode, status, paid_kobo, paid_at, sale_id, phone)
  values ((select v from t where k = 'biz'), p_token, p_kobo, 'Deposit', 'ACCT_test', p_mode, 'paid', p_kobo, now() - interval '1 hour', v_sale, p_phone)
  returning id into v_link;
  return v_link;
end $$;
insert into t select 'link', pg_temp.paid_link('aaaaaaaaaa', '+2348029921532', 3200000, 'live');
insert into t select 'other', pg_temp.paid_link('bbbbbbbbbb', '+2348000000001', 1000000, 'live');
insert into t select 'test', pg_temp.paid_link('cccccccccc', '+2348029921532', 500000, 'test');
-- A link that settled a balance: its sale has another payment too.
insert into t select 'balance', pg_temp.paid_link('dddddddddd', '+2348029921532', 700000, 'live');
insert into public.sale_payments (sale_id, business_id, kobo, method)
select sale_id, business_id, 300000, 'cash' from public.pay_links where id = (select v from t where k = 'balance');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c092-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  opts jsonb := public.deposit_link_options((select v from t where k = 'biz'), (select v from t where k = 'bk'));
begin
  assert jsonb_array_length(opts) = 1, 'only her plain, live payment is offered';
  assert (opts -> 0 ->> 'id')::uuid = (select v from t where k = 'link'), 'the ₦32,000 one';
  assert public.use_link_as_deposit(biz, (select v from t where k = 'bk'), (select v from t where k = 'other')) = 'not_allowed', 'not someone else''s payment';
  assert public.use_link_as_deposit(biz, (select v from t where k = 'bk'), (select v from t where k = 'balance')) = 'not_allowed', 'not a balance payment';
  assert public.use_link_as_deposit(biz, (select v from t where k = 'bk'), (select v from t where k = 'link')) = 'saved', 'linked';
  assert (select deposit_paid_kobo from public.bookings where id = (select v from t where k = 'bk')) = 3200000, 'deposit ₦32,000';
  assert (select deposit_method from public.bookings where id = (select v from t where k = 'bk')) = 'pay_link', 'by pay link';
  assert (select booking_id from public.pay_links where id = (select v from t where k = 'link')) = (select v from t where k = 'bk'), 'the link knows its booking';
  assert public.use_link_as_deposit(biz, (select v from t where k = 'bk'), (select v from t where k = 'link')) = 'has_deposit', 'once';
  assert public.use_link_as_deposit(biz, (select v from t where k = 'bk2'), (select v from t where k = 'link')) = 'not_allowed', 'never twice';
  assert jsonb_array_length(public.deposit_link_options(biz, (select v from t where k = 'bk'))) = 0, 'nothing more to offer';
end $$;
reset role;

-- Counted once: the ledger leaves the link's own sale out; the booking carries the deposit.
do $$
begin
  assert not exists (
    select 1 from jsonb_array_elements(private.ledger_json((select v from t where k = 'biz')) -> 'sales') s
    where (s ->> 'id')::uuid = (select sale_id from public.pay_links where id = (select v from t where k = 'link'))), 'its sale is left out of the ledger';
end $$;

-- Not the owner: refused.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c092-000000000002', 'stranger92@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c092-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.deposit_link_options((select v from t where k = 'biz'), (select v from t where k = 'bk2'));
    raise exception 'a stranger saw payments';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
