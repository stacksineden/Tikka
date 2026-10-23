-- Reviews: only people who redeemed, once per Tikka, within 30 days (rule 6). Businesses can
-- report but never edit or delete; Tikka keeps or hides; the rating follows what's on show.
begin;

create temp table t (k text primary key, v uuid);
create temp table tokens (k text primary key, token text);
grant all on t, tokens to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-e000-000000000001', 'owner5@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-e000-000000000002', 'staff5@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-e000-000000000003', 'admin5@test.tikka', 'authenticated', 'authenticated');
update public.profiles set is_admin = true where user_id = '00000000-0000-4000-e000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Review Test', 'reviewtest', 'RV', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
select v, '00000000-0000-4000-e000-000000000002', 'staff' from t where k = 'biz';

with d as (
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
  select v, 'rev', 'Glow week', 10, 0, now() - interval '1 hour', now() + interval '10 days', 'published' from t where k = 'biz'
  returning id
)
insert into t select 'drop', id from d;
insert into public.rewards (drop_id, tier, kind, value, title, quantity) select v, 'common', 'percent_off', 10, '10% off', 10 from t where k = 'drop';
select private.build_deck(v) from t where k = 'drop';

create function pg_temp.claim(p_key text, p_phone text, p_wa_name text, p_redeemed interval)
returns void language plpgsql as $$
declare tok text := private.intent_token(); r record;
begin
  insert into public.claim_intents (drop_id, token, first_name) values ((select v from t where k = 'drop'), tok, 'Ada');
  select * into r from public.claim_card(tok, p_phone, p_wa_name);
  update public.claims set redeemed_at = now() - p_redeemed where id = r.claim_id and p_redeemed is not null;
  insert into tokens values (p_key, r.view_token);
end $$;

select pg_temp.claim('came', '+2348200000001', 'Ada Okafor', interval '2 days');
select pg_temp.claim('came2', '+2348200000002', null, interval '1 hour');
select pg_temp.claim('not_yet', '+2348200000003', null, null);
select pg_temp.claim('long_ago', '+2348200000004', null, interval '31 days');

-- -------------------------------------------------------------- writing
do $$
declare
  r jsonb;
  rv public.reviews%rowtype;
  tk text := (select token from tokens where k = 'came');
begin
  assert public.submit_review('nope', 5) ->> 'kind' = 'not_found', 'unknown link';
  assert public.submit_review((select token from tokens where k = 'not_yet'), 5) ->> 'kind' = 'not_redeemed', 'only after a visit';
  assert public.submit_review((select token from tokens where k = 'long_ago'), 5) ->> 'kind' = 'closed', 'closed after 30 days';
  assert public.submit_review(tk, 6) ->> 'kind' = 'invalid', 'stars are 1 to 5';
  assert public.submit_review(tk, 0) ->> 'kind' = 'invalid', 'no zero stars';
  assert public.submit_review(tk, 5, repeat('a', 141)) ->> 'kind' = 'invalid', '140 characters at most';

  r := public.submit_review(tk, 5, '  Lovely   team,
  great nails ');
  assert r ->> 'kind' = 'ok', 'a visitor reviews: ' || r::text;
  select * into rv from public.reviews where claim_id = (select id from public.claims where view_token = tk);
  assert rv.display_name = 'Ada O.', 'first name and initial: ' || rv.display_name;
  assert rv.body = 'Lovely team, great nails' and rv.rating = 5 and rv.status = 'visible', 'tidied text';
  assert public.submit_review(tk, 1, 'changed my mind') ->> 'kind' = 'reviewed', 'once per Tikka';
  assert (select rating from public.reviews where id = rv.id) = 5, 'the first review stands';
  assert (select count(*) from public.events where type = 'reviewed') = 1, 'the live feed gets the review';

  assert public.submit_review((select token from tokens where k = 'came2'), 2) ->> 'kind' = 'ok', 'a review without words';
  assert (select rating_avg = 3.5 and rating_count = 2 from public.businesses where id = (select v from t where k = 'biz')), 'rating follows the reviews';
end $$;

-- ----------------------------------------------------- the business
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-000000000001","role":"authenticated"}', true);
do $$
declare
  low uuid := (select id from public.reviews where rating = 2);
begin
  assert (select count(*) from public.reviews) = 2, 'the owner sees their reviews';
  begin
    update public.reviews set rating = 5 where id = low;
    raise exception 'an owner edited a review';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.reviews where id = low;
    raise exception 'an owner deleted a review';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.reviews (claim_id, business_id, drop_id, rating, display_name)
    select claim_id, business_id, drop_id, 5, 'Fake' from public.reviews where id = low;
    raise exception 'an owner wrote a review';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_review('x', 5);
    raise exception 'an owner called submit_review';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.decide_review_report(low, true);
    raise exception 'an owner hid a review';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.businesses set rating_avg = 5 where id = (select v from t where k = 'biz');
    raise exception 'an owner set their own rating';
  exception when insufficient_privilege then null;
  end;

  assert public.report_review(low, 'Never came in'), 'the owner reports it';
  assert public.report_review(low, 'Again'), 'reporting twice is fine';
  assert (select status from public.reviews where id = low) = 'reported', 'marked reported';
  assert (select count(*) from public.reports where target_id = low) = 1, 'one report';
end $$;

-- Staff can't report.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.report_review((select id from public.reviews where rating = 5), 'x');
    raise exception 'staff reported a review';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Visitors still see a reported review until Tikka decides.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from public.get_business_reviews((select v from t where k = 'biz'))) = 2, 'reported stays up';
  assert (select drop_title from public.get_business_reviews((select v from t where k = 'biz')) limit 1) = 'Glow week', 'with the drop it came from';
  assert (select count(*) from public.reports) = 0, 'visitors never see reports';
  begin
    perform public.submit_review((select token from tokens where k = 'came2'), 5);
    raise exception 'anon called submit_review directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------- Tikka decides
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-000000000003","role":"authenticated"}', true);
select public.decide_review_report((select id from public.reviews where rating = 2), true);
reset role;
do $$
declare low uuid := (select id from public.reviews where rating = 2);
begin
  assert (select status from public.reviews where id = low) = 'hidden', 'hidden';
  assert (select status = 'hidden' and decided_by = '00000000-0000-4000-e000-000000000003' from public.reports where target_id = low), 'report closed';
  assert (select rating_avg = 5.0 and rating_count = 1 from public.businesses where id = (select v from t where k = 'biz')), 'a hidden review leaves the rating';
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert (select count(*) from public.get_business_reviews((select v from t where k = 'biz'))) = 1, 'hidden is gone from the page';
  assert (select count(*) from public.reviews) = 1, 'and from direct reads';
end $$;

rollback;
