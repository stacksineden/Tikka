-- The review page's lookup: its state follows rule 6 (redeemed, within 30 days, once), it carries
-- no phone number, and only the server may call it.
begin;

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b400-000000000001', 'owner18@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b400-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Review Page', 'reviewpage', 'RP', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF')::text;
reset role;

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
select '00000000-0000-4000-b400-0000000000d1', v::uuid, 'review-week', 'Review week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published' from t where k = 'biz';
insert into public.rewards (drop_id, tier, kind, value, title, quantity) values ('00000000-0000-4000-b400-0000000000d1', 'rare', 'percent_off', 20, '20% off any service', 10);
select private.build_deck('00000000-0000-4000-b400-0000000000d1');

do $$
declare
  tok text;
  r record;
  p jsonb;
begin
  tok := public.create_claim_intent('00000000-0000-4000-b400-0000000000d1', 'Ada', false, 'v1', 'ig') ->> 'token';
  select * into r from public.claim_card(tok, '+2348180000001', 'Ada Okafor');
  insert into t values ('view', (select view_token from public.claims where id = r.claim_id)), ('claim', r.claim_id::text);

  p := public.review_page((select v from t where k = 'view'));
  assert p ->> 'state' = 'not_redeemed', 'not used yet: ' || p::text;
  assert p ->> 'shown_name' = 'Ada O.' and p ->> 'reward' = '20% off any service' and p ->> 'business_slug' = 'reviewpage', 'what the page shows: ' || p::text;
  assert p::text not like '%+234%', 'no phone number';

  update public.claims set redeemed_at = now() - interval '2 days' where id = r.claim_id;
  assert public.review_page((select v from t where k = 'view')) ->> 'state' = 'open', 'open after redeeming';

  assert public.submit_review((select v from t where k = 'view'), 5, 'Lovely  visit') ->> 'kind' = 'ok', 'review sent';
  p := public.review_page((select v from t where k = 'view'));
  assert p ->> 'state' = 'reviewed' and (p -> 'review' ->> 'rating')::int = 5 and p -> 'review' ->> 'body' = 'Lovely visit', 'reviewed: ' || p::text;

  update public.claims set redeemed_at = now() - interval '31 days' where id = r.claim_id;
  delete from public.reviews where claim_id = r.claim_id;
  assert public.review_page((select v from t where k = 'view')) ->> 'state' = 'closed', 'closed after 30 days';
  assert public.review_page('no-such-token') is null, 'unknown token';
end $$;

-- Only the server: visitors and signed-in people can't call it.
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin
    perform public.review_page((select v from t where k = 'view'));
    raise exception 'anon read the review page';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
