-- ID verification before a business takes customer payments (decided 23 Nov 2026, after Paystack's
-- business review asked how Tikka checks its vendors). The owner adds their ID (and the CAC
-- certificate if the business is registered) on Get paid; Tikka's team reviews it in /admin, and
-- Approve marks the business Verified, switches payments on and sets its maximum per payment
-- (suggested from its own prices). Registration never blocks payments.
--
-- Businesses that already took payments keep them until 8 Dec 2026, 00:00 WAT ("by 7 December");
-- after that, new deposits and pay links pause until they're approved. Paused deposits simply don't
-- apply (private.deposit_for() returns 0), so customers still book and pay at the shop.
--
-- Documents live in the private `kyc` bucket, in the owner's own folder; only Tikka admins can read
-- them. The table is reached only through the functions below.

-- ------------------------------------------------------------------ documents

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('kyc', 'kyc', false, 2 * 1024 * 1024, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "owners upload their ID" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and private.may_upload(name));
create policy "Tikka admins read IDs" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and private.is_admin());

-- ------------------------------------------------------------------ the details

create table public.business_kyc (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  id_type text not null check (id_type in ('nin', 'drivers_licence', 'passport', 'voters_card')),
  id_name varchar(120) not null check (trim(id_name) <> ''),
  id_photo_path text not null check (id_photo_path ~ '^[0-9a-f-]{36}/kyc/[A-Za-z0-9._-]+$'),
  registered text not null check (registered in ('bn', 'rc', 'no')),
  cac_number varchar(20),
  cac_photo_path text check (cac_photo_path ~ '^[0-9a-f-]{36}/kyc/[A-Za-z0-9._-]+$'),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'again')),
  review_note varchar(200),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  check ((registered = 'no' and cac_number is null and cac_photo_path is null)
      or (registered <> 'no' and cac_number is not null and trim(cac_number) <> '' and cac_photo_path is not null))
);
alter table public.business_kyc enable row level security;
revoke all on public.business_kyc from anon, authenticated;

-- The businesses that took payments before this: until when they may keep doing so without an ID.
alter table public.business_payments add column kyc_grace_until timestamptz;
update public.business_payments set kyc_grace_until = '2026-12-08 00:00:00+01' where enabled;

-- ID approved, or still inside the grace period.
create function private.kyc_ok(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_kyc where business_id = p_business and status = 'approved')
      or exists (select 1 from public.business_payments where business_id = p_business and kyc_grace_until > now());
$$;

create or replace function private.payments_problem(p_business uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when b.id is null then 'not_found'
    when b.is_demo then 'demo'
    when b.suspended then 'suspended'
    when not coalesce(p.enabled, false) then 'not_enabled'
    when not b.verified then 'not_verified'
    when not private.kyc_ok(b.id) then 'needs_id'
  end
  from (select p_business as id) x
  left join public.businesses b on b.id = x.id
  left join public.business_payments p on p.business_id = x.id;
$$;

-- The owner's Get paid screen, now with where their ID check stands (never the documents).
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
               from public.business_payouts o where o.business_id = p_business),
    'kyc', (select jsonb_build_object('status', k.status, 'note', k.review_note, 'id_type', k.id_type,
                                       'registered', k.registered, 'submitted_at', k.submitted_at)
            from public.business_kyc k where k.business_id = p_business),
    'grace_until', (select kyc_grace_until from public.business_payments where business_id = p_business and kyc_grace_until > now()));
end;
$$;

