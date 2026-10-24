-- The marketplace (PRD A5, TECH_PLAN §13): every drop that's open now or opens soon, with what the
-- tiles and rankings need. Counts only: never a claimer, never the deck's order (rule 1). Demo
-- businesses, suspended businesses and drops kept off the marketplace don't show.
create function public.marketplace_drops() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t order by t.published_at desc), '[]')
  from (
    select
      d.id, d.slug as drop_slug, d.title as drop_name,
      b.name as business_name, b.slug as business_slug, b.brand_color, b.on_brand_color, b.category,
      b.area, b.city, b.state, b.rating_avg, b.logo_path,
      d.total_cards as total,
      case when d.starts_at > now() then 'scheduled' else 'live' end as status,
      d.starts_at, d.ends_at, coalesce(d.published_at, d.starts_at) as published_at,
      (select count(*) from public.cards k where k.drop_id = d.id and k.status = 'available')::int as left_count,
      (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'legendary')::int as legendary,
      (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'rare')::int as rare,
      (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = d.id and r.tier = 'common')::int as thank_you,
      (select count(*) from public.cards k join public.rewards r on r.id = k.reward_id
        where k.drop_id = d.id and k.status = 'available' and r.tier = 'legendary')::int as legendary_left,
      (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop')::int as claimed,
      (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop' and c.claimed_at > now() - interval '1 hour')::int as claims_last_hour,
      (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop' and c.claimed_at > now() - interval '1 day')::int as claims_24h,
      public.notify_waiting(b.id, d.id) as waiting
    from public.drops d
    join public.businesses b on b.id = d.business_id
    where d.status = 'published' and d.show_in_marketplace and d.ends_at > now()
      and not b.suspended and not b.is_demo
  ) t;
$$;

grant execute on function public.marketplace_drops() to anon, authenticated;

-- "Report this drop" (PRD A5): into Tikka's admin queue (C2), once per visitor per drop.
create function public.report_drop(p_drop uuid, p_reason text, p_visitor_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.drops where id = p_drop and status in ('published', 'ended_early')) then
    return false;
  end if;
  if not exists (
    select 1 from public.reports where target_type = 'drop' and target_id = p_drop and reporter_visitor_hash = p_visitor_hash
  ) then
    insert into public.reports (target_type, target_id, reason, reporter_visitor_hash)
    values ('drop', p_drop, left(coalesce(nullif(trim(p_reason), ''), 'No reason given'), 200), p_visitor_hash);
  end if;
  return true;
end;
$$;

revoke all on function public.report_drop(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_drop(uuid, text, text) to service_role;
