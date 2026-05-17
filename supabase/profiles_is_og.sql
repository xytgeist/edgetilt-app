-- Earliest-adopter flag: first 1000 profiles by `created_at` (ties broken by `user_id`).
-- Run once per environment after `profiles` exists. Safe to re-run: only sets `is_og` true for the cohort.

alter table public.profiles
  add column if not exists is_og boolean not null default false;

comment on column public.profiles.is_og is
  'True for the first 1000 profiles (product OG cohort). Backfill below + `profiles_is_og_assign_on_insert.sql` trigger for new rows.';

update public.profiles p
set is_og = true
from (
  select user_id
  from public.profiles
  order by created_at asc nulls last, user_id asc
  limit 1000
) first_k
where p.user_id = first_k.user_id;

-- Optional: keep new rows false (default already false)
create index if not exists profiles_is_og_idx
  on public.profiles (is_og)
  where is_og is true;
