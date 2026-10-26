-- Studio enquiries and Spark early access: enquiries only through the server function and only
-- admins read them; early access once per business and once per contact; owners sign up and
-- dismiss for their own business only; staff and visitors can't.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-bc00-000000000001', 'owner28@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-bc00-000000000002', 'staff28@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-bc00-000000000003', 'admin28@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-bc00-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-bc00-000000000001","role":"authenticated"}', true);
select public.create_business('Studio Test', 'studiotest', 'SE', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select id, '00000000-0000-4000-bc00-000000000002', 'staff' from public.businesses where slug = 'studiotest';

-- Enquiries: the server function saves them; bad input is refused.
do $$
declare
  biz uuid := (select id from public.businesses where slug = 'studiotest');
begin
  perform public.submit_studio_enquiry('Ada', 'Ada''s Kitchen', '+2348260000001', array['websites', 'whatsapp'], 'Under ₦200,000', 'A booking site', 'macbite', null);
  perform public.submit_studio_enquiry('Bola', 'Studio Test', '+2348260000002', array['drops'], null, null, null, biz);
  assert (select count(*) from public.studio_enquiries where phone like '+23482600000%') = 2, 'two saved';
  assert (select status from public.studio_enquiries where name = 'Ada') = 'new', 'new by default';
  assert (select business_id from public.studio_enquiries where name = 'Bola') = biz, 'linked to the business';
  begin
    perform public.submit_studio_enquiry('X', 'Y', '08012345678', array['websites'], null, null, null, null);
    raise exception 'took a number not in international format';
  exception when check_violation then null;
  end;
  begin
    perform public.submit_studio_enquiry('X', 'Y', '+2348260000003', array['crypto'], null, null, null, null);
    raise exception 'took a service we do not offer';
  exception when check_violation then null;
  end;
  -- Signed-out early access: once per contact, however it's typed.
  perform public.join_early_access_contact('spark', 'Someone@Example.com');
  perform public.join_early_access_contact('spark', 'someone@example.com ');
  perform public.join_early_access_contact('spark', '+2348260000009');
  assert (select count(*) from public.early_access where contact in ('someone@example.com', '+2348260000009')) = 2, 'one row per contact';
end $$;

-- The owner: signs the business up (twice changes nothing), dismisses a teaser, sees the state.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-bc00-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select id from public.businesses where slug = 'studiotest');
  s record;
begin
  select * into s from public.spark_state(biz);
  assert not s.on_list and s.dismissed = '{}', 'not on the list yet';
  assert public.join_early_access('spark', biz), 'signed up';
  assert public.join_early_access('spark', biz), 'again, fine';
  perform public.dismiss_teaser(biz, 'spark_dashboard');
  perform public.dismiss_teaser(biz, 'spark_dashboard');
  select * into s from public.spark_state(biz);
  assert s.on_list and s.dismissed = '{spark_dashboard}', 'on the list, one teaser hidden: ' || s.dismissed::text;
  begin
    perform count(*) from public.studio_enquiries;
    raise exception 'an owner read the enquiries table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_studio_enquiries();
    raise exception 'an owner read the enquiries';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_studio_enquiry('X', 'Y', '+2348260000004', array['websites'], null, null, null, null);
    raise exception 'an owner called the server-only function';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Staff see the state but can't sign up or dismiss.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-bc00-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select id from public.businesses where slug = 'studiotest');
begin
  assert (select on_list from public.spark_state(biz)), 'staff see the business is on the list';
  begin
    perform public.join_early_access('spark', biz);
    raise exception 'staff signed the business up';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.dismiss_teaser(biz, 'spark_builder');
    raise exception 'staff dismissed a teaser';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The admin reads both lists and moves an enquiry along.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-bc00-000000000003","role":"authenticated"}', true);
do $$
declare
  e jsonb := public.admin_studio_enquiries();
  a jsonb := public.admin_early_access('spark');
  ada uuid;
begin
  ada := (select (x ->> 'id')::uuid from jsonb_array_elements(e) x where x ->> 'name' = 'Ada');
  assert ada is not null, 'the admin sees the enquiry';
  assert exists (select 1 from jsonb_array_elements(e) x where x ->> 'tikka_business' = 'Studio Test'), 'with the linked business';
  perform public.admin_set_enquiry_status(ada, 'converted');
  assert (select x ->> 'status' from jsonb_array_elements(public.admin_studio_enquiries()) x where (x ->> 'id')::uuid = ada) = 'converted', 'status moved';
  begin
    perform public.admin_set_enquiry_status(ada, 'won');
    raise exception 'took a status that does not exist';
  exception when check_violation then null;
  end;
  assert (a ->> 'count')::int >= 3, 'the early-access count: ' || a::text;
  assert exists (select 1 from jsonb_array_elements(a -> 'list') x where x ->> 'business_name' = 'Studio Test'), 'the business on the list';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.join_early_access_contact('spark', 'anon@example.com');
    raise exception 'anon signed up directly';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
