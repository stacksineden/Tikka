-- Every customer has a number, and deposits belong to their booking: a walk-in sale or a pay link
-- without a number is refused (a booking, a sale or a Tikka brings its own); "Add their number"
-- joins sales and links saved under that name; the owner records a deposit they took on a booking
-- (never on one paid online or already settled); a pay link paid for a Tikka becomes the deposit on
-- the booking made with it, whichever comes first, and the ledger counts it once; the receipt says
-- how the deposit was paid; owners only.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c082-000000000001', 'owner82@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c082-000000000002', 'staff82@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c082-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Numbers', 'numbers82', 'NQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Makeup","price_kobo":3000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 2, 0, 30, '{}');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c082-000000000002', 'staff');
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');

-- Two bookings: one for a deposit by hand, one for a Tikka.
set local role service_role;
insert into res select 'bk1', public.book_time((select v from t where k = 'biz'), (select id from public.business_services where business_id = (select v from t where k = 'biz')),
  (((now() at time zone 'Africa/Lagos')::date + 2) + time '10:00') at time zone 'Africa/Lagos', 'Ada', '+2348030820001', false, null);
insert into res select 'bk2', public.book_time((select v from t where k = 'biz'), (select id from public.business_services where business_id = (select v from t where k = 'biz')),
  (((now() at time zone 'Africa/Lagos')::date + 2) + time '12:00') at time zone 'Africa/Lagos', 'Ayo', '+2348030820002', false, null);
reset role;

-- A Tikka for Ayo, and an old pay link saved without a number, paid.
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid;
  c uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at, status)
  values (biz, 'd82', 'D82', 10, now() - interval '1 day', now() + interval '5 days', 'published') returning id into d;
  insert into public.rewards (drop_id, tier, kind, title, quantity) values (d, 'common', 'perk', 'Perk', 10);
  perform private.build_deck(d);
  -- (booking 2 made Ayo a lead already)
  insert into public.claims (drop_id, card_id, lead_id, phone, first_name, code, view_token, is_new_lead, expires_at)
  select d, (select id from public.cards where drop_id = d and position = 0), l.id, l.phone, 'Ayo', 'NQ-AAAAC', 'tok-82', true, now() + interval '7 days'
  from public.leads l where l.business_id = biz and l.phone = '+2348030820002'
  returning id into c;
  insert into t values ('claim', c), ('lead', (select lead_id from public.claims where id = c));
  -- Booking 2 was made with the Tikka; then the owner sends a pay link for it.
  update public.bookings set claim_id = c where id = ((select v from res where k = 'bk2') ->> 'id')::uuid;
  insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, claim_id, lead_id, subaccount_code, paystack_mode, status)
  values (biz, 'tikkalnk82', 1000000, 'Your Tikka', 'Ayo', c, (select v from t where k = 'lead'), 'ACCT_x', 'live', 'open');
  insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, subaccount_code, paystack_mode, status, paid_kobo, paid_at)
  values (biz, 'oldlink082', 500000, 'Balance', 'Bisi', 'ACCT_x', 'live', 'paid', 500000, now());
  insert into public.sales (business_id, name, item, total_kobo) values (biz, 'Bisi', 'Balance', 700000);
end $$;

-- The customer pays the Tikka's link: it lands on booking 2 as its deposit.
set local role service_role;
insert into res select 'paid', public.complete_pay_link('pl_tikkalnk82_x', 1000000, 25000, null);
reset role;

-- Staff can't do any of it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c082-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_customer_phone((select v from t where k = 'biz'), 'Bisi', '+2348030820003');
    assert false, 'staff must not add numbers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_booking_deposit((select v from t where k = 'biz'), ((select v from res where k = 'bk1') ->> 'id')::uuid, 500000, 'cash');
    assert false, 'staff must not record deposits';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c082-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  bk1 uuid := ((select v from res where k = 'bk1') ->> 'id')::uuid;
  bk2 uuid := ((select v from res where k = 'bk2') ->> 'id')::uuid;
  l jsonb;
  bks jsonb;
  dep jsonb;
