-- The new direction, step 6 (docs/DB_MOVE.md): pay links that settle a balance. Today, Money and a
-- customer's page send pay links for a balance they owe, a Tikka they haven't used, or something
-- else; until now those were the demo store's (lib/paylinks-demo.ts).
--
-- - A pay link can be for a sale (sale_id): paying it records a "pay link" payment on that sale,
--   which settles what they owe.
-- - Any other link, once paid, becomes a sale of its own (the note, the amount, paid by pay link),
--   so every payment is in the owner's money and has a receipt.
-- - Each paid link's sale gets its receipt; the pay page links to it.
-- - Links can carry the customer's WhatsApp number (owners only, rule 4).
--
-- Additive: links made before this keep working as they are. Paid ones without a sale are still
-- read straight from pay_links by get_ledger() (live mode only), so nothing is counted twice.
-- create_pay_link() keeps its 6 arguments for code already deployed; an 8-argument version adds the
-- sale and the number.

alter table public.pay_links
  add column sale_id uuid references public.sales (id) on delete set null,
  add column phone text check (phone ~ '^\+[1-9][0-9]{7,14}$');
create index pay_links_sale on public.pay_links (sale_id) where sale_id is not null;

-- A sale's receipt link and number (made once), for the server when a pay link is paid.
create function private.give_receipt(p_sale uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.sales%rowtype;
  v_token text;
begin
  select * into s from public.sales where id = p_sale for update;
  if not found then
    return null;
  end if;
  if s.receipt_token is not null then
    return s.receipt_token;
  end if;
  loop
    v_token := 'rc-' || translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
    exit when not exists (select 1 from public.sales where receipt_token = v_token);
  end loop;
  perform 1 from public.businesses where id = s.business_id for update;
  update public.sales
  set receipt_token = v_token,
      receipt_n = coalesce((select max(receipt_n) from public.sales where business_id = s.business_id), 0) + 1
  where id = p_sale;
  return v_token;
end;
$$;

-- receipt_for() shares it (same answers as before).
create or replace function public.receipt_for(p_business uuid, p_sale uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform private.owner_or_raise(p_business);
  if not exists (select 1 from public.sales where id = p_sale and business_id = p_business) then
    return null;
  end if;
  return private.give_receipt(p_sale);
end;
$$;

-- A pay link, for a sale's balance (p_sale), a Tikka (p_claim) or something else, with the
-- customer's number (p_phone; a sale or a Tikka brings its own). The same checks as before:
-- payments ready, an account of this Paystack mode, ₦100 up to the business's maximum.
create function public.create_pay_link(
  p_business uuid, p_amount_kobo int, p_note text, p_name text, p_claim uuid, p_mode text, p_sale uuid, p_phone text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  s public.sales%rowtype;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_name text := p_name;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner makes pay links' using errcode = 'insufficient_privilege';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  if p_sale is not null then
    select * into s from public.sales where id = p_sale and business_id = p_business;
    if not found then
      return jsonb_build_object('kind', 'not_found');
    end if;
    v_name := s.name;
    v_phone := coalesce(s.phone, v_phone);
  end if;
  r := public.create_pay_link(p_business, p_amount_kobo, p_note, v_name, p_claim, p_mode);
  if r ->> 'kind' = 'created' then
    update public.pay_links
    set sale_id = p_sale,
        phone = coalesce(v_phone, (select l.phone from public.leads l where l.id = pay_links.lead_id))
    where token = r ->> 'token';
  end if;
  return r;
end;
$$;

-- Paystack says a payment succeeded (same checks as before). Then: a link for a sale records a
-- pay link payment on it; any other link becomes a sale of its own; either way the sale gets its
-- receipt.
create or replace function public.complete_pay_link(p_reference text, p_amount_kobo int, p_fee_kobo int, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_links%rowtype;
  v_token text := substring(p_reference from '^pl_([a-z0-9]{10})_');
  v_sale uuid;
begin
  select * into p from public.pay_links where token = v_token for update;
  if not found then
    return jsonb_build_object('kind', 'unknown');
  end if;
  if p.status = 'paid' then
    return jsonb_build_object('kind', 'already_paid');
  end if;
  if p_amount_kobo <> p.amount_kobo then
    return jsonb_build_object('kind', 'wrong_amount');
  end if;
  -- Paid even if the owner cancelled meanwhile: the customer's money moved, so it's recorded.
  update public.pay_links
  set status = 'paid', reference = p_reference, paid_kobo = p_amount_kobo, fee_kobo = p_fee_kobo,
      tikka_kobo = private.tikka_share(p_amount_kobo), payer_email = left(nullif(trim(coalesce(p_email, '')), ''), 120), paid_at = now()
  where id = p.id;

  v_sale := p.sale_id;
  if v_sale is null or not exists (select 1 from public.sales where id = v_sale) then
    insert into public.sales (business_id, name, item, total_kobo, phone)
    values (p.business_id, coalesce(p.customer_name, 'Customer'), left(p.note, 60), p_amount_kobo,
            coalesce(p.phone, (select l.phone from public.leads l where l.id = p.lead_id)))
    returning id into v_sale;
    update public.pay_links set sale_id = v_sale where id = p.id;
  end if;
  insert into public.sale_payments (sale_id, business_id, kobo, method) values (v_sale, p.business_id, p_amount_kobo, 'pay_link');
  perform private.give_receipt(v_sale);
  return jsonb_build_object('kind', 'paid', 'business_id', p.business_id, 'id', p.id);
end;
$$;

-- The pay page links to the receipt once it's paid (same as before, plus 'receipt_token').
create or replace function public.pay_link_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'amount_kobo', p.amount_kobo, 'note', p.note, 'customer_name', p.customer_name, 'status', p.status,
    'paid_at', p.paid_at, 'paid_kobo', p.paid_kobo, 'business_slug', b.slug, 'business_id', b.id,
    'receipt_token', case when p.status = 'paid' then (select s.receipt_token from public.sales s where s.id = p.sale_id) end)
  from public.pay_links p join public.businesses b on b.id = p.business_id
  where p.token = p_token;
$$;

-- The owner's pay links (same as before, plus the sale, its receipt and the link's own number).
create or replace function public.get_pay_links(p_business uuid, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees money' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id, 'token', p.token, 'amount_kobo', p.amount_kobo, 'note', p.note, 'customer_name', p.customer_name,
        'status', p.status, 'paid_kobo', p.paid_kobo, 'fee_kobo', p.fee_kobo, 'tikka_kobo', p.tikka_kobo,
        'paid_at', p.paid_at, 'created_at', p.created_at, 'claim_id', p.claim_id,
        'phone', coalesce(p.phone, (select l.phone from public.leads l where l.id = p.lead_id)), 'mode', p.paystack_mode,
        'sale_id', p.sale_id, 'receipt_token', (select s.receipt_token from public.sales s where s.id = p.sale_id))
      order by p.created_at desc)
    from (select * from public.pay_links where business_id = p_business order by created_at desc limit least(greatest(p_limit, 1), 500)) p), '[]'::jsonb);
