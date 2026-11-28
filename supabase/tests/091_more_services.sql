-- No real limit on services: 40 save fine, 101 don't (the safety cap).
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c091-000000000001', 'owner91@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c091-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Many Services', 'manyservices91', 'MS', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');

do $$
declare
  biz uuid := (select v from t where k = 'biz');
begin
  assert public.save_services(biz, (select jsonb_agg(jsonb_build_object('name', 'S' || g, 'group_name', case when g <= 20 then 'Bridal' else 'Makeup' end, 'price_kobo', 1000000, 'price_kind', 'fixed')) from generate_series(1, 40) g)) = 40, '40 services';
  assert (select count(distinct group_name) from public.business_services where business_id = biz) = 2, 'in two groups';
  begin
    perform public.save_services(biz, (select jsonb_agg(jsonb_build_object('name', 'S' || g, 'price_kind', 'ask')) from generate_series(1, 101) g));
    raise exception '101 services';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.business_services where business_id = biz) = 40, 'a refused save keeps the 40';
end $$;

rollback;
