-- Hardening from the Supabase advisor: the access-check helpers and the sign-up hook move to a
-- schema the API doesn't expose (policies keep working: they reference the functions, not
-- their names), and policies read auth.uid() once per query instead of once per row.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_admin() set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.is_owner(uuid) set schema private;
alter function public.handle_new_user() set schema private;
alter function public.reject_reserved_slug() set schema private;

-- The checks are called by policies as the querying role; the hooks only by triggers.
revoke all on function private.is_admin(), private.is_member(uuid), private.is_owner(uuid) from public;
grant execute on function private.is_admin(), private.is_member(uuid), private.is_owner(uuid) to anon, authenticated;
revoke all on function private.handle_new_user(), private.reject_reserved_slug() from public, anon, authenticated;

-- create_business is meant for signed-in users (it's how card setup creates a business).

-- Policies: auth.uid() evaluated once per statement.
drop policy "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy "read memberships" on public.business_members;
create policy "read memberships" on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_owner(business_id) or private.is_admin());
