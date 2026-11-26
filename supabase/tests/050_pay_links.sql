-- Pay links: only the owner, only with payments open and an account of the same Paystack mode,
-- within the maximum; a Tikka link takes the claimer's name; the public page shows no account;
-- completing is idempotent and checks the amount; Tikka's 1% (at least ₦1); staff see what was
-- paid for a Tikka at the counter but not the Money screen; cancelling.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c050-000000000001', 'owner50@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c050-000000000002', 'staff50@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Pay Links', 'paylinks50', 'PZ', 'Beauty', 'Lagos', 'Lagos', 'Ikeja', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c050-000000000002', 'staff');
update public.businesses set verified = true where id = (select v from t where k = 'biz');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'pay-links', 'Pay links drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 20, '20% off braids', 10);
select private.build_deck((select v from t where k = 'drop'));
select public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), 'Ada', false, 'v1', 'direct') ->> 'token', '+2348050000001');
insert into t select 'claim', id from public.claims where phone = '+2348050000001';

create function pg_temp.make(p_amount int, p_claim uuid default null, p_mode text default 'test') returns jsonb language sql as $$
  select public.create_pay_link((select v from t where k = 'biz'), p_amount, 'Braids balance', 'Bisi', p_claim, p_mode);
$$;

-- Payments off, then no account, then the wrong mode.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000001","role":"authenticated"}', true);
do $$
begin
  assert pg_temp.make(500000) ->> 'kind' = 'not_enabled', 'payments off';
end $$;
reset role;
-- Payments need the owner's ID approved (057).
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c050-000000000001/kyc/id.webp', 'no', 'approved', now());
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 2000000);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert pg_temp.make(500000) ->> 'kind' = 'no_account', 'no account yet';
end $$;
reset role;
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c050-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_paylinks50', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000001","role":"authenticated"}', true);
do $$
declare
  r jsonb;
begin
  assert pg_temp.make(500000, null, 'live') ->> 'kind' = 'account_again', 'a test account can''t take live payments';
  assert pg_temp.make(5000) ->> 'kind' = 'too_small', 'at least ₦100';
  assert pg_temp.make(2500000) ->> 'kind' = 'too_big', 'within the ₦20,000 maximum';
  r := pg_temp.make(500000);
  assert r ->> 'kind' = 'created' and r ->> 'token' ~ '^[a-z0-9]{10}$', 'created: ' || r::text;
  insert into res values ('plain', r);
  r := pg_temp.make(1600000, (select v from t where k = 'claim'));
  assert r ->> 'kind' = 'created', 'a Tikka link';
  insert into res values ('tikka', r);
end $$;

-- Staff can't make links or see money.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform pg_temp.make(500000);
    assert false, 'staff must not make pay links';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_pay_links((select v from t where k = 'biz'), 10);
    assert false, 'staff never see money';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The public page and the checkout.
do $$
declare
  pub jsonb := public.pay_link_page((select v ->> 'token' from res where k = 'plain'));
  tik jsonb := public.pay_link_page((select v ->> 'token' from res where k = 'tikka'));
  co jsonb := public.pay_link_checkout((select v ->> 'token' from res where k = 'plain'));
begin
  assert (pub ->> 'amount_kobo')::int = 500000 and pub ->> 'note' = 'Braids balance' and pub ->> 'status' = 'open', 'page: ' || pub::text;
  assert pub::text !~ 'ACCT_' and pub::text !~ '9526', 'the page never shows the account';
  assert tik ->> 'customer_name' = 'Ada', 'a Tikka link names the claimer, not what was typed';
  assert co ->> 'subaccount' = 'ACCT_paylinks50' and (co ->> 'tikka_kobo')::int = 5000 and co ->> 'mode' = 'test', 'checkout: 1% of ₦5,000 is ₦50';
  assert (public.pay_link_checkout('nosuchlink') is null), 'unknown link';
end $$;

-- Completing: wrong amount refused, then paid once, repeats harmless.
do $$
declare
  tok text := (select v ->> 'token' from res where k = 'plain');
  tt text := (select v ->> 'token' from res where k = 'tikka');
begin
  assert public.complete_pay_link('pl_' || tok || '_a1', 400000, 175, 'x@y.z') ->> 'kind' = 'wrong_amount', 'amount must match';
  assert public.complete_pay_link('pl_' || tok || '_a2', 500000, 175, 'x@y.z') ->> 'kind' = 'paid', 'paid';
  assert public.complete_pay_link('pl_' || tok || '_a2', 500000, 175, 'x@y.z') ->> 'kind' = 'already_paid', 'idempotent';
  assert public.complete_pay_link('pl_zzzzzzzzzz_a1', 500000, 175, 'x@y.z') ->> 'kind' = 'unknown', 'unknown';
  assert public.complete_pay_link('pl_' || tt || '_b1', 1600000, 340, null) ->> 'kind' = 'paid', 'tikka link paid';
  assert (select tikka_kobo from public.pay_links where token = tok) = 5000, 'Tikka kept ₦50';
  assert public.pay_link_page(tok) ->> 'status' = 'paid', 'the page says paid';
end $$;

-- At the counter, staff see what was paid for the Tikka; the owner sees the Money screen and cancels.
insert into res select 'code', to_jsonb((select code from public.claims where id = (select v from t where k = 'claim')));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000002","role":"authenticated"}', true);
do $$
declare
  code text := (select v #>> '{}' from res where k = 'code');
begin
  assert (public.paid_for_code((select v from t where k = 'biz'), code) ->> 'paid_kobo')::int = 1600000, 'paid online ₦16,000';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c050-000000000001","role":"authenticated"}', true);
do $$
declare
  ls jsonb := public.get_pay_links((select v from t where k = 'biz'), 10);
  r jsonb := pg_temp.make(300000);
begin
  assert jsonb_array_length(ls) = 2, 'two links: ' || ls::text;
  assert ls::text ~ '2348050000001', 'the owner sees the Tikka claimer''s number';
  ls := public.get_pay_links((select v from t where k = 'biz'), 10);
  assert public.cancel_pay_link((select v from t where k = 'biz'), (select (x ->> 'id')::uuid from jsonb_array_elements(ls) x where x ->> 'token' = r ->> 'token')) ->> 'kind' = 'cancelled', 'cancelled';
  assert public.cancel_pay_link((select v from t where k = 'biz'), (select (x ->> 'id')::uuid from jsonb_array_elements(ls) x where x ->> 'token' = (select v ->> 'token' from res where k = 'plain'))) ->> 'kind' = 'not_open', 'a paid link can''t be cancelled';
end $$;
reset role;

rollback;
