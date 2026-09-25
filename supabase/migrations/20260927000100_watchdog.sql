-- Watchdog: every minute, pg_cron calls the app's /api/cron/watchdog, which restarts any
-- processing chain that has died (no worker, no progress for 3 minutes). Runs keep going with
-- no browser open. The URL and bearer secret live in Supabase Vault (names 'watchdog_url' and
-- 'watchdog_secret'), set outside git; without them the job does nothing. Safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.wholesale_scout_watchdog() returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u text;
  s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'watchdog_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'watchdog_secret';
  if u is null or s is null then
    return;
  end if;
  perform net.http_get(
    url := u,
    headers := jsonb_build_object('Authorization', 'Bearer ' || s),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Only the scheduler calls it, never the API roles.
revoke all on function public.wholesale_scout_watchdog() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'wholesale-scout-watchdog';
select cron.schedule('wholesale-scout-watchdog', '* * * * *', 'select public.wholesale_scout_watchdog()');
