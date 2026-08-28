-- ============================================================================
-- lounge_bot_picks: Ledger for predictive betting picks made by sports bots
-- Supports 4 distinct sharp personas (Scott, Rocco, Chedda, Tank)
-- Auto-graded against live final scores with unit tracking and record summaries.
-- ============================================================================

create table if not exists public.lounge_bot_picks (
  id uuid primary key default gen_random_uuid(),
  bot_user_id uuid not null references public.lounge_bot_accounts (user_id) on delete cascade,
  picker_name text not null default 'Scott' check (picker_name in ('Scott', 'Rocco', 'Chedda', 'Tank')),
  post_id uuid references public.community_feed_posts (id) on delete set null,
  comment_id uuid references public.feed_comments (id) on delete set null,
  event_id text not null,
  sport_key text not null,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  market_key text not null check (market_key in ('h2h', 'spreads', 'totals')),
  pick_name text not null,
  pick_line numeric,
  pick_price numeric not null,
  book_title text,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'push', 'cancelled')),
  home_score integer,
  away_score integer,
  units_net numeric,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lounge_bot_picks_bot_created_idx
  on public.lounge_bot_picks (bot_user_id, created_at desc);

create index if not exists lounge_bot_picks_status_idx
  on public.lounge_bot_picks (status, commence_time);

create index if not exists lounge_bot_picks_event_idx
  on public.lounge_bot_picks (event_id, market_key, pick_name);

create index if not exists lounge_bot_picks_picker_idx
  on public.lounge_bot_picks (picker_name, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lounge_bot_picks enable row level security;

drop policy if exists lounge_bot_picks_public_select on public.lounge_bot_picks;
create policy lounge_bot_picks_public_select on public.lounge_bot_picks
  for select to authenticated, anon
  using (true);

drop policy if exists lounge_bot_picks_admin_all on public.lounge_bot_picks;
create policy lounge_bot_picks_admin_all on public.lounge_bot_picks
  for all to authenticated
  using (public.play_log_viewer_is_admin())
  with check (public.play_log_viewer_is_admin());

-- ---------------------------------------------------------------------------
-- Record Summary RPC (Overall + Per-Picker breakdown)
-- ---------------------------------------------------------------------------

create or replace function public.lounge_bot_get_picks_record(p_bot_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_overall jsonb;
  v_pickers jsonb := '{}'::jsonb;
  v_name text;
  v_wins int;
  v_losses int;
  v_pushes int;
  v_pending int;
  v_units numeric;
  v_win_rate numeric;
  v_total_resolved int;
begin
  -- Calculate overall stats
  select
    coalesce(count(*) filter (where status = 'won'), 0),
    coalesce(count(*) filter (where status = 'lost'), 0),
    coalesce(count(*) filter (where status = 'push'), 0),
    coalesce(count(*) filter (where status = 'pending'), 0),
    coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0)
  into v_wins, v_losses, v_pushes, v_pending, v_units
  from public.lounge_bot_picks
  where bot_user_id = p_bot_user_id;

  v_total_resolved := v_wins + v_losses;
  v_win_rate := 0.0;
  if v_total_resolved > 0 then
    v_win_rate := round((v_wins::numeric / v_total_resolved::numeric) * 100.0, 1);
  end if;

  v_overall := jsonb_build_object(
    'wins', v_wins,
    'losses', v_losses,
    'pushes', v_pushes,
    'pending', v_pending,
    'win_rate_pct', v_win_rate,
    'units_net', round(v_units, 2)
  );

  -- Calculate stats for each persona
  for v_name in select unnest(array['Scott', 'Rocco', 'Chedda', 'Tank']) loop
    select
      coalesce(count(*) filter (where status = 'won'), 0),
      coalesce(count(*) filter (where status = 'lost'), 0),
      coalesce(count(*) filter (where status = 'push'), 0),
      coalesce(count(*) filter (where status = 'pending'), 0),
      coalesce(sum(units_net) filter (where status in ('won', 'lost', 'push')), 0)
    into v_wins, v_losses, v_pushes, v_pending, v_units
    from public.lounge_bot_picks
    where bot_user_id = p_bot_user_id and picker_name = v_name;

    v_total_resolved := v_wins + v_losses;
    v_win_rate := 0.0;
    if v_total_resolved > 0 then
      v_win_rate := round((v_wins::numeric / v_total_resolved::numeric) * 100.0, 1);
    end if;

    v_pickers := v_pickers || jsonb_build_object(
      v_name, jsonb_build_object(
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'pending', v_pending,
        'win_rate_pct', v_win_rate,
        'units_net', round(v_units, 2)
      )
    );
  end loop;

  return jsonb_build_object(
    'overall', v_overall,
    'pickers', v_pickers
  );
end;
$$;

revoke all on function public.lounge_bot_get_picks_record(uuid) from public;
grant execute on function public.lounge_bot_get_picks_record(uuid) to authenticated, anon, service_role;
