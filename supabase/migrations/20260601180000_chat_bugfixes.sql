-- ============================================================
-- Chat bug fixes (apply after 20260601170000)
-- 1. Missing index: rate-limit query uses sender_id, no index covered it
-- 2. Missing GRANTs: blocks table had RLS but no role privilege
-- 3. Idempotency: prevent duplicate messages on client retry
-- ============================================================

-- ── 1. Rate-limit index ───────────────────────────────────────────────────
-- send_message checks WHERE sender_id = X AND created_at > Y
-- The existing (room_id, created_at, id) index doesn't help this query.
create index if not exists chat_messages_sender_created_idx
  on public.chat_messages (sender_id, created_at desc);

-- ── 2. GRANTs on blocks ───────────────────────────────────────────────────
-- RLS policies are useless without the role having table-level privilege.
grant select, insert, delete on public.blocks to authenticated;

-- ── 3. Idempotency key ───────────────────────────────────────────────────
-- Client generates a UUID per send. Edge function returns the existing
-- message_id if the key was already committed (covers automatic retries
-- and rapid double-sends). NULL = pre-migration messages (ignored).
alter table public.chat_messages
  add column if not exists idempotency_key text;

create unique index if not exists chat_messages_idempotency_key_idx
  on public.chat_messages (idempotency_key)
  where idempotency_key is not null;
