-- Publishing and paying: drafts, the server's price (rule 11), the free first drop, Paystack
-- completion (idempotent, wrong amounts refused), one live plus one scheduled (rule 13), more
-- Tikkas, season packs, end and extend, and the guarantee.
begin;

create temp table t (k text primary key, v uuid);
create temp table drafts (k text primary key, j jsonb);
create temp table refs (k text primary key, ref text);
grant all on t, drafts, refs to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a900-000000000001', 'owner9@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a900-000000000002', 'staff9@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a900-000000000003', 'admin9@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-a900-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Publish Test', 'publishtest', 'PU', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select v, '00000000-0000-4000-a900-000000000002', 'staff' from t where k = 'biz';

-- Drafts: a 1 / 9 / rest mix.
create function pg_temp.draft(p_slug text, p_total int, p_starts interval, p_days int) returns jsonb language sql as $$
  select jsonb_build_object('slug', p_slug, 'title', 'Drop ' || p_slug, 'total_cards', p_total,
    'starts_at', now() + p_starts, 'ends_at', now() + p_starts + make_interval(days => p_days), 'validity_days', 14,
    'rewards', jsonb_build_array(
      jsonb_build_object('tier', 'legendary', 'kind', 'free_item', 'title', 'Free set', 'quantity', 1),
      jsonb_build_object('tier', 'rare', 'kind', 'percent_off', 'value', 30, 'title', '30% off', 'quantity', 9),
      jsonb_build_object('tier', 'common', 'kind', 'percent_off', 'value', 10, 'title', '10% off', 'quantity', p_total - 10)));
$$;
insert into drafts values
  ('first', pg_temp.draft('first', 150, interval '0', 10)),
  ('second', pg_temp.draft('second', 100, interval '0', 5)),
  ('overlap', pg_temp.draft('overlap', 100, interval '9 days', 5)),
  ('next', pg_temp.draft('next', 250, interval '11 days', 10)),
  ('third', pg_temp.draft('third', 100, interval '25 days', 3)),
  ('late', pg_temp.draft('late', 250, interval '30 days', 3));

-- ------------------------------------------------- drafts and the price
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.save_drop_draft((select v from t where k = 'biz'), null, (select j from drafts where k = 'first'));
    raise exception 'staff saved a drop';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.quote_drop((select v from t where k = 'biz'), 100);
    raise exception 'staff saw prices';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid;
  q jsonb;
begin
  d := public.save_drop_draft(biz, null, (select j from drafts where k = 'first'));
  insert into t values ('first', d);
  assert (select status = 'draft' and total_cards = 150 and new_reserved_pct = 70 from public.drops where id = d), 'a draft with defaults';
  assert (select sum(quantity) from public.rewards where drop_id = d) = 150, 'rewards saved';
  perform public.save_drop_draft(biz, d, (select j || '{"title": "Glow week"}' from drafts where k = 'first'));
  assert (select title from public.drops where id = d) = 'Glow week' and (select count(*) from public.rewards where drop_id = d) = 3, 'edited, rewards replaced';
  assert (select count(*) from public.cards where drop_id = d) = 0, 'owners never see the deck';

  q := public.quote_drop(biz, 150);
  assert q ->> 'kind' = 'voucher' and q ->> 'tier' = 'free' and q ->> 'source' = 'signup', 'the first drop is free: ' || q::text;
  q := public.quote_drop(biz, 250);
  assert q ->> 'kind' = 'paid' and q ->> 'tier' = 'small' and (q ->> 'amount_kobo')::int = 500000 and (q ->> 'free_max')::int = 200, 'too big for free: ' || q::text;
  q := public.quote_drop(biz, 1001);
  assert q ->> 'tier' = 'large' and (q ->> 'amount_kobo')::int = 2000000, 'large';
  assert public.quote_drop(biz, 3001) ->> 'kind' = 'contact', 'over 3,000: talk to us';

  -- Publishing checks the rewards add up.
  perform public.save_drop_draft(biz, d, (select j || '{"title": "Glow week", "total_cards": 160}' from drafts where k = 'first'));
  assert public.publish_drop(d) ->> 'problem' = 'rewards_dont_add_up', 'rewards must add up';
  perform public.save_drop_draft(biz, d, (select j || '{"title": "Glow week"}' from drafts where k = 'first'));

  q := public.publish_drop(d);
  assert q ->> 'kind' = 'published' and q ->> 'source' = 'signup', 'published free: ' || q::text;
  assert (select status = 'published' and paid_with = 'voucher' and payment_status = 'free' and tier_id = 'free' and tier_max_cards = 200
          and published_at = now() from public.drops where id = d), 'stored';
  assert (select used_by_drop_id = d from public.drop_vouchers where business_id = biz and source = 'signup'), 'the free drop is used';
  assert public.publish_drop(d) ->> 'problem' = 'already_published', 'once';
  begin
    perform public.save_drop_draft(biz, d, (select j from drafts where k = 'first'));
    raise exception 'a published drop was edited as a draft';
  exception when check_violation then null;
  end;
  begin
    perform public.delete_drop_draft(d);
    raise exception 'a published drop was deleted';
  exception when check_violation then null;
  end;
  begin
    update public.drops set total_cards = 3000 where id = d;
    raise exception 'an owner changed a drop directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------- one live plus one scheduled
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  q jsonb;
  q2 jsonb;
  d uuid;
