-- Booking with choices (docs/DB_MOVE.md step 2): Postgres prices the picks (choice, people,
-- extras, travel fee), the deposit is worked out on that total, each booking keeps its gap or its
-- whole date busy, the older booking paths respect that, and the customer moves (24 hours' notice)
-- or cancels from the pass. Addresses reach owners only.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c063-000000000001', 'owner63@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c063-000000000002', 'staff63@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c063-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Choices', 'choices63', 'QH', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), jsonb_build_array(
  jsonb_build_object('name', 'Braids', 'price_kobo', 2000000, 'price_kind', 'from', 'minutes', 120,
    'options', jsonb_build_array(jsonb_build_object('label', 'Short', 'price_kobo', 2000000, 'minutes', 120),
                                 jsonb_build_object('label', 'Long', 'price_kobo', 3500000, 'minutes', 240)),
    'extras', jsonb_build_array(jsonb_build_object('name', 'Add wash', 'price_kobo', 300000),
                                jsonb_build_object('name', 'Beads', 'price_kobo', 150000))),
  jsonb_build_object('name', 'Bridal', 'price_kobo', 8000000, 'minutes', 120, 'event_day', true, 'per_person', true,
    'options', jsonb_build_array(jsonb_build_object('label', 'Bride', 'price_kobo', 8000000, 'minutes', 120),
                                 jsonb_build_object('label', 'Each bridesmaid', 'price_kobo', 2500000, 'minutes', 45))),
  jsonb_build_object('name', 'Consult', 'price_kobo', 500000, 'minutes', 30, 'questions', jsonb_build_array('Any allergies?'))));
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 60, 92, '{}');
update public.businesses set work_place = 'both', travel_fee_kobo = 300000, travel_reach = 'city', gap_minutes = 30, home_gap_minutes = 30,
  hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c063-000000000002', 'staff');
insert into t select lower(name), id from public.business_services where business_id = (select v from t where k = 'biz');

create function pg_temp.at(p_hhmm text, p_days int) returns timestamptz language sql as $$
  select (((now() at time zone 'Africa/Lagos')::date + p_days) + p_hhmm::time) at time zone 'Africa/Lagos';
$$;
create function pg_temp.book(p_service text, p_start timestamptz, p_phone text, p_choice jsonb,
  p_address text default null, p_answers text default null, p_email text default null) returns jsonb language sql as $$
  select public.book_time_v2((select v from t where k = 'biz'), (select v from t where k = p_service), p_start, 'Ada', p_phone,
    p_choice, p_address, null, p_answers, false, null, 'test', p_email);
