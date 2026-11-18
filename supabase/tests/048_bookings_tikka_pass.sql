-- A booking made with a Tikka: the pass names the Tikka and links to its card (never the number);
-- using the Tikka at the counter marks a booking from today or earlier Arrived, not a later one.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c048-000000000001', 'owner48@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c048-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Tikka Pass', 'tikkapass48', 'TQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":3000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 3, 120, 92, '{}');
reset role;
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'tikka-pass', 'Tikka pass drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 20, '20% off braids', 10);
select private.build_deck((select v from t where k = 'drop'));

create function pg_temp.claim(p_visitor text, p_phone text) returns text language plpgsql as $$
declare
  tok text := public.create_claim_intent((select v from t where k = 'drop'), 'Ada', false, p_visitor, 'direct') ->> 'token';
begin
  if public.claim_on_page(tok, p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed';
  end if;
  return (select view_token from public.claims where phone = p_phone and drop_id = (select v from t where k = 'drop') and kind = 'drop');
end $$;
create function pg_temp.at(p_hhmm text, p_days int) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;

insert into res select 'soon', jsonb_build_object('card', pg_temp.claim('v1', '+2348048000001'));
insert into res select 'later', jsonb_build_object('card', pg_temp.claim('v2', '+2348048000002'));

do $$
declare
  soon jsonb := (select v from res where k = 'soon');
  later jsonb := (select v from res where k = 'later');
  a jsonb := public.book_for_claim(soon ->> 'card', (select v from t where k = 'braids'), pg_temp.at('10:00', 2));
  b jsonb := public.book_for_claim(later ->> 'card', (select v from t where k = 'braids'), pg_temp.at('11:00', 5));
  p jsonb;
begin
  assert a ->> 'kind' = 'booked' and b ->> 'kind' = 'booked', 'both booked';
  p := public.booking_pass(a ->> 'token');
  assert p ->> 'tikka_token' = soon ->> 'card' and p ->> 'tikka_reward' = '20% off braids' and (p ->> 'tikka_used')::boolean = false, 'the pass names the Tikka: ' || p::text;
  assert p::text !~ '2348048000', 'never the number';
  update res set v = v || jsonb_build_object('booking', a ->> 'id') where k = 'soon';
  update res set v = v || jsonb_build_object('booking', b ->> 'id') where k = 'later';
end $$;

-- A booking without a Tikka: no Tikka on its pass.
do $$
declare
  r jsonb := public.book_time((select v from t where k = 'biz'), (select v from t where k = 'braids'), pg_temp.at('12:00', 2), 'Bisi', '+2348048000003', false, 'v3');
begin
  assert public.booking_pass(r ->> 'token') -> 'tikka_token' = 'null'::jsonb, 'no Tikka';
end $$;

-- Today: the first booking's time has come. Using either Tikka at the counter.
update public.bookings set starts_at = now() - interval '10 minutes', ends_at = now() + interval '50 minutes'
where id = ((select v from res where k = 'soon') ->> 'booking')::uuid;
update public.claims set redeemed_at = now() where view_token in ((select v ->> 'card' from res where k = 'soon'), (select v ->> 'card' from res where k = 'later'));

do $$
begin
  assert (select status from public.bookings where id = ((select v from res where k = 'soon') ->> 'booking')::uuid) = 'arrived', 'used today: arrived';
  assert (select status from public.bookings where id = ((select v from res where k = 'later') ->> 'booking')::uuid) = 'booked', 'a booking days away stays booked';
  assert (public.booking_pass((select view_token from public.bookings where id = ((select v from res where k = 'soon') ->> 'booking')::uuid)) ->> 'tikka_used')::boolean, 'the pass knows it was used';
end $$;

rollback;
