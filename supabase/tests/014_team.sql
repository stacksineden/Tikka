-- Staff: owners invite by email; only the invited email can join; staff redeem but never see
-- claims, leads or numbers; owners see the team and can remove staff, who then can't redeem.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-af00-000000000001', 'owner14@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-af00-000000000002', 'tobi14@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-af00-000000000003', 'someone14@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-af00-000000000004', 'owner14b@test.tikka', 'authenticated', 'authenticated');
update public.profiles set display_name = 'Tobi' where user_id = '00000000-0000-4000-af00-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000004","role":"authenticated"}', true);
select public.create_business('Other Fourteen', 'otherfourteen', 'OF', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Team Test', 'teamtest', 'TT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF')::text;

do $$
declare
  biz uuid := (select v::uuid from t where k = 'biz');
  r jsonb;
  first text;
begin
  assert public.invite_staff(biz, 'not an email') ->> 'kind' = 'bad_email', 'bad email';
  assert public.invite_staff(biz, 'OWNER14@test.tikka') ->> 'kind' = 'own_email', 'your own email';
  r := public.invite_staff(biz, ' Tobi14@Test.Tikka ');
  assert r ->> 'kind' = 'invited' and r ->> 'email' = 'tobi14@test.tikka', 'invited, tidied: ' || r::text;
  assert r ->> 'token' ~ '^[A-Za-z0-9_-]{20,}$', 'a link-safe token: ' || (r ->> 'token');
  first := r ->> 'token';
  r := public.invite_staff(biz, 'tobi14@test.tikka');
  assert r ->> 'token' <> first, 'inviting again makes a new link';
  assert (select count(*) from public.business_invites where business_id = biz and accepted_at is null) = 1, 'and replaces the old one';
  insert into t values ('tok', r ->> 'token'), ('old', first);
  perform public.invite_staff(biz, 'someone14@test.tikka');
  insert into t select 'tok2', token from public.business_invites where email = 'someone14@test.tikka';
end $$;

-- The invite page, signed out.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare r jsonb := public.invite_info((select v from t where k = 'tok'));
begin
  assert r ->> 'state' = 'open' and r ->> 'email' = 'tobi14@test.tikka' and r -> 'business' ->> 'name' = 'Team Test', 'invite page: ' || r::text;
  assert public.invite_info((select v from t where k = 'old')) is null, 'a replaced link opens nothing';
  assert (select count(*) from public.business_invites) = 0, 'visitors can''t list invites';
  begin
    perform public.accept_invite((select v from t where k = 'tok'));
    raise exception 'anon accepted an invite';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The wrong person, then the right one.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000003","role":"authenticated"}', true);
do $$ begin
  assert public.accept_invite((select v from t where k = 'tok')) ->> 'kind' = 'wrong_email', 'only the invited email can join';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000004","role":"authenticated"}', true);
do $$ begin
  assert public.accept_invite((select v from t where k = 'tok2')) ->> 'kind' = 'wrong_email', 'another owner, wrong email';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000002","role":"authenticated"}', true);
do $$
declare biz uuid := (select v::uuid from t where k = 'biz');
begin
  assert public.accept_invite((select v from t where k = 'tok')) ->> 'kind' = 'joined', 'Tobi joins';
  assert public.accept_invite((select v from t where k = 'tok')) ->> 'kind' = 'joined', 'opening the link again is fine';
  assert (select role from public.business_members where business_id = biz and user_id = auth.uid()) = 'staff', 'as staff';
  -- Staff redeem, but see no numbers.
  assert public.check_code(biz, 'TT-AAAAA') ->> 'kind' = 'unknown', 'staff can check codes';
  assert (select count(*) from public.claims) = 0 and (select count(*) from public.leads) = 0, 'staff never read claims or leads';
  begin
    perform public.invite_staff(biz, 'friend@test.tikka');
    raise exception 'staff invited someone';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.team_members(biz);
    raise exception 'staff read the team';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The owner: the team, then removing Tobi.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v::uuid from t where k = 'biz');
begin
  assert (select count(*) from public.team_members(biz)) = 2, 'owner and Tobi';
  assert (select name = 'Tobi' and email = 'tobi14@test.tikka' and role = 'staff' from public.team_members(biz) where role = 'staff'), 'with name and email';
  assert public.invite_staff(biz, 'tobi14@test.tikka') ->> 'kind' = 'already_staff', 'already on the team';
  perform public.cancel_invite(biz, (select v from t where k = 'tok2'));
  assert (select count(*) from public.business_invites where token = (select v from t where k = 'tok2')) = 0, 'invite cancelled';
  perform public.remove_staff(biz, '00000000-0000-4000-af00-000000000001');
  assert (select count(*) from public.business_members where business_id = biz and role = 'owner') = 1, 'the owner can''t be removed';
  perform public.remove_staff(biz, '00000000-0000-4000-af00-000000000002');
  assert (select count(*) from public.team_members(biz)) = 1, 'Tobi removed';
end $$;

-- Removed staff can't redeem any more.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-af00-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.check_code((select v::uuid from t where k = 'biz'), 'TT-AAAAA');
    raise exception 'removed staff checked a code';
  exception when insufficient_privilege then null;
  end;
end $$;

-- An expired invite.
reset role;
update public.business_invites set expires_at = now() - interval '1 minute', accepted_at = null where token = (select v from t where k = 'tok');
set local role authenticated;
do $$ begin
  assert public.accept_invite((select v from t where k = 'tok')) ->> 'kind' = 'expired', 'expired';
end $$;

rollback;
