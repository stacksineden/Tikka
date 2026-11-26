-- Flat pricing: one paid level (₦10,000, founding ₦5,000) for any drop up to 1,000 Tikkas, the free
-- first drop up to 1,000 too, the season pack at ₦25,000 (founding ₦12,000), adding Tikkas free up
-- to 1,000, and old Small and Large drops-without-paying filed under the one paid level.
begin;

create temp table t (k text primary key, v uuid);
create temp table refs (k text primary key, ref text);
grant all on t, refs to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c040-000000000001', 'owner40@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c040-000000000002', 'founder40@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c040-000000000003', 'admin40@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c040-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Flat Price', 'flatprice40', 'FP', 'Beauty', 'Kaduna', 'Kaduna', 'Barnawa', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000002","role":"authenticated"}', true);
insert into t select 'founder', public.create_business('Founding Price', 'foundprice40', 'FO', 'Food', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
update public.business_private set founding_member = true where business_id = (select v from t where k = 'founder');

create function pg_temp.draft(p_slug text, p_total int, p_starts interval) returns jsonb language sql as $$
  select jsonb_build_object('slug', p_slug, 'title', 'Drop ' || p_slug, 'total_cards', p_total,
    'starts_at', now() + p_starts, 'ends_at', now() + p_starts + interval '7 days', 'validity_days', 14,
    'rewards', jsonb_build_array(
      jsonb_build_object('tier', 'legendary', 'kind', 'free_item', 'title', 'Free set', 'quantity', 1),
      jsonb_build_object('tier', 'rare', 'kind', 'percent_off', 'value', 30, 'title', '30% off', 'quantity', 4),
      jsonb_build_object('tier', 'common', 'kind', 'percent_off', 'value', 10, 'title', '10% off', 'quantity', p_total - 5)));
$$;

-- --------------------------------------------------------------- the tiers
-- Admin changes prices on the live project, so the prices this test works with are set here
-- (rolled back with everything else); the shape of the levels is checked as it is.
update public.drop_tiers set price_kobo = 1000000, founding_price_kobo = 500000, guarantee_min_redemptions = 10 where id = 'medium';
update public.drop_packs set price_kobo = 2500000, founding_price_kobo = 1200000 where id = 'medium3';
do $$ begin
  assert (select label = 'Drop' and max_cards = 1000 and active
          from public.drop_tiers where id = 'medium'), 'one paid level: Drop, up to 1,000';
  assert (select max_cards from public.drop_tiers where id = 'free') = 1000, 'the free first drop goes up to 1,000';
  assert (select count(*) from public.drop_tiers where id in ('small', 'large') and not active) = 2, 'Small and Large are switched off';
  assert (select count(*) from public.drop_tiers where active and price_kobo > 0) = 1, 'one paid level on sale';
  assert (select active from public.drop_packs where id = 'medium3'), 'the pack is on sale';
  assert not (select active from public.drop_packs where id = 'small3'), 'the Small pack is off sale';
end $$;

-- ------------------------------------------- the same price for any size
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  q jsonb;
  d uuid;
begin
  assert public.quote_drop(biz, 900) ->> 'source' = 'signup', 'the first drop is free at 900';
  assert public.quote_drop(biz, 1001) ->> 'kind' = 'contact' and (public.quote_drop(biz, 1001) ->> 'max')::int = 1000, 'over 1,000: talk to us';

  d := public.save_drop_draft(biz, null, pg_temp.draft('first', 40, interval '0'));
  insert into t values ('first', d);
  assert public.publish_drop(d) ->> 'source' = 'signup', 'a 40-Tikka first drop goes out free';
  assert (select tier_id = 'free' and tier_max_cards = 1000 from public.drops where id = d), 'with room to 1,000';

  q := public.quote_drop(biz, 40);
  assert q ->> 'kind' = 'paid' and q ->> 'tier' = 'medium' and (q ->> 'amount_kobo')::int = 1000000, '40 Tikkas: ₦10,000: ' || q::text;
  q := public.quote_drop(biz, 900);
  assert q ->> 'kind' = 'paid' and (q ->> 'amount_kobo')::int = 1000000, '900 Tikkas: ₦10,000 too: ' || q::text;

  -- Adding Tikkas: free all the way to 1,000, then talk to us.
  q := public.add_tikkas(d, 900);
  assert q ->> 'kind' = 'added' and (q ->> 'total')::int = 940, 'added free past the old 200: ' || q::text;
  q := public.add_tikkas(d, 60);
  assert q ->> 'kind' = 'added' and (q ->> 'total')::int = 1000, 'up to 1,000: ' || q::text;
  q := public.add_tikkas(d, 1);
  assert q ->> 'kind' = 'contact', 'past 1,000: talk to us: ' || q::text;
  assert not exists (select 1 from public.payments where drop_id = d and kind = 'upgrade'), 'never a charge for adding';

  -- The pack, at the public price.
  q := public.buy_pack(biz, 'medium3');
  assert (q ->> 'amount_kobo')::int = 2500000, 'pack: ₦25,000: ' || q::text;
  insert into refs values ('pack', q ->> 'reference');
  begin
    perform public.buy_pack(biz, 'small3');
    raise exception 'bought a pack that''s off sale';
  exception when no_data_found then null;
  end;
end $$;

-- Founding members: ₦5,000 a drop, ₦12,000 the pack.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'founder');
  q jsonb;
