-- Bookings with free times (docs/BOOKINGS.md): picking a free time books it; full, closed,
-- too-soon, too-far and blocked times can't be booked; capacity counts overlapping bookings;
-- cancelling and moving free the time; 3 upcoming per number; staff never see numbers and only
-- mark Arrived / No-show; blocking names clashes and never cancels; service lengths survive saves.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c046-000000000001', 'owner46@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c046-000000000002', 'staff46@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c046-000000000003', 'other46@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Book Studio', 'bookstudio46', 'BQ', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'),
  '[{"name":"Facial","price_kobo":2500000,"price_kind":"fixed","minutes":60},{"name":"Braids","price_kobo":3000000,"price_kind":"fixed"}]');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c046-000000000002', 'staff');
-- Open every day 9am–6pm, so the test day is always open.
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into t select 'facial', id from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Facial';
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Braids';

-- A day a week ahead, at a WAT time.
create function pg_temp.at(p_hhmm text, p_days int default 7) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;
create function pg_temp.book(p_service text, p_hhmm text, p_name text, p_phone text, p_future boolean default false) returns text language sql as $$
  select public.book_time((select v from t where k = 'biz'), (select v from t where k = p_service), pg_temp.at(p_hhmm), p_name, p_phone, p_future, 'v-' || p_phone, 'test', null) ->> 'kind';
$$;

-- Before setup: no free times, nothing books.
do $$
begin
  assert public.booking_busy((select v from t where k = 'biz'), now(), 30) is null, 'off until set up';
  assert pg_temp.book('facial', '10:00', 'Ada', '+2348046000001') = 'off', 'off until set up';
end $$;

-- Staff can't set bookings up.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.save_booking_settings((select v from t where k = 'biz'), true, 2, 120, 92, '{}');
    assert false, 'staff must not set up bookings';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The owner: two at a time, Braids takes 3 hours.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000001","role":"authenticated"}', true);
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 120, 92,
  jsonb_build_object((select v from t where k = 'braids')::text, 180));
reset role;

do $$
begin
  assert (select minutes from public.business_services where id = (select v from t where k = 'braids')) = 180, 'braids length saved';
  assert (select minutes from public.business_services where id = (select v from t where k = 'facial')) = 60, 'facial length kept';

  -- Ada: braids 10:00–1:00. Bisi: facial 11:00–12:00. Both chairs busy 11:00–12:00.
  assert pg_temp.book('braids', '10:00', 'Ada', '+2348046000001', true) = 'booked', 'ada books';
  assert pg_temp.book('facial', '11:00', 'Bisi', '+2348046000002') = 'booked', 'bisi books';
  assert pg_temp.book('facial', '11:00', 'Chioma', '+2348046000003') = 'taken', '11:00 is full';
  assert pg_temp.book('facial', '10:30', 'Chioma', '+2348046000003') = 'taken', '10:30 runs into the full 11:00';
  assert pg_temp.book('facial', '10:00', 'Chioma', '+2348046000003') = 'booked', '10:00–11:00 has a chair';
  assert pg_temp.book('facial', '10:00', 'Dayo', '+2348046000004') = 'taken', 'now 10:00 is full too';
  assert pg_temp.book('facial', '12:00', 'Dayo', '+2348046000004') = 'booked', 'noon has a chair';

  -- Opening hours, the 30-minute grid, notice and reach.
  assert pg_temp.book('facial', '17:30', 'Eko', '+2348046000005') = 'closed', 'would end after closing';
  assert pg_temp.book('facial', '08:30', 'Eko', '+2348046000005') = 'closed', 'before opening';
  assert pg_temp.book('facial', '10:15', 'Eko', '+2348046000005') = 'closed', 'off the half-hour grid';
  assert public.book_time((select v from t where k = 'biz'), (select v from t where k = 'facial'), now() + interval '1 hour', 'Eko', '+2348046000005', false, 'x', 'test', null) ->> 'kind' = 'too_soon', '2 hours notice';
  assert public.book_time((select v from t where k = 'biz'), (select v from t where k = 'facial'), pg_temp.at('10:00', 120), 'Eko', '+2348046000005', false, 'x', 'test', null) ->> 'kind' = 'too_far', '92 days ahead';
  assert pg_temp.book('facial', '17:00', '  ', '+2348046000005') = 'bad_name', 'a name is needed';
  assert pg_temp.book('facial', '17:00', 'Eko', '0803') = 'bad_phone', 'a real number is needed';

  -- At most 3 upcoming per number.
  assert pg_temp.book('facial', '14:00', 'Ada', '+2348046000001') = 'booked', 'ada 2';
  assert pg_temp.book('facial', '15:00', 'Ada', '+2348046000001') = 'booked', 'ada 3';
  assert pg_temp.book('facial', '16:00', 'Ada', '+2348046000001') = 'too_many', 'ada 4 refused';

  -- One lead per person, from a booking, unconfirmed (typed number), opt-in only once they come.
  assert (select count(*) from public.leads where business_id = (select v from t where k = 'biz') and phone = '+2348046000001') = 1, 'one lead for ada';
  assert (select first_source = 'booking' and not phone_confirmed and not marketing_opt_in from public.leads
          where business_id = (select v from t where k = 'biz') and phone = '+2348046000001'), 'booking lead, unconfirmed, no opt-in yet';
end $$;

insert into t select 'bisi', id from public.bookings where phone = '+2348046000002';
insert into t select 'ada', id from public.bookings where phone = '+2348046000001' and service_name = 'Braids';
insert into t select 'dayo', id from public.bookings where phone = '+2348046000004';

-- The public: times only.
set local role anon;
do $$
declare
  r jsonb := public.booking_busy((select v from t where k = 'biz'), now(), 30);
