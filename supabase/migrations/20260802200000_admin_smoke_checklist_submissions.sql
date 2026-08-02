-- Admin smoke checklist submissions (Poker Stable v2 smoke on test).

create table if not exists public.admin_smoke_checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checklist_key text not null,
  checklist_version text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  run_label text,
  responses jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_smoke_checklist_responses_array check (jsonb_typeof(responses) = 'array')
);

create unique index if not exists admin_smoke_checklist_user_key_idx
  on public.admin_smoke_checklist_submissions (user_id, checklist_key);

create index if not exists admin_smoke_checklist_submitted_idx
  on public.admin_smoke_checklist_submissions (checklist_key, submitted_at desc nulls last);

alter table public.admin_smoke_checklist_submissions enable row level security;

drop policy if exists "admin_smoke_checklist_select_own" on public.admin_smoke_checklist_submissions;
create policy "admin_smoke_checklist_select_own"
  on public.admin_smoke_checklist_submissions for select
  to authenticated
  using (
    public.play_log_viewer_is_admin()
    and user_id = auth.uid()
  );

drop policy if exists "admin_smoke_checklist_insert_own" on public.admin_smoke_checklist_submissions;
create policy "admin_smoke_checklist_insert_own"
  on public.admin_smoke_checklist_submissions for insert
  to authenticated
  with check (
    public.play_log_viewer_is_admin()
    and user_id = auth.uid()
  );

drop policy if exists "admin_smoke_checklist_update_own" on public.admin_smoke_checklist_submissions;
create policy "admin_smoke_checklist_update_own"
  on public.admin_smoke_checklist_submissions for update
  to authenticated
  using (
    public.play_log_viewer_is_admin()
    and user_id = auth.uid()
  )
  with check (
    public.play_log_viewer_is_admin()
    and user_id = auth.uid()
  );

grant select, insert, update on public.admin_smoke_checklist_submissions to authenticated;

create or replace function public.admin_smoke_checklist_get_latest(p_checklist_key text)
returns public.admin_smoke_checklist_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_smoke_checklist_submissions;
begin
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  select *
  into v_row
  from public.admin_smoke_checklist_submissions s
  where s.user_id = auth.uid()
    and s.checklist_key = p_checklist_key
  limit 1;

  return v_row;
end;
$$;

create or replace function public.admin_smoke_checklist_save(
  p_checklist_key text,
  p_checklist_version text,
  p_responses jsonb,
  p_status text default 'draft',
  p_run_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text := coalesce(nullif(trim(p_status), ''), 'draft');
begin
  if not public.play_log_viewer_is_admin() then
    raise exception 'admin only';
  end if;

  if v_status not in ('draft', 'submitted') then
    raise exception 'invalid status';
  end if;

  if jsonb_typeof(coalesce(p_responses, '[]'::jsonb)) <> 'array' then
    raise exception 'responses must be a json array';
  end if;

  insert into public.admin_smoke_checklist_submissions (
    user_id,
    checklist_key,
    checklist_version,
    status,
    run_label,
    responses,
    submitted_at
  )
  values (
    auth.uid(),
    p_checklist_key,
    p_checklist_version,
    v_status,
    nullif(trim(p_run_label), ''),
    coalesce(p_responses, '[]'::jsonb),
    case when v_status = 'submitted' then now() else null end
  )
  on conflict (user_id, checklist_key) do update
  set
    checklist_version = excluded.checklist_version,
    status = excluded.status,
    run_label = excluded.run_label,
    responses = excluded.responses,
    submitted_at = case
      when excluded.status = 'submitted' then now()
      else admin_smoke_checklist_submissions.submitted_at
    end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_smoke_checklist_get_latest(text) to authenticated;
grant execute on function public.admin_smoke_checklist_save(text, text, jsonb, text, text) to authenticated;