end;
$$;

-- The ledger reads paid links only when they have no sale (links paid before this migration);
-- the rest are in their sale's payments (same as before otherwise).
create or replace function public.get_ledger(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - interval '400 days';
begin
  perform private.owner_or_raise(p_business);
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

revoke all on function private.give_receipt(uuid) from public, anon, authenticated;
revoke all on function public.create_pay_link(uuid, int, text, text, uuid, text, uuid, text) from public, anon;
grant execute on function public.create_pay_link(uuid, int, text, text, uuid, text, uuid, text) to authenticated;

-- ------------------------------------------------------------- privacy

-- The lookup also finds pay links made for the number (same as before otherwise).
create or replace function public.admin_person_lookup(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;
  result := jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
          'business_name', b.name, 'drop_title', d.title, 'kind', c.kind, 'first_name', c.first_name,
          'reward', coalesce(r.title, d.bounce_back ->> 'title'), 'claimed_at', c.claimed_at, 'redeemed_at', c.redeemed_at,
          'reviewed', exists (select 1 from public.reviews v where v.claim_id = c.id))
        order by c.claimed_at desc)
      from public.claims c join public.drops d on d.id = c.drop_id join public.businesses b on b.id = d.business_id
      left join public.cards k on k.id = c.card_id left join public.rewards r on r.id = k.reward_id
      where c.phone = p_phone), '[]'),
    'businesses_with_lead', coalesce((
      select jsonb_agg(b.name order by b.name) from public.leads l join public.businesses b on b.id = l.business_id where l.phone = p_phone), '[]'),
    'notify', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', b.name, 'drop_title', d.title, 'status', s.status))
      from public.notify_subscriptions s join public.businesses b on b.id = s.business_id left join public.drops d on d.id = s.drop_id
      where s.phone = p_phone), '[]'),
    'opted_out', exists (select 1 from public.opt_outs where phone = p_phone),
    'messages', (select count(*) from public.wa_messages where phone = p_phone) + (select count(*) from public.outbound_messages where phone = p_phone),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', k.service_name, 'starts_at', k.starts_at, 'status', k.status,
                                          'deposit_paid_kobo', k.deposit_paid_kobo, 'email', k.deposit_email is not null) order by k.starts_at desc)
      from public.bookings k join public.businesses z on z.id = k.business_id where k.phone = p_phone), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'note', p.note, 'amount_kobo', p.amount_kobo, 'status', p.status,
                                          'email', p.payer_email is not null) order by p.created_at desc)
      from public.pay_links p join public.businesses z on z.id = p.business_id left join public.leads l on l.id = p.lead_id
      where l.phone = p_phone or p.phone = p_phone), '[]'),
    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', w.service_name, 'day', w.day) order by w.day desc)
      from public.booking_waitlist w join public.businesses z on z.id = w.business_id where w.phone = p_phone), '[]'),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'item', s.item, 'total_kobo', s.total_kobo, 'at', s.at) order by s.at desc)
      from public.sales s join public.businesses z on z.id = s.business_id where s.phone = p_phone), '[]'),
    'client_notes', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'notes', n.notes is not null, 'birthday', n.birthday is not null))
      from public.client_notes n join public.businesses z on z.id = n.business_id where n.phone = p_phone), '[]')
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages',
                             'bookings', jsonb_array_length(result -> 'bookings'), 'payments', jsonb_array_length(result -> 'payments'),
                             'waitlist', jsonb_array_length(result -> 'waitlist'),
                             'sales', jsonb_array_length(result -> 'sales'),
                             'client_notes', jsonb_array_length(result -> 'client_notes')),
          auth.uid());
  return result;
