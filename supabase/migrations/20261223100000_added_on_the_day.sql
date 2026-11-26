-- Added on the day (27 Nov 2026): a booked customer asks for more at the appointment ("add a wash
-- and beads, ₦4,500"). The owner adds it on the Paid sheet, so the visit stays one sale: its total
-- already includes it (record_sale()), and the sale remembers what was added and for how much, so
-- Today, Money and the receipt can say so. Owners only, once per sale, never more than the total.

alter table public.sales
  add column added_label varchar(60) check (added_label is null or trim(added_label) <> ''),
  add column added_kobo int check (added_kobo between 1 and 1000000000),
  add constraint sales_added_check check ((added_label is null) = (added_kobo is null));

create function public.note_sale_added(p_business uuid, p_sale uuid, p_label text, p_kobo int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.owner_or_raise(p_business);
  if nullif(trim(coalesce(p_label, '')), '') is null or coalesce(p_kobo, 0) <= 0 then
    return false;
  end if;
  update public.sales
  set added_label = left(trim(p_label), 60), added_kobo = p_kobo
  where id = p_sale and business_id = p_business and added_label is null and p_kobo <= total_kobo;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.note_sale_added(uuid, uuid, text, int) from public, anon;
grant execute on function public.note_sale_added(uuid, uuid, text, int) to authenticated;

-- The owner's ledger and the receipt carry what was added.
create or replace function private.ledger_json(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '400 days';
begin
  return jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
          'phone', s.phone, 'receipt_token', s.receipt_token, 'added_label', s.added_label, 'added_kobo', s.added_kobo,
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

create or replace function public.receipt_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', s.business_id, 'business_slug', z.slug, 'n', s.receipt_n,
    'sale', jsonb_build_object('id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
      'added_label', s.added_label, 'added_kobo', s.added_kobo,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('at', p.at, 'kobo', p.kobo, 'method', p.method) order by p.at)
                            from public.sale_payments p where p.sale_id = s.id), '[]'::jsonb)),
    'booking', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'service', b.service_name, 'minutes', b.minutes, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
      'first_name', b.first_name, 'created_at', b.created_at, 'status', b.status, 'source', b.source, 'code', b.code,
      'deposit_paid_kobo', b.deposit_paid_kobo, 'deposit_counts', b.deposit_counts, 'price_kobo', b.price_kobo,
      'price_kind', b.price_kind, 'detail', b.detail) end)
  from public.sales s
  join public.businesses z on z.id = s.business_id
  left join public.bookings b on b.id = s.booking_id
  where s.receipt_token = p_token and p_token ~ '^rc-[A-Za-z0-9_-]{12}$';
$$;
