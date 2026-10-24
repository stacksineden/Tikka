-- Tikka admin (PRD C2, TECH_PLAN §16). Every function checks is_admin() first; everyone else gets
-- insufficient_privilege. Admins see business names and money, never claimers' phone numbers.

-- Featured pins: the marketplace's carousel, admin-picked, shown first.
create table public.marketplace_pins (
  drop_id uuid primary key references public.drops (id) on delete cascade,
  headline text not null check (char_length(headline) between 1 and 60),
  blurb text not null default '' check (char_length(blurb) <= 140),
  created_at timestamptz not null default now()
);
alter table public.marketplace_pins enable row level security;
create policy "anyone reads pins" on public.marketplace_pins for select to anon, authenticated using (true);
revoke insert, update, delete on public.marketplace_pins from anon, authenticated;

create function private.admin_only() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Platform numbers and money at a glance. "Today" is West Africa Time.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today_start timestamptz := ((now() at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos';
begin
  perform private.admin_only();
  return jsonb_build_object(
    'businesses', (select count(*) from public.businesses where not is_demo),
    'live_drops', (select count(*) from public.drops d join public.businesses b on b.id = d.business_id
                   where d.status = 'published' and now() between d.starts_at and d.ends_at and not b.is_demo),
    'claims_today', (select count(*) from public.claims where kind = 'drop' and claimed_at >= today_start),
    'redemptions_today', (select count(*) from public.claims where redeemed_at >= today_start),
    'wa_sent_30d', (select count(*) from public.outbound_messages where status in ('sent', 'delivered', 'read') and sent_at > now() - interval '30 days'),
    'wa_cost_30d_usd', (select coalesce(sum(cost_estimate_usd), 0) from public.outbound_messages where status in ('sent', 'delivered', 'read') and sent_at > now() - interval '30 days'),
    'revenue', (select jsonb_build_object(
        'total', coalesce(sum(amount_kobo), 0),
        'drop', coalesce(sum(amount_kobo) filter (where kind = 'drop'), 0),
        'upgrade', coalesce(sum(amount_kobo) filter (where kind = 'upgrade'), 0),
        'pack', coalesce(sum(amount_kobo) filter (where kind = 'pack'), 0))
      from public.payments where status = 'paid'),
    'guarantee_vouchers', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', b.name, 'tier_id', v.tier_id, 'created_at', v.created_at) order by v.created_at desc)
      from public.drop_vouchers v join public.businesses b on b.id = v.business_id where v.source = 'guarantee'), '[]')
  );
end;
$$;

-- Businesses, newest first, searchable by name, page address or city.
create function public.admin_businesses(p_query text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select b.id, b.name, b.slug, b.area, b.city, b.state, b.category, b.verified, b.suspended, b.is_demo, b.created_at,
             coalesce(p.founding_member, false) as founding_member, coalesce(p.guarantee_used, false) as guarantee_used,
             (select count(*) from public.drop_vouchers v where v.business_id = b.id and v.used_by_drop_id is null
                and (v.expires_at is null or v.expires_at > now()))::int as drops_ready,
             (select coalesce(sum(amount_kobo), 0) from public.payments y where y.business_id = b.id and y.status = 'paid')::int as paid_kobo,
             (select count(*) from public.drops d where d.business_id = b.id and d.status in ('published', 'ended_early'))::int as drops
      from public.businesses b left join public.business_private p on p.business_id = b.id
      where q is null or b.name ilike '%' || q || '%' or b.slug ilike '%' || q || '%' or b.city ilike '%' || q || '%'
      order by b.created_at desc
      limit 200
    ) x), '[]');
end;
$$;

-- Verified badge, suspend, founding member: any that are given.
create function public.admin_set_business(p_business uuid, p_verified boolean default null, p_suspended boolean default null, p_founding boolean default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  update public.businesses set verified = coalesce(p_verified, verified), suspended = coalesce(p_suspended, suspended) where id = p_business;
  if p_founding is not null then
    insert into public.business_private (business_id, founding_member) values (p_business, p_founding)
    on conflict (business_id) do update set founding_member = excluded.founding_member;
  end if;
end;
$$;

create function public.admin_payments(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select y.id, y.kind, y.amount_kobo, y.status, y.paystack_reference as reference, coalesce(y.to_tier, (select k.tier_id from public.drop_packs k where k.id = y.pack_id)) as to_tier, y.created_at, b.name as business_name
      from public.payments y join public.businesses b on b.id = y.business_id
      order by y.created_at desc limit least(greatest(p_limit, 1), 500)
    ) x), '[]');
end;
$$;

