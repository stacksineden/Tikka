-- The new direction, step 7 (docs/DB_MOVE.md): the money alerts on real data. "Anything you spent
-- today?" at 20:00 WAT and the week's in, spent and kept on Sunday at 19:00 go by web push to the
-- owner's phones: the same phones as the new lead, booking and payment alerts (one switch per phone,
-- push_subscriptions). Until now the phones were kept in memory (lib/money-alert-data.ts).
--
-- The scheduled send runs without anyone signed in, so money_alert_data() (server only) gives it
-- each business's ledger, the deposits and today's bookings, and the owners' phones. get_ledger()
-- keeps its answers; both read the same private.ledger_json().
--
-- The hourly schedule for /api/cron/money goes in when the new direction reaches production (docs/
-- DB_MOVE.md, before the merge): until then production has no such route.

create function private.ledger_json(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '400 days';
begin
  return jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
          'phone', s.phone, 'receipt_token', s.receipt_token,
          'payments', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'kobo', p.kobo, 'method', p.method) order by p.at)
                                from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb))
        order by s.at)
      from public.sales s where s.business_id = p_business and s.at >= since), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'kobo', e.kobo) order by e.at)
      from public.expenses e where e.business_id = p_business and e.at >= since), '[]'::jsonb),
    'regular', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'kobo', r.kobo, 'every', r.every, 'from', r.starts_at) order by r.starts_at)
      from public.regular_costs r where r.business_id = p_business and r.ended_at is null), '[]'::jsonb),
    'pay_links', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', l.id, 'paid_at', l.paid_at, 'kobo', l.paid_kobo, 'note', l.note,
          'name', coalesce(l.customer_name, d.first_name), 'phone', coalesce(l.phone, d.phone)) order by l.paid_at)
      from public.pay_links l left join public.leads d on d.id = l.lead_id
      where l.business_id = p_business and l.status = 'paid' and l.sale_id is null and l.paid_at >= since and l.paystack_mode = 'live'), '[]'::jsonb));
end;
$$;

create or replace function public.get_ledger(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.owner_or_raise(p_business);
  return private.ledger_json(p_business);
end;
$$;

-- Every business with an owner's phone turned on: its name, ledger, deposits paid (last 60 days),
-- today's bookings (to count who isn't marked paid) and the phones. Server only. Never customers'
-- numbers beyond what the ledger already holds for the owner.
create function public.money_alert_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'business_id', b.id,
      'business_name', b.name,
      'ledger', private.ledger_json(b.id),
      'deposits', coalesce((
        select jsonb_agg(jsonb_build_object('at', k.created_at, 'kobo', k.deposit_paid_kobo, 'name', k.first_name, 'item', k.service_name))
        from public.bookings k where k.business_id = b.id and k.deposit_paid_kobo is not null and k.created_at > now() - interval '60 days'), '[]'::jsonb),
      'today', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'starts_at', k.starts_at, 'status', k.status))
        from public.bookings k where k.business_id = b.id and k.status <> 'held'
          and (k.starts_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date), '[]'::jsonb),
      'subscriptions', (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_subscriptions s
        join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
        where s.business_id = b.id))), '[]'::jsonb)
  from public.businesses b
  where not b.suspended and not b.is_demo
    and exists (select 1 from public.push_subscriptions s
                join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
                where s.business_id = b.id);
$$;

revoke all on function private.ledger_json(uuid) from public, anon, authenticated;
revoke all on function public.money_alert_data() from public, anon, authenticated;
grant execute on function public.money_alert_data() to service_role;
