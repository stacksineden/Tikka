-- Loose ends from booking with choices: a Tikka booking takes the choice (Long holds its real
-- length plus the gap), stays free and at the shop, and keeps the Tikka's rules; an owner moving a
-- booking can't land it inside another booking's gap or on an event day, unless they book anyway.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c074-000000000001', 'owner74@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c074-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Loose Ends', 'looseends74', 'LQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), jsonb_build_array(
  jsonb_build_object('name', 'Braids', 'price_kobo', 2000000, 'price_kind', 'from', 'minutes', 120,
    'options', jsonb_build_array(jsonb_build_object('label', 'Short', 'price_kobo', 2000000, 'minutes', 120),
                                 jsonb_build_object('label', 'Long', 'price_kobo', 3500000, 'minutes', 240))),
  jsonb_build_object('name', 'Consult', 'price_kobo', 500000, 'minutes', 30, 'questions', jsonb_build_array('Any allergies?')),
  jsonb_build_object('name', 'Wedding', 'price_kobo', 9000000, 'minutes', 240, 'event_day', true)));
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 60, 92, '{}');
reset role;
update public.businesses set work_place = 'both', travel_fee_kobo = 300000, travel_reach = 'city', gap_minutes = 30,
  hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select lower(name), id from public.business_services where business_id = (select v from t where k = 'biz');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'loose-ends', 'Loose ends drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published', false)
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
grant execute on function pg_temp.at(text, int) to service_role, authenticated;

insert into res select 'card', jsonb_build_object('t', pg_temp.claim('v1', '+2348074000001'));
insert into res select 'card2', jsonb_build_object('t', pg_temp.claim('v2', '+2348074000002'));

-- 1. A Tikka booking with a choice.
set local role service_role;
do $$
declare
  card text := (select v ->> 't' from res where k = 'card');
  r jsonb;
  b public.bookings;
begin
  r := public.book_for_claim_v2(card, (select v from t where k = 'braids'), pg_temp.at('10:00', 3), '{"option":1,"home":true}', null);
  assert r ->> 'kind' = 'booked', 'booked: ' || r::text;
  select * into b from public.bookings where id = (r ->> 'id')::uuid;
  assert b.minutes = 240 and b.detail = 'Long' and b.source = 'tikka' and b.claim_id is not null, 'Long, with the Tikka: ' || row_to_json(b)::text;
  assert b.home_area is null and b.status = 'booked' and b.deposit_kobo is null, 'at the shop, never a deposit';
  assert b.busy_to = b.ends_at + interval '30 minutes', 'its gap is kept';
  assert b.phone = '+2348074000001' and b.first_name = 'Ada', 'name and number from the claim';
  r := public.book_for_claim_v2(card, (select v from t where k = 'braids'), pg_temp.at('10:00', 4), '{}', null);
  assert r ->> 'kind' = 'already', 'one upcoming booking per Tikka: ' || r::text;
  -- The Long booking holds 10:00–14:30, so 14:00 is taken; 14:30 is free.
  card := (select v ->> 't' from res where k = 'card2');
  r := public.book_for_claim_v2(card, (select v from t where k = 'braids'), pg_temp.at('14:00', 3), '{}', null);
  assert r ->> 'kind' = 'taken', 'inside the first one''s gap: ' || r::text;
  r := public.book_for_claim_v2(card, (select v from t where k = 'consult'), pg_temp.at('15:00', 3), '{}', null);
  assert r ->> 'kind' = 'bad_answers', 'the service''s questions need answers';
  r := public.book_for_claim_v2(card, (select v from t where k = 'braids'), pg_temp.at('10:00', 20), '{}', null);
  assert r ->> 'kind' = 'after_use_by', 'never after the Tikka runs out';
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.book_for_claim_v2(text, uuid, timestamptz, jsonb, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.book_for_claim_v2(text, uuid, timestamptz, jsonb, text)', 'execute'), 'server only';
end $$;

-- 2. The owner moves a booking: gaps and event days count; "book anyway" still works.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c074-000000000001","role":"authenticated"}', true);
insert into res select 'short', public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'consult'), pg_temp.at('16:00', 3), 'Bisi', '+2348074000003', false);
insert into res select 'event', public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'wedding'), pg_temp.at('08:00', 6), 'Tola', '+2348074000004', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  short uuid := ((select v from res where k = 'short') ->> 'id')::uuid;
  r jsonb;
begin
  assert short is not null, 'added: ' || (select v from res where k = 'short')::text;
  r := public.move_booking(biz, short, pg_temp.at('14:00', 3), false);
  assert r ->> 'kind' = 'taken', 'inside the Long booking''s gap: ' || r::text;
  r := public.move_booking(biz, short, pg_temp.at('15:00', 6), false);
  assert r ->> 'kind' = 'taken', 'onto an event day: ' || r::text;
  r := public.move_booking(biz, short, pg_temp.at('14:30', 3), false);
  assert r ->> 'kind' = 'moved', 'right after the gap: ' || r::text;
  r := public.move_booking(biz, short, pg_temp.at('15:00', 6), true);
  assert r ->> 'kind' = 'moved', 'book anyway still overrides: ' || r::text;
end $$;
reset role;

rollback;
