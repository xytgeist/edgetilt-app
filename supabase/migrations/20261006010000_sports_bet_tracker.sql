-- Sports bet tracker (Sports Edge v1).
-- Manual + hub-prefill logs. CLV against locked lounge_market_files closes.
-- Apply on test before the Sports Bets tab works.

create table if not exists public.sports_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  event_id text,
  sport_key text,
  sport_label text,
  home_team text,
  away_team text,
  commence_time timestamptz,

  book text,
  market text not null default 'spread'
    check (market in ('spread', 'h2h', 'total', 'other')),
  side text
    check (side is null or side in ('home', 'away', 'over', 'under', 'draw')),
  selection_label text not null,
  line numeric,
  odds integer not null,

  stake_units numeric not null default 1
    check (stake_units > 0),
  stake_dollars numeric
    check (stake_dollars is null or stake_dollars >= 0),
  unit_size_dollars numeric
    check (unit_size_dollars is null or unit_size_dollars >= 0),

  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'push', 'void')),
  result_at timestamptz,
  profit_units numeric,

  close_line numeric,
  close_odds integer,
  clv_pts numeric,
  clv_graded_at timestamptz,

  notes text,
  tags text[] not null default '{}',
  source text not null default 'manual'
    check (source in ('manual', 'game_hub')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sports_bets_user_created_idx
  on public.sports_bets (user_id, created_at desc);

create index if not exists sports_bets_user_status_idx
  on public.sports_bets (user_id, status);

create index if not exists sports_bets_user_event_idx
  on public.sports_bets (user_id, event_id)
  where event_id is not null;

comment on table public.sports_bets is
  'Sports Edge bet tracker: user wagers with optional CLV vs lounge_market_files close.';

alter table public.sports_bets enable row level security;

drop policy if exists sports_bets_select_own on public.sports_bets;
create policy sports_bets_select_own on public.sports_bets
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists sports_bets_insert_own on public.sports_bets;
create policy sports_bets_insert_own on public.sports_bets
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists sports_bets_update_own on public.sports_bets;
create policy sports_bets_update_own on public.sports_bets
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists sports_bets_delete_own on public.sports_bets;
create policy sports_bets_delete_own on public.sports_bets
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.sports_bets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sports_bets_touch_updated_at on public.sports_bets;
create trigger sports_bets_touch_updated_at
  before update on public.sports_bets
  for each row
  execute function public.sports_bets_touch_updated_at();

-- Grade CLV for the caller's bets against locked market-file closes.
-- Does not expose lounge_market_files rows to the client.
create or replace function public.sports_bets_refresh_clv()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.sports_bets b
  set
    close_line = case
      when b.market = 'spread' then
        case
          when b.side = 'home' then mf.close_spread_home
          when b.side = 'away' then -mf.close_spread_home
          else null
        end
      when b.market = 'total' then mf.close_total
      else null
    end,
    clv_pts = case
      when b.market = 'spread' and b.line is not null and mf.close_spread_home is not null then
        case
          when b.side = 'home' then b.line - mf.close_spread_home
          when b.side = 'away' then b.line - (-mf.close_spread_home)
          else null
        end
      when b.market = 'total' and b.line is not null and mf.close_total is not null then
        case
          when b.side = 'over' then b.line - mf.close_total
          when b.side = 'under' then mf.close_total - b.line
          else null
        end
      else null
    end,
    clv_graded_at = now()
  from public.lounge_market_files mf
  where b.user_id = uid
    and b.event_id is not null
    and mf.event_id = b.event_id
    and mf.close_locked = true
    and b.market in ('spread', 'total');

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sports_bets_refresh_clv() from public;
grant execute on function public.sports_bets_refresh_clv() to authenticated;

comment on function public.sports_bets_refresh_clv() is
  'Refresh CLV for the signed-in user from locked lounge_market_files closes.';
