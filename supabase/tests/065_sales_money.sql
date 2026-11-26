-- Sales and money (docs/DB_MOVE.md step 4): the owner records sales (part payments leave a balance),
-- pays balances (never more than owed), adds expenses and regular costs; a booking is settled once;
-- only the owner reads or writes (rule 4); paid pay links are read, not copied; receipts keep one
-- link and number per sale and never show the number; forgetting a person keeps the amounts.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c065-000000000001', 'owner65@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c065-000000000002', 'staff65@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c065-000000000003', 'admin65@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c065-000000000004', 'other65@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Money', 'money65', 'MQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":2000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000004","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other', 'other65', 'OQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c065-000000000002', 'staff');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c065-000000000003';
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
-- A booking to settle, and a paid pay link and a test-mode one.
set local role service_role;
insert into res select 'bk', public.book_time((select v from t where k = 'biz'), (select id from public.business_services where business_id = (select v from t where k = 'biz')),
  (((now() at time zone 'Africa/Lagos')::date + 2) + time '10:00') at time zone 'Africa/Lagos', 'Ada', '+2348030650001', false, null);
reset role;
insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, subaccount_code, paystack_mode, status, paid_kobo, paid_at)
values ((select v from t where k = 'biz'), 'paylink065', 500000, 'Balance', 'Bisi', 'ACCT_x', 'live', 'paid', 500000, now()),
       ((select v from t where k = 'biz'), 'paylinkt65', 700000, 'Test', 'Test', 'ACCT_x', 'test', 'paid', 700000, now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  bk uuid := ((select v from res where k = 'bk') ->> 'id')::uuid;
  s1 uuid;
  s2 uuid;
  l jsonb;
begin
  -- A walk-in paying part: the rest is owed.
  s1 := public.record_sale(biz, 'Chi', 'Cornrows', 1500000, 1000000, 'cash', null, '+2348030650002');
  -- A booked customer paying all of it; the booking's number comes with it.
  s2 := public.record_sale(biz, 'Ada', 'Braids', 2000000, 2000000, 'transfer', bk, null);
  assert public.record_sale(biz, 'Ada', 'Braids', 2000000, 2000000, 'transfer', bk, null) = s2, 'a booking is settled once';
  -- Paying more than the total counts only the total (checked below).
  perform public.record_sale(biz, 'Dayo', 'Wash', 300000, 900000, 'card', null, '+2348030650003');
  begin
    perform public.record_sale(biz, 'Eze', 'X', 100, 100, 'pay_link', null, null);
    assert false, 'pay links are never recorded by hand';
  exception when check_violation then null;
  end;

  -- Paying the balance: part, then the rest, never more than owed.
  assert public.pay_balance(biz, s1, 200000, 'transfer'), 'part paid';
  assert public.pay_balance(biz, s1, 900000, 'cash'), 'the rest';
  assert not public.pay_balance(biz, gen_random_uuid(), 100, 'cash'), 'unknown sale';

  -- Expenses: once, and every week.
  assert public.add_expense(biz, 'Products', 320000, null), 'once';
  assert public.add_expense(biz, 'Helper', 500000, 'week'), 'every week';
  assert not public.add_expense(biz, 'Data', 0, null), 'nothing spent';
  begin
    perform public.add_expense(biz, 'Holiday', 100, null);
    assert false, 'only the listed kinds';
  exception when check_violation then null;
  end;

  -- The ledger: three sales with payments, the expense, the regular cost, the live pay link only.
  l := public.get_ledger(biz);
  assert jsonb_array_length(l -> 'sales') = 3 and jsonb_array_length(l -> 'expenses') = 1 and jsonb_array_length(l -> 'regular') = 1, 'ledger: ' || l::text;
  assert jsonb_array_length(l -> 'pay_links') = 1 and (l -> 'pay_links' -> 0 ->> 'kobo')::int = 500000, 'live paid pay links only';

  -- A booking of another business can't be settled here.
  begin
    perform public.record_sale((select v from t where k = 'other'), 'X', 'Y', 100, 100, 'cash', null, null);
    assert false, 'not the owner of the other business';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert (select phone from public.sales where business_id = biz and name = 'Ada') = '+2348030650001', 'the booking''s number';
  assert (select sum(p.kobo) from public.sale_payments p join public.sales x on x.id = p.sale_id where x.business_id = biz and x.name = 'Dayo') = 300000, 'never more than the total';
  assert (select sum(p.kobo) from public.sale_payments p join public.sales x on x.id = p.sale_id where x.business_id = biz and x.name = 'Chi') = 1500000, 'balance paid in full, no more';
  insert into t select 's1', id from public.sales where business_id = biz and name = 'Chi';
  insert into t select 's2', id from public.sales where business_id = biz and name = 'Ada';
end $$;

-- Receipts: one link and number per sale; the page never shows the number.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r1 text := public.receipt_for(biz, (select v from t where k = 's1'));
  r2 text := public.receipt_for(biz, (select v from t where k = 's2'));
begin
  assert r1 ~ '^rc-[A-Za-z0-9_-]{12}$' and r2 <> r1, 'receipt links: ' || r1;
  assert public.receipt_for(biz, (select v from t where k = 's1')) = r1, 'the same link every time';
  insert into res values ('r2', to_jsonb(r2));
end $$;
reset role;
do $$
begin
  assert (select receipt_n from public.sales where id = (select v from t where k = 's1')) = 1
     and (select receipt_n from public.sales where id = (select v from t where k = 's2')) = 2, 'numbered in order';
end $$;
set local role service_role;
insert into res select 'page', public.receipt_page((select v #>> '{}' from res where k = 'r2'));
reset role;
do $$
declare p jsonb := (select v from res where k = 'page');
begin
  assert p -> 'sale' ->> 'item' = 'Braids' and jsonb_array_length(p -> 'sale' -> 'payments') = 1 and p -> 'booking' ->> 'service' = 'Braids', 'receipt page: ' || p::text;
  assert p::text !~ '\+234', 'never the number';
  assert public.receipt_page('rc-nope') is null, 'unknown link';
end $$;

-- Staff and strangers see nothing and record nothing; no direct reads.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.get_ledger((select v from t where k = 'biz'));
    assert false, 'staff must not see the ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_sale((select v from t where k = 'biz'), 'X', 'Y', 100, 100, 'cash', null, null);
    assert false, 'staff must not record sales';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.sales;
    assert false, 'no direct reads';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.receipt_page('rc-aaaaaaaaaaaa');
    assert false, 'the receipt page goes through the server';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Privacy: the lookup shows sales; forgetting keeps the amounts, drops the name and number.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c065-000000000003","role":"authenticated"}', true);
insert into res select 'lookup', public.admin_person_lookup('+2348030650002');
insert into res select 'forget', public.admin_forget_person('+2348030650002');
reset role;
do $$
declare s public.sales := (select x from public.sales x where business_id = (select v from t where k = 'biz') and item = 'Cornrows');
begin
  assert jsonb_array_length((select v from res where k = 'lookup') -> 'sales') = 1, 'lookup shows the sale';
  assert ((select v from res where k = 'forget') ->> 'sales')::int = 1, 'forget counts it';
  assert s.phone is null and s.name = 'Customer' and s.total_kobo = 1500000, 'amounts kept, name and number gone';
  assert (select sum(kobo) from public.sale_payments where sale_id = s.id) = 1500000, 'payments kept';
end $$;

rollback;
