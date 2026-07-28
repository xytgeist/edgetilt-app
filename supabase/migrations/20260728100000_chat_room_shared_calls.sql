-- Shared Calls tab in room Media / links / docs: call recordings + call summaries.

CREATE OR REPLACE FUNCTION public.chat_room_shared_calls(
  p_room_id   uuid,
  p_limit     int DEFAULT 80,
  p_sender_id uuid DEFAULT NULL
)
RETURNS TABLE (
  message_id         uuid,
  created_at         timestamptz,
  sender_id          uuid,
  content_encoding   text,
  video_url          text,
  stream_poster_url  text,
  body               text,
  link_preview       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    msg.id,
    msg.created_at,
    msg.sender_id,
    msg.content_encoding,
    msg.video_url,
    msg.stream_poster_url,
    msg.body,
    msg.link_preview
  FROM public.chat_messages msg
  WHERE msg.room_id = p_room_id
    AND msg.deleted_at IS NULL
    AND msg.content_encoding IN ('call_recording', 'call_summary')
    AND (p_sender_id IS NULL OR msg.sender_id = p_sender_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members m
      WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
    )
  ORDER BY msg.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 80), 200));
$$;

REVOKE ALL ON FUNCTION public.chat_room_shared_calls(uuid, int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_room_shared_calls(uuid, int, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