begin
  d := public.save_drop_draft(biz, null, (select j from drafts where k = 'second'));
  assert public.publish_drop(d) ->> 'problem' = 'live_exists', 'one live drop at a time';
  perform public.delete_drop_draft(d);
  assert not exists (select 1 from public.drops where id = d), 'drafts can be deleted';
  d := public.save_drop_draft(biz, null, (select j from drafts where k = 'overlap'));
  assert public.publish_drop(d) ->> 'problem' = 'overlaps_live', 'not before the live one ends';

  -- The next drop: too big for free, so it's paid.
  d := public.save_drop_draft(biz, null, (select j from drafts where k = 'next'));
  insert into t values ('next', d);
  q := public.publish_drop(d);
  assert q ->> 'kind' = 'payment' and (q ->> 'amount_kobo')::int = 500000 and q ->> 'tier' = 'small', 'pay for the next one: ' || q::text;
  assert (select status = 'draft' and payment_status = 'pending' from public.drops where id = d), 'still a draft until paid';
  q2 := public.publish_drop(d);
  assert q2 ->> 'payment_id' = q ->> 'payment_id', 'tapping Pay again reuses the payment';
  insert into refs values ('next', q ->> 'reference');
  begin
    perform public.complete_payment(q ->> 'reference', 500000);
    raise exception 'an owner completed their own payment';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------------ Paystack
reset role;
do $$
declare
  d uuid := (select v from t where k = 'next');
  q jsonb;
begin
  assert (select count(*) from public.cards where drop_id = (select v from t where k = 'first')) = 150, 'the free drop''s deck was built';
  assert (select count(*) from public.cards where drop_id = d) = 0, 'no deck until paid';
  assert public.complete_payment('tk_nope', 500000) ->> 'kind' = 'unknown', 'unknown reference';
  assert public.complete_payment((select ref from refs where k = 'next'), 100) ->> 'kind' = 'failed', 'a wrong amount fails';
  assert (select status from public.payments where paystack_reference = (select ref from refs where k = 'next')) = 'failed', 'marked failed';
  assert (select status = 'draft' and payment_status is null from public.drops where id = d), 'nothing published';
  assert public.complete_payment((select ref from refs where k = 'next'), 500000) ->> 'kind' = 'already', 'a failed payment stays failed';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000001","role":"authenticated"}', true);
insert into refs select 'next2', public.publish_drop((select v from t where k = 'next')) ->> 'reference';
reset role;
do $$
declare
  d uuid := (select v from t where k = 'next');
  q jsonb;
begin
  assert (select ref from refs where k = 'next2') <> (select ref from refs where k = 'next'), 'a new payment after a failed one';
  q := public.complete_payment((select ref from refs where k = 'next2'), 500000);
  assert q ->> 'kind' = 'published', 'paid and published: ' || q::text;
  assert (select status = 'published' and paid_with = 'payment' and payment_status = 'paid' and tier_id = 'small' and tier_max_cards = 300
          from public.drops where id = d), 'stored';
  assert (select count(*) from public.cards where drop_id = d) = 250, 'deck built';
  assert public.complete_payment((select ref from refs where k = 'next2'), 500000) ->> 'kind' = 'already', 'Paystack''s repeat changes nothing';
  assert (select count(*) from public.cards where drop_id = d) = 250, 'no second deck';
  assert (select status = 'paid' and paid_at = now() from public.payments where paystack_reference = (select ref from refs where k = 'next2')), 'payment paid';

  -- Paid for, but it can't go out any more (a drop is already scheduled): it becomes a drop for later.
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at)
  select (select v from t where k = 'biz'), 'late', 'Late', 250, now() + interval '30 days', now() + interval '33 days' returning id into d;
  insert into public.rewards (drop_id, tier, kind, title, quantity) values (d, 'common', 'perk', 'Perk', 250);
  insert into public.payments (business_id, kind, drop_id, to_tier, amount_kobo, paystack_reference)
  values ((select v from t where k = 'biz'), 'drop', d, 'small', 500000, 'tk_late');
  q := public.complete_payment('tk_late', 500000);
  assert q ->> 'kind' = 'credited', 'credited: ' || q::text;
  assert (select count(*) from public.drop_vouchers where business_id = (select v from t where k = 'biz') and source = 'paid' and tier_id = 'small') = 1, 'kept as a drop for later';
  assert (select status from public.drops where id = d) = 'draft', 'the late drop stays a draft';
