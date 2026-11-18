-- Deposits on bookings (docs/BOOKINGS.md decisions, REVENUE_PLAN 5.4; step 4 of 5.9). A deposit
-- holds the time: the customer sees it and "not refundable through Tikka" before paying, the time
-- is held for 10 minutes while they pay, and paying books it. Paystack splits it like a pay link
-- (Tikka 1%, the business bears Paystack's fee) and pays the business the next working day.
-- Tikka never refunds (5.2). The server works out every deposit; the browser never sends one.
--
-- The owner picks the amount (nothing is pre-picked): a % of the price, or a fixed ₦ for services
-- without a set price (they can only take a fixed amount). Any service can differ: no deposit, a
-- fixed amount, or pay in full. At least ₦1,000 (none for services under ₦1,000), never more than
-- the price or the business's maximum per payment. Bookings made with a Tikka or by the owner never
-- take one.

-- ---------------------------------------------------------------- settings

alter table public.booking_settings
  add column deposit_mode text not null default 'off' check (deposit_mode in ('off', 'percent', 'fixed')),
  add column deposit_percent int check (deposit_percent between 5 and 100),
  -- The fixed amount: for every service (mode fixed), or for services without a set price (mode percent).
  add column deposit_fixed_kobo int check (deposit_fixed_kobo between 100000 and 100000000),
  -- "This deposit counts towards your bill".
  add column deposit_counts boolean not null default true;

-- A service's own deposit, when it differs: none, a fixed amount, or the full price.
alter table public.business_services
  add column deposit_mode text check (deposit_mode in ('none', 'fixed', 'full')),
  add column deposit_kobo int check (deposit_kobo between 100000 and 100000000);
grant update (deposit_mode, deposit_kobo) on public.business_services to authenticated;

-- ---------------------------------------------------------------- bookings

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('held', 'booked', 'arrived', 'no_show', 'cancelled'));
alter table public.bookings
  -- What the service cost when booked, so the counter knows what's left to collect.
  add column price_kobo int,
  add column price_kind text,
  add column deposit_kobo int,
  add column deposit_counts boolean,
  add column deposit_paid_kobo int,
  add column deposit_fee_kobo int,
  add column deposit_tikka_kobo int,
  add column deposit_reference text unique,
  add column deposit_email text check (char_length(deposit_email) <= 120),
  add column deposit_paid_at timestamptz,
  -- Where the deposit goes, fixed when the time is held.
  add column deposit_subaccount text,
  add column deposit_mode text,
  -- A held time stops counting after this unless it's paid.
  add column hold_expires_at timestamptz,
  -- When the customer was shown "not refundable through Tikka" with the amount, before paying.
  add column terms_shown_at timestamptz;

