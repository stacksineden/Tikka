-- The marketplace list: open and upcoming drops only, never demo, suspended or hidden ones;
-- counts only, no phone numbers; Notify me raises the waiting count; drop reports go to the
-- queue once per visitor.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b500-000000000001', 'owner19@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b500-000000000001","role":"authenticated"}', true);
select public.create_business('Market Test', 'markettest', 'MK', 'Food', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;

-- Live, scheduled, ended, kept off the marketplace.
insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status, show_in_marketplace)
select x.id::uuid, b.id, x.slug, x.title, 10, 0, now() + x.s, now() + x.e, 'published', x.shown
from public.businesses b, (values
  ('00000000-0000-4000-b500-0000000000d1', 'm-live', 'Live one', interval '-1 hour', interval '5 days', true),
  ('00000000-0000-4000-b500-0000000000d2', 'm-soon', 'Soon one', interval '1 day', interval '5 days', true),
  ('00000000-0000-4000-b500-0000000000d3', 'm-past', 'Past one', interval '-9 days', interval '-1 day', true),
  ('00000000-0000-4000-b500-0000000000d4', 'm-hide', 'Hidden one', interval '-1 hour', interval '5 days', false)
) x(id, slug, title, s, e, shown) where b.slug = 'markettest';
insert into public.rewards (drop_id, tier, kind, value, title, quantity)
select d, t.tier, 'percent_off', 10, t.title, t.q from unnest(array[
  '00000000-0000-4000-b500-0000000000d1', '00000000-0000-4000-b500-0000000000d2', '00000000-0000-4000-b500-0000000000d3', '00000000-0000-4000-b500-0000000000d4']::uuid[]) d,
  (values ('legendary', 'Free meal', 1), ('rare', '30% off', 2), ('common', '10% off', 7)) t(tier, title, q);
select private.build_deck(id) from public.drops where slug like 'm-%';

do $$
declare
  tok text;
  m jsonb;
  live jsonb;
begin
  tok := public.create_claim_intent('00000000-0000-4000-b500-0000000000d1', 'Ada', false, 'v1', 'market') ->> 'token';
  perform public.claim_card(tok, '+2348190000001');
  -- Someone asks to hear when the upcoming drop opens.
  tok := public.create_notify_intent((select id from public.businesses where slug = 'markettest'), '00000000-0000-4000-b500-0000000000d2', 'v2');
  assert public.subscribe_notify(tok, '+2348190000002') ->> 'kind' = 'subscribed', 'subscribed';

  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  m := (select jsonb_agg(x) from jsonb_array_elements(public.marketplace_drops()) x where x ->> 'business_slug' = 'markettest');
  reset role;

  assert jsonb_array_length(m) = 2, 'live and upcoming only: ' || m::text;
  live := (select x from jsonb_array_elements(m) x where x ->> 'drop_slug' = 'm-live');
  assert live ->> 'status' = 'live' and (live ->> 'claimed')::int = 1 and (live ->> 'left_count')::int = 9 and (live ->> 'claims_last_hour')::int = 1, 'live counts: ' || live::text;
  assert (live ->> 'legendary')::int = 1 and (live ->> 'rare')::int = 2 and (live ->> 'thank_you')::int = 7, 'tiers';
  assert live ->> 'city' = 'Ibadan', 'nationwide';
  assert (select x ->> 'status' = 'scheduled' and (x ->> 'waiting')::int = 1 from jsonb_array_elements(m) x where x ->> 'drop_slug' = 'm-soon'), 'one waiting for the upcoming drop';
  assert m::text not like '%+234%' and m::text not like '%Ada%', 'no claimers';
end $$;

-- A demo or suspended business doesn't show.
update public.businesses set is_demo = true where slug = 'markettest';
do $$ begin assert not exists (select 1 from jsonb_array_elements(public.marketplace_drops()) x where x ->> 'business_slug' = 'markettest'), 'no demo'; end $$;
update public.businesses set is_demo = false, suspended = true where slug = 'markettest';
do $$ begin assert not exists (select 1 from jsonb_array_elements(public.marketplace_drops()) x where x ->> 'business_slug' = 'markettest'), 'no suspended'; end $$;

-- Reports: once per visitor per drop; visitors can't call it directly.
do $$ begin
  assert public.report_drop('00000000-0000-4000-b500-0000000000d1', 'Looks fake', 'h1');
  assert public.report_drop('00000000-0000-4000-b500-0000000000d1', 'Looks fake again', 'h1');
  assert public.report_drop('00000000-0000-4000-b500-0000000000d1', 'Not real', 'h2');
  assert not public.report_drop('00000000-0000-4000-b500-0000000000ff', 'No such drop', 'h1');
  assert (select count(*) from public.reports where target_id = '00000000-0000-4000-b500-0000000000d1') = 2, 'one per visitor';
end $$;
set local role anon;
do $$ begin
  begin
    perform public.report_drop('00000000-0000-4000-b500-0000000000d1', 'x', 'h3');
    raise exception 'anon reported directly';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
