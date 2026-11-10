-- Phone copies: a photo's "{id}.s-sm.webp" copy is kept while the photo is in use, and listed for
-- removal with it once the photo is gone.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c032-000000000001', 'owner32@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c032-000000000001","role":"authenticated"}', true);
select public.create_business('Copies Test', 'copiestest', 'CT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

insert into storage.objects (bucket_id, name, owner, created_at) values
  ('images', '00000000-0000-4000-c032-000000000001/service/kept.s.webp', '00000000-0000-4000-c032-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-c032-000000000001/service/kept.s-sm.webp', '00000000-0000-4000-c032-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-c032-000000000001/service/gone.s.webp', '00000000-0000-4000-c032-000000000001', now() - interval '20 days'),
  ('images', '00000000-0000-4000-c032-000000000001/service/gone.s-sm.webp', '00000000-0000-4000-c032-000000000001', now() - interval '20 days');

insert into public.business_services (business_id, name, price_kind, image_path)
select id, 'Kept', 'ask', 'images/00000000-0000-4000-c032-000000000001/service/kept.s.webp' from public.businesses where slug = 'copiestest';

do $$
declare
  orphans text[] := (select array_agg(bucket || '/' || name order by name) from public.orphan_media() where name like '00000000-0000-4000-c032-000000000001/%');
begin
  assert orphans = array[
    'images/00000000-0000-4000-c032-000000000001/service/gone.s-sm.webp',
    'images/00000000-0000-4000-c032-000000000001/service/gone.s.webp'
  ], 'only the removed photo and its copy: ' || coalesce(orphans::text, 'none');
end $$;

rollback;
