-- Per hour and per item (decided 26 Nov 2026): a service can be priced for one hour or one item
-- ("₦15,000 per hour", "₦5,000 per photo"), and the customer chooses how many on the booking sheet,
-- between the owner's least and most. Postgres prices it (price_choice(), so book_time_v2(),
-- book_for_claim_v2(), price_booking() and deposits all follow): the total is the price for one
-- (or the chosen option's, so "With makeup" can cost more per hour) times how many. Per hour, the
-- booking takes that many hours; per item, each item's own time when the owner gives one. The
-- booking keeps the count ("3 hours", "3 photos") in its detail and choice, so Today, Money and
-- receipts show it. Not with per-person services or event days. Only adds; old services are unchanged.

alter table public.business_services
  add column unit text check (unit in ('hour', 'item')),
  add column unit_label text check (unit_label is null or length(unit_label) between 1 and 20),
  add column unit_min int check (unit_min between 1 and 50),
  add column unit_max int check (unit_max between 1 and 50),
  add column unit_minutes int check (unit_minutes between 5 and 600),
  add constraint business_services_per_unit_check check (
    unit is null
    or (unit_min is not null and unit_max is not null and unit_min <= unit_max
        and not per_person and not event_day
        and (unit <> 'hour' or unit_max <= 10)
        and (unit <> 'item' or unit_label is not null)));

-- "photo" → "photos", "dress" → "dresses"; one stays one.
create function private.unit_word(p_label text, p_n int) returns text
language sql immutable set search_path = '' as $$
  select case when p_n = 1 then lower(p_label)
              when lower(p_label) ~ '(s|x|z|ch|sh)$' then lower(p_label) || 'es'
              else lower(p_label) || 's' end;
$$;

create or replace function private.price_choice(p_service public.business_services, p_choice jsonb, p_travel_kobo int, p_home boolean)
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
  qty int;
  unit_kobo bigint;
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

  -- Per hour or per item: the price above is for one, times how many they chose (within the
  -- owner's least and most). Per hour, the time is that many hours; per item, each item's own time
  -- when the owner gave one, else the service's time.
  if p_service.unit is not null then
    qty := least(greatest(coalesce((p_choice ->> 'qty')::int, p_service.unit_min), p_service.unit_min), p_service.unit_max);
    unit_kobo := total;
    total := unit_kobo * qty;
    if p_service.unit = 'hour' then
      mins := 60 * qty;
      detail := detail || (qty || case when qty = 1 then ' hour' else ' hours' end);
    else
      if p_service.unit_minutes is not null then
        mins := p_service.unit_minutes * qty;
      end if;
      detail := detail || (qty || ' ' || private.unit_word(p_service.unit_label, qty));
    end if;
    mins := least(mins, 600);
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
    'qty', qty,
    'unit_kobo', unit_kobo,
    'extras', to_jsonb(ex),
    'home', p_home);
end;
$$;

-- save_services() keeps per hour and per item (the rest as before).
create or replace function public.save_services(p_business uuid, p_services jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  delete from public.business_services where business_id = p_business;
  insert into public.business_services (business_id, group_name, name, description, price_kobo, price_kind, duration, minutes,
                                        deposit_mode, deposit_kobo, image_path, focal_x, focal_y, position,
                                        options, extras, event_day, per_person, questions, gap_minutes,
                                        unit, unit_label, unit_min, unit_max, unit_minutes)
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
         nullif(s ->> 'gap_minutes', '')::int,
         nullif(s ->> 'unit', ''),
         case when s ->> 'unit' = 'item' then nullif(left(trim(s ->> 'unit_label'), 20), '') end,
         case when nullif(s ->> 'unit', '') is not null then coalesce(nullif(s ->> 'unit_min', '')::int, 1) end,
         case when nullif(s ->> 'unit', '') is not null then coalesce(nullif(s ->> 'unit_max', '')::int, case when s ->> 'unit' = 'hour' then 8 else 20 end) end,
         case when s ->> 'unit' = 'item' then nullif(s ->> 'unit_minutes', '')::int end
  from jsonb_array_elements(coalesce(p_services, '[]')) with ordinality as x(s, o)
  order by o;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The booking sheet's price before Pay also says how many and the price for one ("3 hours × ₦15,000").
create or replace function public.price_booking(p_business uuid, p_service uuid, p_choice jsonb, p_mode text) returns jsonb
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
    'qty', price -> 'qty', 'unit_kobo', price -> 'unit_kobo',
    'deposit_kobo', private.deposit_on(p_business, svc, (price ->> 'total_kobo')::bigint, coalesce(p_mode, '')),
    'deposit_counts', svc.event_day or coalesce((select deposit_counts from public.booking_settings where business_id = p_business), true),
    'gap_minutes', case when svc.event_day then 0 else coalesce(private.gap_after(p_business, svc, v_home), 0) end);
end;
$$;
