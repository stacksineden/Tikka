-- Rate limits: allowed up to the limit, refused after, separate per key; only the server counts.
begin;

do $$
declare
  i int;
begin
  for i in 1..3 loop
    assert public.rate_hit('test:a', 3, 600), 'hit ' || i || ' allowed';
  end loop;
  assert not public.rate_hit('test:a', 3, 600), 'the fourth refused';
  assert not public.rate_hit('test:a', 3, 600), 'and the fifth';
  assert public.rate_hit('test:b', 3, 600), 'another key has its own count';
  assert (select hits from public.rate_limits where key = 'test:a') = 5, 'every hit counted';
end $$;

set local role anon;
do $$ begin
  begin
    perform public.rate_hit('test:c', 3, 600);
    raise exception 'anon counted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.rate_limits;
    raise exception 'anon read the limits';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
