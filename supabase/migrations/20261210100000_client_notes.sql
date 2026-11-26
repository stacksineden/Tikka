-- The new direction, step 5 (docs/DB_MOVE.md): the client book's notes and birthdays. The client
-- book itself (one customer per WhatsApp number, joining bookings, sales and Tikkas) is worked out
-- from those tables each time (lib/clients.ts buildClients); only what the owner writes about a
-- customer is stored here. Until now it lived in the demo store (lib/clients-data.ts).
--
-- Personal data: owners only (rule 4; staff never see the client book), read and written only
-- through the functions below, keyed by the customer's number. The privacy lookup shows whether a
-- business keeps notes or a birthday for a number; forgetting the person deletes them.

create table public.client_notes (
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  notes text check (char_length(notes) between 1 and 500),
  -- "MM-DD": no year (owners send a message on the day, never ask for an age).
  birthday text check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  updated_at timestamptz not null default now(),
  primary key (business_id, phone),
  check (notes is not null or birthday is not null)
);
create index client_notes_phone on public.client_notes (phone);

alter table public.client_notes enable row level security;
revoke all on public.client_notes from anon, authenticated;

-- Every note the owner keeps, by number: {"+234…": {"notes": …, "birthday": "MM-DD"}}.
create function public.get_client_notes(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.owner_or_raise(p_business);
  return coalesce((
    select jsonb_object_agg(n.phone, jsonb_strip_nulls(jsonb_build_object('notes', n.notes, 'birthday', n.birthday)))
    from public.client_notes n where n.business_id = p_business), '{}'::jsonb);
end;
$$;

-- Saves a customer's notes and birthday; both empty removes them.
create function public.save_client_note(p_business uuid, p_phone text, p_notes text, p_birthday text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 500), '');
  v_birthday text := nullif(trim(coalesce(p_birthday, '')), '');
begin
  perform private.owner_or_raise(p_business);
  if coalesce(p_phone, '') !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use the number in international format' using errcode = 'check_violation';
  end if;
  if v_birthday is not null and v_birthday !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
    v_birthday := null;
  end if;
  if v_notes is null and v_birthday is null then
    delete from public.client_notes where business_id = p_business and phone = p_phone;
    return true;
  end if;
  insert into public.client_notes (business_id, phone, notes, birthday)
  values (p_business, p_phone, v_notes, v_birthday)
  on conflict (business_id, phone) do update set notes = excluded.notes, birthday = excluded.birthday, updated_at = now();
  return true;
end;
$$;

revoke all on function public.get_client_notes(uuid), public.save_client_note(uuid, text, text, text) from public, anon;
grant execute on function public.get_client_notes(uuid), public.save_client_note(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------- privacy

-- The lookup shows whether a business keeps notes or a birthday for the number (same as before,
-- plus 'client_notes'; never the notes themselves).
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
      from public.booking_waitlist w join public.businesses z on z.id = w.business_id where w.phone = p_phone), '[]'),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'item', s.item, 'total_kobo', s.total_kobo, 'at', s.at) order by s.at desc)
      from public.sales s join public.businesses z on z.id = s.business_id where s.phone = p_phone), '[]'),
    'client_notes', coalesce((
      select jsonb_agg(jsonb_build_object('business_name', z.name, 'notes', n.notes is not null, 'birthday', n.birthday is not null))
      from public.client_notes n join public.businesses z on z.id = n.business_id where n.phone = p_phone), '[]')
  );
  insert into public.privacy_requests (kind, phone_hint, counts, done_by)
  values ('lookup', private.phone_hint(p_phone),
          jsonb_build_object('claims', jsonb_array_length(result -> 'claims'), 'leads', jsonb_array_length(result -> 'businesses_with_lead'),
                             'notify', jsonb_array_length(result -> 'notify'), 'messages', result -> 'messages',
                             'bookings', jsonb_array_length(result -> 'bookings'), 'payments', jsonb_array_length(result -> 'payments'),
                             'waitlist', jsonb_array_length(result -> 'waitlist'),
                             'sales', jsonb_array_length(result -> 'sales'),
                             'client_notes', jsonb_array_length(result -> 'client_notes')),
          auth.uid());
  return result;
end;
$$;

-- Forgetting a person deletes their notes and birthday too (same as before, plus 'client_notes').
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
  n_sales int;
  n_notes int;
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
  -- Sales keep their amounts (the owner's money stays right) but lose the name and number.
  with d as (update public.sales set name = 'Customer', phone = null where phone = p_phone returning 1) select count(*) into n_sales from d;
  with d as (delete from public.client_notes where phone = p_phone returning 1) select count(*) into n_notes from d;

  counts := jsonb_build_object('claims', n_claims, 'reviews', n_reviews, 'leads', n_leads, 'claim_attempts', n_intents,
    'notify', n_notify, 'opt_outs', n_optouts, 'messages', n_messages + n_queue, 'feed_names', n_events,
    'waitlist', n_waitlist, 'sales', n_sales, 'client_notes', n_notes);
  insert into public.privacy_requests (kind, phone_hint, counts, done_by) values ('deleted', private.phone_hint(p_phone), counts, auth.uid());
  return counts;
end;
$$;
