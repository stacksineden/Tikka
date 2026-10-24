-- Leads: the owner sees every claimer with their number and reward; staff, other owners and
-- visitors get an error, never a row (rule 4). Bounce-backs aren't new leads. Following up logs
-- the tap.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b100-000000000001', 'owner15@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b100-000000000002', 'staff15@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b100-000000000003', 'other15@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b100-000000000003","role":"authenticated"}', true);
select public.create_business('Other Fifteen', 'otherfifteen', 'OI', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b100-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Leads Test', 'leadstest', 'LE', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF')::text;
reset role;
insert into public.business_members (business_id, user_id, role) select v::uuid, '00000000-0000-4000-b100-000000000002', 'staff' from t where k = 'biz';

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status, bounce_back)
select '00000000-0000-4000-b100-0000000000d1', v::uuid, 'leads-week', 'Leads week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published',
  '{"title": "10% off your next visit", "validity_days": 30}' from t where k = 'biz';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-b100-0000000000d1', 'rare', 'percent_off', 20, '20% off any service', 10);
select private.build_deck('00000000-0000-4000-b100-0000000000d1');

do $$
declare
  tok text;
  r record;
  n text;
  i int := 0;
begin
  foreach n in array array['Ada', 'Bola'] loop
    i := i + 1;
    tok := public.create_claim_intent('00000000-0000-4000-b100-0000000000d1', n, i = 1, 'v' || i, case when i = 2 then 'market' else 'qr' end) ->> 'token';
    select * into r from public.claim_card(tok, '+23481500000' || lpad(i::text, 2, '0'), n || ' Okafor');
    insert into t values (n, r.claim_id::text);
  end loop;
end $$;

-- The owner redeems Ada's (which makes a bounce-back) and sees both leads.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b100-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v::uuid from t where k = 'biz');
  ada record;
begin
  perform public.confirm_redemption(biz, (select code from public.claims where id = (select v::uuid from t where k = 'Ada')), 1500000);
  assert (select count(*) from public.get_leads(biz)) = 2, 'two leads, not the bounce-back: ' || (select count(*) from public.get_leads(biz));
  select * into ada from public.get_leads(biz) where first_name = 'Ada';
  assert ada.phone = '+2348150000001' and ada.profile_name = 'Ada Okafor', 'the owner sees the number and name';
  assert ada.reward = '20% off any service' and ada.tier = 'rare', 'and the reward';
  assert ada.redeemed_at is not null and ada.bill_amount_kobo = 1500000 and ada.marketing_opt_in and ada.source = 'qr' and ada.is_new_lead, 'and what happened';
  assert (select source from public.get_leads(biz) where first_name = 'Bola') = 'market' and not (select marketing_opt_in from public.get_leads(biz) where first_name = 'Bola'), 'Bola from the marketplace, no box ticked';
  assert public.log_followup((select v::uuid from t where k = 'Bola')), 'follow-up logged';
  assert (select last_followup_at is not null from public.get_leads(biz) where first_name = 'Bola'), 'last follow-up kept';
  assert (select count(*) from public.events where type = 'followup_tap') = 1, 'the funnel''s tap';
end $$;

-- Staff, another owner, visitors: an error, never a row.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b100-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform count(*) from public.get_leads((select v::uuid from t where k = 'biz'));
    raise exception 'staff read leads';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_followup((select v::uuid from t where k = 'Ada'));
    raise exception 'staff logged a follow-up';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b100-000000000003","role":"authenticated"}', true);
do $$ begin
  begin
    perform count(*) from public.get_leads((select v::uuid from t where k = 'biz'));
    raise exception 'another owner read leads';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform count(*) from public.get_leads((select v::uuid from t where k = 'biz'));
    raise exception 'anon read leads';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
