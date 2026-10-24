-- Limits on the public endpoints (claim codes, Notify me, drop reports, link activity, visit
-- plans), so one person or script can't flood a drop. Fixed windows counted here, so they hold
-- across every server. Keys are hashed by the app (visitor id or IP address, never stored as is).
-- Old windows are cleared now and then by the same function.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- One more hit on `p_key` in the current window. True while it's within `p_max`.
create function public.rate_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- About one call in a hundred tidies windows older than a day.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;

revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;
