-- One used Tikka per WhatsApp per drop (docs/REVENUE_PLAN.md, NOW item 1). In page-claim mode
-- someone could type several made-up numbers that all end in their own last 4 digits, then pass the
-- 4-digit check at the counter with each one, because their own WhatsApp really does end that way.
--
-- Now staff read the last 6 digits off the customer's WhatsApp, every time, and the check passes only
-- if the 6 digits match this Tikka's number AND no other Tikka from the same drop, claimed with a
-- different number ending in the same 6 digits, has already been used. confirm_redemption() checks
-- the same thing again (two tills, or a pass that sat unused), so it holds in any order. The
-- customer's own next-visit Tikka has the same number, so it's never blocked. Everything else is as
-- before: never the number, never the digits stored, 3 wrong tries a day per Tikka (WAT), no
-- override, the check belongs to the Tikka and a next-visit Tikka inherits a pass.

-- Why a check didn't pass, when it isn't just wrong digits: 'used_by_this_whatsapp'.
alter table public.counter_checks add column reason text check (reason in ('used_by_this_whatsapp'));

-- True when another Tikka from this drop, claimed with a different number ending in the same 6
-- digits, has already been used.
create function private.whatsapp_used_in_drop(p_claim uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.claims c
    join public.claims o on o.drop_id = c.drop_id and o.id <> c.id
    where c.id = p_claim and o.redeemed_at is not null and o.phone <> c.phone and right(o.phone, 6) = right(c.phone, 6)
  );
$$;

-- Two tills working on two Tikkas that end in the same 6 digits take turns.
create function private.lock_whatsapp_in_drop(p_claim uuid) returns void
language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(c.drop_id::text || ':' || right(c.phone, 6), 0))
  from public.claims c where c.id = p_claim;
$$;

-- The counter's 6-digit check. Owners and staff, as themselves. Returns {kind}: 'matched',
-- 'no_match' (with tries_left), 'used_by_this_whatsapp', 'closed_today', 'not_needed' (a WhatsApp
-- claim, already passed, or the check is off), 'invalid_digits', or the code check's answer
-- ('expired', 'already_used', …). Never returns the number, and never stores the digits.
drop function public.check_whatsapp_digits(uuid, text, text);
create function public.check_whatsapp_digits(p_business uuid, p_code text, p_digits text) returns jsonb
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
  if coalesce(p_digits, '') !~ '^[0-9]{6}$' then
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

  hit := right(cl.phone, 6) = p_digits;
  if hit then
    perform private.lock_whatsapp_in_drop(cl.id);
    if private.whatsapp_used_in_drop(cl.id) then
      -- The right WhatsApp, but it has already used a Tikka from this drop. Counts as a wrong try.
      insert into public.counter_checks (claim_id, business_id, matched, checked_by, reason)
      values (cl.id, p_business, false, auth.uid(), 'used_by_this_whatsapp');
      return jsonb_build_object('kind', 'used_by_this_whatsapp', 'code', v_code);
    end if;
  end if;
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

-- confirm_redemption() refuses a checked Tikka when the same WhatsApp has used another Tikka from
-- this drop since it passed. The body is today's (20261111120000_counter_check.sql); only this
-- guard is new, wrapped around it so nothing else changes.
alter function public.confirm_redemption(uuid, text, int, boolean, text) rename to confirm_redemption_inner;
revoke all on function public.confirm_redemption_inner(uuid, text, int, boolean, text) from public, anon, authenticated;
alter function public.confirm_redemption_inner(uuid, text, int, boolean, text) set schema private;

create function public.confirm_redemption(
  p_business uuid, p_code text, p_bill_amount_kobo int default null,
  p_action_confirmed boolean default false, p_customer_status text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cl public.claims%rowtype;
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  -- The Tikka first, then the WhatsApp lock: the same order as the check, so two tills never deadlock.
  select * into cl from public.claims where claims.code = private.clean_code(p_code) for update;
  if found and cl.counter_check and cl.counter_checked_at is not null and cl.redeemed_at is null then
    perform private.lock_whatsapp_in_drop(cl.id);
    if private.whatsapp_used_in_drop(cl.id) then
      return jsonb_build_object('kind', 'used_by_this_whatsapp', 'code', cl.code);
    end if;
  end if;
  return private.confirm_redemption_inner(p_business, p_code, p_bill_amount_kobo, p_action_confirmed, p_customer_status);
end;
$$;

-- Tikka admin: also how many Tikkas were stopped because that WhatsApp had already used one.
create or replace function public.admin_counter_checks() returns jsonb
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
        count(*) filter (where s.checks = 0 and s.redeemed_at is null and not s.expired) as not_yet,
        count(*) filter (where s.repeats > 0) as used_by_this_whatsapp
      from (
        select c.id, d.business_id, c.redeemed_at, c.expires_at <= now() as expired,
          count(k.id) as checks,
          count(k.id) filter (where k.matched) as passes,
          count(k.id) filter (where not k.matched) as fails,
          count(k.id) filter (where k.reason = 'used_by_this_whatsapp') as repeats,
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

revoke all on function public.check_whatsapp_digits(uuid, text, text), public.confirm_redemption(uuid, text, int, boolean, text) from public, anon;
grant execute on function public.check_whatsapp_digits(uuid, text, text), public.confirm_redemption(uuid, text, int, boolean, text) to authenticated;
revoke all on function private.whatsapp_used_in_drop(uuid), private.lock_whatsapp_in_drop(uuid) from public, anon, authenticated;
