-- The money alerts run at 19:00 and 20:00 WAT through the same guarded caller as the other jobs;
-- it still refuses any other path, and nobody but the database can call it.
begin;

do $$
begin
  assert (select schedule from cron.job where jobname = 'tikka-money') = '0 18,19 * * *', 'money alerts at 19:00 and 20:00 WAT';
  assert (select command from cron.job where jobname = 'tikka-money') like '%/api/cron/money%', 'calls the money route';
  assert private.run_tikka_cron('/api/cron/elsewhere') is null, 'other paths refused';
  assert not has_function_privilege('anon', 'private.run_tikka_cron(text)', 'execute')
     and not has_function_privilege('authenticated', 'private.run_tikka_cron(text)', 'execute'), 'database only';
  assert (select count(*) from cron.job where jobname in ('tikka-outbound', 'tikka-daily')) = 2, 'the other jobs stay';
end $$;

rollback;
