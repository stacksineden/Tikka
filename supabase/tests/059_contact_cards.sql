-- Business cards (docs/BUSINESS_CARDS.md): owners make and change them, staff and visitors never
-- see them, the photo must be the business's own, at most 20, removing keeps the code working,
-- and scans count once per visitor per day.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c059-000000000001', 'owner59@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c059-000000000002', 'staff59@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c059-000000000003', 'other59@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Card Room', 'cardroom59', 'CR', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Room', 'otherroom59', 'OR', 'Photography', 'Oyo', 'Ibadan', 'Bodija', '#7A5A2E', '#FFFFFF');
reset role;

insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c059-000000000002', 'staff');
insert into public.business_portfolio (business_id, kind, image_path, thumb_path)
values ((select v from t where k = 'biz'), 'photo', 'p/own.webp', 'p/own-t.webp');
insert into t select 'own_photo', id from public.business_portfolio where image_path = 'p/own.webp';
insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes)
values ((select v from t where k = 'biz'), 'video', 'p/v.mp4', 'p/v.webp', 10, 1000);
insert into t select 'own_video', id from public.business_portfolio where image_path = 'p/v.mp4';
insert into public.business_portfolio (business_id, kind, image_path, thumb_path)
values ((select v from t where k = 'other'), 'photo', 'p/theirs.webp', 'p/theirs-t.webp');
insert into t select 'their_photo', id from public.business_portfolio where image_path = 'p/theirs.webp';

-- The owner makes and changes cards.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000001","role":"authenticated"}', true);
insert into t select 'card', (public.add_contact_card((select v from t where k = 'biz'))).id;
insert into t select 'person', (public.add_contact_card((select v from t where k = 'biz'), '  Funmi Adeyemi ', 'Founder')).id;
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  c public.contact_cards;
begin
  select * into c from public.contact_cards where id = (select v from t where k = 'card');
  assert c.code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$', 'a code from the code alphabet';
  assert c.style is null and c.person_name is null and not c.rounded and c.show_phone and c.show_instagram and c.show_place, 'a new card follows the defaults';
  assert not exists (select 1 from public.posters where code = c.code), 'never a poster''s code';
  assert (select person_name from public.contact_cards where id = (select v from t where k = 'person')) = 'Funmi Adeyemi', 'the name is trimmed';
  assert (select count(*) from public.my_contact_cards(biz)) = 2, 'the owner sees both cards';
  assert (select scans_month from public.my_contact_cards(biz) where id = c.id) = 0, 'no scans yet';

  perform public.save_contact_card(c.id, 'photo', (select v from t where k = 'own_photo'), 'Ada', 'Lash artist', true, false, true, false);
  select * into c from public.contact_cards where id = c.id;
  assert c.style = 'photo' and c.photo_id = (select v from t where k = 'own_photo') and c.person_name = 'Ada' and c.rounded and not c.show_phone and not c.show_place, 'the owner saves her choices';

  begin
    perform public.save_contact_card(c.id, 'photo', (select v from t where k = 'their_photo'), null, null, false, true, true, true);
    raise exception 'another business''s photo should be refused';
  exception when check_violation then null;
  end;
  begin
    perform public.save_contact_card(c.id, 'photo', (select v from t where k = 'own_video'), null, null, false, true, true, true);
    raise exception 'a video should be refused';
  exception when check_violation then null;
  end;
  begin
    perform public.save_contact_card(c.id, 'indigo', null, null, null, false, true, true, true);
    raise exception 'an unknown style should be refused';
  exception when check_violation then null;
  end;
  begin
    perform public.save_contact_card(c.id, null, null, null, 'Founder', false, true, true, true);
    raise exception 'a role without a name should be refused';
  exception when check_violation then null;
  end;
  begin
    perform public.save_contact_card(c.id, null, null, 'Ada', 'Lucky charm', false, true, true, true);
    raise exception 'gambling words should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.contact_cards (business_id, code) values (biz, 'AAAAAA');
    raise exception 'direct inserts should be refused';
  exception when insufficient_privilege then null;
  end;

  -- Up to 20.
  for i in 3..20 loop perform public.add_contact_card(biz); end loop;
  begin
    perform public.add_contact_card(biz);
    raise exception 'a 21st card should be refused';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Staff never see or change cards.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.contact_cards) = 0, 'staff read no cards';
  begin
    perform public.my_contact_cards((select v from t where k = 'biz'));
    raise exception 'staff should not list cards';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_contact_card((select v from t where k = 'biz'));
    raise exception 'staff should not add cards';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_contact_card((select v from t where k = 'card'), 'bold', null, null, null, false, true, true, true);
    raise exception 'staff should not change cards';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_contact_card((select v from t where k = 'card'));
    raise exception 'staff should not remove cards';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Another owner can't touch them either.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000003","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.contact_cards) = 0, 'another owner reads none of them';
  begin
    perform public.save_contact_card((select v from t where k = 'card'), 'bold', null, null, null, false, true, true, true);
    raise exception 'another owner should not change them';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Visitors never read cards and can't call the scan directly.
set local role anon;
do $$
begin
  assert (select count(*) from public.contact_cards) = 0, 'anonymous visitors read no cards';
  begin
    perform public.contact_card_scan('AAAAAA', 'x');
    raise exception 'anon should not call the scan';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Scans (server only): once per visitor per day; no visitor, no count.
do $$
declare
  card uuid := (select v from t where k = 'card');
  code text := (select c.code from public.contact_cards c where c.id = card);
begin
  assert (select slug from public.contact_card_scan(lower(code), 'visitor-a')) = 'cardroom59', 'a scan opens the business page, any case';
  perform public.contact_card_scan(code, 'visitor-a');
  perform public.contact_card_scan(code, 'visitor-b');
  perform public.contact_card_scan(code, '');
  assert (select sum(scans) from public.contact_card_scans where card_id = card) = 2, 'two different visitors, counted once each';
  assert not exists (select 1 from public.contact_card_scan('AAAAAA', 'visitor-a')), 'an unknown code opens nothing';
end $$;

-- The owner sees the scans this month; removing hides the card but keeps its code working.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c059-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  card uuid := (select v from t where k = 'card');
begin
  assert (select scans_month from public.my_contact_cards(biz) where id = card) = 2, 'the owner sees 2 scans this month';
  perform public.remove_contact_card(card);
  assert not exists (select 1 from public.my_contact_cards(biz) where id = card), 'a removed card leaves the list';
  perform public.add_contact_card(biz);
  begin
    perform public.save_contact_card(card, 'bold', null, null, null, false, true, true, true);
    raise exception 'a removed card should not change';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare
  code text := (select c.code from public.contact_cards c where c.id = (select v from t where k = 'card'));
begin
  assert (select slug from public.contact_card_scan(code, 'visitor-c')) = 'cardroom59', 'a removed card still opens the page';
  update public.businesses set suspended = true where id = (select v from t where k = 'biz');
  assert not exists (select 1 from public.contact_card_scan(code, 'visitor-d')), 'a suspended business''s card opens nothing';
end $$;

rollback;
