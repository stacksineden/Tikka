-- Phone copies (lib/media-path.ts): an About, service or portfolio photo uploaded as
-- "{id}.s.webp" has a 1000px copy beside it, "{id}.s-sm.webp", that no row points at. A copy
-- counts as in use while its photo is, so the daily cleanup leaves it alone; once the photo is
-- replaced or removed, both go.
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
  ),
  used as (
    select path from saved
    union all select regexp_replace(path, '\.s\.webp$', '.s-sm.webp') from saved where path ~ '\.s\.webp$'
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
