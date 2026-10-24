-- The card image masks the code with the business's own prefix ("BB-•••••"), as real codes read.
create or replace function public.card_image(p_claim uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind', c.kind,
    'tier', coalesce(r.tier, 'common'),
    'reward', coalesce(r.title, d.bounce_back ->> 'title'),
    'action', r.action_text,
    'serial', k.serial,
    'total', d.total_cards,
    'first_name', c.first_name,
    'expires_at', c.expires_at,
    'business_name', b.name,
    'code_prefix', b.code_prefix,
    'business_slug', b.slug,
    'area', b.area,
    'city', b.city,
    'brand_color', b.brand_color,
    'on_brand_color', b.on_brand_color,
    'logo_path', b.logo_path,
    'drop_slug', d.slug,
    'drop_open', d.status = 'published' and now() between d.starts_at and d.ends_at
      and exists (select 1 from public.cards x where x.drop_id = d.id and x.status = 'available'))
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  where c.id = p_claim and not b.suspended;
$$;
