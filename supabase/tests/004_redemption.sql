-- Redemption: checking never uses a code, confirming uses it once, action cards need the tick,
-- quiet-day drops only work on their days, a redeemed drop Tikka makes one bounce-back, and the
-- counter never sees a phone number.
begin;

create temp table t (k text primary key, v uuid);
create temp table codes (k text primary key, code text);
grant all on t, codes to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-d000-000000000001', 'owner4@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-d000-000000000002', 'staff4@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-d000-000000000003', 'other4@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Redeem Test', 'redeemtest', 'RT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Test', 'othertest', 'OT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

insert into public.business_members (business_id, user_id, role)
select v, '00000000-0000-4000-d000-000000000002', 'staff' from t where k = 'biz';

-- A 10-card drop of one reward, live now.
create function pg_temp.make_drop(p_biz text, p_slug text, p_kind text, p_weekdays int[], p_bounce jsonb)
returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, valid_weekdays, bounce_back, status)
  values ((select v from t where k = p_biz), p_slug, 'Test drop', 10, 0, now() - interval '1 hour', now() + interval '10 days', p_weekdays, p_bounce, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, action_text, quantity)
  values (d, 'common', p_kind, case when p_kind = 'percent_off' then 10 end,
          case when p_kind = 'action' then 'Free drink' else '10% off' end,
          case when p_kind = 'action' then 'Follow us on Instagram' end, 10);
  perform private.build_deck(d);
  return d;
end $$;

-- Claim as the server would, and keep the code.
create function pg_temp.claim(p_key text, p_drop uuid, p_phone text, p_wa_name text default null)
returns void language plpgsql as $$
declare tok text := private.intent_token(); r record;
begin
  insert into public.claim_intents (drop_id, token, first_name) values (p_drop, tok, 'Ada');
  select * into r from public.claim_card(tok, p_phone, p_wa_name);
  assert r.result = 'claimed', p_key || ': ' || r.result;
  insert into codes select p_key, code from public.claims where id = r.claim_id;
end $$;

select pg_temp.claim('main', pg_temp.make_drop('biz', 'main', 'percent_off', null,
  '{"title": "₦2,000 off your next visit", "kind": "amount_off", "value": 200000, "validity_days": 30}'), '+2348100000001', 'Ada Okafor');
select pg_temp.claim('main2', (select id from public.drops where slug = 'main' and business_id = (select v from t where k = 'biz')), '+2348100000002');
select pg_temp.claim('action', pg_temp.make_drop('biz', 'action', 'action', null, null), '+2348100000001', 'Ada Okafor');
-- A quiet-day drop valid on every day but today.
select pg_temp.claim('quiet', pg_temp.make_drop('biz', 'quiet', 'percent_off',
  array(select g from generate_series(1, 7) g where g <> extract(isodow from now() at time zone 'Africa/Lagos')::int), null), '+2348100000003');
select pg_temp.claim('expired', pg_temp.make_drop('biz', 'old', 'percent_off', null, null), '+2348100000004');
update public.claims set expires_at = now() - interval '1 minute' where code = (select code from codes where k = 'expired');
select pg_temp.claim('elsewhere', pg_temp.make_drop('other', 'elsewhere', 'percent_off', null, null), '+2348100000005');

-- ------------------------------------------------------- at the counter
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  main text := (select code from codes where k = 'main');
  r jsonb;
