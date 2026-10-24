-- The claim page on real drops (PRD A1, TECH_PLAN §5 click-to-claim, §12 link activity).
-- Published drops and their rewards are already public; these add what the page needs without
-- ever exposing the deck (rule 1) or a claimer's details to anyone but that claimer.

-- "180 of 300 left": a count, nothing more. Public.
create function public.drop_claimed_count(p_drop uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.claims c join public.drops d on d.id = c.drop_id
  where c.drop_id = p_drop and c.kind = 'drop' and d.status in ('published', 'ended_early');
$$;
grant execute on function public.drop_claimed_count(uuid) to anon, authenticated;

-- Link activity from the claim page (the server calls this; the visitor id is already hashed
-- with a daily salt). A view counts once per visitor per drop per WAT day. A poster id is kept
-- only when the poster belongs to the drop's business.
create function public.record_drop_event(p_drop uuid, p_type text, p_source text, p_visitor_hash text, p_poster uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
begin
  select * into d from public.drops where id = p_drop and status in ('published', 'ended_early');
  if not found or p_type not in ('view', 'unwrap', 'claim_tap', 'claim_continue') then
    return;
  end if;
  if p_type = 'view' and exists (
    select 1 from public.events e where e.drop_id = p_drop and e.type = 'view' and e.visitor_hash = p_visitor_hash
      and (e.created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date
  ) then
    return;
  end if;
  insert into public.events (drop_id, business_id, type, source, visitor_hash, poster_id)
  values (p_drop, d.business_id, p_type, p_source, p_visitor_hash,
          (select p.id from public.posters p where p.id = p_poster and p.business_id = d.business_id));
end;
$$;

-- The claim sheet: a TK-XXXXX code for this visitor (the same one if they tap Claim again while
-- it's still waiting). Returns {kind: 'intent', token, expires_at} or why not:
-- {kind: 'scheduled' | 'ended' | 'sold_out' | 'not_found'}.
create function public.create_claim_intent(p_drop uuid, p_first_name text, p_future_drops boolean, p_visitor_id text, p_source text, p_poster uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  i public.claim_intents%rowtype;
  tok text;
  name text := left(trim(coalesce(p_first_name, '')), 30);
begin
  select * into d from public.drops where id = p_drop;
  if not found or d.status not in ('published', 'ended_early')
     or exists (select 1 from public.businesses b where b.id = d.business_id and b.suspended) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if d.status = 'ended_early' or d.ends_at <= now() then
    return jsonb_build_object('kind', 'ended');
  end if;
  if d.starts_at > now() then
    return jsonb_build_object('kind', 'scheduled');
  end if;
  if not exists (select 1 from public.cards c where c.drop_id = d.id and c.status = 'available') then
    return jsonb_build_object('kind', 'sold_out');
  end if;
  if name = '' then
    raise exception 'A first name is needed' using errcode = 'check_violation';
  end if;

  select * into i from public.claim_intents
  where drop_id = d.id and visitor_id = p_visitor_id and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if found then
    update public.claim_intents set first_name = name, future_drops = coalesce(p_future_drops, false) where id = i.id;
    return jsonb_build_object('kind', 'intent', 'token', i.token, 'expires_at', i.expires_at);
  end if;

  loop
    tok := private.intent_token();
    exit when not exists (select 1 from public.claim_intents where token = tok);
  end loop;
  insert into public.claim_intents (drop_id, token, first_name, future_drops, visitor_id, source, poster_id)
  values (d.id, tok, name, coalesce(p_future_drops, false), p_visitor_id,
          case when p_source in ('wa', 'ig', 'qr', 'web', 'ads', 'market', 'direct') then p_source else 'direct' end,
          (select p.id from public.posters p where p.id = p_poster and p.business_id = d.business_id))
  returning * into i;
  return jsonb_build_object('kind', 'intent', 'token', i.token, 'expires_at', i.expires_at);
end;
$$;

-- One claimer's card, by the claim's id: what the card shows, never anyone else's.
create function private.card_json(p_claim uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'view_token', c.view_token,
    'kind', c.kind,
    'drop_id', c.drop_id,
    'tier', coalesce(r.tier, 'common'),
    'reward', coalesce(r.title, d.bounce_back ->> 'title'),
    'action', r.action_text,
    'code', c.code,
    'serial', k.serial,
    'total', d.total_cards,
    'first_name', c.first_name,
    'expires_at', c.expires_at,
    'redeemed_at', c.redeemed_at,
    'planned_visit_date', c.planned_visit_date,
    'planned_visit_part', c.planned_visit_part,
    'valid_weekdays', to_jsonb(d.valid_weekdays))
  from public.claims c
  join public.drops d on d.id = c.drop_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim;
$$;

-- The waiting page asks every couple of seconds. The card comes back only to the visitor who
-- started this claim. Returns {kind: 'pending' | 'claimed' | 'duplicate' | 'sold_out' |
-- 'market_sold_out' | 'blocked_new_only' | 'blocked_period' | 'expired' | 'invalid', card?}.
create function public.claim_result(p_token text, p_visitor_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  i public.claim_intents%rowtype;
begin
  select * into i from public.claim_intents where token = upper(trim(p_token));
  if not found or i.visitor_id is distinct from p_visitor_id then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if i.status = 'pending' and i.expires_at < now() then
    return jsonb_build_object('kind', 'expired');
  end if;
  if i.status in ('claimed', 'duplicate') then
    return jsonb_build_object('kind', i.status, 'card', private.card_json(i.claim_id));
  end if;
  return jsonb_build_object('kind', i.status);
end;
$$;

-- Coming back to the page (the claim cookie) or opening the card link from WhatsApp: the view
-- token is the secret, so whoever holds it sees that one card.
create function public.claim_by_view_token(p_view_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.card_json(c.id) from public.claims c where c.view_token = p_view_token;
$$;

revoke all on function public.record_drop_event(uuid, text, text, text, uuid), public.create_claim_intent(uuid, text, boolean, text, text, uuid),
  public.claim_result(text, text), public.claim_by_view_token(text) from public, anon, authenticated;
grant execute on function public.record_drop_event(uuid, text, text, text, uuid), public.create_claim_intent(uuid, text, boolean, text, text, uuid),
  public.claim_result(text, text), public.claim_by_view_token(text) to service_role;
revoke all on function private.card_json(uuid) from public, anon, authenticated;
