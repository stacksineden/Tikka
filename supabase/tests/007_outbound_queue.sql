-- The WhatsApp queue: priority order (card replies first, rule 7), opt-outs, the 24-hour rule,
-- templates, retries, delivery statuses, the thank-you, reminders and drop-live alerts (rule 12).
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a700-000000000001', 'owner7@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a700-000000000002', 'admin7@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-a700-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Queue Test', 'queuetest', 'QT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

-- Start from an empty queue view: only this test's messages count.
create temp view q as select * from public.outbound_messages where business_id = (select v from t where k = 'biz') or phone like '+234850%';

-- -------------------------------------------------------------- inbound
do $$ begin
  assert public.record_inbound('wamid.1', '+2348500000001', 'Ada Okafor', '{"text":"hi"}'), 'a new message';
  assert not public.record_inbound('wamid.1', '+2348500000001', 'Ada Okafor', '{"text":"hi"}'), 'Meta''s retry is ignored';
  assert (select last_inbound_at = now() and profile_name = 'Ada Okafor' from public.wa_contacts where phone = '+2348500000001'), 'window open';
  perform public.record_inbound('wamid.2', '+2348500000002', null, '{}');
  perform public.record_inbound('wamid.3', '+2348500000003', null, '{}');
  -- +…04 last wrote two days ago: window closed. +…05 never wrote.
  insert into public.wa_contacts (phone, last_inbound_at) values ('+2348500000004', now() - interval '2 days');
end $$;

-- ------------------------------------------------------- priority order
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  got text[];
begin
  update public.wa_templates set approved = true;
  perform public.enqueue_message('+2348500000001', 'drop_live', '{}', biz, null, 'k-live');
  perform public.enqueue_message('+2348500000001', 'expiry_reminder', '{}', biz, null, 'k-rem');
  perform public.enqueue_message('+2348500000001', 'thanks', '{}', biz, null, 'k-thanks');
  perform public.enqueue_message('+2348500000001', 'card', '{"code":"QT-AAAA"}', biz, null, 'k-card');
  perform public.enqueue_message('+2348500000001', 'reply', '{}', biz, null, 'k-later', now() + interval '1 hour');
  assert public.enqueue_message('+2348500000001', 'card', '{}', biz, null, 'k-card') is null, 'the same key twice is one message';

  select array_agg(kind) into got from public.take_outbound(1);
  assert got = array['card'], 'the card goes first: ' || got::text;
  select array_agg(kind) into got from public.take_outbound(10);
  assert got = array['thanks', 'expiry_reminder', 'drop_live'], 'then thanks, reminders, alerts: ' || got::text;
  assert (select count(*) from q where status = 'sending') = 4, 'four on their way';
  assert (select status from q where dedupe_key = 'k-later') = 'queued', 'scheduled for later stays put';
  assert (select count(*) from public.take_outbound(10)) = 0, 'nothing taken twice';
  assert (select template_name from q where dedupe_key = 'k-thanks') is null, 'window open: the thank-you is free-form';
  assert (select template_name from q where dedupe_key = 'k-live') = 'tikka_drop_live', 'alerts are templates';
  assert (select cost_estimate_usd from q where dedupe_key = 'k-live') = 0.06, 'the alert''s cost is recorded';
end $$;

-- ------------------------------------------- opt-outs, the window, templates
do $$
declare
  biz uuid := (select v from t where k = 'biz');
begin
  delete from public.outbound_messages where business_id = biz;
  insert into public.opt_outs (phone, business_id) values ('+2348500000002', biz), ('+2348500000003', null);
  perform public.enqueue_message('+2348500000002', 'drop_live', '{}', biz, null, 'o-live');
  perform public.enqueue_message('+2348500000002', 'card', '{}', biz, null, 'o-card');
  perform public.enqueue_message('+2348500000003', 'thanks', '{}', biz, null, 'o-thanks');
  perform public.enqueue_message('+2348500000003', 'notify_confirm', '{}', biz, null, 'o-confirm');
  perform public.enqueue_message('+2348500000004', 'reply', '{}', biz, null, 'w-reply');
  perform public.enqueue_message('+2348500000004', 'thanks', '{}', biz, null, 'w-thanks');
  perform public.enqueue_message('+2348500000005', 'card', '{}', biz, null, 'w-card');
  update public.wa_templates set approved = false where name = 'tikka_owner_daily';
  perform public.enqueue_message('+2348500000001', 'owner_daily', '{}', biz, null, 't-daily');
  perform count(*) from public.take_outbound(50);

  assert (select status = 'skipped' and error = 'opted_out' from q where dedupe_key = 'o-live'), 'STOP: no alert';
  assert (select status from q where dedupe_key = 'o-card') = 'sending', 'STOP: the card they asked for still goes';
  assert (select status = 'skipped' and error = 'opted_out' from q where dedupe_key = 'o-thanks'), 'STOP ALL: no thank-you';
  assert (select status from q where dedupe_key = 'o-confirm') = 'sending', 'STOP ALL: the confirmation they asked for goes';
  assert (select status = 'skipped' and error = 'window_closed' from q where dedupe_key = 'w-reply'), 'window closed: replies dropped';
  assert (select status = 'sending' and template_name = 'tikka_redeemed_thanks' from q where dedupe_key = 'w-thanks'), 'window closed: the thank-you uses its template';
  assert (select status = 'skipped' and error = 'window_closed' from q where dedupe_key = 'w-card'), 'never wrote: no free-form';
  assert (select status = 'skipped' and error = 'template_not_approved' from q where dedupe_key = 't-daily'), 'unapproved template: skipped and logged';
  update public.wa_templates set approved = true;
