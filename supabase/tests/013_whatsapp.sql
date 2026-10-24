-- WhatsApp helpers: a card opens with the hold-and-flip only the first time, replies learn whose
-- drop a code was for (never the claimer), and none of it is callable from the browser.
begin;

insert into public.businesses (id, name, slug, code_prefix, category, state, city, area, brand_color, on_brand_color)
values ('00000000-0000-4000-ae00-0000000000b1', 'WhatsApp Test', 'whatsapptest', 'WT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
values ('00000000-0000-4000-ae00-0000000000d1', '00000000-0000-4000-ae00-0000000000b1', 'wa-week', 'WA week', 10, 0, now() - interval '1 hour', now() + interval '3 days', 'published');
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-ae00-0000000000d1', 'common', 'percent_off', 10, '10% off', 10);
select private.build_deck('00000000-0000-4000-ae00-0000000000d1');

do $$
declare
  tok text := (public.create_claim_intent('00000000-0000-4000-ae00-0000000000d1', 'Ada', false, 'v1', 'wa')) ->> 'token';
  r record;
  card jsonb;
begin
  assert public.intent_context(tok) = '{"business_name": "WhatsApp Test", "business_slug": "whatsapptest", "drop_slug": "wa-week", "drop_title": "WA week"}'::jsonb,
    'whose drop: ' || public.intent_context(tok)::text;
  assert public.intent_context('TK-AAAAA') is null, 'unknown code';
  select * into r from public.claim_card(tok, '+2348990000001', 'Ada Obi');
  card := public.claim_by_view_token(r.view_token);
  assert card ->> 'business_name' = 'WhatsApp Test' and card ->> 'drop_slug' = 'wa-week' and card -> 'revealed_at' = 'null'::jsonb, 'the card names the business';
  assert public.reveal_card(r.view_token), 'first open';
  assert not public.reveal_card(r.view_token), 'not the first any more';
  assert public.claim_by_view_token(r.view_token) ->> 'revealed_at' is not null, 'remembered';
  assert not public.reveal_card('nope'), 'unknown link';
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.intent_context('TK-AAAAA');
    raise exception 'anon read whose drop a code was for';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reveal_card('x');
    raise exception 'anon marked a card opened';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
