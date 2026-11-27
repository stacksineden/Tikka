-- Portfolio collections: every page can have up to 8 collections (free since 27 Nov 2026); the
-- free page has room for 20 items; the free first drop doesn't add room; a paid drop does, until 7
-- days after it ends; a season pack and founding members too. Once closed nothing is hidden or
-- removed and collections still change, but the free limits are back. Removing a photo always
-- works. Only the owner changes them, and never another business's.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b700-000000000001', 'owner37@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b700-000000000002', 'staff37@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b700-000000000003', 'other37@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Work', 'otherwork', 'OW', 'Beauty', 'Oyo', 'Ogbomoso', 'Under G', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Work Test', 'worktest', 'WT', 'Beauty', 'Oyo', 'Ogbomoso', 'Under G', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select v, '00000000-0000-4000-b700-000000000002', 'staff' from t where k = 'biz';

create function pg_temp.draft(p_slug text, p_total int, p_days int) returns jsonb language sql as $$
  select jsonb_build_object('slug', p_slug, 'title', 'Drop ' || p_slug, 'total_cards', p_total,
    'starts_at', now(), 'ends_at', now() + make_interval(days => p_days), 'validity_days', 14,
    'rewards', jsonb_build_array(
      jsonb_build_object('tier', 'legendary', 'kind', 'free_item', 'title', 'Free set', 'quantity', 1),
      jsonb_build_object('tier', 'rare', 'kind', 'percent_off', 'value', 30, 'title', '30% off', 'quantity', 9),
      jsonb_build_object('tier', 'common', 'kind', 'percent_off', 'value', 10, 'title', '10% off', 'quantity', p_total - 10)));
$$;
create function pg_temp.photos(p_business uuid, p_from int, p_to int, p_collection uuid default null) returns void language sql as $$
  insert into public.business_portfolio (business_id, image_path, thumb_path, position, collection_id)
  select p_business, 'w' || g || '.webp', 'w' || g || '-t.webp', g, p_collection from generate_series(p_from, p_to) g;
$$;

-- ------------------------------------------------- the free page
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  plan jsonb := public.portfolio_plan(biz);
  d uuid;
begin
  assert plan = '{"open": false, "reason": null, "until": null, "items": 20, "videos": 3, "collections": 8}', 'free: ' || plan::text;
  perform pg_temp.photos(biz, 1, 17);
  insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes)
  select biz, 'video', 'v' || g || '.mp4', 'v' || g || '.webp', 10, 1000 from generate_series(1, 3) g;
  begin
    perform pg_temp.photos(biz, 21, 21);
    raise exception 'a twenty-first item on the free page';
  exception when check_violation then null;
  end;
  delete from public.business_portfolio where business_id = biz and image_path = 'w17.webp';
  begin
    insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes) values (biz, 'video', 'v4.mp4', 'v4.webp', 5, 1000);
    raise exception 'a fourth video on the free page';
  exception when check_violation then null;
  end;
  -- Collections are free: one made and removed on the free page.
  d := public.save_collection(biz, null, 'Bridal');
  perform public.remove_collection(biz, d);
  d := null;

  -- The free first drop doesn't open collections.
  d := public.save_drop_draft(biz, null, pg_temp.draft('first', 150, 5));
  assert public.publish_drop(d) ->> 'source' = 'signup', 'the first drop is free';
  assert not (public.portfolio_plan(biz) ->> 'open')::boolean, 'the free first drop opens nothing';
  perform public.end_drop_early(d);

  -- A paid drop: nothing opens until the money arrives.
  d := public.save_drop_draft(biz, null, pg_temp.draft('paid', 250, 10));
  insert into t values ('paid', d);
  create temp table ref on commit drop as select public.publish_drop(d) ->> 'reference' as r;
  assert not (public.portfolio_plan(biz) ->> 'open')::boolean, 'a pending payment opens nothing';
end $$;

reset role;
do $$ begin
  assert public.complete_payment((select r from ref), 1000000) ->> 'kind' in ('published', 'paid'), 'paid';
end $$;

-- ------------------------------------------------- open
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  other uuid := (select v from t where k = 'other');
  plan jsonb := public.portfolio_plan(biz);
  bridal uuid;
  gele uuid;
  again uuid;
  ids uuid[];
  page jsonb;
