-- Claiming on the page, while Tikka's WhatsApp number waits for Meta's business verification.
-- TIKKA_CLAIM_MODE=page sends the claim sheet here instead of to WhatsApp: the claimer types their
-- number, and claim_on_page() hands out the card through the same claim_card() (rules 1–3 hold:
-- the server decides the card, one card per claimer, one claim per number per drop). Remove the
-- setting and claims go back to WhatsApp; nothing here changes the WhatsApp path.
--
-- A typed number isn't proven, so these claims and their new leads are marked phone_confirmed =
-- false, and Tikka never messages an unconfirmed number on WhatsApp: no card, reminder, thank-you
-- or drop alert. Owners can still follow up from their own phones (Message today).

alter table public.claims add column phone_confirmed boolean not null default true;
alter table public.leads add column phone_confirmed boolean not null default true;

alter table public.claim_intents drop constraint claim_intents_status_check;
alter table public.claim_intents add constraint claim_intents_status_check check (status in (
  'pending', 'claimed', 'duplicate', 'blocked_new_only', 'blocked_period', 'sold_out', 'market_sold_out', 'expired',
  -- A page claim whose number already has a Tikka from this drop: the card is never shown to them.
  'number_taken'));

-- A next-visit Tikka (bounce-back) is as confirmed as the claim it came from.
create function private.inherit_phone_confirmed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_claim_id is not null then
    select c.phone_confirmed into new.phone_confirmed from public.claims c where c.id = new.parent_claim_id;
    new.phone_confirmed := coalesce(new.phone_confirmed, true);
  end if;
  return new;
end;
$$;
create trigger claims_inherit_phone_confirmed before insert on public.claims
  for each row execute function private.inherit_phone_confirmed();

-- A claim through WhatsApp proves the number, so the lead becomes confirmed too.
create function private.confirm_lead_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.leads set phone_confirmed = true where id = new.lead_id and not phone_confirmed;
  return new;
end;
$$;
create trigger claims_confirm_lead_phone after insert on public.claims
  for each row when (new.phone_confirmed and new.kind = 'drop') execute function private.confirm_lead_phone();

-- Tikka never sends a claim's WhatsApp messages (card, reminder, thank-you) to a number that wasn't
-- confirmed. Everything else is as before.
create or replace function public.enqueue_message(
  p_phone text, p_kind text, p_payload jsonb, p_business uuid default null, p_claim uuid default null,
  p_dedupe_key text default null, p_scheduled_for timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if p_claim is not null and exists (select 1 from public.claims c where c.id = p_claim and not c.phone_confirmed) then
    return null;
  end if;
  insert into public.outbound_messages (phone, kind, payload, priority, business_id, claim_id, dedupe_key, scheduled_for)
  values (p_phone, p_kind, coalesce(p_payload, '{}'),
          case when p_kind in ('card', 'resend', 'reply') then 1
               when p_kind = 'thanks' then 2
               when p_kind in ('notify_confirm', 'expiry_reminder', 'owner_daily') then 3
               else 4 end,
          p_business, p_claim, p_dedupe_key, coalesce(p_scheduled_for, now()))
  on conflict (dedupe_key) do nothing
  returning id into new_id;
  return new_id;
end;
$$;

-- The card page needs to know whether to say "Also sent to your WhatsApp".
create or replace function private.card_json(p_claim uuid) returns jsonb
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
    'valid_weekdays', to_jsonb(d.valid_weekdays),
    'revealed_at', c.revealed_at,
    'drop_slug', d.slug,
    'business_name', b.name,
    'business_slug', b.slug,
    'phone_confirmed', c.phone_confirmed)
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim;
$$;

