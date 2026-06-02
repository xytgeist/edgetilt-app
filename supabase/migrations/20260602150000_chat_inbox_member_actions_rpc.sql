-- Inbox row actions (leave, mark unread, pin) callable from the client without lounge-chat Edge.
BEGIN;

CREATE OR REPLACE FUNCTION public.chat_leave_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'room_id is required';
  END IF;
  DELETE FROM public.chat_room_members
  WHERE room_id = p_room_id
    AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_mark_room_unread(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'room_id is required';
  END IF;
  UPDATE public.chat_room_members
  SET last_read_at = NULL,
      last_read_message_id = NULL
  WHERE room_id = p_room_id
    AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_set_room_pinned(p_room_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'room_id is required';
  END IF;
  UPDATE public.chat_room_members
  SET pinned = COALESCE(p_pinned, false)
  WHERE room_id = p_room_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.chat_leave_room(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_mark_room_unread(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_set_room_pinned(uuid, boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.chat_leave_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_room_unread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_set_room_pinned(uuid, boolean) TO authenticated;

COMMIT;