begin
  assert (plan ->> 'open')::boolean and plan ->> 'reason' = 'drop' and (plan ->> 'items')::int = 60 and (plan ->> 'videos')::int = 8
    and (plan ->> 'collections')::int = 8, 'a paid drop opens it: ' || plan::text;
  assert (plan ->> 'until')::timestamptz = (select ends_at + interval '7 days' from public.drops where id = (select v from t where k = 'paid')),
    'until 7 days after the drop ends';

  bridal := public.save_collection(biz, null, '  Bridal & Gele ', 'Bridal makeup');
  gele := public.save_collection(biz, null, 'Gele');
  again := public.save_collection(biz, null, 'Bridal Gele');
  assert (select name = 'Bridal & Gele' and slug = 'bridal-gele' and service_name = 'Bridal makeup' and position = 0 from public.business_collections where id = bridal), 'named, with a link';
  assert (select slug from public.business_collections where id = again) = 'bridal-gele-2', 'links never clash';
  begin
    perform public.save_collection(biz, null, 'Lucky dip');
    raise exception 'a gambling word in a collection name';
  exception when check_violation then null;
  end;

  -- Filing photos, and uploading straight into a collection.
  select array_agg(id) into ids from (select id from public.business_portfolio where business_id = biz and kind = 'photo' order by position limit 5) x;
  assert public.file_portfolio(biz, ids, bridal) = 5, 'five photos filed';
  perform pg_temp.photos(biz, 30, 34, gele);
  assert (select count(*) from public.business_portfolio where collection_id = gele) = 5, 'uploaded into a collection';
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path, collection_id)
    values (biz, 'x.webp', 'x-t.webp', (select public.save_collection(other, null, 'Theirs')));
    raise exception 'made a collection for another business';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.business_portfolio set collection_id = gele where business_id = biz and collection_id = bridal;
    raise exception 'filed photos without asking the server';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.business_collections (business_id, name, slug) values (biz, 'Direct', 'direct');
    raise exception 'wrote a collection directly';
  exception when insufficient_privilege then null;
  end;

  -- Cover, rename (the link stays), order.
  perform public.save_collection(biz, bridal, 'Bridal', 'Bridal makeup', ids[2]);
  assert (select name = 'Bridal' and slug = 'bridal-gele' and cover_id = ids[2] from public.business_collections where id = bridal), 'renamed, same link, cover set';
  perform public.save_collection(biz, gele, 'Gele', null, ids[1]);
  assert (select cover_id is null from public.business_collections where id = gele), 'a cover has to be one of its own photos';
  assert public.file_portfolio(biz, array[ids[2]], null) = 1, 'moved out';
  assert (select cover_id is null from public.business_collections where id = bridal), 'a cover that left stops being the cover';
  perform public.order_collections(biz, array[gele, again, bridal]);
  assert (select array_agg(name::text order by position) from public.business_collections where business_id = biz) = array['Gele', 'Bridal Gele', 'Bridal'], 'reordered';
  perform public.remove_collection(biz, again);

  -- Up to 60 items, 8 videos and 8 collections.
  perform pg_temp.photos(biz, 100, 135);
  assert (select count(*) from public.business_portfolio where business_id = biz) = 60, 'sixty';
  begin
    perform pg_temp.photos(biz, 200, 200);
    raise exception 'a sixty-first item';
  exception when check_violation then null;
  end;
  for i in 1..6 loop
    perform public.save_collection(biz, null, 'More ' || i);
  end loop;
  begin
    perform public.save_collection(biz, null, 'Ninth');
    raise exception 'a ninth collection';
  exception when check_violation then null;
  end;

  -- Everyone sees them on the page.
  page := public.get_business_page('worktest');
  assert jsonb_array_length(page -> 'collections') = 8 and page -> 'collections' -> 0 ->> 'name' = 'Gele' and (page -> 'collections' -> 0 ->> 'items')::int = 5,
    'collections on the page: ' || (page -> 'collections')::text;
  assert (select count(*) from jsonb_array_elements(page -> 'portfolio') x where x ->> 'collection_id' = bridal::text) = 4, 'each photo says where it sits';
  insert into t values ('bridal', bridal), ('gele', gele);
end $$;

