-- Regression cases keep when the post went out, so the in-game guard (Out posted mid-game = in-game ruling) runs
-- the same way in regression as in live polling.
alter table public.fantasy_insider_regression add column if not exists posted_at timestamptz;
