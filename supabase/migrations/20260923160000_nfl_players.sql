-- NFL player identity map for Lounge game hub Players / Fantasy tabs.
-- Populated by scripts/sync-nfl-players.mjs (Sleeper + ESPN headshot CDN).

create table if not exists public.nfl_players (
  sleeper_id text primary key,
  espn_id text,
  full_name text not null,
  position text,
  team text,
  fantasy_positions text[] not null default '{}',
  search_rank integer,
  status text,
  headshot_url text,
  local_headshot_path text,
  updated_at timestamptz not null default now()
);

create index if not exists nfl_players_team_pos_idx
  on public.nfl_players (team, position)
  where team is not null;

create index if not exists nfl_players_espn_id_idx
  on public.nfl_players (espn_id)
  where espn_id is not null;

create index if not exists nfl_players_name_lower_idx
  on public.nfl_players (lower(full_name));

comment on table public.nfl_players is
  'Crosswalk for Lounge NFL game hub (Sleeper id, ESPN headshot, team/pos).';

alter table public.nfl_players enable row level security;

drop policy if exists "Authenticated read nfl_players" on public.nfl_players;
create policy "Authenticated read nfl_players"
  on public.nfl_players
  for select
  to authenticated
  using (true);

drop policy if exists "Service write nfl_players" on public.nfl_players;
create policy "Service write nfl_players"
  on public.nfl_players
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.nfl_players to authenticated;
grant all on public.nfl_players to service_role;

-- Short TTL cache for game-scoped fantasy / props payloads (Edge writes).
create table if not exists public.nfl_game_fantasy_cache (
  event_id text primary key,
  away_abbrev text not null,
  home_abbrev text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists nfl_game_fantasy_cache_fetched_idx
  on public.nfl_game_fantasy_cache (fetched_at desc);

comment on table public.nfl_game_fantasy_cache is
  'lounge-nfl-game-fantasy Edge response cache (short TTL).';

alter table public.nfl_game_fantasy_cache enable row level security;

drop policy if exists "Service all nfl_game_fantasy_cache" on public.nfl_game_fantasy_cache;
create policy "Service all nfl_game_fantasy_cache"
  on public.nfl_game_fantasy_cache
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on public.nfl_game_fantasy_cache to service_role;
