-- Player photos copied from ESPN into our R2 (full + 192 px thumb + 512 px card).
-- league is ESPN's headshot path segment (nfl, college-football, golf, nba, nhl, mlb, soccer).
create table if not exists public.player_headshots (
  league text not null,
  espn_id text not null,
  status text not null check (status in ('ok', 'missing')),
  full_url text,
  updated_at timestamptz not null default now(),
  primary key (league, espn_id)
);

alter table public.player_headshots enable row level security;

revoke all on public.player_headshots from anon, authenticated;
grant select, insert, update, delete on public.player_headshots to service_role;
