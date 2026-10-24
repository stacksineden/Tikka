-- The schedule: both jobs exist; without the Vault values they do nothing; with them they call
-- the right route with the secret; only the two cron routes; nobody else can run it.
begin;

do $$ begin
  assert (select schedule from cron.job where jobname = 'tikka-outbound') = '*/5 * * * *', 'the queue every 5 minutes';
  assert (select schedule from cron.job where jobname = 'tikka-daily') = '0 7 * * *', 'the summary at 8:00 WAT';
end $$;

-- This project may already have the real values; set test ones for this transaction only.
delete from vault.secrets where name in ('tikka_site_url', 'tikka_cron_secret');
do $$ begin
  assert private.run_tikka_cron('/api/cron/outbound') is null, 'nothing without the Vault values';
end $$;

select vault.create_secret('https://example.test/', 'tikka_site_url');
select vault.create_secret('test-secret', 'tikka_cron_secret');
do $$
declare
  req_id bigint := private.run_tikka_cron('/api/cron/outbound');
  q record;
begin
  assert req_id is not null, 'a request queued';
  select * into q from net.http_request_queue where http_request_queue.id = req_id;
  assert q.url = 'https://example.test/api/cron/outbound', 'to the outbound route: ' || coalesce(q.url, 'none');
  assert q.headers ->> 'Authorization' = 'Bearer test-secret', 'with the secret';
  assert private.run_tikka_cron('/api/anything-else') is null, 'only the two cron routes';
end $$;

set local role authenticated;
do $$ begin
  begin
    perform private.run_tikka_cron('/api/cron/outbound');
    raise exception 'a signed-in user ran the cron';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
