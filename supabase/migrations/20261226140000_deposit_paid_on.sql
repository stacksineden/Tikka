-- "When did they pay?" (28 Nov 2026). A deposit the owner took by hand (cash, transfer, card) keeps
-- the day it was really paid, often the day they booked, not the day the owner records it: Today's
-- "taken today", Money's week and the evening alert count deposits by deposit_paid_at, so recording
-- an old deposit no longer adds it to today.
--
-- record_booking_deposit() gets a fifth argument, p_paid_at (null: now). Within the last 180 days and
-- not in the future. The four-argument version stays for code deployed before this and means now.

create function public.record_booking_deposit(p_business uuid, p_booking uuid, p_kobo int, p_method text, p_paid_at timestamptz)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  v_at timestamptz := coalesce(p_paid_at, now());
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
  if v_at > now() + interval '10 minutes' or v_at < now() - interval '180 days' then
    return 'bad_date';
  end if;
  if p_method not in ('cash', 'transfer', 'card') then
    raise exception 'Paid by cash, transfer or card' using errcode = 'check_violation';
  end if;
  update public.bookings
  set deposit_paid_kobo = p_kobo, deposit_paid_at = least(v_at, now()), deposit_method = p_method, deposit_counts = true
  where id = p_booking;
  return 'saved';
end;
$$;
revoke all on function public.record_booking_deposit(uuid, uuid, int, text, timestamptz) from public, anon;
grant execute on function public.record_booking_deposit(uuid, uuid, int, text, timestamptz) to authenticated;

-- The old four-argument call: paid now, as before.
create or replace function public.record_booking_deposit(p_business uuid, p_booking uuid, p_kobo int, p_method text) returns text
language sql security definer set search_path = '' as $$
  select public.record_booking_deposit(p_business, p_booking, p_kobo, p_method, null::timestamptz);
$$;
