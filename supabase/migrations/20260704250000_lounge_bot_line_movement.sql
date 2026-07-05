-- Line movement alerts: per-event line snapshots + publish log kinds.

create table if not exists public.lounge_odds_event_lines (
  bot_user_id uuid not null references public.lounge_bot_accounts (user_id) on delete cascade,
  event_id text not null,
  sport_key text not null,
  market_key text not null check (market_key in ('h2h', 'spreads', 'totals')),
  outcome_name text not null,
  line_point numeric,
  consensus_price integer not null,
  best_price integer not null,
  best_book_key text,
  best_book_title text,
  updated_at timestamptz not null default now(),
  primary key (bot_user_id, event_id, market_key, outcome_name)
);

create index if not exists lounge_odds_event_lines_bot_updated_idx
  on public.lounge_odds_event_lines (bot_user_id, updated_at desc);

comment on table public.lounge_odds_event_lines is
  'Latest consensus line per game/market/outcome for Scott line-movement compare on each poll.';

alter table public.lounge_odds_event_lines enable row level security;

drop policy if exists lounge_odds_event_lines_admin_select on public.lounge_odds_event_lines;
create policy lounge_odds_event_lines_admin_select on public.lounge_odds_event_lines
  for select to authenticated
  using (public.play_log_viewer_is_admin());

alter table public.lounge_bot_odds_config
  add column if not exists line_movement_enabled boolean not null default true;

alter table public.lounge_bot_odds_config
  add column if not exists max_line_alerts_per_day integer not null default 12
    check (max_line_alerts_per_day between 1 and 48);

alter table public.lounge_bot_odds_config
  add column if not exists min_spread_move_pts numeric not null default 0.5;

alter table public.lounge_bot_odds_config
  add column if not exists min_total_move_pts numeric not null default 0.5;

alter table public.lounge_bot_odds_config
  add column if not exists min_ml_move_pts integer not null default 20
    check (min_ml_move_pts between 5 and 200);

comment on column public.lounge_bot_odds_config.line_movement_enabled is
  'When true, poll_edges compares odds snapshots and posts line movement alerts.';
comment on column public.lounge_bot_odds_config.min_ml_move_pts is
  'Min American odds shift (e.g. +150 to +130 = 20) to flag ML movement.';

alter table public.lounge_bot_publish_log
  drop constraint if exists lounge_bot_publish_log_post_kind_check;

alter table public.lounge_bot_publish_log
  add constraint lounge_bot_publish_log_post_kind_check
  check (post_kind in (
    'edge', 'slate', 'coffee_covers', 'wire', 'x', 'other',
    'line_movement', 'sharp_move', 'steam', 'rlm'
  ));

comment on column public.lounge_bot_publish_log.post_kind is
  'Published post type: edge, coffee_covers, line_movement, sharp_move, steam, rlm, etc.';
