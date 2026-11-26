-- Owners remove an expense or stop a regular cost; never another business's; staff can't.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c080-000000000001', 'owner80@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c080-000000000002', 'other80@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c080-000000000003', 'staff80@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c080-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Spend Less', 'spendless80', 'SL', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.add_expense((select v from t where k = 'biz'), 'Products', 320000, null);
select public.add_expense((select v from t where k = 'biz'), 'Rent', 5000000, 'month');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c080-000000000002","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Shop', 'othershop80', 'OS', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into t select 'exp', id from public.expenses where business_id = (select v from t where k = 'biz');
insert into t select 'reg', id from public.regular_costs where business_id = (select v from t where k = 'biz');
insert into public.business_members (business_id, user_id, role) values ((select v from t where k = 'biz'), '00000000-0000-4000-c080-000000000003', 'staff');

set local role authenticated;
-- Another owner can't touch them, even naming their own business.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c080-000000000002","role":"authenticated"}', true);
do $$
begin
  assert not public.remove_expense((select v from t where k = 'other'), (select v from t where k = 'exp')), 'not another business''s expense';
  begin
    perform public.remove_expense((select v from t where k = 'biz'), (select v from t where k = 'exp'));
    assert false, 'not as the other owner';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Staff can't.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c080-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.stop_regular_cost((select v from t where k = 'biz'), (select v from t where k = 'reg'));
    assert false, 'staff must not change money';
  exception when insufficient_privilege then null;
  end;
end $$;
-- The owner can, and the ledger follows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c080-000000000001","role":"authenticated"}', true);
do $$
declare l jsonb;
begin
  assert public.remove_expense((select v from t where k = 'biz'), (select v from t where k = 'exp')), 'removed';
  assert public.stop_regular_cost((select v from t where k = 'biz'), (select v from t where k = 'reg')), 'stopped';
  assert not public.stop_regular_cost((select v from t where k = 'biz'), (select v from t where k = 'reg')), 'only once';
  l := public.get_ledger((select v from t where k = 'biz'));
  assert jsonb_array_length(l -> 'expenses') = 0 and jsonb_array_length(l -> 'regular') = 0, 'gone from the ledger: ' || l::text;
end $$;
reset role;

rollback;
