-- ============================================================================
-- CFB consensus blend component columns (Phase 1: SP+ / FPI / Sagarin)
-- power_rating remains the weighted consensus (40/25/25/10 with Elo).
-- Apply as three separate statements if your SQL runner rejects multi-command files.
-- ============================================================================

alter table public.cfb_team_power_ratings add column if not exists fpi_rating numeric;

alter table public.cfb_team_power_ratings add column if not exists sp_rating numeric;

alter table public.cfb_team_power_ratings add column if not exists sagarin_rating numeric;
