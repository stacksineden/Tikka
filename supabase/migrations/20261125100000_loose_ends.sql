-- Loose ends from bookings and payments:
-- 1. Privacy: forgetting a person also clears the email and name on pay links made for their
--    Tikkas (bookings, with their deposit email, already go with the lead), and the lookup shows
--    their bookings and payments.
-- 2. A drop's results count money paid online for its Tikkas (pay links sent from Leads).
-- 3. At the counter, a Tikka's code also shows the booking made with it.
-- 4. A time held for a deposit that was never paid doesn't make someone a "booked" lead.

-- 1 -------------------------------------------------------------- privacy

create function private.scrub_lead_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.pay_links set payer_email = null, customer_name = null, lead_id = null where lead_id = old.id;
  return old;
end;
$$;
create trigger leads_scrub_payments before delete on public.leads
for each row execute function private.scrub_lead_payments();

create or replace function public.admin_person_lookup(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;
  result := jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
          'business_name', b.name, 'drop_title', d.title, 'kind', c.kind, 'first_name', c.first_name,
          'reward', coalesce(r.title, d.bounce_back ->> 'title'), 'claimed_at', c.claimed_at, 'redeemed_at', c.redeemed_at,
          'reviewed', exists (select 1 from public.reviews v where v.claim_id = c.id))
        order by c.claimed_at desc)
      from public.claims c join public.drops d on d.id = c.drop_id join public.businesses b on b.id = d.business_id
      left join public.cards k on k.id = c.card_id left join public.rewards r on r.id = k.reward_id
      where c.phone = p_phone), '[]'),
    'businesses_with_lead', coalesce((
      select jsonb_agg(b.name order by b.name) from public.leads l join public.businesses b on b.id = l.business_id where l.phone = p_phone), '[]'),
    'notify', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', b.name, 'drop_title', d.title, 'status', s.status))
      from public.notify_subscriptions s join public.businesses b on b.id = s.business_id left join public.drops d on d.id = s.drop_id
      where s.phone = p_phone), '[]'),
    'opted_out', exists (select 1 from public.opt_outs where phone = p_phone),
    'messages', (select count(*) from public.wa_messages where phone = p_phone) + (select count(*) from public.outbound_messages where phone = p_phone),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', k.service_name, 'starts_at', k.starts_at, 'status', k.status,
                                          'deposit_paid_kobo', k.deposit_paid_kobo, 'email', k.deposit_email is not null) order by k.starts_at desc)
      from public.bookings k join public.businesses z on z.id = k.business_id where k.phone = p_phone), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'note', p.note, 'amount_kobo', p.amount_kobo, 'status', p.status,
                                          'email', p.payer_email is not null) order by p.created_at desc)
      from public.pay_links p join public.businesses z on z.id = p.business_id join public.leads l on l.id = p.lead_id
      where l.phone = p_phone), '[]')
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages',
                             'bookings', jsonb_array_length(result -> 'bookings'), 'payments', jsonb_array_length(result -> 'payments')),
          auth.uid());
  return result;
end;
$$;

-- 2 -------------------------------------------------------------- online money in results

create function public.drop_paid_online(p_drop uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  biz uuid;
begin
  select business_id into biz from public.drops where id = p_drop;
  if not private.is_owner(biz) then
    raise exception 'Only the owner sees results' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select sum(p.paid_kobo) from public.pay_links p join public.claims c on c.id = p.claim_id
    where c.drop_id = p_drop and p.status = 'paid' and p.paystack_mode = 'live'), 0);
end;
$$;

-- 3 -------------------------------------------------------------- the counter

-- What the counter shows beside a Tikka's code: paid online for it, and its booking (the next
-- one, or today's). Owners and staff; never the number.
create function public.counter_extras(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  v_claim uuid;
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team checks codes' using errcode = 'insufficient_privilege';
  end if;
  select c.id into v_claim from public.claims c join public.drops d on d.id = c.drop_id where c.code = v_code and d.business_id = p_business;
  if v_claim is null then
    return jsonb_build_object('paid_kobo', 0, 'booking', null);
  end if;
  return jsonb_build_object(
    'paid_kobo', coalesce((select sum(paid_kobo) from public.pay_links where claim_id = v_claim and status = 'paid'), 0),
    'booking', (select jsonb_build_object('starts_at', b.starts_at, 'service', b.service_name, 'code', b.code)
                from public.bookings b
                where b.claim_id = v_claim and b.status in ('booked', 'arrived')
                  and b.starts_at > (now() at time zone 'Africa/Lagos')::date at time zone 'Africa/Lagos'
                order by b.starts_at limit 1));
end;
$$;

-- 4 -------------------------------------------------------------- held times aren't bookings

create or replace function public.get_booking_leads(p_business uuid) returns jsonb
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
        'sources', (select jsonb_agg(distinct b.source) from public.bookings b where b.lead_id = l.id and b.status <> 'held'),
        'bookings', (select count(*) from public.bookings b where b.lead_id = l.id and b.status not in ('cancelled', 'held')),
        'came', (select count(*) from public.bookings b where b.lead_id = l.id and b.status = 'arrived'),
        'last_at', (select max(b.created_at) from public.bookings b where b.lead_id = l.id and b.status <> 'held'),
        'next', (select jsonb_build_object('starts_at', b.starts_at, 'service', b.service_name, 'code', b.code, 'claim_id', b.claim_id)
                 from public.bookings b where b.lead_id = l.id and b.status = 'booked' and b.ends_at > now()
                 order by b.starts_at limit 1)) as x
      from public.leads l
      where l.business_id = p_business and exists (select 1 from public.bookings b where b.lead_id = l.id and b.status <> 'held')
    ) q), '[]'::jsonb);
end;
$$;

revoke all on function private.scrub_lead_payments() from public, anon, authenticated;
revoke all on function public.drop_paid_online(uuid), public.counter_extras(uuid, text) from public, anon;
grant execute on function public.drop_paid_online(uuid), public.counter_extras(uuid, text) to authenticated;
