-- Paying an old pay link (or finishing a deposit) follows the payment rule: after a business's grace
-- period ends without an approved ID, its checkouts say payments aren't ok.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c058-000000000001', 'owner58@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c058-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Old Link', 'oldlink58', 'OL', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
update public.businesses set verified = true where id = (select v from t where k = 'biz');
insert into public.business_payments (business_id, enabled, max_kobo, kyc_grace_until)
values ((select v from t where k = 'biz'), true, 2000000, now() + interval '7 days');
select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c058-000000000001', '058', 'GTBank', '6047', 'ADA OBI', 'ACCT_oldlink58', 'live');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c058-000000000001","role":"authenticated"}', true);
select public.create_pay_link((select v from t where k = 'biz'), 500000, 'Braids balance', 'Bisi', null, 'live');
reset role;

do $$
declare tok text := (select token from public.pay_links where business_id = (select v from t where k = 'biz') limit 1);
begin
  assert tok is not null, 'the link was made during the grace period';
  assert (public.pay_link_checkout(tok) ->> 'payments_ok')::boolean, 'payable before the deadline';
  update public.business_payments set kyc_grace_until = now() - interval '1 minute' where business_id = (select v from t where k = 'biz');
  assert not (public.pay_link_checkout(tok) ->> 'payments_ok')::boolean, 'not payable once paused';
end $$;

rollback;
