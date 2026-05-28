-- casinos: global shared casino name index used for offer import validation.
-- When the AI extracts a casino name, it is fuzzy-matched against this list.
-- Unrecognized names are routed to the review queue instead of auto-creating.
--
-- All authenticated users can read and add entries (auto-populated on event save).
-- Only admins (profiles.role = 'admin') can update or delete entries.
--
-- Run after offers_schema.sql.

-- Enable trigram extension for fuzzy search (may already be enabled)
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.casinos (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  aliases     text[]      not null default '{}',
  source      text        not null default 'user_confirmed'
                check (source in ('seed', 'user_confirmed', 'admin')),
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Case-insensitive unique constraint on name
create unique index if not exists casinos_name_lower_idx
  on public.casinos (lower(name));

-- GIN index on aliases array
create index if not exists casinos_aliases_gin_idx
  on public.casinos using gin (aliases);

-- Trigram index for fuzzy name search
create index if not exists casinos_name_trgm_idx
  on public.casinos using gin (name gin_trgm_ops);

alter table public.casinos enable row level security;

-- All authenticated users can read
drop policy if exists "casinos_select" on public.casinos;
create policy "casinos_select" on public.casinos
  for select to authenticated using (true);

-- All authenticated users can insert (auto-add when confirming events)
drop policy if exists "casinos_insert" on public.casinos;
create policy "casinos_insert" on public.casinos
  for insert to authenticated with check (true);

-- Only admins can update
drop policy if exists "casinos_update" on public.casinos;
create policy "casinos_update" on public.casinos
  for update to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

-- Only admins can delete
drop policy if exists "casinos_delete" on public.casinos;
create policy "casinos_delete" on public.casinos
  for delete to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

-- ── Helper RPC ───────────────────────────────────────────────────────────────
-- Called by the client after saving any offer event to auto-add the casino name.
-- Uses ON CONFLICT DO NOTHING so duplicate calls are silently ignored.

create or replace function public.upsert_casino_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or trim(p_name) = '' then
    return;
  end if;
  insert into public.casinos (name, source, created_by)
  values (trim(p_name), 'user_confirmed', auth.uid())
  on conflict (lower(name)) do nothing;
end;
$$;

-- Allow authenticated users to call the RPC
grant execute on function public.upsert_casino_name(text) to authenticated;
