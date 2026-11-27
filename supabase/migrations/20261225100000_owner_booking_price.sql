-- A booking the owner adds (or a Tikka booking) keeps the service's price, like a customer booking
-- (27 Nov 2026). Before this, add_booking() and book_for_claim() saved no price, so Today showed
-- "Collect ₦0" and tapping Paid saved a ₦0 sale: the owner couldn't record the balance.
--
-- 1. insert_booking() saves the service's price and price kind for every caller (book_time() already
--    set the same right after).
-- 2. Bookings without a price get their service's.
-- 3. A visit saved as a ₦0 sale with nothing paid because its booking had no price is taken back, so
--    the owner can tap Paid again with the right amount. Nothing was paid on these.

create or replace function private.insert_booking(
  p_business uuid, p_service public.business_services, p_start timestamptz, p_first_name text, p_phone text,
  p_lead uuid, p_claim uuid, p_source text, p_future boolean, p_visitor text
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings%rowtype;
  v_code text;
  v_event boolean := coalesce(p_service.event_day, false);
  v_gap int := case when coalesce(p_service.event_day, false) then 0 else coalesce(private.gap_after(p_business, p_service, false), 0) end;
  v_end timestamptz := p_start + make_interval(mins => p_service.minutes);
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_event then
    v_from := ((p_start at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
    v_to := v_from + interval '1 day';
    v_end := least(v_end, v_to);
  elsif v_gap > 0 then
    v_from := p_start;
    v_to := v_end + make_interval(mins => v_gap);
  end if;
  loop
    v_code := private.booking_code();
    exit when not exists (select 1 from public.bookings where code = v_code);
  end loop;
  insert into public.bookings (business_id, service_id, service_name, minutes, starts_at, ends_at, first_name, phone, lead_id,
                               claim_id, source, future_offers, code, view_token, visitor_id, created_by,
                               event_day, gap_minutes, busy_from, busy_to, price_kobo, price_kind)
  values (p_business, p_service.id, p_service.name, greatest(15, (extract(epoch from (v_end - p_start)) / 60)::int), p_start, v_end,
          p_first_name, p_phone, p_lead, p_claim, p_source, coalesce(p_future, false), v_code,
          encode(extensions.gen_random_bytes(12), 'hex'), p_visitor, auth.uid(),
          v_event, nullif(v_gap, 0), v_from, v_to, p_service.price_kobo, p_service.price_kind)
  returning * into bk;
  return bk;
end;
$$;

-- 3 first, while "no price" still tells them apart.
delete from public.sales s
using public.bookings b
where s.booking_id = b.id
  and b.price_kobo is null
  and s.total_kobo = 0
  and not exists (select 1 from public.sale_payments p where p.sale_id = s.id)
  and not exists (select 1 from public.pay_links l where l.sale_id = s.id);

update public.bookings b
set price_kobo = s.price_kobo, price_kind = s.price_kind
from public.business_services s
where b.service_id = s.id and b.price_kobo is null and s.price_kobo is not null;
