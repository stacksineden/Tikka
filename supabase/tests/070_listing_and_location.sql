-- Your Tikka listing: owners place a pin (exact) or the server sets a starting one (approximate,
-- never over the owner's); a business can leave Tikka's search; up to 6 space photos from the
-- owner's own folder; anyone can see them; the daily clean-up keeps them; staff can't change any of it.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c070-000000000001', 'owner70@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c070-000000000002', 'staff70@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Pin Studio', 'pinstudio70', 'PQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Silk press","price_kobo":900000,"price_kind":"fixed","minutes":60}]');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c070-000000000002', 'staff');

-- Listed by default, no pin yet.
do $$
declare b public.businesses := (select x from public.businesses x where id = (select v from t where k = 'biz'));
begin
  assert b.listed and b.lat is null and b.location_approx, 'listed, no pin, approximate by default';
end $$;

-- The server's starting pin is approximate.
set local role service_role;
do $$ begin assert public.set_approx_location((select v from t where k = 'biz'), 7.42, 3.91), 'starting pin set'; end $$;
reset role;
do $$ begin assert (select location_approx and lat = 7.42 from public.businesses where id = (select v from t where k = 'biz')), 'approximate pin'; end $$;

-- The owner places it: exact. The server never moves it after that.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000001","role":"authenticated"}', true);
do $$
begin
  assert public.save_location((select v from t where k = 'biz'), 7.43678, 3.90512), 'owner pin';
  begin
    perform public.save_location((select v from t where k = 'biz'), 51.5, -0.1);
    assert false, 'a pin outside Nigeria';
  exception when check_violation then null;
  end;
end $$;
reset role;
set local role service_role;
do $$ begin assert public.set_approx_location((select v from t where k = 'biz'), 7.0, 3.0) is null, 'never over the owner''s pin'; end $$;
reset role;
do $$ begin assert (select not location_approx and lat = 7.43678 and lng = 3.90512 from public.businesses where id = (select v from t where k = 'biz')), 'owner pin kept'; end $$;

-- Search returns the pin; leaving the search hides the business.
set local role anon;
insert into res select 'in', public.search_businesses(p_place => 'Bodija, Ibadan');
reset role;
do $$
declare c jsonb := (select x from jsonb_array_elements((select v from res where k = 'in')) x where x ->> 'slug' = 'pinstudio70');
begin
  assert c is not null and (c ->> 'lat')::numeric = 7.43678 and not (c ->> 'location_approx')::boolean, 'pin in search: ' || coalesce(c::text, 'none');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000001","role":"authenticated"}', true);
update public.businesses set listed = false where id = (select v from t where k = 'biz');
reset role;
set local role anon;
do $$
begin
  assert not exists (select 1 from jsonb_array_elements(public.search_businesses(p_place => 'Bodija, Ibadan')) x where x ->> 'slug' = 'pinstudio70'), 'not listed: not in search';
end $$;
reset role;

-- Space photos: the owner's own folder, up to 6; anyone can see them; staff can't change them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  mine text := 'images/00000000-0000-4000-c070-000000000001/space/';
begin
  assert public.save_space_photos(biz, jsonb_build_array(
    jsonb_build_object('image_path', mine || 'a.s.webp', 'thumb_path', mine || 'a.s-sm.webp'),
    jsonb_build_object('image_path', mine || 'b.s.webp'))) = 2, 'two photos';
  begin
    perform public.save_space_photos(biz, jsonb_build_array(jsonb_build_object('image_path', 'images/someone-else/space/x.webp')));
    assert false, 'someone else''s photo';
  exception when check_violation then null;
  end;
  begin
    perform public.save_space_photos(biz, (select jsonb_agg(jsonb_build_object('image_path', mine || i || '.webp')) from generate_series(1, 7) i));
    assert false, 'seven photos';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.save_space_photos((select v from t where k = 'biz'), '[]');
    assert false, 'staff must not change the listing';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_location((select v from t where k = 'biz'), 7.4, 3.9);
    assert false, 'staff must not move the pin';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  assert (select count(*) from public.business_space_photos where business_id = (select v from t where k = 'biz')) = 2, 'anyone sees space photos';
end $$;
reset role;

-- Back in search, the card leads with the first space photo (its small copy).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c070-000000000001","role":"authenticated"}', true);
update public.businesses set listed = true where id = (select v from t where k = 'biz');
reset role;
set local role anon;
do $$
declare c jsonb := (select x from jsonb_array_elements(public.search_businesses(p_place => 'Bodija, Ibadan')) x where x ->> 'slug' = 'pinstudio70');
begin
  assert c ->> 'cover_path' = 'images/00000000-0000-4000-c070-000000000001/space/a.s-sm.webp', 'space photo leads the card: ' || coalesce(c ->> 'cover_path', 'none');
end $$;
reset role;

rollback;
