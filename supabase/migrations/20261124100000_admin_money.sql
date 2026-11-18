-- Pilot controls (REVENUE_PLAN 5.7, step 5 of 5.9): what has been collected through Tikka's Paystack
-- account, for the Starter limit (₦8,000,000 in total, ever, counting the full amount of every
-- payment: owners' drop payments, customers' pay links and booking deposits), and each business's
-- customer payments. Live-mode payments only count towards the limit; test ones are shown apart.

create function public.admin_money() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return jsonb_build_object(
    -- Everything Tikka's live Paystack account has collected.
    'drop_payments_kobo', coalesce((select sum(amount_kobo) from public.payments where status = 'paid'), 0),
    'pay_links_kobo', coalesce((select sum(paid_kobo) from public.pay_links where status = 'paid' and paystack_mode = 'live'), 0),
    'deposits_kobo', coalesce((select sum(deposit_paid_kobo) from public.bookings where deposit_paid_at is not null and deposit_mode = 'live'), 0),
    'tikka_kobo', coalesce((select sum(tikka_kobo) from public.pay_links where status = 'paid' and paystack_mode = 'live'), 0)
                + coalesce((select sum(deposit_tikka_kobo) from public.bookings where deposit_paid_at is not null and deposit_mode = 'live'), 0),
    'test_kobo', coalesce((select sum(paid_kobo) from public.pay_links where status = 'paid' and paystack_mode = 'test'), 0)
               + coalesce((select sum(deposit_paid_kobo) from public.bookings where deposit_paid_at is not null and deposit_mode = 'test'), 0),
    'businesses', coalesce((
      select jsonb_agg(x order by (x ->> 'live_kobo')::bigint desc, x ->> 'name')
      from (
        select jsonb_build_object(
          'id', b.id, 'name', b.name, 'slug', b.slug, 'verified', b.verified,
          'enabled', coalesce(p.enabled, false), 'max_kobo', coalesce(p.max_kobo, 2000000),
          'bank', o.bank_name, 'last4', o.account_last4, 'mode', o.paystack_mode,
          'deposits_on', coalesce(s.deposit_mode, 'off') <> 'off',
          'live_kobo', coalesce((select sum(l.paid_kobo) from public.pay_links l where l.business_id = b.id and l.status = 'paid' and l.paystack_mode = 'live'), 0)
                     + coalesce((select sum(k.deposit_paid_kobo) from public.bookings k where k.business_id = b.id and k.deposit_paid_at is not null and k.deposit_mode = 'live'), 0),
          'links_paid', (select count(*) from public.pay_links l where l.business_id = b.id and l.status = 'paid'),
          'deposits_paid', (select count(*) from public.bookings k where k.business_id = b.id and k.deposit_paid_at is not null),
          'last_paid_at', greatest(
            (select max(l.paid_at) from public.pay_links l where l.business_id = b.id and l.status = 'paid'),
            (select max(k.deposit_paid_at) from public.bookings k where k.business_id = b.id))) as x
        from public.businesses b
        left join public.business_payments p on p.business_id = b.id
        left join public.business_payouts o on o.business_id = b.id
        left join public.booking_settings s on s.business_id = b.id
        where coalesce(p.enabled, false) or o.business_id is not null
      ) q), '[]'::jsonb));
end;
$$;

revoke all on function public.admin_money() from public, anon;
grant execute on function public.admin_money() to authenticated;
