-- Search understands what people mean: each word counts on its own (plurals, -ing), words that mean
-- the same thing count as one (glam = makeup), a business doing that kind of work shows as related
-- when its services use other words, full matches come first, and "gel" never finds "gele".
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c071-000000000001', 'bridal71@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c071-000000000002', 'mua71@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c071-000000000003', 'gele71@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c071-000000000004', 'nails71@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c071-000000000001","role":"authenticated"}', true);
insert into t select 'bridal', public.create_business('Dee Faces', 'deefaces71', 'DQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'bridal'), '[{"name":"Traditional bridal glam","price_kobo":5000000,"price_kind":"fixed","minutes":120},{"name":"Knotless braids","price_kobo":1500000,"price_kind":"fixed","minutes":120}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c071-000000000002","role":"authenticated"}', true);
insert into t select 'mua', public.create_business('Marvel Hub', 'marvelhub71', 'MQ', 'Beauty', 'Oyo', 'Ibadan', 'Agodi', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'mua'), '[{"name":"Makeup artistry","price_kobo":2000000,"price_kind":"fixed","minutes":60},{"name":"Hairstyling","price_kobo":1000000,"price_kind":"fixed","minutes":60}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c071-000000000003","role":"authenticated"}', true);
insert into t select 'gele', public.create_business('Wrap Queen', 'wrapqueen71', 'WQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'gele'), '[{"name":"Gele tying","price_kobo":800000,"price_kind":"fixed","minutes":30}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c071-000000000004","role":"authenticated"}', true);
insert into t select 'nails', public.create_business('Tip Top', 'tiptop71', 'TQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'nails'), '[{"name":"Short GelX set","price_kobo":1200000,"price_kind":"fixed","minutes":60}]');
reset role;
-- All of them accepted the listing terms (20261218100000_listing_journey.sql).
update public.businesses set listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26' where id in (select v from t);
-- And take bookings (20261222100000_search_needs_bookings.sql).
insert into public.booking_settings (business_id, enabled) select v, true from t on conflict (business_id) do update set enabled = true;

create function pg_temp.found(r jsonb) returns text[] language sql as $$
  select coalesce(array_agg((x ->> 'slug') || ':' || coalesce(x ->> 'match', '-') order by o), '{}')
  from jsonb_array_elements(r) with ordinality as e(x, o) where x ->> 'slug' like '%71';
$$;
grant execute on function pg_temp.found(jsonb) to anon, authenticated, service_role;

set local role anon;
insert into res select 'bridal makeup', public.search_businesses(p_query => 'bridal makeup', p_place => 'Ibadan');
insert into res select 'soft glam', public.search_businesses(p_query => 'Soft glam', p_place => 'Ibadan');
insert into res select 'braiding', public.search_businesses(p_query => 'braiding');
insert into res select 'gel nails', public.search_businesses(p_query => 'gel nails');
insert into res select 'mua', public.search_businesses(p_query => 'MUA near me');
insert into res select 'services', public.search_businesses(p_query => 'services', p_place => 'Ibadan');
reset role;

do $$
declare f text[];
begin
  f := pg_temp.found((select v from res where k = 'bridal makeup'));
  assert f = array['deefaces71:all', 'marvelhub71:related'], 'bridal makeup finds bridal glam first, makeup artistry as related: ' || f::text;
  f := pg_temp.found((select v from res where k = 'soft glam'));
  assert f @> array['deefaces71:related', 'marvelhub71:related'] and cardinality(f) = 2, 'glam means makeup (nobody says soft): ' || f::text;
  f := pg_temp.found((select v from res where k = 'braiding'));
  assert f[1] = 'deefaces71:all' and 'marvelhub71:related' = any (f), 'braiding finds knotless braids, hairstyling as related: ' || f::text;
  f := pg_temp.found((select v from res where k = 'gel nails'));
  assert f = array['tiptop71:all'], 'gel never finds gele: ' || f::text;
  f := pg_temp.found((select v from res where k = 'mua'));
  assert f @> array['deefaces71:all', 'marvelhub71:all'] and cardinality(f) = 2, 'MUA means makeup; little words don''t count: ' || f::text;
  f := pg_temp.found((select v from res where k = 'services'));
  assert cardinality(f) = 4, 'a search of only little words shows everyone: ' || f::text;
end $$;

rollback;
