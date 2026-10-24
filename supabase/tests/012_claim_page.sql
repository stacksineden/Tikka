-- The claim page on real drops: claim codes only for live drops with Tikkas left (the same code
-- if they tap again), the card only to the visitor who claimed it and never a phone number,
-- views counted once a day, and none of it callable from the browser.
begin;

create temp table t (k text primary key, v uuid);
create temp table s (k text primary key, v text);
grant all on t, s to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-ad00-000000000001', 'owner12@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ad00-000000000002', 'other12@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ad00-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Claim Page Test', 'claimpagetest', 'CP', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ad00-000000000002","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Twelve', 'othertwelve', 'OW', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

create function pg_temp.drop(p_key text, p_starts interval, p_total int default 10) returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
  values ((select v from t where k = 'biz'), p_key, 'Drop ' || p_key, p_total, 0, now() + p_starts, now() + p_starts + interval '5 days', 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, action_text, quantity)
  values (d, 'common', 'action', null, 'A free drink', 'Follow us on Instagram', p_total);
  perform private.build_deck(d);
  insert into t values (p_key, d);
  return d;
end $$;
select pg_temp.drop('live', interval '-1 hour');
select pg_temp.drop('soon', interval '1 day');
select pg_temp.drop('gone', interval '-10 days');

do $$
declare
  live uuid := (select v from t where k = 'live');
  r jsonb;
  r2 jsonb;
  card jsonb;
begin
  -- Claim codes.
  r := public.create_claim_intent(live, '  Ada ', true, 'visitor-1', 'qr', (select id from public.posters where business_id = (select v from t where k = 'biz') limit 1));
  assert r ->> 'kind' = 'intent' and r ->> 'token' ~ '^TK-[ACDEFGHJKMNPQRTUVWXY34679]{5}$', 'a claim code: ' || r::text;
  insert into s values ('tok', r ->> 'token');
  assert (select first_name = 'Ada' and future_drops and source = 'qr' and poster_id is not null from public.claim_intents where token = r ->> 'token'), 'name, box, source and poster kept';
  r2 := public.create_claim_intent(live, 'Adaeze', false, 'visitor-1', 'qr');
  assert r2 ->> 'token' = r ->> 'token', 'tapping Claim again gives the same code';
  assert (select first_name = 'Adaeze' and not future_drops from public.claim_intents where token = r ->> 'token'), 'with the new name';
  assert public.create_claim_intent((select v from t where k = 'soon'), 'Ada', false, 'visitor-1', 'wa') ->> 'kind' = 'scheduled', 'not open yet';
  assert public.create_claim_intent((select v from t where k = 'gone'), 'Ada', false, 'visitor-1', 'wa') ->> 'kind' = 'ended', 'ended';
  assert public.create_claim_intent(gen_random_uuid(), 'Ada', false, 'visitor-1', 'wa') ->> 'kind' = 'not_found', 'no such drop';
  assert (public.create_claim_intent(live, 'Bola', false, 'visitor-2', 'nonsense') ->> 'kind') = 'intent', 'an odd source is just direct';
  assert (select source from public.claim_intents where visitor_id = 'visitor-2') = 'direct', 'stored as direct';
  -- A poster from another business isn't credited.
  perform public.create_claim_intent(live, 'Chi', false, 'visitor-3', 'qr', (select id from public.posters where business_id = (select v from t where k = 'other') limit 1));
  assert (select poster_id is null from public.claim_intents where visitor_id = 'visitor-3'), 'another business''s poster is ignored';

  -- Waiting.
  assert public.claim_result(r ->> 'token', 'visitor-1') ->> 'kind' = 'pending', 'waiting for WhatsApp';
  assert public.claim_result(r ->> 'token', 'visitor-9') ->> 'kind' = 'invalid', 'another visitor learns nothing';

  -- WhatsApp confirms (the webhook calls claim_card).
  perform public.claim_card(r ->> 'token', '+2348800000001', 'Adaeze Okafor');
  r := public.claim_result((select v from s where k = 'tok'), 'visitor-1');
  card := r -> 'card';
  assert r ->> 'kind' = 'claimed', 'claimed: ' || r::text;
  assert card ->> 'reward' = 'A free drink' and card ->> 'action' = 'Follow us on Instagram' and card ->> 'tier' = 'common', 'the card';
  assert card ->> 'code' ~ '^CP-' and (card ->> 'serial')::int between 1 and 10 and (card ->> 'total')::int = 10 and card ->> 'first_name' = 'Adaeze', 'code, serial, name';
  assert r::text not like '%+234%' and r::text not like '%8800000001%', 'never the phone number';
  assert public.claim_result((select v from s where k = 'tok'), 'visitor-9') ->> 'kind' = 'invalid', 'still nothing for anyone else';
  assert public.claim_by_view_token(card ->> 'view_token') ->> 'code' = card ->> 'code', 'the card link opens the same card';
  assert public.claim_by_view_token('nope') is null, 'an unknown link opens nothing';

  -- The same number from another browser: the same card.
  r2 := public.create_claim_intent(live, 'Ada', false, 'visitor-7', 'wa');
  perform public.claim_card(r2 ->> 'token', '+2348800000001');
  r2 := public.claim_result(r2 ->> 'token', 'visitor-7');
  assert r2 ->> 'kind' = 'duplicate' and r2 -> 'card' ->> 'code' = card ->> 'code', 'a repeat gets the same card';

  -- Counts and link activity.
  assert public.drop_claimed_count(live) = 1, 'one claim';
  perform public.record_drop_event(live, 'view', 'ig', 'hash-1');
  perform public.record_drop_event(live, 'view', 'ig', 'hash-1');
  perform public.record_drop_event(live, 'unwrap', 'ig', 'hash-1');
  perform public.record_drop_event(live, 'claim_completed', 'ig', 'hash-1');
  perform public.record_drop_event(live, 'view', 'qr', 'hash-2', (select id from public.posters where business_id = (select v from t where k = 'other') limit 1));
  assert (select count(*) from public.events where drop_id = live and type = 'view') = 2, 'a view once a day per visitor';
  assert (select count(*) from public.events where drop_id = live and type = 'unwrap') = 1, 'beacons count';
  assert (select count(*) from public.events where drop_id = live and type = 'claim_completed' and visitor_hash = 'hash-1') = 0, 'the browser can''t fake a claim';
  assert (select poster_id is null from public.events where visitor_hash = 'hash-2'), 'another business''s poster is ignored';

  -- Sold out.
  update public.cards set status = 'claimed' where drop_id = live;
  assert public.create_claim_intent(live, 'Dayo', false, 'visitor-8', 'wa') ->> 'kind' = 'sold_out', 'sold out';
end $$;

-- From the browser: only the count.
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert public.drop_claimed_count((select v from t where k = 'live')) = 1, 'the count is public';
  begin
    perform public.create_claim_intent((select v from t where k = 'live'), 'Ada', false, 'v', 'wa');
    raise exception 'anon made a claim code directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_result('TK-AAAAA', 'v');
    raise exception 'anon read a claim';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_by_view_token('x');
    raise exception 'anon read a card';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_drop_event((select v from t where k = 'live'), 'view', 'wa', 'h');
    raise exception 'anon wrote an event directly';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
