-- Drops and claiming: the deck is shuffled fairly, claim_card() hands out each card once, one per
-- number per drop, who-can-claim rules hold, and nobody but the server ever reads the deck.
-- (The parallel test, 300 people at once, is scripts/test-claim-concurrency.ts.)
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c000-000000000001', 'owner3@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c000-000000000002', 'staff3@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Claim Test', 'claimtest', 'CT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

insert into public.business_members (business_id, user_id, role)
select v, '00000000-0000-4000-c000-000000000002', 'staff' from t where k = 'biz';

-- A drop of 10: 1 legendary, 2 rare, 7 thank-you. Nothing kept back for new customers here.
create function pg_temp.make_drop(p_slug text, p_eligibility text, p_reserved int, p_cap int, p_starts timestamptz)
returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, eligibility, period_days, new_reserved_pct, marketplace_cap, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), p_slug, 'Test drop', 10, p_eligibility, 30, p_reserved, p_cap, p_starts, p_starts + interval '20 days', 14, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values
    (d, 'legendary', 'free_item', null, 'Free full set', 1),
    (d, 'rare', 'percent_off', 30, '30% off', 2),
    (d, 'common', 'percent_off', 10, '10% off', 7);
  perform private.build_deck(d);
  return d;
end $$;

create function pg_temp.intent(p_drop uuid, p_name text, p_source text default 'direct', p_future boolean default false)
returns text language plpgsql as $$
declare tok text;
begin
  loop
    tok := private.intent_token();
    exit when not exists (select 1 from public.claim_intents where token = tok);
  end loop;
  insert into public.claim_intents (drop_id, token, first_name, source, future_drops) values (p_drop, tok, p_name, p_source, p_future);
  return tok;
end $$;

create function pg_temp.claim(p_drop uuid, p_phone text, p_source text default 'direct', p_future boolean default false)
returns text language sql as $$
  select result from public.claim_card(pg_temp.intent(p_drop, 'Ada', p_source, p_future), p_phone);
$$;

insert into t values ('main', pg_temp.make_drop('main', 'once_per_drop', 0, null, now() - interval '1 day'));

-- ------------------------------------------------------------- the deck
do $$
declare d uuid := (select v from t where k = 'main');
begin
  assert (select count(*) from public.cards where drop_id = d) = 10, 'one card per Tikka';
  assert (select count(distinct position) = 10 and min(position) = 0 and max(position) = 9 from public.cards where drop_id = d), 'positions are 0..9';
  assert (select count(distinct serial) = 10 and min(serial) = 1 and max(serial) = 10 from public.cards where drop_id = d), 'serials are 1..10';
  assert (select count(*) from public.cards c join public.rewards r on r.id = c.reward_id where c.drop_id = d and r.tier = 'legendary') = 1, 'one legendary card';
  assert (select count(*) from public.cards c join public.rewards r on r.id = c.reward_id where c.drop_id = d and r.tier = 'rare') = 2, 'two rare cards';
  begin
    perform private.build_deck(d);
    raise exception 'a deck was built twice';
  exception when unique_violation then null;
  end;
  update public.rewards set quantity = 6 where drop_id = d and tier = 'common';
  begin
    perform private.build_deck(d);
    raise exception 'a deck was built from rewards that don''t add up';
  exception when check_violation then null;
  end;
  update public.rewards set quantity = 7 where drop_id = d and tier = 'common';
end $$;

-- ------------------------------------------------------------ claiming
do $$
declare
  d uuid := (select v from t where k = 'main');
  tok text := pg_temp.intent(d, 'Ada', 'qr', true);
  r record;
  r2 record;
  r3 record;
  cl public.claims%rowtype;
  i int;
