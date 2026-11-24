-- Business cards, step 5: a claim from someone who came from a business card keeps "card" as its
-- source; the sources from before still work, and anything else is still "direct".
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c060-000000000001', 'owner60@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c060-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Card Source', 'cardsource60', 'CS', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
values ((select v from t where k = 'biz'), 'live60', 'Drop live60', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published');
insert into t select 'live', id from public.drops where slug = 'live60';
insert into public.rewards (drop_id, tier, kind, value, title, action_text, quantity)
values ((select v from t where k = 'live'), 'common', 'action', null, 'A free drink', 'Follow us on Instagram', 10);
select private.build_deck((select v from t where k = 'live'));

do $$
declare
  live uuid := (select v from t where k = 'live');
  r jsonb;
begin
  r := public.create_claim_intent(live, 'Ada', false, 'visitor-card', 'card');
  assert r ->> 'kind' = 'intent', 'a card visitor gets a claim code';
  assert (select source from public.claim_intents where token = r ->> 'token') = 'card', 'the claim keeps the card source';

  r := public.create_claim_intent(live, 'Bola', false, 'visitor-qr', 'qr');
  assert (select source from public.claim_intents where token = r ->> 'token') = 'qr', 'other sources still work';

  r := public.create_claim_intent(live, 'Chi', false, 'visitor-odd', 'flyer');
  assert (select source from public.claim_intents where token = r ->> 'token') = 'direct', 'an unknown source is direct';

  begin
    insert into public.claim_intents (drop_id, token, first_name, source) values (live, 'TK-AAAAA', 'Dee', 'flyer');
    raise exception 'an unknown source should still be refused by the table';
  exception when check_violation then null;
  end;
end $$;

rollback;
