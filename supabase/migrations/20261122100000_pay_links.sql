-- Pay links (docs/REVENUE_PLAN.md 5.3, step 3 of 5.9): the owner makes a link for an amount with a
-- note (a balance, a custom job, a Tikka's discounted price), pastes it into their own WhatsApp,
-- and the customer pays by card, transfer or USSD. Paystack splits each payment: the business's
-- subaccount gets it the next working day (the business bears Paystack's fee), Tikka keeps 1%.
-- Tikka never holds the money and never refunds (5.2). The server works out every amount (rule 11
-- in spirit): the browser only ever sends the link's token and the payer's email.

create table public.pay_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{10}$'),
  amount_kobo int not null check (amount_kobo between 10000 and 100000000),
  note text not null check (char_length(note) between 2 and 80),
  customer_name text check (char_length(customer_name) between 1 and 30),
  -- A Tikka this payment is for: staff see "Paid online" when they check its code.
  claim_id uuid references public.claims (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  -- Where the money goes, fixed when the link is made.
  subaccount_code text not null,
  paystack_mode text not null check (paystack_mode in ('test', 'live')),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  reference text unique,
  paid_kobo int,
  fee_kobo int,
  tikka_kobo int,
  payer_email text check (char_length(payer_email) <= 120),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pay_links_business on public.pay_links (business_id, created_at desc);
create index pay_links_claim on public.pay_links (claim_id) where claim_id is not null;

alter table public.pay_links enable row level security;
revoke all on public.pay_links from anon, authenticated;

-- Tikka's 1% of a payment, at least ₦1 (in kobo).
create function private.tikka_share(p_kobo int) returns int
language sql immutable set search_path = '' as $$
  select greatest(100, round(p_kobo * 0.01)::int);
$$;

-- The owner makes a link. Payments must be open for the business, with an account added with the
-- same kind of Paystack key the site runs with (p_mode), within its maximum per payment. A link
-- for a Tikka takes the claimer's name and lead from the claim.
create function public.create_pay_link(p_business uuid, p_amount_kobo int, p_note text, p_name text, p_claim uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  problem text := private.payments_problem(p_business);
  o public.business_payouts%rowtype;
  max_k int;
  v_claim uuid;
  v_lead uuid;
  v_first text;
  v_token text;
  v_note text := left(trim(coalesce(p_note, '')), 80);
  v_name text := nullif(left(trim(coalesce(p_name, '')), 30), '');
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner makes pay links' using errcode = 'insufficient_privilege';
  end if;
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  select * into o from public.business_payouts where business_id = p_business;
  if not found then
    return jsonb_build_object('kind', 'no_account');
  end if;
  if o.paystack_mode <> p_mode then
    return jsonb_build_object('kind', 'account_again');
  end if;
  select max_kobo into max_k from public.business_payments where business_id = p_business;
  if p_amount_kobo is null or p_amount_kobo < 10000 then
    return jsonb_build_object('kind', 'too_small');
  end if;
  if p_amount_kobo > max_k then
    return jsonb_build_object('kind', 'too_big', 'max_kobo', max_k);
  end if;
  if char_length(v_note) < 2 then
    return jsonb_build_object('kind', 'bad_note');
  end if;
  if p_claim is not null then
    select cl.id, cl.first_name, cl.lead_id into v_claim, v_first, v_lead
    from public.claims cl join public.drops d on d.id = cl.drop_id
    where cl.id = p_claim and d.business_id = p_business;
    if v_claim is null then
      return jsonb_build_object('kind', 'not_found');
    end if;
    v_name := v_first;
  end if;
  loop
    v_token := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(private.crypto_random() * 31)::int, 1), '') from generate_series(1, 10));
    exit when not exists (select 1 from public.pay_links where token = v_token);
  end loop;
  insert into public.pay_links (business_id, token, amount_kobo, note, customer_name, claim_id, lead_id, subaccount_code, paystack_mode, created_by)
  values (p_business, v_token, p_amount_kobo, v_note, v_name, v_claim, v_lead, o.subaccount_code, o.paystack_mode, auth.uid());
  return jsonb_build_object('kind', 'created', 'token', v_token);
end;
$$;

-- The pay page (public): what it's for, how much, to whom, and whether it's paid. Nothing else.
create function public.pay_link_page(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'amount_kobo', p.amount_kobo, 'note', p.note, 'customer_name', p.customer_name, 'status', p.status,
    'paid_at', p.paid_at, 'paid_kobo', p.paid_kobo, 'business_slug', b.slug, 'business_id', b.id)
  from public.pay_links p join public.businesses b on b.id = p.business_id
  where p.token = p_token;
$$;

-- What the server needs to start a checkout (server only): the amount, Tikka's share and where it goes.
create function public.pay_link_checkout(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'amount_kobo', p.amount_kobo, 'tikka_kobo', private.tikka_share(p.amount_kobo), 'status', p.status,
    'subaccount', p.subaccount_code, 'mode', p.paystack_mode, 'business_name', b.name, 'suspended', b.suspended,
    'enabled', coalesce((select enabled from public.business_payments where business_id = b.id), false))
  from public.pay_links p join public.businesses b on b.id = p.business_id
  where p.token = p_token;
$$;

-- Paystack says a payment succeeded (webhook or the return from checkout; server only). The
-- reference is pl_<token>_<attempt>. Idempotent; the amount must match the link exactly.
create function public.complete_pay_link(p_reference text, p_amount_kobo int, p_fee_kobo int, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pay_links%rowtype;
  v_token text := substring(p_reference from '^pl_([a-z0-9]{10})_');
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
  return jsonb_build_object('kind', 'paid', 'business_id', p.business_id, 'id', p.id);
end;
$$;

-- The owner's Money screen: pay links, newest first, with what came in. Owners only (the
-- customer's email and the Tikka's lead stay with the owner, rule 4).
create function public.get_pay_links(p_business uuid, p_limit int default 100) returns jsonb
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
        'phone', (select l.phone from public.leads l where l.id = p.lead_id), 'mode', p.paystack_mode)
      order by p.created_at desc)
    from (select * from public.pay_links where business_id = p_business order by created_at desc limit least(greatest(p_limit, 1), 500)) p), '[]'::jsonb);
