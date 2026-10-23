-- page_limit(): PL/pgSQL evaluates the whole condition, so `new.kind` broke inserts on tables
-- without a kind column. The video check now reads it only for the portfolio.
create or replace function private.page_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  perform 1 from public.businesses where id = new.business_id for update;
  execute format('select count(*) from public.%I where business_id = $1', tg_table_name) into n using new.business_id;
  if n >= cap then
    raise exception 'Up to % on your page', cap using errcode = 'check_violation';
  end if;
  if tg_table_name = 'business_portfolio' then
    if to_jsonb(new) ->> 'kind' = 'video'
       and (select count(*) from public.business_portfolio where business_id = new.business_id and kind = 'video') >= 3 then
      raise exception 'Up to 3 videos' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
