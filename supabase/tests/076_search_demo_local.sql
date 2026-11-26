-- Demo businesses stay out of search for everyone, even a visitor who asks for them; only the
-- server's own key (local development) sees them when it asks.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c076-000000000001', 'demo76@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c076-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Demo Seventy Six', 'demoshop76', 'DS', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
reset role;
update public.businesses set is_demo = true, listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26'
where id = (select v from t where k = 'biz');

create function pg_temp.found(p_demo boolean) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48, p_include_demo => p_demo)) x where x ->> 'slug' = 'demoshop76');
$$;
grant execute on function pg_temp.found(boolean) to anon, authenticated, service_role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin assert not pg_temp.found(false) and not pg_temp.found(true), 'visitors never see demo businesses, even asking'; end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin assert not pg_temp.found(false), 'not unless the server asks'; end $$;
do $$ begin assert pg_temp.found(true), 'the server sees them when it asks (local development)'; end $$;
reset role;

rollback;
