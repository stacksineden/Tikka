-- Loose ends from booking with choices (docs/DB_MOVE.md step 2, 20261206100000_booking_choices.sql):
--
-- 1. "Book a time to use it" from a Tikka now takes the same choices as any booking (short, medium
--    or long; people; extras; the service's questions), so the time it holds is the real length plus
--    the gap after it. book_for_claim_v2(): the Tikka's own rules stay (before its use-by, one
--    upcoming booking per Tikka, never a deposit, at the shop, name and number from the claim). The
--    price is worked out for the booking's record only; nothing is charged. book_for_claim() stays
--    for code already deployed.
-- 2. An owner moving a booking checks its whole busy window: its own time plus its gap, or the whole
--    date for an event day (choice_problem()). "Book anyway" (p_force) still overrides, as before.
-- 3. An event-day booking made the older ways (the owner adding one) takes the whole date too.

create function public.book_for_claim_v2(
  p_view_token text, p_service uuid, p_start timestamptz, p_choice jsonb, p_answers text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims%rowtype;
  biz uuid;
  svc public.business_services%rowtype;
  v_answers text := nullif(left(trim(coalesce(p_answers, '')), 300), '');
  price jsonb;
  v_minutes int;
  v_gap int;
  v_end timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  problem text;
  have text;
  bk public.bookings%rowtype;
  v_code text;
begin
  select * into c from public.claims where view_token = p_view_token;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  select d.business_id into biz from public.drops d where d.id = c.drop_id;
  if c.redeemed_at is not null then
    return jsonb_build_object('kind', 'used');
  end if;
  if c.expires_at <= now() then
    return jsonb_build_object('kind', 'expired');
  end if;
  if (select suspended from public.businesses where id = biz) then
    return jsonb_build_object('kind', 'off');
  end if;
  -- One booking at a time per business, so the last place can't go twice.
  perform 1 from public.booking_settings where business_id = biz for update;
  select b.view_token into have from public.bookings b
  where b.claim_id = c.id and b.status in ('booked', 'held') and b.ends_at > now() limit 1;
  if have is not null then
    return jsonb_build_object('kind', 'already', 'token', have);
  end if;
  select * into svc from public.business_services where id = p_service and business_id = biz;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if p_start >= c.expires_at then
    return jsonb_build_object('kind', 'after_use_by');
  end if;
  if svc.questions is not null and v_answers is null then
    return jsonb_build_object('kind', 'bad_answers');
  end if;

  -- At the shop: a Tikka is used in person, so never a home visit or travel fee.
  price := private.price_choice(svc, coalesce(p_choice, '{}'::jsonb) - 'home', 0, false);
  v_minutes := (price ->> 'minutes')::int;
  v_gap := case when svc.event_day then 0 else coalesce(private.gap_after(biz, svc, false), 0) end;
  problem := private.choice_problem(biz, p_start, v_minutes, v_gap, svc.event_day, null);
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if (select count(*) from public.bookings
      where business_id = biz and phone = c.phone and status = 'booked' and starts_at > now()) >= 3 then
    return jsonb_build_object('kind', 'too_many');
  end if;

  v_end := p_start + make_interval(mins => v_minutes);
  if svc.event_day then
    v_from := ((p_start at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
    v_to := v_from + interval '1 day';
    v_end := least(v_end, v_to);
  else
    v_from := p_start;
    v_to := v_end + make_interval(mins => v_gap);
  end if;

  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               claim_id, source, future_offers, code, view_token, created_by,
                               price_kobo, price_kind, detail, choice, answers, event_day, gap_minutes, busy_from, busy_to)
  values (biz, svc.id, svc.name, greatest(15, (extract(epoch from (v_end - p_start)) / 60)::int), p_start, v_end,
          c.first_name, c.phone, c.lead_id, c.id, 'tikka', false, v_code, encode(extensions.gen_random_bytes(12), 'hex'), auth.uid(),
          (price ->> 'total_kobo')::int, 'fixed', nullif(left(concat_ws(' · ', price ->> 'detail', v_answers), 200), ''),
          jsonb_strip_nulls(price - 'total_kobo' - 'minutes' - 'detail'), v_answers, svc.event_day, nullif(v_gap, 0), v_from, v_to)
  returning * into bk;
  return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id);
end;
$$;

revoke all on function public.book_for_claim_v2(text, uuid, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.book_for_claim_v2(text, uuid, timestamptz, jsonb, text) to service_role;

create or replace function public.move_booking(p_business uuid, p_booking uuid, p_start timestamptz, p_force boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
  problem text;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner moves bookings' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.booking_settings where business_id = p_business for update;
  select * into bk from public.bookings where id = p_booking and business_id = p_business for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if bk.status <> 'booked' then
    return jsonb_build_object('kind', 'not_booked', 'status', bk.status);
  end if;
  if coalesce(p_force, false) then
    -- "Book anyway": only bookings switched off stops it.
    problem := private.booking_problem(p_business, p_start, bk.minutes, bk.id, true);
  else
    -- Its own time plus its gap, or the whole date for an event day.
    problem := private.choice_problem(p_business, p_start, bk.minutes, coalesce(bk.gap_minutes, 0), bk.event_day, bk.id);
  end if;
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  update public.bookings set starts_at = p_start, ends_at = p_start + make_interval(mins => bk.minutes), moved_at = now()
  where id = bk.id;
  return jsonb_build_object('kind', 'moved');
end;
$$;

-- 3. Bookings made the older ways (the owner adding one, the first Tikka path, the first book
--    function) for an event-day service now take the whole date, like the customer's booking sheet.
--    Before, an owner-added wedding left the rest of the day open.
create or replace function private.insert_booking(
  p_business uuid, p_service public.business_services, p_start timestamptz, p_first_name text, p_phone text,
  p_lead uuid, p_claim uuid, p_source text, p_future boolean, p_visitor text
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
  v_code text;
  v_event boolean := coalesce(p_service.event_day, false);
  v_gap int := case when coalesce(p_service.event_day, false) then 0 else coalesce(private.gap_after(p_business, p_service, false), 0) end;
  v_end timestamptz := p_start + make_interval(mins => p_service.minutes);
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_event then
    v_from := ((p_start at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
    v_to := v_from + interval '1 day';
    v_end := least(v_end, v_to);
  elsif v_gap > 0 then
    v_from := p_start;
    v_to := v_end + make_interval(mins => v_gap);
  end if;
  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               claim_id, source, future_offers, code, view_token, visitor_id, created_by,
                               event_day, gap_minutes, busy_from, busy_to)
  values (p_business, p_service.id, p_service.name, greatest(15, (extract(epoch from (v_end - p_start)) / 60)::int), p_start, v_end,
          p_first_name, p_phone, p_lead, p_claim, p_source, coalesce(p_future, false), v_code,
          encode(extensions.gen_random_bytes(12), 'hex'), p_visitor, auth.uid(),
          v_event, nullif(v_gap, 0), v_from, v_to)
  returning * into bk;
  return bk;
end;
$$;
