-- The next-visit Tikka on the card page. Redeeming a drop's Tikka already creates the next-visit
-- Tikka (kind 'bounce_back', parent_claim_id = the used one), but card_json never said so, so a
-- customer who claimed by typing their number (no WhatsApp yet) had no way to find it. Now the
-- used card carries it: its link (view token), reward, use-by and whether it's used. Same person,
-- same server-only path as before (claim_by_view_token, claim_result); never a phone number.

create or replace function private.card_json(p_claim uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'view_token', c.view_token,
    'kind', c.kind,
    'drop_id', c.drop_id,
    'tier', coalesce(r.tier, 'common'),
    'reward', coalesce(r.title, d.bounce_back ->> 'title'),
    'action', r.action_text,
    'terms', r.terms,
    'code', c.code,
    'serial', k.serial,
    'total', d.total_cards,
    'first_name', c.first_name,
    'expires_at', c.expires_at,
    'redeemed_at', c.redeemed_at,
    'planned_visit_date', c.planned_visit_date,
    'planned_visit_part', c.planned_visit_part,
    'valid_weekdays', to_jsonb(d.valid_weekdays),
    'revealed_at', c.revealed_at,
    'drop_slug', d.slug,
    'business_name', b.name,
    'business_slug', b.slug,
    'phone_confirmed', c.phone_confirmed,
    'counter_check', (c.counter_check and c.counter_checked_at is null),
    'next_visit', (
      select jsonb_build_object(
        'view_token', n.view_token,
        'reward', coalesce(d.bounce_back ->> 'title', 'Your next visit'),
        'expires_at', n.expires_at,
        'redeemed_at', n.redeemed_at)
      from public.claims n
      where n.parent_claim_id = c.id and n.kind = 'bounce_back'))
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim;
$$;

revoke all on function private.card_json(uuid) from public, anon, authenticated;
