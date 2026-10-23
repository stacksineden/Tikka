-- Publishing and paying for drops (TECH_PLAN §4, §11). Rule 11: the server prices every drop;
-- the browser never sends an amount. Rule 13: one live drop plus at most one scheduled, 30 days
-- at most. Every function here is for the business's owner (staff can't), except the ones the
-- Paystack webhook and the crons call with the service role.

-- A drop paid for that couldn't publish when the money arrived (another drop went live in the
-- meantime, or its dates passed) becomes a drop-without-paying of the same size.
alter table public.drop_vouchers drop constraint drop_vouchers_source_check;
alter table public.drop_vouchers add constraint drop_vouchers_source_check check (source in ('signup', 'pack', 'guarantee', 'admin', 'paid'));

-- ---------------------------------------------------------------- drafts

-- The builder's Save. p_drop null makes a new draft. Takes the drop's fields and its rewards
-- (tier 'common' is "Thank-you"); only drafts can change.
create function public.save_drop_draft(p_business uuid, p_drop uuid, p_draft jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.drops := jsonb_populate_record(null::public.drops, p_draft);
  d public.drops%rowtype;
  id_out uuid;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can change drops' using errcode = 'insufficient_privilege';
  end if;
  if p_drop is null then
    insert into public.drops (business_id, slug, title, goal, template_id, total_cards, finish, eligibility, period_days,
      new_reserved_pct, show_in_marketplace, marketplace_cap, starts_at, ends_at, validity_days, valid_weekdays, bounce_back,
      audience_band, ignored_warnings, copied_from)
    values (p_business, r.slug, trim(r.title), coalesce(r.goal, 'new_customers'), r.template_id, r.total_cards,
      coalesce(r.finish, 'foil'), coalesce(r.eligibility, 'once_per_drop'), r.period_days, coalesce(r.new_reserved_pct, 70),
      coalesce(r.show_in_marketplace, true), r.marketplace_cap, r.starts_at, r.ends_at, coalesce(r.validity_days, 14),
      r.valid_weekdays, r.bounce_back, r.audience_band, coalesce(r.ignored_warnings, '{}'), r.copied_from)
    returning id into id_out;
  else
    select * into d from public.drops where id = p_drop and business_id = p_business for update;
    if not found then
      raise exception 'No such drop' using errcode = 'no_data_found';
    end if;
    if d.status <> 'draft' then
      raise exception 'Only drafts can be changed' using errcode = 'check_violation';
    end if;
    update public.drops set slug = r.slug, title = trim(r.title), goal = coalesce(r.goal, 'new_customers'), template_id = r.template_id,
      total_cards = r.total_cards, finish = coalesce(r.finish, 'foil'), eligibility = coalesce(r.eligibility, 'once_per_drop'),
      period_days = r.period_days, new_reserved_pct = coalesce(r.new_reserved_pct, 70),
      show_in_marketplace = coalesce(r.show_in_marketplace, true), marketplace_cap = r.marketplace_cap,
      starts_at = r.starts_at, ends_at = r.ends_at, validity_days = coalesce(r.validity_days, 14), valid_weekdays = r.valid_weekdays,
      bounce_back = r.bounce_back, audience_band = r.audience_band, ignored_warnings = coalesce(r.ignored_warnings, '{}')
    where id = p_drop;
    delete from public.rewards where drop_id = p_drop;
    id_out := p_drop;
  end if;

  insert into public.rewards (drop_id, tier, kind, value, title, action_text, terms, quantity, min_spend_kobo, requires_purchase, cost_kobo)
  select id_out, x.tier, x.kind, x.value, trim(x.title), x.action_text, x.terms, x.quantity, x.min_spend_kobo,
         coalesce(x.requires_purchase, false), x.cost_kobo
  from jsonb_populate_recordset(null::public.rewards, coalesce(p_draft -> 'rewards', '[]')) x;
  return id_out;
end;
$$;

create function public.delete_drop_draft(p_drop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can delete drafts' using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'draft' or exists (select 1 from public.payments p where p.drop_id = d.id and p.status = 'paid') then
    raise exception 'Only unpaid drafts can be deleted' using errcode = 'check_violation';
  end if;
  delete from public.drops where id = p_drop;
end;
$$;

-- ------------------------------------------------------------- pricing

-- The smallest unused drop-without-paying that fits (ties: the one that expires first).
create function private.pick_voucher(p_business uuid, p_total int) returns public.drop_vouchers
language sql stable set search_path = '' as $$
  select v.* from public.drop_vouchers v join public.drop_tiers t on t.id = v.tier_id
  where v.business_id = p_business and v.used_by_drop_id is null and (v.expires_at is null or v.expires_at > now())
    and t.max_cards >= p_total
  order by t.max_cards, v.expires_at nulls last, v.created_at
  limit 1;
$$;

-- Mirrors lib/pricing.ts quoteDrop: {kind: 'voucher', tier, voucher_id, source} |
-- {kind: 'paid', tier, amount_kobo, free_max} | {kind: 'contact', max}.
create function private.quote(p_business uuid, p_total int) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v public.drop_vouchers;
  t public.drop_tiers%rowtype;
  founding boolean := coalesce((select founding_member from public.business_private where business_id = p_business), false);
  largest int := (select max(max_cards) from public.drop_tiers where price_kobo > 0);
begin
  if p_total > largest then
    return jsonb_build_object('kind', 'contact', 'max', largest);
  end if;
  v := private.pick_voucher(p_business, p_total);
  if v.id is not null then
    return jsonb_build_object('kind', 'voucher', 'tier', v.tier_id, 'voucher_id', v.id, 'source', v.source);
  end if;
  select * into t from public.drop_tiers where price_kobo > 0 and max_cards >= p_total order by max_cards limit 1;
  return jsonb_build_object('kind', 'paid', 'tier', t.id,
    'amount_kobo', case when founding then t.founding_price_kobo else t.price_kobo end,
    'free_max', (select ft.max_cards from public.drop_tiers ft join public.drop_vouchers sv on sv.tier_id = ft.id
                 where sv.business_id = p_business and sv.source = 'signup' and sv.used_by_drop_id is null));
end;
$$;

create function public.quote_drop(p_business uuid, p_total_cards int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees prices for this business' using errcode = 'insufficient_privilege';
  end if;
  return private.quote(p_business, p_total_cards);
end;
$$;

create function private.new_payment(p_business uuid, p_kind text, p_amount int, p_drop uuid, p_pack text,
  p_from text, p_to text, p_extra int) returns public.payments
language sql volatile set search_path = '' as $$
  insert into public.payments (business_id, kind, amount_kobo, drop_id, pack_id, from_tier, to_tier, extra_cards, paystack_reference, created_by)
  values (p_business, p_kind, p_amount, p_drop, p_pack, p_from, p_to, p_extra,
          'tk_' || encode(extensions.gen_random_bytes(12), 'hex'), auth.uid())
  returning *;
$$;

-- --------------------------------------------------------- publishing

-- Rule 13. Null when this drop can go out with these dates, else why not:
-- 'scheduled_exists' | 'live_exists' | 'overlaps_live' | 'ended' | 'too_long'.
create function private.window_problem(p_drop public.drops) returns text
language plpgsql stable set search_path = '' as $$
declare
  live public.drops%rowtype;
begin
  if p_drop.ends_at <= now() then
    return 'ended';
  end if;
  if p_drop.ends_at > greatest(p_drop.starts_at, now()) + interval '30 days' then
    return 'too_long';
  end if;
  if exists (select 1 from public.drops o where o.business_id = p_drop.business_id and o.id <> p_drop.id
             and o.status = 'published' and o.starts_at > now()) then
    return 'scheduled_exists';
  end if;
  select * into live from public.drops o where o.business_id = p_drop.business_id and o.id <> p_drop.id
    and o.status = 'published' and o.starts_at <= now() and o.ends_at > now()
  order by o.ends_at desc limit 1;
  if found then
    if p_drop.starts_at <= now() then
      return 'live_exists';
    end if;
    if p_drop.starts_at < live.ends_at then
      return 'overlaps_live';
    end if;
  end if;
  return null;
end;
$$;

-- Deck and status, once it's paid for or covered. The caller holds the drop's lock.
create function private.go_live(p_drop uuid, p_tier text, p_paid_with text, p_voucher uuid) returns void
language plpgsql volatile set search_path = '' as $$
begin
  update public.drops set starts_at = greatest(starts_at, now()), status = 'published', published_at = now(),
    tier_id = p_tier, tier_max_cards = (select max_cards from public.drop_tiers where id = p_tier),
    paid_with = p_paid_with, voucher_id = p_voucher,
    payment_status = case when p_paid_with = 'payment' then 'paid' else 'free' end
  where id = p_drop;
  perform private.build_deck(p_drop);
end;
$$;

-- The Publish button. {kind: 'published'} when it's covered, {kind: 'payment', payment_id,
-- reference, amount_kobo} for Paystack (the drop stays a draft until it's paid), or
-- {kind: 'problem', problem} / {kind: 'contact', max}.
create function public.publish_drop(p_drop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  problem text;
  q jsonb;
  pay public.payments;
  rewards_total int;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can publish' using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'draft' then
    return jsonb_build_object('kind', 'problem', 'problem', 'already_published');
  end if;
  -- One publish at a time per business, so two tabs can't both pass the window check.
  perform 1 from public.businesses where id = d.business_id for update;

  select coalesce(sum(quantity), 0) into rewards_total from public.rewards where drop_id = d.id;
  if rewards_total <> d.total_cards then
    return jsonb_build_object('kind', 'problem', 'problem', 'rewards_dont_add_up');
  end if;
  problem := private.window_problem(d);
  if problem is not null then
    return jsonb_build_object('kind', 'problem', 'problem', problem);
  end if;

  q := private.quote(d.business_id, d.total_cards);
  if q ->> 'kind' = 'contact' then
    return q;
  end if;
  if q ->> 'kind' = 'voucher' then
    update public.drop_vouchers set used_by_drop_id = d.id, used_at = now() where id = (q ->> 'voucher_id')::uuid;
    perform private.go_live(d.id, q ->> 'tier', 'voucher', (q ->> 'voucher_id')::uuid);
    return jsonb_build_object('kind', 'published', 'source', q ->> 'source', 'tier', q ->> 'tier');
  end if;

  -- Paid: reuse this drop's open payment if the price hasn't changed.
  select * into pay from public.payments
  where drop_id = d.id and kind = 'drop' and status = 'pending' and amount_kobo = (q ->> 'amount_kobo')::int and to_tier = q ->> 'tier'
  order by created_at desc limit 1;
  if pay.id is null then
    update public.payments set status = 'abandoned' where drop_id = d.id and kind = 'drop' and status = 'pending';
    pay := private.new_payment(d.business_id, 'drop', (q ->> 'amount_kobo')::int, d.id, null, null, q ->> 'tier', null);
  end if;
  update public.drops set payment_status = 'pending', tier_id = q ->> 'tier' where id = d.id;
  return jsonb_build_object('kind', 'payment', 'payment_id', pay.id, 'reference', pay.paystack_reference,
    'amount_kobo', pay.amount_kobo, 'tier', q ->> 'tier');
end;
$$;

-- A season pack: a pending payment; the drops arrive when it's paid.
create function public.buy_pack(p_business uuid, p_pack text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pk public.drop_packs%rowtype;
  pay public.payments;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can buy drops' using errcode = 'insufficient_privilege';
  end if;
  select * into pk from public.drop_packs where id = p_pack and active;
  if not found then
    raise exception 'No such pack' using errcode = 'no_data_found';
  end if;
  pay := private.new_payment(p_business, 'pack', pk.price_kobo, null, pk.id, null, pk.tier_id, null);
  return jsonb_build_object('payment_id', pay.id, 'reference', pay.paystack_reference, 'amount_kobo', pay.amount_kobo);
end;
$$;

-- ------------------------------------------------------- more Tikkas

-- Appends p_extra cards in the rewards' proportions (largest remainder, exact total), spread
-- through new positions after the current last one, with new serials after the current last.
-- The caller holds the drop's lock.
create function private.append_cards(p_drop uuid, p_extra int) returns void
language plpgsql volatile set search_path = '' as $$
declare
  total int := (select total_cards from public.drops where id = p_drop);
  last_pos int := (select coalesce(max(position), -1) from public.cards where drop_id = p_drop);
  last_serial int := (select coalesce(max(serial), 0) from public.cards where drop_id = p_drop);
begin
  create temp table add_counts on commit drop as
  with r as (
    select id, quantity, floor(quantity::numeric * p_extra / total)::int as base,
           quantity::numeric * p_extra / total - floor(quantity::numeric * p_extra / total) as frac
    from public.rewards where drop_id = p_drop
  )
  select id, base + case when row_number() over (order by frac desc, quantity desc, id)
                              <= p_extra - (select sum(base) from r) then 1 else 0 end as n
  from r;

  update public.rewards w set quantity = w.quantity + a.n from add_counts a where a.id = w.id;
  insert into public.cards (drop_id, reward_id, position, serial)
  select p_drop, reward_id,
         last_pos + row_number() over (order by target),
         last_serial + row_number() over (order by private.crypto_random())
  from (
    select a.id as reward_id, (k + private.crypto_random()) * p_extra::double precision / a.n as target
    from add_counts a, generate_series(0, a.n - 1) k
    where a.n > 0
  ) s;
  update public.drops set total_cards = total_cards + p_extra where id = p_drop;
  drop table add_counts;
end;
$$;

-- "Add more Tikkas" on a live drop: {kind: 'added'} when it still fits the drop's size,
-- else {kind: 'payment', …} for the difference to the size that fits (the full price for a
-- drop that was covered without paying), or {kind: 'contact', max}.
create function public.add_tikkas(p_drop uuid, p_extra int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  cur public.drop_tiers%rowtype;
  nxt public.drop_tiers%rowtype;
  founding boolean;
  amount int;
  pay public.payments;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can add Tikkas' using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'published' or d.ends_at <= now() or p_extra is null or p_extra < 1 then
    return jsonb_build_object('kind', 'problem', 'problem', 'not_live');
  end if;
  if d.total_cards + p_extra <= d.tier_max_cards then
    perform private.append_cards(d.id, p_extra);
    return jsonb_build_object('kind', 'added', 'total', d.total_cards + p_extra);
  end if;

  select * into nxt from public.drop_tiers where price_kobo > 0 and max_cards >= d.total_cards + p_extra order by max_cards limit 1;
  if not found then
    return jsonb_build_object('kind', 'contact', 'max', (select max(max_cards) from public.drop_tiers));
  end if;
  select * into cur from public.drop_tiers where id = d.tier_id;
  founding := coalesce((select founding_member from public.business_private where business_id = d.business_id), false);
  amount := case when founding then nxt.founding_price_kobo else nxt.price_kobo end;
  if d.paid_with = 'payment' and cur.price_kobo > 0 then
    amount := greatest(0, amount - case when founding then cur.founding_price_kobo else cur.price_kobo end);
  end if;
  pay := private.new_payment(d.business_id, 'upgrade', amount, d.id, null, d.tier_id, nxt.id, p_extra);
  return jsonb_build_object('kind', 'payment', 'payment_id', pay.id, 'reference', pay.paystack_reference,
    'amount_kobo', amount, 'tier', nxt.id);
end;
$$;

-- -------------------------------------------------------------- Paystack

-- The webhook and the verify fallback (service role). Idempotent: an unknown or settled
-- reference changes nothing. A wrong amount fails the payment and publishes nothing.
-- Returns {kind: 'published' | 'credited' | 'pack' | 'upgraded' | 'failed' | 'already' | 'unknown'}.
create function public.complete_payment(p_reference text, p_amount_kobo int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  d public.drops%rowtype;
  pk public.drop_packs%rowtype;
  i int;
begin
  select * into pay from public.payments where paystack_reference = p_reference for update;
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  -- An abandoned payment still completes: the money arrived.
  if pay.status not in ('pending', 'abandoned') then
    return jsonb_build_object('kind', 'already', 'status', pay.status);
  end if;
  if p_amount_kobo is distinct from pay.amount_kobo then
    update public.payments set status = 'failed' where id = pay.id;
    if pay.kind = 'drop' then
      update public.drops set payment_status = null where id = pay.drop_id and status = 'draft';
    end if;
    return jsonb_build_object('kind', 'failed');
  end if;
  update public.payments set status = 'paid', paid_at = now() where id = pay.id;

  if pay.kind = 'pack' then
    select * into pk from public.drop_packs where id = pay.pack_id;
    for i in 1..pk.drops loop
      insert into public.drop_vouchers (business_id, tier_id, source, pack_payment_id, expires_at)
      values (pay.business_id, pk.tier_id, 'pack', pay.id, now() + interval '12 months');
    end loop;
    return jsonb_build_object('kind', 'pack', 'drops', pk.drops);
  end if;

  select * into d from public.drops where id = pay.drop_id for update;
  if pay.kind = 'upgrade' then
    update public.drops set tier_id = pay.to_tier, tier_max_cards = (select max_cards from public.drop_tiers where id = pay.to_tier),
      paid_with = 'payment', payment_status = 'paid'
    where id = d.id;
    perform private.append_cards(d.id, pay.extra_cards);
    return jsonb_build_object('kind', 'upgraded', 'drop_id', d.id, 'total', d.total_cards + pay.extra_cards);
  end if;

  -- A drop. If it can't go out any more, the money becomes a drop of the same size for later.
  perform 1 from public.businesses where id = d.business_id for update;
  if d.status <> 'draft' or private.window_problem(d) is not null
     or (select coalesce(sum(quantity), 0) from public.rewards where drop_id = d.id) <> d.total_cards then
    insert into public.drop_vouchers (business_id, tier_id, source) values (pay.business_id, pay.to_tier, 'paid');
    update public.drops set payment_status = null where id = d.id and status = 'draft';
    return jsonb_build_object('kind', 'credited', 'drop_id', d.id, 'tier', pay.to_tier);
  end if;
  perform private.go_live(d.id, pay.to_tier, 'payment', null);
  return jsonb_build_object('kind', 'published', 'drop_id', d.id);
end;
$$;

-- The per-minute cron: payments left open an hour are abandoned.
create function public.abandon_stale_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  with gone as (
    update public.payments set status = 'abandoned'
    where status = 'pending' and created_at < now() - interval '1 hour'
    returning drop_id, kind
  ), drafts as (
    update public.drops d set payment_status = null
    from gone where gone.kind = 'drop' and d.id = gone.drop_id and d.status = 'draft' and d.payment_status = 'pending'
    returning d.id
  )
  select count(*) into n from gone;
  return n;
end;
$$;

-- ---------------------------------------------------- running drops

-- End early (no refund) or move the end date (30 days from the start at most).
create function public.end_drop_early(p_drop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can end a drop' using errcode = 'insufficient_privilege';
  end if;
  if d.status = 'published' then
    update public.drops set status = 'ended_early', ends_at = case when starts_at < now() then least(ends_at, now()) else ends_at end
    where id = p_drop;
  end if;
end;
$$;

create function public.extend_drop(p_drop uuid, p_ends_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  nxt timestamptz;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can change a drop' using errcode = 'insufficient_privilege';
  end if;
  if d.status <> 'published' or d.ends_at <= now() then
    return jsonb_build_object('kind', 'problem', 'problem', 'not_live');
  end if;
  if p_ends_at > d.starts_at + interval '30 days' then
    return jsonb_build_object('kind', 'problem', 'problem', 'too_long');
  end if;
  if p_ends_at <= now() then
    return jsonb_build_object('kind', 'problem', 'problem', 'ended');
  end if;
  -- Never into the scheduled next drop.
  select min(starts_at) into nxt from public.drops
  where business_id = d.business_id and id <> d.id and status = 'published' and starts_at > d.starts_at;
  if nxt is not null and p_ends_at > nxt then
    return jsonb_build_object('kind', 'problem', 'problem', 'overlaps_next');
  end if;
  update public.drops set ends_at = p_ends_at where id = p_drop;
  return jsonb_build_object('kind', 'extended', 'ends_at', p_ends_at);
end;
$$;

-- ---------------------------------------------------------- the guarantee

-- The cron (service role): each paid drop whose last Tikka can no longer be used is checked once
-- (lib/guarantee.ts evaluateGuarantee). Earned → a free drop of the same size, once per business.
-- Returns how many were earned.
create function public.evaluate_due_guarantees() returns int
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  earned int := 0;
  redemptions int;
  sources int;
  used boolean;
begin
  for d in
    select dr.*, t.guarantee_min_redemptions as min_redemptions from public.drops dr left join public.drop_tiers t on t.id = dr.tier_id
    where dr.status in ('published', 'ended_early') and dr.guarantee_checked_at is null and dr.ends_at <= now()
      and not exists (select 1 from public.claims c where c.drop_id = dr.id and c.kind = 'drop' and c.redeemed_at is null and c.expires_at > now())
    for update of dr skip locked
  loop
    update public.drops set guarantee_checked_at = now() where id = d.id;
    continue when d.paid_with is distinct from 'payment' or d.min_redemptions is null;
    select guarantee_used into used from public.business_private where business_id = d.business_id for update;
    continue when coalesce(used, false);
    select count(*) into redemptions from public.claims c where c.drop_id = d.id and c.kind = 'drop' and c.redeemed_at is not null;
    continue when redemptions >= d.min_redemptions;
    select count(distinct coalesce('poster:' || e.poster_id, coalesce(e.source, 'direct'))) into sources
    from public.events e where e.drop_id = d.id and e.type = 'view';
    continue when sources < 3;
    continue when d.template_id is null and cardinality(d.ignored_warnings) > 0;

    insert into public.drop_vouchers (business_id, tier_id, source) values (d.business_id, d.tier_id, 'guarantee');
    update public.business_private set guarantee_used = true where business_id = d.business_id;
    earned := earned + 1;
  end loop;
  return earned;
end;
$$;

-- Tikka's admin gives a business a drop (pilots, done-for-you).
create function public.grant_drop(p_business uuid, p_tier text, p_expires_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  insert into public.drop_vouchers (business_id, tier_id, source, expires_at) values (p_business, p_tier, 'admin', p_expires_at)
  returning id into v;
  return v;
end;
$$;

revoke all on function public.save_drop_draft(uuid, uuid, jsonb), public.delete_drop_draft(uuid), public.quote_drop(uuid, int),
  public.publish_drop(uuid), public.buy_pack(uuid, text), public.add_tikkas(uuid, int), public.end_drop_early(uuid),
  public.extend_drop(uuid, timestamptz), public.grant_drop(uuid, text, timestamptz),
  public.complete_payment(text, int), public.abandon_stale_payments(), public.evaluate_due_guarantees()
  from public, anon;
grant execute on function public.save_drop_draft(uuid, uuid, jsonb), public.delete_drop_draft(uuid), public.quote_drop(uuid, int),
  public.publish_drop(uuid), public.buy_pack(uuid, text), public.add_tikkas(uuid, int), public.end_drop_early(uuid),
  public.extend_drop(uuid, timestamptz), public.grant_drop(uuid, text, timestamptz)
  to authenticated;
revoke all on function public.complete_payment(text, int), public.abandon_stale_payments(), public.evaluate_due_guarantees() from authenticated;
grant execute on function public.complete_payment(text, int), public.abandon_stale_payments(), public.evaluate_due_guarantees() to service_role;
revoke all on function private.pick_voucher(uuid, int), private.quote(uuid, int), private.new_payment(uuid, text, int, uuid, text, text, text, int),
  private.window_problem(public.drops), private.go_live(uuid, text, text, uuid), private.append_cards(uuid, int)
  from public, anon, authenticated;
