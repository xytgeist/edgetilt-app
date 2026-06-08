-- Optional: extra columns for guide cards (volatility index, popularity line, release year, +EV threshold line).
-- Safe to re-run (IF NOT EXISTS / conditional rename).

alter table public.machines add column if not exists volatility_index text;
alter table public.machines add column if not exists popularity_summary text;
alter table public.machines add column if not exists release_year smallint;

-- Legacy column was `card_gist`; app + sync now use `card_ev_threshold`.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guides' and column_name = 'card_gist'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guides' and column_name = 'card_ev_threshold'
  ) then
    alter table public.guides rename column card_gist to card_ev_threshold;
  end if;
end $$;

alter table public.guides add column if not exists card_ev_threshold text;

-- `machines.type`: allow any label (UI / sync). Drops legacy enum-style CHECK if present.
alter table public.machines drop constraint if exists machines_type_check;

-- Example seed for Buffalo Link (tune anytime in the dashboard / SQL).
update public.machines
set
  volatility_index = coalesce(nullif(trim(volatility_index), ''), 'High (extreme session swings)'),
  popularity_summary = coalesce(nullif(trim(popularity_summary), ''), 'Strip & locals — very common')
where slug = 'buffalo-link';
