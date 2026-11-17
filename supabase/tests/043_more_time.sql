-- "Give more time": the owner gives one Tikka one extra week, once, never past 30 days from the
-- claim. Staff can't. A used Tikka can't. An expired one comes back if the new date is still ahead.
-- The counter's code check says whose an expired Tikka is and the date it could move to.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c043-000000000001', 'owner43@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c043-000000000002', 'staff43@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c043-000000000003', 'other43@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c043-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('More Time', 'moretime43', 'MT', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c043-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Place', 'otherplace43', 'OP', 'Beauty', 'Oyo', 'Ibadan', 'Ring Road', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c043-000000000002', 'staff');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'more-time', 'More time drop', 10, 'once_per_drop', 0, now() - interval '20 days', now() + interval '10 days', 7, 'published', false)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ((select v from t where k = 'drop'), 'common', 'percent_off', 10, '10% off', 10);
select private.build_deck((select v from t where k = 'drop'));

create function pg_temp.claim(p_visitor text, p_phone text) returns uuid language plpgsql as $$
begin
  if public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), 'Ada', false, p_visitor, 'direct') ->> 'token', p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed for %', p_phone;
  end if;
  return (select id from public.claims where phone = p_phone and drop_id = (select v from t where k = 'drop') and kind = 'drop');
end $$;

-- Five 7-day Tikkas, with their dates set as if claimed earlier.
insert into t values
  ('live', pg_temp.claim('v1', '+2348011110001')),   -- claimed 2 days ago, 5 days left
  ('late', pg_temp.claim('v2', '+2348011110002')),   -- claimed 10 days ago, expired 3 days ago
  ('gone', pg_temp.claim('v3', '+2348011110003')),   -- claimed 16 days ago, expired 9 days ago: too late
  ('used', pg_temp.claim('v4', '+2348011110004')),   -- used
  ('month', pg_temp.claim('v5', '+2348011110005'));  -- a 30-day Tikka
update public.claims set claimed_at = now() - interval '2 days', expires_at = now() + interval '5 days' where id = (select v from t where k = 'live');
update public.claims set claimed_at = now() - interval '10 days', expires_at = now() - interval '3 days' where id = (select v from t where k = 'late');
update public.claims set claimed_at = now() - interval '16 days', expires_at = now() - interval '9 days' where id = (select v from t where k = 'gone');
update public.claims set redeemed_at = now() where id = (select v from t where k = 'used');
update public.claims set claimed_at = now() - interval '1 day', expires_at = now() + interval '29 days' where id = (select v from t where k = 'month');
insert into res select 'before', jsonb_object_agg(k, (select expires_at from public.claims where id = t.v)) from t where k in ('live', 'late', 'gone', 'month');
insert into res select 'codes', jsonb_object_agg(k, (select code from public.claims where id = t.v)) from t where k in ('live', 'late', 'gone', 'used', 'month');

-- Staff can't give more time; nor can another business's owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c043-000000000002","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
  r jsonb;
begin
  begin
    perform public.give_more_time(biz, (select v from t where k = 'live'));
    assert false, 'staff must not give more time';
  exception when insufficient_privilege then null;
  end;
  -- Staff checking an expired code see whose it is and that it could have more time, nothing more.
  r := public.check_code(biz, c ->> 'late');
  assert r ->> 'kind' = 'expired' and r ->> 'name' = 'Ada' and r ->> 'reward' = '10% off', 'expired, with name and reward: ' || r::text;
  assert r ->> 'more_time' is not null, 'it could have more time';
  assert r::text !~ '801111', 'never the number';
  assert public.check_code(biz, c ->> 'gone') ->> 'more_time' is null, 'expired too long ago: no more time';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c043-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.give_more_time((select v from t where k = 'biz'), (select v from t where k = 'live'));
    assert false, 'another owner must not give more time';
  exception when insufficient_privilege then null;
  end;
  -- Their own business can't reach this Tikka either.
  assert public.give_more_time((select v from t where k = 'other'), (select v from t where k = 'live')) ->> 'kind' = 'unknown', 'not their Tikka';
end $$;

-- The owner.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c043-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c jsonb := (select v from res where k = 'codes');
  b jsonb := (select v from res where k = 'before');
  r jsonb;
begin
  -- A live Tikka: one more week.
  r := public.give_more_time(biz, (select v from t where k = 'live'));
  assert r ->> 'kind' = 'extended', 'live: extended ' || r::text;
  assert (r ->> 'expires_at')::timestamptz = (b ->> 'live')::timestamptz + interval '7 days', 'live: 7 more days';
  assert r ->> 'name' = 'Ada', 'with the name';
  -- Once only.
  r := public.give_more_time(biz, (select v from t where k = 'live'));
  assert r ->> 'kind' = 'already_extended', 'once only: ' || r::text;

  -- An expired Tikka, by its code at the counter: it comes back, and the code works again.
  r := public.give_more_time(biz, null, lower(c ->> 'late'));
  assert r ->> 'kind' = 'extended', 'late: extended ' || r::text;
  assert (r ->> 'expires_at')::timestamptz = (b ->> 'late')::timestamptz + interval '7 days', 'late: 7 more days';
  assert public.check_code(biz, c ->> 'late') ->> 'kind' = 'valid', 'late: valid again';
  assert public.check_code(biz, c ->> 'late') ->> 'expires_at' is not null, 'with its new date';

  -- Expired too long ago: 7 more days would still be in the past.
  assert public.give_more_time(biz, (select v from t where k = 'gone')) ->> 'kind' = 'no_more_time', 'gone: no more time';
  -- A 30-day Tikka already has the longest time.
  assert public.give_more_time(biz, (select v from t where k = 'month')) ->> 'kind' = 'no_more_time', 'month: no more time';
  -- A used Tikka can't.
  assert public.give_more_time(biz, (select v from t where k = 'used')) ->> 'kind' = 'already_used', 'used: no';
  -- Unknown code.
  assert public.give_more_time(biz, null, 'MT-AAAAA') ->> 'kind' = 'unknown', 'unknown code';

  -- Leads show it.
  assert (select extended_at from public.get_leads(biz) where claim_id = (select v from t where k = 'live')) is not null, 'leads: given more time';
  assert (select extended_at from public.get_leads(biz) where claim_id = (select v from t where k = 'gone')) is null, 'leads: not given';
end $$;
reset role;

-- Nothing else changed: the same code and card, and the dates of the ones that weren't given more time.
do $$
declare
  b jsonb := (select v from res where k = 'before');
  c jsonb := (select v from res where k = 'codes');
begin
  assert (select code from public.claims where id = (select v from t where k = 'live')) = c ->> 'live', 'same code';
  assert (select expires_at from public.claims where id = (select v from t where k = 'gone')) = (b ->> 'gone')::timestamptz, 'gone: unchanged';
  assert (select expires_at from public.claims where id = (select v from t where k = 'month')) = (b ->> 'month')::timestamptz, 'month: unchanged';
  assert (select extended_by from public.claims where id = (select v from t where k = 'late')) = '00000000-0000-4000-c043-000000000001', 'who gave it';
end $$;

rollback;
