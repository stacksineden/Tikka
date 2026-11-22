-- The gallery background: the owner (never staff) picks dark or light; nothing else is accepted.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c056-000000000001', 'owner56@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c056-000000000002', 'staff56@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c056-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Light Room', 'lightroom56', 'LR', 'Photography', 'Lagos', 'Lagos', 'Yaba', '#7A5A2E', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c056-000000000002', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c056-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert (select gallery_tone from public.business_page where business_id = biz) is null, 'a new page is dark (unset)';
  update public.business_page set gallery_tone = 'light' where business_id = biz;
  assert (select gallery_tone from public.business_page where business_id = biz) = 'light', 'the owner picks light';
  begin
    update public.business_page set gallery_tone = 'indigo' where business_id = biz;
    raise exception 'an unknown background should be refused';
  exception when check_violation then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c056-000000000002","role":"authenticated"}', true);
update public.business_page set gallery_tone = 'dark' where business_id = (select v from t where k = 'biz');
reset role;
do $$
begin
  assert (select gallery_tone from public.business_page where business_id = (select v from t where k = 'biz')) = 'light', 'staff cannot change it';
end $$;

rollback;
