-- claim_card(): the local variable `token` clashed with claim_intents.token. Renamed, and column
-- names now win any other clash with the function's output names (result, claim_id, view_token).
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
            now() + make_interval(days => d.validity_days))
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