end $$;

-- ------------------------------------- rule 13, more Tikkas, packs, end, extend
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  first uuid := (select v from t where k = 'first');
  d uuid;
  q jsonb;
begin
  d := public.save_drop_draft(biz, null, (select j from drafts where k = 'third'));
  assert public.publish_drop(d) ->> 'problem' = 'scheduled_exists', 'one scheduled drop at a time';

  -- More Tikkas, free while it fits the drop's size (the free drop's 200).
  q := public.add_tikkas(first, 50);
  assert q ->> 'kind' = 'added' and (q ->> 'total')::int = 200, 'added free: ' || q::text;
  assert (select total_cards from public.drops where id = first) = 200, 'total grows';
  assert (select sum(quantity) from public.rewards where drop_id = first) = 200, 'rewards grow to match';
  -- Past the free size: the full price of the size that fits (it was a free drop).
  q := public.add_tikkas(first, 10);
  assert q ->> 'kind' = 'payment' and (q ->> 'amount_kobo')::int = 500000 and q ->> 'tier' = 'small', 'upgrade: ' || q::text;
  insert into refs values ('upgrade', q ->> 'reference');
  -- The paid drop going from 250 to 400: the difference, Medium minus Small.
  q := public.add_tikkas((select v from t where k = 'next'), 150);
  assert (q ->> 'amount_kobo')::int = 500000 and q ->> 'tier' = 'medium', 'pay the difference: ' || q::text;
  assert public.add_tikkas((select v from t where k = 'next'), 0) ->> 'problem' = 'not_live', 'nothing to add';

  q := public.buy_pack(biz, 'small3');
  assert (q ->> 'amount_kobo')::int = 1200000, 'the pack''s price';
  insert into refs values ('pack', q ->> 'reference');

  assert public.extend_drop((select v from t where k = 'next'), (select starts_at + interval '31 days' from public.drops where id = (select v from t where k = 'next'))) ->> 'problem' = 'too_long', '30 days at most';
  assert public.extend_drop(first, (select starts_at + interval '12 days' from public.drops where id = first)) ->> 'problem' = 'overlaps_next', 'not into the next drop';
  assert public.extend_drop((select v from t where k = 'next'), (select starts_at + interval '20 days' from public.drops where id = (select v from t where k = 'next'))) ->> 'kind' = 'extended', 'extended';
end $$;

reset role;
do $$
declare
  first uuid := (select v from t where k = 'first');
  biz uuid := (select v from t where k = 'biz');
begin
  assert (select count(distinct position) = 200 and max(position) = 199 and count(distinct serial) = 200 and max(serial) = 200
          from public.cards where drop_id = first), 'the 50 added cards carry on positions and serials';
  assert (select count(*) from public.cards c join public.rewards r on r.id = c.reward_id where c.drop_id = first group by r.tier having r.tier = 'legendary') = 1, 'still one legendary';
  assert public.complete_payment((select ref from refs where k = 'upgrade'), 500000) ->> 'kind' = 'upgraded', 'upgrade paid';
  assert (select total_cards = 210 and tier_id = 'small' and tier_max_cards = 300 and paid_with = 'payment' from public.drops where id = first), 'bigger drop';
  assert (select count(*) from public.cards where drop_id = first) = 210, 'ten more cards';

  -- An abandoned payment that Paystack later confirms still counts.
  update public.payments set created_at = now() - interval '2 hours' where paystack_reference = (select ref from refs where k = 'pack');
  assert public.abandon_stale_payments() >= 1, 'stale payments abandoned';
  assert (select status from public.payments where paystack_reference = (select ref from refs where k = 'pack')) = 'abandoned', 'abandoned';
  assert public.complete_payment((select ref from refs where k = 'pack'), 1200000) ->> 'kind' = 'pack', 'the money arrived anyway';
  assert (select count(*) from public.drop_vouchers where business_id = biz and source = 'pack' and tier_id = 'small'
          and expires_at = now() + interval '12 months' and used_by_drop_id is null) = 3, 'three drops, for a year';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000001","role":"authenticated"}', true);
