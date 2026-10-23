-- Notify me and opt-outs (PRD A3, A6; TECH_PLAN §5). Subscribers are not leads: their numbers
-- stay in these server-only tables, and businesses only ever get a count (rule 4). STOP clears the
-- future-drops box (rule 12).

-- "Notify me about Glow Studio NT-7KQ4A": the page makes the code, WhatsApp brings it back with
-- the number.
create table public.notify_intents (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^NT-[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  business_id uuid not null references public.businesses (id) on delete cascade,
  drop_id uuid references public.drops (id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day'
);
create unique index notify_intents_visitor on public.notify_intents (visitor_id, business_id, coalesce(drop_id, '00000000-0000-0000-0000-000000000000'));

-- One per number per business (drop_id null: "their next drop") or per drop.
create table public.notify_subscriptions (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  business_id uuid not null references public.businesses (id) on delete cascade,
  drop_id uuid references public.drops (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'used', 'stopped')),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index notify_one_per_target on public.notify_subscriptions (phone, business_id, coalesce(drop_id, '00000000-0000-0000-0000-000000000000'));
create index notify_active on public.notify_subscriptions (business_id, drop_id) where status = 'active';

-- STOP (business_id set) and STOP ALL (business_id null: no Tikka messages at all).
create table public.opt_outs (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  business_id uuid references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index opt_outs_one on public.opt_outs (phone, coalesce(business_id, '00000000-0000-0000-0000-000000000000'));

-- Server only: no policies, no direct access.
alter table public.notify_intents enable row level security;
alter table public.notify_subscriptions enable row level security;
alter table public.opt_outs enable row level security;
revoke all on public.notify_intents, public.notify_subscriptions, public.opt_outs from anon, authenticated;

-- The Notify me button: the NT code for this visitor and target (the same one if they tap twice).
-- Returns null when the business or drop can't take subscriptions.
create function public.create_notify_intent(p_business uuid, p_drop uuid, p_visitor_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  tok text;
begin
  if not exists (select 1 from public.businesses where id = p_business and not suspended) then
    return null;
  end if;
  if p_drop is not null and not exists (
    select 1 from public.drops where id = p_drop and business_id = p_business and status in ('published', 'ended_early')
  ) then
    return null;
  end if;
  select token into tok from public.notify_intents
  where visitor_id = p_visitor_id and business_id = p_business and drop_id is not distinct from p_drop and expires_at > now();
  if found then
    return tok;
  end if;
  delete from public.notify_intents
  where visitor_id = p_visitor_id and business_id = p_business and drop_id is not distinct from p_drop;
  loop
    tok := 'NT-' || substr(private.intent_token(), 4);
    exit when not exists (select 1 from public.notify_intents where token = tok);
  end loop;
  insert into public.notify_intents (token, business_id, drop_id, visitor_id) values (tok, p_business, p_drop, p_visitor_id);
  return tok;
end;
$$;

-- The webhook, for "NT-XXXXX". Returns {kind, business_name, drop_title, starts_at, scope} where
-- kind is 'subscribed' | 'already' | 'live' (the drop is open now: reply with its link) | 'invalid'.
-- A drop that has ended turns into "their next drop".
create function public.subscribe_notify(p_token text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ni public.notify_intents%rowtype;
  biz public.businesses%rowtype;
  d public.drops%rowtype;
  target uuid;
  sub public.notify_subscriptions%rowtype;
  was_active boolean;
begin
  select * into ni from public.notify_intents where token = upper(trim(p_token));
  if not found or ni.expires_at < now() then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into biz from public.businesses where id = ni.business_id;
  if biz.suspended then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if ni.drop_id is not null then
    select * into d from public.drops where id = ni.drop_id;
    if d.status = 'published' and now() between d.starts_at and d.ends_at
       and exists (select 1 from public.cards where drop_id = d.id and status = 'available') then
      return jsonb_build_object('kind', 'live', 'business_name', biz.name, 'business_slug', biz.slug, 'drop_title', d.title, 'drop_slug', d.slug);
    end if;
    if d.status = 'published' and now() < d.starts_at then
      target := d.id;
    end if;
  end if;

  -- They asked to hear from this business again.
  delete from public.opt_outs where phone = p_phone and business_id = biz.id;

  select * into sub from public.notify_subscriptions
  where phone = p_phone and business_id = biz.id and drop_id is not distinct from target for update;
  was_active := found and sub.status = 'active';
  if not found then
    insert into public.notify_subscriptions (phone, business_id, drop_id) values (p_phone, biz.id, target)
    on conflict do nothing;
  elsif not was_active then
    update public.notify_subscriptions set status = 'active', created_at = now(), notified_at = null where id = sub.id;
  end if;
  if not was_active then
    insert into public.events (drop_id, business_id, type) values (target, biz.id, 'notify_subscribed');
  end if;

  return jsonb_build_object(
    'kind', case when was_active then 'already' else 'subscribed' end,
    'scope', case when target is null then 'business' else 'drop' end,
    'business_name', biz.name,
    'drop_title', case when target is not null then d.title end,
    'starts_at', case when target is not null then d.starts_at end
  );
end;
$$;

-- The webhook, for "STOP" / "STOP ALL". STOP means the business they last heard about (their
-- latest claim or Notify me); with nothing to go on it stops everything. Returns
-- {scope: 'business' | 'all', business_name} for the confirmation.
create function public.handle_stop(p_phone text, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  biz uuid;
begin
  if not p_all then
    select business_id into biz from (
      select d.business_id, c.claimed_at as at from public.claims c join public.drops d on d.id = c.drop_id where c.phone = p_phone
      union all
      select s.business_id, s.created_at from public.notify_subscriptions s where s.phone = p_phone
    ) x order by at desc limit 1;
  end if;

  if biz is null then
    insert into public.opt_outs (phone, business_id) values (p_phone, null) on conflict do nothing;
    update public.notify_subscriptions set status = 'stopped' where phone = p_phone and status = 'active';
    update public.leads set opted_out = true, marketing_opt_in = false where phone = p_phone;
    return jsonb_build_object('scope', 'all');
  end if;

  insert into public.opt_outs (phone, business_id) values (p_phone, biz) on conflict do nothing;
  update public.notify_subscriptions set status = 'stopped' where phone = p_phone and business_id = biz and status = 'active';
  update public.leads set opted_out = true, marketing_opt_in = false where phone = p_phone and business_id = biz;
  return jsonb_build_object('scope', 'business', 'business_name', (select name from public.businesses where id = biz));
end;
$$;

-- "142 people are waiting for this drop": a count, never who. Public (shown on drop and business
-- pages). With a drop, it counts that drop's subscribers plus the business's followers.
create function public.notify_waiting(p_business uuid, p_drop uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct s.phone)::int
  from public.notify_subscriptions s
  where s.business_id = p_business and s.status = 'active' and (s.drop_id is null or s.drop_id = p_drop)
    and not exists (select 1 from public.opt_outs o where o.phone = s.phone and (o.business_id is null or o.business_id = p_business));
$$;

revoke all on function public.create_notify_intent(uuid, uuid, text), public.subscribe_notify(text, text), public.handle_stop(text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_notify_intent(uuid, uuid, text), public.subscribe_notify(text, text), public.handle_stop(text, boolean)
  to service_role;
grant execute on function public.notify_waiting(uuid, uuid) to anon, authenticated;

-- claim_card(): claiming from a business after STOP lifts that business's opt-out.
create or replace function public.claim_card(p_intent_token text, p_phone text, p_wa_name text default null)
returns table (result text, claim_id uuid, view_token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  i public.claim_intents%rowtype;
  d public.drops%rowtype;
  biz public.businesses%rowtype;
  existing public.claims%rowtype;
  l public.leads%rowtype;
  new_lead boolean;
  c record;
  returning_claims int;
  market_claims int;
  new_claim uuid;
  new_token text;
  claim_code text;
begin
  -- 1. The intent, locked; repeats of the same webhook get the stored answer.
  select * into i from public.claim_intents where claim_intents.token = upper(trim(p_intent_token)) for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;
  if i.status <> 'pending' then
    return query select i.status, i.claim_id, (select cl.view_token from public.claims cl where cl.id = i.claim_id);
    return;
  end if;
  if i.expires_at < now() then
    update public.claim_intents set status = 'expired', phone = p_phone where id = i.id;
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  -- 2. The drop must be live.
  select * into d from public.drops where id = i.drop_id;
  select * into biz from public.businesses where id = d.business_id;
  if d.status <> 'published' or now() < d.starts_at or now() > d.ends_at or biz.suspended then
    update public.claim_intents set status = 'expired', phone = p_phone where id = i.id;
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  -- 3. One per number per drop: a repeat gets the same card back (rule 3).
  select * into existing from public.claims cl where cl.drop_id = d.id and cl.phone = p_phone and cl.kind = 'drop';
  if found then
    update public.claim_intents set status = 'duplicate', phone = p_phone, claim_id = existing.id where id = i.id;
    return query select 'duplicate'::text, existing.id, existing.view_token;
    return;
  end if;

  -- 4. The lead: new or returning to this business.
  select * into l from public.leads where business_id = d.business_id and phone = p_phone for update;
  new_lead := not found;

  -- 5. Who can claim.
  if d.eligibility = 'new_only' and not new_lead then
    update public.claim_intents set status = 'blocked_new_only', phone = p_phone where id = i.id;
    return query select 'blocked_new_only'::text, null::uuid, null::text;
    return;
  end if;
  if d.eligibility = 'once_per_period' and not new_lead and exists (
    select 1 from public.claims cl join public.drops dd on dd.id = cl.drop_id
    where dd.business_id = d.business_id and cl.phone = p_phone and cl.kind = 'drop'
      and cl.claimed_at > now() - make_interval(days => coalesce(d.period_days, 30))
  ) then
    update public.claim_intents set status = 'blocked_period', phone = p_phone where id = i.id;
    return query select 'blocked_period'::text, null::uuid, null::text;
    return;
  end if;

  -- 6. The share kept for new customers.
  if not new_lead then
    select count(*) into returning_claims from public.claims cl where cl.drop_id = d.id and cl.kind = 'drop' and not cl.is_new_lead;
    if returning_claims >= floor(d.total_cards * (100 - d.new_reserved_pct) / 100.0) then
      update public.claim_intents set status = 'sold_out', phone = p_phone where id = i.id;
      return query select 'sold_out'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  -- 7. The marketplace's limit.
  if i.source = 'market' and d.marketplace_cap is not null then
    select count(*) into market_claims from public.claims cl where cl.drop_id = d.id and cl.kind = 'drop' and cl.source = 'market';
    if market_claims >= d.marketplace_cap then
      update public.claim_intents set status = 'market_sold_out', phone = p_phone where id = i.id;
      return query select 'market_sold_out'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  -- 8. The next card, atomically: concurrent claims skip each other's locked rows (rule 2).
  select cd.id, cd.reward_id, rw.tier into c
  from public.cards cd join public.rewards rw on rw.id = cd.reward_id
  where cd.drop_id = d.id and cd.status = 'available'
  order by cd.position
  limit 1
  for update of cd skip locked;
  if not found then
    update public.claim_intents set status = 'sold_out', phone = p_phone where id = i.id;
    return query select 'sold_out'::text, null::uuid, null::text;
    return;
  end if;

  -- 9. The claim: lead, code, token, card, intent and the activity event.
  new_token := replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_');
  loop
    claim_code := private.tikka_code(biz.code_prefix);
    exit when not exists (select 1 from public.claims cl where cl.code = claim_code);
  end loop;

  begin
    -- Upsert: the same number claiming two of this business's drops at once can't clash.
    insert into public.leads as x (business_id, phone, first_name, wa_profile_name, first_source, claims_count)
    values (d.business_id, p_phone, i.first_name, p_wa_name, i.source, 1)
    on conflict (business_id, phone) do update
      set claims_count = x.claims_count + 1, opted_out = false, wa_profile_name = coalesce(excluded.wa_profile_name, x.wa_profile_name)
    returning * into l;
    if i.future_drops then
      update public.leads set marketing_opt_in = true, marketing_opt_in_at = now() where id = l.id;
    end if;
    -- Claiming again after STOP is asking to hear from this business again.
    delete from public.opt_outs where phone = p_phone and business_id = d.business_id;
    insert into public.claims (drop_id, card_id, lead_id, phone, first_name, code, view_token, is_new_lead, source, poster_id, expires_at)
    values (d.id, c.id, l.id, p_phone, i.first_name, claim_code, new_token, new_lead, i.source, i.poster_id,
            private.last_day(now(), d.validity_days))
    returning id into new_claim;
  exception when unique_violation then
    -- The same number claimed this drop a moment ago in a parallel request: theirs stands, this
    -- card stays in the deck (the block's lead and claim changes roll back), and they get the same card (rule 3).
    select * into existing from public.claims cl where cl.drop_id = d.id and cl.phone = p_phone and cl.kind = 'drop';
    if not found then
      raise;
    end if;
    update public.claim_intents set status = 'duplicate', phone = p_phone, claim_id = existing.id where id = i.id;
    return query select 'duplicate'::text, existing.id, existing.view_token;
    return;
  end;

  update public.cards set status = 'claimed', claim_id = new_claim where id = c.id;
  update public.claim_intents set status = 'claimed', phone = p_phone, claim_id = new_claim where id = i.id;
  insert into public.events (drop_id, business_id, type, source, poster_id, first_name, tier)
  values (d.id, d.business_id, 'claim_completed', i.source, i.poster_id, i.first_name, c.tier);

  return query select 'claimed'::text, new_claim, new_token;
end;
$$;
