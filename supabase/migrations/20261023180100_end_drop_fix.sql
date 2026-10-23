-- end_drop_early(): a drop that started this very moment counts as started, so its end date
-- moves to now too (only a drop that hasn't started keeps its dates).
create or replace function public.end_drop_early(p_drop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.drops%rowtype;
begin
  select * into d from public.drops where id = p_drop for update;
  if not found or not private.is_owner(d.business_id) then
    raise exception 'Only the owner can end a drop' using errcode = 'insufficient_privilege';
  end if;
  if d.status = 'published' then
    update public.drops
    set status = 'ended_early', ends_at = case when starts_at < now() then least(ends_at, now()) else greatest(starts_at + interval '1 second', least(ends_at, now())) end
    where id = p_drop;
  end if;
end;
$$;
