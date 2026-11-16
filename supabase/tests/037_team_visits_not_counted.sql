-- The business's own visits don't count: when the owner or staff open their own drop link while
-- signed in, their view, tear, Claim tap and continue aren't saved; a customer's are, and so is a
-- signed-in visitor from another business. The drop numbers read customers only.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c037-000000000001', 'owner37@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c037-000000000002', 'staff37@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c037-000000000003', 'other37@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c037-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Team Visits', 'teamvisits', 'TV', 'Beauty', 'Kano', 'Kano', 'Nassarawa', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c037-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Place', 'otherplace37', 'OP', 'Food', 'Kano', 'Kano', 'Sabon Gari', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c037-000000000002', 'staff');

do $$
declare
  d uuid;
  step text;
  owner_id uuid := '00000000-0000-4000-c037-000000000001';
  staff_id uuid := '00000000-0000-4000-c037-000000000002';
  other_id uuid := '00000000-0000-4000-c037-000000000003';
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), 'teamvisits', 'Team visits drop', 10, 0, now() - interval '1 day', now() + interval '10 days', 14, 'published')
  returning id into d;
  insert into t values ('drop', d);

  foreach step in array array['view', 'unwrap', 'claim_tap', 'claim_continue'] loop
    perform public.record_drop_event(d, step, 'wa', 'hash-owner', null, owner_id);
    perform public.record_drop_event(d, step, 'wa', 'hash-staff', null, staff_id);
  end loop;
  assert (select count(*) from public.events where drop_id = d) = 0, 'the owner''s and staff''s own visits are not saved';

  foreach step in array array['view', 'unwrap', 'claim_tap', 'claim_continue'] loop
    perform public.record_drop_event(d, step, 'ig', 'hash-customer');
    perform public.record_drop_event(d, step, 'wa', 'hash-signed-in-elsewhere', null, other_id);
  end loop;
  assert (select count(*) from public.events where drop_id = d) = 8, 'a customer''s visits count, and so do another business''s: ' || (select count(*) from public.events where drop_id = d);
  assert (select count(*) from public.events where drop_id = d and visitor_hash in ('hash-owner', 'hash-staff')) = 0, 'still nothing from the team';

  -- The old five-argument call still works for visitors who aren't signed in.
  perform public.record_drop_event(d, 'view', 'qr', 'hash-anon-2', null);
  assert (select count(*) from public.events where drop_id = d and type = 'view') = 3, 'an anonymous view counts';
end $$;

-- The owner's drop numbers count customers only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c037-000000000001","role":"authenticated"}', true);
do $$
declare s jsonb := public.get_drop_stats((select v from t where k = 'drop'));
begin
  assert (s ->> 'unique_views')::int = 3, 'opened the link: customers only: ' || s::text;
  assert (s ->> 'tore')::int = 2, 'tore the wrapper: customers only: ' || s::text;
  assert (s ->> 'tapped')::int = 2, 'tapped Claim: customers only: ' || s::text;
  assert (s ->> 'continued')::int = 2, 'continued: customers only: ' || s::text;
end $$;
reset role;

-- Only the server may save link activity.
set local role anon;
do $$
begin
  perform public.record_drop_event((select v from t where k = 'drop'), 'view', 'wa', 'hash-x');
  assert false, 'anon can''t call it';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
