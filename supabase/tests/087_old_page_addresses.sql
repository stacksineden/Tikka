-- Old page addresses: changing the address remembers the old one, which then points to the new one
-- for anyone (anon included); no other business can take it; going back to it removes it.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c087-000000000001', 'mover87@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c087-000000000002', 'other87@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c087-000000000001","role":"authenticated"}', true);
insert into t select 'a', public.create_business('Mover Beauty Studio', 'moverbeautystudio87', 'MV', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
update public.businesses set slug = 'mover87' where id = (select v from t where k = 'a');
do $$
begin
  assert public.page_moved_to('moverbeautystudio87') = 'mover87', 'old address points to the new one';
  assert public.page_moved_to('MoverBeautyStudio87') = 'mover87', 'any case';
  assert public.page_moved_to('mover87') is null, 'the live address is not moved';
  assert not exists (select 1 from public.others_old_addresses() s where s = 'moverbeautystudio87'), 'not taken for its own owner';
end $$;

-- A second change keeps both old addresses pointing to the latest.
update public.businesses set slug = 'mover87b' where id = (select v from t where k = 'a');
do $$
begin
  assert public.page_moved_to('moverbeautystudio87') = 'mover87b', 'first old address follows';
  assert public.page_moved_to('mover87') = 'mover87b', 'second old address too';
end $$;

-- Nobody can read the table directly.
do $$
begin
  perform 1 from public.old_page_addresses;
  assert false, 'no direct reads';
exception when insufficient_privilege then null;
end $$;

-- Another business can't take an old address, and sees it as taken.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c087-000000000002","role":"authenticated"}', true);
do $$
begin
  assert exists (select 1 from public.others_old_addresses() s where s = 'mover87'), 'taken for others';
  begin
    perform public.create_business('Copycat', 'mover87', 'CC', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
    assert false, 'another business cannot take an old address';
  exception when unique_violation then null;
  end;
end $$;

-- Anonymous visitors can follow it.
set local role anon;
do $$
begin
  assert public.page_moved_to('moverbeautystudio87') = 'mover87b', 'anon follows the old address';
end $$;

-- The owner goes back to an old address: it's live again, so no longer an old one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c087-000000000001","role":"authenticated"}', true);
update public.businesses set slug = 'moverbeautystudio87' where id = (select v from t where k = 'a');
do $$
begin
  assert public.page_moved_to('moverbeautystudio87') is null, 'live again';
  assert public.page_moved_to('mover87b') = 'moverbeautystudio87', 'the latest one now points back';
end $$;

rollback;
