-- Foundation tests (run: pnpm test:db). Everything happens inside one transaction that's rolled
-- back, so nothing is left behind. A failed check raises an exception and stops the run.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-a000-000000000001', 'owner@test.tikka', '{"name":"Funmi"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000002', 'staff@test.tikka', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000003', 'stranger@test.tikka', '{}', 'authenticated', 'authenticated');

do $$ begin
  assert (select count(*) from public.profiles where user_id::text like '00000000-0000-4000-a000-00000000000%') = 3, 'every sign-up gets a profile';
  assert (select display_name from public.profiles where user_id = '00000000-0000-4000-a000-000000000001') = 'Funmi', 'profile takes the sign-up name';
  assert not (select is_admin from public.profiles where user_id = '00000000-0000-4000-a000-000000000001'), 'nobody starts as admin';
end $$;

-- ------------------------------------------------- the owner sets up
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into t select 'biz', public.create_business('Test Studio', 'teststudio', 'TS', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');

do $$ begin
  assert private.is_owner((select v from t where k = 'biz')), 'the creator is the owner';
  assert (select count(*) from public.business_private where business_id = (select v from t where k = 'biz')) = 1, 'owner reads private details';
  -- Owner can edit their page fields…
  update public.businesses set tagline = 'Glow-ups' where id = (select v from t where k = 'biz');
  assert (select tagline from public.businesses where id = (select v from t where k = 'biz')) = 'Glow-ups', 'owner edits their page';
  -- …but not Tikka's fields.
  begin
    update public.businesses set verified = true where id = (select v from t where k = 'biz');
    raise exception 'owner was able to verify themselves';
  exception when insufficient_privilege then null;
  end;
  -- One business per owner.
  begin
    perform public.create_business('Second', 'secondbiz', 'SB', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
    raise exception 'owner created a second business';
  exception when unique_violation then null;
  end;
  -- Nobody can make themselves an admin.
  begin
    update public.profiles set is_admin = true where user_id = auth.uid();
    raise exception 'user made themselves an admin';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Reserved addresses are refused.
do $$ begin
  begin
    insert into public.businesses (name, slug, code_prefix, category, state, city, area, brand_color, on_brand_color)
    values ('Clash', 'drops', 'CL', 'Beauty', 'Lagos', 'Lagos', 'Ikeja', '#000000', '#FFFFFF');
    raise exception 'a reserved slug was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Add a staff member (the invite flow does this later).
insert into public.business_members (business_id, user_id, role)
select v, '00000000-0000-4000-a000-000000000002', 'staff' from t where k = 'biz';

-- -------------------------------------------------- staff (rule 4)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert private.is_member((select v from t where k = 'biz')), 'staff are members';
  assert not private.is_owner((select v from t where k = 'biz')), 'staff are not owners';
  assert (select count(*) from public.business_private) = 0, 'staff never see owner-only details';
  update public.businesses set tagline = 'Hacked' where id = (select v from t where k = 'biz');
  assert (select tagline from public.businesses where id = (select v from t where k = 'biz')) = 'Glow-ups', 'staff cannot edit the page';
end $$;

-- ---------------------------------------------------------- a stranger
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.businesses where id = (select v from t where k = 'biz')) = 1, 'business pages are public';
  assert (select count(*) from public.business_private) = 0, 'strangers never see owner-only details';
  assert (select count(*) from public.business_members where business_id = (select v from t where k = 'biz')) = 0, 'strangers never see the team';
  update public.businesses set tagline = 'Hacked' where id = (select v from t where k = 'biz');
  assert (select tagline from public.businesses where id = (select v from t where k = 'biz')) = 'Glow-ups', 'strangers cannot edit';
end $$;

-- ------------------------------------------------- an anonymous visitor
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  assert (select count(*) from public.businesses where slug = 'teststudio') = 1, 'anyone can open a business page';
  assert (select count(*) from public.business_private) = 0, 'anonymous visitors never see owner-only details';
  assert (select count(*) from public.business_members) = 0, 'anonymous visitors never see teams';
end $$;

reset role;
-- A suspended business disappears for the public.
update public.businesses set suspended = true where slug = 'teststudio';
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from public.businesses where slug = 'teststudio') = 0, 'suspended businesses are hidden';
end $$;

reset role;
select 'foundation: all checks passed' as result;
rollback;
