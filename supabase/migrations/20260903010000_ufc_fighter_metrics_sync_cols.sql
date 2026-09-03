-- UFC fighter metrics: live UFC Stats sync provenance
-- Adds optional detail URL + last successful sync timestamp for syndicate:sync-ufc-metrics.
-- Apply as single statements if the CLI rejects multi-command files.

alter table public.ufc_fighter_metrics add column if not exists ufcstats_url text;
