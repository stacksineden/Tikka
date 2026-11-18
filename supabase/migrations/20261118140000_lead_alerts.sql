-- New lead alerts: a notification on the owner's phone each time someone claims (web push). The
-- owner turns it on per phone from the dashboard; the phone's browser gives a push subscription
-- (an endpoint and two keys), saved here. Only owners: staff never get lead alerts (rule 4). The
-- notification never carries a phone number (it shows on the lock screen).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_business on public.push_subscriptions (business_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Turn alerts on for this phone. Owners only. The same phone (endpoint) moves to whoever turns it
-- on last, so a shared phone never alerts the previous owner.
create function public.save_push_subscription(p_business uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can turn on lead alerts' using errcode = 'insufficient_privilege';
  end if;
  insert into public.push_subscriptions (business_id, user_id, endpoint, p256dh, auth, user_agent)
  values (p_business, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set business_id = excluded.business_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
  return true;
end;
$$;

-- Turn alerts off for this phone (only your own).
create function public.remove_push_subscription(p_endpoint text) returns boolean
language sql security definer set search_path = '' as $$
  with gone as (delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() returning 1)
  select exists (select 1 from gone);
$$;

-- Whether this phone has alerts on for this business (the Settings switch).
create function public.push_subscribed(p_business uuid, p_endpoint text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.push_subscriptions
    where business_id = p_business and endpoint = p_endpoint and user_id = auth.uid()
  );
$$;

revoke all on function public.save_push_subscription(uuid, text, text, text, text), public.remove_push_subscription(text),
  public.push_subscribed(uuid, text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text), public.remove_push_subscription(text),
  public.push_subscribed(uuid, text) to authenticated;

-- What a new claim's alert says, and where it goes. Server only (service role). Never the phone
-- number. `recent` = this drop's claims in the last 10 minutes, so a burst reads "4 new leads" in
-- one notification (the phone replaces the last one for the same drop). Phones only of people who
-- still own the business.
create function public.lead_alert(p_view_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'business_id', d.business_id,
    'business_name', b.name,
    'drop_id', d.id,
    'first_name', c.first_name,
    'tier', r.tier,
    'reward', r.title,
    'recent', (select count(*) from public.claims o where o.drop_id = d.id and o.kind = 'drop' and o.claimed_at > now() - interval '10 minutes'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s
      join public.business_members m on m.business_id = s.business_id and m.user_id = s.user_id and m.role = 'owner'
      where s.business_id = d.business_id
    ), '[]'::jsonb))
  from public.claims c
  join public.drops d on d.id = c.drop_id
  join public.businesses b on b.id = d.business_id
  join public.cards k on k.id = c.card_id
  join public.rewards r on r.id = k.reward_id
  where c.view_token = p_view_token and c.kind = 'drop';
$$;

-- A phone that no longer accepts notifications (uninstalled, permission removed) is dropped.
create function public.forget_push_endpoint(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- The owner's "Send a test notification": this owner's own phones for the business.
create function public.my_push_subscriptions(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
    from public.push_subscriptions where business_id = p_business and user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.lead_alert(text), public.forget_push_endpoint(text) from public, anon, authenticated;
grant execute on function public.lead_alert(text), public.forget_push_endpoint(text) to service_role;
revoke all on function public.my_push_subscriptions(uuid) from public, anon;
grant execute on function public.my_push_subscriptions(uuid) to authenticated;
