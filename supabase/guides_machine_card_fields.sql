-- Optional: extra columns for guide cards (volatility index, popularity line, release year, card gist).
-- Safe to re-run (IF NOT EXISTS).

alter table public.machines add column if not exists volatility_index text;
alter table public.machines add column if not exists popularity_summary text;
alter table public.machines add column if not exists release_year smallint;

alter table public.guides add column if not exists card_gist text;

-- Example seed for Buffalo Link (tune anytime in the dashboard / SQL).
update public.machines
set
  volatility_index = coalesce(nullif(trim(volatility_index), ''), 'High (extreme session swings)'),
  popularity_summary = coalesce(nullif(trim(popularity_summary), ''), 'Strip & locals — very high floor presence')
where slug = 'buffalo-link';
