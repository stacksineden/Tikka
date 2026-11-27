-- Active businesses and referrals: a business is active only with 3+ photos and a price, bookings
-- on, the bio link ticked by Tikka admin and a real booking in the last 14 days; an invited business
-- is recorded once (never its own code); when it becomes active its inviter gets 30 days of Plus and
-- that month's drop, once; only admins see the list or tick the bio link.
begin;

create temp table t (k text primary key, v uuid);
create temp table res (k text primary key, v jsonb);
grant all on t, res to anon, authenticated, service_role;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c086-000000000001', 'inviter86@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c086-000000000002', 'invited86@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c086-000000000003', 'admin86@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-c086-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c086-000000000001","role":"authenticated"}', true);
insert into t select 'a', public.create_business('Inviter Studio', 'inviter86', 'IV', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
insert into res select 'code', public.my_referral((select v from t where k = 'a'));
do $$
begin
  assert (select v ->> 'code' from res where k = 'code') ~ '^[a-z0-9]{6}$', 'a code';
  assert public.my_referral((select v from t where k = 'a')) ->> 'code' = (select v ->> 'code' from res where k = 'code'), 'the same code every time';
  assert not public.record_referral((select v from t where k = 'a'), (select v ->> 'code' from res where k = 'code')), 'never your own code';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c086-000000000002","role":"authenticated"}', true);
insert into t select 'b', public.create_business('Invited Nails', 'invited86', 'IN', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
select public.save_services((select v from t where k = 'b'), '[{"name":"Gel nails","price_kobo":1500000,"price_kind":"fixed","minutes":60}]');
select public.save_booking_settings((select v from t where k = 'b'), true, 1, 0, 30, '{}');
do $$
begin
  assert not public.record_referral((select v from t where k = 'b'), 'nope99'), 'an unknown code does nothing';
  assert public.record_referral((select v from t where k = 'b'), upper((select v ->> 'code' from res where k = 'code'))), 'recorded';
  assert not public.record_referral((select v from t where k = 'b'), (select v ->> 'code' from res where k = 'code')), 'once only';
  begin
    perform public.admin_active_businesses();
    assert false, 'admins only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.businesses set hours = '{"weekdays":{"open":true,"from":"09:00","to":"18:00"},"saturday":{"open":true,"from":"09:00","to":"18:00"},"sunday":{"open":true,"from":"09:00","to":"18:00"}}'
where id = (select v from t where k = 'b');
insert into public.business_portfolio (business_id, kind, image_path, thumb_path)
select (select v from t where k = 'b'), 'photo', 'images/p' || g || '.webp', 'images/p' || g || 't.webp' from generate_series(1, 3) g;

-- Not active yet: no bio link, no booking. Nothing to reward.
set local role service_role;
do $$ begin assert public.reward_referrals() = 0, 'not active yet'; end $$;
reset role;

-- Admin ticks the bio link; a customer books on the page.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c086-000000000003","role":"authenticated"}', true);
select public.admin_set_bio_link((select v from t where k = 'b'), true);
reset role;
set local role service_role;
insert into res select 'bk', public.book_time((select v from t where k = 'b'), (select id from public.business_services where business_id = (select v from t where k = 'b')),
  (((now() at time zone 'Africa/Lagos')::date + 2) + time '10:00') at time zone 'Africa/Lagos', 'Ada', '+2348030860001', false, null);
do $$
declare until1 timestamptz;
begin
  assert (select v ->> 'kind' from res where k = 'bk') = 'booked', 'booked: ' || (select v::text from res where k = 'bk');
  assert public.reward_referrals() = 1, 'rewarded';
  until1 := (select plus_until from public.businesses where id = (select v from t where k = 'a'));
  assert until1 between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', 'a month of Plus';
  assert (select count(*) from public.drop_vouchers where business_id = (select v from t where k = 'a') and source = 'plus') = 1, 'and its drop';
  assert public.reward_referrals() = 0, 'once only';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c086-000000000003","role":"authenticated"}', true);
do $$
declare l jsonb := public.admin_active_businesses();
begin
  assert (select (x ->> 'active')::boolean from jsonb_array_elements(l) x where x ->> 'slug' = 'invited86'), 'listed active';
  assert not (select (x ->> 'active')::boolean from jsonb_array_elements(l) x where x ->> 'slug' = 'inviter86'), 'inviter not active';
  assert (select (x ->> 'bookings')::boolean and not (x ->> 'page')::boolean from jsonb_array_elements(l) x where x ->> 'slug' = 'inviter86') is not true, 'checks shown';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c086-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_set_bio_link((select v from t where k = 'b'), true);
    assert false, 'owners can''t tick their own bio link';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