end $$;

-- ------------------------------------------------------ sending and retries
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  m uuid;
begin
  m := (select id from q where dedupe_key = 'o-card');
  perform public.finish_outbound(m, 'wamid.out.1');
  assert (select status = 'sent' and sent_at = now() and wa_message_id = 'wamid.out.1' from q where id = m), 'sent';
  assert (select count(*) from public.wa_messages where direction = 'out' and wa_message_id = 'wamid.out.1') = 1, 'logged';
  perform public.finish_outbound(m, 'wamid.out.x');
  assert (select wa_message_id from q where id = m) = 'wamid.out.1', 'finishing twice changes nothing';

  perform public.record_outbound_status('wamid.out.1', 'read');
  perform public.record_outbound_status('wamid.out.1', 'delivered');
  assert (select status from q where id = m) = 'read', 'statuses never go backwards';

  m := (select id from q where dedupe_key = 'o-confirm');
  perform public.finish_outbound(m, null, 'timeout');
  assert (select status = 'queued' and attempts = 1 and scheduled_for = now() + interval '2 minutes' and error = 'timeout' from q where id = m), 'retry in 2 minutes';
  update public.outbound_messages set scheduled_for = now() where id = m;
  assert (select attempts from public.take_outbound(50) where id = m) = 2, 'second try';
  perform public.finish_outbound(m, null, 'timeout');
  assert (select scheduled_for = now() + interval '4 minutes' from q where id = m), 'then 4 minutes';
  update public.outbound_messages set scheduled_for = now() where id = m;
  perform count(*) from public.take_outbound(50);
  perform public.finish_outbound(m, null, 'timeout');
  assert (select status = 'failed' and attempts = 3 from q where id = m), 'failed after 3 tries';

  -- A run that died mid-send.
  m := (select id from q where dedupe_key = 'w-thanks');
  update public.outbound_messages set taken_at = now() - interval '6 minutes' where id = m;
  assert (select count(*) from public.take_outbound(50) where id = m) = 1, 'a stuck message is picked up again';
end $$;

-- ---------------------------------------------------------- the thank-you
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid;
  tok text := private.intent_token();
  v_code text;
  p jsonb;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, bounce_back, status, alerted_at)
  values (biz, 'thanks', 'Thanks drop', 10, 0, now() - interval '1 hour', now() + interval '5 days',
          '{"title": "10% off your next visit", "validity_days": 30}', 'published', now())
  returning id into d;
  insert into t values ('drop', d);
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'common', 'percent_off', 10, '10% off', 10);
  perform private.build_deck(d);
  insert into public.claim_intents (drop_id, token, first_name) values (d, tok, 'Ada');
  perform public.claim_card(tok, '+2348500000001');
  v_code := (select c.code from public.claims c where c.drop_id = d);

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-000000000001","role":"authenticated"}', true);
  assert public.confirm_redemption(biz, v_code) ->> 'kind' = 'redeemed', 'redeemed';
  reset role;

  select payload into p from q where kind = 'thanks' and claim_id = (select id from public.claims where drop_id = d and kind = 'drop');
  assert p ->> 'business_name' = 'Queue Test' and p ->> 'first_name' = 'Ada', 'thank-you queued: ' || coalesce(p::text, 'none');
  assert p -> 'bounce_back' ->> 'reward' = '10% off your next visit' and p -> 'bounce_back' ->> 'view_token' is not null, 'with the next-visit Tikka';
  assert p ->> 'view_token' = (select view_token from public.claims where drop_id = d and kind = 'drop'), 'and the review link';
  assert (select priority from q where kind = 'thanks' and claim_id is not null) = 2, 'priority 2';
end $$;

-- ------------------------------------------------------------ reminders
do $$
declare
  d uuid := (select v from t where k = 'drop');
  tok text;
  i int;
