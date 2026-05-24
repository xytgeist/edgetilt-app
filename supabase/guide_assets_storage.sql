-- Public read bucket for guide hero + diagram images uploaded via slot-guide ingest API.
-- Apply on test + production before using /api/slot-guide-ingest storage uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guide-assets',
  'guide-assets',
  true,
  10485760,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Guide assets public read" on storage.objects;
create policy "Guide assets public read"
  on storage.objects for select
  using (bucket_id = 'guide-assets');

-- Service role uploads bypass RLS; authenticated staff upload optional later.
drop policy if exists "Guide assets service insert" on storage.objects;
create policy "Guide assets service insert"
  on storage.objects for insert
  with check (bucket_id = 'guide-assets');

drop policy if exists "Guide assets service update" on storage.objects;
create policy "Guide assets service update"
  on storage.objects for update
  using (bucket_id = 'guide-assets');
