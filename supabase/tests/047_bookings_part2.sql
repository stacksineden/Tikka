-- Bookings part 2: a Tikka claimer books a time before their use-by (one upcoming per Tikka);
-- the owner books a claimer in from Leads; booking leads for the owner only; BK codes at the
-- counter for the team without numbers; the alert carries no number.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c047-000000000001', 'owner47@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c047-000000000002', 'staff47@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c047-000000000003', 'other47@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c047-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Book Two', 'booktwo47', 'BW', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":3000000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 120, 92, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c047-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Two', 'othertwo47', 'OW', 'Beauty', 'Oyo', 'Ibadan', 'Ring Road', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c047-000000000002', 'staff');
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'book-two', 'Book two drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 7, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 10, '10% off', 10);
select private.build_deck((select v from t where k = 'drop'));

create function pg_temp.claim(p_visitor text, p_phone text) returns uuid language plpgsql as $$
begin
  if public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), 'Ada', false, p_visitor, 'direct') ->> 'token', p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed for %', p_phone;
  end if;
  return (select id from public.claims where phone = p_phone and drop_id = (select v from t where k = 'drop') and kind = 'drop');
end $$;
create function pg_temp.at(p_hhmm text, p_days int) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;

insert into t values ('ada', pg_temp.claim('v1', '+2348047000001')), ('bola', pg_temp.claim('v2', '+2348047000002'));
insert into res select 'tok', jsonb_build_object('ada', (select view_token from public.claims where id = (select v from t where k = 'ada')),
                                                 'bola', (select view_token from public.claims where id = (select v from t where k = 'bola')));

-- The claimer books from their Tikka: before the use-by only, once.
do $$
declare
  tok text := (select v ->> 'ada' from res where k = 'tok');
  r jsonb;
  i jsonb;
begin
  i := public.tikka_booking_info(tok);
  assert i ->> 'first_name' = 'Ada' and (i ->> 'redeemed')::boolean = false and i -> 'booking' = 'null'::jsonb, 'info before: ' || i::text;
  assert public.book_for_claim(tok, (select v from t where k = 'braids'), pg_temp.at('10:00', 9)) ->> 'kind' = 'after_use_by', 'after the 7-day use-by';
  r := public.book_for_claim(tok, (select v from t where k = 'braids'), pg_temp.at('10:00', 3));
  assert r ->> 'kind' = 'booked', 'booked: ' || r::text;
  assert public.book_for_claim(tok, (select v from t where k = 'braids'), pg_temp.at('14:00', 4)) ->> 'token' = r ->> 'token', 'asking again returns the same booking';
  assert (select source = 'tikka' and claim_id = (select v from t where k = 'ada') and phone = '+2348047000001' from public.bookings where view_token = r ->> 'token'), 'connected to the Tikka';
  i := public.tikka_booking_info(tok);
  assert i -> 'booking' ->> 'view_token' = r ->> 'token', 'info shows the booking';
  -- One at a time: 10:00–12:00 on that day is now taken.
  assert public.book_for_claim((select v ->> 'bola' from res where k = 'tok'), (select v from t where k = 'braids'), pg_temp.at('11:00', 3)) ->> 'kind' = 'taken', 'taken';
  insert into res values ('ada_bk', r);
end $$;

-- The owner books Bola in from Leads (her Tikka, her name and number); staff can't; another
-- business can't book someone else's Tikka.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c047-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'braids'), pg_temp.at('14:00', 3), '', null, false, (select v from t where k = 'bola'));
    assert false, 'staff must not book people in';
  exception when insufficient_privilege then null;
  end;
  -- Staff check a BK code: the booking, no number.
  declare r jsonb := public.check_booking_code((select v from t where k = 'biz'), (select v ->> 'code' from res where k = 'ada_bk'));
  begin
    assert r ->> 'kind' = 'booking' and r ->> 'first_name' = 'Ada' and r ->> 'service' = 'Braids', 'staff see the booking: ' || r::text;
    assert r::text !~ '8047', 'never the number';
  end;
  assert public.check_booking_code((select v from t where k = 'biz'), 'BK-AAAAAA') ->> 'kind' = 'unknown', 'unknown code';
  begin
    perform public.get_booking_leads((select v from t where k = 'biz'));
    assert false, 'staff never see leads';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c047-000000000003","role":"authenticated"}', true);
do $$
begin
  assert public.add_booking((select v from t where k = 'other'), (select v from t where k = 'braids'), pg_temp.at('14:00', 3), '', null, true, (select v from t where k = 'bola')) ->> 'kind' = 'not_found',
    'another business can''t book this Tikka';
  assert public.check_booking_code((select v from t where k = 'other'), (select v ->> 'code' from res where k = 'ada_bk')) ->> 'kind' = 'wrong_business', 'wrong business';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c047-000000000001","role":"authenticated"}', true);
do $$
declare
  r jsonb;
  ls jsonb;
begin
  r := public.add_booking((select v from t where k = 'biz'), (select v from t where k = 'braids'), pg_temp.at('14:00', 3), 'ignored', '+2348000000000', false, (select v from t where k = 'bola'));
  assert r ->> 'kind' = 'booked', 'booked her in: ' || r::text;
  -- A booking without a Tikka, from the page.
  ls := public.get_booking_leads((select v from t where k = 'biz'));
  assert jsonb_array_length(ls) = 2, 'two people booked: ' || ls::text;
  assert ls::text ~ '8047000002' and ls::text ~ 'tikka', 'the owner sees numbers and where they came from';
  assert (select x -> 'next' ->> 'service' from jsonb_array_elements(ls) x where x ->> 'phone' = '+2348047000002') = 'Braids', 'next booking';
end $$;
reset role;

do $$
begin
  assert (select first_name from public.bookings where claim_id = (select v from t where k = 'bola')) = 'Ada', 'the name comes from the Tikka, not what was typed';
  assert (select source from public.bookings where claim_id = (select v from t where k = 'bola')) = 'tikka', 'from a Tikka';
  assert (select phone from public.bookings where claim_id = (select v from t where k = 'bola')) = '+2348047000002', 'the number comes from the Tikka';
  -- The alert: what and when, never the number.
  assert public.booking_alert((select id from public.bookings where claim_id = (select v from t where k = 'bola'))) ->> 'service' = 'Braids', 'alert';
  assert public.booking_alert((select id from public.bookings where claim_id = (select v from t where k = 'bola')))::text !~ '8047', 'alert never has the number';
end $$;

-- A used Tikka can't book.
update public.claims set redeemed_at = now() where id = (select v from t where k = 'bola');
do $$
begin
  assert public.book_for_claim((select v ->> 'bola' from res where k = 'tok'), (select v from t where k = 'braids'), pg_temp.at('10:00', 5)) ->> 'kind' = 'used', 'used';
end $$;

rollback;
