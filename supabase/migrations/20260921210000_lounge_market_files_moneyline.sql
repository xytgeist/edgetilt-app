-- Persist Pinnacle (sharp) moneyline open / current / close alongside spreads + totals.
-- The Odds API market key is h2h (head-to-head). Used by Lounge game pills for closing ML.

alter table public.lounge_market_files
  add column if not exists open_home_ml integer,
  add column if not exists open_away_ml integer,
  add column if not exists open_ml_at timestamptz,
  add column if not exists open_ml_source text,
  add column if not exists current_home_ml integer,
  add column if not exists current_away_ml integer,
  add column if not exists current_ml_at timestamptz,
  add column if not exists current_ml_source text,
  add column if not exists close_home_ml integer,
  add column if not exists close_away_ml integer,
  add column if not exists close_ml_at timestamptz,
  add column if not exists close_ml_source text;

comment on column public.lounge_market_files.close_home_ml is
  'Locked Pinnacle (or sharp) home moneyline at close. Odds API market key: h2h.';
comment on column public.lounge_market_files.close_away_ml is
  'Locked Pinnacle (or sharp) away moneyline at close. Odds API market key: h2h.';
