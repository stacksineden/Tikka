-- Only businesses that take bookings show in Tikka's search (decided 27 Nov 2026): a customer who
-- taps Book on a listing picks a free time, never a WhatsApp request. Bookings must be switched on
-- (booking_settings.enabled); deposits stay the owner's choice. A business that pauses bookings drops
-- out of search until it switches them back on, and accept_listing() asks for bookings on too.

create or replace function private.in_search(b public.businesses) returns boolean
language sql stable set search_path = '' as $$
  select b.listed
    and (b.listing_terms_at is not null or coalesce(b.listing_grace_until > now(), false))
    and exists (select 1 from public.booking_settings s where s.business_id = b.id and s.enabled);
$$;

create or replace function private.listing_missing(p_business uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when b.work_place is distinct from 'home'
          and not exists (select 1 from public.business_space_photos s where s.business_id = b.id) then 'space_photo' end,
    case when not exists (select 1 from public.business_services v where v.business_id = b.id and v.price_kind <> 'ask') then 'priced_service' end,
    case when not exists (select 1 from public.booking_settings s where s.business_id = b.id and s.enabled) then 'bookings_off' end
  ], null)
  from public.businesses b where b.id = p_business;
$$;
