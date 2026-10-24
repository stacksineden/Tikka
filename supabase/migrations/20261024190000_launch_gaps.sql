-- The last pieces real accounts still read from the demo store.

-- "When will you come in?" on the card link (PRD A1). The view token is the key, so only the
-- server calls it. A day from today (WAT) to the Tikka's last day, on the drop's days if it has
-- some (1 = Monday … 7 = Sunday); never for a used or expired Tikka. Returns the card, or null.
create function public.set_visit_plan(p_view_token text, p_date date, p_part text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims%rowtype;
  d public.drops%rowtype;
  today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into c from public.claims where view_token = p_view_token for update;
  if not found or c.redeemed_at is not null or c.expires_at < now() then
    return null;
  end if;
  if p_part not in ('morning', 'afternoon', 'evening') or p_date < today or p_date > (c.expires_at at time zone 'Africa/Lagos')::date then
    return null;
  end if;
  select * into d from public.drops where id = c.drop_id;
  if d.valid_weekdays is not null and cardinality(d.valid_weekdays) > 0 and not (extract(isodow from p_date)::int = any (d.valid_weekdays)) then
    return null;
  end if;
  update public.claims set planned_visit_date = p_date, planned_visit_part = p_part where id = c.id;
  return private.card_json(c.id);
end;
$$;

-- The dashboard's "Adaeze just claimed a Rare Tikka" prompt: the owner's newest claims since a
-- time, with the number so they can say welcome on WhatsApp. Owners only (rule 4).
create function public.new_claims_since(p_business uuid, p_since timestamptz)
returns table (view_token text, first_name text, tier text, reward text, claimed_at timestamptz, expires_at timestamptz, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees who claimed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.view_token, c.first_name, coalesce(r.tier, 'common'), coalesce(r.title, d.bounce_back ->> 'title'), c.claimed_at, c.expires_at, c.phone
    from public.claims c
    join public.drops d on d.id = c.drop_id
    left join public.cards k on k.id = c.card_id
    left join public.rewards r on r.id = k.reward_id
    where d.business_id = p_business and c.kind = 'drop' and c.claimed_at > p_since
    order by c.claimed_at desc
    limit 5;
end;
$$;

-- The landing page's live numbers (PRD B1): real businesses only, counts and the last day's
-- claims for the ticker (business, city, tier; never who claimed).
create function public.platform_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  with real_b as (select id, name, city from public.businesses where not is_demo and not suspended),
  real_d as (select d.* from public.drops d join real_b b on b.id = d.business_id where d.status in ('published', 'ended_early')),
  real_c as (
    select c.claimed_at, c.redeemed_at, c.bill_amount_kobo, coalesce(r.tier, 'common') as tier, b.name, b.city, c.id
    from public.claims c
    join real_d d on d.id = c.drop_id
    join real_b b on b.id = d.business_id
    left join public.cards k on k.id = c.card_id
    left join public.rewards r on r.id = k.reward_id
    where c.kind = 'drop'
  )
  select jsonb_build_object(
    'businesses', (select count(*) from real_b),
    'drops_live', (select count(*) from real_d where status = 'published' and now() between starts_at and ends_at),
    'tikkas_claimed', (select count(*) from real_c),
    'recorded_sales_kobo', (select coalesce(sum(bill_amount_kobo), 0) from real_c where redeemed_at is not null),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'city', x.city, 'tier', x.tier, 'business_name', x.name, 'at', x.claimed_at) order by x.claimed_at desc)
      from (select * from real_c where claimed_at > now() - interval '1 day' order by claimed_at desc limit 12) x), '[]')
  );
$$;

revoke all on function public.set_visit_plan(text, date, text) from public, anon, authenticated;
grant execute on function public.set_visit_plan(text, date, text) to service_role;
revoke all on function public.new_claims_since(uuid, timestamptz) from public, anon;
grant execute on function public.new_claims_since(uuid, timestamptz) to authenticated;
grant execute on function public.platform_stats() to anon, authenticated;
