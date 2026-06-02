-- Add pinned flag to chat_room_members so users can pin conversations to the top.
BEGIN;

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS chat_room_members_pinned_idx
  ON public.chat_room_members (user_id, pinned)
  WHERE pinned = true;

COMMIT;
