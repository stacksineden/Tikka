-- ID verification: only the owner sends an ID, from their own folder; only Tikka admins read the
-- documents and review; Approve makes the business Verified with payments on at its own limit; a
-- business that took payments before keeps them until the deadline, then pauses until approved.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c057-000000000001', 'owner57@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c057-000000000002', 'staff57@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c057-000000000003', 'admin57@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c057-000000000004', 'old57@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('ID Check', 'idcheck57', 'IC', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000004","role":"authenticated"}', true);
insert into t select 'old', public.create_business('Old Payer', 'oldpayer57', 'OP', 'Beauty', 'Lagos', 'Lagos', 'Ikeja', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c057-000000000002', 'staff');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c057-000000000003';
insert into storage.objects (bucket_id, name) values
  ('kyc', '00000000-0000-4000-c057-000000000001/kyc/id.webp'),
  ('kyc', '00000000-0000-4000-c057-000000000001/kyc/cac.webp'),
  ('kyc', '00000000-0000-4000-c057-000000000002/kyc/id.webp');

-- Staff can't send an ID; the owner can't use someone else's file or a file that isn't there.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000002","role":"authenticated"}', true);
do $$
begin
  perform public.submit_kyc((select v from t where k = 'biz'), 'nin', 'Ada Obi', '00000000-0000-4000-c057-000000000002/kyc/id.webp', 'no', null, null);
  raise exception 'staff should not send an ID';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert public.submit_kyc(biz, 'nin', 'Ada Obi', '00000000-0000-4000-c057-000000000002/kyc/id.webp', 'no', null, null) ->> 'kind' = 'missing_file', 'not their folder';
  assert public.submit_kyc(biz, 'nin', 'Ada Obi', '00000000-0000-4000-c057-000000000001/kyc/nope.webp', 'no', null, null) ->> 'kind' = 'missing_file', 'no such file';
  begin
    perform public.submit_kyc(biz, 'nin', 'Ada Obi', '00000000-0000-4000-c057-000000000001/kyc/id.webp', 'rc', null, null);
    raise exception 'a registered business needs its CAC number and certificate';
  exception when check_violation then null;
  end;
  assert public.submit_kyc(biz, 'nin', 'Ada Obi', '00000000-0000-4000-c057-000000000001/kyc/id.webp', 'rc', 'rc 1234567',
    '00000000-0000-4000-c057-000000000001/kyc/cac.webp') ->> 'kind' = 'submitted', 'the owner sends their ID';
  assert public.payout_state(biz) -> 'kyc' ->> 'status' = 'submitted', 'the owner sees it is being checked';
  assert (public.payout_state(biz) -> 'kyc') ? 'id_type' and not ((public.payout_state(biz) -> 'kyc') ? 'id_photo'), 'never the document path';
  assert public.payout_state(biz) ->> 'problem' = 'not_enabled', 'no payments before approval';
  -- Nobody but admins reads the documents, not even the owner who uploaded them.
  assert not exists (select 1 from storage.objects where bucket_id = 'kyc'), 'owners cannot read IDs back';
  begin
    perform public.admin_kyc_queue();
    raise exception 'only admins see the queue';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The bank account can be added once the ID is sent.
do $$
begin
  assert public.save_payout((select v from t where k = 'biz'), '00000000-0000-4000-c057-000000000001', '058', 'GTBank', '6047', 'ADA OBI', 'ACCT_idcheck57', 'live') ->> 'kind' = 'saved', 'bank account before approval';
end $$;

-- Tikka admin reviews.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000003","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  row jsonb;
begin
  -- Real businesses' IDs are in the live bucket too, so count only this test's files.
  assert (select count(*) from storage.objects where bucket_id = 'kyc' and name like '00000000-0000-4000-c057-%') = 3, 'admins read IDs';
  select x into row from jsonb_array_elements(public.admin_kyc_queue()) x where x ->> 'business_id' = biz::text;
  assert row -> 'kyc' ->> 'id_name' = 'Ada Obi' and row -> 'kyc' ->> 'cac_number' = 'RC 1234567', 'the queue shows the details';
  assert row ->> 'account_name' = 'ADA OBI', 'and the bank account name to compare';
  assert public.admin_review_kyc(biz, true, null, 50000) ->> 'kind' = 'bad_limit', 'at least ₦1,000';
  assert public.admin_review_kyc(biz, false, '  ', null) ->> 'kind' = 'needs_note', 'asking again needs a reason';
  assert public.admin_review_kyc(biz, false, 'The ID photo is blurry.', null) ->> 'kind' = 'asked_again', 'ask again';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert public.payout_state(biz) -> 'kyc' ->> 'note' = 'The ID photo is blurry.', 'the owner sees why';
  assert public.submit_kyc(biz, 'passport', 'Ada Obi', '00000000-0000-4000-c057-000000000001/kyc/id.webp', 'no', null, null) ->> 'kind' = 'submitted', 'sends it again';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000003","role":"authenticated"}', true);
do $$
begin
  assert public.admin_review_kyc((select v from t where k = 'biz'), true, null, 10000000) ->> 'kind' = 'approved', 'approve at ₦100,000';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c057-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert public.payout_state(biz) ->> 'problem' is null, 'payments on after approval';
  assert (public.payout_state(biz) ->> 'max_kobo')::int = 10000000, 'at the limit Tikka set';
  assert public.submit_kyc(biz, 'nin', 'Someone Else', '00000000-0000-4000-c057-000000000001/kyc/id.webp', 'no', null, null) ->> 'kind' = 'already_verified', 'an approved ID stays put';
end $$;
reset role;
do $$
begin
  assert (select verified from public.businesses where id = (select v from t where k = 'biz')), 'approval marks it Verified';
end $$;

-- A business that took payments before: fine until the deadline, then paused until approved.
update public.businesses set verified = true where id = (select v from t where k = 'old');
insert into public.business_payments (business_id, enabled, max_kobo, kyc_grace_until)
values ((select v from t where k = 'old'), true, 2000000, now() + interval '7 days');
do $$
declare old uuid := (select v from t where k = 'old');
begin
  assert private.payments_problem(old) is null, 'still taking payments before the deadline';
  update public.business_payments set kyc_grace_until = now() - interval '1 minute' where business_id = old;
  assert private.payments_problem(old) = 'needs_id', 'paused after the deadline';
end $$;

-- Anonymous visitors reach none of it.
set local role anon;
do $$
begin
  perform public.submit_kyc((select v from t where k = 'biz'), 'nin', 'X', 'x/kyc/a.webp', 'no', null, null);
  raise exception 'anon should not send an ID';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  assert not exists (select 1 from storage.objects where bucket_id = 'kyc'), 'anon cannot read IDs';
end $$;
reset role;

rollback;
