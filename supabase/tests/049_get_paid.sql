-- Get paid: only a Verified business with payments switched on by Tikka admin can save an account;
-- only its owner; the account number never stored (last 4 only); staff and outsiders see nothing;
-- changing the account returns the old subaccount; removing returns it too.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c049-000000000001', 'owner49@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c049-000000000002', 'staff49@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c049-000000000003', 'admin49@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c049-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Get Paid', 'getpaid49', 'GP', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c049-000000000002', 'staff');

create function pg_temp.save(p_sub text) returns text language sql as $$
  select public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c049-000000000001', '058', 'GTBank', '6047', 'ADA OBI', p_sub) ->> 'kind';
$$;

-- Not switched on yet, then not Verified: nothing saves.
do $$
begin
  assert pg_temp.save('ACCT_one') = 'not_enabled', 'off until admin switches it on';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_set_payments((select v from t where k = 'biz'), true, 5000000);
    assert false, 'owners can''t switch payments on';
  exception when others then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000003","role":"authenticated"}', true);
select public.admin_set_payments((select v from t where k = 'biz'), true, 5000000);
reset role;

do $$
begin
  assert pg_temp.save('ACCT_one') = 'not_verified', 'Verified businesses only';
end $$;
update public.businesses set verified = true where id = (select v from t where k = 'biz');

do $$
declare
  r jsonb;
begin
  -- Staff can't save through the server either.
  begin
    perform public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c049-000000000002', '058', 'GTBank', '6047', 'ADA OBI', 'ACCT_x');
    assert false, 'staff must not save an account';
  exception when insufficient_privilege then null;
  end;
  assert pg_temp.save('ACCT_one') = 'saved', 'saved';
  r := public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c049-000000000001', '044', 'Access Bank', '1234', 'ADA OBI', 'ACCT_two');
  assert r ->> 'kind' = 'saved' and r ->> 'replaced' = 'ACCT_one', 'changing returns the old subaccount: ' || r::text;
  begin
    perform public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c049-000000000001', '044', 'Access Bank', '123456', 'ADA OBI', 'ACCT_three');
    assert false, 'only the last 4 digits are kept';
  exception when check_violation then null;
  end;
end $$;

-- The owner sees it; staff and the public can't.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000001","role":"authenticated"}', true);
do $$
declare
  s jsonb := public.payout_state((select v from t where k = 'biz'));
begin
  assert s -> 'problem' = 'null'::jsonb and (s ->> 'max_kobo')::int = 5000000, 'open, ₦50,000 max: ' || s::text;
  assert s -> 'payout' ->> 'bank_name' = 'Access Bank' and s -> 'payout' ->> 'last4' = '1234', 'the account';
  assert s::text !~ 'ACCT_', 'the subaccount code stays on the server';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.payout_state((select v from t where k = 'biz'));
    assert false, 'staff see nothing';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_payout((select v from t where k = 'biz'));
    assert false, 'staff can''t remove it';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.business_payouts;
    assert false, 'no direct reads';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Admin sees the settings; the owner removes the account.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000003","role":"authenticated"}', true);
do $$
declare
  a jsonb := public.admin_payment_settings() -> ((select v from t where k = 'biz')::text);
begin
  assert (a ->> 'enabled')::boolean and a ->> 'last4' = '1234', 'admin sees it: ' || coalesce(a::text, 'null');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c049-000000000001","role":"authenticated"}', true);
do $$
declare
  r jsonb := public.remove_payout((select v from t where k = 'biz'));
begin
  assert r ->> 'kind' = 'removed' and r ->> 'subaccount' = 'ACCT_two', 'removed: ' || r::text;
  assert public.payout_state((select v from t where k = 'biz')) -> 'payout' = 'null'::jsonb, 'gone';
end $$;

-- Switched off again: the owner can't add one.
reset role;
update public.business_payments set enabled = false where business_id = (select v from t where k = 'biz');
do $$
begin
  assert pg_temp.save('ACCT_four') = 'not_enabled', 'off again';
end $$;

rollback;