begin
  assert (r ->> 'capacity')::int = 2 and jsonb_array_length(r -> 'busy') = 6, 'six busy times: ' || r::text;
  assert r::text !~ '8046' and r::text !~ 'Ada', 'never names or numbers';
  begin
    perform public.book_time((select v from t where k = 'biz'), (select v from t where k = 'facial'), pg_temp.at('16:00'), 'Eko', '+2348046000005', false, 'x', 'test', null);
    assert false, 'the public books through the server only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
declare
  p jsonb := public.booking_pass((select view_token from public.bookings where id = (select v from t where k = 'bisi')));
begin
  assert p ->> 'service' = 'Facial' and p ->> 'status' = 'booked' and p ->> 'code' ~ '^BK-', 'the pass: ' || p::text;
  assert p::text !~ '8046', 'the pass never shows the number';
end $$;

-- Staff: bookings without numbers; can't cancel, move, add or block; mark only when it's time.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb := public.get_bookings(biz, now(), now() + interval '30 days');
begin
  assert jsonb_array_length(r) = 6, 'staff see the bookings';
  assert r::text !~ '8046', 'staff never see numbers';
  begin
    perform public.cancel_booking(biz, (select v from t where k = 'bisi'));
    assert false, 'staff must not cancel';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.move_booking(biz, (select v from t where k = 'bisi'), pg_temp.at('16:00'), false);
    assert false, 'staff must not move';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.block_time(biz, pg_temp.at('13:00'), pg_temp.at('15:00'), 'x');
    assert false, 'staff must not block';
  exception when insufficient_privilege then null;
  end;
  assert public.mark_booking(biz, (select v from t where k = 'ada'), 'arrived') ->> 'kind' = 'too_early', 'not yet';
  assert public.mark_booking(biz, (select v from t where k = 'ada'), 'no_show') ->> 'kind' = 'too_early', 'not yet';
end $$;

-- Another business's owner sees nothing.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.get_bookings((select v from t where k = 'biz'), now(), now() + interval '30 days');
    assert false, 'outsiders see nothing';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The owner: numbers; cancel frees the time; block names clashes and cancels nobody; move.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb;
begin
  r := public.get_bookings(biz, now(), now() + interval '30 days');
  assert r::text ~ '8046000002', 'the owner sees numbers';
  assert public.cancel_booking(biz, (select v from t where k = 'bisi')) ->> 'kind' = 'cancelled', 'cancelled';
  assert public.cancel_booking(biz, (select v from t where k = 'bisi')) ->> 'kind' = 'not_booked', 'only once';

  r := public.block_time(biz, pg_temp.at('13:30'), pg_temp.at('15:30'), 'Errand');
  assert r ->> 'kind' = 'blocked' and jsonb_array_length(r -> 'clashes') = 2, 'ada 2pm and 3pm clash: ' || r::text;

  r := public.move_booking(biz, (select v from t where k = 'dayo'), pg_temp.at('16:00'), false);
  assert r ->> 'kind' = 'moved', 'dayo moved to 4pm: ' || r::text;
  r := public.move_booking(biz, (select v from t where k = 'dayo'), pg_temp.at('14:00'), false);
  assert r ->> 'kind' = 'taken', 'blocked time is taken';
  r := public.move_booking(biz, (select v from t where k = 'dayo'), pg_temp.at('14:00'), true);
  assert r ->> 'kind' = 'moved', 'the owner can fit them in anyway';

  -- A walk-in without a number; a DM booking with one becomes a lead "booked by you".
  assert public.add_booking(biz, (select v from t where k = 'facial'), pg_temp.at('09:00'), 'Walk-in', null, false) ->> 'kind' = 'booked', 'walk-in';
  assert public.add_booking(biz, (select v from t where k = 'facial'), pg_temp.at('09:00'), 'Femi', '+2348046000006', false) ->> 'kind' = 'booked', 'dm booking';
  assert public.add_booking(biz, (select v from t where k = 'facial'), pg_temp.at('09:00'), 'Gbenga', '+2348046000007', false) ->> 'kind' = 'taken', '9am now full';
end $$;
reset role;

-- After cancelling Bisi, 11:00 is free again.
do $$
begin
  assert (select count(*) from public.bookings where phone = '+2348046000001' and status = 'booked' and service_name = 'Facial') = 2, 'blocking cancelled nobody';
  assert pg_temp.book('facial', '11:00', 'Halima', '+2348046000008') = 'booked', 'cancelled time is free again';
  assert (select source from public.bookings where phone = '+2348046000006') = 'owner', 'booked by you';
end $$;

-- The time comes: staff mark Ada arrived, and her future-offers tick reaches her lead.
update public.bookings set starts_at = now() - interval '30 minutes', ends_at = now() + interval '150 minutes' where id = (select v from t where k = 'ada');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000002","role":"authenticated"}', true);
do $$
begin
  assert public.mark_booking((select v from t where k = 'biz'), (select v from t where k = 'ada'), 'arrived') ->> 'kind' = 'arrived', 'arrived';
end $$;
reset role;
do $$
begin
  assert (select marketing_opt_in from public.leads where business_id = (select v from t where k = 'biz') and phone = '+2348046000001'), 'opt-in once they came';
end $$;

-- Saving the page keeps service lengths.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c046-000000000001","role":"authenticated"}', true);
select public.save_services((select v from t where k = 'biz'),
  '[{"name":"Facial","price_kobo":2500000,"price_kind":"fixed","minutes":90}]');
reset role;
do $$
begin
  assert (select minutes from public.business_services where business_id = (select v from t where k = 'biz') and name = 'Facial') = 90, 'length kept through a save';
  assert (select count(*) from public.bookings where business_id = (select v from t where k = 'biz') and service_name = 'Braids') = 1, 'bookings keep their service';
end $$;

rollback;