-- The owner sends (or sends again) their ID. The files must already be in their own `kyc` folder.
create function public.submit_kyc(
  p_business uuid, p_id_type text, p_id_name text, p_id_photo text, p_registered text, p_cac_number text, p_cac_photo text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me text := (select auth.uid())::text;
  b public.businesses%rowtype;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner verifies the business' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.businesses where id = p_business;
  if b.is_demo then return jsonb_build_object('kind', 'demo'); end if;
  if b.suspended then return jsonb_build_object('kind', 'suspended'); end if;
  if exists (select 1 from public.business_kyc where business_id = p_business and status = 'approved') then
    return jsonb_build_object('kind', 'already_verified');
  end if;
  if split_part(p_id_photo, '/', 1) <> me or (p_cac_photo is not null and split_part(p_cac_photo, '/', 1) <> me)
     or not exists (select 1 from storage.objects where bucket_id = 'kyc' and name = p_id_photo)
     or (p_cac_photo is not null and not exists (select 1 from storage.objects where bucket_id = 'kyc' and name = p_cac_photo)) then
    return jsonb_build_object('kind', 'missing_file');
  end if;
  insert into public.business_kyc (business_id, id_type, id_name, id_photo_path, registered, cac_number, cac_photo_path, status,
                                   review_note, submitted_by, submitted_at, reviewed_by, reviewed_at)
  values (p_business, p_id_type, trim(p_id_name), p_id_photo, p_registered,
          case when p_registered = 'no' then null else upper(trim(p_cac_number)) end,
          case when p_registered = 'no' then null else p_cac_photo end,
          'submitted', null, auth.uid(), now(), null, null)
  on conflict (business_id) do update
    set id_type = excluded.id_type, id_name = excluded.id_name, id_photo_path = excluded.id_photo_path,
        registered = excluded.registered, cac_number = excluded.cac_number, cac_photo_path = excluded.cac_photo_path,
        status = 'submitted', review_note = null, submitted_by = excluded.submitted_by, submitted_at = now(),
        reviewed_by = null, reviewed_at = null;
  return jsonb_build_object('kind', 'submitted');
end;
$$;

-- The bank account can be added once the ID is sent, before approval (Tikka checks the bank's
-- account name against the ID at review). No money moves until payments are switched on.
create or replace function public.save_payout(
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
  if problem is not null and not (
    problem in ('not_enabled', 'not_verified', 'needs_id')
    and exists (select 1 from public.business_kyc where business_id = p_business and status in ('submitted', 'approved'))
  ) then
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

-- A service's deposit as the owner set it, before any payment checks or maximum (for the review's
-- suggested limit). Mirrors private.deposit_for().
create function private.deposit_wanted(p_business uuid, p_service uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  v public.business_services%rowtype;
  d int := 0;
  priced boolean;
begin
  select * into s from public.booking_settings where business_id = p_business;
  select * into v from public.business_services where id = p_service and business_id = p_business;
  if v.id is null then return 0; end if;
  priced := v.price_kind = 'fixed' and v.price_kobo is not null;
  if v.deposit_mode = 'fixed' then d := coalesce(v.deposit_kobo, 0);
  elsif v.deposit_mode = 'full' then d := case when priced then v.price_kobo else 0 end;
  elsif v.deposit_mode = 'none' or s.business_id is null then d := 0;
  elsif s.deposit_mode = 'percent' then d := case when priced then round(v.price_kobo * s.deposit_percent / 100.0)::int else coalesce(s.deposit_fixed_kobo, 0) end;
  elsif s.deposit_mode = 'fixed' then d := coalesce(s.deposit_fixed_kobo, 0);
  end if;
  if priced then d := least(d, v.price_kobo); end if;
  return greatest(d, 0);
end;
$$;

-- ------------------------------------------------------------------ Tikka admin

-- Everyone with an ID check, and every business taking payments without one.
create function public.admin_kyc_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'business_id', b.id, 'name', b.name, 'slug', b.slug, 'category', b.category, 'area', b.area, 'city', b.city,
      'created_at', b.created_at, 'verified', b.verified, 'actions', b.actions,
      'enabled', coalesce(p.enabled, false), 'max_kobo', coalesce(p.max_kobo, 2000000), 'grace_until', p.kyc_grace_until,
      'account_name', o.account_name, 'bank_name', o.bank_name, 'last4', o.account_last4,
      'kyc', case when k.business_id is null then null else jsonb_build_object(
        'status', k.status, 'note', k.review_note, 'id_type', k.id_type, 'id_name', k.id_name, 'id_photo', k.id_photo_path,
        'registered', k.registered, 'cac_number', k.cac_number, 'cac_photo', k.cac_photo_path,
        'submitted_at', k.submitted_at, 'reviewed_at', k.reviewed_at) end,
      'top_service', (select jsonb_build_object('name', v.name, 'price_kobo', v.price_kobo) from public.business_services v
                      where v.business_id = b.id and v.price_kobo is not null order by v.price_kobo desc limit 1),
      'top_deposit_kobo', (select max(private.deposit_wanted(b.id, v.id)) from public.business_services v where v.business_id = b.id))
      order by (k.status = 'submitted') desc nulls last, k.submitted_at desc nulls last, b.name)
    from public.businesses b
    left join public.business_kyc k on k.business_id = b.id
    left join public.business_payments p on p.business_id = b.id
    left join public.business_payouts o on o.business_id = b.id
    where (k.business_id is not null or coalesce(p.enabled, false)) and not b.is_demo), '[]'::jsonb);
end;
$$;

-- Approve (Verified, payments on, its maximum) or ask again with a reason the owner sees.
create function public.admin_review_kyc(p_business uuid, p_approve boolean, p_note text, p_max_kobo int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  if not exists (select 1 from public.business_kyc where business_id = p_business) then
    return jsonb_build_object('kind', 'nothing_to_review');
  end if;
  if p_approve then
    if p_max_kobo is null or p_max_kobo < 100000 or p_max_kobo > 100000000 then
      return jsonb_build_object('kind', 'bad_limit');
    end if;
    update public.business_kyc set status = 'approved', review_note = null, reviewed_by = auth.uid(), reviewed_at = now()
    where business_id = p_business;
    update public.businesses set verified = true where id = p_business;
    insert into public.business_payments (business_id, enabled, max_kobo, updated_by, kyc_grace_until)
    values (p_business, true, p_max_kobo, auth.uid(), null)
    on conflict (business_id) do update
      set enabled = true, max_kobo = excluded.max_kobo, updated_at = now(), updated_by = auth.uid(), kyc_grace_until = null;
    return jsonb_build_object('kind', 'approved');
  end if;
  if p_note is null or trim(p_note) = '' or char_length(trim(p_note)) > 200 then
    return jsonb_build_object('kind', 'needs_note');
  end if;
  update public.business_kyc set status = 'again', review_note = trim(p_note), reviewed_by = auth.uid(), reviewed_at = now()
  where business_id = p_business;
  return jsonb_build_object('kind', 'asked_again');
end;
$$;

revoke all on function private.kyc_ok(uuid), private.deposit_wanted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_kyc(uuid, text, text, text, text, text, text), public.admin_kyc_queue(),
  public.admin_review_kyc(uuid, boolean, text, int) from public, anon;
grant execute on function public.submit_kyc(uuid, text, text, text, text, text, text), public.admin_kyc_queue(),
  public.admin_review_kyc(uuid, boolean, text, int) to authenticated;
