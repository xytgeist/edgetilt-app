-- Rename machines.vegas_availability → popularity (guide card 🔥 tier / floor rarity).
-- Safe on fresh DBs that never had vegas_availability: no-op when column already renamed or absent.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'machines'
      and column_name = 'vegas_availability'
  ) then
    alter table public.machines rename column vegas_availability to popularity;
  end if;
end $$;
