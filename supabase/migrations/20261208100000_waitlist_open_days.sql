-- The waitlist, a fix (docs/DB_MOVE.md step 3): joining refused days the business is closed. A
-- waitlist is for a full day the business works; a closed day never opens up. Same arguments and
-- answers as before ('closed' for a closed day, as for a past one).

create or replace function public.join_waitlist(
  p_business uuid, p_service uuid, p_day date, p_first_name text, p_phone text, p_visitor text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  svc public.business_services%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
  today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if v_name = '' then
    return jsonb_build_object('kind', 'bad_name');
  end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  if not exists (select 1 from public.businesses where id = p_business and not suspended) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    return jsonb_build_object('kind', 'off');
  end if;
  if p_day is null or p_day < today or p_day > today + s.ahead_days then
    return jsonb_build_object('kind', 'closed');
  end if;
  -- A waitlist is for a full day the business works, never a day it's closed.
  if private.open_minutes((select hours from public.businesses where id = p_business), p_day) is null then
    return jsonb_build_object('kind', 'closed');
  end if;
  select * into svc from public.business_services where id = p_service and business_id = p_business;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  -- Tidy: entries 30 days past their day go.
  delete from public.booking_waitlist where business_id = p_business and day < today - 30;
  if exists (select 1 from public.booking_waitlist where business_id = p_business and day = p_day and phone = p_phone) then
    return jsonb_build_object('kind', 'joined');
  end if;
  if (select count(*) from public.booking_waitlist where business_id = p_business and day >= today) >= 500 then
    return jsonb_build_object('kind', 'slow_down');
  end if;
  insert into public.booking_waitlist (business_id, day, service_id, service_name, first_name, phone, visitor_id)
  values (p_business, p_day, svc.id, svc.name, v_name, p_phone, p_visitor)
  on conflict (business_id, day, phone) do nothing;
  return jsonb_build_object('kind', 'joined');
end;
$$;
