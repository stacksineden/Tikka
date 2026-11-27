-- Every customer has a number, and deposits belong to their booking (27 Nov 2026).
--
-- 1. A sale or a pay link without a WhatsApp number became a second customer under their name
--    ("Ayomide" twice). record_sale() and create_pay_link() now refuse one without a number (a
--    booking, a sale or a Tikka brings its own). complete_pay_link() still records a payment from an
--    old link without one: the customer's money moved, so it is never refused.
-- 2. set_customer_phone(): "Add their number" and "Is this the same person?" for real accounts. The
--    sales and pay links saved under that name without a number get it, so they join that customer.
-- 3. A deposit the owner took themself (cash, transfer, card) is recorded on the booking:
--    record_booking_deposit(). It shows as "Deposit paid" on Today, the counter, the pass and Money,
--    counted once, by how it was paid. Never Tikka's Paystack money (deposit_mode stays null, so
--    admin_money() leaves it out).
-- 4. A pay link paid for a Tikka is the deposit on the booking made with that Tikka
--    (bookings.deposit_pay_link), whichever came first. The ledger then leaves that link (and its
--    sale) out, so the money is counted once, as the booking's deposit.

alter table public.bookings
  add column deposit_method text check (deposit_method in ('cash', 'transfer', 'card', 'pay_link')),
  add column deposit_pay_link uuid unique references public.pay_links (id) on delete set null;

-- 1. A number on every sale and pay link --------------------------------------------------------

