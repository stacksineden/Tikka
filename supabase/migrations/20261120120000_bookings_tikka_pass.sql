-- A booking made with a Tikka keeps the Tikka in view (docs/BOOKINGS.md journey 11):
-- 1. The booking pass names the Tikka's reward and links back to its card (the code and QR the
--    counter needs). Still never the phone number.
-- 2. Redeeming the Tikka at the counter marks its booking Arrived, so staff don't do it twice.

create or replace function public.booking_pass(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', b.code, 'service', b.service_name, 'minutes', b.minutes, 'starts_at', b.starts_at, 'status', b.status,
    'first_name', b.first_name, 'moved', b.moved_at is not null, 'business_slug', z.slug, 'business_id', z.id,
    'tikka_token', c.view_token,
    'tikka_reward', case when c.id is null then null
      else coalesce((select r.title from public.cards k join public.rewards r on r.id = k.reward_id where k.id = c.card_id),
                    (select d.bounce_back ->> 'title' from public.drops d where d.id = c.drop_id)) end,
    'tikka_used', c.redeemed_at is not null)
  from public.bookings b
  join public.businesses z on z.id = b.business_id
  left join public.claims c on c.id = b.claim_id
  where b.view_token = p_token;
$$;

-- When a Tikka is used at the counter, the booking made with it (today or earlier) becomes Arrived.
create function private.booking_arrived_with_tikka() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings set status = 'arrived', marked_at = now()
  where claim_id = new.id and status = 'booked' and starts_at < now() + interval '1 day';
  return null;
end;
$$;

create trigger claims_booking_arrived after update of redeemed_at on public.claims
for each row when (old.redeemed_at is null and new.redeemed_at is not null)
execute function private.booking_arrived_with_tikka();

revoke all on function private.booking_arrived_with_tikka() from public, anon, authenticated;
