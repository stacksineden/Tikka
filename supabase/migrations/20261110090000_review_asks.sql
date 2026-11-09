-- "Ask for a review" in Leads (page-claim mode). Tikka can't send the WhatsApp thank-you to a
-- number typed on the page (phone_confirmed = false), so the owner asks from their own WhatsApp
-- instead. This lists, for the owner only, the claims that can still be reviewed: redeemed in the
-- last 30 days, not reviewed yet, number not confirmed. The view token is the review link's key.
-- Confirmed claims never appear: Tikka's own thank-you covers them.
create function public.review_asks(p_business uuid)
returns table (claim_id uuid, view_token text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees leads' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, c.view_token
    from public.claims c
    join public.drops d on d.id = c.drop_id
    where d.business_id = p_business
      and c.kind = 'drop'
      and not c.phone_confirmed
      and c.redeemed_at is not null
      and c.redeemed_at >= now() - interval '30 days'
      and not exists (select 1 from public.reviews rv where rv.claim_id = c.id);
end;
$$;
revoke all on function public.review_asks(uuid) from public, anon;
grant execute on function public.review_asks(uuid) to authenticated;
