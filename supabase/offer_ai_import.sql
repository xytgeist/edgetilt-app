-- AI bulk import: batches, per-upload linkage, and review queue for partial / failed extractions.
-- Run after offer_uploads.sql and offers_schema.sql.
--
-- Flow (intended):
-- 1) Client creates offer_import_batches row, uploads images to storage, inserts offer_uploads with batch_id.
-- 2) Edge Function (or worker) processes batch: inserts confident rows into offer_events (source_type image_ai),
--    and inserts offer_ai_review_items for images that need human completion (draft JSON + upload_id).
--    Per-image success is independent: create events for confident extractions, queue partial rows for the rest.
-- 3) User completes items from the app; rows marked resolved and linked offer_events optional.

-- --- Batches -----------------------------------------------------------------
create table if not exists public.offer_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'awaiting_parse'
    check (status in (
      'awaiting_upload',
      'awaiting_parse',
      'processing',
      'completed',
      'completed_with_errors',
      'failed'
    )),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offer_import_batches_user_created_idx
  on public.offer_import_batches (user_id, created_at desc);

alter table public.offer_import_batches enable row level security;

drop policy if exists "offer_import_batches_select_own" on public.offer_import_batches;
create policy "offer_import_batches_select_own" on public.offer_import_batches
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "offer_import_batches_insert_own" on public.offer_import_batches;
create policy "offer_import_batches_insert_own" on public.offer_import_batches
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "offer_import_batches_update_own" on public.offer_import_batches;
create policy "offer_import_batches_update_own" on public.offer_import_batches
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "offer_import_batches_delete_own" on public.offer_import_batches;
create policy "offer_import_batches_delete_own" on public.offer_import_batches
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_offer_import_batches_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_offer_import_batches_user_id on public.offer_import_batches;
create trigger trg_set_offer_import_batches_user_id
before insert on public.offer_import_batches
for each row
execute function public.set_offer_import_batches_user_id();

-- --- Link uploads to batches -------------------------------------------------
alter table public.offer_uploads
  add column if not exists batch_id uuid references public.offer_import_batches(id) on delete set null;

create index if not exists offer_uploads_batch_id_idx
  on public.offer_uploads (batch_id)
  where batch_id is not null;

alter table public.offer_uploads
  add column if not exists review_required boolean not null default false;

-- --- Review queue: partial drafts tied to an image ---------------------------
create table if not exists public.offer_ai_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.offer_uploads(id) on delete cascade,
  batch_id uuid references public.offer_import_batches(id) on delete set null,
  draft jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open', 'resolved', 'skipped')),
  resolved_event_id uuid references public.offer_events(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists offer_ai_review_items_user_status_idx
  on public.offer_ai_review_items (user_id, status, created_at desc);

create index if not exists offer_ai_review_items_upload_idx
  on public.offer_ai_review_items (upload_id);

alter table public.offer_ai_review_items enable row level security;

drop policy if exists "offer_ai_review_items_select_own" on public.offer_ai_review_items;
create policy "offer_ai_review_items_select_own" on public.offer_ai_review_items
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "offer_ai_review_items_insert_own" on public.offer_ai_review_items;
create policy "offer_ai_review_items_insert_own" on public.offer_ai_review_items
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "offer_ai_review_items_update_own" on public.offer_ai_review_items;
create policy "offer_ai_review_items_update_own" on public.offer_ai_review_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "offer_ai_review_items_delete_own" on public.offer_ai_review_items;
create policy "offer_ai_review_items_delete_own" on public.offer_ai_review_items
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_offer_ai_review_items_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_offer_ai_review_items_user_id on public.offer_ai_review_items;
create trigger trg_set_offer_ai_review_items_user_id
before insert on public.offer_ai_review_items
for each row
execute function public.set_offer_ai_review_items_user_id();
