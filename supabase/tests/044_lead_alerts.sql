-- New lead alerts: only owners save a phone; staff and other owners can't; the alert never carries
-- a phone number, counts a burst, and goes only to phones of people who still own the business.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c044-000000000001', 'owner44@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c044-000000000002', 'staff44@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c044-000000000003', 'other44@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Alert Studio', 'alertstudio44', 'AL', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Alerts', 'otheralerts44', 'OA', 'Beauty', 'Lagos', 'Lagos', 'Surulere', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c044-000000000002', 'staff');

with d as (
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status, counter_check)
  values ((select v from t where k = 'biz'), 'alerts', 'Alerts drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 14, 'published', true)
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values
  ((select v from t where k = 'drop'), 'rare', 'percent_off', 20, '20% off any service', 10);
select private.build_deck((select v from t where k = 'drop'));

create function pg_temp.claim(p_visitor text, p_phone text, p_name text) returns text language plpgsql as $$
begin
  if public.claim_on_page(public.create_claim_intent((select v from t where k = 'drop'), p_name, false, p_visitor, 'direct') ->> 'token', p_phone) ->> 'kind' <> 'claimed' then
    raise exception 'claim failed for %', p_phone;
  end if;
  return (select view_token from public.claims where phone = p_phone and drop_id = (select v from t where k = 'drop') and kind = 'drop');
end $$;

-- The owner turns alerts on for two phones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000001","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  assert public.save_push_subscription(biz, 'https://push.example/phone-a', repeat('p', 87), repeat('a', 22), 'Android Chrome'), 'owner saves phone A';
  assert public.save_push_subscription(biz, 'https://push.example/phone-b', repeat('p', 87), repeat('a', 22)), 'owner saves phone B';
  assert public.push_subscribed(biz, 'https://push.example/phone-a'), 'phone A is on';
  assert jsonb_array_length(public.my_push_subscriptions(biz)) = 2, 'two phones for the test';
  begin
    perform public.save_push_subscription(biz, 'http://push.example/insecure', repeat('p', 87), repeat('a', 22));
    assert false, 'only https endpoints';
  exception when check_violation then null;
  end;
end $$;

-- Staff can't turn on lead alerts, and can't remove the owner's.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000002","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  begin
    perform public.save_push_subscription(biz, 'https://push.example/staff', repeat('p', 87), repeat('a', 22));
    assert false, 'staff must not get lead alerts';
  exception when insufficient_privilege then null;
  end;
  assert not public.remove_push_subscription('https://push.example/phone-b'), 'staff can''t remove the owner''s phone';
  assert not public.push_subscribed(biz, 'https://push.example/phone-a'), 'staff don''t see the owner''s phone as theirs';
  begin
    perform public.my_push_subscriptions(biz);
    assert false, 'staff can''t list phones';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Another business's owner can't add a phone to this business; nobody can read the table directly.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.save_push_subscription((select v from t where k = 'biz'), 'https://push.example/intruder', repeat('p', 87), repeat('a', 22));
    assert false, 'another owner must not';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.push_subscriptions;
    assert false, 'no direct reads';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lead_alert('anything');
    assert false, 'lead_alert is server only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Two claims close together: the alert names the latest, counts the burst, never the number.
insert into res values ('vt1', to_jsonb(pg_temp.claim('v1', '+2348031110001', 'Adaeze')));
insert into res values ('vt2', to_jsonb(pg_temp.claim('v2', '+2348031110002', 'Tunde')));
do $$
declare a jsonb := public.lead_alert((select v #>> '{}' from res where k = 'vt2'));
begin
  assert a ->> 'first_name' = 'Tunde' and a ->> 'tier' = 'rare' and a ->> 'reward' = '20% off any service', 'what it says: ' || a::text;
  assert a ->> 'business_name' = 'Alert Studio', 'the business';
  assert (a ->> 'recent')::int = 2, 'a burst of 2';
  assert jsonb_array_length(a -> 'subscriptions') = 2, 'both of the owner''s phones';
  assert a::text !~ '803111', 'never the phone number';
  assert public.lead_alert('no-such-token') is null, 'unknown claim: nothing';
end $$;

-- The owner turns one phone off; a dead phone is forgotten; an ex-owner's phones get nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000001","role":"authenticated"}', true);
do $$ begin assert public.remove_push_subscription('https://push.example/phone-a'), 'owner turns phone A off'; end $$;
reset role;
select public.forget_push_endpoint('https://push.example/phone-b');
do $$
begin
  assert jsonb_array_length(public.lead_alert((select v #>> '{}' from res where k = 'vt1')) -> 'subscriptions') = 0, 'no phones left';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c044-000000000001","role":"authenticated"}', true);
select public.save_push_subscription((select v from t where k = 'biz'), 'https://push.example/phone-c', repeat('p', 87), repeat('a', 22));
reset role;
update public.business_members set role = 'staff' where user_id = '00000000-0000-4000-c044-000000000001';
do $$
begin
  assert jsonb_array_length(public.lead_alert((select v #>> '{}' from res where k = 'vt1')) -> 'subscriptions') = 0, 'no longer the owner: no alerts';
end $$;

rollback;
