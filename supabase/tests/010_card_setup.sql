-- Card setup: creating a business gives it a page, a free first drop and its counter poster; the
-- owner edits the card's columns (never verified, suspended or rating), adds posters and sets
-- their line; staff and other owners can't.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-ab00-000000000001', 'owner10@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ab00-000000000002', 'staff10@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ab00-000000000003', 'other10@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ab00-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Setup Test', 'setuptest', 'SE', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF',
  '[{"kind": "whatsapp", "value": "+2348012345678"}]');
reset role;
insert into public.business_members (business_id, user_id, role) select v, '00000000-0000-4000-ab00-000000000002', 'staff' from t where k = 'biz';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ab00-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  p public.posters;
begin
  assert (select count(*) from public.business_page where business_id = biz) = 1, 'a page';
  assert (select count(*) from public.drop_vouchers where business_id = biz and source = 'signup') = 1, 'the free first drop';
  assert (select count(*) from public.posters where business_id = biz and label = 'Shop counter' and code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$') = 1,
    'the counter poster is ready at setup';

  -- The card, edited in place.
  update public.businesses set tagline = 'Hair and nails', about = 'Since 2019.', logo_path = 'logos/x.webp', background_type = 'pattern',
    background_value = 'dots', hours = '{"mon": {"open": true, "from": "09:00", "to": "18:00"}}', serve_mode = 'online', name = 'Setup Test Studio'
  where id = biz;
  assert (select name = 'Setup Test Studio' and background_value = 'dots' and serve_mode = 'online' from public.businesses where id = biz), 'card saved';
  update public.business_private set owner_whatsapp = '+2348012345678', daily_summary = false where business_id = biz;
  assert (select owner_whatsapp = '+2348012345678' and not daily_summary from public.business_private where business_id = biz), 'alerts saved';
  begin
    update public.businesses set verified = true where id = biz;
    raise exception 'an owner verified themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.businesses set rating_avg = 5 where id = biz;
    raise exception 'an owner set their rating';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.business_private set founding_member = true where business_id = biz;
    raise exception 'an owner made themselves a founding member';
  exception when insufficient_privilege then null;
  end;

  -- Posters.
  p := public.add_poster(biz, '  Mall ');
  assert p.label = 'Mall' and p.code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$', 'a second poster';
  assert (select count(distinct code) from public.posters where business_id = biz) = 2, 'its own code';
  perform public.save_poster_hook(p.id, 'Free wash and style and more inside.');
  assert (select hook_line from public.posters where id = p.id) = 'Free wash and style and more inside.', 'line saved';
  perform public.save_poster_hook(p.id, '   ');
  assert (select hook_line is null from public.posters where id = p.id), 'empty goes back to the everyday line';
  begin
    perform public.save_poster_hook(p.id, 'Win big today');
    raise exception 'a gambling word on a poster';
  exception when check_violation then null;
  end;
  begin
    perform public.add_poster(biz, '');
    raise exception 'a poster with no name';
  exception when check_violation then null;
  end;
  begin
    perform public.create_business('Second', 'secondbiz', 'SB', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
    raise exception 'one owner, two businesses';
  exception when unique_violation then null;
  end;
end $$;

-- Staff: no card edits, no posters.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ab00-000000000002","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  update public.businesses set name = 'Staff was here' where id = biz;
  assert (select name from public.businesses where id = biz) = 'Setup Test Studio', 'staff can''t edit the card';
  assert (select count(*) from public.posters) = 0, 'staff don''t see posters';
  begin
    perform public.add_poster(biz, 'Door');
    raise exception 'staff added a poster';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Another owner: nothing of this business.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ab00-000000000003","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  update public.businesses set name = 'Taken over' where id = biz;
  assert (select name from public.businesses where id = biz) = 'Setup Test Studio', 'another owner can''t edit it';
  assert (select count(*) from public.business_private where business_id = biz) = 0, 'nor read its private details';
  begin
    perform public.save_poster_hook((select id from public.posters where business_id = biz limit 1), 'Mine');
    raise exception 'another owner changed a poster';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A scan finds the business from the poster's code, and only that.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  code text;
begin
  reset role;
  code := (select p.code from public.posters p where p.business_id = biz and p.label = 'Shop counter');
  set local role anon;
  assert (select slug from public.poster_target(lower(code))) = 'setuptest', 'the scan finds the business';
  assert (select count(*) from public.poster_target('AAAAAA')) = 0, 'an unknown code finds nothing';
  assert (select count(*) from public.posters) = 0, 'visitors still can''t read posters';
end $$;

rollback;
