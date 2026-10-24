-- Privacy requests (PRD C1, the privacy policy's "Your rights"): an admin looks up everything
-- Tikka holds for a WhatsApp number and, on the person's request, deletes it. Each lookup and
-- deletion is logged with a masked number (never the full one), what was found or removed, and who
-- did it, so a request can be shown to have been handled.

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lookup', 'deleted')),
  phone_hint text not null,
  counts jsonb not null default '{}',
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
create policy "admins read privacy requests" on public.privacy_requests for select to authenticated using (private.is_admin());
revoke insert, update, delete on public.privacy_requests from anon, authenticated;

-- "+234•••0001": enough to recognise a request, not enough to use the number.
create function private.phone_hint(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select left(p_phone, 4) || '•••' || right(p_phone, 4);
$$;

-- What Tikka holds for a number. Admins only; the lookup is logged.
create function public.admin_person_lookup(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;
  result := jsonb_build_object(
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
          'business_name', b.name, 'drop_title', d.title, 'kind', c.kind, 'first_name', c.first_name,
          'reward', coalesce(r.title, d.bounce_back ->> 'title'), 'claimed_at', c.claimed_at, 'redeemed_at', c.redeemed_at,
          'reviewed', exists (select 1 from public.reviews v where v.claim_id = c.id))
        order by c.claimed_at desc)
      from public.claims c join public.drops d on d.id = c.drop_id join public.businesses b on b.id = d.business_id
      left join public.cards k on k.id = c.card_id left join public.rewards r on r.id = k.reward_id
      where c.phone = p_phone), '[]'),
    'businesses_with_lead', coalesce((
      select jsonb_agg(b.name order by b.name) from public.leads l join public.businesses b on b.id = l.business_id where l.phone = p_phone), '[]'),
    'notify', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', b.name, 'drop_title', d.title, 'status', s.status))
      from public.notify_subscriptions s join public.businesses b on b.id = s.business_id left join public.drops d on d.id = s.drop_id
      where s.phone = p_phone), '[]'),
    'opted_out', exists (select 1 from public.opt_outs where phone = p_phone),
    'messages', (select count(*) from public.wa_messages where phone = p_phone) + (select count(*) from public.outbound_messages where phone = p_phone)
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages'),
          auth.uid());
  return result;
end;
$$;

-- Deletes everything held for a number: leads (and with them claims, their reviews and visit
-- plans), claim attempts, Notify me, opt-outs, WhatsApp messages and the send queue, and the first
-- name on their events in the live feed. Cards they held stay used, so no card is ever given out
-- twice; the business's numbers stop counting their claims. Returns what was removed.
create function public.admin_forget_person(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n_claims int;
  n_reviews int;
  n_leads int;
  n_intents int;
  n_notify int;
  n_optouts int;
  n_messages int;
  n_queue int;
  n_events int := 0;
  c record;
  counts jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;

  -- First names in the live feed: the events written when they claimed, came in or reviewed.
  for c in select c.drop_id, c.first_name, c.claimed_at, c.redeemed_at from public.claims c where c.phone = p_phone loop
    with cleared as (
      update public.events e set first_name = null
      -- Each event matched to its own moment (within two minutes), so a namesake's stay.
      where e.drop_id = c.drop_id and e.first_name = c.first_name
        and ((e.type = 'claim_completed' and abs(extract(epoch from e.created_at - c.claimed_at)) < 120)
          or (e.type = 'redeemed' and c.redeemed_at is not null and abs(extract(epoch from e.created_at - c.redeemed_at)) < 120)
          or (e.type = 'reviewed' and exists (select 1 from public.reviews v join public.claims x on x.id = v.claim_id
                                              where x.phone = p_phone and x.drop_id = c.drop_id
                                                and abs(extract(epoch from e.created_at - v.created_at)) < 120)))
      returning 1)
    select n_events + count(*) into n_events from cleared;
  end loop;

  select count(*) into n_claims from public.claims where phone = p_phone;
  select count(*) into n_reviews from public.reviews v join public.claims c on c.id = v.claim_id where c.phone = p_phone;
  delete from public.reports r using public.reviews v, public.claims c
    where r.target_type = 'review' and r.target_id = v.id and v.claim_id = c.id and c.phone = p_phone;
  -- Claims go with their lead (and reviews with their claim).
  delete from public.claims where phone = p_phone;
  with d as (delete from public.leads where phone = p_phone returning 1) select count(*) into n_leads from d;
  with d as (delete from public.claim_intents where phone = p_phone returning 1) select count(*) into n_intents from d;
  with d as (delete from public.notify_subscriptions where phone = p_phone returning 1) select count(*) into n_notify from d;
  with d as (delete from public.opt_outs where phone = p_phone returning 1) select count(*) into n_optouts from d;
  with d as (delete from public.wa_messages where phone = p_phone returning 1) select count(*) into n_messages from d;
  with d as (delete from public.outbound_messages where phone = p_phone returning 1) select count(*) into n_queue from d;
  delete from public.wa_contacts where phone = p_phone;

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;

-- The log, newest first, for the admin page.
create function public.admin_privacy_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.admin_only();
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', r.kind, 'phone_hint', r.phone_hint, 'counts', r.counts, 'created_at', r.created_at,
                                        'done_by', (select p.display_name from public.profiles p where p.user_id = r.done_by))
                     order by r.created_at desc)
    from (select * from public.privacy_requests order by created_at desc limit 50) r), '[]');
end;
$$;

revoke all on function private.phone_hint(text) from public, anon, authenticated;
revoke all on function public.admin_person_lookup(text), public.admin_forget_person(text), public.admin_privacy_requests() from public, anon;
grant execute on function public.admin_person_lookup(text), public.admin_forget_person(text), public.admin_privacy_requests() to authenticated;