end;
$$;

-- Forgetting a person also clears the name, number and email on pay links made for their number
-- (the amounts stay); links for their Tikkas were already cleared with their lead.
create or replace function public.admin_forget_person(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n_claims int;
  n_reviews int;
  n_leads int;
  n_intents int;
  n_notify int;
  n_optouts int;
  n_messages int;
  n_queue int;
  n_events int := 0;
  n_waitlist int;
  n_sales int;
  n_notes int;
  cl record;
  counts jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;

  -- First names in the live feed: one event per moment they claimed, came in or reviewed (the
  -- closest one, so a namesake who claimed at the same time keeps theirs).
  for cl in
    select x.drop_id, x.first_name, 'claim_completed'::text as type, x.claimed_at as at from public.claims x where x.phone = p_phone and x.kind = 'drop'
    union all
    select x.drop_id, x.first_name, 'redeemed', x.redeemed_at from public.claims x where x.phone = p_phone and x.redeemed_at is not null
    union all
    select x.drop_id, x.first_name, 'reviewed', v.created_at from public.claims x join public.reviews v on v.claim_id = x.id where x.phone = p_phone
  loop
    update public.events set first_name = null
    where id = (
      select e.id from public.events e
      where e.drop_id = cl.drop_id and e.type = cl.type and e.first_name = cl.first_name
        and abs(extract(epoch from e.created_at - cl.at)) < 120
      order by abs(extract(epoch from e.created_at - cl.at)), e.id
      limit 1);
    if found then
      n_events := n_events + 1;
    end if;
  end loop;

  select count(*) into n_claims from public.claims where phone = p_phone;
  select count(*) into n_reviews from public.reviews v join public.claims c on c.id = v.claim_id where c.phone = p_phone;
  delete from public.reports r using public.reviews v, public.claims c
    where r.target_type = 'review' and r.target_id = v.id and v.claim_id = c.id and c.phone = p_phone;
  -- Claims go with their lead (and reviews with their claim).
  delete from public.claims where phone = p_phone;
  with d as (delete from public.leads where phone = p_phone returning 1) select count(*) into n_leads from d;
  with d as (delete from public.claim_intents where phone = p_phone returning 1) select count(*) into n_intents from d;
  with d as (delete from public.notify_subscriptions where phone = p_phone returning 1) select count(*) into n_notify from d;
  with d as (delete from public.opt_outs where phone = p_phone returning 1) select count(*) into n_optouts from d;
  with d as (delete from public.wa_messages where phone = p_phone returning 1) select count(*) into n_messages from d;
  with d as (delete from public.outbound_messages where phone = p_phone returning 1) select count(*) into n_queue from d;
  delete from public.wa_contacts where phone = p_phone;
  with d as (delete from public.booking_waitlist where phone = p_phone returning 1) select count(*) into n_waitlist from d;
  -- Sales keep their amounts (the owner's money stays right) but lose the name and number.
  with d as (update public.sales set name = 'Customer', phone = null where phone = p_phone returning 1) select count(*) into n_sales from d;
  with d as (delete from public.client_notes where phone = p_phone returning 1) select count(*) into n_notes from d;
  -- Pay links made for their number keep the amounts but lose the name and number.
  update public.pay_links set phone = null, customer_name = null, payer_email = null where phone = p_phone;

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events,
    'waitlist', n_waitlist, 'sales', n_sales, 'client_notes', n_notes);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;
