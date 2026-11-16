-- The business's own visits don't count in its link activity (PRD B6, TECH_PLAN §12). When the
-- person opening a drop link is signed in as that business's owner or staff, their view, tear,
-- Claim tap and continue aren't saved, so "opened the link" and the tear-open rate count
-- customers only. The server passes the signed-in user's id; the team check is here, in SQL.
-- From now on only: visits already saved weren't stored with who made them.

drop function public.record_drop_event(uuid, text, text, text, uuid);

create function public.record_drop_event(p_drop uuid, p_type text, p_source text, p_visitor_hash text, p_poster uuid default null, p_user uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
begin
  select * into d from public.drops where id = p_drop and status in ('published', 'ended_early');
  if not found or p_type not in ('view', 'unwrap', 'claim_tap', 'claim_continue') then
    return;
  end if;
  -- The owner or staff checking their own link.
  if p_user is not null and exists (
    select 1 from public.business_members m where m.business_id = d.business_id and m.user_id = p_user
  ) then
    return;
  end if;
  if p_type = 'view' and exists (
    select 1 from public.events e where e.drop_id = p_drop and e.type = 'view' and e.visitor_hash = p_visitor_hash
      and (e.created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date
  ) then
    return;
  end if;
  insert into public.events (drop_id, business_id, type, source, visitor_hash, poster_id)
  values (p_drop, d.business_id, p_type, p_source, p_visitor_hash,
          (select p.id from public.posters p where p.id = p_poster and p.business_id = d.business_id));
end;
$$;

revoke all on function public.record_drop_event(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_drop_event(uuid, text, text, text, uuid, uuid) to service_role;
