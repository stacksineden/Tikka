-- The new direction, step 1 (docs/DB_MOVE.md): the business and service fields the new setup,
-- the booking sheet and Booking settings use, until now kept only in the demo store.
--
-- Additive only. Every new column is empty (or false) for the businesses already on Tikka, and an
-- empty column means "behave as today": no trades picked, works in the shop, no travel fee, no
-- booking rules, no time between bookings; services without options, extras, questions or an
-- event day. Owners change them as they change the rest of their card and services (the column
-- grant below, save_services()); staff still can't (the existing policies).
--
-- Limits match the screens (app/app/start/actions.ts, components/settings/BookingSettingsV2.tsx,
-- lib/bookings.ts MAX_GAP), and rule 8 covers the words customers read (rules, questions,
-- option and extra names).

/* ------------------------------------------------------------ checks */

-- A service's choices: [{label, price_kobo, minutes}], up to 10.
create function private.valid_service_options(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select j is null or (
    jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 10
    and not exists (
      select 1 from jsonb_array_elements(j) o
      where jsonb_typeof(o) <> 'object'
         or jsonb_typeof(o -> 'label') <> 'string'
         or char_length(trim(o ->> 'label')) not between 1 and 30
         or not private.clean_words(o ->> 'label')
         or jsonb_typeof(o -> 'price_kobo') <> 'number'
         or (o ->> 'price_kobo')::numeric not between 0 and 1000000000
         or (o ->> 'price_kobo')::numeric <> trunc((o ->> 'price_kobo')::numeric)
         or jsonb_typeof(o -> 'minutes') <> 'number'
         or (o ->> 'minutes')::numeric not between 15 and 720
         or (o ->> 'minutes')::numeric <> trunc((o ->> 'minutes')::numeric)
    )
  );
$$;

-- A service's extras: [{name, price_kobo}], up to 10.
create function private.valid_service_extras(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select j is null or (
    jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 10
    and not exists (
      select 1 from jsonb_array_elements(j) x
      where jsonb_typeof(x) <> 'object'
         or jsonb_typeof(x -> 'name') <> 'string'
         or char_length(trim(x ->> 'name')) not between 1 and 40
         or not private.clean_words(x ->> 'name')
         or jsonb_typeof(x -> 'price_kobo') <> 'number'
         or (x ->> 'price_kobo')::numeric not between 0 and 1000000000
         or (x ->> 'price_kobo')::numeric <> trunc((x ->> 'price_kobo')::numeric)
    )
  );
$$;

-- Short lines the owner writes for customers (booking rules, questions): no empty ones, none
-- too long, rule 8.
create function private.valid_lines(a text[], max_n int, max_len int) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (
    cardinality(a) between 1 and max_n
    and not exists (select 1 from unnest(a) l where l is null or char_length(trim(l)) not between 1 and max_len or not private.clean_words(l))
  );
$$;

-- Trade ids ("hair", "makeup"…), up to 10.
create function private.valid_trades(a text[]) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (
    cardinality(a) between 1 and 10
    and not exists (select 1 from unnest(a) t where t is null or t !~ '^[a-z_]{2,20}$')
  );
$$;

/* ------------------------------------------------------------ businesses */

alter table public.businesses
  -- The trades picked at setup ("hair", "makeup"…, lib/presets.ts TRADES).
  add column trades text[] check (private.valid_trades(trades)),
  -- Where the owner works: customers come to the shop, the owner goes to them, or both.
  add column work_place text check (work_place in ('shop', 'home', 'both')),
  -- Home service: the travel fee and how far they go. Only with home or both.
  add column travel_fee_kobo int check (travel_fee_kobo between 0 and 1000000000),
  add column travel_reach text check (travel_reach in ('area', 'city', 'state')),
  -- The booking rules customers see before they pay (up to 10 lines).
  add column booking_rules text[] check (private.valid_lines(booking_rules, 10, 240)),
  -- Minutes kept free after every booking, and extra after a home visit (lib/bookings.ts MAX_GAP).
  add column gap_minutes int check (gap_minutes between 0 and 180),
  add column home_gap_minutes int check (home_gap_minutes between 0 and 180),
  add constraint businesses_travel_check check (
    coalesce(work_place, 'shop') <> 'shop' or (travel_fee_kobo is null and travel_reach is null));

grant update (trades, work_place, travel_fee_kobo, travel_reach, booking_rules, gap_minutes, home_gap_minutes)
  on public.businesses to authenticated;

/* ------------------------------------------------------------ services */

alter table public.business_services
  add column options jsonb check (private.valid_service_options(options)),
  add column extras jsonb check (private.valid_service_extras(extras)),
  -- Booked as a whole day with a call time (weddings, shoots).
  add column event_day boolean not null default false,
  -- The options are people ("Bride" once, plus "Each bridesmaid" × n); needs two options or more.
  add column per_person boolean not null default false,
  add column questions text[] check (private.valid_lines(questions, 3, 80)),
  -- This service's own time after it, instead of the business's.
  add column gap_minutes int check (gap_minutes between 0 and 180),
  add constraint business_services_per_person_check check (
    not per_person or (options is not null and jsonb_array_length(options) >= 2));

-- save_services() keeps the new fields. Same shape as before (it replaces the business's
-- services); fields the caller leaves out come back empty, as they were before this migration.
create or replace function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, minutes,
                                        deposit_mode, deposit_kobo, image_path, focal_x, focal_y, position,
                                        options, extras, event_day, per_person, questions, gap_minutes)
  select p_business, nullif(trim(s ->> 'group_name'), ''), trim(s ->> 'name'), nullif(trim(s ->> 'description'), ''),
         (s ->> 'price_kobo')::int, coalesce(s ->> 'price_kind', 'fixed'), nullif(trim(s ->> 'duration'), ''),
         nullif(s ->> 'minutes', '')::int,
         nullif(s ->> 'deposit_mode', ''), case when s ->> 'deposit_mode' = 'fixed' then nullif(s ->> 'deposit_kobo', '')::int end,
         nullif(s ->> 'image_path', ''),
         round(least(greatest(coalesce((s ->> 'focal_x')::numeric, 0.5), 0), 1), 3),
         round(least(greatest(coalesce((s ->> 'focal_y')::numeric, 0.3), 0), 1), 3),
         (o - 1)::int,
         case when jsonb_typeof(s -> 'options') = 'array' and jsonb_array_length(s -> 'options') > 0 then s -> 'options' end,
         case when jsonb_typeof(s -> 'extras') = 'array' and jsonb_array_length(s -> 'extras') > 0 then s -> 'extras' end,
         coalesce((s ->> 'event_day')::boolean, false),
         coalesce((s ->> 'per_person')::boolean, false),
         case when jsonb_typeof(s -> 'questions') = 'array' and jsonb_array_length(s -> 'questions') > 0
              then array(select trim(q) from jsonb_array_elements_text(s -> 'questions') q) end,
         nullif(s ->> 'gap_minutes', '')::int
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;
