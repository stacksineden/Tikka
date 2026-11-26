-- The new direction, step 4 (docs/DB_MOVE.md): sales and money. Today's "Paid" and "New sale",
-- part payments and balances still owed, what the owner spent (once, or every week or month), and
-- receipts. Until now these lived in the demo store (lib/ledger-data.ts, lib/receipts-data.ts).
--
-- Owners only (rule 4: sales carry customers' numbers; staff never see them). Nothing is read or
-- written directly: only through the functions below. Deposits and pay links paid online are read
-- from bookings and pay_links where they already are, never copied here, so Money can't count them
-- twice. A receipt is proof of payment, not a tax invoice: one per sale, made the first time the
-- owner sends it, and worked out from the sale each time it's opened (never the number or address).
-- Privacy: the lookup shows a person's sales; forgetting them keeps the amounts but removes the
-- name and number.

/* ------------------------------------------------------------ tables */

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 40),
  item text not null check (char_length(item) between 1 and 60),
  -- What it cost (after any deposit already paid through Tikka).
  total_kobo int not null check (total_kobo between 0 and 1000000000),
  -- The booking it settles (one sale per booking).
  booking_id uuid unique references public.bookings (id) on delete set null,
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  receipt_token text unique check (receipt_token ~ '^rc-[A-Za-z0-9_-]{12}$'),
  receipt_n int,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sales_business_at on public.sales (business_id, at);
create index sales_phone on public.sales (phone) where phone is not null;

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  at timestamptz not null default now(),
  kobo int not null check (kobo between 1 and 1000000000),
  method text not null check (method in ('cash', 'transfer', 'card', 'pay_link')),
  created_by uuid references auth.users (id) on delete set null
);
create index sale_payments_sale on public.sale_payments (sale_id);
create index sale_payments_business_at on public.sale_payments (business_id, at);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('Products', 'Rent', 'Transport', 'Helper', 'Data', 'Light / fuel', 'Other')),
  kobo int not null check (kobo between 1 and 1000000000),
  created_by uuid references auth.users (id) on delete set null
);
create index expenses_business_at on public.expenses (business_id, at);

-- A cost counted every week (on the weekday it started) or every month (on its day).
create table public.regular_costs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('Products', 'Rent', 'Transport', 'Helper', 'Data', 'Light / fuel', 'Other')),
  kobo int not null check (kobo between 1 and 1000000000),
  every text not null check (every in ('week', 'month')),
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users (id) on delete set null
);
create index regular_costs_business on public.regular_costs (business_id);

alter table public.sales enable row level security;
alter table public.sale_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.regular_costs enable row level security;
revoke all on public.sales, public.sale_payments, public.expenses, public.regular_costs from anon, authenticated;

/* ------------------------------------------------------------ the owner's writes */

create function private.owner_or_raise(p_business uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees and records money' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- A sale: a walk-in (New sale) or a booked customer paying what's left (Paid). Paying less leaves
-- the rest owed. A booking is settled once: asking again returns the same sale. Returns its id.
create function public.record_sale(
  p_business uuid, p_name text, p_item text, p_total_kobo int, p_paid_kobo int, p_method text, p_booking uuid, p_phone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_total int := least(greatest(coalesce(p_total_kobo, 0), 0), 1000000000);
  v_paid int;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  perform private.owner_or_raise(p_business);
  if p_method not in ('cash', 'transfer', 'card') then
    raise exception 'Paid by cash, transfer or card' using errcode = 'check_violation';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format' using errcode = 'check_violation';
  end if;
  if p_booking is not null then
    if not exists (select 1 from public.bookings where id = p_booking and business_id = p_business) then
      raise exception 'That booking isn''t this business''s' using errcode = 'no_data_found';
    end if;
    select id into v_id from public.sales where booking_id = p_booking;
    if v_id is not null then
      return v_id;
    end if;
    -- A booking brings its own number when the owner didn't type one.
    v_phone := coalesce(v_phone, (select phone from public.bookings where id = p_booking));
  end if;
  v_paid := least(greatest(coalesce(p_paid_kobo, 0), 0), v_total);
  insert into public.sales (business_id, name, item, total_kobo, booking_id, phone, created_by)
  values (p_business, coalesce(nullif(left(trim(coalesce(p_name, '')), 40), ''), 'Walk-in'),
          coalesce(nullif(left(trim(coalesce(p_item, '')), 60), ''), 'Sale'), v_total, p_booking, v_phone, auth.uid())
  returning id into v_id;
  if v_paid > 0 then
    insert into public.sale_payments (sale_id, business_id, kobo, method, created_by) values (v_id, p_business, v_paid, p_method, auth.uid());
  end if;
  return v_id;
end;
$$;

-- What's still owed on a sale, paid now (all of it, or part; never more than is owed).
create function public.pay_balance(p_business uuid, p_sale uuid, p_kobo int, p_method text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  owed int;
begin
  perform private.owner_or_raise(p_business);
  if p_method not in ('cash', 'transfer', 'card') then
    raise exception 'Paid by cash, transfer or card' using errcode = 'check_violation';
  end if;
  select s.total_kobo - coalesce((select sum(p.kobo) from public.sale_payments p where p.sale_id = s.id), 0) into owed
  from public.sales s where s.id = p_sale and s.business_id = p_business for update;
  if not found then
    return false;
  end if;
  if least(owed, coalesce(p_kobo, 0)) > 0 then
    insert into public.sale_payments (sale_id, business_id, kobo, method, created_by) values (p_sale, p_business, least(owed, p_kobo), p_method, auth.uid());
  end if;
  return true;
end;
$$;

-- Something spent: once, or a regular cost counted every week or month from now.
create function public.add_expense(p_business uuid, p_kind text, p_kobo int, p_every text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.owner_or_raise(p_business);
  if coalesce(p_kobo, 0) <= 0 then
    return false;
  end if;
  if p_every in ('week', 'month') then
    insert into public.regular_costs (business_id, kind, kobo, every, created_by) values (p_business, p_kind, least(p_kobo, 1000000000), p_every, auth.uid());
  else
    insert into public.expenses (business_id, kind, kobo, created_by) values (p_business, p_kind, least(p_kobo, 1000000000), auth.uid());
  end if;
  return true;
end;
$$;

/* ------------------------------------------------------------ the owner's reads */

-- The owner's ledger: sales of the last 400 days with their payments, what was spent, the regular
-- costs, and pay links paid online (read from pay_links, never copied).
create function public.get_ledger(p_business uuid) returns jsonb
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
          'name', coalesce(l.customer_name, d.first_name), 'phone', d.phone) order by l.paid_at)
      from public.pay_links l left join public.leads d on d.id = l.lead_id
      where l.business_id = p_business and l.status = 'paid' and l.paid_at >= since and l.paystack_mode = 'live'), '[]'::jsonb));
