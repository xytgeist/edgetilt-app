-- UFC desk data (1): fighter aliases + card facts (3 vs 5, venue).
-- Public read. Staff / service write. Tuesday ufcstats sync upserts both.

do $$
begin
  create table if not exists public.ufc_fighter_aliases (
    id uuid default gen_random_uuid() primary key,
    fighter_metrics_id uuid not null references public.ufc_fighter_metrics(id) on delete cascade,
    source text not null check (source in ('ufcstats', 'odds_api', 'board', 'manual')),
    alias text not null,
    alias_norm text not null,
    created_at timestamptz default now(),
    unique (source, alias_norm)
  );

  create index if not exists ufc_fighter_aliases_fighter_idx
    on public.ufc_fighter_aliases (fighter_metrics_id);

  alter table public.ufc_fighter_aliases enable row level security;

  drop policy if exists "Public read ufc_fighter_aliases" on public.ufc_fighter_aliases;
  create policy "Public read ufc_fighter_aliases"
    on public.ufc_fighter_aliases
    for select
    using (true);

  drop policy if exists "Staff and service manage ufc_fighter_aliases" on public.ufc_fighter_aliases;
  create policy "Staff and service manage ufc_fighter_aliases"
    on public.ufc_fighter_aliases
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  create table if not exists public.ufc_card_fights (
    id uuid default gen_random_uuid() primary key,
    event_url text not null,
    event_name text not null default '',
    venue text not null default '',
    is_apex boolean not null default false,
    fight_index int not null,
    fighter_a text not null,
    fighter_b text not null,
    fighter_a_url text,
    fighter_b_url text,
    fighter_a_norm text not null,
    fighter_b_norm text not null,
    division text,
    scheduled_rounds int not null check (scheduled_rounds in (3, 5)),
    source_synced_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (event_url, fight_index)
  );

  create index if not exists ufc_card_fights_pair_idx
    on public.ufc_card_fights (fighter_a_norm, fighter_b_norm);

  alter table public.ufc_card_fights enable row level security;

  drop policy if exists "Public read ufc_card_fights" on public.ufc_card_fights;
  create policy "Public read ufc_card_fights"
    on public.ufc_card_fights
    for select
    using (true);

  drop policy if exists "Staff and service manage ufc_card_fights" on public.ufc_card_fights;
  create policy "Staff and service manage ufc_card_fights"
    on public.ufc_card_fights
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  create table if not exists public.ufc_fighter_name_mismatches (
    id uuid default gen_random_uuid() primary key,
    raw_name text not null,
    raw_norm text not null,
    source text not null default 'ufcstats',
    event_url text,
    last_seen_at timestamptz not null default now(),
    unique (source, raw_norm)
  );

  alter table public.ufc_fighter_name_mismatches enable row level security;

  drop policy if exists "Staff read ufc_fighter_name_mismatches" on public.ufc_fighter_name_mismatches;
  create policy "Staff read ufc_fighter_name_mismatches"
    on public.ufc_fighter_name_mismatches
    for select
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );

  drop policy if exists "Staff and service manage ufc_fighter_name_mismatches" on public.ufc_fighter_name_mismatches;
  create policy "Staff and service manage ufc_fighter_name_mismatches"
    on public.ufc_fighter_name_mismatches
    for all
    using (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    )
    with check (
      auth.role() = 'service_role'
      or exists (
        select 1 from public.profiles
        where profiles.user_id = auth.uid()
          and profiles.role in ('admin', 'moderator', 'staff')
      )
    );
end $$;
