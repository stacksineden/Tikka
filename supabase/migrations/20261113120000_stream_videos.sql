-- Videos on Bunny Stream (lib/stream.ts). The owner's phone uploads straight to Bunny with a
-- one-time pass from the server; Bunny shrinks it for phones; the saved video points at the small
-- MP4 as "stream/{guid}/play_480p.mp4" (lib/media-path.ts turns that into its address), in
-- businesses.video_path or business_portfolio.image_path, as Storage paths are.
--
-- stream_videos records who uploaded which video, so the server only answers about your own
-- videos, and so the daily job can delete videos nothing points at any more (replaced, removed,
-- or never saved) from Bunny, a day after upload. Server only: no grants, RLS on with no policies.

create table public.stream_videos (
  guid uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.stream_videos enable row level security;
revoke all on public.stream_videos from public, anon, authenticated;
create index stream_videos_created on public.stream_videos (created_at);

-- Videos nothing points at, oldest first, uploaded more than p_older_than ago.
create function public.orphan_stream_videos(p_older_than interval default interval '1 day', p_limit int default 100)
returns table (guid uuid)
language sql stable security definer set search_path = '' as $$
  select v.guid
  from public.stream_videos v
  where v.created_at < now() - p_older_than
    and not exists (select 1 from public.businesses b where b.video_path like 'stream/' || v.guid || '/%')
    and not exists (select 1 from public.business_portfolio p where p.image_path like 'stream/' || v.guid || '/%')
  order by v.created_at
  limit greatest(p_limit, 0);
$$;

revoke all on function public.orphan_stream_videos(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_stream_videos(interval, int) to service_role;
