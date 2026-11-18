-- Bookings with free times (docs/BOOKINGS.md, REVENUE_PLAN 5.5). The booking sheet stops being a
-- WhatsApp request and becomes a stored booking: the owner sets how many customers she can serve
-- at once and how long each service takes; customers only see free times; picking one books it.
-- The owner moves, cancels, adds and blocks; staff mark Arrived / No-show. No money here yet.
--
-- Every write goes through a function that locks the business's settings row first, so two people
-- can never take the last place at the same time. Phone numbers only reach owners (rule 4).

-- --------------------------------------------------------------- tables

create table public.booking_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled boolean not null default false,
  -- How many customers the business can serve at the same time.
  capacity int not null default 1 check (capacity between 1 and 20),
  -- At least this long between booking and the time (default 2 hours).
  notice_minutes int not null default 120 check (notice_minutes between 0 and 10080),
  -- How far ahead people can book (default about three months).
  ahead_days int not null default 92 check (ahead_days between 7 and 183),
  updated_at timestamptz not null default now()
);

-- How long a service takes, for the calendar. Empty counts as one hour.
alter table public.business_services
  add column minutes int check (minutes between 15 and 600 and minutes % 15 = 0);
grant update (minutes) on public.business_services to authenticated;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Services are saved whole (ids change), so the booking keeps its own name and length.
  service_id uuid references public.business_services (id) on delete set null,
  service_name text not null check (char_length(service_name) between 1 and 60),
  minutes int not null check (minutes between 15 and 600),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  first_name text not null check (char_length(first_name) between 1 and 30),
  -- Empty only for a walk-in the owner added without a number.
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Goes with the lead: forgetting a person (admin_forget_person) removes their bookings too.
  lead_id uuid references public.leads (id) on delete cascade,
  -- A Tikka the booking is for (docs/BOOKINGS.md journey 11).
  claim_id uuid references public.claims (id) on delete set null,
  source text not null check (source in ('page', 'owner', 'tikka')),
  status text not null default 'booked' check (status in ('booked', 'arrived', 'no_show', 'cancelled')),
  -- The tick on the booking sheet; it reaches the lead only when they come in.
  future_offers boolean not null default false,
  code text not null unique check (code ~ '^BK-[ACDEFGHJKMNPQRTUVWXY34679]{6}$'),
  view_token text not null unique,
  visitor_id text,
  moved_at timestamptz,
  marked_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index bookings_business_time on public.bookings (business_id, starts_at);
create index bookings_phone on public.bookings (business_id, phone) where phone is not null;

create table public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(note) <= 60),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '31 days')
);
create index booking_blocks_business_time on public.booking_blocks (business_id, starts_at);

-- Nothing is read or written directly: only through the functions below.
alter table public.booking_settings enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_blocks enable row level security;
revoke all on public.booking_settings, public.bookings, public.booking_blocks from anon, authenticated;

-- ------------------------------------------------------------- helpers

-- The business's opening hours on the day p_start falls on (WAT), as minutes after midnight.
-- No hours set: 9am–6pm, Monday to Saturday (lib/booking.ts DEFAULT_HOURS).
create function private.open_minutes(p_hours jsonb, p_day date) returns int[]
language plpgsql immutable set search_path = '' as $$
declare
  h jsonb := coalesce(p_hours, '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":false,"from":"09:00","to":"18:00"}}'::jsonb);
  dow int := extract(dow from p_day)::int;
  d jsonb;
  f int;
  t int;
begin
  d := case dow when 0 then h -> 'sunday' when 6 then h -> 'saturday' else h -> 'weekdays' end;
  if d is null or coalesce(d ->> 'open', 'false') <> 'true'
     or coalesce(d ->> 'from', '') !~ '^\d{1,2}:\d{2}$' or coalesce(d ->> 'to', '') !~ '^\d{1,2}:\d{2}$' then
    return null;
  end if;
  f := split_part(d ->> 'from', ':', 1)::int * 60 + split_part(d ->> 'from', ':', 2)::int;
  t := split_part(d ->> 'to', ':', 1)::int * 60 + split_part(d ->> 'to', ':', 2)::int;
  return case when t > f then array[f, t] end;
