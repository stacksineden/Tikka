-- The new direction, step 3 (docs/DB_MOVE.md): the waitlist. On a full day the booking sheet
-- offers "Join the waitlist": a first name and WhatsApp number for that day and service. The owner
-- sees it on Calendar, with "Tell {name}" from their own WhatsApp when a place frees up, and
-- "Done, remove". Until now it lived in the demo store (lib/bookings-data.ts joinWaitlist).
--
-- Rule 4: the numbers reach owners only (staff never see the waitlist). A waitlist entry is not a
-- lead: joining adds no one to the owner's customers or offers, and promises no booking. Privacy:
-- the lookup shows a person's entries and forgetting them deletes them; entries are kept 30 days
-- after the day they wanted, then removed.

create table public.booking_waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The WAT day they wanted.
  day date not null,
  service_id uuid references public.business_services (id) on delete set null,
  service_name text not null check (char_length(service_name) between 1 and 60),
  first_name text not null check (char_length(first_name) between 1 and 30),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  visitor_id text,
  created_at timestamptz not null default now(),
  unique (business_id, day, phone)
);
create index booking_waitlist_business_day on public.booking_waitlist (business_id, day);
create index booking_waitlist_phone on public.booking_waitlist (phone);

-- Nothing is read or written directly: only through the functions below.
alter table public.booking_waitlist enable row level security;
revoke all on public.booking_waitlist from anon, authenticated;

-- A customer asks to hear if a full day opens up. One entry per number per day (joining again is
-- fine and changes nothing). Server only, after the route's rate limits.
create function public.join_waitlist(
  p_business uuid, p_service uuid, p_day date, p_first_name text, p_phone text, p_visitor text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.booking_settings%rowtype;
  svc public.business_services%rowtype;
  v_name text := left(trim(coalesce(p_first_name, '')), 30);
  today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if v_name = '' then
    return jsonb_build_object('kind', 'bad_name');
  end if;
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('kind', 'bad_phone');
  end if;
  if not exists (select 1 from public.businesses where id = p_business and not suspended) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    return jsonb_build_object('kind', 'off');
  end if;
  if p_day is null or p_day < today or p_day > today + s.ahead_days then
    return jsonb_build_object('kind', 'closed');
  end if;
  select * into svc from public.business_services where id = p_service and business_id = p_business;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  -- Tidy: entries 30 days past their day go.
  delete from public.booking_waitlist where business_id = p_business and day < today - 30;
  if exists (select 1 from public.booking_waitlist where business_id = p_business and day = p_day and phone = p_phone) then
    return jsonb_build_object('kind', 'joined');
  end if;
  if (select count(*) from public.booking_waitlist where business_id = p_business and day >= today) >= 500 then
    return jsonb_build_object('kind', 'slow_down');
  end if;
  insert into public.booking_waitlist (business_id, day, service_id, service_name, first_name, phone, visitor_id)
  values (p_business, p_day, svc.id, svc.name, v_name, p_phone, p_visitor)
  on conflict (business_id, day, phone) do nothing;
  return jsonb_build_object('kind', 'joined');
end;
$$;

-- The owner's waitlist from today on, soonest day first (owners only: it holds numbers).
create function public.get_waitlist(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees the waitlist' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', w.id, 'day', w.day, 'service_id', w.service_id, 'service', w.service_name,
        'first_name', w.first_name, 'phone', w.phone, 'created_at', w.created_at)
      order by w.day, w.created_at)
    from public.booking_waitlist w
    where w.business_id = p_business and w.day >= (now() at time zone 'Africa/Lagos')::date), '[]'::jsonb);
end;
$$;

-- "Done, remove" (owners only).
create function public.remove_waitlist(p_business uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner changes the waitlist' using errcode = 'insufficient_privilege';
  end if;
  delete from public.booking_waitlist where id = p_id and business_id = p_business;
  return found;
end;
$$;

revoke all on function public.join_waitlist(uuid, uuid, date, text, text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, uuid, date, text, text, text) to service_role;
revoke all on function public.get_waitlist(uuid), public.remove_waitlist(uuid, uuid) from public, anon;
grant execute on function public.get_waitlist(uuid), public.remove_waitlist(uuid, uuid) to authenticated;

-- ------------------------------------------------------------- privacy

-- The lookup shows a person's waitlist entries (same as before, plus 'waitlist').
create or replace function public.admin_person_lookup(p_phone text) returns jsonb
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
    'messages', (select count(*) from public.wa_messages where phone = p_phone) + (select count(*) from public.outbound_messages where phone = p_phone),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', k.service_name, 'starts_at', k.starts_at, 'status', k.status,
                                          'deposit_paid_kobo', k.deposit_paid_kobo, 'email', k.deposit_email is not null) order by k.starts_at desc)
      from public.bookings k join public.businesses z on z.id = k.business_id where k.phone = p_phone), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'note', p.note, 'amount_kobo', p.amount_kobo, 'status', p.status,
                                          'email', p.payer_email is not null) order by p.created_at desc)
      from public.pay_links p join public.businesses z on z.id = p.business_id join public.leads l on l.id = p.lead_id
      where l.phone = p_phone), '[]'),
    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'service', w.service_name, 'day', w.day) order by w.day desc)
      from public.booking_waitlist w join public.businesses z on z.id = w.business_id where w.phone = p_phone), '[]')
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages',
                             'bookings', jsonb_array_length(result -> 'bookings'), 'payments', jsonb_array_length(result -> 'payments'),
                             'waitlist', jsonb_array_length(result -> 'waitlist')),
          auth.uid());
  return result;
end;
$$;


-- Forgetting a person deletes their waitlist entries too (same as before, plus 'waitlist').
create or replace function public.admin_forget_person(p_phone text) returns jsonb
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
  n_waitlist int;
  cl record;
  counts jsonb;
begin
  perform private.admin_only();
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format, like +2348031234567' using errcode = 'check_violation';
  end if;

  -- First names in the live feed: one event per moment they claimed, came in or reviewed (the
  -- closest one, so a namesake who claimed at the same time keeps theirs).
  for cl in
    select x.drop_id, x.first_name, 'claim_completed'::text as type, x.claimed_at as at from public.claims x where x.phone = p_phone and x.kind = 'drop'
    union all
    select x.drop_id, x.first_name, 'redeemed', x.redeemed_at from public.claims x where x.phone = p_phone and x.redeemed_at is not null
    union all
    select x.drop_id, x.first_name, 'reviewed', v.created_at from public.claims x join public.reviews v on v.claim_id = x.id where x.phone = p_phone
  loop
    update public.events set first_name = null
    where id = (
      select e.id from public.events e
      where e.drop_id = cl.drop_id and e.type = cl.type and e.first_name = cl.first_name
        and abs(extract(epoch from e.created_at - cl.at)) < 120
      order by abs(extract(epoch from e.created_at - cl.at)), e.id
      limit 1);
    if found then
      n_events := n_events + 1;
    end if;
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
  with d as (delete from public.booking_waitlist where phone = p_phone returning 1) select count(*) into n_waitlist from d;

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events,
    'waitlist', n_waitlist);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;