begin
  r := public.check_code(biz, main);
  assert r ->> 'kind' = 'valid', 'a fresh code is valid: ' || r::text;
  assert r ->> 'name' = 'Ada O.', 'first name and last initial only: ' || (r ->> 'name');
  assert r ->> 'reward' = '10% off' and r ->> 'tier' = 'common' and r ->> 'suggested_status' = 'new', 'reward, tier, new customer';
  assert r ->> 'action' is null, 'not an action card';
  assert r::text not like '%+234%' and r::text not like '%810000%', 'no phone number at the counter';
  -- Checking twice, typed messily, changes nothing (rule 5).
  r := public.check_code(biz, lower(replace(main, '-', ' ')));
  assert r ->> 'kind' = 'valid' and r ->> 'code' = main, 'typed in lowercase with a space still finds it';

  assert public.check_code(biz, 'RT-AAAAA') ->> 'kind' = 'unknown', 'unknown code';
  assert public.check_code(biz, (select code from codes where k = 'elsewhere')) ->> 'kind' = 'wrong_business', 'another business''s code';
  assert public.check_code(biz, (select code from codes where k = 'expired')) ->> 'kind' = 'expired', 'expired code';
  r := public.check_code(biz, (select code from codes where k = 'quiet'));
  assert r ->> 'kind' = 'wrong_day' and jsonb_array_length(r -> 'days') = 6, 'quiet-day code on the wrong day: ' || r::text;
  assert public.confirm_redemption(biz, (select code from codes where k = 'quiet')) ->> 'kind' = 'wrong_day', 'can''t confirm on the wrong day';
  assert public.confirm_redemption(biz, (select code from codes where k = 'expired')) ->> 'kind' = 'expired', 'can''t confirm an expired code';

  -- Confirm: used once.
  r := public.confirm_redemption(biz, main, 850000);
  assert r ->> 'kind' = 'redeemed' and r ->> 'name' = 'Ada O.' and r ->> 'customer_status' = 'new', 'redeemed: ' || r::text;
  assert r -> 'bounce_back' ->> 'reward' = '₦2,000 off your next visit', 'the next-visit Tikka comes back';
  assert r::text not like '%+234%', 'no phone number in the answer';
  r := public.confirm_redemption(biz, main, 850000);
  assert r ->> 'kind' = 'already_used', 'a second confirm is refused: ' || r::text;
  assert public.check_code(biz, main) ->> 'kind' = 'already_used', 'check shows it was used';

  -- Action cards need the tick.
  r := public.confirm_redemption(biz, (select code from codes where k = 'action'));
  assert r ->> 'kind' = 'needs_action', 'no tick, no redemption: ' || r::text;
  r := public.check_code(biz, (select code from codes where k = 'action'));
  assert r ->> 'kind' = 'valid' and r ->> 'action' = 'Follow us on Instagram', 'still valid, shows the action';
  assert r ->> 'suggested_status' = 'returning', 'they redeemed here before, so returning';
  r := public.confirm_redemption(biz, (select code from codes where k = 'action'), null, true, 'new');
  assert r ->> 'kind' = 'redeemed' and r ->> 'customer_status' = 'new', 'the counter can override the suggestion';
  assert r -> 'bounce_back' = 'null'::jsonb, 'no bounce-back on a drop without one';

  begin
    perform public.confirm_redemption(biz, (select code from codes where k = 'main2'), null, false, 'vip');
    raise exception 'an unknown customer status was stored';
  exception when check_violation then null;
  end;
  -- Staff still never read claims or numbers directly.
  assert (select count(*) from public.claims) = 0, 'staff never read claims';
end $$;

-- What was stored.
reset role;
do $$
declare
  main public.claims%rowtype;
  bb public.claims%rowtype;
begin
  select * into main from public.claims where code = (select code from codes where k = 'main');
  assert main.redeemed_at = now() and main.bill_amount_kobo = 850000 and main.customer_status = 'new', 'redemption stored';
  assert main.redeemed_by = '00000000-0000-4000-d000-000000000002', 'who redeemed it';
  assert (select redeemed_count from public.leads where id = main.lead_id) = 2, 'the lead counts both visits';
  assert (select count(*) from public.events where type = 'redeemed' and amount_kobo = 850000 and first_name = 'Ada') = 1, 'the live feed gets the visit';
  assert (select action_confirmed from public.claims where code = (select code from codes where k = 'action')), 'the tick is kept';
  assert (select redeemed_at is null from public.claims where code = (select code from codes where k = 'quiet')), 'wrong day left it unused';

  select * into bb from public.claims where parent_claim_id = main.id;
  assert bb.kind = 'bounce_back' and bb.card_id is null and bb.lead_id = main.lead_id and bb.phone = main.phone, 'bounce-back for the same person';
  assert bb.code ~ '^RT-' and bb.code <> main.code and bb.view_token <> main.view_token, 'its own code and link';
  assert bb.expires_at = private.last_day(now(), 30), 'lasts 30 days to 23:59 WAT';
  insert into codes values ('bb', bb.code);
end $$;

-- The bounce-back is redeemed like any Tikka, and never makes another.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  r jsonb;
begin
  r := public.check_code(biz, (select code from codes where k = 'bb'));
  assert r ->> 'kind' = 'valid' and r ->> 'claim_kind' = 'bounce_back' and r ->> 'suggested_status' = 'returning', 'bounce-back valid: ' || r::text;
  assert r ->> 'reward' = '₦2,000 off your next visit', 'shows the next-visit offer';
  r := public.confirm_redemption(biz, (select code from codes where k = 'bb'), 500000);
  assert r ->> 'kind' = 'redeemed' and r -> 'bounce_back' = 'null'::jsonb, 'no bounce-back from a bounce-back';
  assert (select count(*) from public.claims where kind = 'bounce_back') = 1, 'still one bounce-back';
end $$;

-- Someone from another business, and anonymous visitors, can't use the counter.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-d000-000000000003","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.check_code((select v from t where k = 'biz'), (select code from codes where k = 'main2'));
    raise exception 'an outsider checked a code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_redemption((select v from t where k = 'biz'), (select code from codes where k = 'main2'));
    raise exception 'an outsider redeemed a code';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.check_code((select v from t where k = 'biz'), (select code from codes where k = 'main2'));
    raise exception 'anon checked a code';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
