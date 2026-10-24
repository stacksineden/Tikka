-- WhatsApp (TECH_PLAN §5). The webhook claims, subscribes and stops through the functions already
-- in place; these add what its replies and the card link need.

-- The card link's first open plays the hold-and-flip; after that it shows the card.
alter table public.claims add column revealed_at timestamptz;

create or replace function private.card_json(p_claim uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'view_token', c.view_token,
    'kind', c.kind,
    'drop_id', c.drop_id,
    'tier', coalesce(r.tier, 'common'),
    'reward', coalesce(r.title, d.bounce_back ->> 'title'),
    'action', r.action_text,
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
    'business_slug', b.slug)
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim;
$$;

-- True the first time a card is opened (in the browser right after claiming, or from WhatsApp).
create function public.reveal_card(p_view_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.claims set revealed_at = now() where view_token = p_view_token and revealed_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- What a reply about a claim code needs: whose drop it was. Nothing about the claimer.
create function public.intent_context(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('business_name', b.name, 'business_slug', b.slug, 'drop_slug', d.slug, 'drop_title', d.title)
  from public.claim_intents i join public.drops d on d.id = i.drop_id join public.businesses b on b.id = d.business_id
  where i.token = upper(trim(p_token));
$$;

revoke all on function public.reveal_card(text), public.intent_context(text) from public, anon, authenticated;
grant execute on function public.reveal_card(text), public.intent_context(text) to service_role;
