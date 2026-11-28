-- Exact prices (28 Nov 2026). A customer who pays a deposit online must know the full price before
-- paying, so "From ₦X" is gone: every price is exact. A price that varies is set as options (Short /
-- Medium / Long), per hour, per item or per person; "Ask for price" stays only for businesses that
-- don't take bookings online (the app hides it once bookings are on, and /api/book-v2 refuses an
-- unpriced service).
--
-- 1. Every "from" price becomes fixed at the same amount (services and the bookings that copied it),
--    and the table only allows fixed or ask from now on. save_services() turns an old client's
--    "from" into fixed, so code deployed before this keeps saving.
-- 2. add_booking() takes the owner's choice (which option, how many, how many people), priced by
--    private.price_choice() like a customer booking: the right price, length and detail
--    ("Photo shoot · 4 photos" at ₦16,000, not ₦4,000).

update public.business_services set price_kind = 'fixed' where price_kind = 'from';
update public.bookings set price_kind = 'fixed' where price_kind = 'from';

alter table public.business_services drop constraint if exists business_services_price_kind_check;
alter table public.business_services add constraint business_services_price_kind_check check (price_kind in ('fixed', 'ask'));

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
         (s ->> 'price_kobo')::int, case when s ->> 'price_kind' = 'ask' then 'ask' else 'fixed' end, nullif(trim(s ->> 'duration'), ''),
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

drop function public.add_booking(uuid, uuid, timestamptz, text, text, boolean, uuid);

-- p_choice: {"option": 1, "qty": 4, "people": [1, 2]}, as the booking sheet sends. Without one, a
-- service with options or a unit gets its first option and least number, as before.
create function public.add_booking(
  p_business uuid, p_service uuid, p_start timestamptz, p_first_name text, p_phone text, p_force boolean,
  p_claim uuid default null, p_choice jsonb default null
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
  price jsonb;
  v_choice boolean;
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
  -- Options, per hour, per item or per person: the server prices the choice (never the browser).
  v_choice := svc.price_kind <> 'ask' and (svc.options is not null or svc.unit is not null);
  if v_choice then
    price := private.price_choice(svc, case when jsonb_typeof(p_choice) = 'object' then p_choice - 'extras' - 'home' else '{}'::jsonb end, 0, false);
    svc.minutes := (price ->> 'minutes')::int;
    svc.price_kobo := (price ->> 'total_kobo')::int;
  end if;
  problem := private.booking_problem(p_business, p_start, svc.minutes, null, coalesce(p_force, false));
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  if v_phone is not null then
    v_lead := private.booking_lead(p_business, v_phone, v_name);
  end if;
  bk := private.insert_booking(p_business, svc, p_start, v_name, v_phone, v_lead, v_claim,
                               case when v_claim is null then 'owner' else 'tikka' end, false, null);
  if v_choice then
    update public.bookings
    set detail = nullif(left(price ->> 'detail', 200), ''), choice = jsonb_strip_nulls(price - 'total_kobo' - 'minutes' - 'detail'), price_kind = 'fixed'
    where id = bk.id;
  end if;
  return jsonb_build_object('kind', 'booked', 'token', bk.view_token, 'code', bk.code, 'id', bk.id, 'total_kobo', svc.price_kobo);
end;
$$;

revoke all on function public.add_booking(uuid, uuid, timestamptz, text, text, boolean, uuid, jsonb) from public, anon;
grant execute on function public.add_booking(uuid, uuid, timestamptz, text, text, boolean, uuid, jsonb) to authenticated;
