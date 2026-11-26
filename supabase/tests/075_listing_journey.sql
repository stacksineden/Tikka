-- Getting listed: new businesses start out of search; accepting needs a space photo (unless they only
-- go to customers) and a priced service; accepted businesses show; businesses listed before keep
-- showing only inside their 14 days; extras come from fixed lists; staff can't list; a booking from
-- the listing page records that Tikka found it, and whether the number was new.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c075-000000000001', 'owner75@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c075-000000000002', 'staff75@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c075-000000000003', 'mobile75@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c075-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('List Me', 'listme75', 'LM', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c075-000000000003","role":"authenticated"}', true);
insert into t select 'mobile', public.create_business('Comes To You', 'comestoyou75', 'CY', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'mobile'), '[{"name":"Home glam","price_kobo":1500000,"price_kind":"fixed","minutes":60}]');
reset role;
update public.businesses set work_place = 'home', travel_reach = 'city', travel_fee_kobo = 0 where id = (select v from t where k = 'mobile');
-- Takes bookings, so it can be listed (20261222100000_search_needs_bookings.sql).
insert into public.booking_settings (business_id, enabled) select v, true from t where k = 'mobile' on conflict (business_id) do update set enabled = true;
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'biz');
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c075-000000000002', 'staff');

create function pg_temp.found(p_slug text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48)) x where x ->> 'slug' = p_slug);
$$;
grant execute on function pg_temp.found(text) to anon, authenticated, service_role;

-- New: not listed, not in search.
set local role anon;
do $$ begin assert not pg_temp.found('listme75'), 'new businesses start out of search'; end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c075-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb;
begin
  assert (public.listing_state(biz) -> 'missing') = '["space_photo"]'::jsonb, 'needs a space photo: ' || public.listing_state(biz)::text;
  r := public.accept_listing(biz, '2026-11-26');
  assert r ->> 'kind' = 'missing', 'refused without a photo: ' || r::text;
  perform public.save_space_photos(biz, jsonb_build_array(jsonb_build_object('image_path', 'images/00000000-0000-4000-c075-000000000001/space/a.s.webp')));
  r := public.accept_listing(biz, '2026-11-26');
  assert r ->> 'kind' = 'listed', 'listed: ' || r::text;
  r := public.listing_state(biz);
  assert (r ->> 'in_search')::boolean and r ->> 'terms_version' = '2026-11-26' and r ->> 'terms_at' is not null, 'terms recorded: ' || r::text;
  perform public.save_listing_extras(biz, array['ac', 'power', 'card', 'spaceship'], array['en', 'yo', 'xx']);
  r := public.listing_state(biz);
  assert r -> 'amenities' = '["ac", "card", "power"]'::jsonb or (r -> 'amenities') @> '["ac", "card", "power"]'::jsonb and jsonb_array_length(r -> 'amenities') = 3, 'only known extras: ' || r::text;
  assert jsonb_array_length(r -> 'languages') = 2, 'only known languages';
end $$;
-- The mobile business needs no space photo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c075-000000000003","role":"authenticated"}', true);
do $$ begin assert public.accept_listing((select v from t where k = 'mobile'), '2026-11-26') ->> 'kind' = 'listed', 'goes to customers: no space photo needed'; end $$;
-- Staff can't list or change extras.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c075-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.accept_listing((select v from t where k = 'biz'), '2026-11-26');
    assert false, 'staff must not list';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_listing_extras((select v from t where k = 'biz'), '{}', '{}');
    assert false, 'staff must not change extras';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$ begin assert pg_temp.found('listme75') and pg_temp.found('comestoyou75'), 'accepted: in search'; end $$;
reset role;

-- Listed before the terms: only inside the 14 days.
update public.businesses set listing_terms_at = null, listing_terms_version = null, listing_grace_until = now() + interval '3 days'
where id = (select v from t where k = 'biz');
set local role anon;
do $$ begin assert pg_temp.found('listme75'), 'inside the 14 days: still in search'; end $$;
reset role;
update public.businesses set listing_grace_until = now() - interval '1 minute' where id = (select v from t where k = 'biz');
set local role anon;
do $$ begin assert not pg_temp.found('listme75'), 'after the 14 days without accepting: out of search'; end $$;
reset role;

-- A booking from the listing page: found by Tikka, new; a second one from the same number isn't new.
set local role service_role;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  svc uuid := (select id from public.business_services where business_id = (select v from t where k = 'biz'));
  d date := (now() at time zone 'Africa/Lagos')::date + 2;
  a jsonb := public.book_time_v2(biz, svc, (d + time '10:00') at time zone 'Africa/Lagos', 'Ada', '+2348075000001', '{}', null, null, null, false, 'v1', 'test', null);
  b jsonb;
begin
  assert a ->> 'kind' = 'booked', 'booked: ' || a::text;
  perform public.note_found_via((a ->> 'id')::uuid);
  assert (select found_via = 'search' and found_new from public.bookings where id = (a ->> 'id')::uuid), 'found by Tikka, a new customer';
  b := public.book_time_v2(biz, svc, (d + time '14:00') at time zone 'Africa/Lagos', 'Ada', '+2348075000001', '{}', null, null, null, false, 'v1', 'test', null);
  perform public.note_found_via((b ->> 'id')::uuid);
  assert (select found_via = 'search' and not found_new from public.bookings where id = (b ->> 'id')::uuid), 'the same number again: not new';
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.note_found_via(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.note_found_via(uuid)', 'execute'), 'note_found_via is server only';
end $$;

rollback;
