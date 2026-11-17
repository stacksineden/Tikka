-- "Coming soon: payments and deposits": owners join in one tap (twice changes nothing), hide the
-- dashboard card, staff can't do either, admin sees who joined. Spark's list stays separate.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c042-000000000001', 'owner42@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c042-000000000002', 'staff42@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c042-000000000003', 'admin42@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c042-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c042-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Deposit Keen', 'depositkeen42', 'DK', 'Beauty', 'Rivers', 'Port Harcourt', 'GRA', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) values ((select v from t where k = 'biz'), '00000000-0000-4000-c042-000000000002', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c042-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  s record;
begin
  select * into s from public.early_access_state(biz, 'payments');
  assert not s.on_list and s.dismissed = '{}', 'not on the list yet';
  assert public.join_early_access('payments', biz), 'joined';
  assert public.join_early_access('payments', biz), 'twice changes nothing';
  perform public.dismiss_teaser(biz, 'payments_dashboard');
  select * into s from public.early_access_state(biz, 'payments');
  assert s.on_list and s.dismissed = '{payments_dashboard}', 'on the list, card hidden: ' || s::text;
  select * into s from public.early_access_state(biz, 'spark');
  assert not s.on_list, 'Spark''s list is separate';
  begin
    perform public.join_early_access('plus', biz);
    raise exception 'joined a feature that isn''t there';
  exception when check_violation then null;
  end;
end $$;

-- Staff see it but can't join or hide.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c042-000000000002","role":"authenticated"}', true);
do $$
declare s record;
begin
  select * into s from public.early_access_state((select v from t where k = 'biz'), 'payments');
  assert s.on_list, 'staff can read it';
  begin
    perform public.join_early_access('payments', (select v from t where k = 'biz'));
    raise exception 'staff joined';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Admin sees who joined.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c042-000000000003","role":"authenticated"}', true);
do $$
declare j jsonb := public.admin_early_access('payments');
begin
  assert exists (select 1 from jsonb_array_elements(j -> 'list') x where x ->> 'business_name' = 'Deposit Keen'), 'admin sees the business: ' || j::text;
end $$;
reset role;

set local role anon;
do $$ begin
  perform public.early_access_state((select v from t where k = 'biz'), 'payments');
  raise exception 'a visitor read it';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
