-- Add reply_to_sender_id so the client can display the quoted bubble
-- on the correct side of the chat (the original sender's side).

BEGIN;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_sender_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
