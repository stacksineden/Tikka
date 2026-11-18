-- "What did they spend?" after redeeming: the owner adds or changes it on a used Tikka, within 30
-- days of using it. Staff can't, nor can another business. The drop's results and the live feed's
-- redeemed line change with it. The counter's code check says whose a used Tikka was and what they
-- spent, never the number.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c045-000000000001', 'owner45@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c045-000000000002', 'staff45@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c045-000000000003', 'other45@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Spent Place', 'spentplace45', 'SP', 'Beauty', 'Oyo', 'Ogbomoso', 'Under G', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Spent', 'otherspent45', 'OS', 'Beauty', 'Oyo', 'Ibadan', 'Ring Road', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c045-000000000002', 'staff');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'spent', 'Spent drop', 10, 'once_per_drop', 0, now() - interval '5 days', now() + interval '10 days', 14, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 10, '10% off', 10);
select private.build_deck((select v from t where k = 'drop'));

create function pg_temp.claim(p_visitor text, p_phone text, p_name text) returns uuid language plpgsql as $$
begin
  if public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), p_name, false, p_visitor, 'direct') ->> 'token', p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed for %', p_phone;
  end if;
  return (select id from public.claims where phone = p_phone and drop_id = (select v from t where k = 'drop') and kind = 'drop');
end $$;

insert into t values
  ('skipped', pg_temp.claim('v1', '+2348022220001', 'Tolu')),  -- used, nobody typed the amount
  ('typed', pg_temp.claim('v2', '+2348022220002', 'Bimpe')),    -- used, ₦8,000 typed at the counter
  ('unused', pg_temp.claim('v3', '+2348022220003', 'Kemi')),   -- not used yet
  ('old', pg_temp.claim('v4', '+2348022220004', 'Ada'));      -- used 31 days ago
insert into res select 'codes', jsonb_object_agg(k, (select code from public.claims where id = t.v)) from t where k in ('skipped', 'typed', 'unused', 'old');

-- Redeem at the counter, as the owner, the usual way (so the live feed has its redeemed lines).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
begin
  assert public.confirm_redemption(biz, c ->> 'skipped') ->> 'kind' = 'redeemed', 'skipped: redeemed';
  assert public.confirm_redemption(biz, c ->> 'typed', 800000) ->> 'kind' = 'redeemed', 'typed: redeemed';
  assert public.confirm_redemption(biz, c ->> 'old') ->> 'kind' = 'redeemed', 'old: redeemed';
end $$;
reset role;
update public.claims set redeemed_at = now() - interval '31 days' where id = (select v from t where k = 'old');

-- Staff can't change it; another business's owner can't either. Staff checking a used code see whose
-- it was and what they spent, never the number.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
  r jsonb;
begin
  begin
    perform public.set_redemption_amount(biz, 1500000, (select v from t where k = 'skipped'));
    assert false, 'staff must not change what was spent';
  exception when insufficient_privilege then null;
  end;
  r := public.check_code(biz, c ->> 'typed');
  assert r ->> 'kind' = 'already_used' and r ->> 'name' = 'Bimpe', 'used, with the name: ' || r::text;
  assert (r ->> 'spent_kobo')::int = 800000, 'what they spent';
  assert (r ->> 'can_set_spent')::boolean, 'recent enough to change';
  assert r::text !~ '802222', 'never the number';
  r := public.check_code(biz, c ->> 'skipped');
  assert r ->> 'spent_kobo' is null, 'skipped: nothing typed';
  assert not (public.check_code(biz, c ->> 'old') ->> 'can_set_spent')::boolean, 'old: too late to change';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_redemption_amount((select v from t where k = 'biz'), 1500000, (select v from t where k = 'skipped'));
    assert false, 'another owner must not change it';
  exception when insufficient_privilege then null;
  end;
  assert public.set_redemption_amount((select v from t where k = 'other'), 1500000, (select v from t where k = 'skipped')) ->> 'kind' = 'unknown', 'not their Tikka';
