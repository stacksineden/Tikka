-- The WhatsApp check at the counter, for Tikkas claimed by typing a number: staff type the last 4
-- digits off the customer's WhatsApp; Tikka only says matches or not, never the number, and never
-- stores the digits; 3 wrong tries a day; confirming needs a pass; passing makes the lead confirmed
-- for this business (and brings back the future-drops tick they chose); the check belongs to each
-- Tikka, decided when it's claimed; Tikka admin sees the outcomes.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c033-000000000001', 'owner33@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c033-000000000002', 'staff33@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c033-000000000003', 'stranger33@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c033-000000000004', 'admin33@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c033-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Counter Check', 'countercheck', 'CC', 'Beauty', 'Oyo', 'Ogbomoso', 'Under G', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c033-000000000002', 'staff');

create function pg_temp.make_drop(p_slug text, p_check boolean) returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, bounce_back, status, counter_check)
  values ((select v from t where k = 'biz'), p_slug, 'Counter drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14,
          '{"title": "₦1,000 off your next visit", "validity_days": 30}'::jsonb, 'published', p_check)
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values
    (d, 'rare', 'percent_off', 30, '30% off', 3),
    (d, 'common', 'percent_off', 10, '10% off', 7);
  perform private.build_deck(d);
  return d;
end $$;

create function pg_temp.intent(p_drop uuid, p_visitor text, p_future boolean default false) returns text language sql as $$
  select public.create_claim_intent(p_drop, 'Ada', p_future, p_visitor, 'direct') ->> 'token';
$$;
create function pg_temp.code_of(p_phone text, p_drop uuid) returns text language sql as $$
  select code from public.claims where phone = p_phone and drop_id = p_drop and kind = 'drop';
$$;

insert into t values ('on', pg_temp.make_drop('check-on', true)), ('off', pg_temp.make_drop('check-off', false)),
                     ('later', pg_temp.make_drop('check-later', true));

-- ------------------------------------------------ claims take the switch
do $$
declare
  d uuid := (select v from t where k = 'on');
  c public.claims%rowtype;
  r record;
begin
  assert public.claim_on_page(pg_temp.intent(d, 'v1', true), '+2348031120001') ->> 'kind' = 'claimed', 'claim 1 (ticked future drops)';
  assert public.claim_on_page(pg_temp.intent(d, 'v2', false), '+2348031120002') ->> 'kind' = 'claimed', 'claim 2';
  assert public.claim_on_page(pg_temp.intent(d, 'v3'), '+2348031120003') ->> 'kind' = 'claimed', 'claim 3';
  assert public.claim_on_page(pg_temp.intent(d, 'v4'), '+2348031120004') ->> 'kind' = 'claimed', 'claim 4';
  select * into c from public.claims where phone = '+2348031120001' and drop_id = d;
  assert c.counter_check and c.counter_checked_at is null, 'a typed-in Tikka on a drop with the check on needs it';
  assert (private.card_json(c.id) ->> 'counter_check')::boolean, 'and its card says so';

  assert public.claim_on_page(pg_temp.intent((select v from t where k = 'off'), 'v5'), '+2348031120005') ->> 'kind' = 'claimed', 'claim on the drop with the check off';
  assert not (select counter_check from public.claims where phone = '+2348031120005'), 'the check off: not needed';

  select * into r from public.claim_card(pg_temp.intent(d, 'v6'), '+2348031120006', 'Bola A');
  assert r.result = 'claimed', 'a WhatsApp claim';
  assert not (select counter_check from public.claims where id = r.claim_id), 'WhatsApp claims never need the check';
end $$;

-- The codes, read here as the superuser and handed to the staff blocks.
insert into res values ('codes', jsonb_build_object(
  'c1', pg_temp.code_of('+2348031120001', (select v from t where k = 'on')),
  'c2', pg_temp.code_of('+2348031120002', (select v from t where k = 'on')),
  'c3', pg_temp.code_of('+2348031120003', (select v from t where k = 'on')),
  'c5', pg_temp.code_of('+2348031120005', (select v from t where k = 'off')),
  'c6', pg_temp.code_of('+2348031120006', (select v from t where k = 'on'))));

-- --------------------------------------------- staff at the counter
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  code text;
  r jsonb;
