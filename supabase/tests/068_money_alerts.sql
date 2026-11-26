-- The money alerts on real data (docs/DB_MOVE.md step 7): money_alert_data() (server only) gives each
-- business with an owner's phone its ledger, deposits, today's bookings and phones; businesses
-- without a phone, demo ones and staff phones are left out; get_ledger() answers as before.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c068-000000000001', 'owner68@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c068-000000000002', 'staff68@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c068-000000000003', 'quiet68@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c068-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Alerts', 'alerts68', 'AQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.record_sale((select v from t where k = 'biz'), 'Chi', 'Braids', 2000000, 1500000, 'cash', null, '+2348030680001');
select public.add_expense((select v from t where k = 'biz'), 'Transport', 50000, null);
select public.save_push_subscription((select v from t where k = 'biz'), 'https://push.example.com/owner68', 'p256dh-key-for-the-owner-68', 'auth-owner68');
insert into res select 'ledger', public.get_ledger((select v from t where k = 'biz'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c068-000000000003","role":"authenticated"}', true);
insert into t select 'quiet', public.create_business('Quiet', 'quiet68', 'QZ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c068-000000000002', 'staff');
-- A staff member's phone (saved before they were staff, say) never gets the owner's money.
insert into public.push_subscriptions (business_id, user_id, endpoint, p256dh, auth)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c068-000000000002', 'https://push.example.com/staff68', 'p256dh-key-for-the-staff-68', 'auth-staff68');

-- Customers and owners can't call it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c068-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.money_alert_data();
    assert false, 'only the server reads alert data';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
insert into res select 'data', public.money_alert_data();
reset role;
do $$
declare
  all_ jsonb := (select v from res where k = 'data');
  mine jsonb := (select x from jsonb_array_elements(all_) x where x ->> 'business_id' = (select v from t where k = 'biz')::text);
begin
  assert mine is not null, 'the business with an owner''s phone is there';
  assert not exists (select 1 from jsonb_array_elements(all_) x where x ->> 'business_id' = (select v from t where k = 'quiet')::text), 'no phone: left out';
  assert jsonb_array_length(mine -> 'subscriptions') = 1 and mine -> 'subscriptions' -> 0 ->> 'endpoint' = 'https://push.example.com/owner68', 'owner phones only: ' || (mine -> 'subscriptions')::text;
  assert jsonb_array_length(mine -> 'ledger' -> 'sales') = 1 and jsonb_array_length(mine -> 'ledger' -> 'expenses') = 1, 'the ledger';
  assert mine -> 'ledger' = (select v from res where k = 'ledger'), 'the same ledger get_ledger gives the owner';
end $$;

-- Demo businesses never get alerts.
update public.businesses set is_demo = true where id = (select v from t where k = 'biz');
set local role service_role;
do $$
begin
  assert not exists (select 1 from jsonb_array_elements(public.money_alert_data()) x where x ->> 'business_id' = (select v from t where k = 'biz')::text), 'demo: left out';
end $$;
reset role;

rollback;
