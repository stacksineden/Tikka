-- The schedule runs in Supabase (pg_cron + pg_net) instead of Vercel Cron, which on Vercel's free
-- plan can't run every 5 minutes. Every 5 minutes it calls /api/cron/outbound (the WhatsApp queue,
-- reminders, drop-live alerts); at 07:00 UTC (8:00 WAT) /api/cron/daily (the owners' summaries).
--
-- The site address and CRON_SECRET live in Supabase Vault, never in this file. Until both are set
-- the jobs do nothing (docs/LAUNCH.md):
--   select vault.create_secret('https://usetikka.com', 'tikka_site_url');
--   select vault.create_secret('<the same CRON_SECRET as on Vercel>', 'tikka_cron_secret');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Calls one Tikka cron route. Returns pg_net's request id, or null while the Vault values are missing.
create function private.run_tikka_cron(p_path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  site text := (select decrypted_secret from vault.decrypted_secrets where name = 'tikka_site_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'tikka_cron_secret');
begin
  if site is null or secret is null or p_path not in ('/api/cron/outbound', '/api/cron/daily') then
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

select cron.schedule('tikka-outbound', '*/5 * * * *', $$select private.run_tikka_cron('/api/cron/outbound')$$);
select cron.schedule('tikka-daily', '0 7 * * *', $$select private.run_tikka_cron('/api/cron/daily')$$);
