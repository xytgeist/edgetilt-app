-- Fantasy Connect MVP … provider-agnostic league sync (Sleeper first).
-- Owner-only RLS. Edge link/sync uses service role after user JWT auth.

create table if not exists public.fantasy_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('sleeper', 'yahoo', 'espn', 'cbs')),
  external_user_id text not null,
  external_username text,
  status text not null default 'active'
    check (status in ('active', 'error', 'revoked')),
  last_error text,
  last_sync_at timestamptz,
  primary_league_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

comment on table public.fantasy_connections is
  'Linked fantasy platform accounts per EdgeTilt user. Sleeper uses username → user_id; Yahoo/ESPN/CBS later.';

create table if not exists public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.fantasy_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('sleeper', 'yahoo', 'espn', 'cbs')),
  external_league_id text not null,
  name text not null default '',
  season int not null,
  sport text not null default 'nfl',
  scoring jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_league_id)
);

comment on table public.fantasy_leagues is
  'Fantasy leagues synced from a connection. is_primary drives game-hub mine/enemy auto-pins.';

alter table public.fantasy_connections
  drop constraint if exists fantasy_connections_primary_league_id_fkey;
alter table public.fantasy_connections
  add constraint fantasy_connections_primary_league_id_fkey
  foreign key (primary_league_id) references public.fantasy_leagues (id) on delete set null;

create table if not exists public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  external_team_id text not null,
  owner_name text not null default '',
  team_name text not null default '',
  avatar_url text,
  is_mine boolean not null default false,
  wins int not null default 0,
  losses int not null default 0,
  ties int not null default 0,
  points_for numeric,
  points_against numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, external_team_id)
);

comment on table public.fantasy_teams is
  'League teams / rosters. is_mine marks the connected user''s team.';

create table if not exists public.fantasy_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week int not null,
  sleeper_id text,
  player_name text not null default '',
  position text,
  nfl_team text,
  slot text not null default 'bench'
    check (slot in ('starter', 'bench', 'ir', 'taxi')),
  slot_label text,
  created_at timestamptz not null default now(),
  unique (team_id, week, sleeper_id, slot_label)
);

comment on table public.fantasy_rosters is
  'Per-week lineup rows. sleeper_id is the canonical player key (maps to nfl_players).';

create index if not exists fantasy_rosters_user_week_sleeper_idx
  on public.fantasy_rosters (user_id, week, sleeper_id)
  where sleeper_id is not null;

create table if not exists public.fantasy_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week int not null,
  mine_team_id uuid references public.fantasy_teams (id) on delete set null,
  opp_team_id uuid references public.fantasy_teams (id) on delete set null,
  mine_score numeric,
  opp_score numeric,
  external_matchup_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, week, mine_team_id)
);

comment on table public.fantasy_matchups is
  'This-week (and historical) head-to-head rows for the connected user''s team.';

create index if not exists fantasy_leagues_user_idx on public.fantasy_leagues (user_id);
create index if not exists fantasy_teams_league_idx on public.fantasy_teams (league_id);
create index if not exists fantasy_matchups_user_week_idx on public.fantasy_matchups (user_id, week);

create or replace function public.fantasy_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists fantasy_connections_touch on public.fantasy_connections;
create trigger fantasy_connections_touch
  before update on public.fantasy_connections
  for each row execute function public.fantasy_touch_updated_at();

drop trigger if exists fantasy_leagues_touch on public.fantasy_leagues;
create trigger fantasy_leagues_touch
  before update on public.fantasy_leagues
  for each row execute function public.fantasy_touch_updated_at();

drop trigger if exists fantasy_teams_touch on public.fantasy_teams;
create trigger fantasy_teams_touch
  before update on public.fantasy_teams
  for each row execute function public.fantasy_touch_updated_at();

drop trigger if exists fantasy_matchups_touch on public.fantasy_matchups;
create trigger fantasy_matchups_touch
  before update on public.fantasy_matchups
  for each row execute function public.fantasy_touch_updated_at();

alter table public.fantasy_connections enable row level security;
alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.fantasy_rosters enable row level security;
alter table public.fantasy_matchups enable row level security;

drop policy if exists fantasy_connections_own on public.fantasy_connections;
create policy fantasy_connections_own on public.fantasy_connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists fantasy_leagues_own on public.fantasy_leagues;
create policy fantasy_leagues_own on public.fantasy_leagues
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists fantasy_teams_own on public.fantasy_teams;
create policy fantasy_teams_own on public.fantasy_teams
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists fantasy_rosters_own on public.fantasy_rosters;
create policy fantasy_rosters_own on public.fantasy_rosters
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists fantasy_matchups_own on public.fantasy_matchups;
create policy fantasy_matchups_own on public.fantasy_matchups
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.fantasy_connections to authenticated;
grant select, insert, update, delete on public.fantasy_leagues to authenticated;
grant select, insert, update, delete on public.fantasy_teams to authenticated;
grant select, insert, update, delete on public.fantasy_rosters to authenticated;
grant select, insert, update, delete on public.fantasy_matchups to authenticated;
