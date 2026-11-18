-- Bookings, part 2 (docs/BOOKINGS.md journeys 5, 10, 11, 13): who booked on the Leads page, a
-- Tikka claimer booking a time to use it, BK- codes at the counter, and the new-booking alert on
-- the owner's phone. Phone numbers only reach owners (rule 4).

-- Everyone who booked, one row per person (lead), for the owner's Leads page: where they came
-- from, their next booking and how many times they came. Owners only.
create function public.get_booking_leads(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees leads' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'last_at' desc)
    from (
      select jsonb_build_object(
        'lead_id', l.id, 'first_name', l.first_name, 'phone', l.phone, 'phone_confirmed', l.phone_confirmed,
        'marketing_opt_in', l.marketing_opt_in, 'first_seen_at', l.first_seen_at, 'claims_count', l.claims_count,
        'sources', (select jsonb_agg(distinct b.source) from public.bookings b where b.lead_id = l.id),
        'bookings', (select count(*) from public.bookings b where b.lead_id = l.id and b.status <> 'cancelled'),
        'came', (select count(*) from public.bookings b where b.lead_id = l.id and b.status = 'arrived'),
        'last_at', (select max(b.created_at) from public.bookings b where b.lead_id = l.id),
        'next', (select jsonb_build_object('starts_at', b.starts_at, 'service', b.service_name, 'code', b.code, 'claim_id', b.claim_id)
                 from public.bookings b where b.lead_id = l.id and b.status = 'booked' and b.ends_at > now()
                 order by b.starts_at limit 1)) as x
      from public.leads l
      where l.business_id = p_business and exists (select 1 from public.bookings b where b.lead_id = l.id)
    ) q), '[]'::jsonb);
end;
$$;

-- A Tikka and its booking, for "Book a time to use it" (server only, by the card's link): whose
-- business, the first name, the use-by, whether it's used, and the booking it already has.
create function public.tikka_booking_info(p_view_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', d.business_id, 'first_name', c.first_name, 'expires_at', c.expires_at, 'redeemed', c.redeemed_at is not null,
    'reward', coalesce((select r.title from public.cards k join public.rewards r on r.id = k.reward_id where k.id = c.card_id), d.bounce_back ->> 'title'),
    'booking', (select jsonb_build_object('view_token', b.view_token, 'starts_at', b.starts_at, 'service', b.service_name)
                from public.bookings b where b.claim_id = c.id and b.status in ('booked', 'arrived')
                order by b.starts_at desc limit 1))
  from public.claims c join public.drops d on d.id = c.drop_id
  where c.view_token = p_view_token;
$$;

-- The claimer books a time to use their Tikka (server only, after the route's rate limits). Their
-- name and number come from the claim; the time must start before the Tikka runs out. One
-- upcoming booking per Tikka: asking again returns the one they have.
create function public.book_for_claim(p_view_token text, p_service uuid, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims%rowtype;
  biz uuid;
  svc public.business_services%rowtype;
  problem text;
  bk public.bookings%rowtype;
  have text;
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
  perform 1 from public.booking_settings where business_id = biz for update;
  select b.view_token into have from public.bookings b
  where b.claim_id = c.id and b.status = 'booked' and b.ends_at > now() limit 1;
  if have is not null then
    return jsonb_build_object('kind', 'already', 'token', have);
  end if;
  svc := private.booking_service(biz, p_service);
  if p_start >= c.expires_at then
    return jsonb_build_object('kind', 'after_use_by');
  end if;
  problem := private.booking_problem(biz, p_start, svc.minutes, null, false);
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if (select count(*) from public.bookings
      where business_id = biz and phone = c.phone and status = 'booked' and starts_at > now()) >= 3 then
    return jsonb_build_object('kind', 'too_many');
  end if;
  bk := private.insert_booking(biz, svc, p_start, c.first_name, c.phone, c.lead_id, c.id, 'tikka', false, null);
  return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id);
end;
$$;

-- A BK- code at the counter: the booking, for owners and staff, never the number. Read-only.
create function public.check_booking_code(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team checks codes' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^BK[A-Z0-9]{6}$' then
    return jsonb_build_object('kind', 'unknown');
  end if;
  select * into b from public.bookings where code = 'BK-' || substr(v_code, 3);
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  if b.business_id <> p_business then
    return jsonb_build_object('kind', 'wrong_business');
  end if;
  return jsonb_build_object('kind', 'booking', 'id', b.id, 'code', b.code, 'first_name', b.first_name, 'service', b.service_name,
    'minutes', b.minutes, 'starts_at', b.starts_at, 'status', b.status, 'source', b.source);
end;
$$;

-- The new-booking alert (server only): what to say, and the phones of the people who own the
-- business. Never the customer's number (it shows on a lock screen).
create function public.booking_alert(p_booking uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', b.business_id, 'business_name', z.name, 'first_name', b.first_name, 'service', b.service_name,
    'starts_at', b.starts_at,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s
      join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
      where s.business_id = b.business_id), '[]'::jsonb))
  from public.bookings b join public.businesses z on z.id = b.business_id
  where b.id = p_booking;
$$;

revoke all on function public.get_booking_leads(uuid), public.tikka_booking_info(text), public.book_for_claim(text, uuid, timestamptz),
  public.check_booking_code(uuid, text), public.booking_alert(uuid) from public, anon;
revoke all on function public.tikka_booking_info(text), public.book_for_claim(text, uuid, timestamptz), public.booking_alert(uuid) from authenticated;
grant execute on function public.get_booking_leads(uuid), public.check_booking_code(uuid, text) to authenticated;
grant execute on function public.tikka_booking_info(text), public.book_for_claim(text, uuid, timestamptz), public.booking_alert(uuid) to service_role;
