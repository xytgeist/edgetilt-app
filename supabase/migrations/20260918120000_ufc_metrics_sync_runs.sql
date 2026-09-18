-- Last UFC Stats refresh dump for Syndicate Ops.
-- Written by scripts/sync-ufc-fighter-metrics.mjs. Heartbeats stay pass/fail.

create table if not exists public.ufc_metrics_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  proposed_rows integer not null default 0,
  wrote integer not null default 0,
  inserted_n integer not null default 0,
  updated_n integer not null default 0,
  unchanged_n integer not null default 0,
  skipped_overrides integer not null default 0,
  failed_n integer not null default 0,
  table_n integer,
  movers jsonb not null default '[]'::jsonb,
  summary text
);

create index if not exists ufc_metrics_sync_runs_ran_idx
  on public.ufc_metrics_sync_runs (ran_at desc);

comment on table public.ufc_metrics_sync_runs is
  'UFC metrics refresh dump for sharpesyndicate.com/ops. Latest row is the Tuesday what-changed screen.';

alter table public.ufc_metrics_sync_runs enable row level security;

drop policy if exists "Public read ufc_metrics_sync_runs" on public.ufc_metrics_sync_runs;
create policy "Public read ufc_metrics_sync_runs"
  on public.ufc_metrics_sync_runs
  for select
  using (true);

drop policy if exists "Service write ufc_metrics_sync_runs" on public.ufc_metrics_sync_runs;
create policy "Service write ufc_metrics_sync_runs"
  on public.ufc_metrics_sync_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.ufc_metrics_sync_runs to anon, authenticated;
grant all on public.ufc_metrics_sync_runs to service_role;
