-- ============================================================================
-- Post-consensus side modifiers (QB / injury).
-- Manual rows are first-class for CFB. NFL can also auto-fill from Rundown hard-outs × PVAL.
-- Does NOT rebuild power ratings. Applied after the board, before Scott value / publish.
-- Apply statement-by-statement if the SQL runner rejects multi-command files.
-- ============================================================================

create table if not exists public.syndicate_side_modifiers (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null,
  event_id text,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz,
  -- Positive = favors home (away more hurt / home less hurt)
  net_spread_impact_home numeric not null,
  reason text not null,
  source text not null default 'manual'
    check (source in ('manual', 'rundown_pval')),
  player_name text,
  player_pos text,
  player_status text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syndicate_side_modifiers_impact_clamp
    check (net_spread_impact_home between -10 and 10)
);

create index if not exists syndicate_side_modifiers_active_sport_idx
  on public.syndicate_side_modifiers (sport_key, active)
  where active = true;

create index if not exists syndicate_side_modifiers_event_idx
  on public.syndicate_side_modifiers (event_id)
  where event_id is not null;

comment on table public.syndicate_side_modifiers is
  'Post-consensus QB/injury side adjustments. Manual for CFB; NFL may use Rundown hard-outs × PVAL. Never invent impacts.';

alter table public.syndicate_side_modifiers enable row level security;

drop policy if exists syndicate_side_modifiers_admin_all on public.syndicate_side_modifiers;
create policy syndicate_side_modifiers_admin_all on public.syndicate_side_modifiers
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());
