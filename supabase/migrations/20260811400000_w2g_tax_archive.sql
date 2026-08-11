-- W-2G tax archive: per-user slips (six TurboTax-combine fields) + private image storage.
-- Apply on test first. Prod only when Ryan asks.

create table if not exists public.w2g_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tax_year int not null,
  payer_name text not null default '',
  payer_address text not null default '',
  payer_ein text not null default '',
  box1_winnings numeric(12, 2) not null default 0,
  box4_federal_withheld numeric(12, 2) not null default 0,
  date_won date,
  image_path text,
  image_content_type text,
  ocr_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists w2g_slips_user_year_ein_idx
  on public.w2g_slips (user_id, tax_year, payer_ein);

create index if not exists w2g_slips_user_created_idx
  on public.w2g_slips (user_id, created_at desc);

alter table public.w2g_slips enable row level security;

drop policy if exists w2g_slips_select_own on public.w2g_slips;
create policy w2g_slips_select_own
on public.w2g_slips for select to authenticated
using (user_id = auth.uid());

drop policy if exists w2g_slips_insert_own on public.w2g_slips;
create policy w2g_slips_insert_own
on public.w2g_slips for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists w2g_slips_update_own on public.w2g_slips;
create policy w2g_slips_update_own
on public.w2g_slips for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists w2g_slips_delete_own on public.w2g_slips;
create policy w2g_slips_delete_own
on public.w2g_slips for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.w2g_slips to authenticated;

-- Private slip images: path {user_id}/{slip_id}.jpg
insert into storage.buckets (id, name, public)
values ('w2g-slips', 'w2g-slips', false)
on conflict (id) do nothing;

drop policy if exists w2g_slips_storage_insert_own on storage.objects;
create policy w2g_slips_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'w2g-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists w2g_slips_storage_select_own on storage.objects;
create policy w2g_slips_storage_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'w2g-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists w2g_slips_storage_update_own on storage.objects;
create policy w2g_slips_storage_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'w2g-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'w2g-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists w2g_slips_storage_delete_own on storage.objects;
create policy w2g_slips_storage_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'w2g-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);
