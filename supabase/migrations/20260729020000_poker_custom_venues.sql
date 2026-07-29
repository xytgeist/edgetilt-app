-- User-defined poker venues (home games, clubs) shown above GPS nearby results.

create table if not exists public.poker_custom_venues (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  constraint poker_custom_venues_name_nonempty check (char_length(trim(name)) > 0),
  constraint poker_custom_venues_user_name_unique unique (user_id, name)
);

create index if not exists poker_custom_venues_user_id_idx
  on public.poker_custom_venues(user_id);

create index if not exists poker_custom_venues_user_created_idx
  on public.poker_custom_venues(user_id, created_at desc);

alter table public.poker_custom_venues enable row level security;

drop policy if exists "poker_custom_venues_select" on public.poker_custom_venues;
create policy "poker_custom_venues_select"
  on public.poker_custom_venues for select
  using (auth.uid() = user_id);

drop policy if exists "poker_custom_venues_insert" on public.poker_custom_venues;
create policy "poker_custom_venues_insert"
  on public.poker_custom_venues for insert
  with check (auth.uid() = user_id);

drop policy if exists "poker_custom_venues_update" on public.poker_custom_venues;
create policy "poker_custom_venues_update"
  on public.poker_custom_venues for update
  using (auth.uid() = user_id);

drop policy if exists "poker_custom_venues_delete" on public.poker_custom_venues;
create policy "poker_custom_venues_delete"
  on public.poker_custom_venues for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.poker_custom_venues to authenticated;
