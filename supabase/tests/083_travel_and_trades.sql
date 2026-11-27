-- "Anywhere in Nigeria": a business in Ibadan that goes to customers anywhere shows in a search for
-- Lagos; one that only travels in its state doesn't; a shop can't pick it; only the four reaches.
-- A business that never picked a trade shows (and is found under) what its services say: Nails.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c083-000000000001', 'owner83@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c083-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Goes Anywhere', 'goesanywhere83', 'GA', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Bridal makeup","price_kobo":9000000,"price_kind":"fixed","minutes":120}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
reset role;
update public.businesses set listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26', work_place = 'home', travel_reach = 'state', travel_fee_kobo = 500000
where id = (select v from t where k = 'biz');

create function pg_temp.found(p text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.search_businesses(p_place => p, p_limit => 48)) x where x ->> 'slug' = 'goesanywhere83');
$$;
grant execute on function pg_temp.found(text) to anon, authenticated, service_role;

set local role anon;
do $$ begin assert pg_temp.found('Ibadan') and not pg_temp.found('Lagos'), 'anywhere in Oyo: not in Lagos'; end $$;
reset role;

update public.businesses set travel_reach = 'nigeria' where id = (select v from t where k = 'biz');
set local role anon;
do $$ begin assert pg_temp.found('Lagos') and pg_temp.found('Ibadan'), 'anywhere in Nigeria: in Lagos too'; end $$;
reset role;

do $$
begin
  begin
    update public.businesses set travel_reach = 'mars' where id = (select v from t where k = 'biz');
    assert false, 'only the four reaches';
  exception when check_violation then null;
  end;
  begin
    update public.businesses set work_place = 'shop' where id = (select v from t where k = 'biz');
    assert false, 'a shop has no travel reach';
  exception when check_violation then null;
  end;
end $$;

-- No trades picked: nail services make it a nail tech, lashes second.
do $$
declare c jsonb;
begin
  update public.businesses set trades = null, work_place = 'shop', travel_reach = null, travel_fee_kobo = null where id = (select v from t where k = 'biz');
  insert into public.business_services (business_id, name, price_kobo, price_kind, minutes, position)
  values ((select v from t where k = 'biz'), 'Short acrylic nails', 1200000, 'fixed', 60, 1),
         ((select v from t where k = 'biz'), 'Gel X nails', 1500000, 'fixed', 60, 2),
         ((select v from t where k = 'biz'), 'Cluster lash', 800000, 'fixed', 60, 3);
  c := (select x from jsonb_array_elements(public.search_businesses(p_trade => 'nails', p_limit => 48)) x where x ->> 'slug' = 'goesanywhere83');
  assert c is not null, 'found under Nails by its services';
  assert c -> 'trades' ->> 0 = 'nails' and c -> 'trades' ? 'lashes', 'nails first: ' || (c -> 'trades')::text;
end $$;

rollback;
