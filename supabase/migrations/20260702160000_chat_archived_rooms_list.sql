-- Archived inbox list + unarchive (companion to 20260702150000).

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_unarchive_room(p_room_id uuid)
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
  SET archived_at = NULL
  WHERE room_id = p_room_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.chat_unarchive_room(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_unarchive_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_archived_room_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.chat_room_members
  WHERE user_id = auth.uid()
    AND archived_at IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.chat_archived_room_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_archived_rooms_for_user(p_user_id uuid)
RETURNS TABLE (
  id                     uuid,
  kind                   text,
  slug                   text,
  title                  text,
  dm_key                 text,
  subscriber_only        boolean,
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid,
  last_read_at           timestamptz,
  muted_until            timestamptz,
  member_role            text,
  has_unread             boolean,
  pinned                 boolean,
  peer_user_id           uuid,
  peer_handle            text,
  peer_display_name      text,
  peer_avatar_url        text,
  sender_handle          text,
  sender_display_name    text,
  avatar_url             text,
  description            text,
  created_by             uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.kind, r.slug, r.title, r.dm_key, r.subscriber_only,
    r.last_message_at, r.last_message_preview, r.last_message_sender_id,
    m.last_read_at, m.muted_until, m.role,
    (
      r.last_message_at IS NOT NULL
      AND (r.last_message_sender_id IS DISTINCT FROM p_user_id)
      AND (m.last_read_at IS NULL OR r.last_message_at > m.last_read_at)
    ) AS has_unread,
    COALESCE(m.pinned, false) AS pinned,
    peer_prof.user_id, peer_prof.handle, peer_prof.display_name, peer_prof.avatar_url,
    sender_prof.handle, sender_prof.display_name,
    r.avatar_url, r.description, r.created_by
  FROM public.chat_room_members m
  JOIN public.chat_rooms r ON r.id = m.room_id
  LEFT JOIN public.profiles peer_prof
    ON r.kind = 'dm'
    AND peer_prof.user_id = CASE
      WHEN r.dm_key IS NULL THEN NULL::uuid
      WHEN split_part(r.dm_key, '::', 1)::text = p_user_id::text
      THEN split_part(r.dm_key, '::', 2)::uuid
      ELSE split_part(r.dm_key, '::', 1)::uuid
    END
  LEFT JOIN public.profiles sender_prof
    ON sender_prof.user_id = r.last_message_sender_id
  WHERE m.user_id = p_user_id
    AND m.archived_at IS NOT NULL
  ORDER BY COALESCE(r.last_message_at, m.archived_at) DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.chat_archived_rooms_for_user(uuid) TO authenticated;

COMMIT;
