-- Get paid (docs/REVENUE_PLAN.md 5.3, step 2 of 5.9): the owner adds the bank account customers'
-- payments go to. Tikka creates a Paystack subaccount for it (Paystack pays the business the next
-- working day, Tikka keeps 1%; Tikka never holds the money). No payments happen here yet.
--
-- Pilot rules (5.7): Tikka admin switches payments on per business, with a maximum per payment;
-- only Verified, unsuspended, real (not demo) businesses. The account number itself stays with
-- Paystack: Tikka keeps the bank, the last 4 digits, the account name and the subaccount code.

create table public.business_payments (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled boolean not null default false,
  -- The most one payment can be, in kobo (default ₦20,000).
  max_kobo int not null default 2000000 check (max_kobo between 10000 and 100000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.business_payouts (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  bank_code text not null check (char_length(bank_code) between 2 and 20),
  bank_name text not null check (char_length(bank_name) between 2 and 80),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  account_name text not null check (char_length(account_name) between 2 and 120),
  subaccount_code text not null unique check (subaccount_code ~ '^ACCT_[A-Za-z0-9]+$'),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now()
);

alter table public.business_payments enable row level security;
alter table public.business_payouts enable row level security;
revoke all on public.business_payments, public.business_payouts from anon, authenticated;

-- Why a business can't set up getting paid, or null when it can.
create function private.payments_problem(p_business uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when b.id is null then 'not_found'
    when b.is_demo then 'demo'
    when b.suspended then 'suspended'
    when not coalesce(p.enabled, false) then 'not_enabled'
    when not b.verified then 'not_verified'
  end
  from (select p_business as id) x
  left join public.businesses b on b.id = x.id
  left join public.business_payments p on p.business_id = x.id;
$$;

-- The owner's Get paid screen: whether they can, the maximum per payment, and the account.
create function public.payout_state(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sets up getting paid' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'problem', private.payments_problem(p_business),
    'max_kobo', coalesce((select max_kobo from public.business_payments where business_id = p_business), 2000000),
    'payout', (select jsonb_build_object('bank_name', o.bank_name, 'last4', o.account_last4, 'account_name', o.account_name,
                                          'confirmed_at', o.confirmed_at)
               from public.business_payouts o where o.business_id = p_business));
end;
$$;

-- Saves the account after the server created its Paystack subaccount (server only). The person
-- must own the business and payments must be open for it; returns the subaccount it replaces.
create function public.save_payout(
  p_business uuid, p_user uuid, p_bank_code text, p_bank_name text, p_last4 text, p_account_name text, p_subaccount text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  problem text := private.payments_problem(p_business);
  old text;
begin
  if not exists (select 1 from public.business_members where business_id = p_business and user_id = p_user and role = 'owner') then
    raise exception 'Only the owner sets up getting paid' using errcode = 'insufficient_privilege';
  end if;
  if problem is not null then
    return jsonb_build_object('kind', problem);
  end if;
  select subaccount_code into old from public.business_payouts where business_id = p_business for update;
  insert into public.business_payouts (business_id, bank_code, bank_name, account_last4, account_name, subaccount_code, confirmed_by)
  values (p_business, p_bank_code, p_bank_name, p_last4, p_account_name, p_subaccount, p_user)
  on conflict (business_id) do update
    set bank_code = excluded.bank_code, bank_name = excluded.bank_name, account_last4 = excluded.account_last4,
        account_name = excluded.account_name, subaccount_code = excluded.subaccount_code,
        confirmed_by = excluded.confirmed_by, confirmed_at = now();
  return jsonb_build_object('kind', 'saved', 'replaced', old);
end;
$$;

-- The owner removes the account. Returns its subaccount code so the server can switch it off at Paystack.
create function public.remove_payout(p_business uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  old text;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner removes the account' using errcode = 'insufficient_privilege';
  end if;
  delete from public.business_payouts where business_id = p_business returning subaccount_code into old;
  return jsonb_build_object('kind', case when old is null then 'none' else 'removed' end, 'subaccount', old);
end;
$$;

-- Admin: switch payments on or off for a business, and its maximum per payment.
create function public.admin_set_payments(p_business uuid, p_enabled boolean, p_max_kobo int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  insert into public.business_payments (business_id, enabled, max_kobo, updated_by)
  values (p_business, coalesce(p_enabled, false), coalesce(p_max_kobo, 2000000), auth.uid())
  on conflict (business_id) do update
    set enabled = coalesce(p_enabled, public.business_payments.enabled),
        max_kobo = coalesce(p_max_kobo, public.business_payments.max_kobo),
        updated_at = now(), updated_by = auth.uid();
end;
$$;

-- Admin: payments settings and accounts for every business that has either.
create function public.admin_payment_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_object_agg(x.business_id, jsonb_build_object(
      'enabled', coalesce(p.enabled, false), 'max_kobo', coalesce(p.max_kobo, 2000000),
      'bank_name', o.bank_name, 'last4', o.account_last4, 'account_name', o.account_name))
    from (select business_id from public.business_payments union select business_id from public.business_payouts) x
    left join public.business_payments p on p.business_id = x.business_id
    left join public.business_payouts o on o.business_id = x.business_id), '{}'::jsonb);
end;
$$;

revoke all on function private.payments_problem(uuid) from public, anon, authenticated;
revoke all on function public.payout_state(uuid), public.save_payout(uuid, uuid, text, text, text, text, text), public.remove_payout(uuid),
  public.admin_set_payments(uuid, boolean, int), public.admin_payment_settings() from public, anon;
revoke all on function public.save_payout(uuid, uuid, text, text, text, text, text) from authenticated;
grant execute on function public.payout_state(uuid), public.remove_payout(uuid), public.admin_set_payments(uuid, boolean, int),
  public.admin_payment_settings() to authenticated;
grant execute on function public.save_payout(uuid, uuid, text, text, text, text, text) to service_role;
