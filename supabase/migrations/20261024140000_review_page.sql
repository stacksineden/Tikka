-- /t/[token]/review (PRD A4): whether this claim can be reviewed, and what the page shows
-- around the form. The view token is the secret, so only the server calls it. No phone number.
-- state: 'open' | 'not_redeemed' | 'reviewed' | 'closed'.
create function public.review_page(p_view_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'state', case
      when rv.id is not null then 'reviewed'
      when c.redeemed_at is null then 'not_redeemed'
      when c.redeemed_at < now() - interval '30 days' then 'closed'
      else 'open' end,
    'first_name', c.first_name,
    'shown_name', private.shown_name(c.first_name, l.wa_profile_name),
    'reward', coalesce(r.title, d.bounce_back ->> 'title'),
    'business_slug', b.slug,
    'review', case when rv.id is null then null
      else jsonb_build_object('rating', rv.rating, 'body', rv.body, 'at', rv.created_at, 'status', rv.status) end)
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  left join public.leads l on l.id = c.lead_id
  left join public.cards k on k.id = c.card_id
  left join public.rewards r on r.id = k.reward_id
  left join public.reviews rv on rv.claim_id = c.id
  where c.view_token = p_view_token;
$$;

revoke all on function public.review_page(text) from public, anon, authenticated;
grant execute on function public.review_page(text) to service_role;
