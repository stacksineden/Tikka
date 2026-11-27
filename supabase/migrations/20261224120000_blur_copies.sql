-- Blurred copies (27 Nov 2026): every photo uploaded to the images bucket gets a tiny copy beside it,
-- "{name}-xs.webp" (about 24px wide, a few hundred bytes), shown blurred in the photo's box until the
-- photo itself has loaded (lib/blur.ts). The daily clean-up keeps a copy while its photo is in use
-- and lists it for removal with the photo (same as before otherwise).

create or replace function public.orphan_media(p_older_than interval default interval '7 days', p_limit int default 500)
returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  with saved as (
    select logo_path as path from public.businesses
    union all select background_value from public.businesses where background_type = 'photo'
    union all select video_path from public.businesses
    union all select video_poster_path from public.businesses
    union all select hero_image_path from public.business_page
    union all select about_image_path from public.business_page
    union all select image_path from public.business_services
    union all select image_path from public.business_portfolio
    union all select thumb_path from public.business_portfolio
    union all select photo_path from public.business_team
    union all select image_path from public.business_space_photos
    union all select thumb_path from public.business_space_photos
  ),
  used as (
    select path from saved
    union all select regexp_replace(path, '\.s\.webp$', '.s-sm.webp') from saved where path ~ '\.s\.webp$'
    union all select regexp_replace(path, '\.webp$', '-xs.webp') from saved where path ~ '\.webp$'
  )
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('images', 'videos')
    and o.created_at < now() - p_older_than
    and not exists (select 1 from used u where u.path = o.bucket_id || '/' || o.name)
  order by o.created_at
  limit greatest(p_limit, 0);
$$;
revoke all on function public.orphan_media(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_media(interval, int) to service_role;
