-- The new direction's business and service fields (docs/DB_MOVE.md step 1): existing rows stay
-- empty, the owner sets them, save_services() keeps them, the limits and rule 8 hold, and staff
-- can't change them.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c062-000000000001', 'owner62@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c062-000000000002', 'staff62@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c062-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Glow Studio', 'glow62', 'GZ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c062-000000000002', 'staff');

-- A new business starts empty: behaves as today.
do $$
declare b public.businesses;
begin
  select * into b from public.businesses where id = (select v from t where k = 'biz');
  assert b.trades is null and b.work_place is null and b.travel_fee_kobo is null and b.booking_rules is null
     and b.gap_minutes is null and b.home_gap_minutes is null, 'new fields start empty';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c062-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  b public.businesses;
  s public.business_services;
begin
  -- The owner sets the business fields.
  update public.businesses
     set trades = array['hair', 'makeup'], work_place = 'both', travel_fee_kobo = 500000, travel_reach = 'city',
         booking_rules = array['Come with your hair washed', 'Deposits are not refunded'], gap_minutes = 15, home_gap_minutes = 30
   where id = biz;
  select * into b from public.businesses where id = biz;
  assert b.trades = array['hair', 'makeup'] and b.work_place = 'both' and b.travel_fee_kobo = 500000
     and cardinality(b.booking_rules) = 2 and b.gap_minutes = 15 and b.home_gap_minutes = 30, 'the owner sets the new fields';

  -- Limits.
  begin update public.businesses set work_place = 'online' where id = biz; raise exception 'unknown work place accepted';
  exception when check_violation then null; end;
  begin update public.businesses set gap_minutes = 181 where id = biz; raise exception 'gap over 180 accepted';
  exception when check_violation then null; end;
  begin update public.businesses set trades = array['Hair!'] where id = biz; raise exception 'bad trade id accepted';
  exception when check_violation then null; end;
  begin update public.businesses set booking_rules = array[''] where id = biz; raise exception 'empty rule accepted';
  exception when check_violation then null; end;
  begin update public.businesses set booking_rules = array['Book early, you might win a free wash'] where id = biz; raise exception 'rule 8 broken';
  exception when check_violation then null; end;
  -- A shop-only business has no travel fee.
  begin update public.businesses set work_place = 'shop' where id = biz; raise exception 'shop with a travel fee accepted';
  exception when check_violation then null; end;
  update public.businesses set work_place = 'shop', travel_fee_kobo = null, travel_reach = null where id = biz;

  -- save_services() keeps the new service fields.
  perform public.save_services(biz, jsonb_build_array(
    jsonb_build_object('name', 'Knotless braids', 'price_kobo', 2000000, 'price_kind', 'from', 'minutes', 180,
      'options', jsonb_build_array(jsonb_build_object('label', 'Short', 'price_kobo', 2000000, 'minutes', 180),
                                   jsonb_build_object('label', 'Long', 'price_kobo', 3500000, 'minutes', 300)),
      'extras', jsonb_build_array(jsonb_build_object('name', 'Add wash', 'price_kobo', 300000)),
      'questions', jsonb_build_array('Will you bring your own hair?'), 'gap_minutes', 30),
    jsonb_build_object('name', 'Bridal makeup', 'price_kobo', 8000000, 'minutes', 120, 'event_day', true, 'per_person', true,
      'options', jsonb_build_array(jsonb_build_object('label', 'Bride', 'price_kobo', 8000000, 'minutes', 120),
                                   jsonb_build_object('label', 'Each bridesmaid', 'price_kobo', 2500000, 'minutes', 45))),
    jsonb_build_object('name', 'Silk press', 'price_kobo', 1500000, 'minutes', 90)));
  select * into s from public.business_services where business_id = biz and name = 'Knotless braids';
  assert jsonb_array_length(s.options) = 2 and jsonb_array_length(s.extras) = 1 and s.questions = array['Will you bring your own hair?']
     and s.gap_minutes = 30 and not s.event_day and not s.per_person, 'options, extras, questions and gap kept';
  select * into s from public.business_services where business_id = biz and name = 'Bridal makeup';
  assert s.event_day and s.per_person, 'event day and per person kept';
  select * into s from public.business_services where business_id = biz and name = 'Silk press';
  assert s.options is null and s.extras is null and s.questions is null and s.gap_minutes is null
     and not s.event_day and not s.per_person, 'a plain service stays plain';

  -- The service limits.
  begin
    perform public.save_services(biz, jsonb_build_array(jsonb_build_object('name', 'X', 'price_kobo', 100, 'per_person', true)));
    raise exception 'per person without options accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_services(biz, jsonb_build_array(jsonb_build_object('name', 'X', 'price_kobo', 100,
      'options', jsonb_build_array(jsonb_build_object('label', 'Long', 'price_kobo', 100, 'minutes', 5)))));
    raise exception 'a 5-minute option accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_services(biz, jsonb_build_array(jsonb_build_object('name', 'X', 'price_kobo', 100,
      'options', jsonb_build_array(jsonb_build_object('label', 'Long', 'price_kobo', -1, 'minutes', 60)))));
    raise exception 'a negative price accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_services(biz, jsonb_build_array(jsonb_build_object('name', 'X', 'price_kobo', 100,
      'questions', jsonb_build_array('a?', 'b?', 'c?', 'd?'))));
    raise exception 'four questions accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_services(biz, jsonb_build_array(jsonb_build_object('name', 'X', 'price_kobo', 100,
      'extras', jsonb_build_array(jsonb_build_object('name', 'Lucky dip', 'price_kobo', 100)))));
    raise exception 'rule 8 broken on extras';
  exception when check_violation then null; end;
  -- The failed saves left the services as they were.
  assert (select count(*) from public.business_services where business_id = biz) = 3, 'failed saves change nothing';
end $$;

-- Staff can't change the new fields.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c062-000000000002","role":"authenticated"}', true);
update public.businesses set gap_minutes = 60, trades = array['nails'] where id = (select v from t where k = 'biz');
reset role;
do $$ begin
  assert (select gap_minutes from public.businesses where id = (select v from t where k = 'biz')) = 15, 'staff did not change the gap';
  assert (select trades from public.businesses where id = (select v from t where k = 'biz')) = array['hair', 'makeup'], 'staff did not change the trades';
end $$;

rollback;
