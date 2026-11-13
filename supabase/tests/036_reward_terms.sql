-- A reward's terms travel with the card: the claimer's card (card_json) and the counter check.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c036-000000000001', 'owner36@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c036-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Terms Test', 'termstest', 'TT', 'Beauty', 'Oyo', 'Ogbomoso', 'Takie', '#9C3B5C', '#FFFFFF');
reset role;

do $$
declare
  d uuid;
  tok text;
  j jsonb;
begin
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), 'terms', 'Terms drop', 10, 0, now() - interval '1 day', now() + interval '10 days', 14, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, terms, quantity)
  values (d, 'common', 'amount_off', 500000, '₦5,000 off makeup', 'When you book makeup at ₦20,000', 10);
  perform private.build_deck(d);
  insert into t values ('drop', d);
  tok := private.intent_token();
  insert into public.claim_intents (drop_id, token, first_name) values (d, tok, 'Bola');
  perform public.claim_card(tok, '+2348500036001');

  j := private.card_json((select id from public.claims where drop_id = d));
  assert j ->> 'terms' = 'When you book makeup at ₦20,000', 'card carries the terms: ' || j::text;
  assert j ->> 'reward' = '₦5,000 off makeup', 'and the reward';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c036-000000000001","role":"authenticated"}', true);
do $$
declare
  r jsonb;
begin
  r := public.check_code((select v from t where k = 'biz'), (select code from public.claims where drop_id = (select v from t where k = 'drop')));
  assert r ->> 'kind' = 'valid', 'valid: ' || r::text;
  assert r ->> 'terms' = 'When you book makeup at ₦20,000', 'staff see the terms';
  assert r::text !~ '850003600', 'never the number';
end $$;
reset role;

rollback;
