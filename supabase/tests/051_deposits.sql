-- Deposits: worked out on the server from the owner's settings (a % of a set price, a fixed ₦ for
-- services without one, a service's own rule), at least ₦1,000, never more than the price or the
-- maximum; only when payments are ready with an account of the same Paystack mode. A deposit holds
-- the time for 10 minutes; paying books it (idempotent, exact amount); a lapsed hold frees the time.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c051-000000000001', 'owner51@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c051-000000000002', 'staff51@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c051-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Deposits', 'deposits51', 'DQ', 'Beauty', 'Lagos', 'Lagos', 'Ikeja', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[
  {"name":"Braids","price_kobo":2500000,"price_kind":"fixed","minutes":120},
  {"name":"Bridal","price_kind":"ask","minutes":180},
  {"name":"Trim","price_kobo":80000,"price_kind":"fixed","minutes":30},
  {"name":"Lashes","price_kobo":3000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 120, 92, '{}');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c051-000000000002', 'staff');
update public.businesses set verified = true, hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select lower(name), id from public.business_services where business_id = (select v from t where k = 'biz');

create function pg_temp.at(p_hhmm text, p_days int) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;
create function pg_temp.dep(p_service text, p_mode text default 'test') returns int language sql as $$
  select private.deposit_for((select v from t where k = 'biz'), (select v from t where k = p_service), p_mode);
$$;

-- Staff can't set deposits; the owner picks 40% with ₦10,000 for services without a set price,
-- Lashes in full, Trim none.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c051-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.save_deposit_settings((select v from t where k = 'biz'), 'percent', 40, 1000000, true, '{}');
    assert false, 'staff must not set deposits';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c051-000000000001","role":"authenticated"}', true);
do $$
begin
  assert public.save_deposit_settings((select v from t where k = 'biz'), 'percent', 2, null, true, '{}') ->> 'kind' = 'bad_percent', 'at least 5%';
  assert public.save_deposit_settings((select v from t where k = 'biz'), 'percent', 40, 1000000, true,
    jsonb_build_object((select v from t where k = 'lashes')::text, jsonb_build_object('mode', 'full'))) ->> 'kind' = 'saved', 'saved';
end $$;
reset role;

-- Not ready for payments: no deposits, bookings stay free.
do $$
begin
  assert pg_temp.dep('braids') = 0, 'payments off: no deposit';
end $$;
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 2000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c051-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_deposits51', 'test');

do $$
declare
  d jsonb := public.booking_deposits((select v from t where k = 'biz'), 'test');
begin
  assert pg_temp.dep('braids') = 1000000, '40% of ₦25,000 = ₦10,000';
  assert pg_temp.dep('bridal') = 1000000, 'no set price: the fixed ₦10,000';
  assert pg_temp.dep('trim') = 0, 'under ₦1,000: no deposit';
  assert pg_temp.dep('lashes') = 2000000, 'in full, but capped at the ₦20,000 maximum';
  assert pg_temp.dep('braids', 'live') = 0, 'a test account takes no live deposits';
  assert (d -> 'services' ->> (select v from t where k = 'braids')::text)::int = 1000000 and (d ->> 'counts')::boolean, 'public deposits: ' || d::text;
  assert d::text !~ 'ACCT_', 'never the account';
end $$;

