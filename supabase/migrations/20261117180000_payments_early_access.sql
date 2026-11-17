-- "Coming soon: payments and deposits" (docs/REVENUE_PLAN.md item 6). A teaser only: nothing is
-- paid or shown as working. Owners join the early-access list in one tap (the same list as Spark,
-- feature 'payments'), can hide the dashboard card ('payments_dashboard'), and Tikka admin sees who
-- joined, to call them first. Spark is unchanged.

-- Let the list and the dismissals take the new names. The old checks are found by what they check,
-- so this works whatever Postgres named them.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.early_access'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%feature%' loop
    execute format('alter table public.early_access drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
           where conrelid = 'public.teaser_dismissals'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%teaser%' loop
    execute format('alter table public.teaser_dismissals drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.early_access add constraint early_access_feature_check check (feature in ('spark', 'payments'));
alter table public.teaser_dismissals add constraint teaser_dismissals_teaser_check
  check (teaser in ('spark_builder', 'spark_dashboard', 'payments_dashboard'));

-- What the dashboard needs for one feature: is this business on its list, and which teasers has it
-- hidden. Members of the business may ask (staff see it, but only owners join or hide).
create function public.early_access_state(p_business uuid, p_feature text)
returns table (on_list boolean, dismissed text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_business) then
    raise exception 'Not a member of this business' using errcode = 'insufficient_privilege';
  end if;
  return query select
    exists (select 1 from public.early_access a where a.feature = p_feature and a.business_id = p_business),
    coalesce((select array_agg(d.teaser order by d.teaser) from public.teaser_dismissals d where d.business_id = p_business), '{}');
end;
$$;

revoke all on function public.early_access_state(uuid, text) from public, anon;
grant execute on function public.early_access_state(uuid, text) to authenticated;
