-- "Ask for a review" (page-claim mode): the owner sees review links only for typed-in numbers that
-- redeemed in the last 30 days and haven't reviewed. Nobody else sees any.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c030-000000000001', 'owner30@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c030-000000000002', 'other30@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c030-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Review Asks', 'reviewasks', 'RA', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;

do $$
declare
  d uuid;
  n int;
begin
  insert into public.drops (business_id, slug, title, total_cards, eligibility, new_reserved_pct, starts_at, ends_at, validity_days, status)
  values ((select v from t where k = 'biz'), 'asks', 'Asks drop', 10, 'once_per_drop', 0, now() - interval '1 day', now() + interval '10 days', 30, 'published')
  returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'common', 'percent_off', 10, '10% off', 10);
  perform private.build_deck(d);
  insert into t values ('drop', d);
  -- Five page claims: a (redeemed), b (not redeemed), c (redeemed, reviewed), d (redeemed, confirmed), e (redeemed 31 days ago).
  for n in 1..5 loop
    assert public.claim_on_page(public.create_claim_intent(d, 'Ada', false, 'visitor-' || n, 'direct') ->> 'token', '+23480311200' || n::text || '0') ->> 'kind' = 'claimed',
      'page claim ' || n;
  end loop;
end $$;

update public.claims set redeemed_at = now() - interval '1 hour' where phone in ('+2348031120010', '+2348031120030', '+2348031120040');
update public.claims set redeemed_at = now() - interval '31 days' where phone = '+2348031120050';
update public.claims set phone_confirmed = true where phone = '+2348031120040';
insert into public.reviews (claim_id, business_id, drop_id, rating, display_name)
  select id, (select v from t where k = 'biz'), drop_id, 5, 'Ada' from public.claims where phone = '+2348031120030';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c030-000000000001","role":"authenticated"}', true);
do $$
declare r record;
begin
  assert (select count(*) from public.review_asks((select v from t where k = 'biz'))) = 1, 'only the one claim that can still be asked';
  select * into r from public.review_asks((select v from t where k = 'biz'));
  assert r.view_token = (select view_token from public.claims where phone = '+2348031120010'), 'with that claim''s review key';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c030-000000000002","role":"authenticated"}', true);
do $$
begin
  perform public.review_asks((select v from t where k = 'biz'));
  raise exception 'another account read the review links';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.review_asks((select v from t where k = 'biz'));
  raise exception 'a visitor read the review links';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