-- Does this booking take up its time? Cancelled ones don't, nor held ones whose 10 minutes are up.
create function private.booking_counts(p_status text, p_hold timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status <> 'cancelled' and (p_status <> 'held' or p_hold > now());
$$;

-- The deposit for a service, in kobo (0: none). Payments must be ready for the business with an
-- account of the Paystack mode the site runs with (p_mode); otherwise the booking is free.
create function private.deposit_for(p_business uuid, p_service uuid, p_mode text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  v public.business_services%rowtype;
  max_k int;
  d int := 0;
  priced boolean;
begin
  if private.payments_problem(p_business) is not null
     or not exists (select 1 from public.business_payouts where business_id = p_business and paystack_mode = p_mode) then
    return 0;
  end if;
  select * into s from public.booking_settings where business_id = p_business;
  select * into v from public.business_services where id = p_service and business_id = p_business;
  if s.business_id is null or v.id is null then
    return 0;
  end if;
  priced := v.price_kind = 'fixed' and v.price_kobo is not null;
  if v.deposit_mode = 'none' then
    return 0;
  elsif v.deposit_mode = 'fixed' then
    d := coalesce(v.deposit_kobo, 0);
  elsif v.deposit_mode = 'full' then
    d := case when priced then v.price_kobo else 0 end;
  elsif s.deposit_mode = 'percent' then
    d := case when priced then round(v.price_kobo * s.deposit_percent / 100.0)::int else coalesce(s.deposit_fixed_kobo, 0) end;
  elsif s.deposit_mode = 'fixed' then
    d := coalesce(s.deposit_fixed_kobo, 0);
  end if;
  if d <= 0 or (priced and v.price_kobo < 100000) then
    return 0;
  end if;
  d := greatest(d, 100000);
  if priced then
    d := least(d, v.price_kobo);
  end if;
  select max_kobo into max_k from public.business_payments where business_id = p_business;
  return least(d, coalesce(max_k, d));
end;
$$;

-- Every service's deposit, for the booking sheet and the business page (public: amounts only).
create function public.booking_deposits(p_business uuid, p_mode text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'counts', coalesce((select deposit_counts from public.booking_settings where business_id = p_business), true),
    'services', coalesce(jsonb_object_agg(v.id, private.deposit_for(p_business, v.id, p_mode)) filter (where private.deposit_for(p_business, v.id, p_mode) > 0), '{}'::jsonb))
  from public.business_services v where v.business_id = p_business;
$$;

-- ---------------------------------------------- free times now ignore lapsed holds

create or replace function private.time_full(p_business uuid, p_start timestamptz, p_minutes int, p_ignore uuid, p_capacity int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.booking_blocks k
      where k.business_id = p_business and k.starts_at < p_start + make_interval(mins => p_minutes) and k.ends_at > p_start)
    or coalesce((
      select max((
        select count(*) from public.bookings b
        where b.business_id = p_business and private.booking_counts(b.status, b.hold_expires_at) and b.id is distinct from p_ignore
          and b.starts_at <= pt.t and b.ends_at > pt.t))
      from (
        select p_start as t
        union
        select b.starts_at from public.bookings b
        where b.business_id = p_business and private.booking_counts(b.status, b.hold_expires_at) and b.id is distinct from p_ignore
          and b.starts_at > p_start and b.starts_at < p_start + make_interval(mins => p_minutes)
      ) pt), 0) >= p_capacity;
$$;

create or replace function public.booking_busy(p_business uuid, p_from timestamptz, p_days int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  b public.businesses%rowtype;
  p_to timestamptz := p_from + make_interval(days => least(greatest(p_days, 1), 186));
begin
  select * into b from public.businesses where id = p_business;
  select * into s from public.booking_settings where business_id = p_business;
  if b.id is null or b.suspended or s.business_id is null or not s.enabled then
    return null;
  end if;
  return jsonb_build_object(
    'capacity', s.capacity, 'notice_minutes', s.notice_minutes, 'ahead_days', s.ahead_days, 'hours', b.hours,
    'busy', coalesce((
      select jsonb_agg(jsonb_build_array(x.starts_at, x.ends_at) order by x.starts_at) from public.bookings x
      where x.business_id = p_business and private.booking_counts(x.status, x.hold_expires_at) and x.starts_at < p_to and x.ends_at > p_from), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_array(k.starts_at, k.ends_at) order by k.starts_at) from public.booking_blocks k
      where k.business_id = p_business and k.starts_at < p_to and k.ends_at > p_from), '[]'::jsonb));
end;
$$;

-- ------------------------------------------------------------ booking with a deposit

-- The customer books from the business page. With a deposit for the service: the time is held for
-- 10 minutes ('held'), and the answer says to pay. p_email goes to Paystack for the receipt.
drop function public.book_time(uuid, uuid, timestamptz, text, text, boolean, text);
create function public.book_time(
  p_business uuid, p_service uuid, p_start timestamptz, p_first_name text, p_phone text, p_future boolean, p_visitor text,
  p_mode text, p_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  svc public.business_services%rowtype;
  problem text;
  bk public.bookings%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
  dep int;
  o public.business_payouts%rowtype;
begin
  if v_name = '' then
    return jsonb_build_object('kind', 'bad_name');
  end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  if exists (select 1 from public.businesses where id = p_business and suspended) then
    return jsonb_build_object('kind', 'off');
  end if;
  perform 1 from public.booking_settings where business_id = p_business for update;
  svc := private.booking_service(p_business, p_service);
  problem := private.booking_problem(p_business, p_start, svc.minutes, null, false);
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if (select count(*) from public.bookings
      where business_id = p_business and phone = p_phone and status = 'booked' and starts_at > now()) >= 3 then
    return jsonb_build_object('kind', 'too_many');
  end if;
  dep := private.deposit_for(p_business, p_service, coalesce(p_mode, ''));
  if dep > 0 and coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    return jsonb_build_object('kind', 'bad_email');
  end if;
  bk := private.insert_booking(p_business, svc, p_start, v_name, p_phone, private.booking_lead(p_business, p_phone, v_name),
                               null, 'page', p_future, p_visitor);
  update public.bookings set price_kobo = svc.price_kobo, price_kind = svc.price_kind where id = bk.id;
  if dep = 0 then
    return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id);
  end if;
  select * into o from public.business_payouts where business_id = p_business;
  update public.bookings
  set status = 'held', hold_expires_at = now() + interval '10 minutes', terms_shown_at = now(), deposit_kobo = dep,
      deposit_counts = coalesce((select deposit_counts from public.booking_settings where business_id = p_business), true),
      deposit_email = left(trim(p_email), 120), deposit_subaccount = o.subaccount_code, deposit_mode = o.paystack_mode
  where id = bk.id;
  return jsonb_build_object('kind', 'pay', 'token', bk.view_token, 'id', bk.id, 'deposit_kobo', dep);
end;
$$;

-- What starting (or restarting) the deposit checkout needs (server only).
create function public.booking_checkout(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'deposit_kobo', b.deposit_kobo, 'tikka_kobo', private.tikka_share(coalesce(b.deposit_kobo, 0)),
    'subaccount', b.deposit_subaccount, 'mode', b.deposit_mode, 'email', b.deposit_email,
    'hold_live', b.status = 'held' and b.hold_expires_at > now(), 'business_name', z.name)
  from public.bookings b join public.businesses z on z.id = b.business_id
  where b.view_token = p_token;
$$;

-- Restarting a lapsed hold: if the time is still free, hold it again for 10 minutes.
create function public.rehold_booking(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  s public.booking_settings%rowtype;
begin
  select * into b from public.bookings where view_token = p_token;
  if not found or b.status <> 'held' then
    return jsonb_build_object('kind', coalesce(b.status, 'not_found'));
  end if;
  if b.hold_expires_at > now() then
    return jsonb_build_object('kind', 'held');
  end if;
  perform 1 from public.booking_settings where business_id = b.business_id for update;
  select * into s from public.booking_settings where business_id = b.business_id;
  if b.starts_at < now() + make_interval(mins => s.notice_minutes) or private.time_full(b.business_id, b.starts_at, b.minutes, b.id, s.capacity) then
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
    return jsonb_build_object('kind', 'taken');
  end if;
  update public.bookings set hold_expires_at = now() + interval '10 minutes' where id = b.id;
  return jsonb_build_object('kind', 'held');
end;
$$;

-- Paystack says a deposit succeeded (webhook or the return from checkout; server only). The
-- reference is bk_<pass token>_<attempt>. Idempotent; the amount must match. Paid means booked,
-- even if the hold lapsed meanwhile: the customer's money moved.
create function public.complete_booking_deposit(p_reference text, p_amount_kobo int, p_fee_kobo int, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  v_token text := substring(p_reference from '^bk_([0-9a-f]{24})_');
begin
  select * into b from public.bookings where view_token = v_token for update;
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  if b.deposit_paid_at is not null then
    return jsonb_build_object('kind', 'already_paid', 'id', b.id);
  end if;
  if b.deposit_kobo is null or p_amount_kobo <> b.deposit_kobo then
    return jsonb_build_object('kind', 'wrong_amount');
  end if;
  update public.bookings
  set status = case when status in ('held', 'cancelled') then 'booked' else status end, cancelled_at = null,
      deposit_paid_kobo = p_amount_kobo, deposit_fee_kobo = p_fee_kobo, deposit_tikka_kobo = private.tikka_share(p_amount_kobo),
      deposit_reference = p_reference, deposit_paid_at = now(), deposit_email = coalesce(left(nullif(trim(coalesce(p_email, '')), ''), 120), deposit_email)
  where id = b.id;
  return jsonb_build_object('kind', 'paid', 'id', b.id);
end;
$$;

-- ---------------------------------------------- reads that now know about deposits

create or replace function public.booking_pass(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', b.code, 'service', b.service_name, 'minutes', b.minutes, 'starts_at', b.starts_at, 'status', b.status,
    'first_name', b.first_name, 'moved', b.moved_at is not null, 'business_slug', z.slug, 'business_id', z.id,
    'tikka_token', c.view_token,
    'tikka_reward', case when c.id is null then null
      else coalesce((select r.title from public.cards k join public.rewards r on r.id = k.reward_id where k.id = c.card_id),
                    (select d.bounce_back ->> 'title' from public.drops d where d.id = c.drop_id)) end,
    'tikka_used', c.redeemed_at is not null,
    'deposit_kobo', b.deposit_kobo, 'deposit_paid_kobo', b.deposit_paid_kobo, 'deposit_counts', b.deposit_counts,
    'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'hold_live', b.status = 'held' and b.hold_expires_at > now())
  from public.bookings b
  join public.businesses z on z.id = b.business_id
  left join public.claims c on c.id = b.claim_id
  where b.view_token = p_token;
$$;

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
        'deposit_paid_kobo', b.deposit_paid_kobo, 'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'deposit_counts', b.deposit_counts)
      order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.status <> 'held' and b.starts_at < p_to and b.ends_at > p_from), '[]'::jsonb);
end;
$$;

create or replace function public.check_booking_code(p_business uuid, p_code text) returns jsonb
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
  select * into b from public.bookings where code = 'BK-' || substr(v_code, 3) and status <> 'held';
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  if b.business_id <> p_business then
    return jsonb_build_object('kind', 'wrong_business');
  end if;
  return jsonb_build_object('kind', 'booking', 'id', b.id, 'code', b.code, 'first_name', b.first_name, 'service', b.service_name,
    'minutes', b.minutes, 'starts_at', b.starts_at, 'status', b.status, 'source', b.source,
    'deposit_paid_kobo', b.deposit_paid_kobo, 'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'deposit_counts', b.deposit_counts);
end;
$$;

create or replace function public.get_booking_setup(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team sees its booking setup' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.booking_settings where business_id = p_business;
  return jsonb_build_object(
    'set_up', s.business_id is not null,
    'enabled', coalesce(s.enabled, false), 'capacity', coalesce(s.capacity, 1),
    'notice_minutes', coalesce(s.notice_minutes, 120), 'ahead_days', coalesce(s.ahead_days, 92),
    'deposit', jsonb_build_object('mode', coalesce(s.deposit_mode, 'off'), 'percent', s.deposit_percent,
                                  'fixed_kobo', s.deposit_fixed_kobo, 'counts', coalesce(s.deposit_counts, true)),
    'service_deposits', coalesce((
      select jsonb_object_agg(v.id, jsonb_build_object('mode', v.deposit_mode, 'kobo', v.deposit_kobo))
      from public.business_services v where v.business_id = p_business and v.deposit_mode is not null), '{}'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'starts_at', k.starts_at, 'ends_at', k.ends_at, 'note', k.note) order by k.starts_at)
      from public.booking_blocks k where k.business_id = p_business and k.ends_at > now() - interval '1 day'), '[]'::jsonb));
end;
$$;

-- The owner sets deposits: off, a % of the price (with a fixed ₦ for services without a set price),
-- or a fixed ₦ for everything; whether it counts towards the bill; and each service that differs
-- ({ "<service id>": { "mode": "none" | "fixed" | "full" | null, "kobo": n } }).
create function public.save_deposit_settings(
  p_business uuid, p_mode text, p_percent int, p_fixed_kobo int, p_counts boolean, p_services jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sets deposits' using errcode = 'insufficient_privilege';
  end if;
  if p_mode not in ('off', 'percent', 'fixed') then
    return jsonb_build_object('kind', 'bad_mode');
  end if;
  if p_mode = 'percent' and (p_percent is null or p_percent not between 5 and 100) then
    return jsonb_build_object('kind', 'bad_percent');
  end if;
  if p_mode = 'fixed' and p_fixed_kobo is null then
    return jsonb_build_object('kind', 'bad_amount');
  end if;
  if not exists (select 1 from public.booking_settings where business_id = p_business) then
    return jsonb_build_object('kind', 'not_set_up');
  end if;
  update public.booking_settings
  set deposit_mode = p_mode, deposit_percent = case when p_mode = 'percent' then p_percent end,
      deposit_fixed_kobo = case when p_mode = 'off' then null else p_fixed_kobo end,
      deposit_counts = coalesce(p_counts, true), updated_at = now()
  where business_id = p_business;
  update public.business_services v
  set deposit_mode = nullif(p_services -> v.id::text ->> 'mode', ''),
      deposit_kobo = case when p_services -> v.id::text ->> 'mode' = 'fixed' then (p_services -> v.id::text ->> 'kobo')::int end
  where v.business_id = p_business and p_services ? v.id::text;
  return jsonb_build_object('kind', 'saved');
end;
$$;

-- Services are saved whole: keep each one's length and its own deposit.
create or replace function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, minutes,
                                        deposit_mode, deposit_kobo, image_path, focal_x, focal_y, position)
  select p_business, nullif(trim(s ->> 'group_name'), ''), trim(s ->> 'name'), nullif(trim(s ->> 'description'), ''),
         (s ->> 'price_kobo')::int, coalesce(s ->> 'price_kind', 'fixed'), nullif(trim(s ->> 'duration'), ''),
         nullif(s ->> 'minutes', '')::int,
         nullif(s ->> 'deposit_mode', ''), case when s ->> 'deposit_mode' = 'fixed' then nullif(s ->> 'deposit_kobo', '')::int end,
         nullif(s ->> 'image_path', ''),
         round(least(greatest(coalesce((s ->> 'focal_x')::numeric, 0.5), 0), 1), 3),
         round(least(greatest(coalesce((s ->> 'focal_y')::numeric, 0.3), 0), 1), 3),
         (o - 1)::int
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The owner's Money screen also lists deposits paid.
create function public.get_deposits(p_business uuid, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees money' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'first_name', b.first_name, 'service', b.service_name, 'starts_at', b.starts_at, 'status', b.status,
        'paid_kobo', b.deposit_paid_kobo, 'fee_kobo', b.deposit_fee_kobo, 'tikka_kobo', b.deposit_tikka_kobo,
        'paid_at', b.deposit_paid_at, 'mode', b.deposit_mode) order by b.deposit_paid_at desc)
    from (select * from public.bookings where business_id = p_business and deposit_paid_at is not null
          order by deposit_paid_at desc limit least(greatest(p_limit, 1), 500)) b), '[]'::jsonb);
end;
$$;

revoke all on function private.booking_counts(text, timestamptz), private.deposit_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.booking_deposits(uuid, text), public.book_time(uuid, uuid, timestamptz, text, text, boolean, text, text, text),
  public.booking_checkout(text), public.rehold_booking(text), public.complete_booking_deposit(text, int, int, text),
  public.save_deposit_settings(uuid, text, int, int, boolean, jsonb), public.get_deposits(uuid, int) from public, anon;
revoke all on function public.book_time(uuid, uuid, timestamptz, text, text, boolean, text, text, text), public.booking_checkout(text),
  public.rehold_booking(text), public.complete_booking_deposit(text, int, int, text) from authenticated;
grant execute on function public.booking_deposits(uuid, text) to anon, authenticated;
grant execute on function public.save_deposit_settings(uuid, text, int, int, boolean, jsonb), public.get_deposits(uuid, int) to authenticated;
grant execute on function public.book_time(uuid, uuid, timestamptz, text, text, boolean, text, text, text), public.booking_checkout(text),
  public.rehold_booking(text), public.complete_booking_deposit(text, int, int, text) to service_role;