end;
$$;

-- The owner cancels a link that hasn't been paid. A payment already on its way still counts.
create function public.cancel_pay_link(p_business uuid, p_link uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner cancels pay links' using errcode = 'insufficient_privilege';
  end if;
  update public.pay_links set status = 'cancelled', cancelled_at = now()
  where id = p_link and business_id = p_business and status = 'open';
  get diagnostics n = row_count;
  return jsonb_build_object('kind', case when n = 1 then 'cancelled' else 'not_open' end);
end;
$$;

-- At the counter: what was paid online for a Tikka, by its code. Owners and staff; amounts only.
create function public.paid_for_code(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
begin
  if not private.is_member(p_business) then
    raise exception 'Only the business''s team checks codes' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object('paid_kobo', coalesce((
    select sum(p.paid_kobo) from public.pay_links p join public.claims c on c.id = p.claim_id
    where c.code = v_code and p.business_id = p_business and p.status = 'paid'), 0));
end;
$$;

revoke all on function private.tikka_share(int) from public, anon, authenticated;
revoke all on function public.create_pay_link(uuid, int, text, text, uuid, text), public.pay_link_page(text), public.pay_link_checkout(text),
  public.complete_pay_link(text, int, int, text), public.get_pay_links(uuid, int), public.cancel_pay_link(uuid, uuid),
  public.paid_for_code(uuid, text) from public, anon;
revoke all on function public.pay_link_page(text), public.pay_link_checkout(text), public.complete_pay_link(text, int, int, text) from authenticated;
grant execute on function public.create_pay_link(uuid, int, text, text, uuid, text), public.get_pay_links(uuid, int),
  public.cancel_pay_link(uuid, uuid), public.paid_for_code(uuid, text) to authenticated;
grant execute on function public.pay_link_page(text), public.pay_link_checkout(text), public.complete_pay_link(text, int, int, text) to service_role;
