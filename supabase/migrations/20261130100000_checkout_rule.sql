-- Paying an existing pay link, or finishing an unpaid booking deposit, follows the same payment rule
-- as everything else (private.payments_problem(): switched on, Verified, not suspended, and an
-- approved ID or still in the grace period). Before this, a link made before a pause could still be
-- paid after it, because the checkout only looked at the switch and suspension.

create or replace function public.pay_link_checkout(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'amount_kobo', p.amount_kobo, 'tikka_kobo', private.tikka_share(p.amount_kobo), 'status', p.status,
    'subaccount', p.subaccount_code, 'mode', p.paystack_mode, 'business_name', b.name, 'suspended', b.suspended,
    'enabled', coalesce((select enabled from public.business_payments where business_id = b.id), false),
    'payments_ok', private.payments_problem(b.id) is null)
  from public.pay_links p join public.businesses b on b.id = p.business_id
  where p.token = p_token;
$$;

create or replace function public.booking_checkout(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'deposit_kobo', b.deposit_kobo, 'tikka_kobo', private.tikka_share(coalesce(b.deposit_kobo, 0)),
    'subaccount', b.deposit_subaccount, 'mode', b.deposit_mode, 'email', b.deposit_email,
    'hold_live', b.status = 'held' and b.hold_expires_at > now(), 'business_name', z.name,
    'payments_ok', private.payments_problem(b.business_id) is null)
  from public.bookings b join public.businesses z on z.id = b.business_id
  where b.view_token = p_token;
$$;