begin
  code := (select v ->> 'c1' from res where k = 'codes');
  r := public.check_code(biz, code);
  assert r ->> 'kind' = 'valid' and (r -> 'whatsapp_check' ->> 'tries_left')::int = 3, 'the check shows, 3 tries: ' || r::text;
  assert r::text !~ '803112', 'check_code never carries the number';
  r := public.confirm_redemption(biz, code);
  assert r ->> 'kind' = 'needs_whatsapp_check', 'confirming without the check is refused: ' || r::text;

  assert public.check_whatsapp_digits(biz, code, '12a4') ->> 'kind' = 'invalid_digits', 'only 4 digits';
  assert public.check_whatsapp_digits(biz, code, '123') ->> 'kind' = 'invalid_digits', 'exactly 4';
  r := public.check_whatsapp_digits(biz, code, '0000');
  assert r ->> 'kind' = 'no_match' and (r ->> 'tries_left')::int = 2, 'wrong: 2 tries left: ' || r::text;
  assert r::text !~ '803112' and r::text !~ '0001', 'a wrong answer never hints at the number';
  r := public.check_whatsapp_digits(biz, code, '1111');
  assert r ->> 'kind' = 'no_match' and (r ->> 'tries_left')::int = 1, 'wrong again: 1 left';
  r := public.check_whatsapp_digits(biz, code, '2222');
  assert r ->> 'kind' = 'closed_today', 'the third wrong try closes it for today: ' || r::text;
  r := public.check_whatsapp_digits(biz, code, '0001');
  assert r ->> 'kind' = 'closed_today', 'even the right digits wait until tomorrow';
  assert (public.check_code(biz, code) -> 'whatsapp_check' ->> 'tries_left')::int = 0, 'the screen knows it''s closed';
  assert public.confirm_redemption(biz, code) ->> 'kind' = 'needs_whatsapp_check', 'and still can''t be confirmed';
end $$;
reset role;


-- ---------------------------------------------------- the next day
update public.counter_checks set checked_at = checked_at - interval '1 day';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  codes jsonb := (select v from res where k = 'codes');
  r jsonb;
begin
  r := public.check_code(biz, codes ->> 'c1');
  assert (r -> 'whatsapp_check' ->> 'tries_left')::int = 3, 'a new day, 3 tries again: ' || r::text;
  r := public.check_whatsapp_digits(biz, codes ->> 'c1', '0001');
  assert r ->> 'kind' = 'matched', 'the right digits match: ' || r::text;
  assert not (public.check_code(biz, codes ->> 'c1') ? 'whatsapp_check'), 'passed: the check box goes away';
  assert public.check_whatsapp_digits(biz, codes ->> 'c1', '9999') ->> 'kind' = 'not_needed', 'checking again isn''t needed';
  r := public.confirm_redemption(biz, codes ->> 'c1');
  assert r ->> 'kind' = 'redeemed' and r -> 'bounce_back' ->> 'reward' is not null, 'confirmed, with the next-visit Tikka: ' || r::text;
  insert into res values ('bb1', r -> 'bounce_back');

  -- Claim 2 passes on the first try.
  assert public.check_whatsapp_digits(biz, codes ->> 'c2', '0002') ->> 'kind' = 'matched', 'claim 2 matches first time';
  assert public.confirm_redemption(biz, codes ->> 'c2') ->> 'kind' = 'redeemed', 'claim 2 redeemed';

  -- Claim 3 fails once, then never comes back.
  assert public.check_whatsapp_digits(biz, codes ->> 'c3', '7777') ->> 'kind' = 'no_match', 'claim 3 fails once';

  -- The check off, and WhatsApp claims: nothing to check.
  assert not (public.check_code(biz, codes ->> 'c5') ? 'whatsapp_check'), 'check off: no box';
  assert public.check_whatsapp_digits(biz, codes ->> 'c5', '0005') ->> 'kind' = 'not_needed', 'check off: not needed';
  assert public.confirm_redemption(biz, codes ->> 'c5') ->> 'kind' = 'redeemed', 'check off: redeems as before';
  assert not (public.check_code(biz, codes ->> 'c6') ? 'whatsapp_check'), 'WhatsApp claim: no box';
end $$;
reset role;

do $$
declare
  d uuid := (select v from t where k = 'on');
  c public.claims%rowtype;
  bb public.claims%rowtype;
