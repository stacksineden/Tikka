-- The WhatsApp queue (TECH_PLAN §5). Every outbound message goes through outbound_messages and
-- leaves in priority order: card replies first, drop-live alerts last (rule 7). The cron route
-- takes a batch with take_outbound(), sends each through the Cloud API, and reports back with
-- finish_outbound(). All of it is server-only.
--
-- Opt-outs: direct replies to something the person just sent (their card, a resend, a reply,
-- the Notify me confirmation) always go. Everything else (the thank-you, reminders, alerts) is
-- skipped for a number that sent STOP for that business, or STOP ALL.
-- The 24-hour rule: free-form messages need a message from them in the last 24 hours. If the
-- window has closed the thank-you uses its template and other replies are dropped.

create table public.wa_contacts (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  profile_name text,
  last_inbound_at timestamptz
);

-- Audit log of what came in and went out.
create table public.wa_messages (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('in', 'out')),
  phone text not null,
  wa_message_id text unique,
  body jsonb,
  related_id uuid,
  created_at timestamptz not null default now()
);
create index wa_messages_phone on public.wa_messages (phone, created_at desc);

-- Meta templates. A template that isn't approved yet means that message is skipped and logged.
create table public.wa_templates (
  name text primary key,
  category text not null check (category in ('utility', 'marketing')),
  approved boolean not null default false,
  cost_usd numeric(6, 4) not null
);
insert into public.wa_templates (name, category, cost_usd) values
  ('tikka_redeemed_thanks', 'utility', 0.01),
  ('tikka_expiry_reminder', 'utility', 0.01),
  ('tikka_owner_daily', 'utility', 0.01),
  ('tikka_drop_live', 'marketing', 0.06);

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  business_id uuid references public.businesses (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete set null,
  kind text not null check (kind in ('card', 'resend', 'reply', 'thanks', 'notify_confirm', 'expiry_reminder', 'owner_daily', 'drop_live')),
  payload jsonb not null default '{}',
  priority smallint not null,
  -- Null for free-form; set when it's taken, if it goes as a template.
  template_name text references public.wa_templates (name),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  attempts int not null default 0,
  -- One message per key: "thanks:<claim>", "live:<drop>:<phone>", "help:<phone>:<hour>"…
  dedupe_key text unique,
  wa_message_id text unique,
  error text,
  scheduled_for timestamptz not null default now(),
  taken_at timestamptz,
  sent_at timestamptz,
  cost_estimate_usd numeric(6, 4),
  created_at timestamptz not null default now()
);
create index outbound_next on public.outbound_messages (priority, scheduled_for) where status = 'queued';
create index outbound_sending on public.outbound_messages (taken_at) where status = 'sending';

alter table public.wa_contacts enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_templates enable row level security;
alter table public.outbound_messages enable row level security;
-- The admin page shows WhatsApp spend and the template list.
create policy "admins read outbound" on public.outbound_messages for select to authenticated using (private.is_admin());
create policy "admins read templates" on public.wa_templates for select to authenticated using (private.is_admin());
revoke insert, update, delete on public.wa_contacts, public.wa_messages, public.wa_templates, public.outbound_messages from anon, authenticated;
revoke select on public.wa_contacts, public.wa_messages from anon, authenticated;

-- ---------------------------------------------------------------- in

