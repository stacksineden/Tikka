-- Paid pay link alerts (web push to the owner's phone, like new lead and booking alerts).
-- After complete_pay_link() records a payment, the server reads pay_link_alert() and sends
-- "₦5,000 paid · Glow Studio / Bisi paid: Braids balance". Owners only (staff never get alerts,
-- rule 4); never a phone number or email (the notification shows on the lock screen). Server only.

create function public.pay_link_alert(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', p.business_id, 'business_name', z.name, 'amount_kobo', p.paid_kobo, 'note', p.note,
    'first_name', split_part(coalesce(p.customer_name, ''), ' ', 1),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s
      join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
      where s.business_id = p.business_id), '[]'::jsonb))
  from public.pay_links p join public.businesses z on z.id = p.business_id
  where p.id = p_link and p.status = 'paid';
$$;

revoke all on function public.pay_link_alert(uuid) from public, anon, authenticated;
grant execute on function public.pay_link_alert(uuid) to service_role;
