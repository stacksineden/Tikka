-- Only businesses that take bookings show in Tikka's search: listed and accepted, but bookings off
-- (or paused) means out of search, and the owner's checklist says so; switching them on brings the
-- business back.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c079-000000000001', 'owner79@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c079-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Bookings Off', 'bookingsoff79', 'BO', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
reset role;
update public.businesses set listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26', work_place = 'home'
where id = (select v from t where k = 'biz');

create function pg_temp.found() returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48)) x where x ->> 'slug' = 'bookingsoff79');
$$;
grant execute on function pg_temp.found() to anon, authenticated, service_role;

set local role anon;
do $$ begin assert not pg_temp.found(), 'no bookings set up: not in search'; end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c079-000000000001","role":"authenticated"}', true);
do $$
begin
  assert public.listing_state((select v from t where k = 'biz')) -> 'missing' ? 'bookings_off', 'the checklist asks for bookings on';
  assert public.accept_listing((select v from t where k = 'biz'), '2026-11-26') ->> 'kind' = 'missing', 'listing needs bookings on';
end $$;
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
reset role;

set local role anon;
do $$ begin assert pg_temp.found(), 'bookings on: in search'; end $$;
reset role;

update public.booking_settings set enabled = false where business_id = (select v from t where k = 'biz');
set local role anon;
do $$ begin assert not pg_temp.found(), 'bookings paused: out of search again'; end $$;
reset role;

rollback;
