-- Ensure group metadata columns exist (safe if 20260603100000 was skipped on test).
-- PostgREST returns "could not find avatar_url in schema cache" until column exists + cache reload.
BEGIN;

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS moderation_muted_until timestamptz;

COMMENT ON COLUMN public.chat_rooms.avatar_url IS 'Group chat photo URL (owner-set).';
COMMENT ON COLUMN public.chat_rooms.description IS 'Group chat description (owner-set).';

NOTIFY pgrst, 'reload schema';

COMMIT;