do $$
declare q jsonb;
begin
  q := public.quote_drop((select v from t where k = 'biz'), 250);
  assert q ->> 'kind' = 'voucher' and q ->> 'source' in ('paid', 'pack'), 'covered now: ' || q::text;
  perform public.end_drop_early((select v from t where k = 'first'));
  assert (select status = 'ended_early' and ends_at <= now() + interval '1 second' from public.drops where id = (select v from t where k = 'first')), 'ended early';
  begin
    perform public.grant_drop((select v from t where k = 'biz'), 'large');
    raise exception 'an owner gave themselves a drop';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a900-000000000003","role":"authenticated"}', true);
select public.grant_drop((select v from t where k = 'biz'), 'large');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.complete_payment('tk_late', 500000);
    raise exception 'anon completed a payment';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- --------------------------------------------------------- the guarantee
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  g uuid;
  g2 uuid;
  w uuid;
begin
  assert (select count(*) from public.drop_vouchers where business_id = biz and source = 'admin' and tier_id = 'large') = 1, 'Tikka''s gift';

  -- A paid Small drop that ended with no visits, views from three places: earned.
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at, status, paid_with, tier_id, tier_max_cards)
  values (biz, 'quiet', 'Quiet', 100, now() - interval '20 days', now() - interval '1 day', 'published', 'payment', 'small', 300) returning id into g;
  insert into public.events (drop_id, business_id, type, source) values (g, biz, 'view', 'wa'), (g, biz, 'view', 'ig'), (g, biz, 'view', 'qr');
  -- The same again, but a Tikka from it can still be used: not checked yet.
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at, status, paid_with, tier_id, tier_max_cards)
  values (biz, 'waiting', 'Waiting', 100, now() - interval '20 days', now() - interval '1 day', 'published', 'payment', 'small', 300) returning id into w;
  insert into public.rewards (drop_id, tier, kind, title, quantity) values (w, 'common', 'perk', 'Perk', 100);
  perform private.build_deck(w);
  insert into public.leads (business_id, phone, first_name) values (biz, '+2348700000001', 'Ada');
  insert into public.claims (drop_id, card_id, lead_id, phone, first_name, code, view_token, is_new_lead, expires_at)
  select w, (select id from public.cards where drop_id = w and position = 0), l.id, l.phone, 'Ada', 'PU-AAAAC', 'tok-waiting', true, now() + interval '3 days'
  from public.leads l where l.phone = '+2348700000001';
  insert into public.events (drop_id, business_id, type, source) values (w, biz, 'view', 'wa'), (w, biz, 'view', 'ig'), (w, biz, 'view', 'qr');

  -- Time passes: the free drop that ended early is over.
  update public.drops set starts_at = now() - interval '5 days', ends_at = now() - interval '1 hour' where id = (select v from t where k = 'first');
  assert public.evaluate_due_guarantees() = 1, 'one earned';
  assert (select count(*) from public.drop_vouchers where business_id = biz and source = 'guarantee' and tier_id = 'small') = 1, 'a free Small drop';
  assert (select guarantee_used from public.business_private where business_id = biz), 'used for this business';
  assert (select guarantee_checked_at = now() from public.drops where id = g), 'checked once';
  assert (select guarantee_checked_at is null from public.drops where id = w), 'not while a Tikka can still be used';
  assert (select guarantee_checked_at = now() from public.drops where id = (select v from t where k = 'first')), 'the free drop was checked too';

  -- Once per business: the waiting drop, when it's due, earns nothing.
  update public.claims set expires_at = now() - interval '1 minute' where drop_id = w;
  assert public.evaluate_due_guarantees() = 0, 'never twice';
  assert (select guarantee_checked_at = now() from public.drops where id = w), 'checked when due';

  -- Each condition on its own, with the guarantee unused.
  update public.business_private set guarantee_used = false where business_id = biz;
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at, status, paid_with, tier_id, tier_max_cards, ignored_warnings)
  values (biz, 'warned', 'Warned', 100, now() - interval '20 days', now() - interval '1 day', 'published', 'payment', 'small', 300, '{no_bounce_back}') returning id into g2;
  insert into public.events (drop_id, business_id, type, source) values (g2, biz, 'view', 'wa'), (g2, biz, 'view', 'ig'), (g2, biz, 'view', 'qr');
  insert into public.drops (business_id, slug, title, total_cards, starts_at, ends_at, status, paid_with, tier_id, tier_max_cards)
  values (biz, 'fewsources', 'Few', 100, now() - interval '20 days', now() - interval '1 day', 'published', 'payment', 'small', 300);
  insert into public.events (drop_id, business_id, type, source) select id, biz, 'view', 'wa' from public.drops where slug = 'fewsources';
  assert public.evaluate_due_guarantees() = 0, 'ignored warnings without a template, or views from one place: no';
end $$;

rollback;
