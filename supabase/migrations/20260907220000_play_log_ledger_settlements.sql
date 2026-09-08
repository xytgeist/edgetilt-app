-- Play Logbook Ledger: pairwise Settle All history (actor + counterpart both see the row).

create table if not exists public.play_log_ledger_settlements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  counterpart_kind text not null check (counterpart_kind in ('user', 'guest')),
  counterpart_user_id uuid references auth.users(id) on delete cascade,
  counterpart_guest_label text,
  they_owe_you numeric(12,2) not null default 0,
  you_owe_them numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  play_count int not null default 0,
  session_ids uuid[] not null default '{}'::uuid[],
  message text not null,
  constraint play_log_ledger_settlements_counterpart_chk check (
    (
      counterpart_kind = 'user'
      and counterpart_user_id is not null
      and counterpart_guest_label is null
    )
    or (
      counterpart_kind = 'guest'
      and counterpart_user_id is null
      and counterpart_guest_label is not null
      and btrim(counterpart_guest_label) <> ''
    )
  )
);

create index if not exists play_log_ledger_settlements_actor_idx
  on public.play_log_ledger_settlements (actor_user_id, created_at desc);

create index if not exists play_log_ledger_settlements_counterpart_idx
  on public.play_log_ledger_settlements (counterpart_user_id, created_at desc)
  where counterpart_user_id is not null;

alter table public.play_log_ledger_settlements enable row level security;

drop policy if exists play_log_ledger_settlements_select on public.play_log_ledger_settlements;
create policy play_log_ledger_settlements_select
  on public.play_log_ledger_settlements
  for select
  to authenticated
  using (
    actor_user_id = auth.uid()
    or (
      counterpart_kind = 'user'
      and counterpart_user_id = auth.uid()
    )
  );

drop policy if exists play_log_ledger_settlements_insert on public.play_log_ledger_settlements;
create policy play_log_ledger_settlements_insert
  on public.play_log_ledger_settlements
  for insert
  to authenticated
  with check (actor_user_id = auth.uid());

grant select, insert on public.play_log_ledger_settlements to authenticated;

notify pgrst, 'reload schema';