begin
  select * into c from public.claims where phone = '+2348031120001' and drop_id = d and kind = 'drop';
  assert c.counter_checked_at is not null and not c.phone_confirmed, 'claim 1 passed; the claim itself stays typed';
  assert (select phone_confirmed and marketing_opt_in and marketing_opt_in_at is not null from public.leads where id = c.lead_id),
    'its lead is confirmed, and gets back the future-drops tick they chose';
  assert (select phone_confirmed and not marketing_opt_in from public.leads where phone = '+2348031120002'),
    'claim 2''s lead is confirmed, but they didn''t tick future drops';
  assert (select not phone_confirmed from public.leads where phone = '+2348031120005'), 'check off: the lead stays unconfirmed';
  assert (select count(*) from public.counter_checks where claim_id = c.id) = 4, 'every check on claim 1 was recorded (3 wrong, 1 right)';
  assert not exists (select 1 from public.outbound_messages where claim_id = c.id), 'no WhatsApp thank-you for a typed claim';

  select * into bb from public.claims where parent_claim_id = c.id;
  assert bb.counter_check and bb.counter_checked_at is not null, 'the next-visit Tikka counts as checked';
end $$;

insert into res select 'bbcode', to_jsonb(code) from public.claims where parent_claim_id =
  (select id from public.claims where phone = '+2348031120001' and kind = 'drop' and drop_id = (select v from t where k = 'on'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000002","role":"authenticated"}', true);
do $$
begin
  assert not (public.check_code((select v from t where k = 'biz'), (select v #>> '{}' from res where k = 'bbcode')) ? 'whatsapp_check'),
    'the next-visit Tikka isn''t checked again';
end $$;
reset role;

-- -------------------------------------- a verified number on a later drop
do $$
declare
  d uuid := (select v from t where k = 'later');
begin
  assert public.claim_on_page(pg_temp.intent(d, 'v7'), '+2348031120001') ->> 'kind' = 'claimed', 'the verified number is typed on another drop';
  assert (select counter_check and counter_checked_at is null from public.claims where drop_id = d and phone = '+2348031120001'),
    'that Tikka is checked again: the check belongs to each Tikka';
  -- Claim 2's number is proven but said no to future drops; someone types it with the box ticked.
  assert public.claim_on_page(pg_temp.intent(d, 'v8', true), '+2348031120002') ->> 'kind' = 'claimed', 'a proven number typed with the box ticked';
  assert (select phone_confirmed and not marketing_opt_in from public.leads where phone = '+2348031120002'),
    'typing a number never signs it up for drop alerts';
end $$;

-- --------------------------------------------------------- outsiders
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000003","role":"authenticated"}', true);
do $$
begin
  perform public.check_whatsapp_digits((select v from t where k = 'biz'), (select v ->> 'c3' from res where k = 'codes'), '0003');
  raise exception 'someone outside the business ran the check';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.admin_counter_checks();
  raise exception 'a non-admin read the counter-check numbers';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.check_whatsapp_digits((select v from t where k = 'biz'), 'CC-AAAAA', '0000');
  raise exception 'a visitor ran the check';
exception when insufficient_privilege then null;
end $$;
reset role;

-- --------------------------------------------- the owner's lead list
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.get_leads((select v from t where k = 'biz')) where counter_checked) = 2,
    'the owner sees which typed numbers passed at the counter';
end $$;
reset role;

-- -------------------------------------------------------- Tikka admin
-- Claim 3 failed and expires; claim 4 never came and expires.
update public.claims set expires_at = now() - interval '1 minute'
where phone in ('+2348031120003', '+2348031120004') and drop_id = (select v from t where k = 'on');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c033-000000000004","role":"authenticated"}', true);
do $$
declare
  rec jsonb;
begin
  select x into rec from jsonb_array_elements(public.admin_counter_checks()) x
  where x ->> 'business_id' = (select v::text from t where k = 'biz');
  assert rec is not null, 'the business is in the admin numbers';
  assert (rec ->> 'passed_first')::int = 1, 'passed first time: claim 2: ' || rec::text;
  assert (rec ->> 'failed_then_passed')::int = 1, 'failed, then passed: claim 1';
  assert (rec ->> 'came_not_redeemed')::int = 1, 'came but couldn''t redeem: claim 3';
  assert (rec ->> 'never_came')::int = 1, 'never came: claim 4';
  assert (rec ->> 'not_yet')::int = 2, 'not yet: the later drop''s two Tikkas';
  assert rec::text !~ '803112', 'no phone numbers in the admin numbers';
end $$;
reset role;

rollback;
