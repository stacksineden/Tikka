-- The waitlist (docs/DB_MOVE.md step 3): customers join through the server, once per number per
-- day; only the owner reads it (rule 4) and removes entries; it makes no lead; the privacy lookup
-- shows it and forgetting a person deletes it.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c064-000000000001', 'owner64@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c064-000000000002', 'staff64@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c064-000000000003', 'admin64@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c064-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Waitlist', 'waitlist64', 'WQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":2000000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 60, 30, '{}');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c064-000000000002', 'staff');
insert into t select 'braids', id from public.business_services where business_id = (select v from t where k = 'biz');
-- Open every day, so the test doesn't depend on which weekday it runs.
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c064-000000000003';

create function pg_temp.day(p int) returns date language sql as $$ select (now() at time zone 'Africa/Lagos')::date + p $$;
create function pg_temp.join(p_day date, p_name text, p_phone text) returns text language sql as $$
  select public.join_waitlist((select v from t where k = 'biz'), (select v from t where k = 'braids'), p_day, p_name, p_phone, 'v64') ->> 'kind';
$$;
grant execute on function pg_temp.day(int), pg_temp.join(date, text, text) to anon, authenticated, service_role;

-- Customers can't join directly; the server can.
set local role anon;
do $$
begin
  begin
    perform public.join_waitlist((select v from t where k = 'biz'), (select v from t where k = 'braids'), pg_temp.day(2), 'Ada', '+2348030640001', null);
    assert false, 'anon must not call join_waitlist';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
begin
  assert pg_temp.join(pg_temp.day(2), 'Ada', '+2348030640001') = 'joined', 'joined';
  assert pg_temp.join(pg_temp.day(2), 'Ada', '+2348030640001') = 'joined', 'joining again is fine';
  assert pg_temp.join(pg_temp.day(2), 'Bisi', '+2348030640002') = 'joined', 'someone else, same day';
  assert pg_temp.join(pg_temp.day(3), 'Ada', '+2348030640001') = 'joined', 'same number, another day';
  assert pg_temp.join(pg_temp.day(-1), 'Ada', '+2348030640001') = 'closed', 'not a past day';
  assert pg_temp.join(pg_temp.day(31), 'Ada', '+2348030640001') = 'closed', 'not beyond how far ahead';
  assert pg_temp.join(pg_temp.day(2), ' ', '+2348030640003') = 'bad_name', 'a name';
  assert pg_temp.join(pg_temp.day(2), 'Chi', '0803') = 'bad_phone', 'a number';
  assert public.join_waitlist((select v from t where k = 'biz'), gen_random_uuid(), pg_temp.day(2), 'Chi', '+2348030640003', null) ->> 'kind' = 'not_found', 'a service of this business';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.booking_waitlist where business_id = (select v from t where k = 'biz')) = 3, 'one entry per number per day';
  assert not exists (select 1 from public.leads where business_id = (select v from t where k = 'biz')), 'no lead';
  assert (select service_name from public.booking_waitlist where phone = '+2348030640002') = 'Braids', 'the service name kept';
end $$;

-- A day the business is closed: no joining (closed every day here).
update public.businesses set hours = '{"weekdays":{"open":false,"from":"09:00","to":"18:00"},"saturday":{"open":false,"from":"09:00","to":"18:00"},"sunday":{"open":false,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
set local role service_role;
do $$ begin assert pg_temp.join(pg_temp.day(4), 'Chi', '+2348030640003') = 'closed', 'a closed day'; end $$;
reset role;
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');

-- Bookings off: no joining.
update public.booking_settings set enabled = false where business_id = (select v from t where k = 'biz');
set local role service_role;
do $$ begin assert pg_temp.join(pg_temp.day(4), 'Chi', '+2348030640003') = 'off', 'bookings off'; end $$;
reset role;
update public.booking_settings set enabled = true where business_id = (select v from t where k = 'biz');

-- The owner reads and removes; staff can't do either; strangers can't.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c064-000000000001","role":"authenticated"}', true);
insert into res select 'owner', public.get_waitlist((select v from t where k = 'biz'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c064-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.get_waitlist((select v from t where k = 'biz'));
    assert false, 'staff must not see the waitlist';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_waitlist((select v from t where k = 'biz'), (select id from public.booking_waitlist limit 1));
    assert false, 'staff must not remove entries';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$
begin
  perform 1 from public.booking_waitlist;
  assert false, 'no direct reads';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c064-000000000001","role":"authenticated"}', true);
do $$
declare
  w jsonb := (select v from res where k = 'owner');
begin
  assert jsonb_array_length(w) = 3 and w -> 0 ->> 'day' = pg_temp.day(2)::text and w::text ~ '\+2348030640001', 'the owner sees all, soonest first: ' || w::text;
  assert public.remove_waitlist((select v from t where k = 'biz'), ((w -> 1) ->> 'id')::uuid), 'removed';
  assert jsonb_array_length(public.get_waitlist((select v from t where k = 'biz'))) = 2, 'two left';
end $$;
reset role;

-- Old entries go: one left 31 days past its day is tidied on the next join.
insert into public.booking_waitlist (business_id, day, service_name, first_name, phone)
values ((select v from t where k = 'biz'), pg_temp.day(-31), 'Braids', 'Old', '+2348030640009');
set local role service_role;
do $$ begin assert pg_temp.join(pg_temp.day(5), 'Dayo', '+2348030640004') = 'joined', 'joined'; end $$;
reset role;
do $$ begin assert not exists (select 1 from public.booking_waitlist where phone = '+2348030640009'), 'old entry tidied'; end $$;

-- Privacy: the lookup shows it, forgetting deletes it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c064-000000000003","role":"authenticated"}', true);
insert into res select 'lookup', public.admin_person_lookup('+2348030640001');
insert into res select 'forget', public.admin_forget_person('+2348030640001');
reset role;
do $$
begin
  assert jsonb_array_length((select v from res where k = 'lookup') -> 'waitlist') >= 1, 'lookup shows the waitlist: ' || (select v from res where k = 'lookup')::text;
  assert ((select v from res where k = 'forget') ->> 'waitlist')::int >= 1, 'forget counts it';
  assert not exists (select 1 from public.booking_waitlist where phone = '+2348030640001'), 'forgotten';
  assert exists (select 1 from public.booking_waitlist where phone = '+2348030640004'), 'others kept';
end $$;

rollback;
