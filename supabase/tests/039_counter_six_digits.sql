-- One used Tikka per WhatsApp per drop: staff type the last 6 digits off the customer's WhatsApp,
-- and a WhatsApp that already used a Tikka from the drop (through a different typed number ending
-- the same way) can't use another, in any order. Honest look-alikes and next-visit Tikkas pass.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c039-000000000001', 'owner39@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c039-000000000002', 'staff39@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c039-000000000004', 'admin39@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c039-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c039-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Six Digits', 'sixdigits39', 'SD', 'Beauty', 'Enugu', 'Enugu', 'Independence Layout', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c039-000000000002', 'staff');

create function pg_temp.make_drop(p_slug text) returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, bounce_back, status, counter_check)
  values ((select v from t where k = 'biz'), p_slug, 'Six digits drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14,
          '{"title": "₦1,000 off your next visit", "validity_days": 30}'::jsonb, 'published', true)
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values
    (d, 'rare', 'percent_off', 30, '30% off', 3),
    (d, 'common', 'percent_off', 10, '10% off', 7);
  perform private.build_deck(d);
  return d;
end $$;

-- A page claim with a typed number, from its own browser.
create function pg_temp.claim(p_drop uuid, p_visitor text, p_phone text) returns text language plpgsql as $$
begin
  if public.claim_on_page(public.create_claim_intent(p_drop, 'Ada', false, p_visitor, 'direct') ->> 'token', p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed for %', p_phone;
  end if;
  return (select code from public.claims where phone = p_phone and drop_id = p_drop and kind = 'drop');
end $$;

-- The cheater's WhatsApp ends …554521. They typed fake numbers ending 554521 (last 6 the same) and
-- 994521 (last 4 the same). An honest customer's WhatsApp ends …114521.
insert into t values ('a', pg_temp.make_drop('six-a')), ('b', pg_temp.make_drop('six-b')), ('c', pg_temp.make_drop('six-c'));
insert into res values ('codes', jsonb_build_object(
  -- Drop A: the fake is used first.
  'a_fake6', pg_temp.claim((select v from t where k = 'a'), 'a1', '+2348011554521'),
  'a_fake4', pg_temp.claim((select v from t where k = 'a'), 'a2', '+2348099994521'),
  'a_real',  pg_temp.claim((select v from t where k = 'a'), 'a3', '+2348055554521'),
  'a_honest', pg_temp.claim((select v from t where k = 'a'), 'a4', '+2348066114521'),
  -- Drop B: the real one is used first.
  'b_real',  pg_temp.claim((select v from t where k = 'b'), 'b1', '+2348055554521'),
  'b_fake6', pg_temp.claim((select v from t where k = 'b'), 'b2', '+2348011554521'),
  -- Drop C: both pass the check, then both are confirmed.
  'c_real',  pg_temp.claim((select v from t where k = 'c'), 'c1', '+2348055554521'),
  'c_fake6', pg_temp.claim((select v from t where k = 'c'), 'c2', '+2348011554521')));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c039-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
  r jsonb;
begin
  -- Six digits, every time.
  assert public.check_whatsapp_digits(biz, c ->> 'a_real', '4521') ->> 'kind' = 'invalid_digits', '4 digits are no longer enough';
  assert public.check_whatsapp_digits(biz, c ->> 'a_real', '55452a') ->> 'kind' = 'invalid_digits', 'digits only';
  assert public.check_whatsapp_digits(biz, c ->> 'a_real', '0554521') ->> 'kind' = 'invalid_digits', 'exactly 6';

  -- Drop A, the fake first: it ends in the same 6 digits as their WhatsApp, so it passes and is used.
  assert public.check_whatsapp_digits(biz, c ->> 'a_fake6', '554521') ->> 'kind' = 'matched', 'the fake with the same last 6 passes';
  assert public.confirm_redemption(biz, c ->> 'a_fake6') ->> 'kind' = 'redeemed', 'and is used';
  -- Their real Tikka from the same drop: the same WhatsApp, so no.
  r := public.check_whatsapp_digits(biz, c ->> 'a_real', '554521');
  assert r ->> 'kind' = 'used_by_this_whatsapp', 'the real one is stopped: ' || r::text;
  assert r::text !~ '8055', 'never the number';
  assert (public.check_code(biz, c ->> 'a_real') -> 'whatsapp_check' ->> 'tries_left')::int = 2, 'it counts as a wrong try';
  assert public.confirm_redemption(biz, c ->> 'a_real') ->> 'kind' = 'needs_whatsapp_check', 'and can''t be confirmed';
  -- The fake that only shares the last 4: their WhatsApp shows …554521, which isn't its number.
  r := public.check_whatsapp_digits(biz, c ->> 'a_fake4', '554521');
  assert r ->> 'kind' = 'no_match', 'a fake sharing only the last 4 doesn''t pass: ' || r::text;
  -- The honest look-alike (same last 4, different last 6) uses theirs as normal.
  assert public.check_whatsapp_digits(biz, c ->> 'a_honest', '114521') ->> 'kind' = 'matched', 'the honest customer passes';
  assert public.confirm_redemption(biz, c ->> 'a_honest') ->> 'kind' = 'redeemed', 'and uses it';

  -- Drop B, the real one first: then the fake is stopped.
  assert public.check_whatsapp_digits(biz, c ->> 'b_real', '554521') ->> 'kind' = 'matched', 'drop B: the real one passes';
  r := public.confirm_redemption(biz, c ->> 'b_real');
  assert r ->> 'kind' = 'redeemed' and r -> 'bounce_back' ->> 'claim_id' is not null, 'used, with a next-visit Tikka: ' || r::text;
  insert into res values ('bb', r -> 'bounce_back');
  assert public.check_whatsapp_digits(biz, c ->> 'b_fake6', '554521') ->> 'kind' = 'used_by_this_whatsapp', 'drop B: the fake is stopped';

  -- Drop C: both pass the check before either is used. The first confirmed is used; the second isn't.
  assert public.check_whatsapp_digits(biz, c ->> 'c_real', '554521') ->> 'kind' = 'matched', 'drop C: real passes';
  assert public.check_whatsapp_digits(biz, c ->> 'c_fake6', '554521') ->> 'kind' = 'matched', 'drop C: fake passes too (nothing used yet)';
  assert public.confirm_redemption(biz, c ->> 'c_real') ->> 'kind' = 'redeemed', 'drop C: the first is used';
  r := public.confirm_redemption(biz, c ->> 'c_fake6');
  assert r ->> 'kind' = 'used_by_this_whatsapp', 'drop C: the second is refused at confirm: ' || r::text;

  -- A Tikka already used stays used.
  assert public.check_whatsapp_digits(biz, c ->> 'a_fake6', '554521') ->> 'kind' = 'already_used', 'already used';
end $$;
reset role;

-- The next-visit Tikka from drop B: the same number, so it's never blocked.
insert into res values ('bb_code', to_jsonb((select code from public.claims where id = ((select v ->> 'claim_id' from res where k = 'bb'))::uuid)));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c039-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  code text := (select v #>> '{}' from res where k = 'bb_code');
begin
  assert not (public.check_code(biz, code) ? 'whatsapp_check'), 'the next-visit Tikka inherits the pass';
  assert public.confirm_redemption(biz, code) ->> 'kind' = 'redeemed', 'and is used, never blocked';
end $$;
reset role;

-- Three wrong tries a day still close it, and a stopped repeat counts as one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c039-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  code text := (select v ->> 'a_real' from res where k = 'codes');
begin
  assert public.check_whatsapp_digits(biz, code, '111111') ->> 'kind' = 'no_match', 'a second wrong try';
  assert public.check_whatsapp_digits(biz, code, '554521') ->> 'kind' = 'used_by_this_whatsapp', 'the third try: still the same WhatsApp';
  assert (public.check_code(biz, code) -> 'whatsapp_check' ->> 'tries_left')::int = 0, 'no tries left today';
  assert public.check_whatsapp_digits(biz, code, '554521') ->> 'kind' = 'closed_today', 'closed until tomorrow';
end $$;
reset role;

-- The digits are never stored, and Tikka admin sees the stopped repeats.
do $$
begin
  assert not exists (select 1 from information_schema.columns where table_name = 'counter_checks' and column_name ~ 'digit'), 'no digits column';
  assert (select count(*) from public.counter_checks k join public.claims c on c.id = k.claim_id
          where k.reason = 'used_by_this_whatsapp' and c.drop_id in (select v from t where k in ('a', 'b'))) = 3,
    'the stopped repeats are recorded';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c039-000000000004","role":"authenticated"}', true);
do $$
declare row jsonb;
begin
  select x into row from jsonb_array_elements(public.admin_counter_checks()) x where x ->> 'business_name' = 'Six Digits';
  assert (row ->> 'used_by_this_whatsapp')::int = 2, 'admin counts Tikkas stopped as repeats: ' || row::text;
end $$;
reset role;

-- Outsiders still can't run it.
set local role anon;
do $$
begin
  perform public.check_whatsapp_digits((select v from t where k = 'biz'), 'SD-AAAAA', '000000');
  raise exception 'a visitor ran the check';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform public.confirm_redemption((select v from t where k = 'biz'), 'SD-AAAAA');
  raise exception 'a visitor confirmed';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
