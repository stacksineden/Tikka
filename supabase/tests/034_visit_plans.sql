-- Visit plans reach the business: the counter check shows when they said they'd come (never a
-- phone number), and the reminder on the planned day carries the time of day and goes as
-- tikka_visit_reminder once Meta approves it (tikka_expiry_reminder till then).
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c034-000000000001', 'owner34@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c034-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Visit Plans', 'visitplans', 'VP', 'Beauty', 'Kano', 'Kano', 'Nassarawa', '#9C3B5C', '#FFFFFF');
reset role;

do $$
declare
  d uuid;
  tok text;
  i int;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), 'plans', 'Plans drop', 10, 0, now() - interval '1 day', now() + interval '10 days', 14, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'common', 'percent_off', 10, '10% off', 10);
  perform private.build_deck(d);
  insert into t values ('drop', d);
  for i in 1..3 loop
    tok := private.intent_token();
    insert into public.claim_intents (drop_id, token, first_name) values (d, tok, 'Bola');
    perform public.claim_card(tok, '+234850003400' || i);
  end loop;
  -- 1: plans to come this afternoon (today). 2: plans to come in 3 days. 3: no plan.
  update public.claims set planned_visit_date = (now() at time zone 'Africa/Lagos')::date, planned_visit_part = 'afternoon'
  where drop_id = d and phone = '+2348500034001';
  update public.claims set planned_visit_date = (now() at time zone 'Africa/Lagos')::date + 3, planned_visit_part = 'morning'
  where drop_id = d and phone = '+2348500034002';
end $$;

-- ------------------------------------------------------------ the counter
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c034-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid := (select v from t where k = 'drop');
  r jsonb;
begin
  r := public.check_code(biz, (select code from public.claims where drop_id = d and phone = '+2348500034001'));
  assert r ->> 'kind' = 'valid', 'valid: ' || r::text;
  assert r ->> 'planned_visit_date' = ((now() at time zone 'Africa/Lagos')::date)::text and r ->> 'planned_visit_part' = 'afternoon', 'with the plan';
  assert r::text !~ '850003400', 'never the number';
  r := public.check_code(biz, (select code from public.claims where drop_id = d and phone = '+2348500034003'));
  assert r -> 'planned_visit_date' = 'null'::jsonb, 'no plan, no day';
end $$;
reset role;

-- ------------------------------------------------------------ the reminder
do $$
declare
  d uuid := (select v from t where k = 'drop');
  got record;
begin
  update public.claims set claimed_at = now() - interval '5 days', expires_at = now() + interval '2 days' where drop_id = d;
  update public.wa_templates set approved = true where name = 'tikka_expiry_reminder';
  update public.wa_templates set approved = false where name = 'tikka_visit_reminder';
  -- Only this test's messages are due now.
  update public.outbound_messages set scheduled_for = now() + interval '1 day' where status = 'queued';

  assert public.enqueue_due_reminders() = 3, 'three due';
  assert (select payload ->> 'visit_part' from public.outbound_messages where kind = 'expiry_reminder' and phone = '+2348500034001') = 'afternoon', 'today: the time of day';
  assert (select not payload ? 'visit_part' from public.outbound_messages where kind = 'expiry_reminder' and phone = '+2348500034002'), 'another day: plain';
  assert (select not payload ? 'visit_part' from public.outbound_messages where kind = 'expiry_reminder' and phone = '+2348500034003'), 'no plan: plain';

  -- Not approved yet: the plain template, so nobody misses their reminder.
  select * into got from public.take_outbound(50) x where x.phone = '+2348500034001';
  assert got.template_name = 'tikka_expiry_reminder', 'falls back: ' || coalesce(got.template_name, 'null');

  -- Approved: the visit wording.
  update public.outbound_messages set status = 'queued' where phone = '+2348500034001';
  update public.wa_templates set approved = true where name = 'tikka_visit_reminder';
  select * into got from public.take_outbound(50) x where x.phone = '+2348500034001';
  assert got.template_name = 'tikka_visit_reminder', 'visit template: ' || coalesce(got.template_name, 'null');
end $$;

rollback;
