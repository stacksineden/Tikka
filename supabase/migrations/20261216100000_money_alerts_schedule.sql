-- NEW DIRECTION: schedule the money alerts (docs/DB_MOVE.md section 7). /api/cron/money sends
-- "Anything you spent today?" at 20:00 WAT and the week's in, spent and kept on Sunday at 19:00 WAT
-- (alertDue() in lib/money-alert.ts), so the scheduler calls it at 19:00 and 20:00 WAT only
-- (18:00 and 19:00 UTC). Push this with the merge to main: before then production has no such route
-- (the call just gets a 404). Same Vault values as the other jobs.

create or replace function private.run_tikka_cron(p_path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  site text := (select decrypted_secret from vault.decrypted_secrets where name = 'tikka_site_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'tikka_cron_secret');
begin
  if site is null or secret is null or p_path not in ('/api/cron/outbound', '/api/cron/daily', '/api/cron/money') then
    return null;
  end if;
  return net.http_get(
    url := rtrim(site, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.run_tikka_cron(text) from public, anon, authenticated;

select cron.schedule('tikka-money', '0 18,19 * * *', $$select private.run_tikka_cron('/api/cron/money')$$);