end $$;

-- The owner.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c045-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
  r jsonb;
begin
  -- Add the amount they forgot, from Leads.
  r := public.set_redemption_amount(biz, 1500000, (select v from t where k = 'skipped'));
  assert r ->> 'kind' = 'saved' and (r ->> 'amount_kobo')::int = 1500000 and r ->> 'name' = 'Tolu', 'skipped: saved ' || r::text;
  assert (select bill_amount_kobo from public.get_leads(biz) where claim_id = (select v from t where k = 'skipped')) = 1500000, 'leads show it';

  -- Fix a typo, by code at the counter (any case).
  r := public.set_redemption_amount(biz, 1000000, null, lower(c ->> 'typed'));
  assert r ->> 'kind' = 'saved', 'typed: changed ' || r::text;
  assert (public.check_code(biz, c ->> 'typed') ->> 'spent_kobo')::int = 1000000, 'the counter sees the new amount';

  -- The drop's results add them up.
  assert (select sum((x ->> 'bill_kobo')::int) from jsonb_array_elements(public.get_drop_report_data((select v from t where k = 'drop')) -> 'claims') x) = 2500000,
    'results: ₦25,000 recorded';

  -- Zero clears it.
  r := public.set_redemption_amount(biz, 0, (select v from t where k = 'skipped'));
  assert r ->> 'kind' = 'saved' and (r ->> 'amount_kobo')::int = 0, 'cleared';
  assert (select bill_amount_kobo from public.claims where id = (select v from t where k = 'skipped')) is null, 'cleared to nothing';
  r := public.set_redemption_amount(biz, 1500000, (select v from t where k = 'skipped'));

  -- What it can't do.
  assert public.set_redemption_amount(biz, 500000, (select v from t where k = 'unused')) ->> 'kind' = 'not_used', 'unused: no';
  assert public.set_redemption_amount(biz, 500000, (select v from t where k = 'old')) ->> 'kind' = 'too_late', 'old: too late';
  assert public.set_redemption_amount(biz, -100, (select v from t where k = 'skipped')) ->> 'kind' = 'bad_amount', 'negative: no';
  assert public.set_redemption_amount(biz, 1000000001, (select v from t where k = 'skipped')) ->> 'kind' = 'bad_amount', 'over ₦10m: no';
  assert public.set_redemption_amount(biz, null, (select v from t where k = 'skipped')) ->> 'kind' = 'bad_amount', 'no amount: no';
  assert public.set_redemption_amount(biz, 500000, null, 'SP-AAAAA') ->> 'kind' = 'unknown', 'unknown code';
end $$;
reset role;

-- The live feed's redeemed lines changed with it, and nothing else did.
do $$
declare
  c jsonb := (select v from res where k = 'codes');
begin
  assert (select count(*) from public.events where drop_id = (select v from t where k = 'drop') and type = 'redeemed' and amount_kobo = 1500000) = 1, 'feed: skipped now ₦15,000';
  assert (select count(*) from public.events where drop_id = (select v from t where k = 'drop') and type = 'redeemed' and amount_kobo = 1000000) = 1, 'feed: typed now ₦10,000';
  assert (select count(*) from public.events where drop_id = (select v from t where k = 'drop') and type = 'redeemed' and amount_kobo = 800000) = 0, 'feed: old amount gone';
  assert (select redeemed_at is not null from public.claims where id = (select v from t where k = 'skipped')), 'still used';
  assert (select code from public.claims where id = (select v from t where k = 'skipped')) = c ->> 'skipped', 'same code';
  assert (select bill_set_by from public.claims where id = (select v from t where k = 'typed')) = '00000000-0000-4000-c045-000000000001', 'who changed it';
  assert (select bill_amount_kobo from public.claims where id = (select v from t where k = 'old')) is null, 'old: unchanged';
end $$;

rollback;
