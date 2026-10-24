-- Visit plans on real cards, the owner's "just claimed" prompt, and the landing page's numbers.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b900-000000000001', 'owner23@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b900-000000000002', 'staff23@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b900-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Gaps Test', 'gapstest', 'GT', 'Beauty', 'Ogun', 'Abeokuta', 'Kuto', '#9C3B5C', '#FFFFFF')::text;
reset role;
insert into public.business_members (business_id, user_id, role) select v::uuid, '00000000-0000-4000-b900-000000000002', 'staff' from t where k = 'biz';

-- A quiet-days drop: Tuesdays and Wednesdays only.
insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status, valid_weekdays)
select '00000000-0000-4000-b900-0000000000d1', v::uuid, 'gaps-week', 'Gaps week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published', '{2,3}' from t where k = 'biz';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-b900-0000000000d1', 'rare', 'percent_off', 20, '20% off', 10);
select private.build_deck('00000000-0000-4000-b900-0000000000d1');

do $$
declare
  r record;
  tok text := public.create_claim_intent('00000000-0000-4000-b900-0000000000d1', 'Bisi', false, 'v1', 'ig') ->> 'token';
  vt text;
  tue date;
  wed date;
  mon date;
  j jsonb;
begin
  select * into r from public.claim_card(tok, '+2348230000001');
  update public.claims set expires_at = now() + interval '14 days' where id = r.claim_id;
  vt := (select view_token from public.claims where id = r.claim_id);
  insert into t values ('since', (now() - interval '1 minute')::text);
  -- The next Tuesday, Wednesday and Monday from today (WAT).
  select d into tue from generate_series((now() at time zone 'Africa/Lagos')::date, (now() at time zone 'Africa/Lagos')::date + 6, interval '1 day') g(d) where extract(isodow from d) = 2;
  select d into wed from generate_series((now() at time zone 'Africa/Lagos')::date, (now() at time zone 'Africa/Lagos')::date + 6, interval '1 day') g(d) where extract(isodow from d) = 3;
  select d into mon from generate_series((now() at time zone 'Africa/Lagos')::date, (now() at time zone 'Africa/Lagos')::date + 6, interval '1 day') g(d) where extract(isodow from d) = 1;

  j := public.set_visit_plan(vt, tue, 'evening');
  assert j ->> 'planned_visit_date' = tue::text and j ->> 'planned_visit_part' = 'evening', 'a Tuesday evening: ' || coalesce(j::text, 'null');
  assert public.set_visit_plan(vt, mon, 'morning') is null, 'not a Monday on a quiet-days drop';
  assert public.set_visit_plan(vt, (now() at time zone 'Africa/Lagos')::date - 1, 'morning') is null, 'not yesterday';
  assert public.set_visit_plan(vt, (now() at time zone 'Africa/Lagos')::date + 30, 'morning') is null, 'not after it expires';
  assert public.set_visit_plan(vt, wed, 'midnight') is null, 'only morning, afternoon or evening';
  assert public.set_visit_plan('nope', wed, 'morning') is null, 'unknown card';
  update public.claims set redeemed_at = now() where id = r.claim_id;
  assert public.set_visit_plan(vt, wed, 'morning') is null, 'not once used';
  update public.claims set redeemed_at = null, bill_amount_kobo = 1200000 where id = r.claim_id;

  j := public.platform_stats();
  assert (j ->> 'businesses')::int >= 1 and (j ->> 'tikkas_claimed')::int >= 1 and (j ->> 'drops_live')::int >= 1, 'counts: ' || j::text;
  assert exists (select 1 from jsonb_array_elements(j -> 'recent') x where x ->> 'business_name' = 'Gaps Test' and x ->> 'city' = 'Abeokuta' and x ->> 'tier' = 'rare'), 'in the ticker';
  assert j::text not like '%+234%' and j::text not like '%Bisi%', 'never who';
end $$;

-- The owner sees the new claim with the number; staff and visitors can't ask.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b900-000000000001","role":"authenticated"}', true);
do $$
declare
  n record;
begin
  select * into n from public.new_claims_since((select v::uuid from t where k = 'biz'), (select v::timestamptz from t where k = 'since'));
  assert n.first_name = 'Bisi' and n.tier = 'rare' and n.reward = '20% off' and n.phone = '+2348230000001', 'the owner sees who just claimed';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b900-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform count(*) from public.new_claims_since((select v::uuid from t where k = 'biz'), now() - interval '1 day');
    raise exception 'staff saw who claimed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.set_visit_plan('x', current_date, 'morning');
    raise exception 'anon set a visit plan directly';
  exception when insufficient_privilege then null;
  end;
  assert (public.platform_stats() ->> 'businesses') is not null, 'anyone can read the landing numbers';
end $$;

rollback;