begin
  q := public.buy_pack(biz, 'medium3');
  assert (q ->> 'amount_kobo')::int = 1200000, 'founding pack: ₦12,000: ' || q::text;
  perform public.publish_drop(public.save_drop_draft(biz, null, pg_temp.draft('ffirst', 50, interval '0')));
  q := public.quote_drop(biz, 900);
  assert q ->> 'kind' = 'paid' and (q ->> 'amount_kobo')::int = 500000, 'founding: ₦5,000 for 900: ' || q::text;
  q := public.quote_drop(biz, 40);
  assert (q ->> 'amount_kobo')::int = 500000, 'and for 40';
end $$;
reset role;

-- ------------------------------------- old drops-without-paying, and the order
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  v public.drop_vouchers%rowtype;
begin
  -- The pack arrives: three drops of the one paid level.
  assert public.complete_payment((select ref from refs where k = 'pack'), 2500000) ->> 'kind' = 'pack', 'pack paid';
  assert (select count(*) from public.drop_vouchers where business_id = biz and source = 'pack' and tier_id = 'medium') = 3, 'three drops';

  -- An old Small payment that's credited, an old Large gift, a guarantee on an old Small drop: all filed as Drop.
  insert into public.drop_vouchers (business_id, tier_id, source) values (biz, 'small', 'paid') returning * into v;
  assert v.tier_id = 'medium', 'an old Small one becomes a drop: ' || v.tier_id;
  insert into public.drop_vouchers (business_id, tier_id, source) values (biz, 'large', 'admin') returning * into v;
  assert v.tier_id = 'medium', 'an old Large one too';
  assert not exists (select 1 from public.drop_vouchers where used_by_drop_id is null and tier_id in ('small', 'large')), 'no unused old sizes left anywhere';
end $$;

-- A business with its free first drop and a pack uses the free one first.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000003","role":"authenticated"}', true);
insert into t select 'newbiz', public.create_business('New Biz', 'newbiz40', 'NB', 'Beauty', 'Kano', 'Kano', 'Nassarawa', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.drop_vouchers (business_id, tier_id, source, expires_at) values ((select v from t where k = 'newbiz'), 'medium', 'pack', now() + interval '1 month');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000003","role":"authenticated"}', true);
do $$ begin
  assert public.quote_drop((select v from t where k = 'newbiz'), 300) ->> 'source' = 'signup', 'the free first drop goes before the pack';
end $$;

-- Admin sets the pack's founding price; the old 3-argument call still works.
do $$ begin
  perform public.admin_save_pack('medium3', 2600000, true, 1300000);
  assert (select price_kobo = 2600000 and founding_price_kobo = 1300000 from public.drop_packs where id = 'medium3'), 'both prices saved';
  perform public.admin_save_pack('medium3', 2500000, true);
  assert (select price_kobo = 2500000 and founding_price_kobo = 1300000 from public.drop_packs where id = 'medium3'), 'founding price kept';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c040-000000000001","role":"authenticated"}', true);
do $$ begin
  perform public.admin_save_pack('medium3', 1, true, 1);
  raise exception 'an owner changed the pack price';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Anyone sees the one pack on sale, never the old one.
set local role anon;
do $$ begin
  assert (select count(*) from public.drop_packs) = 1, 'one pack on sale';
end $$;
reset role;

rollback;
