-- W-2G archive: mark slips verified after user confirms OCR fields.
-- Apply on test first. Prod only when Ryan asks.

alter table public.w2g_slips
  add column if not exists verified_at timestamptz;

create index if not exists w2g_slips_user_unverified_idx
  on public.w2g_slips (user_id, tax_year)
  where verified_at is null;
