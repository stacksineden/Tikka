-- Loose ends: the privacy lookup shows bookings and payments and forgetting clears the pay link's
-- email and name; a drop's online money (live only); the counter's extras for a Tikka code; a
-- never-paid held time isn't a booked lead.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c053-000000000001', 'owner53@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c053-000000000002', 'staff53@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c053-000000000003', 'admin53@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c053-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c053-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Loose Ends', 'looseends53', 'LZ', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":2500000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 120, 92, '{}');
reset role;
insert into public.business_members (business_id, user_id, role) values ((select v from t where k = 'biz'), '00000000-0000-4000-c053-000000000002', 'staff');
update public.businesses set verified = true, hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz');
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 5000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c053-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_looseends53', 'live');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'loose-ends', 'Loose ends drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 20, '20% off', 10);
select private.build_deck((select v from t where k = 'drop'));
select public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), 'Ada', false, 'v1', 'direct') ->> 'token', '+2348053000001');
insert into t select 'claim', id from public.claims where phone = '+2348053000001';
insert into res select 'code', to_jsonb((select code from public.claims where phone = '+2348053000001'));

create function pg_temp.at(p_hhmm text, p_days int) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;

-- A paid live pay link and a test one for her Tikka, and a booking made with it.
insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, claim_id, lead_id, subaccount_code, paystack_mode, status, paid_kobo, payer_email, paid_at)
values ((select v from t where k = 'biz'), 'looseend53', 1600000, 'Braids', 'Ada', (select v from t where k = 'claim'),
        (select lead_id from public.claims where id = (select v from t where k = 'claim')), 'ACCT_looseends53', 'live', 'paid', 1600000, 'ada@example.com', now()),
       ((select v from t where k = 'biz'), 'looseend5t', 500000, 'Test', 'Ada', (select v from t where k = 'claim'),
        (select lead_id from public.claims where id = (select v from t where k = 'claim')), 'ACCT_looseends53', 'test', 'paid', 500000, 'ada@example.com', now());
select public.book_for_claim((select view_token from public.claims where id = (select v from t where k = 'claim')), (select v from t where k = 'braids'), pg_temp.at('10:00', 2));

-- A held time someone never paid for: not a booked lead.
insert into public.leads (business_id, phone, first_name, first_source, phone_confirmed) values ((select v from t where k = 'biz'), '+2348053000002', 'Bisi', 'booking', false);
insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id, source, status, code, view_token, hold_expires_at)
values ((select v from t where k = 'biz'), (select v from t where k = 'braids'), 'Braids', 60, pg_temp.at('15:00', 3), pg_temp.at('16:00', 3), 'Bisi', '+2348053000002',
        (select id from public.leads where phone = '+2348053000002'), 'page', 'held', 'BK-CCCCCC', 'aaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c053-000000000001","role":"authenticated"}', true);
do $$
declare
  ls jsonb := public.get_booking_leads((select v from t where k = 'biz'));
begin
  assert (public.drop_paid_online((select v from t where k = 'drop')))::bigint = 1600000, 'only the live ₦16,000';
  assert ls::text ~ '2348053000001' and ls::text !~ '2348053000002', 'Bisi only held a time: ' || ls::text;
end $$;

-- The counter: staff see what was paid and the booking, never the number.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c053-000000000002","role":"authenticated"}', true);
do $$
declare
  x jsonb := public.counter_extras((select v from t where k = 'biz'), (select v #>> '{}' from res where k = 'code'));
begin
  assert (x ->> 'paid_kobo')::int = 2100000 and x -> 'booking' ->> 'service' = 'Braids', 'counter: ' || x::text;
  assert x::text !~ '2348053', 'never the number';
  begin
    perform public.drop_paid_online((select v from t where k = 'drop'));
    assert false, 'staff never see results';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Privacy: the lookup shows her booking and payments; forgetting clears the pay links' email and name.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c053-000000000003","role":"authenticated"}', true);
do $$
declare
  r jsonb := public.admin_person_lookup('+2348053000001');
begin
  assert jsonb_array_length(r -> 'bookings') = 1 and jsonb_array_length(r -> 'payments') = 2, 'lookup: ' || r::text;
  perform public.admin_forget_person('+2348053000001');
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.pay_links where token in ('looseend53', 'looseend5t') and (payer_email is not null or customer_name is not null or lead_id is not null)) = 0, 'pay links scrubbed';
  assert (select count(*) from public.bookings where phone = '+2348053000001') = 0, 'her booking is gone';
  assert (select paid_kobo from public.pay_links where token = 'looseend53') = 1600000, 'the business keeps the payment record';
end $$;

rollback;