create or replace function public.record_sale(
  p_business uuid, p_name text, p_item text, p_total_kobo int, p_paid_kobo int, p_method text, p_booking uuid, p_phone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_total int := least(greatest(coalesce(p_total_kobo, 0), 0), 1000000000);
  v_paid int;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  perform private.owner_or_raise(p_business);
  if p_method not in ('cash', 'transfer', 'card') then
    raise exception 'Paid by cash, transfer or card' using errcode = 'check_violation';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format' using errcode = 'check_violation';
  end if;
  if p_booking is not null then
    if not exists (select 1 from public.bookings where id = p_booking and business_id = p_business) then
      raise exception 'That booking isn''t this business''s' using errcode = 'no_data_found';
    end if;
    select id into v_id from public.sales where booking_id = p_booking;
    if v_id is not null then
      return v_id;
    end if;
    -- A booking brings its own number when the owner didn't type one.
    v_phone := coalesce(v_phone, (select phone from public.bookings where id = p_booking));
  elsif v_phone is null then
    -- Every customer has a WhatsApp number: it's who they are.
    raise exception 'Add their WhatsApp number' using errcode = 'check_violation';
  end if;
  v_paid := least(greatest(coalesce(p_paid_kobo, 0), 0), v_total);
  insert into public.sales (business_id, name, item, total_kobo, booking_id, phone, created_by)
  values (p_business, coalesce(nullif(left(trim(coalesce(p_name, '')), 40), ''), 'Walk-in'),
          coalesce(nullif(left(trim(coalesce(p_item, '')), 60), ''), 'Sale'), v_total, p_booking, v_phone, auth.uid())
  returning id into v_id;
  if v_paid > 0 then
    insert into public.sale_payments (sale_id, business_id, kobo, method, created_by) values (v_id, p_business, v_paid, p_method, auth.uid());
  end if;
  return v_id;
end;
$$;

create or replace function public.create_pay_link(
  p_business uuid, p_amount_kobo int, p_note text, p_name text, p_claim uuid, p_mode text, p_sale uuid, p_phone text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  s public.sales%rowtype;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_name text := p_name;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner makes pay links' using errcode = 'insufficient_privilege';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  if p_sale is not null then
    select * into s from public.sales where id = p_sale and business_id = p_business;
    if not found then
      return jsonb_build_object('kind', 'not_found');
    end if;
    v_name := s.name;
    v_phone := coalesce(s.phone, v_phone);
  end if;
  if p_claim is not null and v_phone is null then
    v_phone := (select l.phone from public.claims c join public.leads l on l.id = c.lead_id where c.id = p_claim);
  end if;
  -- Every customer has a WhatsApp number (a sale or a Tikka brings its own).
  if v_phone is null then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  r := public.create_pay_link(p_business, p_amount_kobo, p_note, v_name, p_claim, p_mode);
  if r ->> 'kind' = 'created' then
    update public.pay_links
    set sale_id = p_sale,
        phone = coalesce(v_phone, (select l.phone from public.leads l where l.id = pay_links.lead_id))
    where token = r ->> 'token';
  end if;
  return r;
end;
$$;

-- 2. Add their number ----------------------------------------------------------------------------

-- The sales and pay links saved under this name without a number get it. Returns how many changed.
create function public.set_customer_phone(p_business uuid, p_name text, p_phone text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  want text := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  n int;
  m int;
begin
  perform private.owner_or_raise(p_business);
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format' using errcode = 'check_violation';
  end if;
  if want = '' then
    return 0;
  end if;
  update public.sales set phone = p_phone
  where business_id = p_business and phone is null and booking_id is null
    and lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = want;
  get diagnostics n = row_count;
  update public.pay_links set phone = p_phone
  where business_id = p_business and phone is null and lead_id is null
    and lower(regexp_replace(trim(coalesce(customer_name, '')), '\s+', ' ', 'g')) = want;
  get diagnostics m = row_count;
  return n + m;
end;
$$;
revoke all on function public.set_customer_phone(uuid, text, text) from public, anon;
grant execute on function public.set_customer_phone(uuid, text, text) to authenticated;

-- 3. A deposit the owner took ---------------------------------------------------------------------

-- 'saved', 'cleared', or why not: 'not_found', 'cancelled', 'paid_online' (a deposit through Tikka is
-- already on it), 'settled' (already marked paid), 'bad_amount'.
create function public.record_booking_deposit(p_business uuid, p_booking uuid, p_kobo int, p_method text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  perform private.owner_or_raise(p_business);
  select * into b from public.bookings where id = p_booking and business_id = p_business for update;
  if not found then
    return 'not_found';
  end if;
  if b.status in ('cancelled', 'held') then
    return 'cancelled';
  end if;
  if b.deposit_reference is not null or b.deposit_pay_link is not null or b.deposit_method = 'pay_link' then
    return 'paid_online';
  end if;
  if exists (select 1 from public.sales where booking_id = p_booking) then
    return 'settled';
  end if;
  if coalesce(p_kobo, 0) = 0 then
    update public.bookings set deposit_paid_kobo = null, deposit_paid_at = null, deposit_method = null where id = p_booking;
    return 'cleared';
  end if;
  if p_kobo < 0 or p_kobo > 1000000000 then
    return 'bad_amount';
  end if;
  if p_method not in ('cash', 'transfer', 'card') then
    raise exception 'Paid by cash, transfer or card' using errcode = 'check_violation';
  end if;
  update public.bookings
  set deposit_paid_kobo = p_kobo, deposit_paid_at = now(), deposit_method = p_method, deposit_counts = true
  where id = p_booking;
  return 'saved';
end;
$$;
revoke all on function public.record_booking_deposit(uuid, uuid, int, text) from public, anon;
grant execute on function public.record_booking_deposit(uuid, uuid, int, text) to authenticated;

-- 4. A Tikka's pay link is its booking's deposit ---------------------------------------------------

-- The first paid, unused pay link for this Tikka goes on the first upcoming booking made with it that
-- has no deposit and isn't marked paid yet.
create function private.claim_deposit(p_claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.pay_links%rowtype;
  v_booking uuid;
begin
  if p_claim is null then
    return;
  end if;
  select * into l from public.pay_links p
  where p.claim_id = p_claim and p.status = 'paid'
    and not exists (select 1 from public.bookings k where k.deposit_pay_link = p.id)
  order by p.paid_at limit 1;
  if not found then
    return;
  end if;
  select k.id into v_booking from public.bookings k
  where k.claim_id = p_claim and k.business_id = l.business_id and k.status in ('booked', 'arrived')
    and k.deposit_paid_kobo is null
    and not exists (select 1 from public.sales s where s.booking_id = k.id)
  order by k.starts_at limit 1
  for update;
  if v_booking is null then
    return;
  end if;
  update public.bookings
  set deposit_paid_kobo = l.paid_kobo, deposit_paid_at = l.paid_at, deposit_method = 'pay_link',
      deposit_pay_link = l.id, deposit_counts = true
  where id = v_booking;
end;
$$;
revoke all on function private.claim_deposit(uuid) from public, anon, authenticated;

create function private.claim_deposit_from_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.claim_deposit(new.claim_id);
  return null;
end;
$$;
create trigger pay_link_paid_claim_deposit after update of status on public.pay_links
  for each row when (new.status = 'paid' and old.status is distinct from 'paid' and new.claim_id is not null)
  execute function private.claim_deposit_from_link();

create function private.claim_deposit_from_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.claim_deposit(new.claim_id);
  return null;
end;
$$;
create trigger booking_claim_deposit after insert on public.bookings
  for each row when (new.claim_id is not null)
  execute function private.claim_deposit_from_booking();

-- Links already paid for Tikkas that have a booking.
select private.claim_deposit(c) from (select distinct claim_id c from public.pay_links where status = 'paid' and claim_id is not null) x;

-- The ledger leaves out a pay link that is a booking's deposit, and the sale it made: the booking
-- counts it (same as before otherwise).
create or replace function private.ledger_json(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '400 days';
begin
  return jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
          'phone', s.phone, 'receipt_token', s.receipt_token, 'added_label', s.added_label, 'added_kobo', s.added_kobo,
          'payments', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'kobo', p.kobo, 'method', p.method) order by p.at)
                                from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb))
        order by s.at)
      from public.sales s
      where s.business_id = p_business and s.at >= since
        and not exists (select 1 from public.pay_links l join public.bookings k on k.deposit_pay_link = l.id where l.sale_id = s.id)), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'kobo', e.kobo) order by e.at)
      from public.expenses e where e.business_id = p_business and e.at >= since), '[]'::jsonb),
    'regular', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'kobo', r.kobo, 'every', r.every, 'from', r.starts_at) order by r.starts_at)
      from public.regular_costs r where r.business_id = p_business and r.ended_at is null), '[]'::jsonb),
    'pay_links', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', l.id, 'paid_at', l.paid_at, 'kobo', l.paid_kobo, 'note', l.note,
          'name', coalesce(l.customer_name, d.first_name), 'phone', coalesce(l.phone, d.phone)) order by l.paid_at)
      from public.pay_links l left join public.leads d on d.id = l.lead_id
      where l.business_id = p_business and l.status = 'paid' and l.sale_id is null and l.paid_at >= since and l.paystack_mode = 'live'
        and not exists (select 1 from public.bookings k where k.deposit_pay_link = l.id)), '[]'::jsonb));
