-- Lounge UGC reports (Guideline 1.2) + staff queue.
-- Block already lives on public.blocks (chat). Lounge feed hides those authors in the client.

begin;

create table if not exists public.lounge_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment', 'profile')),
  target_id uuid not null,
  target_user_id uuid references auth.users (id) on delete set null,
  reason text not null check (
    reason in ('spam', 'harassment', 'hate', 'sexual', 'impersonation', 'illegal', 'other')
  ),
  details text,
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'actioned', 'dismissed')
  ),
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  staff_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lounge_reports_details_len check (details is null or char_length(details) <= 1000),
  constraint lounge_reports_no_self check (
    target_user_id is null or reporter_id <> target_user_id
  ),
  constraint lounge_reports_unique_target unique (reporter_id, target_kind, target_id)
);

create index if not exists lounge_reports_status_created_idx
  on public.lounge_reports (status, created_at desc);
create index if not exists lounge_reports_target_idx
  on public.lounge_reports (target_kind, target_id);
create index if not exists lounge_reports_target_user_idx
  on public.lounge_reports (target_user_id);

create or replace function public.lounge_reports_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lounge_reports_touch_updated_at on public.lounge_reports;
create trigger lounge_reports_touch_updated_at
before update on public.lounge_reports
for each row execute function public.lounge_reports_touch_updated_at();

alter table public.lounge_reports enable row level security;

drop policy if exists lounge_reports_insert_own on public.lounge_reports;
create policy lounge_reports_insert_own
  on public.lounge_reports
  for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists lounge_reports_select_own on public.lounge_reports;
create policy lounge_reports_select_own
  on public.lounge_reports
  for select
  to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.current_user_has_staff_role()
  );

drop policy if exists lounge_reports_update_staff on public.lounge_reports;
create policy lounge_reports_update_staff
  on public.lounge_reports
  for update
  to authenticated
  using (public.current_user_has_staff_role())
  with check (public.current_user_has_staff_role());

grant select, insert on public.lounge_reports to authenticated;
grant update on public.lounge_reports to authenticated;

comment on table public.lounge_reports is
  'Member UGC reports for Lounge posts, comments, and profiles. Staff review in Edge Monitor → Product.';

commit;
