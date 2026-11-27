-- Tikka Plus: the owner buys a month at the server's price (staff can't; the browser never sends an
-- amount); a wrong amount fails; paying gives 30 days and that month's drop; paying again adds 30
-- days to the end; while it lasts the portfolio has room for 60 and the business is Featured first
-- in search; the owner asks for their own web address (one open request); admin sees both.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c085-000000000001', 'owner85@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c085-000000000002', 'staff85@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c085-000000000003', 'admin85@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c085-000000000004', 'other85@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c085-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Plus Studio', 'plusstudio85', 'PS', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'biz'), '[{"name":"Braids","price_kobo":2000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'biz'), true, 1, 0, 30, '{}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000004","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Plain Studio', 'plainstudio85', 'PL', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'other'), '[{"name":"Braids","price_kobo":2000000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'other'), true, 1, 0, 30, '{}');
reset role;
insert into public.business_members (business_id, user_id, role) values ((select v from t where k = 'biz'), '00000000-0000-4000-c085-000000000002', 'staff');
update public.businesses set listed = true, listing_terms_at = now(), listing_terms_version = '2026-11-26' where id in (select v from t);

-- Staff can't buy it; the owner can, at the server's price.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.buy_plus((select v from t where k = 'biz'));
    assert false, 'staff must not buy Plus';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000001","role":"authenticated"}', true);
insert into res select 'pay1', public.buy_plus((select v from t where k = 'biz'));
insert into res select 'pay2', public.buy_plus((select v from t where k = 'biz'));
do $$
declare s jsonb := public.plus_state((select v from t where k = 'biz'));
begin
  assert ((select v from res where k = 'pay1') ->> 'amount_kobo')::int = 1000000, 'the server price';
  assert s ->> 'until' is null and (s ->> 'price_kobo')::int = 1000000 and (s ->> 'days')::int = 30, 'no Plus yet: ' || s::text;
  assert not (public.portfolio_plan((select v from t where k = 'biz')) ->> 'open')::boolean, 'no extra room yet';
end $$;
reset role;

-- Paystack confirms: a wrong amount fails; the right one gives 30 days and the month's drop.
set local role service_role;
do $$
declare
  r jsonb;
  until1 timestamptz;
begin
  assert public.complete_payment((select v from res where k = 'pay2') ->> 'reference', 500) ->> 'kind' = 'failed', 'a wrong amount fails';
  r := public.complete_payment((select v from res where k = 'pay1') ->> 'reference', 1000000);
  assert r ->> 'kind' = 'plus', 'plus: ' || r::text;
  until1 := (select plus_until from public.businesses where id = (select v from t where k = 'biz'));
  assert until1 between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '30 days';
  assert (select count(*) from public.drop_vouchers where business_id = (select v from t where k = 'biz') and source = 'plus' and expires_at = until1) = 1, 'the month''s drop';
  assert public.complete_payment((select v from res where k = 'pay1') ->> 'reference', 1000000) ->> 'kind' = 'already', 'paid once only';
end $$;
reset role;

-- Paying again adds 30 days to the end, not to today.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000001","role":"authenticated"}', true);
insert into res select 'pay3', public.buy_plus((select v from t where k = 'biz'));
reset role;
set local role service_role;
do $$
begin
  perform public.complete_payment((select v from res where k = 'pay3') ->> 'reference', 1000000);
  assert (select plus_until from public.businesses where id = (select v from t where k = 'biz')) > now() + interval '59 days 23 hours', '60 days in all';
  assert (select count(*) from public.drop_vouchers where business_id = (select v from t where k = 'biz') and source = 'plus') = 2, 'a drop each month';
end $$;
reset role;

-- While it lasts: room for 60, Featured first in search, the state says so.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  p jsonb := public.portfolio_plan(biz);
  s jsonb := public.plus_state(biz);
  found jsonb;
begin
  assert (p ->> 'open')::boolean and p ->> 'reason' = 'plus' and (p ->> 'items')::int = 60, 'room for 60: ' || p::text;
  assert s ->> 'until' is not null and (s ->> 'drop_left')::boolean, 'state: ' || s::text;
  found := (select jsonb_agg(x ->> 'slug') from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48)) x where x ->> 'slug' in ('plusstudio85', 'plainstudio85'));
  assert found ->> 0 = 'plusstudio85', 'Featured first: ' || found::text;
  assert (select (x ->> 'featured')::boolean from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48)) x where x ->> 'slug' = 'plusstudio85'), 'marked featured';

  -- Their own web address: one open request, updated when asked again.
  perform public.request_domain(biz, ' PlusStudio.com ', 'Please set it up');
  perform public.request_domain(biz, 'plusstudio.ng', null);
  s := public.plus_state(biz);
  assert s -> 'domain' ->> 'domain' = 'plusstudio.ng' and s -> 'domain' ->> 'status' = 'new', 'one request: ' || s::text;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.request_domain((select v from t where k = 'biz'), 'x.com', null);
    assert false, 'staff must not ask';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_plus();
    assert false, 'admins only';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Admin sees them, and can end Plus by hand: then the extras stop and nothing else changes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000003","role":"authenticated"}', true);
do $$
declare a jsonb := public.admin_plus();
begin
  assert exists (select 1 from jsonb_array_elements(a -> 'businesses') x where x ->> 'slug' = 'plusstudio85'), 'listed';
  assert exists (select 1 from jsonb_array_elements(a -> 'requests') x where x ->> 'domain' = 'plusstudio.ng'), 'request listed';
  perform public.admin_domain_request((select (x ->> 'id')::uuid from jsonb_array_elements(a -> 'requests') x where x ->> 'domain' = 'plusstudio.ng'), 'contacted');
  perform public.admin_set_plus((select v from t where k = 'biz'), null);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c085-000000000001","role":"authenticated"}', true);
do $$
begin
  assert public.plus_state((select v from t where k = 'biz')) ->> 'until' is null, 'ended';
  assert (public.portfolio_plan((select v from t where k = 'biz')) ->> 'items')::int = 20, 'back to 20';
  assert not (select (x ->> 'featured')::boolean from jsonb_array_elements(public.search_businesses(p_place => 'Ibadan', p_limit => 48)) x where x ->> 'slug' = 'plusstudio85'), 'not featured';
end $$;
reset role;

rollback;
