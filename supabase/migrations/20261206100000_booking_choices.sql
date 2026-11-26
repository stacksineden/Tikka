-- The new direction, step 2 (docs/DB_MOVE.md): booking with choices. Until now the new booking
-- sheet (components/business/BookingFlow.tsx) booked into the demo store only (bookTimeV2 in
-- lib/bookings-data.ts, prices from lib/booking-price.ts). This moves it into Postgres:
--
-- - book_time_v2(): the customer picks a choice ("Long"), people (per-person services), extras and
--   a home visit; Postgres prices it from the service (the browser never sends an amount), works out
--   the deposit on that total and holds the time for the deposit exactly as book_time() does, so
--   booking_checkout(), rehold_booking() and complete_booking_deposit() work unchanged.
-- - Each booking keeps the time it keeps the business busy (busy_from, busy_to): its own time plus
--   the gap after it (clean-up, or travel after a home visit), or the whole date for an event day
--   (weddings, shoots). Free times count those, so gap time and event days hold whichever way a
--   booking was made (the page, the owner, a Tikka).
-- - change_from_pass(): the customer moves (24 hours' notice, the deposit stays with the booking) or
--   cancels (no refund, REVENUE_PLAN 5.2) from their pass.
--
-- Additive for the bookings already made: their new columns stay empty, and an empty busy window
-- means "their own time", exactly as before. book_time() (both versions), add_booking(),
-- move_booking() and book_for_claim() keep their arguments; bookings they make now carry their gap.

/* ------------------------------------------------------------ columns */

alter table public.bookings
  -- What was picked, for the owner and the pass: "Long, add wash · Will you bring your own hair? Yes".
  add column detail text check (char_length(detail) <= 200),
  -- A home visit: the address the owner goes to (owner only, like the phone number).
  add column home_area text check (char_length(home_area) <= 120),
  -- The picks themselves ({option, people, extras, home}) and the answers to the service's questions.
  add column choice jsonb check (choice is null or jsonb_typeof(choice) = 'object'),
  add column answers text check (char_length(answers) <= 300),
  add column event_day boolean not null default false,
  -- Minutes kept free after it when it was booked, and the time it keeps the business busy.
  add column gap_minutes int check (gap_minutes between 0 and 180),
  add column busy_from timestamptz,
  add column busy_to timestamptz,
  add constraint bookings_busy_check check (busy_from is null or (busy_to > busy_from and busy_from <= starts_at and busy_to >= ends_at));

-- Choices with people can run longer than 10 hours (a bride and bridesmaids); a day at most.
alter table public.bookings drop constraint if exists bookings_minutes_check;
alter table public.bookings add constraint bookings_minutes_check check (minutes between 15 and 1440);

create index bookings_busy_idx on public.bookings (business_id, (coalesce(busy_from, starts_at)), (coalesce(busy_to, ends_at)));

/* ------------------------------------------------------------ pricing */

-- What a booking costs, in kobo, from the service and the picks (the same sums as
-- lib/booking-price.ts priceBooking). Returns {total_kobo, minutes, detail, option, people, extras}:
-- the picks as used (out-of-range ones dropped), so the booking keeps exactly what was charged.
create function private.price_choice(p_service public.business_services, p_choice jsonb, p_travel_kobo int, p_home boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  opts jsonb := coalesce(p_service.options, '[]'::jsonb);
  n_opts int := jsonb_array_length(coalesce(p_service.options, '[]'::jsonb));
  total bigint := 0;
  mins int := coalesce(p_service.minutes, 60);
  detail text[] := '{}';
  pick int;
  people int[] := '{}';
  n int;
  i int;
  x jsonb;
  ex int[] := '{}';
  e int;
begin
  if p_service.per_person and n_opts >= 2 then
    mins := 0;
    for i in 0 .. n_opts - 1 loop
      if i = 0 then
        n := 1;
      else
        n := least(greatest(coalesce((p_choice -> 'people' ->> i)::int, 0), 0), 15);
      end if;
      people := people || n;
      total := total + (opts -> i ->> 'price_kobo')::bigint * n;
      mins := mins + (opts -> i ->> 'minutes')::int * n;
      if i > 0 and n > 0 then
        detail := detail || (n || ' ' || regexp_replace(lower(opts -> i ->> 'label'), '^each ', '') || case when n > 1 then 's' else '' end);
      end if;
    end loop;
  elsif n_opts > 0 then
    pick := least(greatest(coalesce((p_choice ->> 'option')::int, 0), 0), n_opts - 1);
    total := (opts -> pick ->> 'price_kobo')::bigint;
    mins := (opts -> pick ->> 'minutes')::int;
    if n_opts > 1 then
      detail := detail || (opts -> pick ->> 'label');
    end if;
  else
    total := coalesce(p_service.price_kobo, 0);
  end if;

  -- Extras: each one once, by index, only those the service has.
  if jsonb_typeof(p_choice -> 'extras') = 'array' then
    for x in select * from jsonb_array_elements(p_choice -> 'extras') loop
      if jsonb_typeof(x) = 'number' and (x #>> '{}')::numeric = trunc((x #>> '{}')::numeric) and abs((x #>> '{}')::numeric) < 100 then
        e := (x #>> '{}')::int;
        if e >= 0 and e < jsonb_array_length(coalesce(p_service.extras, '[]'::jsonb)) and not (e = any(ex)) then
          ex := ex || e;
          total := total + (p_service.extras -> e ->> 'price_kobo')::bigint;
          detail := detail || lower(p_service.extras -> e ->> 'name');
        end if;
      end if;
    end loop;
  end if;

  if p_home and coalesce(p_travel_kobo, 0) > 0 then
    total := total + p_travel_kobo;
  end if;

  return jsonb_build_object(
    'total_kobo', least(total, 2000000000),
    'minutes', least(greatest(mins, 15), 1440),
    'detail', nullif(array_to_string(detail, ', '), ''),
    'option', pick,
    'people', case when cardinality(people) > 0 then to_jsonb(people) end,
    'extras', to_jsonb(ex),
    'home', p_home);
end;
$$;

-- The deposit on a booking's total, in kobo (0: none), with the rules book_time() uses
-- (private.deposit_for): payments ready with an account of the site's Paystack mode, the
-- service's own rule first, at least ₦1,000, never above the total or the business's maximum.
-- Like lib/presets.ts depositOn, a percentage rounds up to ₦500; event days take 50%.
create function private.deposit_on(p_business uuid, p_service public.business_services, p_total bigint, p_mode text)
returns int language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  d bigint := 0;
  max_k int;
begin
  if private.payments_problem(p_business) is not null
     or not exists (select 1 from public.business_payouts where business_id = p_business and paystack_mode = p_mode) then
    return 0;
  end if;
  select * into s from public.booking_settings where business_id = p_business;
  if s.business_id is null then
    return 0;
  end if;
  if p_service.deposit_mode = 'none' then
    return 0;
  elsif p_service.deposit_mode = 'fixed' then
    d := coalesce(p_service.deposit_kobo, 0);
  elsif p_service.deposit_mode = 'full' then
    d := p_total;
  elsif p_service.event_day and p_total > 0 then
    d := ceil(p_total * 50 / 100.0 / 50000) * 50000;
  elsif s.deposit_mode = 'percent' then
    d := case when p_total > 0 then ceil(p_total * s.deposit_percent / 100.0 / 50000) * 50000 else coalesce(s.deposit_fixed_kobo, 0) end;
  elsif s.deposit_mode = 'fixed' then
    d := coalesce(s.deposit_fixed_kobo, 0);
  end if;
  if d <= 0 or (p_total > 0 and p_total < 100000) then
    return 0;
  end if;
  d := greatest(d, 100000);
  if p_total > 0 then
    d := least(d, p_total);
  end if;
  select max_kobo into max_k from public.business_payments where business_id = p_business;
  return least(d, coalesce(max_k, d))::int;
end;
$$;

/* ------------------------------------------------------------ busy windows */

-- The minutes kept free after a booking (lib/bookings.ts gapAfter): the service's own, else the
-- business's, plus the extra after a home visit; 180 at most.
create function private.gap_after(p_business uuid, p_service public.business_services, p_home boolean) returns int
language sql stable security definer set search_path = '' as $$
  select least(greatest(coalesce(p_service.gap_minutes, b.gap_minutes, 0) + case when p_home then coalesce(b.home_gap_minutes, 0) else 0 end, 0), 180)
  from public.businesses b where b.id = p_business;
$$;

-- Is [p_from, p_to) full? Full when anything blocked overlaps it, when an event day overlaps it, or
-- when at some moment inside it the business already has `capacity` bookings. Each booking counts
-- for its busy window (its time plus its gap, or its whole date). The busiest moment is always the
-- start of the window or the start of a booking inside it, so only those are counted. An event day
-- (p_whole) needs the window free of every booking.
create function private.window_full(p_business uuid, p_from timestamptz, p_to timestamptz, p_ignore uuid, p_capacity int, p_whole boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  with live as (
    select coalesce(b.busy_from, b.starts_at) as f, coalesce(b.busy_to, b.ends_at) as t, b.event_day
    from public.bookings b
    where b.business_id = p_business and private.booking_counts(b.status, b.hold_expires_at) and b.id is distinct from p_ignore
      and coalesce(b.busy_from, b.starts_at) < p_to and coalesce(b.busy_to, b.ends_at) > p_from
  )
  select exists (select 1 from public.booking_blocks k where k.business_id = p_business and k.starts_at < p_to and k.ends_at > p_from)
    or exists (select 1 from live where event_day)
    or (p_whole and exists (select 1 from live))
    or coalesce((
      select max((select count(*) from live l where l.f <= pt.t and l.t > pt.t))
      from (select p_from as t union select f from live where f > p_from) pt), 0) >= p_capacity;
$$;

-- The older check (book_time, add_booking, move_booking, book_for_claim) now counts busy windows
-- too, so their bookings respect the gaps and event days of the new ones.
create or replace function private.time_full(p_business uuid, p_start timestamptz, p_minutes int, p_ignore uuid, p_capacity int) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.window_full(p_business, p_start, p_start + make_interval(mins => p_minutes), p_ignore, p_capacity, false);
$$;

-- New bookings from the older functions keep the business's gap after them (never a home visit).
create or replace function private.insert_booking(
  p_business uuid, p_service public.business_services, p_start timestamptz, p_first_name text, p_phone text,
  p_lead uuid, p_claim uuid, p_source text, p_future boolean, p_visitor text
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
  v_code text;
  v_gap int := coalesce(private.gap_after(p_business, p_service, false), 0);
  v_end timestamptz := p_start + make_interval(mins => p_service.minutes);
begin
  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               claim_id, source, future_offers, code, view_token, visitor_id, created_by,
                               gap_minutes, busy_from, busy_to)
  values (p_business, p_service.id, p_service.name, p_service.minutes, p_start, v_end,
          p_first_name, p_phone, p_lead, p_claim, p_source, coalesce(p_future, false), v_code,
          encode(extensions.gen_random_bytes(12), 'hex'), p_visitor, auth.uid(),
          nullif(v_gap, 0), case when v_gap > 0 then p_start end, case when v_gap > 0 then v_end + make_interval(mins => v_gap) end)
  returning * into bk;
  return bk;
end;
$$;

-- A moved booking keeps its gap (or, for an event day, its whole date): the busy window moves with it.
create function private.keep_busy_window() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.busy_from is not null and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at) then
    if new.event_day then
      new.busy_from := ((new.starts_at at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
      new.busy_to := new.busy_from + interval '1 day';
      new.ends_at := least(new.ends_at, new.busy_to);
    else
      new.busy_from := new.starts_at;
      new.busy_to := new.ends_at + make_interval(mins => coalesce(new.gap_minutes, 0));
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_keep_busy_window before update of starts_at, ends_at on public.bookings
  for each row execute function private.keep_busy_window();

-- Free times for the booking sheets: busy windows instead of bare times (each booking's gap and
-- event days included), so the sheet only adds the new booking's own gap.
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
      select jsonb_agg(jsonb_build_array(coalesce(x.busy_from, x.starts_at), coalesce(x.busy_to, x.ends_at)) order by x.starts_at)
      from public.bookings x
      where x.business_id = p_business and private.booking_counts(x.status, x.hold_expires_at) and not x.event_day
        and coalesce(x.busy_from, x.starts_at) < p_to and coalesce(x.busy_to, x.ends_at) > p_from), '[]'::jsonb),
    -- Event days take the whole date whatever the capacity: shown as blocked.
    'blocked', coalesce((
      select jsonb_agg(w order by w ->> 0) from (
        select jsonb_build_array(k.starts_at, k.ends_at) w from public.booking_blocks k
        where k.business_id = p_business and k.starts_at < p_to and k.ends_at > p_from
        union all
        select jsonb_build_array(x.busy_from, x.busy_to) from public.bookings x
        where x.business_id = p_business and x.event_day and private.booking_counts(x.status, x.hold_expires_at)
          and x.busy_from < p_to and x.busy_to > p_from) q), '[]'::jsonb));
end;
$$;

/* ------------------------------------------------------------ booking with choices */

-- Why a time can't be booked with choices (null: it can). Ordinary bookings: open hours, notice,
-- reach, half-hour starts, and the busy window [start, start + minutes + gap). Event days: a call
-- time between 04:00 and 12:00 WAT on any day within reach, and the whole date free.
create function private.choice_problem(
  p_business uuid, p_start timestamptz, p_minutes int, p_gap int, p_event_day boolean, p_ignore uuid
) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  local timestamp := p_start at time zone 'Africa/Lagos';
  start_min int := extract(hour from local)::int * 60 + extract(minute from local)::int;
  day_from timestamptz := (local::date)::timestamp at time zone 'Africa/Lagos';
  hrs int[];
begin
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    return 'off';
  end if;
  if p_start < now() + make_interval(mins => s.notice_minutes) then
    return 'too_soon';
  end if;
  if p_start > now() + make_interval(days => s.ahead_days) then
    return 'too_far';
  end if;
  if extract(second from local) <> 0 or start_min % 30 <> 0 then
    return 'closed';
  end if;
  if p_event_day then
    if start_min < 4 * 60 or start_min > 12 * 60 then
      return 'closed';
    end if;
    if private.window_full(p_business, day_from, day_from + interval '1 day', p_ignore, s.capacity, true) then
      return 'taken';
    end if;
    return null;
  end if;
  hrs := private.open_minutes((select hours from public.businesses where id = p_business), local::date);
  if hrs is null or start_min < hrs[1] or start_min + p_minutes > hrs[2] then
    return 'closed';
  end if;
  if private.window_full(p_business, p_start, p_start + make_interval(mins => p_minutes + coalesce(p_gap, 0)), p_ignore, s.capacity, false) then
    return 'taken';
  end if;
  return null;
end;
$$;

-- The customer books from the business page with choices. Name and number as book_time(); a home
-- visit needs an address and a business that goes to customers; the service's questions need
-- answers. With a deposit: held for 10 minutes and the answer says to pay (as book_time()).
create function public.book_time_v2(
  p_business uuid, p_service uuid, p_start timestamptz, p_first_name text, p_phone text,
  p_choice jsonb, p_address text, p_area text, p_answers text,
  p_future boolean, p_visitor text, p_mode text, p_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  biz public.businesses%rowtype;
  svc public.business_services%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
  v_home boolean;
  v_area text;
  v_answers text := nullif(left(trim(coalesce(p_answers, '')), 300), '');
  price jsonb;
  v_minutes int;
  v_gap int;
  v_end timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  problem text;
  dep int;
  bk public.bookings%rowtype;
  o public.business_payouts%rowtype;
  v_code text;
  v_detail text;
begin
  if v_name = '' then
    return jsonb_build_object('kind', 'bad_name');
  end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  select * into biz from public.businesses where id = p_business;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if biz.suspended then
    return jsonb_build_object('kind', 'off');
  end if;
  -- One booking at a time per business, so the last place can't go twice.
  perform 1 from public.booking_settings where business_id = p_business for update;
  select * into svc from public.business_services where id = p_service and business_id = p_business;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_home := biz.work_place = 'home' or (biz.work_place = 'both' and coalesce((p_choice ->> 'home')::boolean, false));
  v_area := nullif(left(concat_ws(', ', nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_area, '')), '')), 120), '');
  if v_home and v_area is null then
    return jsonb_build_object('kind', 'bad_address');
  end if;
  if svc.questions is not null and v_answers is null then
    return jsonb_build_object('kind', 'bad_answers');
  end if;

  price := private.price_choice(svc, coalesce(p_choice, '{}'::jsonb), case when v_home then biz.travel_fee_kobo else 0 end, v_home);
  v_minutes := (price ->> 'minutes')::int;
  v_gap := case when svc.event_day then 0 else coalesce(private.gap_after(p_business, svc, v_home), 0) end;

  problem := private.choice_problem(p_business, p_start, v_minutes, v_gap, svc.event_day, null);
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if (select count(*) from public.bookings
      where business_id = p_business and phone = p_phone and status = 'booked' and starts_at > now()) >= 3 then
    return jsonb_build_object('kind', 'too_many');
  end if;
  dep := private.deposit_on(p_business, svc, (price ->> 'total_kobo')::bigint, coalesce(p_mode, ''));
  if dep > 0 and coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    return jsonb_build_object('kind', 'bad_email');
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
  v_detail := nullif(left(concat_ws(' · ', price ->> 'detail', v_answers), 200), '');

  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               source, future_offers, code, view_token, visitor_id, created_by,
                               price_kobo, price_kind, detail, home_area, choice, answers, event_day, gap_minutes, busy_from, busy_to)
  values (p_business, svc.id, svc.name, greatest(15, (extract(epoch from (v_end - p_start)) / 60)::int), p_start, v_end, v_name, p_phone,
          private.booking_lead(p_business, p_phone, v_name), 'page', coalesce(p_future, false), v_code,
          encode(extensions.gen_random_bytes(12), 'hex'), p_visitor, auth.uid(),
          (price ->> 'total_kobo')::int, 'fixed', v_detail, case when v_home then v_area end,
          jsonb_strip_nulls(price - 'total_kobo' - 'minutes' - 'detail'), v_answers, svc.event_day, nullif(v_gap, 0), v_from, v_to)
  returning * into bk;

  if dep = 0 then
    return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id, 'total_kobo', bk.price_kobo);
  end if;
  select * into o from public.business_payouts where business_id = p_business;
  update public.bookings
  set status = 'held', hold_expires_at = now() + interval '10 minutes', terms_shown_at = now(), deposit_kobo = dep,
      -- Event days always count the deposit towards the bill (lib/booking-price.ts).
      deposit_counts = svc.event_day or coalesce((select deposit_counts from public.booking_settings where business_id = p_business), true),
      deposit_email = left(trim(p_email), 120), deposit_subaccount = o.subaccount_code, deposit_mode = o.paystack_mode
  where id = bk.id;
  return jsonb_build_object('kind', 'pay', 'token', bk.view_token, 'id', bk.id, 'deposit_kobo', dep, 'total_kobo', bk.price_kobo);
