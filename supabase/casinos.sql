-- casinos: extend the existing casinos table to serve as the global offer
-- import validation index. Adds aliases, source, created_by columns and makes
-- city_id nullable (auto-added entries from offer imports have no city context).
--
-- All authenticated users can read and insert entries.
-- Only admins (profiles.role = 'admin') can update or delete entries.
--
-- Safe to re-run.

-- Enable trigram extension for fuzzy search
create extension if not exists pg_trgm with schema extensions;

-- ── Extend existing table ────────────────────────────────────────────────────

-- Make city_id nullable so offer-import entries don't require a city
alter table public.casinos alter column city_id drop not null;

-- Add new columns if not already present
alter table public.casinos add column if not exists aliases    text[]      not null default '{}';
alter table public.casinos add column if not exists source     text        not null default 'user_confirmed'
  check (source in ('seed', 'user_confirmed', 'admin'));
alter table public.casinos add column if not exists created_by uuid        references auth.users(id) on delete set null;

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Case-insensitive unique constraint on name (skip if already exists)
create unique index if not exists casinos_name_lower_idx
  on public.casinos (lower(name));

-- GIN index on aliases array
create index if not exists casinos_aliases_gin_idx
  on public.casinos using gin (aliases);

-- Trigram index for fuzzy name search
create index if not exists casinos_name_trgm_idx
  on public.casinos using gin (name gin_trgm_ops);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.casinos enable row level security;

drop policy if exists "casinos_select" on public.casinos;
create policy "casinos_select" on public.casinos
  for select to authenticated using (true);

drop policy if exists "casinos_insert" on public.casinos;
create policy "casinos_insert" on public.casinos
  for insert to authenticated with check (true);

drop policy if exists "casinos_update" on public.casinos;
create policy "casinos_update" on public.casinos
  for update to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

drop policy if exists "casinos_delete" on public.casinos;
create policy "casinos_delete" on public.casinos
  for delete to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

-- ── Helper RPC ───────────────────────────────────────────────────────────────

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

grant execute on function public.upsert_casino_name(text) to authenticated;

-- ── Seed from existing offer_events ─────────────────────────────────────────

insert into public.casinos (name, source)
select distinct trim(casino_name), 'user_confirmed'
from public.offer_events
where casino_name is not null
  and trim(casino_name) <> ''
on conflict (lower(name)) do nothing;