-- The owner's lead list says which numbers were typed in and not confirmed.
drop function public.get_leads(uuid);
create function public.get_leads(p_business uuid)
returns table (
  claim_id uuid, lead_id uuid, drop_id uuid, first_name text, profile_name text, phone text, source text,
  is_new_lead boolean, claimed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, bill_amount_kobo int,
  planned_visit_date date, planned_visit_part text, tier text, reward text, marketing_opt_in boolean, last_followup_at timestamptz,
  phone_confirmed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees leads' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, l.id, c.drop_id, c.first_name, l.wa_profile_name, c.phone, c.source,
           c.is_new_lead, c.claimed_at, c.expires_at, c.redeemed_at, c.bill_amount_kobo,
           c.planned_visit_date, c.planned_visit_part, r.tier, r.title, l.marketing_opt_in, l.last_followup_at,
           c.phone_confirmed
    from public.claims c
    join public.leads l on l.id = c.lead_id
    join public.drops d on d.id = c.drop_id
    join public.cards k on k.id = c.card_id
    join public.rewards r on r.id = k.reward_id
    where d.business_id = p_business and c.kind = 'drop'
    order by c.claimed_at desc;
end;
$$;
revoke all on function public.get_leads(uuid) from public, anon;
grant execute on function public.get_leads(uuid) to authenticated;

-- The page claim. The intent (made by create_claim_intent for this visitor) carries the drop, the
-- first name and the source; the server passes the typed number, already in +234 form. Returns
-- {kind}: 'claimed' (the card then comes from claim_result, to this visitor only), 'number_taken'
-- (never the card: it isn't theirs to see), 'already_this_browser' (with this visitor's own card's
-- view token), 'invalid_phone', or claim_card's reasons ('sold_out', 'blocked_new_only', …).
create function public.claim_on_page(p_intent_token text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.claim_intents%rowtype;
  d public.drops%rowtype;
  mine public.claims%rowtype;
  lead_was_confirmed boolean;
  r record;
begin
  if p_phone is null or p_phone !~ '^\+234[789][01][0-9]{8}$' then
    return jsonb_build_object('kind', 'invalid_phone');
  end if;
  select * into i from public.claim_intents where token = upper(trim(p_intent_token)) for update;
  if not found then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if i.status <> 'pending' then
    return jsonb_build_object('kind', i.status);
  end if;
  select * into d from public.drops where id = i.drop_id;

  -- One Tikka per browser per drop: this visitor's own card, if they already claimed one.
  select c.* into mine from public.claim_intents x join public.claims c on c.id = x.claim_id
  where x.drop_id = d.id and x.visitor_id = i.visitor_id and x.status = 'claimed' and x.id <> i.id
  limit 1;
  if found then
    update public.claim_intents set status = 'expired' where id = i.id;
    return jsonb_build_object('kind', 'already_this_browser', 'view_token', mine.view_token);
  end if;

  -- One per number per drop. Typing a number that already claimed never shows that person's card.
  if exists (select 1 from public.claims c where c.drop_id = d.id and c.phone = p_phone and c.kind = 'drop') then
    update public.claim_intents set status = 'number_taken', phone = p_phone where id = i.id;
    return jsonb_build_object('kind', 'number_taken');
  end if;

  select l.phone_confirmed into lead_was_confirmed from public.leads l where l.business_id = d.business_id and l.phone = p_phone;
  select * into r from public.claim_card(i.token, p_phone, null);

  if r.result = 'duplicate' then
    -- The same number claimed this drop a moment ago in a parallel request.
    update public.claim_intents set status = 'number_taken', claim_id = null where id = i.id;
    return jsonb_build_object('kind', 'number_taken');
  end if;
  if r.result = 'claimed' then
    update public.claims set phone_confirmed = false where id = r.claim_id;
    if lead_was_confirmed is not true then
      -- A new, unproven number: not confirmed, and no drop alerts (rule 12) until they message Tikka.
      update public.leads set phone_confirmed = false, marketing_opt_in = false, marketing_opt_in_at = null
      where business_id = d.business_id and phone = p_phone;
    end if;
  end if;
  return jsonb_build_object('kind', r.result);
end;
$$;

revoke all on function public.claim_on_page(text, text) from public, anon, authenticated;
grant execute on function public.claim_on_page(text, text) to service_role;
revoke all on function private.inherit_phone_confirmed(), private.confirm_lead_phone() from public, anon, authenticated;