end;
$$;

-- What the booking sheet shows before Pay: the same sums the server will charge (public: amounts
-- only, never anyone's booking). Null when the service isn't on the page.
create function public.price_booking(p_business uuid, p_service uuid, p_choice jsonb, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  biz public.businesses%rowtype;
  svc public.business_services%rowtype;
  v_home boolean;
  price jsonb;
begin
  select * into biz from public.businesses where id = p_business and not suspended;
  select * into svc from public.business_services where id = p_service and business_id = p_business;
  if biz.id is null or svc.id is null then
    return null;
  end if;
  v_home := biz.work_place = 'home' or (biz.work_place = 'both' and coalesce((p_choice ->> 'home')::boolean, false));
  price := private.price_choice(svc, coalesce(p_choice, '{}'::jsonb), case when v_home then biz.travel_fee_kobo else 0 end, v_home);
  return jsonb_build_object(
    'total_kobo', price -> 'total_kobo', 'minutes', price -> 'minutes', 'detail', price -> 'detail', 'home', v_home,
    'deposit_kobo', private.deposit_on(p_business, svc, (price ->> 'total_kobo')::bigint, coalesce(p_mode, '')),
    'deposit_counts', svc.event_day or coalesce((select deposit_counts from public.booking_settings where business_id = p_business), true),
    'gap_minutes', case when svc.event_day then 0 else coalesce(private.gap_after(p_business, svc, v_home), 0) end);
end;
$$;

/* ------------------------------------------------------------ move or cancel from the pass */

-- The customer moves their booking (24 hours' notice before the time they booked; the deposit stays
-- with it) or cancels it (no refund). Booked bookings only; a held one that was never paid lapses.
create function public.change_from_pass(p_token text, p_kind text, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  problem text;
  v_end timestamptz;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into b from public.bookings where view_token = p_token for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if b.status <> 'booked' then
    return jsonb_build_object('kind', 'not_booked');
  end if;
  if p_kind = 'cancel' then
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
    return jsonb_build_object('kind', 'cancelled', 'deposit_paid_kobo', b.deposit_paid_kobo);
  end if;
  if p_kind <> 'move' or p_start is null then
    return jsonb_build_object('kind', 'bad_request');
  end if;
  if b.starts_at - now() < interval '24 hours' then
    return jsonb_build_object('kind', 'too_late');
  end if;
  perform 1 from public.booking_settings where business_id = b.business_id for update;
  problem := private.choice_problem(b.business_id, p_start, b.minutes, coalesce(b.gap_minutes, 0), b.event_day, b.id);
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  v_end := p_start + make_interval(mins => b.minutes);
  if b.event_day then
    v_from := ((p_start at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
    v_to := v_from + interval '1 day';
    v_end := least(v_end, v_to);
  else
    v_from := p_start;
    v_to := v_end + make_interval(mins => coalesce(b.gap_minutes, 0));
  end if;
  update public.bookings
  set starts_at = p_start, ends_at = v_end, busy_from = v_from, busy_to = v_to, moved_at = now()
  where id = b.id;
  return jsonb_build_object('kind', 'moved', 'starts_at', p_start);
end;
$$;

/* ------------------------------------------------------------ the pass and the owner's list */

-- The pass shows what was picked and whether it's a home visit (never the address: the pass link
-- travels; the owner sees the address in their list).
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
    'price_kobo', b.price_kobo, 'price_kind', b.price_kind, 'hold_live', b.status = 'held' and b.hold_expires_at > now(),
    'detail', b.detail, 'home', b.home_area is not null, 'event_day', b.event_day, 'gap_minutes', b.gap_minutes)
  from public.bookings b
  join public.businesses z on z.id = b.business_id
  left join public.claims c on c.id = b.claim_id
  where b.view_token = p_token;
$$;

-- The owner's list shows what was picked, the address for a home visit and the answers (owners
-- only, like the phone number; staff see the picks, never where someone lives).
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
        'detail', b.detail, 'home', b.home_area is not null, 'home_area', case when owner then b.home_area end,
        'event_day', b.event_day, 'gap_minutes', b.gap_minutes)
      order by b.starts_at)
    from public.bookings b
    where b.business_id = p_business and b.status <> 'held' and b.starts_at < p_to and b.ends_at > p_from), '[]'::jsonb);
end;
$$;

/* ------------------------------------------------------------ access */

revoke all on function private.price_choice(public.business_services, jsonb, int, boolean),
  private.deposit_on(uuid, public.business_services, bigint, text), private.gap_after(uuid, public.business_services, boolean),
  private.window_full(uuid, timestamptz, timestamptz, uuid, int, boolean),
  private.choice_problem(uuid, timestamptz, int, int, boolean, uuid), private.keep_busy_window() from public, anon, authenticated;

-- Booking and changing from the pass go through the server (rate limits, Paystack), as book_time().
revoke all on function public.book_time_v2(uuid, uuid, timestamptz, text, text, jsonb, text, text, text, boolean, text, text, text),
  public.change_from_pass(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.book_time_v2(uuid, uuid, timestamptz, text, text, jsonb, text, text, text, boolean, text, text, text),
  public.change_from_pass(text, text, timestamptz) to service_role;

revoke all on function public.price_booking(uuid, uuid, jsonb, text) from public;
grant execute on function public.price_booking(uuid, uuid, jsonb, text) to anon, authenticated, service_role;