-- ------------------------------------------------- staff, strangers, visitors
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000002","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert (public.portfolio_plan(biz) ->> 'open')::boolean, 'staff can read the plan';
  begin
    perform public.save_collection(biz, null, 'Staff');
    raise exception 'staff made a collection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.file_portfolio(biz, array[]::uuid[], null);
    raise exception 'staff filed photos';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000003","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  begin
    perform public.portfolio_plan(biz);
    raise exception 'another owner read the plan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_collection(biz, (select v from t where k = 'gele'));
    raise exception 'another owner removed a collection';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from public.business_collections where business_id = (select v from t where k = 'biz')) = 8, 'visitors read collections';
  begin
    perform public.save_collection((select v from t where k = 'biz'), null, 'Anon');
    raise exception 'a visitor made a collection';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------- closed: 8 days after the drop ended
reset role;
update public.drops set starts_at = now() - interval '20 days', ends_at = now() - interval '8 days' where id = (select v from t where k = 'paid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  bridal uuid := (select v from t where k = 'bridal');
  gele uuid := (select v from t where k = 'gele');
  plan jsonb := public.portfolio_plan(biz);
  one uuid;
begin
  assert not (plan ->> 'open')::boolean and (plan ->> 'items')::int = 20 and plan ->> 'until' is null, 'closed: ' || plan::text;
  -- Nothing is hidden or removed.
  assert (select count(*) from public.business_portfolio where business_id = biz) = 60, 'every photo stays';
  assert jsonb_array_length(public.get_business_page('worktest') -> 'collections') = 8, 'every collection stays on the page';

  -- Collections still change while closed (they're free): renamed, reordered, filled.
  perform public.save_collection(biz, bridal, 'Renamed');
  assert (select name from public.business_collections where id = bridal) = 'Renamed', 'renamed while closed';
  perform public.save_collection(biz, bridal, 'Bridal');
  perform public.file_portfolio(biz, array[]::uuid[], bridal);
  begin
    perform pg_temp.photos(biz, 300, 300);
    raise exception 'an upload over the free limit while closed';
  exception when check_violation then null;
  end;

  -- Removing a photo always works, and captions too.
  select id into one from public.business_portfolio where collection_id = gele limit 1;
  update public.business_portfolio set caption = 'Still mine' where id = one;
  delete from public.business_portfolio where id = one;
  assert (select count(*) from public.business_portfolio where collection_id = gele) = 4, 'removed while closed';

  -- Back under the free limit, uploads work again, into a collection too.
  delete from public.business_portfolio where business_id = biz and collection_id is null;
  assert (select count(*) from public.business_portfolio where business_id = biz) < 20, 'under the free limit';
  perform pg_temp.photos(biz, 400, 400);
  perform pg_temp.photos(biz, 401, 401, gele);
  assert (select count(*) from public.business_portfolio where business_id = biz and image_path = 'w401.webp' and collection_id = gele) = 1, 'into a collection while closed';
end $$;

-- ------------------------------------------------- a season pack, and founding members
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
create temp table packref on commit drop as select public.buy_pack((select v from t where k = 'biz'), 'medium3') ->> 'reference' as r;
reset role;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  plan jsonb;
begin
  perform public.complete_payment((select r from packref), 2500000);
  select * into plan from to_jsonb(private.portfolio_window(biz));
  assert (plan ->> 'is_open')::boolean and plan ->> 'reason' = 'pack', 'a season pack keeps it open: ' || plan::text;
  -- A pack that ran out of time opens nothing.
  update public.drop_vouchers set expires_at = now() - interval '1 day' where business_id = biz and source = 'pack';
  assert not private.portfolio_open(biz), 'an expired pack';

  update public.business_private set founding_member = true where business_id = biz;
  select * into plan from to_jsonb(private.portfolio_window(biz));
  assert (plan ->> 'is_open')::boolean and plan ->> 'reason' = 'founding', 'founding members: ' || plan::text;

  -- Removing a collection (Tikka, or the business going) never loses a photo.
  delete from public.business_collections where id = (select v from t where k = 'gele');
  assert (select count(*) from public.business_portfolio where business_id = biz and image_path like 'w3_.webp' and collection_id is null) = 4, 'photos stay, unfiled';
  delete from public.businesses where id = biz;
  assert (select count(*) from public.business_collections where business_id = biz) = 0, 'gone with the business';
end $$;

rollback;
