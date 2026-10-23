-- The business page: every business gets one, anyone reads it, only the owner edits it, the
-- editor's limits and rule 8 hold in the database, and get_business_page() never leaks
-- owner-only details.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a800-000000000001', 'owner8@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a800-000000000002', 'staff8@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a800-000000000003', 'other8@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-000000000003","role":"authenticated"}', true);
insert into t select 'other', public.create_business('Other Page', 'otherpage', 'OP', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Glow Page', 'glowpage', 'GP', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select v, '00000000-0000-4000-a800-000000000002', 'staff' from t where k = 'biz';
update public.businesses set address = '12 Admiralty Way', hours = '{"mon":"9-6"}' where id = (select v from t where k = 'biz');
update public.business_private set owner_whatsapp = '+2348099999999' where business_id = (select v from t where k = 'biz');

-- ------------------------------------------------------------ the owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  ids uuid[];
begin
  assert (select count(*) from public.business_page where business_id = biz) = 1, 'every business gets a page';

  update public.business_page set headline = 'Winter glow in Lekki', subline = 'Hair, nails and brows', hero_focal_x = 0.3,
    show_text = true, text_title = 'Our promise', text_body = 'On time, every time.', show_faqs = true
  where business_id = biz;
  assert (select headline from public.business_page where business_id = biz) = 'Winter glow in Lekki', '"Winter" is fine';

  begin
    update public.business_page set headline = 'Win big this week' where business_id = biz;
    raise exception 'a gambling word got onto the page';
  exception when check_violation then null;
  end;
  begin
    update public.business_page set text_body = null where business_id = biz;
    raise exception 'a text section with no text';
  exception when check_violation then null;
  end;
  begin
    update public.business_page set hero_focal_y = 1.5 where business_id = biz;
    raise exception 'a focal point off the photo';
  exception when check_violation then null;
  end;
  begin
    update public.business_page set business_id = (select v from t where k = 'other') where business_id = biz;
    raise exception 'a page moved business';
  exception when insufficient_privilege then null;
  end;

  -- Services, saved whole and in order.
  assert public.save_services(biz, '[
    {"group_name": "Hair", "name": "Silk press", "price_kobo": 2500000, "price_kind": "fixed", "duration": "2 hr"},
    {"group_name": "Hair", "name": "Braids", "price_kobo": 1500000, "price_kind": "from"},
    {"group_name": "Nails", "name": "Gel set", "price_kind": "ask", "description": "  "}
  ]') = 3, 'three services';
  assert (select array_agg(name::text order by position) from public.business_services where business_id = biz) = array['Silk press', 'Braids', 'Gel set'], 'in order';
  assert (select description is null from public.business_services where name = 'Gel set'), 'blank becomes empty';
  begin
    perform public.save_services(biz, '[{"name": "No price", "price_kind": "fixed"}]');
    raise exception 'a fixed price with no price';
  exception when check_violation then null;
  end;
  begin
    perform public.save_services(biz, (select jsonb_agg(jsonb_build_object('name', 'S' || g, 'price_kind', 'ask')) from generate_series(1, 13) g));
    raise exception 'thirteen services';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.business_services where business_id = biz) = 3, 'a refused save leaves the list as it was';
  begin
    update public.business_services set business_id = (select v from t where k = 'other') where business_id = biz;
    raise exception 'a service moved business';
  exception when insufficient_privilege then null;
  end;

  -- Team and FAQs.
  assert public.save_team(biz, '[{"name": "Tobi", "role": "Lead stylist"}, {"name": "Kemi"}]') = 2, 'team';
  begin
    perform public.save_team(biz, (select jsonb_agg(jsonb_build_object('name', 'P' || g)) from generate_series(1, 9) g));
    raise exception 'nine team members';
  exception when check_violation then null;
  end;
  assert public.save_faqs(biz, '[{"question": "Do you take walk-ins?", "answer": "Yes, before 4pm."}]') = 1, 'faqs';
  begin
    perform public.save_faqs(biz, '[{"question": "Can I win a free set?", "answer": "Maybe."}]');
    raise exception 'a gambling word in an FAQ';
  exception when check_violation then null;
  end;

  -- Portfolio: 12 items, 3 videos of up to 15 seconds and 15 MB.
  insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes)
  select biz, 'video', 'v' || g || '.mp4', 'v' || g || '.webp', 14.9, 10000000 from generate_series(1, 3) g;
  begin
    insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes) values (biz, 'video', 'v4.mp4', 'v4.webp', 5, 1000);
    raise exception 'a fourth video';
  exception when check_violation then null;
  end;
  begin
    insert into public.business_portfolio (business_id, kind, image_path, thumb_path, duration_s, bytes) values (biz, 'video', 'long.mp4', 'long.webp', 20, 1000);
    raise exception 'a 20-second video';
  exception when check_violation then null;
  end;
  insert into public.business_portfolio (business_id, image_path, thumb_path, position)
  select biz, 'p' || g || '.webp', 'p' || g || '-t.webp', g from generate_series(1, 9) g;
  begin
    insert into public.business_portfolio (business_id, image_path, thumb_path) values (biz, 'p13.webp', 'p13-t.webp');
    raise exception 'a thirteenth item';
  exception when check_violation then null;
  end;
  select array_agg(id order by image_path desc) into ids from public.business_portfolio where business_id = biz;
  perform public.save_portfolio_order(biz, ids);
  assert (select image_path from public.business_portfolio where business_id = biz and position = 0) = 'v3.mp4', 'reordered';

  -- Not someone else's page.
  begin
    perform public.save_services((select v from t where k = 'other'), '[{"name": "Mine now", "price_kind": "ask"}]');
    raise exception 'an owner wrote another business''s services';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------------ staff
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a800-000000000002","role":"authenticated"}', true);
do $$
declare biz uuid := (select v from t where k = 'biz');
begin
  update public.business_page set headline = 'Staff was here' where business_id = biz;
  assert (select headline from public.business_page where business_id = biz) = 'Winter glow in Lekki', 'staff can''t change the page';
  begin
    perform public.save_services(biz, '[]');
    perform public.save_faqs(biz, '[{"question": "q", "answer": "a"}]');
    raise exception 'staff changed the lists';
  exception when insufficient_privilege then null;
  end;
  delete from public.business_portfolio where business_id = biz;
  assert (select count(*) from public.business_portfolio where business_id = biz) = 12, 'staff can''t delete photos';
