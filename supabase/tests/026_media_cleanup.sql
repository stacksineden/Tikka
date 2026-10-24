-- Unused files: a replaced logo and a removed photo are listed; files in use, files under a week
-- old and other buckets never are; only the server may ask.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-bb00-000000000001', 'owner26@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-bb00-000000000001","role":"authenticated"}', true);
select public.create_business('Cleanup Test', 'cleanuptest', 'CU', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

-- Files: the logo in use, an old logo it replaced, a cover in use, a portfolio photo in use,
-- a removed portfolio photo, a fresh upload not saved yet, and a video in use.
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('images', '00000000-0000-4000-bb00-000000000001/logo/new.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-bb00-000000000001/logo/old.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '30 days'),
  ('images', '00000000-0000-4000-bb00-000000000001/background/cover.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-bb00-000000000001/portfolio/kept.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-bb00-000000000001/portfolio/removed.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-bb00-000000000001/logo/fresh.webp', '00000000-0000-4000-bb00-000000000001', now() - interval '1 day'),
  ('videos', '00000000-0000-4000-bb00-000000000001/video/clip.mp4', '00000000-0000-4000-bb00-000000000001', now() - interval '20 days');

update public.businesses set
  logo_path = 'images/00000000-0000-4000-bb00-000000000001/logo/new.webp',
  background_type = 'photo', background_value = 'images/00000000-0000-4000-bb00-000000000001/background/cover.webp',
  video_path = 'videos/00000000-0000-4000-bb00-000000000001/video/clip.mp4'
where slug = 'cleanuptest';
insert into public.business_portfolio (business_id, kind, image_path, thumb_path, position)
select id, 'photo', 'images/00000000-0000-4000-bb00-000000000001/portfolio/kept.webp', 'images/00000000-0000-4000-bb00-000000000001/portfolio/kept.webp', 0
from public.businesses where slug = 'cleanuptest';

do $$
declare
  orphans text[] := (select array_agg(bucket || '/' || name order by name) from public.orphan_media() where name like '00000000-0000-4000-bb00-000000000001/%');
begin
  assert orphans = array[
    'images/00000000-0000-4000-bb00-000000000001/logo/old.webp',
    'images/00000000-0000-4000-bb00-000000000001/portfolio/removed.webp'
  ], 'only the replaced logo and the removed photo: ' || coalesce(orphans::text, 'none');
end $$;

set local role anon;
do $$ begin
  begin
    perform count(*) from public.orphan_media();
    raise exception 'anon listed files';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
