-- Include link_preview (+ reply_to_sender_id) in chat message RPCs.

BEGIN;

DROP FUNCTION IF EXISTS public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.chat_messages_page(uuid, int, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.chat_messages_page(
  p_room_id            uuid,
  p_limit              int         DEFAULT 50,
  p_before_created_at  timestamptz DEFAULT NULL,
  p_before_id          uuid        DEFAULT NULL,
  p_after_created_at   timestamptz DEFAULT NULL,
  p_after_id           uuid        DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  room_id             uuid,
  sender_id           uuid,
  body                text,
  image_urls          text[],
  created_at          timestamptz,
  deleted_at          timestamptz,
  reply_to_message_id uuid,
  reply_to_preview    text,
  reply_to_sender_id  uuid,
  link_preview        jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;
  lim := greatest(1, least(coalesce(p_limit, 50), 100));

  IF p_after_created_at IS NOT NULL THEN
    RETURN QUERY
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at > p_after_created_at
        OR (msg.created_at = p_after_created_at AND msg.id > coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    ORDER BY msg.created_at ASC, msg.id ASC
    LIMIT lim;
    RETURN;
  END IF;

  IF p_before_created_at IS NOT NULL THEN
    RETURN QUERY
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at < p_before_created_at
        OR (msg.created_at = p_before_created_at AND msg.id < coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT lim;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
         msg.created_at, msg.deleted_at, msg.reply_to_message_id,
         msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
  FROM public.chat_messages msg
  WHERE msg.room_id = p_room_id
  ORDER BY msg.created_at DESC, msg.id DESC
  LIMIT lim;
END;
$$;

-- Single function with default args — only the 6-parameter signature exists (not a separate 4-arg overload).
REVOKE ALL ON FUNCTION public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_messages_page(uuid, int, timestamptz, uuid, timestamptz, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.chat_messages_window(uuid, uuid, int);

CREATE OR REPLACE FUNCTION public.chat_messages_window(
  p_room_id    uuid,
  p_message_id uuid,
  p_limit      int DEFAULT 40
)
RETURNS TABLE (
  id                  uuid,
  room_id             uuid,
  sender_id           uuid,
  body                text,
  image_urls          text[],
  created_at          timestamptz,
  deleted_at          timestamptz,
  reply_to_message_id uuid,
  reply_to_preview    text,
  reply_to_sender_id  uuid,
  link_preview        jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; v_at timestamptz; v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;
  SELECT msg.created_at, msg.id INTO v_at, v_id
  FROM public.chat_messages msg
  WHERE msg.id = p_message_id AND msg.room_id = p_room_id;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING MESSAGE = 'Message not found.';
  END IF;
  lim := ceil(greatest(10, least(coalesce(p_limit, 40), 100)) / 2.0)::int;
  RETURN QUERY
  WITH older AS (
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at < v_at OR (msg.created_at = v_at AND msg.id <= v_id))
    ORDER BY msg.created_at DESC, msg.id DESC LIMIT lim
  ),
  newer AS (
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id, msg.link_preview
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at > v_at OR (msg.created_at = v_at AND msg.id > v_id))
    ORDER BY msg.created_at ASC, msg.id ASC LIMIT lim
  )
  SELECT * FROM (SELECT * FROM older UNION ALL SELECT * FROM newer) c
  ORDER BY c.created_at ASC, c.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_messages_window(uuid, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_messages_window(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
