-- Track last handle change (`handle_changed_at`). No cooldown — stamps timestamp on handle updates only.
-- Run in Supabase SQL editor after feed_phase_a_profiles_public_read.sql (or any profiles migration).

alter table public.profiles
  add column if not exists handle_changed_at timestamptz;

comment on column public.profiles.handle_changed_at is
  'When the user last changed `handle` (audit; no cooldown enforced).';

create or replace function public.profiles_enforce_handle_change_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if lower(trim(coalesce(old.handle, ''))) is not distinct from lower(trim(coalesce(new.handle, ''))) then
    return new;
  end if;
  new.handle_changed_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_handle_change_cooldown on public.profiles;
create trigger trg_profiles_handle_change_cooldown
  before update of handle on public.profiles
  for each row
  execute function public.profiles_enforce_handle_change_cooldown();
