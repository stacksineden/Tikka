-- The drop dashboard's numbers: the funnel from link activity and claims, sources and posters,
-- what's left of each reward (counts only), the report's inputs and fee; owners only.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b200-000000000001', 'owner16@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b200-000000000002', 'staff16@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b200-000000000001","role":"authenticated"}', true);
select public.create_business('Stats Test', 'statstest', 'SX', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select id, '00000000-0000-4000-b200-000000000002', 'staff' from public.businesses where slug = 'statstest';

-- A free first drop: 1 legendary, 9 thank-you.
insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status, paid_with, voucher_id, tier_id, tier_max_cards, payment_status)
select '00000000-0000-4000-b200-0000000000d1', b.id, 'stats-week', 'Stats week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published', 'voucher', v.id, 'free', 200, 'free'
from public.businesses b join public.drop_vouchers v on v.business_id = b.id and v.source = 'signup' where b.slug = 'statstest';
insert into public.rewards (drop_id, tier, kind, value, title, quantity, cost_kobo) values
  ('00000000-0000-4000-b200-0000000000d1', 'legendary', 'free_item', null, 'Free facial', 1, 800000),
  ('00000000-0000-4000-b200-0000000000d1', 'common', 'percent_off', 10, '10% off', 9, null);
select private.build_deck('00000000-0000-4000-b200-0000000000d1');

do $$
declare
  d uuid := '00000000-0000-4000-b200-0000000000d1';
  poster uuid := (select p.id from public.posters p join public.businesses b on b.id = p.business_id where b.slug = 'statstest' limit 1);
  tok text;
  r record;
begin
  -- Three visitors: two from Instagram, one scanned the counter poster.
  perform public.record_drop_event(d, 'view', 'ig', 'h1');
  perform public.record_drop_event(d, 'view', 'ig', 'h2');
  perform public.record_drop_event(d, 'view', 'qr', 'h3', poster);
  perform public.record_drop_event(d, 'unwrap', 'ig', 'h1');
  perform public.record_drop_event(d, 'unwrap', 'qr', 'h3');
  perform public.record_drop_event(d, 'claim_tap', 'ig', 'h1');
  perform public.record_drop_event(d, 'claim_tap', 'qr', 'h3');
  perform public.record_drop_event(d, 'claim_continue', 'ig', 'h1');
  perform public.record_drop_event(d, 'claim_continue', 'qr', 'h3');
  -- Two claims, one from the poster.
  tok := public.create_claim_intent(d, 'Ada', false, 'v1', 'ig') ->> 'token';
  perform public.claim_card(tok, '+2348160000001');
  tok := public.create_claim_intent(d, 'Bola', false, 'v3', 'qr', poster) ->> 'token';
  select * into r from public.claim_card(tok, '+2348160000002');
  -- Bola came in and spent ₦20,000.
  update public.claims set redeemed_at = now(), bill_amount_kobo = 2000000, customer_status = 'new' where id = r.claim_id;
  update public.leads set last_followup_at = now() where phone = '+2348160000001';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b200-000000000001","role":"authenticated"}', true);
do $$
declare
  s jsonb := public.get_drop_stats('00000000-0000-4000-b200-0000000000d1');
  rep jsonb := public.get_drop_report_data('00000000-0000-4000-b200-0000000000d1');
begin
  assert (s ->> 'unique_views')::int = 3 and (s ->> 'tore')::int = 2 and (s ->> 'tapped')::int = 2 and (s ->> 'continued')::int = 2, 'the funnel: ' || s::text;
  assert (s ->> 'claimed')::int = 2 and (s ->> 'redeemed')::int = 1 and (s ->> 'followed_up')::int = 1 and (s ->> 'new_claimers')::int = 2, 'claims, visits, follow-ups';
  assert s -> 'by_source' @> '[{"source": "ig", "views": 2, "claims": 1}, {"source": "qr", "views": 1, "claims": 1}]', 'by source: ' || (s -> 'by_source')::text;
  assert s -> 'qr_by_poster' @> '[{"label": "Shop counter", "views": 1, "claims": 1}]', 'by poster: ' || (s -> 'qr_by_poster')::text;
  assert (select sum((x ->> 'total')::int) from jsonb_array_elements(s -> 'rewards_left') x) = 10, 'every reward';
  assert (select sum((x ->> 'left')::int) from jsonb_array_elements(s -> 'rewards_left') x) = 8, 'two cards gone';
  assert s -> 'rewards_left' -> 0 ->> 'tier' = 'legendary', 'legendary first';
  assert (s ->> 'views_after_sellout')::int = 0, 'not sold out';
  assert s::text not like '%+234%', 'no numbers';
  assert jsonb_array_length(rep -> 'claims') = 2, 'two claims in the report';
  assert rep -> 'fee' = '{"kind": "free"}'::jsonb, 'a free first drop: ' || (rep -> 'fee')::text;
  assert rep::text not like '%+234%' and rep::text not like '%Bola%', 'the report carries no one';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b200-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.get_drop_stats('00000000-0000-4000-b200-0000000000d1');
    raise exception 'staff read drop numbers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_drop_report_data('00000000-0000-4000-b200-0000000000d1');
    raise exception 'staff read the report';
  exception when insufficient_privilege then null;
  end;
  -- The live feed: staff may see link activity (first names only), as the events policy allows.
  assert (select count(*) from public.events where drop_id = '00000000-0000-4000-b200-0000000000d1' and type = 'claim_completed') = 2, 'team sees the feed';
end $$;

rollback;
