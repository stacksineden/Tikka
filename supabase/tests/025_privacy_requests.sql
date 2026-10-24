-- Privacy requests: an admin sees everything held for a number and deletes it all; a namesake
-- and other people are untouched; the deck keeps its used cards; the log never holds the full
-- number; nobody but an admin can do any of it.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-ba00-000000000001', 'owner25@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ba00-000000000002', 'admin25@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-ba00-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ba00-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Forget Test', 'forgettest', 'FG', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF')::text;
reset role;

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status, bounce_back)
select '00000000-0000-4000-ba00-0000000000d1', v::uuid, 'forget-week', 'Forget week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published',
  '{"title": "10% off your next visit", "validity_days": 30}' from t where k = 'biz';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-ba00-0000000000d1', 'rare', 'percent_off', 20, '20% off', 10);
select private.build_deck('00000000-0000-4000-ba00-0000000000d1');

do $$
declare
  r record;
  biz uuid := (select v::uuid from t where k = 'biz');
begin
  -- Ada (to forget) and another Ada (a namesake, to keep).
  select * into r from public.claim_card(public.create_claim_intent('00000000-0000-4000-ba00-0000000000d1', 'Ada', true, 'v1', 'ig') ->> 'token', '+2348250000001', 'Ada Obi');
  insert into t values ('ada', r.claim_id::text);
  select * into r from public.claim_card(public.create_claim_intent('00000000-0000-4000-ba00-0000000000d1', 'Ada', false, 'v2', 'ig') ->> 'token', '+2348250000002', 'Ada Bello');
  insert into t values ('other', r.claim_id::text);
  -- Ada came in (a thank-you and a next-visit Tikka), reviewed, asked to be notified, then said STOP.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ba00-000000000001","role":"authenticated"}', true);
  perform public.confirm_redemption(biz, (select code from public.claims where id = (select v::uuid from t where k = 'ada')), 500000);
  perform set_config('request.jwt.claims', '', true);
  perform public.submit_review((select view_token from public.claims where id = (select v::uuid from t where k = 'ada')), 4, 'Nice');
  perform public.subscribe_notify(public.create_notify_intent(biz, null, 'v1'), '+2348250000001');
  perform public.handle_stop('+2348250000001', false);
  perform public.record_inbound('wamid.forget1', '+2348250000001', 'Ada Obi', '{"text": "hi"}');
end $$;

-- Owners can't use it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ba00-000000000001","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.admin_person_lookup('+2348250000001');
    raise exception 'an owner looked someone up';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_forget_person('+2348250000001');
    raise exception 'an owner deleted someone';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ba00-000000000002","role":"authenticated"}', true);
do $$
declare
  l jsonb := public.admin_person_lookup('+2348250000001');
  d jsonb;
begin
  assert jsonb_array_length(l -> 'claims') = 2, 'the drop Tikka and the next-visit one: ' || (l -> 'claims')::text;
  assert l -> 'businesses_with_lead' = '["Forget Test"]'::jsonb and (l ->> 'opted_out')::boolean and (l ->> 'messages')::int >= 1, 'what is held: ' || l::text;
  assert exists (select 1 from jsonb_array_elements(l -> 'claims') x where (x ->> 'reviewed')::boolean), 'the review shows';
  begin
    perform public.admin_person_lookup('08025000001');
    raise exception 'took a number not in international format';
  exception when check_violation then null;
  end;

  d := public.admin_forget_person('+2348250000001');
  assert (d ->> 'claims')::int = 2 and (d ->> 'reviews')::int = 1 and (d ->> 'leads')::int = 1 and (d ->> 'opt_outs')::int = 1, 'removed: ' || d::text;
  assert (d ->> 'feed_names')::int >= 2, 'feed names cleared: ' || d::text;
end $$;
reset role;

do $$
declare
  other uuid := (select v::uuid from t where k = 'other');
begin
  assert not exists (select 1 from public.claims where phone = '+2348250000001'), 'claims gone';
  assert not exists (select 1 from public.leads where phone = '+2348250000001'), 'lead gone';
  assert not exists (select 1 from public.claim_intents where phone = '+2348250000001'), 'claim attempts gone';
  assert not exists (select 1 from public.notify_subscriptions where phone = '+2348250000001'), 'notify gone';
  assert not exists (select 1 from public.opt_outs where phone = '+2348250000001'), 'opt-out gone';
  assert not exists (select 1 from public.wa_messages where phone = '+2348250000001'), 'messages gone';
  assert not exists (select 1 from public.outbound_messages where phone = '+2348250000001'), 'queue gone';
  assert not exists (select 1 from public.wa_contacts where phone = '+2348250000001'), 'contact gone';
  assert not exists (select 1 from public.reviews r join public.drops d on d.id = r.drop_id where d.slug = 'forget-week'), 'review gone';
  -- The namesake stays, with her name in the feed.
  assert exists (select 1 from public.claims where id = other and first_name = 'Ada'), 'the other Ada keeps her claim';
  assert exists (select 1 from public.events where drop_id = '00000000-0000-4000-ba00-0000000000d1' and type = 'claim_completed' and first_name = 'Ada'), 'and her name in the feed';
  -- The deck keeps the card Ada held: used, never handed out again.
  assert (select count(*) from public.cards where drop_id = '00000000-0000-4000-ba00-0000000000d1' and status = 'available') = 8, 'two cards stay used';
  -- The log: masked numbers only.
  assert (select count(*) from public.privacy_requests where phone_hint = '+234•••0001') = 2, 'lookup and deletion logged';
  assert not exists (select 1 from public.privacy_requests where phone_hint like '%25000000%' or counts::text like '%+234%'), 'never the full number';
end $$;

rollback;
