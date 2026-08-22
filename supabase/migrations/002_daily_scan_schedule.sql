-- pg_cron uses UTC. 16:00 UTC is 00:00 the next day in Asia/Shanghai.
-- The Vercel function can safely scan at most 10 regions per invocation, so one
-- daily global cycle is split into 25 one-minute batches from 00:00 to 00:24.

create or replace function public.configure_modelrate_cron(p_site_url text, p_scan_secret text)
returns text
language plpgsql
security definer
set search_path = public, vault, cron, net
as $$
declare
  site_secret_id uuid;
  scan_secret_id uuid;
  existing_job bigint;
begin
  select id into site_secret_id from vault.secrets where name = 'modelrate_site_url';
  if site_secret_id is null then
    perform vault.create_secret(trim(trailing '/' from p_site_url), 'modelrate_site_url');
  else
    perform vault.update_secret(site_secret_id, trim(trailing '/' from p_site_url));
  end if;

  select id into scan_secret_id from vault.secrets where name = 'modelrate_scan_secret';
  if scan_secret_id is null then
    perform vault.create_secret(p_scan_secret, 'modelrate_scan_secret');
  else
    perform vault.update_secret(scan_secret_id, p_scan_secret);
  end if;

  select jobid into existing_job from cron.job where jobname = 'modelrate-global-scan';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'modelrate-global-scan',
    '0-24 16 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'modelrate_site_url') || '/api/jobs/scan',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'modelrate_scan_secret')
        ),
        body := '{"limit":10}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
  return 'modelrate-global-scan starts daily at 00:00 Asia/Shanghai; 25 ten-region batches complete in about 25 minutes';
end;
$$;

revoke all on function public.configure_modelrate_cron(text, text) from anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'modelrate-global-scan';
  if existing_job is not null then
    perform cron.alter_job(existing_job, schedule := '0-24 16 * * *');
  end if;
end;
$$;