end $$;

-- --------------------------------------------------------- the public page
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare
  pg jsonb := public.get_business_page('GlowPage');
begin
  assert pg -> 'business' ->> 'name' = 'Glow Page', 'the page loads: ' || coalesce(left(pg::text, 200), 'null');
  assert pg -> 'page' ->> 'headline' = 'Winter glow in Lekki' and (pg -> 'page' -> 'hero_focal' ->> 'x')::numeric = 0.3, 'hero';
  assert pg -> 'page' -> 'text' ->> 'title' = 'Our promise', 'the text section is on';
  assert jsonb_array_length(pg -> 'services') = 3 and pg -> 'services' -> 0 ->> 'name' = 'Silk press', 'services in order';
  assert jsonb_array_length(pg -> 'portfolio') = 12, 'portfolio';
  assert pg -> 'team' = 'null'::jsonb, 'team hidden while switched off';
  assert jsonb_array_length(pg -> 'faqs') = 1, 'faqs shown';
  assert pg -> 'business' ->> 'address' = '12 Admiralty Way', 'in-store shows the address';
  assert pg::text not like '%+2348099999999%' and pg::text not like '%owner_whatsapp%', 'owner-only details never leak';
  assert (select count(*) from public.business_services where business_id = (select v from t where k = 'biz')) = 3, 'anyone reads services';
  assert public.get_business_page('nobody-here') is null, 'unknown page';
  begin
    update public.business_page set headline = 'Hacked' where business_id = (select v from t where k = 'biz');
    raise exception 'anon changed a page';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Online businesses don't show where they are; live drops show what's left; suspended pages vanish.
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  d uuid;
  tok text := private.intent_token();
  pg jsonb;
begin
  update public.businesses set serve_mode = 'online' where id = biz;
  update public.business_page set show_team = true where business_id = biz;
  insert into public.drops (business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
  values (biz, 'live', 'Glow week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published') returning id into d;
  insert into public.rewards (drop_id, tier, kind, value, title, quantity) values (d, 'legendary', 'free_item', null, 'Free', 1), (d, 'common', 'percent_off', 10, '10%', 9);
  perform private.build_deck(d);
  insert into public.claim_intents (drop_id, token, first_name) values (d, tok, 'Ada');
  perform public.claim_card(tok, '+2348600000001');

  pg := public.get_business_page('glowpage');
  assert pg -> 'business' -> 'address' = 'null'::jsonb and pg -> 'business' -> 'hours' = 'null'::jsonb, 'online: no address or hours';
  assert jsonb_array_length(pg -> 'team') = 2, 'team switched on';
  assert pg -> 'drops' -> 0 ->> 'left' = '9' and pg -> 'drops' -> 0 ->> 'legendary' = '1', 'the live drop and what''s left';
  assert pg::text not like '%+2348600000001%', 'no claimer numbers';

  update public.businesses set suspended = true where id = biz;
end $$;
set local role anon;
do $$ begin
  assert public.get_business_page('glowpage') is null, 'a suspended page is gone';
  assert (select count(*) from public.business_services where business_id = (select v from t where k = 'biz')) = 0, 'and its services';
end $$;

rollback;
