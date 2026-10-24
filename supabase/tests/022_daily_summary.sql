-- The daily summary's rows: the counts, the owner's number (their alert number, else the Chat on
-- WhatsApp button), the last finished drop; nobody with the summary off or no number; server only.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b800-000000000001', 'owner22a@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b800-000000000002', 'owner22b@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b800-000000000003', 'owner22c@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b800-000000000001","role":"authenticated"}', true);
select public.create_business('Summary A', 'summarya', 'SA', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF', '[{"kind":"whatsapp","value":"+2348220000001"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b800-000000000002","role":"authenticated"}', true);
select public.create_business('Summary B', 'summaryb', 'SB', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF', '[{"kind":"whatsapp","value":"+2348220000002"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b800-000000000003","role":"authenticated"}', true);
select public.create_business('Summary C', 'summaryc', 'SC', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

-- A turned their alerts to their own number; B turned the summary off; C has no number at all.
insert into public.business_private (business_id, owner_whatsapp) select id, '+2348229999999' from public.businesses where slug = 'summarya'
  on conflict (business_id) do update set owner_whatsapp = excluded.owner_whatsapp;
insert into public.business_private (business_id, daily_summary) select id, false from public.businesses where slug = 'summaryb'
  on conflict (business_id) do update set daily_summary = false;

-- A: a drop that ended (one person came in) and one running now.
insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
select x.id::uuid, b.id, x.slug, x.title, 10, 0, now() + x.s, now() + x.e, 'published'
from public.businesses b, (values
  ('00000000-0000-4000-b800-0000000000d1', 'sum-old', 'Old week', interval '-20 days', interval '-10 days'),
  ('00000000-0000-4000-b800-0000000000d2', 'sum-now', 'This week', interval '-3 days', interval '5 days')) x(id, slug, title, s, e)
where b.slug = 'summarya';
insert into public.rewards (drop_id, tier, kind, value, title, quantity)
select d, 'common', 'percent_off', 10, '10% off', 10 from unnest(array['00000000-0000-4000-b800-0000000000d1', '00000000-0000-4000-b800-0000000000d2']::uuid[]) d;
select private.build_deck(d) from unnest(array['00000000-0000-4000-b800-0000000000d1', '00000000-0000-4000-b800-0000000000d2']::uuid[]) d;

do $$
declare
  tok text;
  r record;
  n int := 0;
  phones text[] := array['+2348221000001', '+2348221000002', '+2348221000003', '+2348221000004'];
  ids uuid[] := '{}';
begin
  -- The old drop: one claim, redeemed (opened briefly so the claim goes through).
  update public.drops set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where id = '00000000-0000-4000-b800-0000000000d1';
  tok := public.create_claim_intent('00000000-0000-4000-b800-0000000000d1', 'Old', false, 'v0', 'ig') ->> 'token';
  select * into r from public.claim_card(tok, '+2348221000009');
  update public.claims set redeemed_at = now() - interval '11 days', claimed_at = now() - interval '15 days', expires_at = now() - interval '1 day' where id = r.claim_id;
  update public.drops set starts_at = now() - interval '20 days', ends_at = now() - interval '10 days' where id = '00000000-0000-4000-b800-0000000000d1';

  -- This week: four claims.
  foreach tok in array phones loop
    n := n + 1;
    select * into r from public.claim_card(public.create_claim_intent('00000000-0000-4000-b800-0000000000d2', 'P' || n, false, 'v' || n, 'ig') ->> 'token', tok);
    ids := ids || r.claim_id;
  end loop;
  -- 1: new today. 2: claimed two days ago, coming tomorrow. 3: two days ago, expiring in two days. 4: redeemed.
  update public.claims set claimed_at = now() - interval '2 days', planned_visit_date = (now() at time zone 'Africa/Lagos')::date + 1, expires_at = now() + interval '10 days' where id = ids[2];
  update public.claims set claimed_at = now() - interval '2 days', expires_at = now() + interval '2 days' where id = ids[3];
  update public.claims set claimed_at = now() - interval '2 days', redeemed_at = now() - interval '1 day', planned_visit_date = (now() at time zone 'Africa/Lagos')::date + 1, expires_at = now() + interval '2 days' where id = ids[4];
  update public.claims set expires_at = now() + interval '10 days' where id = ids[1];
end $$;

do $$
declare
  a record;
begin
  select * into a from public.daily_summary_rows() where business_name = 'Summary A';
  assert found, 'A gets a summary';
  assert a.phone = '+2348229999999', 'to the alert number, not the button: ' || a.phone;
  assert a.new_claims = 1 and a.planning_tomorrow = 1 and a.expiring_soon = 1, format('counts %s %s %s', a.new_claims, a.planning_tomorrow, a.expiring_soon);
  assert a.last_drop_title = 'Old week' and a.last_drop_customers = 1, 'the last finished drop: ' || coalesce(a.last_drop_title, 'none');
  assert not exists (select 1 from public.daily_summary_rows() where business_name in ('Summary B', 'Summary C')), 'nobody with it off or without a number';
end $$;

set local role anon;
do $$ begin
  begin
    perform count(*) from public.daily_summary_rows();
    raise exception 'anon read owner numbers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b800-000000000001","role":"authenticated"}', true);
do $$ begin
  begin
    perform count(*) from public.daily_summary_rows();
    raise exception 'an owner read every owner''s number';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
