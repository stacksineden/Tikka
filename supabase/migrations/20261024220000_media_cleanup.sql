-- Files nothing points at any more (TECH_PLAN §13: "replaced files aren't deleted yet"): an owner
-- swapped their logo, cover, photos or video, or removed a portfolio item. On the free plan's 1 GB
-- they add up. This lists them; the daily job removes them through the Storage API (SQL can't
-- delete stored files). A file has to be a week old first: card setup uploads the logo before the
-- business exists, and someone may finish setting up days later.
create function public.orphan_media(p_older_than interval default interval '7 days', p_limit int default 500)
returns table (bucket text, name text)
language sql stable security definer set search_path = '' as $$
  with used as (
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