-- Booking Braids holds the time; nobody else gets it for 10 minutes.
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb;
begin
  assert public.book_time(biz, (select v from t where k = 'braids'), pg_temp.at('10:00', 3), 'Ada', '+2348051000001', false, 'v1', 'test', 'bad') ->> 'kind' = 'bad_email', 'an email for the receipt';
  r := public.book_time(biz, (select v from t where k = 'braids'), pg_temp.at('10:00', 3), 'Ada', '+2348051000001', false, 'v1', 'test', 'ada@example.com');
  assert r ->> 'kind' = 'pay' and (r ->> 'deposit_kobo')::int = 1000000, 'pay ₦10,000: ' || r::text;
  insert into res values ('ada', r);
  assert public.book_time(biz, (select v from t where k = 'braids'), pg_temp.at('10:00', 3), 'Bisi', '+2348051000002', false, 'v2', 'test', 'bisi@example.com') ->> 'kind' = 'taken', 'held for Ada';
  assert (public.booking_checkout(r ->> 'token') ->> 'hold_live')::boolean and public.booking_checkout(r ->> 'token') ->> 'subaccount' = 'ACCT_deposits51', 'checkout';
  assert (public.booking_pass(r ->> 'token') ->> 'deposit_kobo')::int = 1000000 and (public.booking_pass(r ->> 'token') ->> 'price_kobo')::int = 2500000, 'pass knows the deposit and the price';
  -- Trim books straight away (no deposit), even with no email.
  assert public.book_time(biz, (select v from t where k = 'trim'), pg_temp.at('15:00', 3), 'Chi', '+2348051000003', false, 'v3', 'test', null) ->> 'kind' = 'booked', 'no deposit: booked';
end $$;

-- The team doesn't see a held time as a booking yet.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c051-000000000001","role":"authenticated"}', true);
do $$
begin
  assert jsonb_array_length(public.get_bookings((select v from t where k = 'biz'), now(), now() + interval '10 days')) = 1, 'only Chi so far';
end $$;
reset role;

-- Paying: wrong amount refused, then booked once.
do $$
declare
  tok text := (select v ->> 'token' from res where k = 'ada');
begin
  assert public.complete_booking_deposit('bk_' || tok || '_a1', 500000, 175, null) ->> 'kind' = 'wrong_amount', 'exact amount';
  assert public.complete_booking_deposit('bk_' || tok || '_a2', 1000000, 250, 'ada@example.com') ->> 'kind' = 'paid', 'paid';
  assert public.complete_booking_deposit('bk_' || tok || '_a2', 1000000, 250, null) ->> 'kind' = 'already_paid', 'idempotent';
  assert (select status = 'booked' and deposit_paid_kobo = 1000000 and deposit_tikka_kobo = 10000 from public.bookings where view_token = tok), 'booked, Tikka kept ₦100';
end $$;

-- A hold that lapses frees the time; restarting it re-holds only if still free.
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb := public.book_time(biz, (select v from t where k = 'braids'), pg_temp.at('13:00', 4), 'Dayo', '+2348051000004', false, 'v4', 'test', 'dayo@example.com');
  r2 jsonb;
begin
  assert r ->> 'kind' = 'pay', 'held';
  update public.bookings set hold_expires_at = now() - interval '1 minute' where view_token = r ->> 'token';
  r2 := public.book_time(biz, (select v from t where k = 'braids'), pg_temp.at('13:00', 4), 'Eko', '+2348051000005', false, 'v5', 'test', 'eko@example.com');
  assert r2 ->> 'kind' = 'pay', 'the lapsed hold doesn''t block Eko';
  assert public.rehold_booking(r ->> 'token') ->> 'kind' = 'taken', 'Dayo''s time went to Eko';
  assert public.rehold_booking(r2 ->> 'token') ->> 'kind' = 'held', 'Eko''s hold is live';
end $$;

-- At the counter: the deposit paid and the price, for staff, never the number.
insert into res select 'adacode', jsonb_build_object('code', (select code from public.bookings where view_token = (select v ->> 'token' from res where k = 'ada')));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c051-000000000002","role":"authenticated"}', true);
do $$
declare
  r jsonb := public.check_booking_code((select v from t where k = 'biz'), (select v ->> 'code' from res where k = 'adacode'));
begin
  assert (r ->> 'deposit_paid_kobo')::int = 1000000 and (r ->> 'price_kobo')::int = 2500000 and (r ->> 'deposit_counts')::boolean, 'counter: ' || r::text;
  assert r::text !~ '2348051', 'never the number';
end $$;
reset role;

-- Bookings made with a Tikka or by the owner never take a deposit (they don't go through book_time).
do $$
begin
  assert (select count(*) from public.bookings where business_id = (select v from t where k = 'biz') and source <> 'page' and deposit_kobo is not null) = 0, 'no deposits outside the page';
end $$;

rollback;
