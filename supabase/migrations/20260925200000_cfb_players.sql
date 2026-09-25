-- CFB player identity for Lounge game hub (ESPN roster + headshot CDN).
-- Populated by scripts/sync-cfb-players.mjs.

create table if not exists public.cfb_players (
  espn_id text primary key,
  full_name text not null,
  first_name text,
  last_name text,
  position text,
  jersey text,
  team_abbrev text,
  team_espn_id text,
  school text,
  headshot_url text,
  local_headshot_path text,
  status text,
  updated_at timestamptz not null default now()
);

create index if not exists cfb_players_team_pos_idx
  on public.cfb_players (team_abbrev, position)
  where team_abbrev is not null;

create index if not exists cfb_players_team_espn_idx
  on public.cfb_players (team_espn_id)
  where team_espn_id is not null;

create index if not exists cfb_players_name_lower_idx
  on public.cfb_players (lower(full_name));

comment on table public.cfb_players is
  'ESPN college-football roster seats for Lounge CFB hub (headshots, team/pos).';

alter table public.cfb_players enable row level security;

drop policy if exists "Authenticated read cfb_players" on public.cfb_players;
create policy "Authenticated read cfb_players"
  on public.cfb_players
  for select
  to authenticated
  using (true);

drop policy if exists "Service write cfb_players" on public.cfb_players;
create policy "Service write cfb_players"
  on public.cfb_players
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.cfb_players to authenticated;
grant all on public.cfb_players to service_role;
