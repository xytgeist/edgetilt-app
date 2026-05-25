-- Per-item Slots Edge locks for calculators and AP guides.
-- Code defaults live in src/features/calculators/calculatorAccess.js and guideAccess.js;
-- rows here override defaults. Admin-only writes; authenticated read for client gating.

create table if not exists public.content_access_gates (
  content_kind text not null check (content_kind in ('calculator', 'guide')),
  content_key text not null,
  requires_slots_edge boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (content_kind, content_key)
);

comment on table public.content_access_gates is
  'Admin overrides for calculator/guide Slots Edge locks. Missing row → client code default.';

create index if not exists content_access_gates_kind_idx
  on public.content_access_gates (content_kind);

alter table public.content_access_gates enable row level security;

drop policy if exists content_access_gates_select_authenticated on public.content_access_gates;
create policy content_access_gates_select_authenticated
  on public.content_access_gates
  for select
  to authenticated
  using (true);

drop policy if exists content_access_gates_insert_admin on public.content_access_gates;
create policy content_access_gates_insert_admin
  on public.content_access_gates
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists content_access_gates_update_admin on public.content_access_gates;
create policy content_access_gates_update_admin
  on public.content_access_gates
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists content_access_gates_delete_admin on public.content_access_gates;
create policy content_access_gates_delete_admin
  on public.content_access_gates
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  );
