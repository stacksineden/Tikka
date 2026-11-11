-- The WhatsApp check at the counter, for Tikkas claimed by typing a number (page-claim mode).
-- A typed number isn't proven, so before staff give the reward they ask the customer to open
-- WhatsApp and read the last 4 digits off the customer's own profile. check_whatsapp_digits()
-- compares them and answers only matches / doesn't match: staff never get the number (rule 4),
-- and the digits typed are never stored. Three wrong tries a day (West Africa Time), then the
-- check closes for that Tikka until tomorrow. Nothing is used until confirm_redemption(), which
-- refuses a typed-in Tikka that hasn't passed. Unused Tikkas expire as usual; nothing is cancelled.
-- Passing and redeeming makes the lead confirmed (Verified) for that business only, and turns its
-- future-drops tick back on if they ticked it when claiming. Every check is recorded so Tikka admin
-- can see how often people claim with a number that isn't theirs.

-- The owner's switch, on by default. The drop builder shows it only in page-claim mode.
alter table public.drops add column counter_check boolean not null default true;

-- Whether this Tikka needs the check, decided when it's claimed (claim_on_page copies the drop's
-- switch), so it matches what the claimer was told on the page. Tikkas claimed before this, and
-- WhatsApp claims, never need it. Turning the switch off later doesn't change Tikkas already out.
alter table public.claims add column counter_check boolean not null default false;
-- When this Tikka passed the check. Per Tikka, never per person: a verified number typed on a later
-- drop is checked again, so nobody can borrow someone else's verified number.
alter table public.claims add column counter_checked_at timestamptz;

-- Every check: which Tikka, matched or not, who checked, when. Never the digits.
create table public.counter_checks (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  matched boolean not null,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz not null default now()
);
create index counter_checks_claim on public.counter_checks (claim_id, checked_at);
create index counter_checks_business on public.counter_checks (business_id);
-- Server only: no policies, no direct access.
alter table public.counter_checks enable row level security;
revoke all on public.counter_checks from anon, authenticated;

create function private.counter_tries_per_day() returns int
language sql immutable set search_path = '' as $$ select 3 $$;

-- Wrong tries on this Tikka today, in West Africa Time.
create function private.counter_fails_today(p_claim uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.counter_checks
  where claim_id = p_claim and not matched
    and (checked_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date;
$$;

-- A next-visit Tikka (bounce-back) is as confirmed, and as checked, as the claim it came from: the
-- customer was checked at the counter a moment ago.
create or replace function private.inherit_phone_confirmed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_claim_id is not null then
    select c.phone_confirmed, c.counter_check, c.counter_checked_at
    into new.phone_confirmed, new.counter_check, new.counter_checked_at
    from public.claims c where c.id = new.parent_claim_id;
      new.phone_confirmed := coalesce(new.phone_confirmed, true);
    new.counter_check := coalesce(new.counter_check, false);
  end if;
  return new;
end;
$$;

-- Saving a draft keeps the switch (as before, 20261023210000_drop_builder.sql, plus counter_check).
create or replace function public.save_drop_draft(p_business uuid, p_drop uuid, p_draft jsonb) returns uuid
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
      audience_band, counter_check, ignored_warnings, copied_from, builder)
    values (p_business, r.slug, trim(r.title), coalesce(r.goal, 'new_customers'), r.template_id, r.total_cards,
      coalesce(r.finish, 'foil'), coalesce(r.eligibility, 'once_per_drop'), r.period_days, coalesce(r.new_reserved_pct, 70),
      coalesce(r.show_in_marketplace, true), r.marketplace_cap, r.starts_at, r.ends_at, coalesce(r.validity_days, 14),
      r.valid_weekdays, r.bounce_back, r.audience_band, coalesce(r.counter_check, true), coalesce(r.ignored_warnings, '{}'), r.copied_from, p_draft -> 'builder')
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
      bounce_back = r.bounce_back, audience_band = r.audience_band, counter_check = coalesce(r.counter_check, true),
      ignored_warnings = coalesce(r.ignored_warnings, '{}'),
      builder = p_draft -> 'builder'
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

-- The shared check, read-only. As before, plus `whatsapp_check: {tries_left}` on a valid Tikka that
-- still needs the counter check (claimed with the check on, and not passed yet).
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
  ) || case when cl.counter_check and cl.counter_checked_at is null then
    jsonb_build_object('whatsapp_check', jsonb_build_object(
      'tries_left', greatest(private.counter_tries_per_day() - private.counter_fails_today(cl.id), 0)))
  else '{}'::jsonb end;
