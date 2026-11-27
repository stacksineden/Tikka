-- Blurred copies: a photo's "{name}-xs.webp" copy (and a phone copy's) is kept while the photo is in
-- use, and listed for removal with it once the photo is gone.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c084-000000000001', 'owner84@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c084-000000000001","role":"authenticated"}', true);
select public.create_business('Blur Test', 'blurtest84', 'BT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

insert into storage.objects (bucket_id, name, owner, created_at)
select 'images', '00000000-0000-4000-c084-000000000001/service/' || n, '00000000-0000-4000-c084-000000000001', now() - interval '20 days'
from unnest(array['kept.s.webp', 'kept.s-sm.webp', 'kept.s-xs.webp', 'gone.s.webp', 'gone.s-sm.webp', 'gone.s-xs.webp', 'old.webp', 'old-xs.webp']) n;

insert into public.business_services (business_id, name, price_kind, image_path)
select id, 'Kept', 'ask', 'images/00000000-0000-4000-c084-000000000001/service/kept.s.webp' from public.businesses where slug = 'blurtest84'
union all
select id, 'Old', 'ask', 'images/00000000-0000-4000-c084-000000000001/service/old.webp' from public.businesses where slug = 'blurtest84';

do $$
declare
  orphans text[] := (select array_agg(bucket || '/' || name order by name) from public.orphan_media() where name like '00000000-0000-4000-c084-000000000001/%');
begin
  assert orphans = array[
    'images/00000000-0000-4000-c084-000000000001/service/gone.s-sm.webp',
    'images/00000000-0000-4000-c084-000000000001/service/gone.s-xs.webp',
    'images/00000000-0000-4000-c084-000000000001/service/gone.s.webp'
  ], 'only the removed photo and its copies: ' || coalesce(orphans::text, 'none');
end $$;

rollback;