end;
$$;

-- Is [p_start, p_start + p_minutes) full? Full when anything blocked overlaps it, or when at some
-- moment inside it the business already has `capacity` bookings. The busiest moment is always the
-- start of the new booking or the start of a booking inside it, so only those are counted.
create function private.time_full(p_business uuid, p_start timestamptz, p_minutes int, p_ignore uuid, p_capacity int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.booking_blocks k
      where k.business_id = p_business and k.starts_at < p_start + make_interval(mins => p_minutes) and k.ends_at > p_start)
    or coalesce((
      select max((
        select count(*) from public.bookings b
        where b.business_id = p_business and b.status <> 'cancelled' and b.id is distinct from p_ignore
          and b.starts_at <= pt.t and b.ends_at > pt.t))
      from (
        select p_start as t
        union
        select b.starts_at from public.bookings b
        where b.business_id = p_business and b.status <> 'cancelled' and b.id is distinct from p_ignore
          and b.starts_at > p_start and b.starts_at < p_start + make_interval(mins => p_minutes)
      ) pt), 0) >= p_capacity;
$$;

-- Why a time can't be booked, or null when it can. Customers get every check; an owner who
-- knows she can fit someone in (p_force) skips them all.
create function private.booking_problem(p_business uuid, p_start timestamptz, p_minutes int, p_ignore uuid, p_force boolean) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  local timestamp := p_start at time zone 'Africa/Lagos';
  hrs int[];
  start_min int;
begin
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    return 'off';
  end if;
  if p_force then
    return null;
  end if;
  if p_start < now() + make_interval(mins => s.notice_minutes) then
    return 'too_soon';
  end if;
  if p_start > now() + make_interval(days => s.ahead_days) then
    return 'too_far';
  end if;
  hrs := private.open_minutes((select hours from public.businesses where id = p_business), local::date);
  start_min := extract(hour from local)::int * 60 + extract(minute from local)::int;
  if hrs is null or extract(second from local) <> 0 or start_min % 30 <> 0
     or start_min < hrs[1] or start_min + p_minutes > hrs[2] then
    return 'closed';
  end if;
  if private.time_full(p_business, p_start, p_minutes, p_ignore, s.capacity) then
    return 'taken';
  end if;
  return null;
end;
$$;

create function private.booking_code() returns text
language sql volatile set search_path = '' as $$
  select 'BK-' || string_agg(substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(private.crypto_random() * 25)::int, 1), '')
  from generate_series(1, 6);
$$;

-- The service a booking is for: its name and length (one hour when not set).
create function private.booking_service(p_business uuid, p_service uuid) returns public.business_services
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.business_services%rowtype;
begin
  select * into s from public.business_services where id = p_service and business_id = p_business;
  if not found then
    raise exception 'That service isn''t on this business''s page any more' using errcode = 'no_data_found';
  end if;
  s.minutes := coalesce(s.minutes, 60);
  return s;
end;
$$;

-- Inserts the booking with a fresh code and pass link. The caller has checked and locked.
create function private.insert_booking(
  p_business uuid, p_service public.business_services, p_start timestamptz, p_first_name text, p_phone text,
  p_lead uuid, p_claim uuid, p_source text, p_future boolean, p_visitor text
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
  v_code text;
begin
  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               claim_id, source, future_offers, code, view_token, visitor_id, created_by)
  values (p_business, p_service.id, p_service.name, p_service.minutes, p_start, p_start + make_interval(mins => p_service.minutes),
          p_first_name, p_phone, p_lead, p_claim, p_source, coalesce(p_future, false), v_code,
          encode(extensions.gen_random_bytes(12), 'hex'), p_visitor, auth.uid())
  returning * into bk;
  return bk;
end;
$$;

