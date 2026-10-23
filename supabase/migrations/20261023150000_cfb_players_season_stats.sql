-- CFB game hub Players expand: season stats per player (CFBD, keyed by ESPN athlete id).
-- Filled daily by scripts/sync-cfb-player-stats.mjs (one CFBD call for every team).

alter table public.cfb_players
  add column if not exists season_stats jsonb,
  add column if not exists season_stats_year int,
  add column if not exists season_stats_at timestamptz;

comment on column public.cfb_players.season_stats is
  'Season counting stats in NFL hub keys (season_pass_yd, season_rush_att, ...). Source: CFBD /stats/player/season.';

-- p_rows: [{ "espn_id": "123", "stats": { "season_pass_yd": 906, ... } }, ...]
-- Updates existing roster rows only (identity comes from sync-cfb-players.mjs).
create or replace function public.cfb_players_set_season_stats(p_year int, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.cfb_players p
     set season_stats = r.stats,
         season_stats_year = p_year,
         season_stats_at = now()
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(espn_id text, stats jsonb)
   where p.espn_id = r.espn_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cfb_players_set_season_stats(int, jsonb) from public, anon, authenticated;
grant execute on function public.cfb_players_set_season_stats(int, jsonb) to service_role;