-- Each inbound message: false if it's a repeat delivery (Meta retries), else logs it and opens
-- the 24-hour window.
create function public.record_inbound(p_wa_message_id text, p_phone text, p_profile_name text, p_body jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  insert into public.wa_messages (direction, phone, wa_message_id, body) values ('in', p_phone, p_wa_message_id, p_body)
  on conflict (wa_message_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  insert into public.wa_contacts as c (phone, profile_name, last_inbound_at) values (p_phone, p_profile_name, now())
  on conflict (phone) do update set last_inbound_at = now(), profile_name = coalesce(excluded.profile_name, c.profile_name);
  return true;
end;
$$;

-- --------------------------------------------------------------- queue

-- Returns the new message's id, or null if one with the same dedupe key exists.
create function public.enqueue_message(
  p_phone text, p_kind text, p_payload jsonb, p_business uuid default null, p_claim uuid default null,
  p_dedupe_key text default null, p_scheduled_for timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.outbound_messages (phone, kind, payload, priority, business_id, claim_id, dedupe_key, scheduled_for)
  values (p_phone, p_kind, coalesce(p_payload, '{}'),
          case when p_kind in ('card', 'resend', 'reply') then 1
               when p_kind = 'thanks' then 2
               when p_kind in ('notify_confirm', 'expiry_reminder', 'owner_daily') then 3
               else 4 end,
          p_business, p_claim, p_dedupe_key, coalesce(p_scheduled_for, now()))
  on conflict (dedupe_key) do nothing
  returning id into new_id;
  return new_id;
end;
$$;

-- The cron route's batch: up to p_limit messages, most urgent first, each locked so two runs
-- never send the same one. Messages that can't go are marked skipped with the reason.
create function public.take_outbound(p_limit int default 50)
returns table (id uuid, phone text, kind text, template_name text, payload jsonb, attempts int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  m public.outbound_messages%rowtype;
  window_open boolean;
  tpl text;
  taken int := 0;
begin
  -- A run that died mid-send: put its messages back after 5 minutes.
  update public.outbound_messages o set status = 'queued'
  where o.status = 'sending' and o.taken_at < now() - interval '5 minutes';

  for m in
    select * from public.outbound_messages o
    where o.status = 'queued' and o.scheduled_for <= now()
    order by o.priority, o.scheduled_for, o.created_at
    for update skip locked
  loop
    exit when taken >= p_limit;

    if m.kind not in ('card', 'resend', 'reply', 'notify_confirm') and exists (
      select 1 from public.opt_outs x where x.phone = m.phone and (x.business_id is null or x.business_id = m.business_id)
    ) then
      update public.outbound_messages set status = 'skipped', error = 'opted_out' where outbound_messages.id = m.id;
      continue;
    end if;

    window_open := exists (select 1 from public.wa_contacts c where c.phone = m.phone and c.last_inbound_at > now() - interval '24 hours');
    tpl := case m.kind
      when 'thanks' then case when window_open then null else 'tikka_redeemed_thanks' end
      when 'expiry_reminder' then 'tikka_expiry_reminder'
      when 'owner_daily' then 'tikka_owner_daily'
      when 'drop_live' then 'tikka_drop_live'
    end;
    if tpl is null and not window_open then
      update public.outbound_messages set status = 'skipped', error = 'window_closed' where outbound_messages.id = m.id;
      continue;
    end if;
    if tpl is not null and not exists (select 1 from public.wa_templates w where w.name = tpl and w.approved) then
      update public.outbound_messages set status = 'skipped', error = 'template_not_approved', template_name = tpl where outbound_messages.id = m.id;
      continue;
    end if;

    update public.outbound_messages
    set status = 'sending', attempts = outbound_messages.attempts + 1, taken_at = now(), template_name = tpl,
        cost_estimate_usd = coalesce((select w.cost_usd from public.wa_templates w where w.name = tpl), 0.01)
    where outbound_messages.id = m.id;
    taken := taken + 1;
    return query select m.id, m.phone, m.kind, tpl, m.payload, m.attempts + 1;
  end loop;
end;
$$;

-- After each send: sent, or try again in 2, then 4 minutes, then failed after 3 tries.
create function public.finish_outbound(p_id uuid, p_wa_message_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.outbound_messages%rowtype;
begin
  select * into m from public.outbound_messages where id = p_id and status = 'sending' for update;
  if not found then
    return;
  end if;
  if p_error is null then
    update public.outbound_messages set status = 'sent', sent_at = now(), wa_message_id = p_wa_message_id, error = null where id = p_id;
    insert into public.wa_messages (direction, phone, wa_message_id, body, related_id)
    values ('out', m.phone, p_wa_message_id, jsonb_build_object('kind', m.kind, 'template', m.template_name), m.id)
    on conflict (wa_message_id) do nothing;
  elsif m.attempts >= 3 then
    update public.outbound_messages set status = 'failed', error = left(p_error, 500) where id = p_id;
  else
    update public.outbound_messages
    set status = 'queued', error = left(p_error, 500), scheduled_for = now() + make_interval(mins => power(2, m.attempts)::int)
    where id = p_id;
  end if;
end;
$$;

-- Meta's status webhook: delivered, read or failed (after it was sent). Never moves backwards.
create function public.record_outbound_status(p_wa_message_id text, p_status text, p_error text default null)
returns void
language sql security definer set search_path = '' as $$
  update public.outbound_messages
  set status = p_status, error = coalesce(left(p_error, 500), error)
  where wa_message_id = p_wa_message_id
    and p_status in ('delivered', 'read', 'failed')
    and array_position(array['sent', 'delivered', 'read'], status) < coalesce(array_position(array['sent', 'delivered', 'read'], p_status), 99);
$$;

-- ------------------------------------------------------- reminders

-- 08:00 WAT on the planned visit day, or 10:00 WAT three days before it ends, whichever is
-- earlier; times already past at the claim, or after the end, don't count (lib/visit.ts reminderAt).
create function private.reminder_at(p_claimed timestamptz, p_expires timestamptz, p_planned date)
returns timestamptz
language sql stable set search_path = '' as $$
  select min(t) from (values
    (((p_expires at time zone 'Africa/Lagos')::date - 3 + time '10:00') at time zone 'Africa/Lagos'),
    ((p_planned + time '08:00') at time zone 'Africa/Lagos')
  ) v(t)
  where t is not null and t > p_claimed and t < p_expires;
$$;

-- The per-minute cron: queue each due reminder once. Returns how many.
create function public.enqueue_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  c record;
begin
  for c in
    select cl.id, cl.phone, cl.view_token, cl.expires_at, cl.kind, d.business_id, d.bounce_back, b.name as business_name,
           (select r.title from public.cards k join public.rewards r on r.id = k.reward_id where k.id = cl.card_id) as reward
    from public.claims cl
    join public.drops d on d.id = cl.drop_id
    join public.businesses b on b.id = d.business_id
    where cl.redeemed_at is null and cl.reminder_sent_at is null and cl.expires_at > now()
      and private.reminder_at(cl.claimed_at, cl.expires_at, cl.planned_visit_date) <= now()
      and not exists (select 1 from public.opt_outs x where x.phone = cl.phone and (x.business_id is null or x.business_id = d.business_id))
    for update of cl skip locked
  loop
    perform public.enqueue_message(c.phone, 'expiry_reminder', jsonb_build_object(
        'reward', coalesce(c.reward, c.bounce_back ->> 'title'), 'business_name', c.business_name,
        'expires_at', c.expires_at, 'view_token', c.view_token),
      c.business_id, c.id, 'reminder:' || c.id);
    update public.claims set reminder_sent_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ------------------------------------------------------ drop-live alerts

-- The per-minute cron: each drop that has opened and hasn't been announced gets one alert per
-- number, to people waiting for it or following the business, and past claimers who ticked the
-- future-drops box (rule 12), never to anyone who sent STOP. At most 1,000, longest waiting first.
-- Drop subscriptions are used up; business follows stay. Returns how many messages.
create function public.enqueue_drop_alerts(p_cap int default 1000) returns int
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  n int := 0;
  sent text[];
begin
  for d in
    select dr.*, b.name as business_name, b.slug as business_slug,
           (select coalesce(sum(r.quantity), 0) from public.rewards r where r.drop_id = dr.id and r.tier = 'legendary') as legendary
    from public.drops dr join public.businesses b on b.id = dr.business_id
    where dr.status = 'published' and dr.starts_at <= now() and dr.ends_at > now() and dr.alerted_at is null and not b.suspended
    for update of dr skip locked
  loop
    select array_agg(phone order by first_at) into sent from (
      select phone, min(at) as first_at from (
        select s.phone, s.created_at as at from public.notify_subscriptions s
        where s.business_id = d.business_id and s.status = 'active' and (s.drop_id = d.id or s.drop_id is null)
        union all
        select l.phone, coalesce(l.marketing_opt_in_at, l.first_seen_at) from public.leads l
        where l.business_id = d.business_id and l.marketing_opt_in and not l.opted_out
      ) x
      where not exists (select 1 from public.opt_outs o where o.phone = x.phone and (o.business_id is null or o.business_id = d.business_id))
      group by phone
      order by min(at)
      limit p_cap
    ) y;

    if sent is not null then
      perform public.enqueue_message(p, 'drop_live', jsonb_build_object(
          'business_name', d.business_name, 'business_slug', d.business_slug, 'drop_slug', d.slug,
          'drop_title', d.title, 'total', d.total_cards, 'legendary', d.legendary),
        d.business_id, null, 'live:' || d.id || ':' || p)
      from unnest(sent) p;
      n := n + array_length(sent, 1);
      update public.notify_subscriptions set status = 'used', notified_at = now()
      where business_id = d.business_id and drop_id = d.id and status = 'active' and phone = any (sent);
      update public.notify_subscriptions set notified_at = now()
      where business_id = d.business_id and drop_id is null and status = 'active' and phone = any (sent);
    end if;
    update public.drops set alerted_at = now() where id = d.id;
  end loop;
  return n;
end;
$$;

revoke all on function public.record_inbound(text, text, text, jsonb),
  public.enqueue_message(text, text, jsonb, uuid, uuid, text, timestamptz),
  public.take_outbound(int), public.finish_outbound(uuid, text, text), public.record_outbound_status(text, text, text),
  public.enqueue_due_reminders(), public.enqueue_drop_alerts(int)
  from public, anon, authenticated;
grant execute on function public.record_inbound(text, text, text, jsonb),
  public.enqueue_message(text, text, jsonb, uuid, uuid, text, timestamptz),
  public.take_outbound(int), public.finish_outbound(uuid, text, text), public.record_outbound_status(text, text, text),
  public.enqueue_due_reminders(), public.enqueue_drop_alerts(int)
  to service_role;
revoke all on function private.reminder_at(timestamptz, timestamptz, date) from public, anon, authenticated;

-- confirm_redemption(): now queues the thank-you itself.
create or replace function public.confirm_redemption(
  p_business uuid, p_code text, p_bill_amount_kobo int default null,
  p_action_confirmed boolean default false, p_customer_status text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  cl public.claims%rowtype;
  d public.drops%rowtype;
  r jsonb;
  bill int := case when p_bill_amount_kobo > 0 then p_bill_amount_kobo end;
  status text;
  bb public.claims%rowtype;
  bb_code text;
begin
  if not private.is_member(p_business) then
    raise exception 'Not your business' using errcode = 'insufficient_privilege';
  end if;
  if p_customer_status is not null and p_customer_status not in ('new', 'returning') then
    raise exception 'customer_status is new or returning' using errcode = 'check_violation';
  end if;

  -- Two tills confirming the same code: the second waits here, then sees it's used.
  select * into cl from public.claims where claims.code = v_code for update;
  r := private.code_check(p_business, v_code);
  if r ->> 'kind' <> 'valid' then
    return r;
  end if;
  if r ->> 'action' is not null and not coalesce(p_action_confirmed, false) then
    return jsonb_build_object('kind', 'needs_action', 'code', v_code);
  end if;
  status := coalesce(p_customer_status, r ->> 'suggested_status');

  update public.claims
  set redeemed_at = now(), bill_amount_kobo = bill, customer_status = status,
      redeemed_by = auth.uid(), action_confirmed = (r ->> 'action' is not null)
  where id = cl.id;
  update public.leads set redeemed_count = redeemed_count + 1 where id = cl.lead_id;
  select * into d from public.drops where id = cl.drop_id;
  insert into public.events (drop_id, business_id, type, first_name, amount_kobo, tier)
  values (d.id, d.business_id, 'redeemed', cl.first_name, bill, r ->> 'tier');

  -- The next-visit Tikka: once per redeemed drop Tikka, never from a bounce-back.
  if cl.kind = 'drop' and d.bounce_back is not null then
    loop
      bb_code := private.tikka_code((select code_prefix from public.businesses where id = d.business_id));
      exit when not exists (select 1 from public.claims o where o.code = bb_code);
    end loop;
    insert into public.claims (drop_id, kind, parent_claim_id, lead_id, phone, first_name, code, view_token, is_new_lead, source, expires_at)
    values (d.id, 'bounce_back', cl.id, cl.lead_id, cl.phone, cl.first_name, bb_code,
            replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_'),
            false, cl.source, private.last_day(now(), coalesce((d.bounce_back ->> 'validity_days')::int, 30)))
    on conflict (parent_claim_id) where kind = 'bounce_back' do nothing
    returning * into bb;
  end if;

  -- The thank-you, with the next-visit line and the review link (rule 12: it belongs to the claim).
  perform public.enqueue_message(cl.phone, 'thanks', jsonb_build_object(
      'business_name', (select name from public.businesses where id = d.business_id),
      'first_name', cl.first_name,
      'view_token', cl.view_token,
      'bounce_back', case when bb.id is null then null else jsonb_build_object(
        'reward', d.bounce_back ->> 'title', 'expires_at', bb.expires_at, 'view_token', bb.view_token) end),
    d.business_id, cl.id, 'thanks:' || cl.id);

  return jsonb_build_object(
    'kind', 'redeemed',
    'code', v_code,
    'name', r ->> 'name',
    'customer_status', status,
    'bounce_back', case when bb.id is null then null else jsonb_build_object(
      'claim_id', bb.id, 'reward', d.bounce_back ->> 'title', 'expires_at', bb.expires_at, 'view_token', bb.view_token) end
  );
end;
$$;
