-- Pay links that settle a balance (docs/DB_MOVE.md step 6): a link for a sale lands on that sale
-- when paid; any other paid link becomes a sale of its own; both get a receipt the pay page links
-- to; Money never counts them twice; the 6-argument create_pay_link() still works; staff can't make
-- links; forgetting a person clears their name and number on links.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c067-000000000001', 'owner67@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c067-000000000002', 'staff67@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c067-000000000003', 'admin67@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c067-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Links', 'links67', 'LQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c067-000000000002', 'staff');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c067-000000000003';
update public.businesses set verified = true where id = (select v from t where k = 'biz');
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c067-000000000001/kyc/id.webp', 'no', 'approved', now());
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 5000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c067-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_links67', 'live');

-- The owner records a sale with ₦5,000 owed, and sends links: for the balance, and for something else.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c067-000000000001","role":"authenticated"}', true);
insert into t select 'sale', public.record_sale((select v from t where k = 'biz'), 'Chi', 'Braids', 2000000, 1500000, 'cash', null, '+2348030670001');
insert into res select 'bal', public.create_pay_link((select v from t where k = 'biz'), 500000, 'Balance for braids', 'ignored', null, 'live', (select v from t where k = 'sale'), null);
insert into res select 'other', public.create_pay_link((select v from t where k = 'biz'), 300000, 'Wig wash', 'Dayo', null, 'live', null, '+2348030670002');
insert into res select 'old', public.create_pay_link((select v from t where k = 'biz'), 200000, 'Old way', 'Eze', null, 'live');
do $$
begin
  assert (select v from res where k = 'bal') ->> 'kind' = 'created' and (select v from res where k = 'other') ->> 'kind' = 'created', 'created';
  assert (select v from res where k = 'old') ->> 'kind' = 'created', 'the 6-argument version still works';
  assert public.create_pay_link((select v from t where k = 'biz'), 300000, 'X', 'Y', null, 'live', null, '0803') ->> 'kind' = 'bad_phone', 'a real number';
  assert public.create_pay_link((select v from t where k = 'biz'), 300000, 'X', 'Y', null, 'live', gen_random_uuid(), null) ->> 'kind' = 'not_found', 'a sale of this business';
end $$;
reset role;
do $$
declare
  b public.pay_links := (select x from public.pay_links x where token = (select v from res where k = 'bal') ->> 'token');
  o public.pay_links := (select x from public.pay_links x where token = (select v from res where k = 'other') ->> 'token');
begin
  assert b.sale_id = (select v from t where k = 'sale') and b.customer_name = 'Chi' and b.phone = '+2348030670001', 'the balance link: sale, name and number: ' || row_to_json(b)::text;
  assert o.sale_id is null and o.phone = '+2348030670002' and o.customer_name = 'Dayo', 'the other link: its number';
end $$;

-- Staff can't make links.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c067-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.create_pay_link((select v from t where k = 'biz'), 300000, 'X', 'Y', null, 'live', null, null);
    assert false, 'staff must not make pay links';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Paystack confirms both (and the old one).
set local role service_role;
insert into res select 'pay_bal', public.complete_pay_link('pl_' || ((select v from res where k = 'bal') ->> 'token') || '_1', 500000, 7500, 'chi@example.com');
insert into res select 'pay_other', public.complete_pay_link('pl_' || ((select v from res where k = 'other') ->> 'token') || '_1', 300000, 4500, null);
insert into res select 'again', public.complete_pay_link('pl_' || ((select v from res where k = 'bal') ->> 'token') || '_2', 500000, 7500, null);
insert into res select 'page', public.pay_link_page((select v from res where k = 'bal') ->> 'token');
reset role;
do $$
declare
  sale uuid := (select v from t where k = 'sale');
  o public.pay_links := (select x from public.pay_links x where token = (select v from res where k = 'other') ->> 'token');
begin
  assert (select v from res where k = 'pay_bal') ->> 'kind' = 'paid' and (select v from res where k = 'again') ->> 'kind' = 'already_paid', 'paid once';
  assert (select sum(kobo) from public.sale_payments where sale_id = sale) = 2000000, 'the balance is settled';
  assert exists (select 1 from public.sale_payments where sale_id = sale and method = 'pay_link' and kobo = 500000), 'a pay link payment';
  assert (select receipt_token from public.sales where id = sale) is not null, 'the sale got its receipt';
  assert (select v from res where k = 'page') ->> 'receipt_token' = (select receipt_token from public.sales where id = sale), 'the pay page links to it';
  -- The other link became a sale of its own, with the number and a receipt.
  assert o.sale_id is not null and (select item from public.sales where id = o.sale_id) = 'Wig wash'
     and (select phone from public.sales where id = o.sale_id) = '+2348030670002'
     and (select total_kobo from public.sales where id = o.sale_id) = 300000
     and (select receipt_token from public.sales where id = o.sale_id) is not null, 'a sale of its own';
end $$;

-- Money: each payment once (in sales); paid links are only listed apart when they have no sale.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c067-000000000001","role":"authenticated"}', true);
insert into res select 'ledger', public.get_ledger((select v from t where k = 'biz'));
insert into res select 'links', public.get_pay_links((select v from t where k = 'biz'));
reset role;
do $$
declare
  l jsonb := (select v from res where k = 'ledger');
  p jsonb := (select v from res where k = 'links');
begin
  assert jsonb_array_length(l -> 'pay_links') = 0, 'no paid link counted apart: ' || (l -> 'pay_links')::text;
  assert jsonb_array_length(l -> 'sales') = 2, 'two sales';
  assert (select count(*) from jsonb_array_elements(p) x where x ->> 'receipt_token' is not null) = 2, 'links show their receipts';
end $$;

-- Privacy: forgetting Dayo clears the name and number on the link, the amounts stay.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c067-000000000003","role":"authenticated"}', true);
insert into res select 'lookup', public.admin_person_lookup('+2348030670002');
select public.admin_forget_person('+2348030670002');
reset role;
do $$
declare o public.pay_links := (select x from public.pay_links x where token = (select v from res where k = 'other') ->> 'token');
begin
  assert jsonb_array_length((select v from res where k = 'lookup') -> 'payments') = 1, 'the lookup finds the link';
  assert o.phone is null and o.customer_name is null and o.paid_kobo = 300000, 'name and number gone, amount kept';
end $$;

rollback;
