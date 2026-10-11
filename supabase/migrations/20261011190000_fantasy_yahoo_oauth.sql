-- Fantasy Connect … Yahoo OAuth state + server-only tokens (never exposed to authenticated clients).

create table if not exists public.fantasy_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('yahoo', 'espn', 'cbs')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists fantasy_oauth_states_expires_idx
  on public.fantasy_oauth_states (expires_at);

comment on table public.fantasy_oauth_states is
  'Short-lived OAuth CSRF state for Fantasy Connect providers. Service-role only.';

alter table public.fantasy_oauth_states enable row level security;

-- No authenticated policies … Edge service role only.
revoke all on public.fantasy_oauth_states from authenticated, anon;
grant all on public.fantasy_oauth_states to service_role;

create table if not exists public.fantasy_provider_tokens (
  connection_id uuid primary key
    references public.fantasy_connections (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  token_type text not null default 'bearer',
  updated_at timestamptz not null default now()
);

comment on table public.fantasy_provider_tokens is
  'OAuth access/refresh tokens for Fantasy Connect. Service-role only … never select via anon/authenticated.';

alter table public.fantasy_provider_tokens enable row level security;

revoke all on public.fantasy_provider_tokens from authenticated, anon;
grant all on public.fantasy_provider_tokens to service_role;

-- Optional Yahoo player key on roster rows (sleeper_id still canonical for hub pins).
alter table public.fantasy_rosters
  add column if not exists yahoo_player_key text;

create index if not exists fantasy_rosters_yahoo_player_idx
  on public.fantasy_rosters (yahoo_player_key)
  where yahoo_player_key is not null;
