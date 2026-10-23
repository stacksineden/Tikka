-- File storage (TECH_PLAN §14). Two public buckets: business pages and claim pages are public,
-- so their images and videos are too. Files sit under the uploader's own folder
-- ({user id}/{kind}/{file}), so a logo can go up during card setup before the business exists.
-- Only that person can add, replace or remove files there; staff can't upload at all.
-- The browser shrinks every image before it's sent (lib/media-client.ts); these limits are the
-- backstop.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('images', 'images', true, 2 * 1024 * 1024, array['image/webp', 'image/png', 'image/jpeg']),
  ('videos', 'videos', true, 20 * 1024 * 1024, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Their own folder, and not a staff member.
create function private.may_upload(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and not exists (select 1 from public.business_members m where m.user_id = (select auth.uid()) and m.role = 'staff');
$$;
revoke all on function private.may_upload(text) from public, anon;
grant execute on function private.may_upload(text) to authenticated;

create policy "owners upload to their folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('images', 'videos') and private.may_upload(name));
create policy "owners replace their files" on storage.objects for update to authenticated
  using (bucket_id in ('images', 'videos') and private.may_upload(name))
  with check (bucket_id in ('images', 'videos') and private.may_upload(name));
create policy "owners remove their files" on storage.objects for delete to authenticated
  using (bucket_id in ('images', 'videos') and private.may_upload(name));
