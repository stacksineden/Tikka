-- The drop dashboard and report (PRD B6, TECH_PLAN §12). Owners only: the numbers come from
-- link activity, claims and the deck, and none of it carries a phone number. "Unique" views are
-- counted by visitor hash, which is salted daily, so someone who comes back on another day counts
-- again (the closest the privacy rules allow).

create function public.get_drop_stats(p_drop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  claimed int;
  last_claim timestamptz;
begin
  select * into d from public.drops where id = p_drop;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner sees drop numbers' using errcode = 'insufficient_privilege';
  end if;
  select count(*), max(claimed_at) into claimed, last_claim from public.claims where drop_id = p_drop and kind = 'drop';
  return jsonb_build_object(
    'unique_views', (select count(distinct visitor_hash) from public.events where drop_id = p_drop and type = 'view'),
    'view_total', (select count(*) from public.events where drop_id = p_drop and type = 'view'),
    'tore', (select count(distinct visitor_hash) from public.events where drop_id = p_drop and type = 'unwrap'),
    'tapped', (select count(distinct visitor_hash) from public.events where drop_id = p_drop and type = 'claim_tap'),
    'continued', (select count(distinct visitor_hash) from public.events where drop_id = p_drop and type = 'claim_continue'),
    'claimed', claimed,
    'redeemed', (select count(*) from public.claims where drop_id = p_drop and kind = 'drop' and redeemed_at is not null),
    -- Leads the owner messaged after they claimed this drop.
    'followed_up', (select count(distinct c.lead_id) from public.claims c join public.leads l on l.id = c.lead_id
                    where c.drop_id = p_drop and c.kind = 'drop' and l.last_followup_at >= c.claimed_at),
    'new_claimers', (select count(*) from public.claims where drop_id = p_drop and kind = 'drop' and is_new_lead),
    'notify_waiting', public.notify_waiting(d.business_id, d.id),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'views', views, 'claims', claims) order by views desc, claims desc)
      from (
        select source, sum(v)::int as views, sum(c)::int as claims from (
          select coalesce(e.source, 'direct') as source, 1 as v, 0 as c from public.events e where e.drop_id = p_drop and e.type = 'view'
          union all
          select c.source, 0, 1 from public.claims c where c.drop_id = p_drop and c.kind = 'drop'
        ) x group by source
      ) s), '[]'),
    'qr_by_poster', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'views', views, 'claims', claims) order by views desc)
      from (
        select p.label,
               (select count(*) from public.events e where e.drop_id = p_drop and e.type = 'view' and e.poster_id = p.id)::int as views,
               (select count(*) from public.claims c where c.drop_id = p_drop and c.kind = 'drop' and c.poster_id = p.id)::int as claims
        from public.posters p where p.business_id = d.business_id
      ) q where views > 0 or claims > 0), '[]'),
    -- What's left of each reward: counts only, never the order (rule 1).
    'rewards_left', coalesce((
      select jsonb_agg(jsonb_build_object('tier', r.tier, 'title', r.title, 'total', r.quantity,
               'left', (select count(*) from public.cards k where k.reward_id = r.id and k.status = 'available'))
             order by case r.tier when 'legendary' then 0 when 'rare' then 1 else 2 end, r.title)
      from public.rewards r where r.drop_id = p_drop and r.quantity > 0), '[]'),
    'views_after_sellout', case when claimed >= d.total_cards and last_claim is not null
      then (select count(*) from public.events e where e.drop_id = p_drop and e.type = 'view' and e.created_at > last_claim) else 0 end
  );
end;
$$;

-- The drop report's inputs: each claim's reward and bill (no names or numbers), and what the
-- drop cost in Tikka fees.
create function public.get_drop_report_data(p_drop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
  v public.drop_vouchers%rowtype;
begin
  select * into d from public.drops where id = p_drop;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner sees the report' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.drop_vouchers where id = d.voucher_id;
  return jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', c.kind,
        'redeemed', c.redeemed_at is not null,
        'bill_kobo', c.bill_amount_kobo,
        'customer_status', c.customer_status,
        'reward_kind', coalesce(r.kind, d.bounce_back ->> 'kind', 'percent_off'),
        'reward_value', coalesce(r.value, (d.bounce_back ->> 'value')::numeric),
        'cost_kobo', r.cost_kobo))
      from public.claims c
      left join public.cards k on k.id = c.card_id
      left join public.rewards r on r.id = k.reward_id
      where c.drop_id = p_drop), '[]'),
    'fee', case
      when d.paid_with = 'payment' then jsonb_build_object('kind', 'paid', 'amount_kobo',
        (select coalesce(sum(p.amount_kobo), 0) from public.payments p where p.drop_id = p_drop and p.status = 'paid'))
      when v.source = 'pack' then jsonb_build_object('kind', 'pack')
      when v.source = 'guarantee' then jsonb_build_object('kind', 'earned')
      when v.source = 'admin' then jsonb_build_object('kind', 'gift')
      when v.source = 'paid' then jsonb_build_object('kind', 'paid', 'amount_kobo', (select t.price_kobo from public.drop_tiers t where t.id = v.tier_id))
      else jsonb_build_object('kind', 'free')
    end
  );
end;
$$;

revoke all on function public.get_drop_stats(uuid), public.get_drop_report_data(uuid) from public, anon;
grant execute on function public.get_drop_stats(uuid), public.get_drop_report_data(uuid) to authenticated;

-- The live feed: the dashboard listens for new link activity. Realtime applies the events
-- policy, so a business's team hears only its own drops.
alter publication supabase_realtime add table public.events;