-- Prices. New prices apply to the next quote; drops and payments already made keep theirs.
create function public.admin_save_tier(p_tier text, p_price_kobo int, p_founding_kobo int, p_guarantee_min int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  if p_tier = 'free' then
    raise exception 'The free first drop has no price' using errcode = 'check_violation';
  end if;
  update public.drop_tiers set price_kobo = p_price_kobo, founding_price_kobo = p_founding_kobo, guarantee_min_redemptions = p_guarantee_min where id = p_tier;
end;
$$;

create function public.admin_save_pack(p_pack text, p_price_kobo int, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  update public.drop_packs set price_kobo = p_price_kobo, active = p_active where id = p_pack;
end;
$$;

-- The moderation queue: open reports, one row per reported drop or review.
create function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.first_at) from (
      select 'drop' as target_type, d.id as target_id, d.title, d.slug as drop_slug, b.name as business_name, b.slug as business_slug,
             null::int as rating, null::text as body, null::text as display_name,
             array_agg(r.reason order by r.created_at) as reasons, count(*)::int as reports, min(r.created_at) as first_at
      from public.reports r join public.drops d on d.id = r.target_id join public.businesses b on b.id = d.business_id
      where r.target_type = 'drop' and r.status = 'open'
      group by d.id, b.id
      union all
      select 'review', v.id, null, null, b.name, b.slug, v.rating, v.body, v.display_name,
             array_agg(r.reason order by r.created_at), count(*)::int, min(r.created_at)
      from public.reports r join public.reviews v on v.id = r.target_id join public.businesses b on b.id = v.business_id
      where r.target_type = 'review' and r.status = 'open'
      group by v.id, b.id
    ) x), '[]');
end;
$$;

-- A reported drop: hide takes it off the marketplace (its link keeps working for people who have
-- it); keep leaves it. Either way the reports are closed.
create function public.decide_drop_report(p_drop uuid, p_hide boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  if p_hide then
    update public.drops set show_in_marketplace = false where id = p_drop;
    delete from public.marketplace_pins where drop_id = p_drop;
  end if;
  update public.reports set status = case when p_hide then 'hidden' else 'kept' end, decided_at = now(), decided_by = auth.uid()
  where target_type = 'drop' and target_id = p_drop and status = 'open';
end;
$$;

-- Drops open now or soon, for hiding and pinning (including ones already hidden).
create function public.admin_drops() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(x order by x.starts_at) from (
      select d.id, d.title, d.slug, d.starts_at, d.ends_at, d.show_in_marketplace as shown, b.name as business_name, b.slug as business_slug,
             case when d.starts_at > now() then 'scheduled' else 'live' end as status,
             p.headline as pin_headline, p.blurb as pin_blurb
      from public.drops d join public.businesses b on b.id = d.business_id
      left join public.marketplace_pins p on p.drop_id = d.id
      where d.status = 'published' and d.ends_at > now() and not b.is_demo
    ) x), '[]');
end;
$$;

create function public.admin_set_drop_shown(p_drop uuid, p_shown boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  update public.drops set show_in_marketplace = p_shown where id = p_drop;
  if not p_shown then
    delete from public.marketplace_pins where drop_id = p_drop;
  end if;
end;
$$;

-- Pin (or re-word) a drop in the featured carousel; a null headline unpins it.
create function public.admin_pin_drop(p_drop uuid, p_headline text, p_blurb text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.admin_only();
  if nullif(trim(coalesce(p_headline, '')), '') is null then
    delete from public.marketplace_pins where drop_id = p_drop;
    return;
  end if;
  insert into public.marketplace_pins (drop_id, headline, blurb) values (p_drop, left(trim(p_headline), 60), left(trim(coalesce(p_blurb, '')), 140))
  on conflict (drop_id) do update set headline = excluded.headline, blurb = excluded.blurb;
end;
$$;

revoke all on function private.admin_only() from public, anon, authenticated;
revoke all on function public.admin_overview(), public.admin_businesses(text), public.admin_set_business(uuid, boolean, boolean, boolean),
  public.admin_payments(int), public.admin_save_tier(text, int, int, int), public.admin_save_pack(text, int, boolean),
  public.admin_reports(), public.decide_drop_report(uuid, boolean), public.admin_drops(), public.admin_set_drop_shown(uuid, boolean),
  public.admin_pin_drop(uuid, text, text)
  from public, anon;
grant execute on function public.admin_overview(), public.admin_businesses(text), public.admin_set_business(uuid, boolean, boolean, boolean),
  public.admin_payments(int), public.admin_save_tier(text, int, int, int), public.admin_save_pack(text, int, boolean),
  public.admin_reports(), public.decide_drop_report(uuid, boolean), public.admin_drops(), public.admin_set_drop_shown(uuid, boolean),
  public.admin_pin_drop(uuid, text, text)
  to authenticated;
