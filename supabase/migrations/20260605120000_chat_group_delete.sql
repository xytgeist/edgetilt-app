-- Group lifecycle: delete room when last member leaves; owner/admin can delete for everyone.
BEGIN;

-- After any membership removal, drop empty group rooms (messages/members cascade).
CREATE OR REPLACE FUNCTION public.chat_room_members_after_delete_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_rooms r
  WHERE r.id = OLD.room_id
    AND r.kind = 'group'
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_room_members m WHERE m.room_id = r.id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS chat_room_members_auto_delete_empty_group ON public.chat_room_members;
CREATE TRIGGER chat_room_members_auto_delete_empty_group
  AFTER DELETE ON public.chat_room_members
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_room_members_after_delete_cleanup();

-- Owner or admin: delete the group room for all members.
CREATE OR REPLACE FUNCTION public.chat_delete_group(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'room_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_rooms r
    WHERE r.id = p_room_id
      AND r.kind = 'group'
  ) THEN
    RAISE EXCEPTION 'Not a group room';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_rooms r
    WHERE r.id = p_room_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.chat_room_members m
          WHERE m.room_id = p_room_id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only a group admin can delete this group';
  END IF;

  DELETE FROM public.chat_rooms WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_delete_group(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_delete_group(uuid) TO authenticated;

COMMIT;
