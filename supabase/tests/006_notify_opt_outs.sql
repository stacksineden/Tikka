-- Notify me and STOP: one subscription per number and target, subscribers stay out of leads and
-- businesses only get a count (rule 4), STOP stops the right business and clears the
-- future-drops box (rule 12), and asking again lifts it.
begin;

create temp table t (k text primary key, v uuid);
create temp table toks (k text primary key, code text);
grant all on t, toks to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-f000-000000000001', 'owner6@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-f000-000000000002', 'owner6b@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-000000000001","role":"authenticated"}', true);
insert into t select 'a', public.create_business('Glow Test', 'glowtest6', 'GA', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-000000000002","role":"authenticated"}', true);
insert into t select 'b', public.create_business('Bean Test', 'beantest6', 'BA', 'Food', 'Abuja', 'Abuja', 'Wuse', '#9C3B5C', '#FFFFFF');
reset role;

create function pg_temp.drop(p_key text, p_biz text, p_starts interval, p_status text default 'published')
returns void language plpgsql as $$
declare d uuid;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
  values ((select v from t where k = p_biz), p_key, 'Drop ' || p_key, 10, 0, now() + p_starts, now() + p_starts + interval '5 days', p_status)
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'common', 'percent_off', 10, '10% off', 10);
  perform private.build_deck(d);
  insert into t values (p_key, d);
end $$;

select pg_temp.drop('soon', 'a', interval '2 days');
select pg_temp.drop('live', 'a', interval '-1 hour');
select pg_temp.drop('over', 'a', interval '-10 days');
select pg_temp.drop('draft', 'a', interval '2 days', 'draft');
select pg_temp.drop('bean', 'b', interval '-1 hour');

-- ------------------------------------------------------- the button
do $$
declare
  a uuid := (select v from t where k = 'a');
  tok text;
begin
  tok := public.create_notify_intent(a, (select v from t where k = 'soon'), 'visitor-1');
  assert tok ~ '^NT-[ACDEFGHJKMNPQRTUVWXY34679]{5}$', 'an NT code: ' || coalesce(tok, 'null');
  assert public.create_notify_intent(a, (select v from t where k = 'soon'), 'visitor-1') = tok, 'tapping twice gives the same code';
  assert public.create_notify_intent(a, (select v from t where k = 'soon'), 'visitor-2') <> tok, 'each visitor gets their own';
  assert public.create_notify_intent(a, (select v from t where k = 'draft'), 'visitor-1') is null, 'not for a draft';
  assert public.create_notify_intent(a, (select v from t where k = 'bean'), 'visitor-1') is null, 'not for another business''s drop';
  insert into toks values ('soon', tok);
  insert into toks values ('live', public.create_notify_intent(a, (select v from t where k = 'live'), 'visitor-1'));
  insert into toks values ('over', public.create_notify_intent(a, (select v from t where k = 'over'), 'visitor-1'));
  insert into toks values ('biz', public.create_notify_intent(a, null, 'visitor-1'));
  insert into toks values ('biz2', public.create_notify_intent(a, null, 'visitor-2'));
  insert into toks values ('bean', public.create_notify_intent((select v from t where k = 'b'), null, 'visitor-1'));
  update public.businesses set suspended = true where id = (select v from t where k = 'b');
  assert public.create_notify_intent((select v from t where k = 'b'), null, 'visitor-3') is null, 'not for a suspended business';
  update public.businesses set suspended = false where id = (select v from t where k = 'b');
end $$;

-- ------------------------------------------------- WhatsApp brings it back
do $$
declare
  a uuid := (select v from t where k = 'a');
  soon uuid := (select v from t where k = 'soon');
  r jsonb;
begin
  assert public.subscribe_notify('NT-AAAAA', '+2348300000001') ->> 'kind' = 'invalid', 'unknown code';

  r := public.subscribe_notify((select code from toks where k = 'soon'), '+2348300000001');
  assert r ->> 'kind' = 'subscribed' and r ->> 'scope' = 'drop' and r ->> 'business_name' = 'Glow Test', 'subscribed to the drop: ' || r::text;
  assert (r ->> 'starts_at')::timestamptz = (select starts_at from public.drops where id = soon), 'with when it opens';
  assert public.subscribe_notify(lower((select code from toks where k = 'soon')), '+2348300000001') ->> 'kind' = 'already', 'sending it twice';
  assert (select count(*) from public.notify_subscriptions where phone = '+2348300000001') = 1, 'one subscription';
  assert (select count(*) from public.events where business_id = a and type = 'notify_subscribed') = 1, 'one event, no number';
  assert (select count(*) from public.events where type = 'notify_subscribed' and (first_name is not null or visitor_hash is not null)) = 0, 'the event carries nobody';

  r := public.subscribe_notify((select code from toks where k = 'live'), '+2348300000002');
  assert r ->> 'kind' = 'live' and r ->> 'drop_slug' = 'live' and r ->> 'business_slug' = 'glowtest6', 'it''s open now: send the link';
  assert (select count(*) from public.notify_subscriptions where phone = '+2348300000002') = 0, 'nothing saved for a live drop';

  r := public.subscribe_notify((select code from toks where k = 'over'), '+2348300000002');
  assert r ->> 'kind' = 'subscribed' and r ->> 'scope' = 'business', 'an ended drop becomes their next drop: ' || r::text;
  assert public.subscribe_notify((select code from toks where k = 'biz'), '+2348300000002') ->> 'kind' = 'already', 'same as following the business';
  assert public.subscribe_notify((select code from toks where k = 'biz2'), '+2348300000003') ->> 'kind' = 'subscribed', 'follows the business';
  assert public.subscribe_notify((select code from toks where k = 'bean'), '+2348300000001') ->> 'kind' = 'subscribed', 'follows another business';

  -- Counts: the drop's subscribers plus the business's followers, once each.
  assert public.notify_waiting(a, soon) = 3, 'waiting for the drop: ' || public.notify_waiting(a, soon);
  assert public.notify_waiting(a) = 2, 'following the business';
  -- Subscribers are not leads.
  assert (select count(*) from public.leads where phone like '+23483%') = 0, 'no leads from Notify me';
