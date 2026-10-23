-- Redemption (TECH_PLAN §8). Rule 5: checking a code never uses it; confirming takes the claim's
-- row lock, checks again, and needs the staff tick on action cards. Staff and owners call both
-- functions as themselves, and neither ever returns a phone number (rule 4).

-- A Tikka lasts until 23:59 WAT on its last day (lib/visit.ts claimExpiry), not to the minute.
create function private.last_day(p_from timestamptz, p_days int) returns timestamptz
language sql immutable set search_path = '' as $$
  select (((p_from at time zone 'Africa/Lagos')::date + p_days) + time '23:59') at time zone 'Africa/Lagos';
$$;

-- "Adaeze O.": first name plus the last initial from the WhatsApp profile name, never more.
create function private.shown_name(p_first text, p_wa_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when array_length(regexp_split_to_array(trim(coalesce(p_wa_name, '')), '\s+'), 1) > 1
      then p_first || ' ' || upper(left((regexp_split_to_array(trim(p_wa_name), '\s+'))[array_length(regexp_split_to_array(trim(p_wa_name), '\s+'), 1)], 1)) || '.'
    else p_first
  end;
$$;

-- " gs 7x4qp " → "GS-7X4QP". Shape only; the counter screen has already checked the check character.
create function private.clean_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case when length(c) = 7 then left(c, 2) || '-' || right(c, 5) else c end
  from (select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') as c) s;
$$;

-- The shared check, read-only. Results mirror lib/redeem.ts CheckResult.
create function private.code_check(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  cl public.claims%rowtype;
  d public.drops%rowtype;
  l public.leads%rowtype;
  rw public.rewards%rowtype;
  came_before boolean;
begin
  select * into cl from public.claims where claims.code = v_code;
  if not found then
    return jsonb_build_object('kind', 'unknown', 'code', v_code);
  end if;
  select * into d from public.drops where id = cl.drop_id;
  if d.business_id <> p_business then
    return jsonb_build_object('kind', 'wrong_business', 'code', v_code);
  end if;
  if cl.redeemed_at is not null then
    return jsonb_build_object('kind', 'already_used', 'code', v_code, 'at', cl.redeemed_at);
  end if;
  if cl.expires_at <= now() then
    return jsonb_build_object('kind', 'expired', 'code', v_code, 'at', cl.expires_at);
  end if;
  -- Quiet-day drops: only on their days (1 = Monday … 7 = Sunday, in WAT). Bounce-backs work any day.
  if cl.kind = 'drop' and coalesce(array_length(d.valid_weekdays, 1), 0) > 0
     and not (extract(isodow from now() at time zone 'Africa/Lagos')::int = any (d.valid_weekdays)) then
    return jsonb_build_object('kind', 'wrong_day', 'code', v_code, 'days', to_jsonb(d.valid_weekdays));
  end if;

  select * into l from public.leads where id = cl.lead_id;
  select exists (
    select 1 from public.claims o join public.drops od on od.id = o.drop_id
    where o.lead_id = cl.lead_id and o.id <> cl.id and o.redeemed_at is not null and od.business_id = p_business
  ) into came_before;
  if cl.kind = 'drop' then
    select r.* into rw from public.cards k join public.rewards r on r.id = k.reward_id where k.id = cl.card_id;
  end if;

  return jsonb_build_object(
    'kind', 'valid',
    'code', v_code,
    'claim_kind', cl.kind,
    'name', private.shown_name(cl.first_name, l.wa_profile_name),
    'reward', case when cl.kind = 'drop' then rw.title else d.bounce_back ->> 'title' end,
    'tier', case when cl.kind = 'drop' then rw.tier else 'common' end,
    'expires_at', cl.expires_at,
    'action', case when cl.kind = 'drop' and rw.kind = 'action' then rw.action_text end,
    'suggested_status', case when came_before or cl.kind = 'bounce_back' then 'returning' else 'new' end
  );
end;
$$;

-- The counter's "Check" button. Never changes anything.
create function public.check_code(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  return private.code_check(p_business, p_code);
end;
$$;

-- The counter's "Confirm". Returns {kind: 'redeemed', name, bounce_back} or the check's answer,
-- or {kind: 'needs_action'} when an action card hasn't been ticked. The route handler sends the
-- thank-you (with the bounce-back's line and the review link) until the outbound queue lands.
create function public.confirm_redemption(
  p_business uuid, p_code text, p_bill_amount_kobo int default null,
  p_action_confirmed boolean default false, p_customer_status text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  cl public.claims%rowtype;
  d public.drops%rowtype;
  r jsonb;
  bill int := case when p_bill_amount_kobo > 0 then p_bill_amount_kobo end;
  status text;
  bb public.claims%rowtype;
  bb_code text;
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  if p_customer_status is not null and p_customer_status not in ('new', 'returning') then
    raise exception 'customer_status is new or returning' using errcode = 'check_violation';
  end if;

  -- Two tills confirming the same code: the second waits here, then sees it's used.
  select * into cl from public.claims where claims.code = v_code for update;
  r := private.code_check(p_business, v_code);
  if r ->> 'kind' <> 'valid' then
    return r;
  end if;
  if r ->> 'action' is not null and not coalesce(p_action_confirmed, false) then
    return jsonb_build_object('kind', 'needs_action', 'code', v_code);
  end if;
  status := coalesce(p_customer_status, r ->> 'suggested_status');

  update public.claims
  set redeemed_at = now(), bill_amount_kobo = bill, customer_status = status,
      redeemed_by = auth.uid(), action_confirmed = (r ->> 'action' is not null)
  where id = cl.id;
  update public.leads set redeemed_count = redeemed_count + 1 where id = cl.lead_id;
  select * into d from public.drops where id = cl.drop_id;
  insert into public.events (drop_id, business_id, type, first_name, amount_kobo, tier)
  values (d.id, d.business_id, 'redeemed', cl.first_name, bill, r ->> 'tier');

  -- The next-visit Tikka: once per redeemed drop Tikka, never from a bounce-back.
  if cl.kind = 'drop' and d.bounce_back is not null then
    loop
      bb_code := private.tikka_code((select code_prefix from public.businesses where id = d.business_id));
      exit when not exists (select 1 from public.claims o where o.code = bb_code);
    end loop;
    insert into public.claims (drop_id, kind, parent_claim_id, lead_id, phone, first_name, code, view_token, is_new_lead, source, expires_at)
    values (d.id, 'bounce_back', cl.id, cl.lead_id, cl.phone, cl.first_name, bb_code,
            replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_'),
            false, cl.source, private.last_day(now(), coalesce((d.bounce_back ->> 'validity_days')::int, 30)))
    on conflict (parent_claim_id) where kind = 'bounce_back' do nothing
    returning * into bb;
  end if;

  return jsonb_build_object(
    'kind', 'redeemed',
    'code', v_code,
    'name', r ->> 'name',
    'customer_status', status,
    'bounce_back', case when bb.id is null then null else jsonb_build_object(
      'claim_id', bb.id, 'reward', d.bounce_back ->> 'title', 'expires_at', bb.expires_at, 'view_token', bb.view_token) end
  );
end;
$$;

revoke all on function public.check_code(uuid, text), public.confirm_redemption(uuid, text, int, boolean, text) from public, anon;
grant execute on function public.check_code(uuid, text), public.confirm_redemption(uuid, text, int, boolean, text) to authenticated;
revoke all on function private.last_day(timestamptz, int), private.shown_name(text, text), private.clean_code(text),
  private.code_check(uuid, text) from public, anon, authenticated;

-- claim_card(): Tikkas now last until 23:59 WAT on their last day, as the app shows them.
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
