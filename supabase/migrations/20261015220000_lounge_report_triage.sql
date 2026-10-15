-- Lounge report triage + staff warn notices.
-- Classifier never auto-hides. Unclassified rows stay needs_human = true.

begin;

alter table public.lounge_reports
  add column if not exists needs_human boolean not null default true,
  add column if not exists triage_status text not null default 'pending',
  add column if not exists triage_action text,
  add column if not exists triage_confidence numeric,
  add column if not exists triage_reasons text,
  add column if not exists triage_model text,
  add column if not exists classified_at timestamptz;

alter table public.lounge_reports
  drop constraint if exists lounge_reports_triage_status_check;
alter table public.lounge_reports
  add constraint lounge_reports_triage_status_check
  check (triage_status in ('pending', 'auto_dismissed', 'needs_human', 'failed', 'skipped'));

alter table public.lounge_reports
  drop constraint if exists lounge_reports_triage_action_check;
alter table public.lounge_reports
  add constraint lounge_reports_triage_action_check
  check (triage_action is null or triage_action in ('dismiss', 'escalate', 'skip'));

create index if not exists lounge_reports_needs_human_idx
  on public.lounge_reports (needs_human, created_at desc)
  where needs_human = true and status in ('open', 'reviewing');

create table if not exists public.lounge_mod_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.lounge_reports (id) on delete set null,
  actor_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment', 'profile')),
  target_id uuid,
  target_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('warn', 'hide', 'delete', 'dismiss')),
  note text,
  created_at timestamptz not null default now(),
  constraint lounge_mod_actions_note_len check (note is null or char_length(note) <= 1000)
);

create index if not exists lounge_mod_actions_target_user_idx
  on public.lounge_mod_actions (target_user_id, created_at desc);
create index if not exists lounge_mod_actions_report_idx
  on public.lounge_mod_actions (report_id);

alter table public.lounge_mod_actions enable row level security;

drop policy if exists lounge_mod_actions_staff_all on public.lounge_mod_actions;
create policy lounge_mod_actions_staff_all
  on public.lounge_mod_actions
  for all
  to authenticated
  using (public.current_user_has_staff_role())
  with check (public.current_user_has_staff_role());

grant select, insert on public.lounge_mod_actions to authenticated;

create table if not exists public.lounge_staff_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('warn', 'removed', 'deleted')),
  body text not null,
  report_id uuid references public.lounge_reports (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lounge_staff_notices_body_len check (char_length(body) between 1 and 500)
);

create index if not exists lounge_staff_notices_recipient_unread_idx
  on public.lounge_staff_notices (recipient_user_id, created_at desc)
  where read_at is null;

alter table public.lounge_staff_notices enable row level security;

drop policy if exists lounge_staff_notices_select_own on public.lounge_staff_notices;
create policy lounge_staff_notices_select_own
  on public.lounge_staff_notices
  for select
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or public.current_user_has_staff_role()
  );

drop policy if exists lounge_staff_notices_insert_staff on public.lounge_staff_notices;
create policy lounge_staff_notices_insert_staff
  on public.lounge_staff_notices
  for insert
  to authenticated
  with check (public.current_user_has_staff_role());

drop policy if exists lounge_staff_notices_update_own on public.lounge_staff_notices;
create policy lounge_staff_notices_update_own
  on public.lounge_staff_notices
  for update
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or public.current_user_has_staff_role()
  )
  with check (
    recipient_user_id = (select auth.uid())
    or public.current_user_has_staff_role()
  );

grant select, insert, update on public.lounge_staff_notices to authenticated;

comment on table public.lounge_mod_actions is
  'Staff moderation audit (warn / hide / delete / dismiss) for Lounge UGC reports.';
comment on table public.lounge_staff_notices is
  'In-app notice to a member after a staff warn / remove. Not a push.';
comment on column public.lounge_reports.needs_human is
  'True until a classifier or staff closes the row. Auto-dismiss is the only bot close.';

commit;
