-- The owner's daily summary (PRD A3, TECH_PLAN §5): at 8:00 WAT, one row per business with the
-- summary on and a number to send to (the owner's alert number, else the Chat on WhatsApp button's).
-- Counts only, plus the last finished drop for the seasonal "Run it again" line, which the app
-- words. Server only: it returns the owner's own number.
create function public.daily_summary_rows() returns table (
  business_id uuid, business_name text, phone text,
  new_claims int, planning_tomorrow int, expiring_soon int,
  last_drop_id uuid, last_drop_title text, last_drop_customers int
)
language sql stable security definer set search_path = '' as $$
  with biz as (
    select b.id, b.name,
           coalesce(p.owner_whatsapp,
                    (select a ->> 'value' from jsonb_array_elements(coalesce(b.actions, '[]')) a where a ->> 'kind' = 'whatsapp' limit 1)) as phone
    from public.businesses b
    left join public.business_private p on p.business_id = b.id
    where not b.suspended and not b.is_demo and coalesce(p.daily_summary, true)
  ), tomorrow as (
    select ((now() at time zone 'Africa/Lagos')::date + 1) as d
  )
  select z.id, z.name, z.phone,
    (select count(*) from public.claims c join public.drops d on d.id = c.drop_id
      where d.business_id = z.id and c.kind = 'drop' and c.claimed_at > now() - interval '1 day')::int,
    (select count(*) from public.claims c join public.drops d on d.id = c.drop_id, tomorrow t
      where d.business_id = z.id and c.kind = 'drop' and c.redeemed_at is null and c.planned_visit_date = t.d)::int,
    (select count(*) from public.claims c join public.drops d on d.id = c.drop_id
      where d.business_id = z.id and c.kind = 'drop' and c.redeemed_at is null
        and c.expires_at > now() and c.expires_at <= now() + interval '3 days')::int,
    ld.id, ld.title, ld.customers
  from biz z
  left join lateral (
    select d.id, d.title,
           (select count(*) from public.claims c where c.drop_id = d.id and c.kind = 'drop' and c.redeemed_at is not null)::int as customers
    from public.drops d
    where d.business_id = z.id and d.status in ('published', 'ended_early')
      and (d.status = 'ended_early' or d.ends_at < now()
           or not exists (select 1 from public.cards k where k.drop_id = d.id and k.status = 'available'))
    order by d.ends_at desc
    limit 1
  ) ld on true
  where z.phone ~ '^\+[1-9][0-9]{7,14}$';
$$;

revoke all on function public.daily_summary_rows() from public, anon, authenticated;
grant execute on function public.daily_summary_rows() to service_role;
