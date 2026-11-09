-- Claiming on the page (TIKKA_CLAIM_MODE=page): the same claim_card() rules, typed numbers marked
-- unconfirmed, a number that already claimed never shows its card to someone else, one Tikka per
-- browser, and Tikka never queues WhatsApp messages for an unconfirmed claim.
begin;

create temp table t (k text primary key, v uuid);
create temp table tok (k text primary key, v text);
grant all on t, tok to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c029-000000000001', 'owner29@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c029-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Page Claims', 'pageclaims', 'PG', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

create function pg_temp.make_drop(p_slug text) returns uuid language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), p_slug, 'Page drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values
    (d, 'legendary', 'free_item', null, 'Free facial', 1),
    (d, 'rare', 'percent_off', 30, '30% off', 2),
    (d, 'common', 'percent_off', 10, '10% off', 7);
  perform private.build_deck(d);
  return d;
end $$;

-- A claim intent for this visitor, as the claim sheet makes one.
create function pg_temp.intent(p_drop uuid, p_visitor text, p_future boolean default false) returns text language sql as $$
  select public.create_claim_intent(p_drop, 'Ada', p_future, p_visitor, 'direct') ->> 'token';
$$;

insert into t values ('a', pg_temp.make_drop('page-a')), ('b', pg_temp.make_drop('page-b'));

-- ------------------------------------------------------------ a page claim
do $$
declare
  d uuid := (select v from t where k = 'a');
  token text := pg_temp.intent(d, 'visitor-1', true);
  r jsonb;
  c public.claims%rowtype;
begin
  r := public.claim_on_page(token, '+2348031110001');
  assert r ->> 'kind' = 'claimed', 'a typed number claims a card: ' || r::text;
  select * into c from public.claims where drop_id = d and phone = '+2348031110001';
  assert found and not c.phone_confirmed, 'the claim is marked unconfirmed';
  assert (select not phone_confirmed and not marketing_opt_in from public.leads where phone = '+2348031110001'),
    'a new typed number is an unconfirmed lead with no drop alerts, even with the box ticked';
  assert (select count(*) from public.cards where drop_id = d and status = 'claimed') = 1, 'exactly one card left the deck';
  r := public.claim_result(token, 'visitor-1');
  assert r ->> 'kind' = 'claimed' and (r -> 'card' ->> 'phone_confirmed')::boolean = false, 'the card comes back to this visitor, marked unconfirmed';
  assert public.claim_result(token, 'someone-else') ->> 'kind' = 'invalid', 'never to another visitor';
  insert into tok values ('first', c.view_token);
end $$;

-- ------------------------------------------- someone types the same number
do $$
declare
  d uuid := (select v from t where k = 'a');
  token text := pg_temp.intent(d, 'visitor-2');
  r jsonb;
begin
  r := public.claim_on_page(token, '+2348031110001');
  assert r ->> 'kind' = 'number_taken', 'a number that already claimed gets number_taken: ' || r::text;
  assert r -> 'view_token' is null, 'and no card link';
  r := public.claim_result(token, 'visitor-2');
  assert r ->> 'kind' = 'number_taken' and r -> 'card' is null, 'polling never reveals the other person''s card';
  assert (select count(*) from public.claims where drop_id = d) = 1, 'no second claim';
end $$;

-- ------------------------------------------------- one Tikka per browser
do $$
declare
  d uuid := (select v from t where k = 'a');
  r jsonb;
begin
  r := public.claim_on_page(pg_temp.intent(d, 'visitor-1'), '+2348031110002');
  assert r ->> 'kind' = 'already_this_browser', 'the same browser can''t claim again with another number: ' || r::text;
  assert r ->> 'view_token' = (select v from tok where k = 'first'), 'it gets its own card back';
  assert (select count(*) from public.claims where drop_id = d) = 1, 'still one claim';
end $$;

-- ------------------------------------------------------- bad numbers
do $$
declare d uuid := (select v from t where k = 'a');
begin
  assert public.claim_on_page(pg_temp.intent(d, 'visitor-3'), '08031110003') ->> 'kind' = 'invalid_phone', 'the server only takes +234 numbers';
  assert public.claim_on_page(pg_temp.intent(d, 'visitor-3'), '+2341234567890') ->> 'kind' = 'invalid_phone', 'and only Nigerian mobile prefixes';
  assert public.claim_on_page(pg_temp.intent(d, 'visitor-3'), '+44770090000') ->> 'kind' = 'invalid_phone', 'not other countries';
end $$;

-- -------------------------------- no WhatsApp messages for an unconfirmed claim
do $$
declare
  c public.claims%rowtype;
begin
  select * into c from public.claims where phone = '+2348031110001';
  assert public.enqueue_message(c.phone, 'expiry_reminder', '{}'::jsonb, (select v from t where k = 'biz'), c.id, 'test-reminder:' || c.id) is null,
    'a reminder for an unconfirmed claim is not queued';
  assert not exists (select 1 from public.outbound_messages where claim_id = c.id), 'nothing in the queue for it';
end $$;

-- ------------------------------- WhatsApp claims stay confirmed, and confirm the lead
do $$
declare
  d uuid := (select v from t where k = 'b');
  r record;
begin
  select * into r from public.claim_card(pg_temp.intent(d, 'visitor-4'), '+2348031110001', 'Ada O');
  assert r.result = 'claimed', 'the same person claims drop b on WhatsApp';
  assert (select phone_confirmed from public.claims where id = r.claim_id), 'a WhatsApp claim is confirmed';
  assert (select phone_confirmed from public.leads where phone = '+2348031110001'), 'and it confirms the lead';
  assert public.enqueue_message('+2348031110001', 'expiry_reminder', '{}'::jsonb, (select v from t where k = 'biz'), r.claim_id, 'test-reminder:' || r.claim_id) is not null,
    'confirmed claims still get their messages';
end $$;

-- ------------------------- a confirmed lead claiming on the page stays confirmed
do $$
declare
  d uuid := (select v from t where k = 'b');
  r record;
begin
  select * into r from public.claim_card(pg_temp.intent(d, 'visitor-5'), '+2348031110005', 'Bola');
  assert r.result = 'claimed', 'a WhatsApp claim on drop b';
  update public.leads set marketing_opt_in = true where phone = '+2348031110005';
  assert public.claim_on_page(pg_temp.intent((select v from t where k = 'a'), 'visitor-6'), '+2348031110005') ->> 'kind' = 'claimed',
    'the same number claims drop a on the page';
  assert (select phone_confirmed and marketing_opt_in from public.leads where phone = '+2348031110005'),
    'the lead stays confirmed and keeps its choice';
  assert not (select phone_confirmed from public.claims where phone = '+2348031110005' and drop_id = (select v from t where k = 'a')),
    'but this claim itself was typed, so it''s unconfirmed';
end $$;

-- ---------------------------------------------------- owner and access
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c029-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.get_leads((select v from t where k = 'biz')) where not phone_confirmed) = 2,
    'the owner''s lead list shows which numbers were typed';
  begin
    perform public.claim_on_page('TK-AAAAA', '+2348031110009');
    raise exception 'a signed-in user called claim_on_page directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.claim_on_page('TK-AAAAA', '+2348031110009');
  raise exception 'a visitor called claim_on_page directly';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