end;
$$;

-- Money alerts count deposits on the day they were paid, by how they were paid.
create or replace function public.money_alert_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'business_id', b.id,
      'business_name', b.name,
      'ledger', private.ledger_json(b.id),
      'deposits', coalesce((
        select jsonb_agg(jsonb_build_object('at', coalesce(k.deposit_paid_at, k.created_at), 'kobo', k.deposit_paid_kobo, 'name', k.first_name,
                                            'item', k.service_name, 'method', k.deposit_method))
        from public.bookings k where k.business_id = b.id and k.deposit_paid_kobo is not null
          and coalesce(k.deposit_paid_at, k.created_at) > now() - interval '60 days'), '[]'::jsonb),
      'today', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'starts_at', k.starts_at, 'status', k.status))
        from public.bookings k where k.business_id = b.id and k.status <> 'held'
          and (k.starts_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date), '[]'::jsonb),
      'subscriptions', (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_subscriptions s
        join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
        where s.business_id = b.id))), '[]'::jsonb)
  from public.businesses b
  where not b.suspended and not b.is_demo
    and exists (select 1 from public.push_subscriptions s
                join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
                where s.business_id = b.id);
$$;
revoke all on function public.money_alert_data() from public, anon, authenticated;
grant execute on function public.money_alert_data() to service_role;

-- The owner's bookings say how the deposit was paid and when (same as before otherwise).
create or replace function public.get_bookings(p_business uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owner boolean := private.is_owner(p_business);
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team sees its bookings' using errcode = 'insufficient_privilege';
  end if;
  -- Held times waiting for a deposit aren't bookings yet.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'service', b.service_name, 'service_id', b.service_id, 'minutes', b.minutes,
        'starts_at', b.starts_at, 'ends_at', b.ends_at, 'first_name', b.first_name,
        'phone', case when owner then b.phone end, 'source', b.source, 'status', b.status, 'code', b.code,
        'claim_id', b.claim_id, 'lead_id', case when owner then b.lead_id end, 'view_token', case when owner then b.view_token end,
        'moved', b.moved_at is not null, 'created_at', b.created_at,
        'deposit_paid_kobo', b.deposit_paid_kobo, 'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'deposit_counts', b.deposit_counts,
        'deposit_paid_at', b.deposit_paid_at, 'deposit_method', b.deposit_method,
        'detail', b.detail, 'home', b.home_area is not null, 'home_area', case when owner then b.home_area end,
        'event_day', b.event_day, 'gap_minutes', b.gap_minutes,
        -- Found through Tikka search, and whether new to the business (owners only).
        'found_via', b.found_via, 'found_new', case when owner then b.found_new end)
      order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.status <> 'held' and b.starts_at < p_to and b.ends_at > p_from), '[]'::jsonb);
end;
$$;

-- The receipt says how the deposit was paid, and when (same as before otherwise).
create or replace function public.receipt_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', s.business_id, 'business_slug', z.slug, 'n', s.receipt_n,
    'sale', jsonb_build_object('id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
      'added_label', s.added_label, 'added_kobo', s.added_kobo,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'kobo', p.kobo, 'method', p.method) order by p.at)
                            from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb)),
    'booking', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'service', b.service_name, 'minutes', b.minutes, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
      'first_name', b.first_name, 'created_at', b.created_at, 'status', b.status, 'source', b.source, 'code', b.code,
      'deposit_paid_kobo', b.deposit_paid_kobo, 'deposit_counts', b.deposit_counts, 'price_kobo', b.price_kobo,
      'deposit_paid_at', b.deposit_paid_at, 'deposit_method', b.deposit_method,
      'price_kind', b.price_kind, 'detail', b.detail) end)
  from public.sales s
  join public.businesses z on z.id = s.business_id
  left join public.bookings b on b.id = s.booking_id
  where s.receipt_token = p_token and p_token ~ '^rc-[A-Za-z0-9_-]{12}$';
$$;
