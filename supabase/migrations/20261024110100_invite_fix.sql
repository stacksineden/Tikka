-- invite_staff(): a variable named `email` clashed with the email column. Renamed.
create or replace function public.invite_staff(p_business uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  i public.business_invites%rowtype;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can invite staff' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('kind', 'bad_email');
  end if;
  if v_email = lower((select u.email from auth.users u where u.id = auth.uid())) then
    return jsonb_build_object('kind', 'own_email');
  end if;
  if exists (select 1 from public.business_members m join auth.users u on u.id = m.user_id where m.business_id = p_business and lower(u.email) = v_email) then
    return jsonb_build_object('kind', 'already_staff');
  end if;
  if (select count(*) from public.business_members m where m.business_id = p_business and m.role = 'staff') >= 20 then
    return jsonb_build_object('kind', 'too_many');
  end if;
  delete from public.business_invites where business_id = p_business and lower(business_invites.email) = v_email and accepted_at is null;
  insert into public.business_invites (business_id, email, invited_by) values (p_business, v_email, auth.uid()) returning * into i;
  return jsonb_build_object('kind', 'invited', 'token', i.token, 'email', i.email, 'expires_at', i.expires_at);
end;
$$;
