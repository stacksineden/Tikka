-- Launch week: Tikka admins see where each real business is with the new version; everyone else is
-- refused; demo businesses are left out.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c078-000000000001', 'owner78@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c078-000000000002', 'admin78@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c078-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c078-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Launch Week', 'launchweek78', 'LW', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
do $$
begin
  begin
    perform public.admin_launch_week();
    assert false, 'owners must not see launch week';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.businesses set trades = array['hair'], work_place = 'shop', booking_rules = array['Move with 24 hours'' notice']
where id = (select v from t where k = 'biz');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c078-000000000002","role":"authenticated"}', true);
do $$
declare r jsonb := (select x from jsonb_array_elements(public.admin_launch_week()) x where x ->> 'slug' = 'launchweek78');
begin
  assert r is not null, 'the business is listed';
  assert (r ->> 'setup_done')::boolean and not (r ->> 'listed')::boolean and (r ->> 'services')::int = 1 and (r ->> 'space_photos')::int = 0,
    'setup done, not listed, one service, no space photos: ' || r::text;
  assert not exists (select 1 from jsonb_array_elements(public.admin_launch_week()) x join public.businesses b on b.id = (x ->> 'id')::uuid where b.is_demo),
    'demo businesses left out';
end $$;
reset role;

rollback;
