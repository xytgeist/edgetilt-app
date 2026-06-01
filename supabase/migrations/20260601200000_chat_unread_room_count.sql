-- Returns the number of chat rooms the current user has unread messages in.
-- Mirrors the has_unread logic in chat_rooms_for_user so the FAB badge stays in sync.

BEGIN;

CREATE OR REPLACE FUNCTION chat_unread_room_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM   chat_room_members m
  JOIN   chat_rooms        r ON r.id = m.room_id
  WHERE  m.user_id = auth.uid()
    AND  r.last_message_at IS NOT NULL
    AND  (m.last_read_at IS NULL OR r.last_message_at > m.last_read_at);
$$;

GRANT EXECUTE ON FUNCTION chat_unread_room_count() TO authenticated;

COMMIT;
