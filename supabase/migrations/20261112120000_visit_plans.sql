-- Visit plans ("When will you come in?") reach the business and the reminder.
-- 1. The counter check returns the plan, so staff see "Planned: this afternoon". A day and a time
--    of day, never a phone number.
-- 2. The reminder that goes out on the planned day carries the time of day (visit_part), and goes
--    as the new tikka_visit_reminder template: "See you this afternoon at Glow Studio! …". Until
--    Meta approves that template, it goes as tikka_expiry_reminder exactly as before.

insert into public.wa_templates (name, category, cost_usd) values ('tikka_visit_reminder', 'utility', 0.01)
on conflict (name) do nothing;

create or replace function private.code_check(p_business uuid, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := private.clean_code(p_code);
  cl public.claims%rowtype;
  d public.drops%rowtype;
  l public.leads%rowtype;
  rw public.rewards%rowtype;
  came_before boolean;
begin
  select * into cl from public.claims where claims.code = v_code;
  if not found then
    return jsonb_build_object('kind', 'unknown', 'code', v_code);
  end if;
  select * into d from public.drops where id = cl.drop_id;
  if d.business_id <> p_business then
    return jsonb_build_object('kind', 'wrong_business', 'code', v_code);
  end if;
  if cl.redeemed_at is not null then
    return jsonb_build_object('kind', 'already_used', 'code', v_code, 'at', cl.redeemed_at);
  end if;
  if cl.expires_at <= now() then
    return jsonb_build_object('kind', 'expired', 'code', v_code, 'at', cl.expires_at);
  end if;
  -- Quiet-day drops: only on their days (1 = Monday … 7 = Sunday, in WAT). Bounce-backs work any day.
  if cl.kind = 'drop' and coalesce(array_length(d.valid_weekdays, 1), 0) > 0
     and not (extract(isodow from now() at time zone 'Africa/Lagos')::int = any (d.valid_weekdays)) then
    return jsonb_build_object('kind', 'wrong_day', 'code', v_code, 'days', to_jsonb(d.valid_weekdays));
  end if;

  select * into l from public.leads where id = cl.lead_id;
  select exists (
    select 1 from public.claims o join public.drops od on od.id = o.drop_id
    where o.lead_id = cl.lead_id and o.id <> cl.id and o.redeemed_at is not null and od.business_id = p_business
  ) into came_before;
  if cl.kind = 'drop' then
    select r.* into rw from public.cards k join public.rewards r on r.id = k.reward_id where k.id = cl.card_id;
  end if;

  return jsonb_build_object(
    'kind', 'valid',
    'code', v_code,
    'claim_kind', cl.kind,
    'name', private.shown_name(cl.first_name, l.wa_profile_name),
    'reward', case when cl.kind = 'drop' then rw.title else d.bounce_back ->> 'title' end,
    'tier', case when cl.kind = 'drop' then rw.tier else 'common' end,
    'expires_at', cl.expires_at,
    'action', case when cl.kind = 'drop' and rw.kind = 'action' then rw.action_text end,
    'suggested_status', case when came_before or cl.kind = 'bounce_back' then 'returning' else 'new' end,
    'planned_visit_date', cl.planned_visit_date,
    'planned_visit_part', cl.planned_visit_part
  ) || case when cl.counter_check and cl.counter_checked_at is null then
    jsonb_build_object('whatsapp_check', jsonb_build_object(
      'tries_left', greatest(private.counter_tries_per_day() - private.counter_fails_today(cl.id), 0)))
  else '{}'::jsonb end;
end;
$$;

create or replace function public.enqueue_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  c record;
begin
  for c in
    select cl.id, cl.phone, cl.view_token, cl.expires_at, cl.kind, cl.planned_visit_date, cl.planned_visit_part, d.business_id, d.bounce_back, b.name as business_name,
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
        'expires_at', c.expires_at, 'view_token', c.view_token)
        -- Sent on the day they said they'd come: "See you this afternoon".
        || case when c.planned_visit_date = (now() at time zone 'Africa/Lagos')::date
             then jsonb_build_object('visit_part', coalesce(c.planned_visit_part, 'today')) else '{}'::jsonb end,
      c.business_id, c.id, 'reminder:' || c.id);
    update public.claims set reminder_sent_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.take_outbound(p_limit int default 50)
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
    limit greatest(p_limit, 0)
    for update skip locked
  loop

    if m.kind not in ('card', 'resend', 'reply', 'notify_confirm') and exists (
      select 1 from public.opt_outs x where x.phone = m.phone and (x.business_id is null or x.business_id = m.business_id)
    ) then
      update public.outbound_messages set status = 'skipped', error = 'opted_out' where outbound_messages.id = m.id;
      continue;
    end if;

    window_open := exists (select 1 from public.wa_contacts c where c.phone = m.phone and c.last_inbound_at > now() - interval '24 hours');
    tpl := case m.kind
      when 'thanks' then case when window_open then null else 'tikka_redeemed_thanks' end
      -- On the planned day, the visit wording once Meta approves it; the plain reminder till then.
      when 'expiry_reminder' then case
        when m.payload ? 'visit_part' and exists (select 1 from public.wa_templates w where w.name = 'tikka_visit_reminder' and w.approved)
          then 'tikka_visit_reminder' else 'tikka_expiry_reminder' end
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
