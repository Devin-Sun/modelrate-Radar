create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists public.scan_state (
  id integer primary key default 1 check (id = 1),
  next_index integer not null default 0,
  cycle_number bigint not null default 1,
  cycle_started_at timestamptz not null default now(),
  last_completed_at timestamptz,
  last_batch_at timestamptz,
  total_regions integer not null default 249,
  last_error text
);

insert into public.scan_state (id) values (1)
on conflict (id) do nothing;

create table if not exists public.price_observations (
  id bigint generated always as identity primary key,
  country text not null check (country ~ '^[A-Z]{2}$'),
  provider text not null check (provider in ('openai', 'anthropic')),
  plan_id text not null,
  plan_name text not null,
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  amount numeric not null check (amount >= 0),
  currency text not null,
  display text not null,
  usd_amount numeric not null check (usd_amount >= 0),
  usd_monthly_equivalent numeric not null check (usd_monthly_equivalent >= 0),
  source text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists price_observations_lookup_idx
  on public.price_observations (country, provider, plan_id, billing_period, observed_at desc);
create index if not exists price_observations_time_idx
  on public.price_observations (observed_at desc);

create table if not exists public.latest_prices (
  country text not null,
  provider text not null,
  plan_id text not null,
  plan_name text not null,
  billing_period text not null,
  amount numeric not null,
  currency text not null,
  display text not null,
  usd_amount numeric not null,
  usd_monthly_equivalent numeric not null,
  source text,
  observed_at timestamptz not null,
  observation_id bigint references public.price_observations(id) on delete set null,
  primary key (country, provider, plan_id, billing_period)
);

create index if not exists latest_prices_minimum_idx
  on public.latest_prices (provider, plan_id, billing_period, usd_monthly_equivalent);

create table if not exists public.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  provider text check (provider is null or provider in ('openai', 'anthropic')),
  plan_id text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  threshold_percent numeric not null default 1 check (threshold_percent >= 0 and threshold_percent <= 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_token uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

create unique index if not exists alert_subscriptions_confirm_idx on public.alert_subscriptions(confirm_token);
create unique index if not exists alert_subscriptions_unsubscribe_idx on public.alert_subscriptions(unsubscribe_token);
create index if not exists alert_subscriptions_matching_idx
  on public.alert_subscriptions(status, provider, plan_id, country);

create table if not exists public.alert_deliveries (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.alert_subscriptions(id) on delete cascade,
  observation_id bigint not null references public.price_observations(id) on delete cascade,
  previous_usd_monthly numeric not null,
  current_usd_monthly numeric not null,
  drop_percent numeric not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  processing_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(subscription_id, observation_id)
);

create or replace function public.claim_scan_batch(p_regions text[], p_limit integer default 10)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  state_row public.scan_state%rowtype;
  region_count integer;
  take_count integer;
  result text[] := '{}';
  offset_index integer;
  next_value integer;
begin
  select * into state_row from public.scan_state where id = 1 for update;
  region_count := coalesce(array_length(p_regions, 1), 0);
  if region_count = 0 then return result; end if;
  take_count := least(greatest(p_limit, 1), 10, region_count - state_row.next_index);

  for offset_index in 0..take_count - 1 loop
    result := array_append(result, p_regions[((state_row.next_index + offset_index) % region_count) + 1]);
  end loop;

  next_value := (state_row.next_index + take_count) % region_count;
  update public.scan_state set
    next_index = next_value,
    last_batch_at = now(),
    last_error = null,
    total_regions = region_count,
    last_completed_at = case when next_value < state_row.next_index then now() else last_completed_at end,
    cycle_started_at = case when next_value < state_row.next_index then now() else cycle_started_at end,
    cycle_number = case when next_value < state_row.next_index then cycle_number + 1 else cycle_number end
  where id = 1;
  return result;
end;
$$;

create or replace function public.record_price_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  previous_row public.latest_prices%rowtype;
  observation_key bigint;
  drop_value numeric;
  inserted_count integer := 0;
  delivery_count integer := 0;
  created_in_row integer := 0;
begin
  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select * into previous_row
    from public.latest_prices
    where country = item->>'country'
      and provider = item->>'provider'
      and plan_id = item->>'plan_id'
      and billing_period = item->>'billing_period';

    if previous_row.country is not null
      and previous_row.amount = (item->>'amount')::numeric
      and previous_row.currency = item->>'currency'
      then
      update public.latest_prices set
        display = item->>'display',
        usd_amount = (item->>'usd_amount')::numeric,
        usd_monthly_equivalent = (item->>'usd_monthly_equivalent')::numeric,
        source = item->>'source',
        observed_at = (item->>'observed_at')::timestamptz
      where country = item->>'country'
        and provider = item->>'provider'
        and plan_id = item->>'plan_id'
        and billing_period = item->>'billing_period';
      continue;
    end if;

    insert into public.price_observations (
      country, provider, plan_id, plan_name, billing_period, amount, currency,
      display, usd_amount, usd_monthly_equivalent, source, observed_at
    ) values (
      item->>'country', item->>'provider', item->>'plan_id', item->>'plan_name',
      item->>'billing_period', (item->>'amount')::numeric, item->>'currency',
      item->>'display', (item->>'usd_amount')::numeric,
      (item->>'usd_monthly_equivalent')::numeric, item->>'source',
      (item->>'observed_at')::timestamptz
    ) returning id into observation_key;
    inserted_count := inserted_count + 1;

    insert into public.latest_prices (
      country, provider, plan_id, plan_name, billing_period, amount, currency,
      display, usd_amount, usd_monthly_equivalent, source, observed_at, observation_id
    ) values (
      item->>'country', item->>'provider', item->>'plan_id', item->>'plan_name',
      item->>'billing_period', (item->>'amount')::numeric, item->>'currency',
      item->>'display', (item->>'usd_amount')::numeric,
      (item->>'usd_monthly_equivalent')::numeric, item->>'source',
      (item->>'observed_at')::timestamptz, observation_key
    ) on conflict (country, provider, plan_id, billing_period) do update set
      plan_name = excluded.plan_name,
      amount = excluded.amount,
      currency = excluded.currency,
      display = excluded.display,
      usd_amount = excluded.usd_amount,
      usd_monthly_equivalent = excluded.usd_monthly_equivalent,
      source = excluded.source,
      observed_at = excluded.observed_at,
      observation_id = excluded.observation_id;

    if previous_row.usd_monthly_equivalent is not null
      and previous_row.usd_monthly_equivalent > 0
      and (
        (previous_row.currency = item->>'currency' and (item->>'amount')::numeric < previous_row.amount)
        or (previous_row.currency <> item->>'currency' and (item->>'usd_monthly_equivalent')::numeric < previous_row.usd_monthly_equivalent)
      ) then
      drop_value := case when previous_row.currency = item->>'currency'
        then round((1 - (item->>'amount')::numeric / previous_row.amount) * 100, 2)
        else round((1 - (item->>'usd_monthly_equivalent')::numeric / previous_row.usd_monthly_equivalent) * 100, 2)
      end;
      insert into public.alert_deliveries (
        subscription_id, observation_id, previous_usd_monthly, current_usd_monthly, drop_percent
      )
      select subscription.id, observation_key, previous_row.usd_monthly_equivalent,
        (item->>'usd_monthly_equivalent')::numeric, drop_value
      from public.alert_subscriptions subscription
      where subscription.status = 'active'
        and (subscription.provider is null or subscription.provider = item->>'provider')
        and (subscription.plan_id is null or subscription.plan_id = item->>'plan_id')
        and (subscription.country is null or subscription.country = item->>'country')
        and drop_value >= subscription.threshold_percent
      on conflict do nothing;
      get diagnostics created_in_row = row_count;
      delivery_count := delivery_count + created_in_row;
    end if;
  end loop;
  return jsonb_build_object('observations', inserted_count, 'alerts_created', delivery_count);
end;
$$;

create or replace function public.claim_alert_deliveries(p_limit integer default 20)
returns table (
  delivery_id bigint,
  email text,
  unsubscribe_token uuid,
  country text,
  provider text,
  plan_id text,
  plan_name text,
  billing_period text,
  display text,
  previous_usd_monthly numeric,
  current_usd_monthly numeric,
  drop_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select delivery.id
    from public.alert_deliveries delivery
    where (
      delivery.status in ('pending', 'failed')
      or (delivery.status = 'processing' and delivery.processing_at < now() - interval '15 minutes')
    ) and delivery.attempts < 5
    order by delivery.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  ), updated as (
    update public.alert_deliveries delivery set
      status = 'processing', attempts = attempts + 1, processing_at = now()
    from claimed where delivery.id = claimed.id
    returning delivery.*
  )
  select updated.id, subscription.email, subscription.unsubscribe_token,
    observation.country, observation.provider, observation.plan_id, observation.plan_name,
    observation.billing_period, observation.display, updated.previous_usd_monthly,
    updated.current_usd_monthly, updated.drop_percent
  from updated
  join public.alert_subscriptions subscription on subscription.id = updated.subscription_id
  join public.price_observations observation on observation.id = updated.observation_id;
end;
$$;

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
    '*/1 * * * *',
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
  return 'modelrate-global-scan scheduled every minute; a 249-region cycle completes in about 25 minutes';
end;
$$;

alter table public.scan_state enable row level security;
alter table public.price_observations enable row level security;
alter table public.latest_prices enable row level security;
alter table public.alert_subscriptions enable row level security;
alter table public.alert_deliveries enable row level security;

revoke all on public.scan_state, public.price_observations, public.latest_prices,
  public.alert_subscriptions, public.alert_deliveries from anon, authenticated;
revoke all on function public.claim_scan_batch(text[], integer) from anon, authenticated;
revoke all on function public.record_price_rows(jsonb) from anon, authenticated;
revoke all on function public.claim_alert_deliveries(integer) from anon, authenticated;
revoke all on function public.configure_modelrate_cron(text, text) from anon, authenticated;
