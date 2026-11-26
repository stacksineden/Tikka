-- Page links for Tikka's own pages are refused, newer ones included (the listing at /book, search,
-- /business, pay links, receipts and booking passes).
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-c073-000000000001', 'slug73@test.tikka', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c073-000000000001","role":"authenticated"}', true);
do $$
declare s text;
begin
  foreach s in array array['book', 'business', 'search', 'pay', 'r', 'bk', 'c', 'invite'] loop
    begin
      perform public.create_business('Clash', s, 'CQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF');
      assert false, s || ' should be reserved';
    exception when others then
      if sqlerrm like '%should be reserved%' then raise; end if;
    end;
  end loop;
  assert public.create_business('Fine', 'finename73', 'FQ', 'Beauty', 'Oyo', 'Ibadan', 'Bodija', '#9C3B5C', '#FFFFFF') is not null, 'an ordinary link still works';
end $$;
reset role;

rollback;
