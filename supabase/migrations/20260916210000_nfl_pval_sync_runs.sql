-- Last Sleeper / TWO·DEEP PVAL refresh dump for Syndicate Ops.
-- Written by scripts/pval-sleeper-sync.mjs on --apply. Heartbeats stay pass/fail.

create table if not exists public.nfl_pval_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'sleeper'
    check (source in ('sleeper', 'twodeep')),
  season text,
  week integer,
  ran_at timestamptz not null default now(),
  proposed_rows integer not null default 0,
  wrote integer not null default 0,
  inserted_n integer not null default 0,
  updated_n integer not null default 0,
  unchanged_n integer not null default 0,
  skipped_overrides integer not null default 0,
  table_n integer,
  override_n integer,
  band_counts jsonb not null default '{}'::jsonb,
  movers jsonb not null default '[]'::jsonb,
  override_blocked jsonb not null default '[]'::jsonb,
  summary text
);

create index if not exists nfl_pval_sync_runs_source_ran_idx
  on public.nfl_pval_sync_runs (source, ran_at desc);

comment on table public.nfl_pval_sync_runs is
  'PVAL refresh dump for sharpesyndicate.com/ops. Latest sleeper row is the Tuesday check.';

alter table public.nfl_pval_sync_runs enable row level security;

drop policy if exists "Public read nfl_pval_sync_runs" on public.nfl_pval_sync_runs;
create policy "Public read nfl_pval_sync_runs"
  on public.nfl_pval_sync_runs
  for select
  using (true);

drop policy if exists "Service write nfl_pval_sync_runs" on public.nfl_pval_sync_runs;
create policy "Service write nfl_pval_sync_runs"
  on public.nfl_pval_sync_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.nfl_pval_sync_runs to anon, authenticated;
grant all on public.nfl_pval_sync_runs to service_role;
