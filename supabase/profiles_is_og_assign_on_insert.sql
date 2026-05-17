-- Assign OG to new profile rows while total profile count is still under 1,000.
-- Run after `profiles_is_og.sql` (column + backfill). Safe to re-run.

create or replace function public.profiles_set_is_og_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*)::int from public.profiles) < 1000 then
    new.is_og := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_is_og_on_insert on public.profiles;
create trigger profiles_set_is_og_on_insert
  before insert on public.profiles
  for each row
  execute function public.profiles_set_is_og_on_insert();

comment on function public.profiles_set_is_og_on_insert() is
  'BEFORE INSERT on profiles: is_og=true while fewer than 1000 profile rows exist (earliest-adopter cohort).';
