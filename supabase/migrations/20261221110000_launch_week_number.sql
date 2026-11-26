-- Launch week: most owners haven't saved an alert number, so the nudge also uses the business's own
-- Chat on WhatsApp number, as the daily summary does (20261119100000_summary_nudge_when_idle.sql).

create or replace function public.admin_launch_week() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.created_at) from (
      select b.id, b.name, b.slug, b.city, b.created_at, b.suspended,
        -- The owner's alert number, else the business's own Chat on WhatsApp number (as the daily summary).
        coalesce(p.owner_whatsapp,
                 (select a ->> 'value' from jsonb_array_elements(coalesce(b.actions, '[]')) a where a ->> 'kind' = 'whatsapp' limit 1)) as owner_whatsapp,
        (b.trades is not null and cardinality(b.trades) > 0 and b.work_place is not null
          and b.booking_rules is not null and cardinality(b.booking_rules) > 0) as setup_done,
        b.listed, b.listing_terms_at as terms_at, b.listing_grace_until as grace_until,
        (select count(*) from public.business_space_photos s where s.business_id = b.id) as space_photos,
        (select count(*) from public.business_services v where v.business_id = b.id) as services,
        coalesce(st.enabled, false) as bookings_on,
        coalesce(st.enabled, false) and coalesce(st.deposit_mode, 'off') <> 'off' as deposits_on,
        exists (select 1 from public.business_payouts o where o.business_id = b.id) as has_bank,
        coalesce(pay.enabled, false) as payments_on,
        k.status as kyc_status, pay.kyc_grace_until,
        (select count(*) from public.bookings bk where bk.business_id = b.id and bk.status <> 'held'
           and bk.created_at > now() - interval '7 days') as bookings_7d,
        (select count(*) from public.bookings bk where bk.business_id = b.id and bk.status <> 'held'
           and bk.found_via = 'search' and bk.created_at > now() - interval '7 days') as from_search_7d
      from public.businesses b
      left join public.business_private p on p.business_id = b.id
      left join public.booking_settings st on st.business_id = b.id
      left join public.business_payments pay on pay.business_id = b.id
      left join public.business_kyc k on k.business_id = b.id
      where not b.is_demo
    ) x), '[]'::jsonb);
end;
$$;
