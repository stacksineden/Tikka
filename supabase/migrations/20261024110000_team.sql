-- Staff (TECH_PLAN §2): owners invite by email, the invited person signs in with that email and
-- joins as staff, owners can cancel invites and remove staff. Staff only ever redeem; they never
-- see leads or numbers (rule 4: enforced by the leads and claims policies, not here).

-- Invite links carry the token, so it must survive a URL: base64url, no + / =.
alter table public.business_invites alter column token set default replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_');
alter table public.business_invites alter column expires_at set default now() + interval '7 days';

-- {token, email, expires_at}. A new invite to the same email replaces the open one.
create function public.invite_staff(p_business uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  email text := lower(trim(coalesce(p_email, '')));
  i public.business_invites%rowtype;
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can invite staff' using errcode = 'insufficient_privilege';
  end if;
  if email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('kind', 'bad_email');
  end if;
  if email = lower((select u.email from auth.users u where u.id = auth.uid())) then
    return jsonb_build_object('kind', 'own_email');
  end if;
  if exists (select 1 from public.business_members m join auth.users u on u.id = m.user_id where m.business_id = p_business and lower(u.email) = email) then
    return jsonb_build_object('kind', 'already_staff');
  end if;
  if (select count(*) from public.business_members m where m.business_id = p_business and m.role = 'staff') >= 20 then
    return jsonb_build_object('kind', 'too_many');
  end if;
  delete from public.business_invites where business_id = p_business and lower(business_invites.email) = email and accepted_at is null;
  insert into public.business_invites (business_id, email, invited_by) values (p_business, email, auth.uid()) returning * into i;
  return jsonb_build_object('kind', 'invited', 'token', i.token, 'email', i.email, 'expires_at', i.expires_at);
end;
$$;

create function public.cancel_invite(p_business uuid, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can cancel invites' using errcode = 'insufficient_privilege';
  end if;
  delete from public.business_invites where business_id = p_business and token = p_token and accepted_at is null;
end;
$$;

-- Staff only: the owner can't remove themselves.
create function public.remove_staff(p_business uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner can remove staff' using errcode = 'insufficient_privilege';
  end if;
  delete from public.business_members where business_id = p_business and user_id = p_user and role = 'staff';
end;
$$;

-- The owner's team, with names and emails (auth.users isn't readable otherwise).
create function public.team_members(p_business uuid) returns table (user_id uuid, name text, email text, role text, added_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_business) then
    raise exception 'Only the owner sees the team' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id, coalesce(p.display_name, split_part(u.email, '@', 1)), u.email::text, m.role, m.created_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.business_id = p_business
    order by m.role, m.created_at;
end;
$$;

-- The invite page, before signing in: whose invite it is and whether it's still open. The token
-- is the secret; it shows the invited email and the business, nothing else.
create function public.invite_info(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'state', case when i.accepted_at is not null then 'accepted' when i.expires_at <= now() then 'expired' else 'open' end,
    'email', i.email,
    'business', jsonb_build_object('name', b.name, 'logo_path', b.logo_path, 'brand_color', b.brand_color, 'on_brand_color', b.on_brand_color))
  from public.business_invites i join public.businesses b on b.id = i.business_id
  where i.token = p_token and not b.suspended;
$$;

-- Joining: signed in with the invited email. {kind: 'joined', business_id} or why not:
-- 'not_found' | 'accepted' | 'expired' | 'wrong_email' | 'has_business'.
create function public.accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.business_invites%rowtype;
  me text := lower((select u.email from auth.users u where u.id = auth.uid()));
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.business_invites where token = p_token for update;
  if not found then
    return jsonb_build_object('kind', 'not_found');
  end if;
  if exists (select 1 from public.business_members m where m.business_id = i.business_id and m.user_id = auth.uid()) then
    return jsonb_build_object('kind', 'joined', 'business_id', i.business_id);
  end if;
  if i.accepted_at is not null then
    return jsonb_build_object('kind', 'accepted');
  end if;
  if i.expires_at <= now() then
    return jsonb_build_object('kind', 'expired');
  end if;
  if me is distinct from lower(i.email) then
    return jsonb_build_object('kind', 'wrong_email', 'email', i.email);
  end if;
  -- One account is either a business's owner or someone's staff (the dashboard shows one business).
  if exists (select 1 from public.business_members m where m.user_id = auth.uid()) then
    return jsonb_build_object('kind', 'has_business');
  end if;
  insert into public.business_members (business_id, user_id, role) values (i.business_id, auth.uid(), 'staff');
  update public.business_invites set accepted_at = now() where id = i.id;
  return jsonb_build_object('kind', 'joined', 'business_id', i.business_id);
end;
$$;

revoke all on function public.invite_staff(uuid, text), public.cancel_invite(uuid, text), public.remove_staff(uuid, uuid),
  public.team_members(uuid), public.accept_invite(text) from public, anon;
grant execute on function public.invite_staff(uuid, text), public.cancel_invite(uuid, text), public.remove_staff(uuid, uuid),
  public.team_members(uuid), public.accept_invite(text) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
