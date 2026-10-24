-- Leads (PRD B7, TECH_PLAN §10). Every claimer is a lead the owner sees in full, with their
-- WhatsApp number (rule 4: owners only; staff and anyone else get an error, checked here, not in
-- the app). One row per Tikka claimed from a drop, newest first; bounce-backs aren't new leads.

create function public.get_leads(p_business uuid)
returns table (
  claim_id uuid, lead_id uuid, drop_id uuid, first_name text, profile_name text, phone text, source text,
  is_new_lead boolean, claimed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, bill_amount_kobo int,
  planned_visit_date date, planned_visit_part text, tier text, reward text, marketing_opt_in boolean, last_followup_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees leads' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, l.id, c.drop_id, c.first_name, l.wa_profile_name, c.phone, c.source,
           c.is_new_lead, c.claimed_at, c.expires_at, c.redeemed_at, c.bill_amount_kobo,
           c.planned_visit_date, c.planned_visit_part, r.tier, r.title, l.marketing_opt_in, l.last_followup_at
    from public.claims c
    join public.leads l on l.id = c.lead_id
    join public.drops d on d.id = c.drop_id
    join public.cards k on k.id = c.card_id
    join public.rewards r on r.id = k.reward_id
    where d.business_id = p_business and c.kind = 'drop'
    order by c.claimed_at desc;
end;
$$;

-- "Message on WhatsApp" was tapped: the lead's last follow-up, and a followup_tap for the funnel.
create function public.log_followup(p_claim uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims%rowtype;
  biz uuid;
begin
  select cl.* into c from public.claims cl where cl.id = p_claim;
  if not found then
    return false;
  end if;
  select d.business_id into biz from public.drops d where d.id = c.drop_id;
  if not private.is_owner(biz) then
    raise exception 'Only the owner follows up' using errcode = 'insufficient_privilege';
  end if;
  update public.leads set last_followup_at = now() where id = c.lead_id;
  insert into public.events (drop_id, business_id, type, source) values (c.drop_id, biz, 'followup_tap', c.source);
  return true;
end;
$$;

revoke all on function public.get_leads(uuid), public.log_followup(uuid) from public, anon;
grant execute on function public.get_leads(uuid), public.log_followup(uuid) to authenticated;
