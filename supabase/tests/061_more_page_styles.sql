-- More page styles: the owner can pick each new style; unknown styles are still refused; staff
-- can't change it.
begin;

create temp table t (k text primary key, v uuid);
grant all on t to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c061-000000000001', 'owner61@test.tikka', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-c061-000000000002', 'staff61@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c061-000000000001","role":"authenticated"}', true);
insert into t select 'biz', public.create_business('Glow Studio', 'glow61', 'GS', 'Beauty', 'Lagos', 'Lagos', 'Lekki', '#9C3B5C', '#FFFFFF');
reset role;
insert into public.business_members (business_id, user_id, role)
values ((select v from t where k = 'biz'), '00000000-0000-4000-c061-000000000002', 'staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c061-000000000001","role":"authenticated"}', true);
do $$
declare
  biz uuid := (select v from t where k = 'biz');
  s text;
begin
  foreach s in array array['luxe', 'soft', 'portfolio', 'film', 'beauty', 'photography'] loop
    update public.business_page set style = s where business_id = biz;
    assert (select style from public.business_page where business_id = biz) = s, 'the owner sets ' || s;
  end loop;
  update public.business_page set style = null where business_id = biz;
  assert (select style from public.business_page where business_id = biz) is null, 'null still follows the category';
  begin
    update public.business_page set style = 'neon' where business_id = biz;
    raise exception 'an unknown style should be refused';
  exception when check_violation then null;
  end;
end $$;

-- Staff can't change the page.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c061-000000000002","role":"authenticated"}', true);
update public.business_page set style = 'luxe' where business_id = (select v from t where k = 'biz');
reset role;
do $$ begin
  assert (select style from public.business_page where business_id = (select v from t where k = 'biz')) is null, 'staff did not change the style';
end $$;

rollback;
