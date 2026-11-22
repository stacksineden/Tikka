-- The Photography style: the owner (never staff) sets the page style; photo details are checked;
-- anyone reads them; photographers' ready-made offers are there.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c055-000000000001', 'owner55@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c055-000000000002', 'staff55@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c055-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Imole Studio', 'imole55', 'IM', 'Photography', 'Lagos', 'Lagos', 'Lekki', '#B08D57', '#17112F');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c055-000000000002', 'staff');

-- The owner sets the style, and a photo with its shape, colour and camera settings.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c055-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert (select style from public.business_page where business_id = biz) is null, 'a new page follows its category';
  update public.business_page set style = 'photography' where business_id = biz;
  assert (select style from public.business_page where business_id = biz) = 'photography', 'the owner sets the style';
  update public.business_page set style = null where business_id = biz;
  assert (select style from public.business_page where business_id = biz) is null, 'the owner can go back to following the category';

  insert into public.business_portfolio (business_id, image_path, thumb_path, width, height, tone, camera)
  values (biz, 'media/p1.webp', 'media/p1-t.webp', 1600, 2000, '#b98a4e',
    '{"camera":"Canon EOS R5","lens":"RF 85mm F1.2 L","aperture":"f/1.8","shutter":"1/200s","iso":"ISO 100"}');
  assert (select width from public.business_portfolio where business_id = biz) = 1600, 'the photo keeps its width';

  begin
    update public.business_page set style = 'neon' where business_id = biz;
    raise exception 'an unknown style should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path, tone) values (biz, 'media/p2.webp', 'media/p2-t.webp', 'gold');
    raise exception 'a tone that is not a colour should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path, width) values (biz, 'media/p3.webp', 'media/p3-t.webp', 1600);
    raise exception 'a width without a height should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path, camera) values (biz, 'media/p4.webp', 'media/p4-t.webp', jsonb_build_object('camera', repeat('x', 400)));
    raise exception 'oversized camera details should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path, camera) values (biz, 'media/p5.webp', 'media/p5-t.webp', '["Canon"]');
    raise exception 'camera details that are not an object should be refused';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Staff can't change the page style.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c055-000000000002","role":"authenticated"}', true);
update public.business_page set style = 'beauty' where business_id = (select v from t where k = 'biz');
reset role;
do $$
begin
  assert (select style from public.business_page where business_id = (select v from t where k = 'biz')) is null, 'staff cannot change the style';
end $$;

-- Anyone reads the style and the photo details; photographers have their own ready-made offers.
set local role anon;
do $$
begin
  assert exists (select 1 from public.business_page where business_id = (select v from t where k = 'biz')), 'anon reads the page';
  assert (select tone from public.business_portfolio where business_id = (select v from t where k = 'biz') limit 1) = '#b98a4e', 'anon reads the photo colour';
  assert (select count(*) from public.drop_templates where category = 'photography' and active) = 6, 'six photography offers';
end $$;
reset role;

rollback;