begin
  select * into r from public.claim_card(tok, '+2348000000001', 'Ada O');
  assert r.result = 'claimed', 'first claim gets a card: ' || r.result;
  select * into cl from public.claims where id = r.claim_id;
  assert cl.code ~ '^CT-[ACDEFGHJKMNPQRTUVWXY34679]{5}$', 'code uses the business prefix: ' || cl.code;
  assert cl.view_token = r.view_token and length(r.view_token) = 24, 'view token is returned';
  assert cl.expires_at = private.last_day(now(), 14), 'a Tikka lasts to 23:59 WAT on its 14th day';
  assert to_char(cl.expires_at at time zone 'Africa/Lagos', 'HH24:MI') = '23:59', 'the last day ends at 23:59 WAT';
  assert cl.is_new_lead and cl.source = 'qr', 'new lead from the poster';
  assert (select position from public.cards where id = cl.card_id) = 0, 'cards go out in deck order';
  assert (select status = 'claimed' and claim_id = cl.id from public.cards where id = cl.card_id), 'the card is marked claimed';
  assert (select marketing_opt_in and claims_count = 1 from public.leads where phone = '+2348000000001'), 'future-drops tick is kept on the lead';
  assert (select count(*) from public.events where drop_id = d and type = 'claim_completed' and first_name = 'Ada') = 1, 'the live feed gets the claim';

  -- The same webhook twice: same answer, nothing new.
  select * into r2 from public.claim_card(tok, '+2348000000001');
  assert r2.result = 'claimed' and r2.claim_id = r.claim_id, 'a repeated webhook returns the stored answer';
  -- The same number again with a new intent: the same card back (rule 3).
  select * into r3 from public.claim_card(pg_temp.intent(d, 'Ada'), '+2348000000001');
  assert r3.result = 'duplicate' and r3.claim_id = r.claim_id and r3.view_token = r.view_token, 'a repeat claim returns the same card';
  assert (select count(*) from public.claims where drop_id = d) = 1, 'still one claim';
  assert (select claims_count from public.leads where phone = '+2348000000001') = 1, 'a repeat doesn''t count twice';

  assert (select result from public.claim_card('TK-AAAAA', '+2348000000002')) = 'invalid', 'unknown token';
  assert (select result from public.claim_card('nonsense', '+2348000000002')) = 'invalid', 'garbage token';

  -- An intent left too long.
  tok := pg_temp.intent(d, 'Late');
  update public.claim_intents set expires_at = now() - interval '1 minute' where token = tok;
  assert (select result from public.claim_card(tok, '+2348000000002')) = 'expired', 'stale intent';

  -- The other nine, then sold out.
  for i in 2..10 loop
    assert pg_temp.claim(d, '+23480000000' || lpad(i::text, 2, '0')) = 'claimed', 'claim ' || i;
  end loop;
  assert pg_temp.claim(d, '+2348000000099') = 'sold_out', 'the 11th person gets sold out';
  assert (select count(*) from public.claims where drop_id = d) = 10, 'exactly 10 claims';
  assert (select count(distinct card_id) from public.claims where drop_id = d) = 10, 'no card given twice';
  assert (select count(*) from public.cards where drop_id = d and status = 'available') = 0, 'deck is empty';
  assert (select count(*) from public.claims c join public.cards k on k.id = c.card_id join public.rewards w on w.id = k.reward_id
          where c.drop_id = d and w.tier = 'legendary') = 1, 'exactly one legendary given';
  assert (select count(distinct code) from public.claims where drop_id = d) = 10, 'codes are unique';
end $$;

-- ------------------------------------------------------- live window
do $$
declare d uuid := pg_temp.make_drop('later', 'once_per_drop', 0, null, now() + interval '1 day');
begin
  assert pg_temp.claim(d, '+2348000000001') = 'expired', 'a drop that hasn''t started can''t be claimed';
  update public.drops set starts_at = now() - interval '1 hour', status = 'ended_early' where id = d;
  assert pg_temp.claim(d, '+2348000000001') = 'expired', 'an ended drop can''t be claimed';
  update public.drops set status = 'published' where id = d;
  update public.businesses set suspended = true where id = (select v from t where k = 'biz');
  assert pg_temp.claim(d, '+2348000000001') = 'expired', 'a suspended business can''t be claimed';
  update public.businesses set suspended = false where id = (select v from t where k = 'biz');
