-- Bunny Stream videos: nobody but the server reads stream_videos, and the daily job only deletes
-- videos nothing points at, a day after upload.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c035-000000000001', 'owner35@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c035-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Stream Videos', 'streamvideos', 'SV', 'Beauty', 'Enugu', 'Enugu', 'Independence Layout', '#9C3B5C', '#FFFFFF');
reset role;

insert into t values
  ('card', 'a0000000-0000-4000-8035-000000000001'),
  ('folio', 'a0000000-0000-4000-8035-000000000002'),
  ('dropped', 'a0000000-0000-4000-8035-000000000003'),
  ('fresh', 'a0000000-0000-4000-8035-000000000004');

insert into public.stream_videos (guid, user_id, created_at)
select v, '00000000-0000-4000-c035-000000000001', case when k = 'fresh' then now() else now() - interval '2 days' end
from t where k in ('card', 'folio', 'dropped', 'fresh');

update public.businesses set video_path = 'stream/' || (select v from t where k = 'card') || '/play_480p.mp4'
where id = (select v from t where k = 'biz');
insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s)
values ((select v from t where k = 'biz'), 'video', 'stream/' || (select v from t where k = 'folio') || '/play_360p.mp4', 'images/x/portfolio/p.webp', 12);

do $$
declare
  got uuid[];
begin
  select array_agg(guid) into got from public.orphan_stream_videos();
  assert got = array[(select v from t where k = 'dropped')], 'only the unused, older video: ' || coalesce(got::text, 'none');

  -- Removed from the page: it goes too.
  delete from public.business_portfolio where business_id = (select v from t where k = 'biz');
  select array_agg(guid order by guid) into got from public.orphan_stream_videos();
  assert got = array[(select v from t where k = 'folio'), (select v from t where k = 'dropped')], 'removed portfolio video: ' || coalesce(got::text, 'none');
end $$;

-- Owners can't read the table or call the function.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c035-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.stream_videos;
    assert false, 'stream_videos is server only';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.orphan_stream_videos();
    assert false, 'orphan_stream_videos is server only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