begin
  -- 1. A number on every walk-in and pay link.
  begin
    perform public.record_sale(biz, 'Chi', 'Makeup', 1000000, 1000000, 'cash', null, null);
    assert false, 'a walk-in needs a number';
  exception when check_violation then null;
  end;
  assert public.record_sale(biz, 'Chi', 'Makeup', 1000000, 1000000, 'cash', null, '+2348030820004') is not null, 'with a number';
  assert public.create_pay_link(biz, 300000, 'X', 'Y', null, 'live', null, null) ->> 'kind' = 'bad_phone', 'a link needs a number';
  assert public.create_pay_link(biz, 300000, 'X', 'Y', (select v from t where k = 'claim'), 'live', null, null) ->> 'kind' <> 'bad_phone', 'a Tikka brings its number';

  -- 2. Add their number: Bisi's old sale and link join the customer with it.
  assert public.set_customer_phone(biz, '  bisi ', '+2348030820003') = 2, 'the sale and the link';
  l := public.get_ledger(biz);
  assert (select x ->> 'phone' from jsonb_array_elements(l -> 'sales') x where x ->> 'name' = 'Bisi') = '+2348030820003', 'sale has it';
  assert (select x ->> 'phone' from jsonb_array_elements(l -> 'pay_links') x where x ->> 'name' = 'Bisi') = '+2348030820003', 'link has it';
  assert public.set_customer_phone(biz, 'Bisi', '+2348030820003') = 0, 'nothing left to join';
  begin
    perform public.set_customer_phone(biz, 'Bisi', '0803');
    assert false, 'a real number';
  exception when check_violation then null;
  end;

  -- 3. A deposit by hand on booking 1.
  assert public.record_booking_deposit(biz, bk1, 1000000, 'transfer') = 'saved', 'saved';
  dep := (select x from jsonb_array_elements(public.get_bookings(biz, now(), now() + interval '5 days')) x where (x ->> 'id')::uuid = bk1);
  assert (dep ->> 'deposit_paid_kobo')::int = 1000000 and dep ->> 'deposit_method' = 'transfer' and (dep ->> 'deposit_counts')::boolean, 'on the booking: ' || dep::text;
  assert public.record_booking_deposit(biz, bk1, 500000, 'cash') = 'saved', 'changed';
  assert public.record_booking_deposit(biz, bk1, 0, 'cash') = 'cleared', 'cleared';
  assert (select x ->> 'deposit_paid_kobo' from jsonb_array_elements(public.get_bookings(biz, now(), now() + interval '5 days')) x where (x ->> 'id')::uuid = bk1) is null, 'gone';
  assert public.record_booking_deposit(biz, bk1, 800000, 'cash') = 'saved', 'again';

  -- 4. The Tikka's pay link is booking 2's deposit; it can't be overwritten by hand.
  dep := (select x from jsonb_array_elements(public.get_bookings(biz, now(), now() + interval '5 days')) x where (x ->> 'id')::uuid = bk2);
  assert (dep ->> 'deposit_paid_kobo')::int = 1000000 and dep ->> 'deposit_method' = 'pay_link', 'linked: ' || dep::text;
  assert public.record_booking_deposit(biz, bk2, 500000, 'cash') = 'paid_online', 'paid online already';

  -- Counted once: the ledger leaves the linked link's sale out; the bookings carry both deposits.
  l := public.get_ledger(biz);
  assert not exists (select 1 from jsonb_array_elements(l -> 'sales') x where x ->> 'item' = 'Your Tikka'), 'the linked link''s sale is left out';
  assert exists (select 1 from jsonb_array_elements(l -> 'pay_links') x where x ->> 'phone' = '+2348030820003'), 'Bisi''s old link has the number';
  bks := public.get_bookings(biz, now(), now() + interval '5 days');
  assert (select x ->> 'deposit_method' from jsonb_array_elements(bks) x where (x ->> 'id')::uuid = bk1) = 'cash', 'method read';
  assert (select x ->> 'deposit_paid_at' from jsonb_array_elements(bks) x where (x ->> 'id')::uuid = bk2) is not null, 'when read';

  -- Once settled, the deposit stays as it was.
  perform public.record_sale(biz, 'Ada', 'Makeup', 2200000, 2200000, 'cash', bk1, null);
  assert public.record_booking_deposit(biz, bk1, 100000, 'cash') = 'settled', 'settled';
end $$;
reset role;

-- Not Tikka's Paystack money; linked to the right link.
do $$
begin
  assert (select deposit_mode from public.bookings where id = ((select v from res where k = 'bk1') ->> 'id')::uuid) is null, 'not Tikka''s money';
  assert (select deposit_pay_link from public.bookings where id = ((select v from res where k = 'bk2') ->> 'id')::uuid) = (select id from public.pay_links where token = 'tikkalnk82'), 'the link';
end $$;

-- The receipt says how the deposit was paid.
do $$
declare
  tok text := private.give_receipt((select id from public.sales where booking_id = ((select v from res where k = 'bk1') ->> 'id')::uuid));
  r jsonb;
begin
  r := public.receipt_page(tok);
  assert r -> 'booking' ->> 'deposit_method' = 'cash' and (r -> 'booking' ->> 'deposit_paid_kobo')::int = 800000, 'receipt: ' || r::text;
end $$;

-- A link paid first, the booking made after: it still becomes the deposit.
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c uuid := (select v from t where k = 'claim');
  nb uuid;
begin
  insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, claim_id, lead_id, subaccount_code, paystack_mode, status, paid_kobo, paid_at)
  values (biz, 'tikkaln282', 400000, 'Your Tikka', 'Ayo', c, (select v from t where k = 'lead'), 'ACCT_x', 'live', 'paid', 400000, now());
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, source, status, code, view_token, claim_id, lead_id)
  select business_id, service_id, service_name, minutes, starts_at + interval '1 day', ends_at + interval '1 day', first_name, phone, source, 'booked', 'BK-NQKXYA', 'ab82ab82ab82ab82ab82ab82', c, lead_id
  from public.bookings where id = ((select v from res where k = 'bk2') ->> 'id')::uuid
  returning id into nb;
  assert (select deposit_pay_link from public.bookings where id = nb) = (select id from public.pay_links where token = 'tikkaln282'), 'linked on booking';
end $$;

rollback;
