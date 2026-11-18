-- Get paid: remember whether each account's Paystack subaccount was made with a test or a live key.
-- Test and live are separate worlds at Paystack (a test subaccount doesn't exist in live mode), and
-- local development shares this database with the live site. The app only treats an account as
-- set up when its mode matches the key it runs with; otherwise the owner adds it again.

alter table public.business_payouts
  add column paystack_mode text not null default 'live' check (paystack_mode in ('test', 'live'));
-- Every account saved before this was made while testing (18 Nov 2026), with the test key.
update public.business_payouts set paystack_mode = 'test';

create or replace function public.payout_state(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sets up getting paid' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'problem', private.payments_problem(p_business),
    'max_kobo', coalesce((select max_kobo from public.business_payments where business_id = p_business), 2000000),
    'payout', (select jsonb_build_object('bank_name', o.bank_name, 'last4', o.account_last4, 'account_name', o.account_name,
                                          'confirmed_at', o.confirmed_at, 'mode', o.paystack_mode)
               from public.business_payouts o where o.business_id = p_business));
end;
$$;

drop function public.save_payout(uuid, uuid, text, text, text, text, text);
create function public.save_payout(
  p_business uuid, p_user uuid, p_bank_code text, p_bank_name text, p_last4 text, p_account_name text, p_subaccount text, p_mode text
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
  insert into public.business_payouts (business_id, bank_code, bank_name, account_last4, account_name, subaccount_code, confirmed_by, paystack_mode)
  values (p_business, p_bank_code, p_bank_name, p_last4, p_account_name, p_subaccount, p_user, p_mode)
  on conflict (business_id) do update
    set bank_code = excluded.bank_code, bank_name = excluded.bank_name, account_last4 = excluded.account_last4,
        account_name = excluded.account_name, subaccount_code = excluded.subaccount_code,
        confirmed_by = excluded.confirmed_by, confirmed_at = now(), paystack_mode = excluded.paystack_mode;
  return jsonb_build_object('kind', 'saved', 'replaced', old);
end;
$$;
revoke all on function public.save_payout(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_payout(uuid, uuid, text, text, text, text, text, text) to service_role;

create or replace function public.admin_payment_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_object_agg(x.business_id, jsonb_build_object(
      'enabled', coalesce(p.enabled, false), 'max_kobo', coalesce(p.max_kobo, 2000000),
      'bank_name', o.bank_name, 'last4', o.account_last4, 'account_name', o.account_name, 'mode', o.paystack_mode))
    from (select business_id from public.business_payments union select business_id from public.business_payouts) x
    left join public.business_payments p on p.business_id = x.business_id
    left join public.business_payouts o on o.business_id = x.business_id), '{}'::jsonb);
end;
$$;
