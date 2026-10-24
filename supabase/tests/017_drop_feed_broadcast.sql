-- The live feed's signal: each new event sends a bare "activity" broadcast on the drop's private
-- channel, carrying no names or numbers; the business's team may hear it, nobody else.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-b300-000000000001', 'owner17@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b300-000000000002', 'staff17@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b300-000000000003', 'other17@test.tikka', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b300-000000000001","role":"authenticated"}', true);
select public.create_business('Feed Test', 'feedtest', 'FT', 'Beauty', 'Lagos', 'Lagos', 'Yaba', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role) select id, '00000000-0000-4000-b300-000000000002', 'staff' from public.businesses where slug = 'feedtest';

insert into public.drops (id, business_id, slug, title, total_cards, new_reserved_pct, starts_at, ends_at, status)
select '00000000-0000-4000-b300-0000000000d1', id, 'feed-week', 'Feed week', 10, 0, now() - interval '1 hour', now() + interval '5 days', 'published'
from public.businesses where slug = 'feedtest';

select public.record_drop_event('00000000-0000-4000-b300-0000000000d1', 'view', 'ig', 'h1');

do $$
declare
  m record;
begin
  select * into m from realtime.messages where topic = 'drop:00000000-0000-4000-b300-0000000000d1';
  assert found, 'a signal on the drop''s channel';
  assert m.event = 'activity' and m.private and m.extension = 'broadcast', 'private broadcast: ' || row_to_json(m)::text;
  assert m.payload - 'id' = '{"type": "view"}'::jsonb, 'no names or numbers: ' || m.payload::text;
end $$;

-- Who may listen: Realtime checks the policy with the channel's topic set.
select set_config('realtime.topic', 'drop:00000000-0000-4000-b300-0000000000d1', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b300-000000000001","role":"authenticated"}', true);
do $$ begin assert (select count(*) from realtime.messages where extension = 'broadcast') > 0, 'the owner hears it'; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b300-000000000002","role":"authenticated"}', true);
do $$ begin assert (select count(*) from realtime.messages where extension = 'broadcast') > 0, 'staff hear it (the feed has first names only)'; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b300-000000000003","role":"authenticated"}', true);
do $$ begin assert (select count(*) from realtime.messages) = 0, 'another owner hears nothing'; end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin assert (select count(*) from realtime.messages) = 0, 'visitors hear nothing'; end $$;

rollback;