end;
$$;

-- The counter's 4-digit check. Owners and staff, as themselves. Returns {kind}: 'matched',
-- 'no_match' (with tries_left), 'closed_today', 'not_needed' (a WhatsApp claim, already passed, or
-- the check is off), 'invalid_digits', or the code check's answer ('expired', 'already_used', …).
-- Never returns the number, and never stores the digits.
create function public.check_whatsapp_digits(p_business uuid, p_code text, p_last4 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  cl public.claims%rowtype;
  r jsonb;
  fails int;
  hit boolean;
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_last4, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('kind', 'invalid_digits', 'code', v_code);
  end if;
  -- Two tills checking the same code take turns, so the day's tries can't be overspent.
  select * into cl from public.claims where claims.code = v_code for update;
  r := private.code_check(p_business, v_code);
  if r ->> 'kind' <> 'valid' then
    return r;
  end if;
  if not (r ? 'whatsapp_check') then
    return jsonb_build_object('kind', 'not_needed', 'code', v_code);
  end if;
  fails := private.counter_fails_today(cl.id);
  if fails >= private.counter_tries_per_day() then
    return jsonb_build_object('kind', 'closed_today', 'code', v_code);
  end if;

  hit := right(cl.phone, 4) = p_last4;
  insert into public.counter_checks (claim_id, business_id, matched, checked_by)
  values (cl.id, p_business, hit, auth.uid());
  if hit then
    update public.claims set counter_checked_at = now() where id = cl.id;
    return jsonb_build_object('kind', 'matched', 'code', v_code);
  end if;
  if fails + 1 >= private.counter_tries_per_day() then
    return jsonb_build_object('kind', 'closed_today', 'code', v_code);
  end if;
  return jsonb_build_object('kind', 'no_match', 'code', v_code, 'tries_left', private.counter_tries_per_day() - fails - 1);
end;
$$;

-- confirm_redemption(): as before, plus {kind: 'needs_whatsapp_check'} for a typed-in Tikka that
-- hasn't passed the check. A Tikka that passed makes its lead confirmed for this business, and turns
-- the future-drops tick back on if they ticked it when claiming (and haven't said STOP since).
create or replace function public.confirm_redemption(
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
  if r ? 'whatsapp_check' then
    return jsonb_build_object('kind', 'needs_whatsapp_check', 'code', v_code);
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

  -- Passed the WhatsApp check at the counter: the number is proven, for this business.
  if cl.counter_check and cl.counter_checked_at is not null and not cl.phone_confirmed then
    update public.leads l
    set phone_confirmed = true,
        marketing_opt_in = l.marketing_opt_in or (ticked and not l.opted_out),
        marketing_opt_in_at = case when not l.marketing_opt_in and ticked and not l.opted_out then now() else l.marketing_opt_in_at end
    from (select coalesce(bool_or(i.future_drops), false) as ticked from public.claim_intents i where i.claim_id = cl.id) x
    where l.id = cl.lead_id;
  end if;

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

  -- The thank-you, with the next-visit line and the review link (rule 12: it belongs to the claim).
  perform public.enqueue_message(cl.phone, 'thanks', jsonb_build_object(
      'business_name', (select name from public.businesses where id = d.business_id),
      'first_name', cl.first_name,
      'view_token', cl.view_token,
      'bounce_back', case when bb.id is null then null else jsonb_build_object(
        'reward', d.bounce_back ->> 'title', 'expires_at', bb.expires_at, 'view_token', bb.view_token) end),
    d.business_id, cl.id, 'thanks:' || cl.id);

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

-- The card says "Bring the phone with this WhatsApp" while it still needs the counter check.
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
    'phone_confirmed', c.phone_confirmed,
    'counter_check', (c.counter_check and c.counter_checked_at is null))
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim;
$$;

-- The owner's lead list: also whether a typed-in Tikka passed the check at the counter.
drop function public.get_leads(uuid);
create function public.get_leads(p_business uuid)
returns table (
  claim_id uuid, lead_id uuid, drop_id uuid, first_name text, profile_name text, phone text, source text,
  is_new_lead boolean, claimed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, bill_amount_kobo int,
  planned_visit_date date, planned_visit_part text, tier text, reward text, marketing_opt_in boolean, last_followup_at timestamptz,
  phone_confirmed boolean, counter_checked boolean
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
           c.phone_confirmed, c.counter_checked_at is not null
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

-- The page claim, as before (20261109100000_page_claims.sql), plus: the Tikka takes the drop's
-- counter-check switch when it's claimed, and a typed number never changes a lead's future-drops
-- choice at claim time. The tick is kept on the claim intent and only counts once the Tikka passes
-- the check at the counter (confirm_redemption), so nobody can sign someone else's number up.
create or replace function public.claim_on_page(p_intent_token text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.claim_intents%rowtype;
  d public.drops%rowtype;
  mine public.claims%rowtype;
  lead_was_confirmed boolean;
  prior_opt_in boolean;
  prior_opt_in_at timestamptz;
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

  select l.phone_confirmed, l.marketing_opt_in, l.marketing_opt_in_at into lead_was_confirmed, prior_opt_in, prior_opt_in_at
  from public.leads l where l.business_id = d.business_id and l.phone = p_phone;
  select * into r from public.claim_card(i.token, p_phone, null);

  if r.result = 'duplicate' then
    -- The same number claimed this drop a moment ago in a parallel request.
    update public.claim_intents set status = 'number_taken', claim_id = null where id = i.id;
    return jsonb_build_object('kind', 'number_taken');
  end if;
  if r.result = 'claimed' then
    -- The drop's counter-check switch, as it stands now, goes with the Tikka.
    update public.claims set phone_confirmed = false, counter_check = d.counter_check where id = r.claim_id;
    if lead_was_confirmed is not true then
      -- A new, unproven number: not confirmed, and no drop alerts (rule 12) until it's proven.
      update public.leads set phone_confirmed = false, marketing_opt_in = false, marketing_opt_in_at = null
      where business_id = d.business_id and phone = p_phone;
    else
      -- A proven number typed by someone on the page: its future-drops choice stays as it was.
      update public.leads set marketing_opt_in = coalesce(prior_opt_in, false), marketing_opt_in_at = prior_opt_in_at
      where business_id = d.business_id and phone = p_phone;
    end if;
  end if;
  return jsonb_build_object('kind', r.result);
end;
$$;

-- Tikka admin: how the counter check is going, per business (never phone numbers). Counts every
-- drop Tikka that was claimed needing the check, sorted into one outcome each.
create function public.admin_counter_checks() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.came_not_redeemed desc, x.business_name) from (
      select b.id as business_id, b.name as business_name,
        count(*) filter (where s.first_matched) as passed_first,
        count(*) filter (where s.fails > 0 and s.passes > 0) as failed_then_passed,
        count(*) filter (where s.fails > 0 and s.passes = 0 and s.expired) as came_not_redeemed,
        count(*) filter (where s.fails > 0 and s.passes = 0 and not s.expired) as failed_waiting,
        count(*) filter (where s.checks = 0 and s.redeemed_at is null and s.expired) as never_came,
        count(*) filter (where s.checks = 0 and s.redeemed_at is null and not s.expired) as not_yet
      from (
        select c.id, d.business_id, c.redeemed_at, c.expires_at <= now() as expired,
          count(k.id) as checks,
          count(k.id) filter (where k.matched) as passes,
          count(k.id) filter (where not k.matched) as fails,
          coalesce((array_agg(k.matched order by k.checked_at))[1], false) as first_matched
        from public.claims c
        join public.drops d on d.id = c.drop_id
        left join public.counter_checks k on k.claim_id = c.id
        where c.kind = 'drop' and c.counter_check
        group by c.id, d.business_id
      ) s
      join public.businesses b on b.id = s.business_id
      where not b.is_demo
      group by b.id, b.name
    ) x), '[]');
end;
$$;

revoke all on function public.check_whatsapp_digits(uuid, text, text), public.admin_counter_checks() from public, anon;
grant execute on function public.check_whatsapp_digits(uuid, text, text), public.admin_counter_checks() to authenticated;
revoke all on function private.counter_fails_today(uuid), private.counter_tries_per_day() from public, anon, authenticated;