end;
$$;

/* ------------------------------------------------------------ receipts */

-- The receipt for a sale: the same link every time, numbered per business in the order they were
-- first sent. Owners only.
create function public.receipt_for(p_business uuid, p_sale uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.sales%rowtype;
  v_token text;
begin
  perform private.owner_or_raise(p_business);
  select * into s from public.sales where id = p_sale and business_id = p_business for update;
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
  -- One at a time per business, so two receipts never get the same number.
  perform 1 from public.businesses where id = p_business for update;
  update public.sales
  set receipt_token = v_token,
      receipt_n = coalesce((select max(receipt_n) from public.sales where business_id = p_business), 0) + 1
  where id = p_sale;
  return v_token;
end;
$$;

-- What the receipt page shows (server only, by its link): the sale and its payments, and the
-- booking it settles (the deposit paid online). Never the customer's number or address.
create function public.receipt_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', s.business_id, 'business_slug', z.slug, 'n', s.receipt_n,
    'sale', jsonb_build_object('id', s.id, 'at', s.at, 'name', s.name, 'item', s.item, 'total_kobo', s.total_kobo, 'booking_id', s.booking_id,
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

/* ------------------------------------------------------------ access */

revoke all on function private.owner_or_raise(uuid) from public, anon, authenticated;
revoke all on function public.record_sale(uuid, text, text, int, int, text, uuid, text), public.pay_balance(uuid, uuid, int, text),
  public.add_expense(uuid, text, int, text), public.get_ledger(uuid), public.receipt_for(uuid, uuid) from public, anon;
grant execute on function public.record_sale(uuid, text, text, int, int, text, uuid, text), public.pay_balance(uuid, uuid, int, text),
  public.add_expense(uuid, text, int, text), public.get_ledger(uuid), public.receipt_for(uuid, uuid) to authenticated;
revoke all on function public.receipt_page(text) from public, anon, authenticated;
grant execute on function public.receipt_page(text) to service_role;

/* ------------------------------------------------------------ privacy */

-- The lookup shows a person's sales (same as before, plus 'sales').
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
      from public.pay_links p join public.businesses z on z.id = p.business_id join public.leads l on l.id = p.lead_id
      where l.phone = p_phone), '[]'),
    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', w.service_name, 'day', w.day) order by w.day desc)
      from public.booking_waitlist w join public.businesses z on z.id = w.business_id where w.phone = p_phone), '[]'),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'item', s.item, 'total_kobo', s.total_kobo, 'at', s.at) order by s.at desc)
      from public.sales s join public.businesses z on z.id = s.business_id where s.phone = p_phone), '[]')
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages',
                             'bookings', jsonb_array_length(result -> 'bookings'), 'payments', jsonb_array_length(result -> 'payments'),
                             'waitlist', jsonb_array_length(result -> 'waitlist'),
                             'sales', jsonb_array_length(result -> 'sales')),
          auth.uid());
  return result;
end;
$$;

-- Forgetting a person keeps their sales' amounts but removes the name and number (same as before, plus 'sales').
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

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events,
    'waitlist', n_waitlist, 'sales', n_sales);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;
