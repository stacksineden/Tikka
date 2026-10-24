-- The card image's data: what's on the card back, never the code, the view token or a phone
-- number; nothing for a suspended business; server only.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b700-000000000001', 'owner21@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b700-000000000001","role":"authenticated"}', true);
select public.create_business('Image Test', 'imagetest', 'IM', 'Beauty', 'Kaduna', 'Kaduna', 'Barnawa', '#9C3B5C', '#FFFFFF');
reset role;

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
select '00000000-0000-4000-b700-0000000000d1', id, 'image-week', 'Image week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published'
from public.businesses where slug = 'imagetest';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-b700-0000000000d1', 'legendary', 'free_item', null, 'Free facial', 10);
select private.build_deck('00000000-0000-4000-b700-0000000000d1');

do $$
declare
  tok text;
  r record;
  j jsonb;
  cl public.claims%rowtype;
begin
  tok := public.create_claim_intent('00000000-0000-4000-b700-0000000000d1', 'Amina', false, 'v1', 'ig') ->> 'token';
  select * into r from public.claim_card(tok, '+2348210000001');
  select * into cl from public.claims where id = r.claim_id;
  insert into t values ('claim', r.claim_id::text);
  j := public.card_image(r.claim_id);
  assert j ->> 'reward' = 'Free facial' and j ->> 'tier' = 'legendary' and j ->> 'first_name' = 'Amina' and (j ->> 'total')::int = 10, 'the card back: ' || j::text;
  assert j ->> 'code_prefix' = 'IM', 'the code prefix';
  assert j ->> 'city' = 'Kaduna' and (j ->> 'drop_open')::boolean and j ->> 'serial' is not null, 'business and drop: ' || j::text;
  assert j::text not like '%' || cl.code || '%', 'no code';
  assert j::text not like '%' || cl.view_token || '%', 'no view token';
  assert j::text not like '%+234%', 'no phone number';
  assert public.card_image('00000000-0000-4000-b700-0000000000ff') is null, 'unknown claim';
  update public.businesses set suspended = true where slug = 'imagetest';
  assert public.card_image(r.claim_id) is null, 'nothing for a suspended business';
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.card_image((select v::uuid from t where k = 'claim'));
    raise exception 'anon read a card image';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
