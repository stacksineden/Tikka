-- Pricing, drops without paying, and payments (TECH_PLAN §3, §11). Rule 11: the server prices
-- every drop; these tables are read by the pricing functions and written only by them (and the
-- Paystack webhook through the service role). The UI never says "voucher" (lib/vouchers.ts).

create table public.drop_tiers (
  id text primary key,
  label text not null,
  max_cards int not null check (max_cards > 0),
  price_kobo int not null check (price_kobo >= 0),
  founding_price_kobo int not null check (founding_price_kobo >= 0),
  guarantee_min_redemptions int check (guarantee_min_redemptions > 0),
  sort int not null default 0
);

insert into public.drop_tiers (id, label, max_cards, price_kobo, founding_price_kobo, guarantee_min_redemptions, sort) values
  ('free', 'First drop', 200, 0, 0, null, 0),
  ('small', 'Small drop', 300, 500000, 500000, 5, 1),
  ('medium', 'Medium drop', 1000, 1000000, 1000000, 10, 2),
  ('large', 'Large drop', 3000, 2000000, 2000000, 20, 3);

create table public.drop_packs (
  id text primary key,
  tier_id text not null references public.drop_tiers (id),
  drops int not null check (drops > 0),
  price_kobo int not null check (price_kobo > 0),
  active boolean not null default true
);

insert into public.drop_packs (id, tier_id, drops, price_kobo) values
  ('small3', 'small', 3, 1200000),
  ('medium3', 'medium', 3, 2500000);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('drop', 'upgrade', 'pack')),
  drop_id uuid,
  pack_id text references public.drop_packs (id),
  from_tier text references public.drop_tiers (id),
  to_tier text references public.drop_tiers (id),
  extra_cards int check (extra_cards > 0),
  amount_kobo int not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'abandoned')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_business on public.payments (business_id, created_at desc);
create index payments_pending on public.payments (created_at) where status = 'pending';

create table public.drop_vouchers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  tier_id text not null references public.drop_tiers (id),
  source text not null check (source in ('signup', 'pack', 'guarantee', 'admin')),
  pack_payment_id uuid references public.payments (id),
  used_by_drop_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  check ((used_by_drop_id is null) = (used_at is null))
);
create index drop_vouchers_usable on public.drop_vouchers (business_id) where used_by_drop_id is null;
-- One free first drop per business, ever.
create unique index one_signup_voucher on public.drop_vouchers (business_id) where source = 'signup';

-- ------------------------------------------------------------------ RLS

alter table public.drop_tiers enable row level security;
alter table public.drop_packs enable row level security;
alter table public.payments enable row level security;
alter table public.drop_vouchers enable row level security;

-- Prices are public (the landing page and the builder show them).
create policy "anyone reads tiers" on public.drop_tiers for select to anon, authenticated using (true);
create policy "anyone reads active packs" on public.drop_packs for select to anon, authenticated using (active or private.is_admin());

-- Money is the owner's business only: staff and strangers see nothing.
create policy "owners read payments" on public.payments for select to authenticated
  using (private.is_owner(business_id) or private.is_admin());
create policy "owners read their free drops" on public.drop_vouchers for select to authenticated
  using (private.is_owner(business_id) or private.is_admin());

-- No direct writes for anyone signed in or anonymous: pricing, publishing and payment functions
-- (and the service role) do every write.
revoke insert, update, delete on public.drop_tiers, public.drop_packs, public.payments, public.drop_vouchers from anon, authenticated;

-- --------------------------------------- the free first drop at sign-up

-- create_business now also gives the business its free first drop (one 'signup' voucher).
create or replace function public.create_business(
  p_name text, p_slug text, p_code_prefix text, p_category text, p_state text, p_city text, p_area text,
  p_brand_color text, p_on_brand_color text, p_actions jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.business_members m where m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'You already have a business' using errcode = 'unique_violation';
  end if;
  insert into public.businesses (name, slug, code_prefix, category, state, city, area, brand_color, on_brand_color, actions)
  values (trim(p_name), lower(p_slug), upper(p_code_prefix), p_category, p_state, p_city, p_area, p_brand_color, p_on_brand_color, p_actions)
  returning id into b;
  insert into public.business_members (business_id, user_id, role) values (b, auth.uid(), 'owner');
  insert into public.business_private (business_id) values (b);
  insert into public.drop_vouchers (business_id, tier_id, source) values (b, 'free', 'signup');
  return b;
end;
$$;
