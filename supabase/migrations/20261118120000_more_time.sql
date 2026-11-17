-- "Give more time" (owner only): one extra week on one Tikka, once. For a customer who can't come
-- before their Tikka runs out (their hair isn't ready, they're travelling), so the business doesn't
-- lose the visit. Never public: the claim page, the card and the drop never mention it, so the
-- deadline still makes people come. The rules (pure copy in lib/more-time.ts):
--   * owners only, never staff;
--   * once per Tikka;
--   * 7 more days, and never more than 30 days from when it was claimed (a 30-day Tikka can't get
--     more time);
--   * only a Tikka that hasn't been used; an expired one comes back if the new date is still ahead;
--   * the same card, code and reward: nothing else changes, and the drop's stock isn't touched.

alter table public.claims
  add column extended_at timestamptz,
  add column extended_by uuid references auth.users (id) on delete set null;

-- The date "Give more time" would move this Tikka to, or null when it can't have more time.
create function private.more_time_until(c public.claims) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when c.redeemed_at is not null or c.extended_at is not null then null
    when least(c.expires_at + interval '7 days', c.claimed_at + interval '30 days') <= greatest(c.expires_at, now()) then null
    else least(c.expires_at + interval '7 days', c.claimed_at + interval '30 days')
  end;
$$;

-- Give more time, by the claim (from Leads) or by its code (on the counter screen). Owners only.
-- Returns {kind}: 'extended' (with expires_at and name), 'already_used', 'already_extended',
-- 'no_more_time' (a 30-day Tikka, or one that expired too long ago), 'unknown'.
create function public.give_more_time(p_business uuid, p_claim uuid default null, p_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cl public.claims%rowtype;
  l public.leads%rowtype;
  until timestamptz;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can give more time' using errcode = 'insufficient_privilege';
  end if;
  if p_claim is not null then
    select c.* into cl from public.claims c join public.drops d on d.id = c.drop_id
    where c.id = p_claim and d.business_id = p_business for update of c;
  else
    select c.* into cl from public.claims c join public.drops d on d.id = c.drop_id
    where c.code = private.clean_code(p_code) and d.business_id = p_business for update of c;
  end if;
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  if cl.redeemed_at is not null then
    return jsonb_build_object('kind', 'already_used', 'code', cl.code);
  end if;
  if cl.extended_at is not null then
    return jsonb_build_object('kind', 'already_extended', 'code', cl.code, 'expires_at', cl.expires_at);
  end if;
  until := private.more_time_until(cl);
  if until is null then
    return jsonb_build_object('kind', 'no_more_time', 'code', cl.code, 'expires_at', cl.expires_at);
  end if;

  update public.claims set expires_at = until, extended_at = now(), extended_by = auth.uid() where id = cl.id;
  select * into l from public.leads where id = cl.lead_id;
  return jsonb_build_object('kind', 'extended', 'code', cl.code, 'claim_id', cl.id, 'expires_at', until,
                            'name', private.shown_name(cl.first_name, l.wa_profile_name));
end;
$$;
revoke all on function public.give_more_time(uuid, uuid, text) from public, anon;
grant execute on function public.give_more_time(uuid, uuid, text) to authenticated;

-- The code check, as before (20261113180000_reward_terms.sql), plus: an expired Tikka says whose it
-- is and the date "Give more time" would move it to (more_time, when it can have more time), so the
-- owner can give it at the counter. Staff see the same answer but can't act on it.
create or replace function private.code_check(p_business uuid, p_code text) returns jsonb
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
  select * into l from public.leads where id = cl.lead_id;
  if cl.kind = 'drop' then
    select r.* into rw from public.cards k join public.rewards r on r.id = k.reward_id where k.id = cl.card_id;
  end if;
  if cl.expires_at <= now() then
    return jsonb_build_object(
      'kind', 'expired', 'code', v_code, 'at', cl.expires_at,
      'name', private.shown_name(cl.first_name, l.wa_profile_name),
      'reward', case when cl.kind = 'drop' then rw.title else d.bounce_back ->> 'title' end,
      'more_time', private.more_time_until(cl));
  end if;
  -- Quiet-day drops: only on their days (1 = Monday … 7 = Sunday, in WAT). Bounce-backs work any day.
  if cl.kind = 'drop' and coalesce(array_length(d.valid_weekdays, 1), 0) > 0
     and not (extract(isodow from now() at time zone 'Africa/Lagos')::int = any (d.valid_weekdays)) then
    return jsonb_build_object('kind', 'wrong_day', 'code', v_code, 'days', to_jsonb(d.valid_weekdays));
  end if;

  select exists (
    select 1 from public.claims o join public.drops od on od.id = o.drop_id
    where o.lead_id = cl.lead_id and o.id <> cl.id and o.redeemed_at is not null and od.business_id = p_business
  ) into came_before;

  return jsonb_build_object(
    'kind', 'valid',
    'code', v_code,
    'claim_kind', cl.kind,
    'name', private.shown_name(cl.first_name, l.wa_profile_name),
    'reward', case when cl.kind = 'drop' then rw.title else d.bounce_back ->> 'title' end,
    'tier', case when cl.kind = 'drop' then rw.tier else 'common' end,
    'expires_at', cl.expires_at,
    'action', case when cl.kind = 'drop' and rw.kind = 'action' then rw.action_text end,
    'terms', case when cl.kind = 'drop' then rw.terms end,
    'suggested_status', case when came_before or cl.kind = 'bounce_back' then 'returning' else 'new' end,
    'planned_visit_date', cl.planned_visit_date,
    'planned_visit_part', cl.planned_visit_part
  ) || case when cl.counter_check and cl.counter_checked_at is null then
    jsonb_build_object('whatsapp_check', jsonb_build_object(
      'tries_left', greatest(private.counter_tries_per_day() - private.counter_fails_today(cl.id), 0)))
  else '{}'::jsonb end;
end;
$$;

-- The owner's lead list, as before (20261111120000_counter_check.sql), plus when the Tikka was
-- given more time, so Leads shows it and hides the button.
drop function public.get_leads(uuid);
create function public.get_leads(p_business uuid)
returns table (
  claim_id uuid, lead_id uuid, drop_id uuid, first_name text, profile_name text, phone text, source text,
  is_new_lead boolean, claimed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, bill_amount_kobo int,
  planned_visit_date date, planned_visit_part text, tier text, reward text, marketing_opt_in boolean, last_followup_at timestamptz,
  phone_confirmed boolean, counter_checked boolean, extended_at timestamptz
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
           c.phone_confirmed, c.counter_checked_at is not null, c.extended_at
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
