-- Rocco's own UFC file: last-5 fight rolls from ufcstats fighter history.
-- Public read. Staff / service write. Tuesday job upserts. Not Scott's career composite.

do $$
begin
  create table if not exists public.ufc_fighter_last5 (
    fighter_metrics_id uuid primary key references public.ufc_fighter_metrics(id) on delete cascade,
    fighter_name text not null default '',
    fight_count int not null default 0,
    wins int not null default 0,
    losses int not null default 0,
    ko_wins int not null default 0,
    sub_wins int not null default 0,
    dec_wins int not null default 0,
    td_landed int not null default 0,
    sig_str_landed int not null default 0,
    rounds_fought int not null default 0,
    distance_fights int not null default 0,
    fights jsonb not null default '[]'::jsonb,
    source_synced_at timestamptz,
    updated_at timestamptz default now()
  );

  create index if not exists ufc_fighter_last5_name_idx
    on public.ufc_fighter_last5 (fighter_name);

  alter table public.ufc_fighter_last5 enable row level security;

  drop policy if exists "Public read ufc_fighter_last5" on public.ufc_fighter_last5;
  create policy "Public read ufc_fighter_last5"
    on public.ufc_fighter_last5
    for select
    using (true);

  drop policy if exists "Staff and service manage ufc_fighter_last5" on public.ufc_fighter_last5;
  create policy "Staff and service manage ufc_fighter_last5"
    on public.ufc_fighter_last5
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
