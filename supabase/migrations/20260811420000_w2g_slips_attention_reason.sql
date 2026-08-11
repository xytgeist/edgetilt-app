-- W-2G archive: mark slips that need manual fix (usually corner detect on bulk import).
-- Apply on test first. Prod only when Ryan asks.

alter table public.w2g_slips
  add column if not exists attention_reason text;

create index if not exists w2g_slips_user_attention_idx
  on public.w2g_slips (user_id, tax_year)
  where attention_reason is not null;
