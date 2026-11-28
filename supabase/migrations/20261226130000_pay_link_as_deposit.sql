-- "Already paid with a pay link?" (28 Nov 2026). An owner sent a customer a plain pay link for the
-- deposit (from Money or the customer's page, not from the booking), so paying it made a sale of its
-- own and the booking still said "Add deposit". The owner can now pick that payment on the booking:
-- it becomes the booking's deposit (bookings.deposit_pay_link, deposit_method = 'pay_link'), and
-- get_ledger() already leaves such a link and its sale out, so the money is counted once, as the
-- booking's deposit.
--
-- Only a payment that is plainly a deposit for this customer: this business's, paid in live mode, by
-- the booking's number, not already a deposit, not made for another booking, and not one that settled
-- a balance (its sale holds only that payment and no booking). The booking: booked or arrived, no
-- deposit yet, not marked paid.

create function private.link_deposit_ok(p_booking public.bookings, p_link public.pay_links) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_link.business_id = p_booking.business_id
     and p_link.status = 'paid' and p_link.paystack_mode = 'live' and p_link.paid_kobo is not null
     and (p_link.booking_id is null or p_link.booking_id = p_booking.id)
     and not exists (select 1 from public.bookings k where k.deposit_pay_link = p_link.id)
     and p_booking.phone is not null
     and coalesce(p_link.phone, (select s.phone from public.sales s where s.id = p_link.sale_id),
                  (select d.phone from public.leads d where d.id = p_link.lead_id)) = p_booking.phone
     and (p_link.sale_id is null or (
           (select s.booking_id from public.sales s where s.id = p_link.sale_id) is null
       and (select count(*) from public.sale_payments x where x.sale_id = p_link.sale_id) <= 1));
$$;
revoke all on function private.link_deposit_ok(public.bookings, public.pay_links) from public, anon, authenticated;

-- The booking can take a deposit now (same rules as record_booking_deposit()).
create function private.booking_takes_deposit(p_booking public.bookings) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_booking.status in ('booked', 'arrived') and p_booking.deposit_paid_kobo is null
     and p_booking.deposit_reference is null and p_booking.deposit_pay_link is null
     and not exists (select 1 from public.sales s where s.booking_id = p_booking.id);
$$;
revoke all on function private.booking_takes_deposit(public.bookings) from public, anon, authenticated;

-- The payments the owner can pick for this booking, newest first.
create function public.deposit_link_options(p_business uuid, p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  perform private.owner_or_raise(p_business);
  select * into b from public.bookings where id = p_booking and business_id = p_business;
  if not found or not private.booking_takes_deposit(b) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'kobo', l.paid_kobo, 'note', l.note, 'paid_at', l.paid_at) order by l.paid_at desc)
    from public.pay_links l
    where l.business_id = p_business and l.status = 'paid' and private.link_deposit_ok(b, l)), '[]'::jsonb);
end;
$$;
revoke all on function public.deposit_link_options(uuid, uuid) from public, anon;
grant execute on function public.deposit_link_options(uuid, uuid) to authenticated;

-- 'saved', or why not: 'not_found', 'has_deposit' (or cancelled, or marked paid), 'not_allowed'.
create function public.use_link_as_deposit(p_business uuid, p_booking uuid, p_link uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  l public.pay_links%rowtype;
begin
  perform private.owner_or_raise(p_business);
  select * into b from public.bookings where id = p_booking and business_id = p_business for update;
  select * into l from public.pay_links where id = p_link and business_id = p_business for update;
  if b.id is null or l.id is null then
    return 'not_found';
  end if;
  if not private.booking_takes_deposit(b) then
    return 'has_deposit';
  end if;
  if not private.link_deposit_ok(b, l) then
    return 'not_allowed';
  end if;
  update public.bookings
  set deposit_paid_kobo = l.paid_kobo, deposit_paid_at = l.paid_at, deposit_method = 'pay_link',
      deposit_pay_link = l.id, deposit_counts = true
  where id = b.id;
  update public.pay_links set booking_id = b.id where id = l.id;
  return 'saved';
end;
$$;
revoke all on function public.use_link_as_deposit(uuid, uuid, uuid) from public, anon;
grant execute on function public.use_link_as_deposit(uuid, uuid, uuid) to authenticated;
