-- Tikka admin: admins only; flags, prices, the moderation queue, hiding and pinning drops; no
-- claimer's phone number in anything it returns.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b600-000000000001', 'owner20@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b600-000000000002', 'admin20@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-b600-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b600-000000000001","role":"authenticated"}', true);
select public.create_business('Admin Test', 'admintest', 'AT', 'Beauty', 'Rivers', 'Port Harcourt', 'GRA', '#9C3B5C', '#FFFFFF');
reset role;

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
select '00000000-0000-4000-b600-0000000000d1', id, 'admin-week', 'Admin week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published'
from public.businesses where slug = 'admintest';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-b600-0000000000d1', 'common', 'percent_off', 10, '10% off', 10);
select private.build_deck('00000000-0000-4000-b600-0000000000d1');

do $$
declare
  tok text;
  r record;
begin
  tok := public.create_claim_intent('00000000-0000-4000-b600-0000000000d1', 'Ada', false, 'v1', 'ig') ->> 'token';
  select * into r from public.claim_card(tok, '+2348200000001');
  update public.claims set redeemed_at = now() where id = r.claim_id;
  perform public.submit_review((select view_token from public.claims where id = r.claim_id), 1, 'Bad');
  perform public.report_drop('00000000-0000-4000-b600-0000000000d1', 'Looks fake', 'h1');
end $$;

-- The owner reports the review.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b600-000000000001","role":"authenticated"}', true);
select public.report_review((select id from public.reviews where display_name = 'Ada'), 'Not a real customer');

-- An owner is not an admin.
do $$ begin
  begin
    perform public.admin_overview();
    raise exception 'owner read the overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_business((select id from public.businesses where slug = 'admintest'), p_verified => true);
    raise exception 'owner verified themselves';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The admin.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b600-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select id from public.businesses where slug = 'admintest');
  o jsonb := public.admin_overview();
  b jsonb;
  q jsonb := public.admin_reports();
begin
  assert (o ->> 'claims_today')::int >= 1 and (o ->> 'redemptions_today')::int >= 1, 'overview: ' || o::text;
  b := public.admin_businesses('Port Harcourt') -> 0;
  assert b ->> 'name' = 'Admin Test' and (b ->> 'drops_ready')::int = 1 and not (b ->> 'verified')::boolean, 'business row: ' || b::text;

  perform public.admin_set_business(biz, p_verified => true, p_founding => true);
  assert (select verified from public.businesses where id = biz), 'verified';
  assert (select founding_member from public.business_private where business_id = biz), 'founding member';
  assert not (select suspended from public.businesses where id = biz), 'suspended untouched';

  assert jsonb_array_length((select jsonb_agg(x) from jsonb_array_elements(q) x where x ->> 'business_name' = 'Admin Test')) = 2, 'a drop and a review in the queue: ' || q::text;
  assert q::text not like '%+234%', 'no phone numbers';

  -- Pin, then hide: hiding takes it off the marketplace and out of the carousel.
  perform public.admin_pin_drop('00000000-0000-4000-b600-0000000000d1', 'Port Harcourt''s finest', 'Ten Tikkas');
  assert exists (select 1 from public.marketplace_pins where drop_id = '00000000-0000-4000-b600-0000000000d1'), 'pinned';
  perform public.decide_drop_report('00000000-0000-4000-b600-0000000000d1', true);
  assert not (select show_in_marketplace from public.drops where id = '00000000-0000-4000-b600-0000000000d1'), 'hidden from the marketplace';
  assert not exists (select 1 from public.marketplace_pins where drop_id = '00000000-0000-4000-b600-0000000000d1'), 'unpinned';
  assert (select status from public.reports where target_type = 'drop' and target_id = '00000000-0000-4000-b600-0000000000d1') = 'hidden', 'report closed';
  perform public.admin_set_drop_shown('00000000-0000-4000-b600-0000000000d1', true);
  assert (select show_in_marketplace from public.drops where id = '00000000-0000-4000-b600-0000000000d1'), 'shown again';

  -- Keep the review.
  perform public.decide_review_report((select id from public.reviews where business_id = biz), false);
  assert (select status from public.reviews where business_id = biz) = 'visible', 'review kept';
  assert jsonb_array_length(coalesce((select jsonb_agg(x) from jsonb_array_elements(public.admin_reports()) x where x ->> 'business_name' = 'Admin Test'), '[]')) = 0, 'queue empty';

  -- Prices.
  perform public.admin_save_tier('small', 1700000, 1300000, 12);
  assert (select price_kobo from public.drop_tiers where id = 'small') = 1700000, 'tier price';
  perform public.admin_save_pack('small3', 4500000, false);
  assert not (select active from public.drop_packs where id = 'small3'), 'pack off sale';
  begin
    perform public.admin_save_tier('free', 100, 100, null);
    raise exception 'priced the free drop';
  exception when check_violation then null;
  end;
end $$;

rollback;