end $$;

-- ---------------------------------------------------- businesses see a count only
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-f000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert public.notify_waiting((select v from t where k = 'a'), (select v from t where k = 'soon')) = 3, 'the owner sees the count';
  begin
    perform count(*) from public.notify_subscriptions;
    raise exception 'an owner read subscribers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.opt_outs;
    raise exception 'an owner read opt-outs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.subscribe_notify('NT-AAAAA', '+2348300000009');
    raise exception 'an owner subscribed a number';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.handle_stop('+2348300000001');
    raise exception 'an owner stopped a number';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert public.notify_waiting((select v from t where k = 'a')) = 2, 'the public page shows the count';
  begin
    perform public.create_notify_intent((select v from t where k = 'a'), null, 'v');
    raise exception 'anon made a notify code directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------- STOP
do $$
declare
  a uuid := (select v from t where k = 'a');
  b uuid := (select v from t where k = 'b');
  tok text := private.intent_token();
  r jsonb;
begin
  -- +…01 follows Bean (latest) and waits for Glow's drop; then claims from Glow with the box ticked.
  insert into public.claim_intents (drop_id, token, first_name, future_drops) values ((select v from t where k = 'live'), tok, 'Ada', true);
  assert (select result from public.claim_card(tok, '+2348300000001')) = 'claimed', 'claimed';
  assert (select marketing_opt_in from public.leads where phone = '+2348300000001'), 'ticked the box';

  -- STOP: the business they last heard about is Glow (the claim is newest).
  update public.notify_subscriptions set created_at = now() - interval '1 day' where phone = '+2348300000001';
  r := public.handle_stop('+2348300000001');
  assert r ->> 'scope' = 'business' and r ->> 'business_name' = 'Glow Test', 'stops Glow: ' || r::text;
  assert (select opted_out and not marketing_opt_in from public.leads where phone = '+2348300000001'), 'STOP clears the box';
  assert (select status from public.notify_subscriptions where phone = '+2348300000001' and business_id = a) = 'stopped', 'Glow subscription stopped';
  assert (select status from public.notify_subscriptions where phone = '+2348300000001' and business_id = b) = 'active', 'Bean untouched';
  assert public.notify_waiting(a, (select v from t where k = 'soon')) = 2, 'no longer counted';
  assert public.handle_stop('+2348300000001') ->> 'scope' = 'business', 'STOP twice is fine';
  assert (select count(*) from public.opt_outs where phone = '+2348300000001') = 1, 'one opt-out';

  -- Asking again lifts it for that business.
  r := public.subscribe_notify((select code from toks where k = 'soon'), '+2348300000001');
  assert r ->> 'kind' = 'subscribed', 'subscribing again after STOP: ' || r::text;
  assert (select count(*) from public.opt_outs where phone = '+2348300000001') = 0, 'opt-out lifted';
  assert public.notify_waiting(a, (select v from t where k = 'soon')) = 3, 'counted again';

  -- STOP ALL: nothing from Tikka.
  assert public.handle_stop('+2348300000001', true) ->> 'scope' = 'all', 'stop all';
  assert (select count(*) from public.notify_subscriptions where phone = '+2348300000001' and status = 'active') = 0, 'every subscription stopped';
  assert (select count(*) from public.opt_outs where phone = '+2348300000001' and business_id is null) = 1, 'the all-Tikka opt-out';
  assert public.notify_waiting(b) = 0, 'gone from every count';

  -- A number Tikka has never heard of: STOP means everything.
  assert public.handle_stop('+2348300000099') ->> 'scope' = 'all', 'unknown number stops all';

  -- STOP, then claim from that business again: the claim lifts that business's opt-out.
  perform public.handle_stop('+2348300000002');
  assert (select count(*) from public.opt_outs where phone = '+2348300000002' and business_id = a) = 1, 'stopped Glow';
  tok := private.intent_token();
  insert into public.claim_intents (drop_id, token, first_name) values ((select v from t where k = 'live'), tok, 'Bola');
  assert (select result from public.claim_card(tok, '+2348300000002')) = 'claimed', 'claims after STOP';
  assert (select count(*) from public.opt_outs where phone = '+2348300000002') = 0, 'claiming lifts it';
  assert (select not opted_out and not marketing_opt_in from public.leads where phone = '+2348300000002'), 'opted back in to messages, not marketing';
end $$;

rollback;
