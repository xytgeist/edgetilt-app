-- Document unarchive = inbox restore + push re-enabled (archived_at is the push gate).

BEGIN;

COMMENT ON COLUMN public.chat_room_members.archived_at IS
  'When set, room is hidden from the main chat inbox and DM/group-invite push is suppressed. Cleared by chat_unarchive_room, swipe restore, or sender reply (lounge-chat send_message). Does not change muted_until.';

COMMENT ON FUNCTION public.chat_unarchive_room(uuid) IS
  'Restores room to main inbox for the caller (archived_at NULL). Re-enables push notifications for that room; mute settings unchanged.';

COMMIT;
