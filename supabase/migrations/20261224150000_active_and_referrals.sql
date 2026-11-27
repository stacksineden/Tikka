-- The pilot's tools (docs: "Tikka pilot: 200 active businesses", 27 Nov 2026).
--
-- 1. Active businesses: a business counts only when all four are true:
--    - its page has at least 3 photos and at least one priced service;
--    - bookings are switched on;
--    - its Tikka link is in its Instagram or WhatsApp bio (Tikka's team checks and ticks it in /admin:
--      businesses.bio_link_at, admin_set_bio_link());
--    - it had at least one real customer booking (booked on its page or with a Tikka, not added by the
--      owner, not cancelled) created in the last 14 days.
--    admin_active_businesses() lists every real business with its four checks.
-- 2. Referrals: each business has a code (usetikka.com/join/<code>). A business that signs up
--    through it is recorded once (record_referral(), within 7 days of creating the business, never
--    its own); when it becomes active, the business that invited it gets a free month of Tikka Plus
--    (30 days and that month's drop, like a paid month), once per business invited
--    (reward_referrals(), run by the daily job).

-- usetikka.com/join/<code> is Tikka's page now, so no business may take "join" as its page link.
insert into public.reserved_slugs (slug) values ('join') on conflict do nothing;

alter table public.businesses
  add column bio_link_at timestamptz,
  add column referral_code text unique check (referral_code ~ '^[a-z0-9]{6}$');

-- ------------------------------------------------------------ the four checks

create function private.active_checks(p_business uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'page', (select count(*) from public.business_portfolio f where f.business_id = b.id and f.kind = 'photo') >= 3
            and exists (select 1 from public.business_services v where v.business_id = b.id and v.price_kind <> 'ask' and v.price_kobo is not null),
    'bookings', exists (select 1 from public.booking_settings s where s.business_id = b.id and s.enabled),
    'bio', b.bio_link_at is not null,
    'booked', exists (select 1 from public.bookings k where k.business_id = b.id and k.source in ('page', 'tikka')
                      and k.status in ('booked', 'arrived') and k.created_at > now() - interval '14 days'),
    'last_booking', (select max(k.created_at) from public.bookings k where k.business_id = b.id and k.source in ('page', 'tikka')
                     and k.status in ('booked', 'arrived')))
  from public.businesses b where b.id = p_business;
$$;

create function private.is_active(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((c ->> 'page')::boolean and (c ->> 'bookings')::boolean and (c ->> 'bio')::boolean and (c ->> 'booked')::boolean, false)
  from private.active_checks(p_business) c;
$$;
revoke all on function private.active_checks(uuid), private.is_active(uuid) from public, anon, authenticated;

-- Tikka admin: every real business with its four checks, active ones first.
create function public.admin_active_businesses() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by (x.j ->> 'active')::boolean desc, x.j ->> 'name')
    from (
      select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'city', b.city, 'created_at', b.created_at,
                                'active', private.is_active(b.id)) || private.active_checks(b.id) as j
      from public.businesses b
      where not b.is_demo and not b.suspended
    ) x), '[]'::jsonb);
end;
$$;

-- Tikka's team ticks (or unticks) "the link is in their bio" after looking.
create function public.admin_set_bio_link(p_business uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.businesses set bio_link_at = case when p_on then coalesce(bio_link_at, now()) end where id = p_business;
end;
$$;

-- ------------------------------------------------------------ referrals

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.businesses (id) on delete cascade,
  referred_id uuid not null unique references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> referred_id)
);
create index referrals_open on public.referrals (created_at) where rewarded_at is null;
alter table public.referrals enable row level security;
-- No direct access: the functions below.

-- The owner's invite code (made the first time it's asked for), and how many they invited.
create function public.my_referral(p_business uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner' using errcode = 'insufficient_privilege';
  end if;
  select referral_code into code from public.businesses where id = p_business for update;
  if code is null then
    loop
      code := lower(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=', ''), 1, 6));
      exit when code ~ '^[a-z0-9]{6}$' and not exists (select 1 from public.businesses where referral_code = code);
    end loop;
    update public.businesses set referral_code = code where id = p_business;
  end if;
  return jsonb_build_object(
    'code', code,
    'joined', (select count(*) from public.referrals r where r.referrer_id = p_business),
    'rewarded', (select count(*) from public.referrals r where r.referrer_id = p_business and r.rewarded_at is not null));
end;
$$;

-- A new business that came through an invite. Quietly does nothing for an unknown code, its own
-- code, a business older than 7 days, or one already recorded.
create function public.record_referral(p_business uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  ref uuid;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner' using errcode = 'insufficient_privilege';
  end if;
  select id into ref from public.businesses where referral_code = lower(trim(coalesce(p_code, ''))) and not is_demo;
  if ref is null or ref = p_business
     or not exists (select 1 from public.businesses where id = p_business and created_at > now() - interval '7 days' and not is_demo) then
    return false;
  end if;
  insert into public.referrals (referrer_id, referred_id) values (ref, p_business) on conflict (referred_id) do nothing;
  return found;
end;
$$;

-- The daily job: each invited business that is now active gives its inviter a free month of Plus
-- (30 days on top of any Plus they have, and that month's drop), once.
create function public.reward_referrals() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_until timestamptz;
  n int := 0;
begin
  for r in select * from public.referrals where rewarded_at is null for update skip locked loop
    if private.is_active(r.referred_id)
       and exists (select 1 from public.businesses where id = r.referrer_id and not suspended and not is_demo) then
      update public.businesses set plus_until = greatest(coalesce(plus_until, now()), now()) + interval '30 days'
      where id = r.referrer_id returning plus_until into v_until;
      insert into public.drop_vouchers (business_id, tier_id, source, expires_at)
      values (r.referrer_id, (private.paid_tier()).id, 'plus', v_until);
      update public.referrals set rewarded_at = now() where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.admin_active_businesses(), public.admin_set_bio_link(uuid, boolean), public.my_referral(uuid), public.record_referral(uuid, text) from public, anon;
grant execute on function public.admin_active_businesses(), public.admin_set_bio_link(uuid, boolean), public.my_referral(uuid), public.record_referral(uuid, text) to authenticated;
revoke all on function public.reward_referrals() from public, anon, authenticated;
grant execute on function public.reward_referrals() to service_role;
