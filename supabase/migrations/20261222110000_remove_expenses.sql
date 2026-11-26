-- Taking back something spent (27 Nov 2026): an owner who added an expense by mistake, or changed
-- their mind, removes it; a regular cost stops being counted (ended_at, so get_ledger() leaves it
-- out). Owners only, their own business's rows only.

create function public.remove_expense(p_business uuid, p_expense uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.owner_or_raise(p_business);
  delete from public.expenses where id = p_expense and business_id = p_business;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create function public.stop_regular_cost(p_business uuid, p_cost uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform private.owner_or_raise(p_business);
  update public.regular_costs set ended_at = now() where id = p_cost and business_id = p_business and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.remove_expense(uuid, uuid), public.stop_regular_cost(uuid, uuid) from public, anon;
grant execute on function public.remove_expense(uuid, uuid), public.stop_regular_cost(uuid, uuid) to authenticated;
