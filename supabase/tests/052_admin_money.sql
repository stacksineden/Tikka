-- Pilot controls: admin only; live payments count towards the Starter total, test ones apart; a
-- business with payments on shows what it took.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c052-000000000001', 'owner52@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c052-000000000002', 'admin52@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c052-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c052-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Admin Money', 'adminmoney52', 'AM', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
update public.businesses set verified = true where id = (select v from t where k = 'biz');
-- Payments need the owner's ID approved (057).
insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, status, reviewed_at)
values ((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c052-000000000001/kyc/id.webp', 'no', 'approved', now());
insert into public.business_payments (business_id, enabled, max_kobo) values ((select v from t where k = 'biz'), true, 5000000);
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c052-000000000001', '033', 'UBA', '9526', 'ADA OBI', 'ACCT_adminmoney52', 'live');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c052-000000000002","role":"authenticated"}', true);
insert into res values ('before', public.admin_money() - 'businesses'::text);

-- A live pay link and a test one, both paid.
insert into public.pay_links (business_id, token, amount_kobo, note, subaccount_code, paystack_mode, status, paid_kobo, fee_kobo, tikka_kobo, paid_at)
values ((select v from t where k = 'biz'), 'adminmon52', 1000000, 'Live job', 'ACCT_adminmoney52', 'live', 'paid', 1000000, 250, 10000, now()),
       ((select v from t where k = 'biz'), 'adminmon5t', 500000, 'Test job', 'ACCT_adminmoney52', 'test', 'paid', 500000, 175, 5000, now());

-- The owner can't read it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c052-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_money();
    assert false, 'admins only';
  exception when others then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c052-000000000002","role":"authenticated"}', true);
do $$
declare
  m jsonb := public.admin_money();
  b jsonb := (select v from jsonb_array_elements(public.admin_money() -> 'businesses') v where v ->> 'slug' = 'adminmoney52');
  before jsonb := (select v from res where k = 'before');
begin
  assert (m ->> 'pay_links_kobo')::bigint - (before ->> 'pay_links_kobo')::bigint = 1000000, 'only the live ₦10,000 counts';
  assert (m ->> 'test_kobo')::bigint - (before ->> 'test_kobo')::bigint = 500000, 'test shown apart';
  assert (m ->> 'tikka_kobo')::bigint - (before ->> 'tikka_kobo')::bigint = 10000, 'Tikka''s share, live';
  assert (b ->> 'live_kobo')::bigint = 1000000 and (b ->> 'links_paid')::int = 2 and (b ->> 'enabled')::boolean and b ->> 'last4' = '9526', 'the business: ' || coalesce(b::text, 'null');
end $$;
reset role;

rollback;