-- The lead for a number: one per person per business. A typed number isn't proven, so a new lead
-- from a booking starts unconfirmed (as page claims do); an existing lead is never downgraded.
create function private.booking_lead(p_business uuid, p_phone text, p_first_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.leads as x (business_id, phone, first_name, first_source, phone_confirmed)
  values (p_business, p_phone, p_first_name, 'booking', false)
  on conflict (business_id, phone) do update set first_name = x.first_name
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------- customers (public)

-- What the booking sheet needs to show free times: the settings, the opening hours and the busy
-- and blocked times in a window. Times only, never who booked. Null when bookings are off.
create function public.booking_busy(p_business uuid, p_from timestamptz, p_days int) returns jsonb
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
      where x.business_id = p_business and x.status <> 'cancelled' and x.starts_at < p_to and x.ends_at > p_from), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_array(k.starts_at, k.ends_at) order by k.starts_at) from public.booking_blocks k
      where k.business_id = p_business and k.starts_at < p_to and k.ends_at > p_from), '[]'::jsonb));
end;
$$;

-- A customer books a free time from the business page. Server only (the route rate-limits first).
-- At most 3 upcoming bookings per number per business.
create function public.book_time(
  p_business uuid, p_service uuid, p_start timestamptz, p_first_name text, p_phone text, p_future boolean, p_visitor text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  svc public.business_services%rowtype;
  problem text;
  bk public.bookings%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
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
  -- One booking at a time per business: the last place can't go twice.
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
  bk := private.insert_booking(p_business, svc, p_start, v_name, p_phone, private.booking_lead(p_business, p_phone, v_name),
                               null, 'page', p_future, p_visitor);
  return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id);
end;
$$;

-- The booking pass (the customer's link): the booking and its business, never the phone number.
create function public.booking_pass(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', b.code, 'service', b.service_name, 'minutes', b.minutes, 'starts_at', b.starts_at, 'status', b.status,
    'first_name', b.first_name, 'moved', b.moved_at is not null, 'business_slug', z.slug, 'business_id', z.id)
  from public.bookings b join public.businesses z on z.id = b.business_id
  where b.view_token = p_token;
$$;

-- ------------------------------------------------------ the business

-- Bookings in a window, for owners and staff. Staff never get the phone number (rule 4).
create function public.get_bookings(p_business uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owner boolean := private.is_owner(p_business);
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team sees its bookings' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'service', b.service_name, 'service_id', b.service_id, 'minutes', b.minutes,
        'starts_at', b.starts_at, 'ends_at', b.ends_at, 'first_name', b.first_name,
        'phone', case when owner then b.phone end, 'source', b.source, 'status', b.status, 'code', b.code,
        'claim_id', b.claim_id, 'lead_id', case when owner then b.lead_id end, 'view_token', case when owner then b.view_token end,
        'moved', b.moved_at is not null, 'created_at', b.created_at)
      order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.starts_at < p_to and b.ends_at > p_from), '[]'::jsonb);
end;
$$;

-- The settings, the blocked times ahead and each service's length, for the team.
create function public.get_booking_setup(p_business uuid) returns jsonb
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
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'starts_at', k.starts_at, 'ends_at', k.ends_at, 'note', k.note) order by k.starts_at)
      from public.booking_blocks k where k.business_id = p_business and k.ends_at > now() - interval '1 day'), '[]'::jsonb));
end;
$$;

