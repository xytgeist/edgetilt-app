-- Result-tape rows for MMA names UFC Stats does not list.
-- career_measured false: Scott must not treat column defaults as a real sheet.
-- counts_measured false: Rocco must not treat td / sig strikes as zeros.

alter table public.ufc_fighter_metrics
  add column if not exists career_measured boolean not null default true;

alter table public.ufc_fighter_last5
  add column if not exists counts_measured boolean not null default true;

alter table public.ufc_fighter_last5
  add column if not exists tape_source text not null default 'ufcstats';

comment on column public.ufc_fighter_metrics.career_measured is
  'False when the row is only a Sherdog result-tape anchor. Career rates are placeholders.';

comment on column public.ufc_fighter_last5.counts_measured is
  'False when takedowns and sig strikes were not on the source page. Do not read those columns as zero.';