begin
  for i in 6..9 loop
    tok := private.intent_token();
    insert into public.claim_intents (drop_id, token, first_name) values (d, tok, 'Bola');
    perform public.claim_card(tok, '+234850000000' || i);
  end loop;
  -- 06: ends in 2 days (10:00 three days before has passed): due. 07: ends in 10 days: not yet.
  -- 08: due but sent STOP. 09: due but already used.
  update public.claims set claimed_at = now() - interval '5 days', expires_at = now() + interval '2 days'
  where drop_id = d and phone in ('+2348500000006', '+2348500000008', '+2348500000009');
  insert into public.opt_outs (phone, business_id) values ('+2348500000008', (select v from t where k = 'biz'));
  update public.claims set redeemed_at = now() where drop_id = d and phone = '+2348500000009';

  assert public.enqueue_due_reminders() = 1, 'one reminder due';
  assert public.enqueue_due_reminders() = 0, 'once per Tikka';
  assert (select reminder_sent_at = now() from public.claims where drop_id = d and phone = '+2348500000006'), 'marked sent';
  assert (select payload ->> 'reward' = '10% off' and priority = 3 from q where kind = 'expiry_reminder' and phone = '+2348500000006'), 'with the reward';

  -- A plan to come in on a day that's still ahead: 08:00 that day.
  assert private.reminder_at(now(), now() + interval '20 days', ((now() at time zone 'Africa/Lagos')::date + 5))
       = (((now() at time zone 'Africa/Lagos')::date + 5 + time '08:00') at time zone 'Africa/Lagos'), 'planned day at 08:00';
  assert private.reminder_at(now(), now() + interval '1 day', null) is null, 'too short for a reminder';
end $$;

-- ------------------------------------------------------ drop-live alerts
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid;
  d2 uuid;
begin
  update public.drops set alerted_at = now() where alerted_at is null;
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
  values (biz, 'opening', 'Opening drop', 10, 0, now() - interval '1 minute', now() + interval '5 days', 'published') returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'legendary', 'free_item', null, 'Free', 1), (d, 'common', 'percent_off', 10, '10%', 9);
  perform private.build_deck(d);

  insert into public.notify_subscriptions (phone, business_id, drop_id, created_at) values
    ('+2348500000011', biz, d, now() - interval '3 days'),      -- waiting for this drop
    ('+2348500000011', biz, null, now() - interval '9 days'),   -- and follows the business: one alert
    ('+2348500000012', biz, null, now() - interval '2 days'),   -- follows the business
    ('+2348500000015', biz, null, now() - interval '8 days');   -- follows, then sent STOP
  insert into public.opt_outs (phone, business_id) values ('+2348500000015', biz);
  insert into public.leads (business_id, phone, first_name, marketing_opt_in, marketing_opt_in_at) values
    (biz, '+2348500000013', 'Chi', true, now() - interval '1 day'),   -- ticked the box
    (biz, '+2348500000014', 'Dayo', false, null);                     -- didn't

  assert public.enqueue_drop_alerts() = 3, 'three people';
  assert (select array_agg(phone order by phone) from q where kind = 'drop_live' and dedupe_key like 'live:' || d || '%')
       = array['+2348500000011', '+2348500000012', '+2348500000013'], 'waiting, following and opted-in; not the unticked or stopped';
  assert (select payload ->> 'legendary' = '1' and payload ->> 'drop_slug' = 'opening' from q where dedupe_key like 'live:%' limit 1), 'what''s in it';
  assert (select status from public.notify_subscriptions where phone = '+2348500000011' and drop_id = d) = 'used', 'drop subscription used up';
  assert (select status = 'active' and notified_at = now() from public.notify_subscriptions where phone = '+2348500000012'), 'business follow stays';
  assert (select alerted_at = now() from public.drops where id = d), 'announced once';
  assert public.enqueue_drop_alerts() = 0, 'never twice';

  -- The cap: longest waiting first.
  update public.drops set alerted_at = null, slug = 'opening2' where id = d;
  delete from public.outbound_messages where kind = 'drop_live';
  assert public.enqueue_drop_alerts(2) = 2, 'capped';
  assert (select array_agg(phone order by phone) from q where dedupe_key like 'live:%') = array['+2348500000011', '+2348500000012'], 'oldest first';
end $$;

-- ---------------------------------------------------------- who can see it
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.outbound_messages) = 0, 'owners never see the queue';
  begin
    perform public.take_outbound(1);
    raise exception 'an owner took messages';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.enqueue_message('+2348500000001', 'card', '{}');
    raise exception 'an owner queued a message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.wa_contacts;
    raise exception 'an owner read contacts';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a700-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.outbound_messages) > 0, 'admins see spend';
end $$;

rollback;