$$;
grant execute on function pg_temp.at(text, int), pg_temp.book(text, timestamptz, text, jsonb, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------- prices (public, the same sums the booking charges)
set local role anon;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  p jsonb;
begin
  p := public.price_booking(biz, (select v from t where k = 'braids'), '{"option":1,"extras":[0,0,7]}', 'test');
  assert (p ->> 'total_kobo')::int = 3800000 and (p ->> 'minutes')::int = 240, 'Long + wash once, unknown extra ignored: ' || p::text;
  assert p ->> 'detail' = 'Long, add wash', 'detail: ' || p::text;
  assert (p ->> 'deposit_kobo')::int = 0, 'payments off: no deposit';
  assert (p ->> 'gap_minutes')::int = 30, 'the business gap';
  p := public.price_booking(biz, (select v from t where k = 'braids'), '{"option":0,"home":true}', 'test');
  assert (p ->> 'total_kobo')::int = 2300000 and (p ->> 'home')::boolean and (p ->> 'gap_minutes')::int = 60, 'home: travel fee and the extra gap: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'bridal'), '{"people":[1,3]}', 'test');
  assert (p ->> 'total_kobo')::int = 15500000 and (p ->> 'minutes')::int = 255, 'bride + 3 bridesmaids: ' || p::text;
  assert p ->> 'detail' = '3 bridesmaids', 'people detail: ' || p::text;
  p := public.price_booking(biz, (select v from t where k = 'bridal'), '{"people":[1,99]}', 'test');
  assert (p ->> 'total_kobo')::int = 8000000 + 15 * 2500000, 'at most 15 people per option';
  p := public.price_booking(biz, (select v from t where k = 'braids'), '{"option":9}', 'test');
  assert (p ->> 'total_kobo')::int = 3500000, 'an option out of range is the last one';
end $$;
reset role;

-- ---------------------------------------------- booking without payments: booked, priced, gap kept
set local role service_role;
insert into res select 'a', pg_temp.book('braids', pg_temp.at('10:00', 3), '+2348030000001', '{"option":0,"extras":[1]}');
reset role;
do $$
declare
  r jsonb := (select v from res where k = 'a');
  b public.bookings;
begin
  assert r ->> 'kind' = 'booked', 'booked: ' || r::text;
  select * into b from public.bookings where id = (r ->> 'id')::uuid;
  assert b.price_kobo = 2150000 and b.minutes = 120 and b.detail = 'Short, beads' and b.gap_minutes = 30, 'priced on the server: ' || jsonb_build_object('detail', b.detail, 'gap', b.gap_minutes, 'choice', b.choice)::text;
  assert b.busy_from = b.starts_at and b.busy_to = b.ends_at + interval '30 minutes', 'busy for its time and its gap';
  assert b.choice ->> 'extras' = '[1]' and b.home_area is null and not b.event_day, 'the picks kept';
  assert exists (select 1 from public.leads where business_id = b.business_id and phone = '+2348030000001' and first_source = 'booking'), 'a lead';
end $$;

-- The gap after it is taken (capacity 1); after the gap is free. The older book_time() respects it too.
set local role service_role;
do $$
begin
  assert pg_temp.book('consult', pg_temp.at('12:00', 3), '+2348030000002', '{}', null, 'None') ->> 'kind' = 'taken', 'inside the gap';
  assert public.book_time((select v from t where k = 'biz'), (select v from t where k = 'consult'), pg_temp.at('12:00', 3),
    'Bola', '+2348030000003', false, null) ->> 'kind' = 'taken', 'the older book_time respects the gap';
  assert pg_temp.book('consult', pg_temp.at('12:30', 3), '+2348030000002', '{}', null, 'None') ->> 'kind' = 'booked', 'after the gap';
  -- Questions need answers; a home visit needs an address.
  assert pg_temp.book('consult', pg_temp.at('15:00', 3), '+2348030000004', '{}') ->> 'kind' = 'bad_answers', 'answers needed';
  assert pg_temp.book('braids', pg_temp.at('14:00', 4), '+2348030000004', '{"home":true}') ->> 'kind' = 'bad_address', 'address needed';
  -- Opening hours use the booking's own time (Long braids at 15:00 runs to 19:00).
  assert pg_temp.book('braids', pg_temp.at('15:00', 4), '+2348030000004', '{"option":1}') ->> 'kind' = 'closed', 'past closing';
end $$;
insert into res select 'home', pg_temp.book('braids', pg_temp.at('09:00', 4), '+2348030000005', '{"home":true}', '12 Awolowo Rd');
reset role;
do $$
declare b public.bookings := (select x from public.bookings x where id = ((select v from res where k = 'home') ->> 'id')::uuid);
begin
  assert b.home_area = '12 Awolowo Rd' and b.price_kobo = 2300000 and b.gap_minutes = 60, 'home visit: address, travel fee, extra gap: ' || row_to_json(b)::text;
end $$;

-- ---------------------------------------------- event days take the whole date
set local role service_role;
do $$
begin
  assert pg_temp.book('bridal', pg_temp.at('13:00', 6), '+2348030000006', '{"people":[1,2]}') ->> 'kind' = 'closed', 'call time after noon';
  assert pg_temp.book('bridal', pg_temp.at('06:00', 3), '+2348030000006', '{"people":[1,2]}') ->> 'kind' = 'taken', 'a day with a booking already';
end $$;
insert into res select 'event', pg_temp.book('bridal', pg_temp.at('06:00', 6), '+2348030000006', '{"people":[1,2]}');
do $$
begin
  assert (select v from res where k = 'event') ->> 'kind' = 'booked', 'event day booked: ' || (select v from res where k = 'event')::text;
  assert pg_temp.book('consult', pg_temp.at('16:00', 6), '+2348030000007', '{}', null, 'No') ->> 'kind' = 'taken', 'nothing else that date';
  assert public.book_time((select v from t where k = 'biz'), (select v from t where k = 'consult'), pg_temp.at('17:00', 6),
    'Bola', '+2348030000007', false, null) ->> 'kind' = 'taken', 'the older book_time respects the event day';
  assert pg_temp.book('consult', pg_temp.at('09:00', 7), '+2348030000007', '{}', null, 'No') ->> 'kind' = 'booked', 'the next day is free';
end $$;
reset role;
do $$
declare
  b public.bookings := (select x from public.bookings x where id = ((select v from res where k = 'event') ->> 'id')::uuid);
  busy jsonb := public.booking_busy((select v from t where k = 'biz'), pg_temp.at('00:00', 6), 1);
begin
  assert b.event_day and b.minutes = 210 and b.price_kobo = 13000000, 'bride and 2 bridesmaids: ' || row_to_json(b)::text;
  assert b.busy_from = pg_temp.at('00:00', 6) and b.busy_to = pg_temp.at('00:00', 7), 'the whole date';
  assert jsonb_array_length(busy -> 'blocked') = 1 and busy::text !~ 'Ada', 'shown as blocked, never who: ' || busy::text;
end $$;

-- ---------------------------------------------- deposits on the total
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c063-000000000001/kyc/id.webp', 'no', 'approved', now());
update public.businesses set verified = true where id = (select v from t where k = 'biz');
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 5000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c063-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_choices63', 'test');
update public.booking_settings set deposit_mode = 'percent', deposit_percent = 30, deposit_counts = false where business_id = (select v from t where k = 'biz');

set local role service_role;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb;
  b public.bookings;
begin
  -- 30% of ₦38,000 is ₦11,400: up to ₦11,500.
  assert (public.price_booking(biz, (select v from t where k = 'braids'), '{"option":1,"extras":[0]}', 'test') ->> 'deposit_kobo')::int = 1150000, '30% rounds up to ₦500';
  assert (public.price_booking(biz, (select v from t where k = 'braids'), '{"option":1}', 'live') ->> 'deposit_kobo')::int = 0, 'no live account: no deposit';
  assert pg_temp.book('braids', pg_temp.at('10:00', 8), '+2348030000008', '{"option":1,"extras":[0]}') ->> 'kind' = 'bad_email', 'email for the receipt';
  r := pg_temp.book('braids', pg_temp.at('10:00', 8), '+2348030000008', '{"option":1,"extras":[0]}', null, null, 'ada@example.com');
  assert r ->> 'kind' = 'pay' and (r ->> 'deposit_kobo')::int = 1150000, 'held for the deposit: ' || r::text;
  select * into b from public.bookings where id = (r ->> 'id')::uuid;
  assert b.status = 'held' and b.deposit_kobo = 1150000 and not b.deposit_counts and b.deposit_subaccount = 'ACCT_choices63', 'held like book_time';
  -- Event days: 50% of ₦105,000 (bride + 1) is ₦52,500, capped at the ₦50,000 maximum; always counts.
  r := pg_temp.book('bridal', pg_temp.at('07:00', 9), '+2348030000009', '{"people":[1,1]}', null, null, 'bisi@example.com');
  assert r ->> 'kind' = 'pay' and (r ->> 'deposit_kobo')::int = 5000000, 'event day deposit capped: ' || r::text;
  assert (select deposit_counts from public.bookings where id = (r ->> 'id')::uuid), 'event deposits count towards the bill';
  -- Paying books it, through the existing completion.
  r := public.complete_booking_deposit('bk_' || b.view_token || '_t63', 1150000, 0, 'ada@example.com');
  assert (select status from public.bookings where id = b.id) = 'booked', 'paid: booked: ' || r::text;
end $$;
reset role;

-- ---------------------------------------------- move or cancel from the pass
set local role service_role;
do $$
declare
  a public.bookings := (select x from public.bookings x where id = ((select v from res where k = 'a') ->> 'id')::uuid);
  r jsonb;
begin
  -- Moved to day 5 at 11:00: the busy window and gap move with it.
  r := public.change_from_pass(a.view_token, 'move', pg_temp.at('11:00', 5));
  assert r ->> 'kind' = 'moved', 'moved: ' || r::text;
  select * into a from public.bookings where id = a.id;
  assert a.starts_at = pg_temp.at('11:00', 5) and a.busy_to = a.ends_at + interval '30 minutes' and a.moved_at is not null, 'window moved';
  assert public.change_from_pass(a.view_token, 'move', pg_temp.at('11:00', 6)) ->> 'kind' = 'taken', 'not onto the event day';
  -- The old time is free again.
  -- (Deposits are on now, so it's held for one.)
  assert pg_temp.book('consult', pg_temp.at('10:00', 3), '+2348030000010', '{}', null, 'No', 'c@example.com') ->> 'kind' = 'pay', 'old time freed';
  -- Cancelling: no refund, the time is free.
  r := public.change_from_pass(a.view_token, 'cancel', null);
  assert r ->> 'kind' = 'cancelled' and (select status from public.bookings where id = a.id) = 'cancelled', 'cancelled';
  assert public.change_from_pass(a.view_token, 'cancel', null) ->> 'kind' = 'not_booked', 'only once';
  assert public.change_from_pass('nope', 'cancel', null) ->> 'kind' = 'not_found', 'unknown pass';
end $$;
reset role;
-- Less than 24 hours before: can't move (but can still cancel).
update public.bookings set starts_at = now() + interval '20 hours', ends_at = now() + interval '22 hours', busy_from = null, busy_to = null
where id = ((select v from res where k = 'home') ->> 'id')::uuid;
set local role service_role;
do $$
declare tok text := (select view_token from public.bookings where id = ((select v from res where k = 'home') ->> 'id')::uuid);
begin
  assert public.change_from_pass(tok, 'move', pg_temp.at('11:00', 10)) ->> 'kind' = 'too_late', '24 hours notice';
end $$;
reset role;

-- ---------------------------------------------- who sees what
-- The pass never shows the address; the owner's list does; staff see the picks, never the address.
do $$
declare p jsonb := public.booking_pass((select view_token from public.bookings where id = ((select v from res where k = 'home') ->> 'id')::uuid));
begin
  assert (p ->> 'home')::boolean and p::text !~ 'Awolowo', 'the pass: home, no address: ' || p::text;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c063-000000000001","role":"authenticated"}', true);
insert into res select 'owner', public.get_bookings((select v from t where k = 'biz'), now(), now() + interval '30 days');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c063-000000000002","role":"authenticated"}', true);
insert into res select 'staff', public.get_bookings((select v from t where k = 'biz'), now(), now() + interval '30 days');
reset role;
do $$
begin
  assert (select v from res where k = 'owner')::text ~ 'Awolowo', 'the owner sees the address';
  assert (select v from res where k = 'staff')::text !~ 'Awolowo' and (select v from res where k = 'staff')::text !~ '\+234', 'staff never see the address or numbers';
  assert (select v from res where k = 'staff')::text ~ '3 bridesmaids|bridesmaid', 'staff see the picks';
end $$;

-- Customers can't call book_time_v2 or change_from_pass directly (the server does, rate-limited).
set local role anon;
do $$
begin
  begin
    perform public.change_from_pass('x', 'cancel', null);
    assert false, 'anon must not change bookings';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
