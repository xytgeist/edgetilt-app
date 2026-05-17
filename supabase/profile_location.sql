-- Public profile location (preset city or custom text). Run after feed_phase_a_profiles_public_read.sql.
-- Also appended to profile_lounge_fullscreen.sql for new environments.

alter table public.profiles
  add column if not exists location text;

alter table public.profiles
  drop constraint if exists profiles_location_len;

alter table public.profiles
  add constraint profiles_location_len check (location is null or char_length(location) <= 80);

comment on column public.profiles.location is 'Optional city or custom location shown on Lounge profile (max 80 chars).';