-- The owner sets bookings up or changes them: on/off, capacity, notice, reach, and each
-- service's length ({ "<service id>": minutes or null }). Existing bookings never change.
create function public.save_booking_settings(
  p_business uuid, p_enabled boolean, p_capacity int, p_notice int, p_ahead int, p_minutes jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sets up bookings' using errcode = 'insufficient_privilege';
  end if;
  insert into public.booking_settings (business_id, enabled, capacity, notice_minutes, ahead_days)
  values (p_business, p_enabled, p_capacity, p_notice, p_ahead)
  on conflict (business_id) do update
    set enabled = excluded.enabled, capacity = excluded.capacity, notice_minutes = excluded.notice_minutes,
        ahead_days = excluded.ahead_days, updated_at = now();
  update public.business_services s set minutes = nullif(p_minutes ->> s.id::text, '')::int
  where s.business_id = p_business and p_minutes ? s.id::text;
  return true;
end;
$$;

-- The owner adds a booking she took on WhatsApp, a DM or the phone. With a number, they become a
-- lead. p_force books it even outside the free times (she knows she can fit them in).
create function public.add_booking(
  p_business uuid, p_service uuid, p_start timestamptz, p_first_name text, p_phone text, p_force boolean, p_claim uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  svc public.business_services%rowtype;
  problem text;
  bk public.bookings%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_lead uuid;
  v_claim uuid;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner adds bookings' using errcode = 'insufficient_privilege';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  -- "Book her in" from a lead: the Tikka must be this business's, and the name and number its own.
  if p_claim is not null then
    select c.id, c.phone, c.first_name into v_claim, v_phone, v_name
    from public.claims c join public.drops d on d.id = c.drop_id
    where c.id = p_claim and d.business_id = p_business;
    if v_claim is null then
      return jsonb_build_object('kind', 'not_found');
    end if;
  end if;
  if v_name = '' then
    return jsonb_build_object('kind', 'bad_name');
  end if;
  perform 1 from public.booking_settings where business_id = p_business for update;
  svc := private.booking_service(p_business, p_service);
  problem := private.booking_problem(p_business, p_start, svc.minutes, null, coalesce(p_force, false));
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if v_phone is not null then
    v_lead := private.booking_lead(p_business, v_phone, v_name);
  end if;
  bk := private.insert_booking(p_business, svc, p_start, v_name, v_phone, v_lead, v_claim,
                               case when v_claim is null then 'owner' else 'tikka' end, false, null);
  return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id);
end;
$$;

-- The owner moves a booking to another time. The old time is free straight away.
create function public.move_booking(p_business uuid, p_booking uuid, p_start timestamptz, p_force boolean) returns jsonb
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
  problem := private.booking_problem(p_business, p_start, bk.minutes, bk.id, coalesce(p_force, false));
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  update public.bookings set starts_at = p_start, ends_at = p_start + make_interval(mins => bk.minutes), moved_at = now()
  where id = bk.id;
  return jsonb_build_object('kind', 'moved');
end;
$$;

-- The owner cancels a booking. The time is free straight away; any money is settled between the
-- owner and the customer (Tikka never refunds, REVENUE_PLAN 5.2).
create function public.cancel_booking(p_business uuid, p_booking uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner cancels bookings' using errcode = 'insufficient_privilege';
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now()
  where id = p_booking and business_id = p_business and status = 'booked';
  get diagnostics n = row_count;
  return jsonb_build_object('kind', case when n = 1 then 'cancelled' else 'not_booked' end);
end;
$$;

-- Owners and staff mark whether someone came: Arrived (from an hour before the time), No-show
-- (once the time has started), or back to Booked to undo a mistake. Coming in turns the
-- future-offers tick they gave on the booking sheet into the lead's opt-in (rule 12).
create function public.mark_booking(p_business uuid, p_booking uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team marks bookings' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('arrived', 'no_show', 'booked') then
    raise exception 'Unknown status %', p_status using errcode = 'check_violation';
  end if;
  select * into bk from public.bookings where id = p_booking and business_id = p_business for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if bk.status = 'cancelled' then
    return jsonb_build_object('kind', 'cancelled');
  end if;
  if p_status = 'arrived' and bk.starts_at > now() + interval '1 hour' then
    return jsonb_build_object('kind', 'too_early');
  end if;
  if p_status = 'no_show' and bk.starts_at > now() then
    return jsonb_build_object('kind', 'too_early');
  end if;
  update public.bookings set status = p_status, marked_at = case when p_status = 'booked' then null else now() end where id = bk.id;
  if p_status = 'arrived' and bk.future_offers and bk.lead_id is not null then
    update public.leads set marketing_opt_in = true, marketing_opt_in_at = coalesce(marketing_opt_in_at, now())
    where id = bk.lead_id and not opted_out;
  end if;
  return jsonb_build_object('kind', p_status);
end;
$$;

-- The owner blocks a time (a day off, a walk-in, a DM booking without details). It never cancels
-- anyone: the bookings already in that time are named so she can move or cancel them herself.
create function public.block_time(p_business uuid, p_start timestamptz, p_end timestamptz, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.booking_blocks%rowtype;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner blocks times' using errcode = 'insufficient_privilege';
  end if;
  if p_end <= p_start or p_end - p_start > interval '31 days' then
    return jsonb_build_object('kind', 'bad_time');
  end if;
  perform 1 from public.booking_settings where business_id = p_business for update;
  insert into public.booking_blocks (business_id, starts_at, ends_at, note)
  values (p_business, p_start, p_end, nullif(left(trim(coalesce(p_note, '')), 60), ''))
  returning * into k;
  return jsonb_build_object('kind', 'blocked', 'id', k.id, 'clashes', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'first_name', b.first_name, 'service', b.service_name, 'starts_at', b.starts_at) order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.status = 'booked' and b.starts_at < p_end and b.ends_at > p_start), '[]'::jsonb));
end;
$$;

create function public.remove_block(p_business uuid, p_block uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner removes blocked times' using errcode = 'insufficient_privilege';
  end if;
  delete from public.booking_blocks where id = p_block and business_id = p_business;
  return found;
end;
$$;

-- Services are saved whole: keep each one's length (the page editor sends it back).
create or replace function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, minutes, image_path, focal_x, focal_y, position)
  select p_business, nullif(trim(s ->> 'group_name'), ''), trim(s ->> 'name'), nullif(trim(s ->> 'description'), ''),
         (s ->> 'price_kobo')::int, coalesce(s ->> 'price_kind', 'fixed'), nullif(trim(s ->> 'duration'), ''),
         nullif(s ->> 'minutes', '')::int,
         nullif(s ->> 'image_path', ''),
         -- Out-of-range taps are pulled back inside the photo, never refused.
         round(least(greatest(coalesce((s ->> 'focal_x')::numeric, 0.5), 0), 1), 3),
         round(least(greatest(coalesce((s ->> 'focal_y')::numeric, 0.3), 0), 1), 3),
         (o - 1)::int
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ------------------------------------------------------------ grants

revoke all on function private.open_minutes(jsonb, date), private.time_full(uuid, timestamptz, int, uuid, int),
  private.booking_problem(uuid, timestamptz, int, uuid, boolean), private.booking_code(),
  private.booking_service(uuid, uuid), private.insert_booking(uuid, public.business_services, timestamptz, text, text, uuid, uuid, text, boolean, text),
  private.booking_lead(uuid, text, text) from public, anon, authenticated;

revoke all on function public.booking_busy(uuid, timestamptz, int), public.book_time(uuid, uuid, timestamptz, text, text, boolean, text),
  public.booking_pass(text), public.get_bookings(uuid, timestamptz, timestamptz), public.get_booking_setup(uuid),
  public.save_booking_settings(uuid, boolean, int, int, int, jsonb), public.add_booking(uuid, uuid, timestamptz, text, text, boolean, uuid),
  public.move_booking(uuid, uuid, timestamptz, boolean), public.cancel_booking(uuid, uuid), public.mark_booking(uuid, uuid, text),
  public.block_time(uuid, timestamptz, timestamptz, text), public.remove_block(uuid, uuid) from public, anon;

-- Anyone may see free times; booking and the pass go through the server (rate limits).
grant execute on function public.booking_busy(uuid, timestamptz, int) to anon, authenticated;
grant execute on function public.book_time(uuid, uuid, timestamptz, text, text, boolean, text), public.booking_pass(text) to service_role;
grant execute on function public.get_bookings(uuid, timestamptz, timestamptz), public.get_booking_setup(uuid),
  public.save_booking_settings(uuid, boolean, int, int, int, jsonb), public.add_booking(uuid, uuid, timestamptz, text, text, boolean, uuid),
  public.move_booking(uuid, uuid, timestamptz, boolean), public.cancel_booking(uuid, uuid), public.mark_booking(uuid, uuid, text),
  public.block_time(uuid, timestamptz, timestamptz, text), public.remove_block(uuid, uuid) to authenticated;