end $$;

-- ---------------------------------------------------- who can claim
do $$
declare
  newonly uuid := pg_temp.make_drop('newonly', 'new_only', 0, null, now() - interval '1 hour');
  period uuid := pg_temp.make_drop('period', 'once_per_period', 0, null, now() - interval '1 hour');
  reserved uuid := pg_temp.make_drop('reserved', 'once_per_drop', 90, null, now() - interval '1 hour');
  market uuid := pg_temp.make_drop('market', 'once_per_drop', 0, 1, now() - interval '1 hour');
begin
  -- +…01 already claimed the main drop, so they're a returning customer.
  assert pg_temp.claim(newonly, '+2348000000001') = 'blocked_new_only', 'new customers only';
  assert pg_temp.claim(newonly, '+2348000000050') = 'claimed', 'a new number can claim a new-only drop';
  assert pg_temp.claim(period, '+2348000000001') = 'blocked_period', 'once per 30 days';
  assert pg_temp.claim(period, '+2348000000051') = 'claimed', 'a new number can claim';
  -- 90% kept for new customers: only 1 of 10 goes to returning ones.
  assert pg_temp.claim(reserved, '+2348000000002') = 'claimed', 'first returning customer fits';
  assert pg_temp.claim(reserved, '+2348000000003') = 'sold_out', 'the rest is kept for new customers';
  assert pg_temp.claim(reserved, '+2348000000052') = 'claimed', 'new customers still get in';
  -- Marketplace limit of 1.
  assert pg_temp.claim(market, '+2348000000053', 'market') = 'claimed', 'first marketplace claim';
  assert pg_temp.claim(market, '+2348000000054', 'market') = 'market_sold_out', 'marketplace share used up';
  assert pg_temp.claim(market, '+2348000000054', 'wa') = 'claimed', 'the link still works';
  assert (select claims_count from public.leads where phone = '+2348000000002') = 2, 'returning claims add up on the lead';
end $$;

-- ------------------------------------------------- who reads what
-- The owner: their claims and leads with numbers, never the deck.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.claims) > 0, 'owners see their claims';
  assert (select count(*) from public.leads) > 0, 'owners see their leads';
  assert (select count(*) from public.cards) = 0, 'owners never see the deck';
  assert (select count(*) from public.claim_intents) = 0, 'intents are server-only';
  begin
    perform public.claim_card('TK-AAAAA', '+2348000000001');
    raise exception 'an owner called claim_card';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.build_deck((select v from t where k = 'main'));
    raise exception 'an owner built a deck';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cards set status = 'available';
    raise exception 'an owner changed the deck';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Staff: the live feed, never numbers or the deck.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.claims) = 0, 'staff never see claims';
  assert (select count(*) from public.leads) = 0, 'staff never see leads';
  assert (select count(*) from public.cards) = 0, 'staff never see the deck';
  assert (select count(*) from public.events where type = 'claim_completed') > 0, 'staff see the live feed';
end $$;

-- Anonymous visitors: the published drop and what's in it, nothing else.
reset role;
set local role anon;
do $$ begin
  assert (select count(*) from public.drops where id = (select v from t where k = 'main')) = 1, 'published drops are public';
  assert (select count(*) from public.rewards where drop_id = (select v from t where k = 'main')) = 3, 'what''s in the drop is public';
  assert (select count(*) from public.cards) = 0, 'anon never sees the deck';
  assert (select count(*) from public.claims) = 0, 'anon never sees claims';
  assert (select count(*) from public.leads) = 0, 'anon never sees leads';
  assert (select count(*) from public.events) = 0, 'anon never sees activity';
  begin
    perform public.claim_card('TK-AAAAA', '+2348000000001');
    raise exception 'anon called claim_card';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
