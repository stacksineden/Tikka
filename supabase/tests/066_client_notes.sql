-- The client book's notes (docs/DB_MOVE.md step 5): the owner saves and reads notes and a birthday
-- by number; both empty removes them; staff and strangers can't; the privacy lookup says they
-- exist (never what they say) and forgetting the person deletes them.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c066-000000000001', 'owner66@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c066-000000000002', 'staff66@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c066-000000000003', 'admin66@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c066-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Notes', 'notes66', 'NQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c066-000000000002', 'staff');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c066-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c066-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  n jsonb;
begin
  assert public.save_client_note(biz, '+2348030660001', '  Sensitive scalp, likes medium length  ', '03-14'), 'saved';
  assert public.save_client_note(biz, '+2348030660002', null, '12-31'), 'birthday only';
  assert public.save_client_note(biz, '+2348030660003', 'Comes with her sister', '13-40'), 'a bad birthday is dropped';
  n := public.get_client_notes(biz);
  assert n -> '+2348030660001' ->> 'notes' = 'Sensitive scalp, likes medium length' and n -> '+2348030660001' ->> 'birthday' = '03-14', 'notes: ' || n::text;
  assert n -> '+2348030660002' ->> 'notes' is null and n -> '+2348030660002' ->> 'birthday' = '12-31', 'birthday only';
  assert n -> '+2348030660003' ->> 'birthday' is null, 'bad birthday dropped';
  -- Saving again changes it; both empty removes it.
  assert public.save_client_note(biz, '+2348030660001', 'Long now', '03-14'), 'changed';
  assert public.save_client_note(biz, '+2348030660002', ' ', null), 'emptied';
  n := public.get_client_notes(biz);
  assert n -> '+2348030660001' ->> 'notes' = 'Long now' and not (n ? '+2348030660002'), 'changed and removed: ' || n::text;
  begin
    perform public.save_client_note(biz, '0803', 'x', null);
    assert false, 'a real number';
  exception when check_violation then null;
  end;
end $$;

-- Staff can't read or write; no direct reads.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c066-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.get_client_notes((select v from t where k = 'biz'));
    assert false, 'staff must not read notes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_client_note((select v from t where k = 'biz'), '+2348030660001', 'x', null);
    assert false, 'staff must not write notes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.client_notes;
    assert false, 'no direct reads';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Privacy: the lookup says notes exist, never what they say; forgetting deletes them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c066-000000000003","role":"authenticated"}', true);
insert into res select 'lookup', public.admin_person_lookup('+2348030660001');
insert into res select 'forget', public.admin_forget_person('+2348030660001');
reset role;
do $$
begin
  assert jsonb_array_length((select v from res where k = 'lookup') -> 'client_notes') = 1, 'lookup shows notes exist';
  assert (select v from res where k = 'lookup')::text !~ 'Long now', 'never the notes themselves';
  assert ((select v from res where k = 'forget') ->> 'client_notes')::int = 1, 'forget counts them';
  assert not exists (select 1 from public.client_notes where phone = '+2348030660001'), 'forgotten';
  assert exists (select 1 from public.client_notes where phone = '+2348030660003'), 'others kept';
end $$;

rollback;
