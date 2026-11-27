-- A pay link for a booking's deposit (27 Nov 2026). When the owner adds a booking (from WhatsApp, a
-- DM, a call) or opens one without a deposit, they can send the customer a pay link for the deposit
-- instead of waiting for a transfer. Paying it records the deposit on that booking, like a Tikka's
-- pay link (bookings.deposit_pay_link, deposit_method = 'pay_link'), so the money is counted once, as
-- the booking's deposit (get_ledger() already leaves such links out).
--
-- If the booking already has a deposit, is marked paid or is cancelled by the time the link is paid,
-- the money stays an ordinary pay link payment: the customer's money moved, so it is never lost.

alter table public.pay_links add column booking_id uuid references public.bookings (id) on delete set null;
create index pay_links_booking on public.pay_links (booking_id) where booking_id is not null;

-- 'created' with the token, or why not: 'not_found', 'cancelled', 'has_deposit', 'settled',
-- 'bad_phone', and create_pay_link()'s own answers (too_small, too_big, no_account, needs_id…).
create function public.create_deposit_link(p_business uuid, p_booking uuid, p_amount_kobo int, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  r jsonb;
  v_note text;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner makes pay links' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.bookings where id = p_booking and business_id = p_business;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if b.status not in ('booked', 'arrived') then
    return jsonb_build_object('kind', 'cancelled');
  end if;
  if b.deposit_paid_kobo is not null then
    return jsonb_build_object('kind', 'has_deposit');
  end if;
  if exists (select 1 from public.sales where booking_id = p_booking) then
    return jsonb_build_object('kind', 'settled');
  end if;
  if b.phone is null then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  v_note := left('Deposit for ' || b.service_name || ', ' || to_char(b.starts_at at time zone 'Africa/Lagos', 'FMDy FMDD Mon'), 80);
  r := public.create_pay_link(p_business, p_amount_kobo, v_note, b.first_name, b.claim_id, p_mode, null, b.phone);
  if r ->> 'kind' = 'created' then
    update public.pay_links set booking_id = p_booking where token = r ->> 'token';
    r := r || jsonb_build_object('note', v_note);
  end if;
  return r;
end;
$$;
revoke all on function public.create_deposit_link(uuid, uuid, int, text) from public, anon;
grant execute on function public.create_deposit_link(uuid, uuid, int, text) to authenticated;

-- Paid: it becomes the booking's deposit, if the booking still has none and isn't marked paid.
create function private.booking_deposit_from_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings k
  set deposit_paid_kobo = new.paid_kobo, deposit_paid_at = new.paid_at, deposit_method = 'pay_link',
      deposit_pay_link = new.id, deposit_counts = true
  where k.id = new.booking_id and k.business_id = new.business_id
    and k.status in ('booked', 'arrived') and k.deposit_paid_kobo is null
    and not exists (select 1 from public.sales s where s.booking_id = k.id);
  return null;
end;
$$;
revoke all on function private.booking_deposit_from_link() from public, anon, authenticated;
create trigger pay_link_paid_booking_deposit after update of status on public.pay_links
  for each row when (new.status = 'paid' and old.status is distinct from 'paid' and new.booking_id is not null)
  execute function private.booking_deposit_from_link();
