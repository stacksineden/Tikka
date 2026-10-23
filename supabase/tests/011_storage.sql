-- File storage: owners (and people setting up a business) upload only into their own folder;
-- staff and anonymous visitors can't upload; buckets are public with size and type limits.
-- (Removing files goes through the Storage API with the same folder rule; Supabase blocks SQL deletes.)
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-ac00-000000000001', 'owner11@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ac00-000000000002', 'staff11@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-ac00-000000000003', 'new11@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ac00-000000000001","role":"authenticated"}', true);
select public.create_business('Storage Test', 'storagetest', 'SR', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
select id, '00000000-0000-4000-ac00-000000000002', 'staff' from public.businesses where slug = 'storagetest';

do $$ begin
  assert (select public and file_size_limit = 2097152 and allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'] from storage.buckets where id = 'images'), 'images bucket';
  assert (select public and file_size_limit = 20971520 from storage.buckets where id = 'videos'), 'videos bucket';
end $$;

-- The owner: their own folder only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ac00-000000000001","role":"authenticated"}', true);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-4000-ac00-000000000001/logo/a.webp');
  insert into storage.objects (bucket_id, name) values ('videos', '00000000-0000-4000-ac00-000000000001/video/a.mp4');
  begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-4000-ac00-000000000003/logo/b.webp');
    raise exception 'an owner uploaded into someone else''s folder';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('images', 'logo/loose.webp');
    raise exception 'a file outside any folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Someone setting up (no business yet): their own folder works.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ac00-000000000003","role":"authenticated"}', true);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-4000-ac00-000000000003/logo/c.webp');
end $$;

-- Staff: no uploads at all.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-ac00-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-4000-ac00-000000000002/logo/d.webp');
    raise exception 'staff uploaded a file';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Anonymous visitors: no uploads.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-4000-ac00-000000000001/logo/e.webp');
    raise exception 'anon uploaded a file';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
