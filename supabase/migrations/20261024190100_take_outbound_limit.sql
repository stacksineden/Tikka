-- take_outbound() locked more rows than it took: the loop had no LIMIT, so PL/pgSQL's batched
-- fetch locked a few rows past p_limit and left them locked until the run finished, and runs at
-- the same time skipped them (they went on the next run; nothing was ever sent twice). Now each
-- run locks exactly the rows it handles: taken, or skipped with the reason.
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
