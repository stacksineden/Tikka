-- "What did they spend?" after redeeming (owner only). At the counter the amount is optional and
-- easy to skip in a rush, and then the drop's results ("₦… recorded") miss that sale. The owner can
-- add it, or fix a typo, afterwards: from Leads (by claim) or on the counter screen (by code, right
-- after confirming or when a used code is checked again). The rules (pure copy in lib/spent.ts):
--   * owners only, never staff (staff still type it at the counter, as before);
--   * only a Tikka that has been used, and only within 30 days of using it;
--   * ₦0 to ₦10,000,000 (0 clears it); the redeemed event in the live feed changes with it;
--   * nothing else changes: the Tikka stays used, and the redemption time stays the same.

alter table public.claims
  add column bill_set_at timestamptz,
  add column bill_set_by uuid references auth.users (id) on delete set null;

-- Add or change what a used Tikka's customer spent, by the claim (from Leads) or by its code (on
-- the counter screen). Owners only. Returns {kind}: 'saved' (with amount_kobo, name and code),
-- 'not_used', 'too_late' (used more than 30 days ago), 'bad_amount', 'unknown'.
create function public.set_redemption_amount(p_business uuid, p_amount_kobo int, p_claim uuid default null, p_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cl public.claims%rowtype;
  l public.leads%rowtype;
  bill int := nullif(p_amount_kobo, 0);
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can change what a customer spent' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_kobo is null or p_amount_kobo < 0 or p_amount_kobo > 1000000000 then
    return jsonb_build_object('kind', 'bad_amount');
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
  if cl.redeemed_at is null then
    return jsonb_build_object('kind', 'not_used', 'code', cl.code);
  end if;
  if cl.redeemed_at < now() - interval '30 days' then
    return jsonb_build_object('kind', 'too_late', 'code', cl.code);
  end if;

  update public.claims set bill_amount_kobo = bill, bill_set_at = now(), bill_set_by = auth.uid() where id = cl.id;
  -- The live feed's "redeemed" line: written with redeemed_at, in the same transaction (same time).
  update public.events set amount_kobo = bill
  where drop_id = cl.drop_id and type = 'redeemed' and created_at = cl.redeemed_at and first_name is not distinct from cl.first_name;

  select * into l from public.leads where id = cl.lead_id;
  return jsonb_build_object('kind', 'saved', 'code', cl.code, 'claim_id', cl.id, 'amount_kobo', coalesce(bill, 0),
                            'name', private.shown_name(cl.first_name, l.wa_profile_name));
end;
$$;
revoke all on function public.set_redemption_amount(uuid, int, uuid, text) from public, anon;
grant execute on function public.set_redemption_amount(uuid, int, uuid, text) to authenticated;

-- The code check, as before (20261118120000_more_time.sql), plus: a used Tikka says whose it was
-- and what they spent (spent_kobo, null when nobody typed it), so the owner can add it at the
-- counter. Staff see the same answer but can't change it. Never the number.
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
  select * into l from public.leads where id = cl.lead_id;
  if cl.redeemed_at is not null then
    return jsonb_build_object('kind', 'already_used', 'code', v_code, 'at', cl.redeemed_at,
                              'name', private.shown_name(cl.first_name, l.wa_profile_name),
                              'spent_kobo', cl.bill_amount_kobo,
                              'can_set_spent', cl.redeemed_at >= now() - interval '30 days');
  end if;
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
