-- Group chat: in-room search, pinned list, shared media/links/docs, jump-to-message window.
BEGIN;

CREATE OR REPLACE FUNCTION public.chat_search_messages(
  p_room_id uuid,
  p_query   text,
  p_limit   int DEFAULT 30
)
RETURNS TABLE (
  message_id  uuid,
  body        text,
  created_at  timestamptz,
  sender_id   uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int;
  q   text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;

  q := trim(coalesce(p_query, ''));
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  lim := greatest(1, least(coalesce(p_limit, 30), 50));

  RETURN QUERY
  SELECT msg.id, msg.body, msg.created_at, msg.sender_id
  FROM public.chat_messages msg
  WHERE msg.room_id = p_room_id
    AND msg.deleted_at IS NULL
    AND msg.body ILIKE '%' || q || '%'
  ORDER BY msg.created_at DESC
  LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_pinned_messages_page(
  p_room_id uuid,
  p_limit   int DEFAULT 50
)
RETURNS TABLE (
  message_id   uuid,
  body         text,
  image_urls   text[],
  created_at   timestamptz,
  sender_id    uuid,
  pinned_at    timestamptz,
  pinned_by    uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    msg.id,
    msg.body,
    msg.image_urls,
    msg.created_at,
    msg.sender_id,
    pin.pinned_at,
    pin.pinned_by
  FROM public.chat_pinned_messages pin
  JOIN public.chat_messages msg ON msg.id = pin.message_id
  WHERE pin.room_id = p_room_id
    AND msg.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members m
      WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
    )
  ORDER BY pin.pinned_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
$$;

CREATE OR REPLACE FUNCTION public.chat_pinned_message_ids(p_room_id uuid)
RETURNS TABLE (message_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pin.message_id
  FROM public.chat_pinned_messages pin
  JOIN public.chat_messages msg ON msg.id = pin.message_id
  WHERE pin.room_id = p_room_id
    AND msg.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members m
      WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_room_shared_media(
  p_room_id uuid,
  p_limit   int DEFAULT 80
)
RETURNS TABLE (
  message_id  uuid,
  url         text,
  created_at  timestamptz,
  sender_id   uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT msg.id, u.url, msg.created_at, msg.sender_id
  FROM public.chat_messages msg
  CROSS JOIN LATERAL unnest(coalesce(msg.image_urls, '{}'::text[])) AS u(url)
  WHERE msg.room_id = p_room_id
    AND msg.deleted_at IS NULL
    AND u.url IS NOT NULL
    AND length(trim(u.url)) > 0
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members m
      WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
    )
  ORDER BY msg.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 80), 200));
$$;

CREATE OR REPLACE FUNCTION public.chat_room_shared_links(
  p_room_id uuid,
  p_limit   int DEFAULT 80,
  p_docs_only boolean DEFAULT false
)
RETURNS TABLE (
  message_id  uuid,
  url         text,
  created_at  timestamptz,
  sender_id   uuid,
  body_preview text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;

  lim := greatest(1, least(coalesce(p_limit, 80), 200));

  RETURN QUERY
  SELECT DISTINCT ON (sub.url)
    sub.message_id,
    sub.url,
    sub.created_at,
    sub.sender_id,
    sub.body_preview
  FROM (
    SELECT
      msg.id AS message_id,
      lower((m)[1]) AS url,
      msg.created_at,
      msg.sender_id,
      left(msg.body, 120) AS body_preview
    FROM public.chat_messages msg
    CROSS JOIN LATERAL regexp_matches(
      coalesce(msg.body, ''),
      '(https?://[^\s<>"\]]+)',
      'gi'
    ) AS m
    WHERE msg.room_id = p_room_id
      AND msg.deleted_at IS NULL
      AND coalesce(msg.body, '') <> ''
  ) sub
  WHERE sub.url IS NOT NULL
    AND (
      NOT p_docs_only
      OR sub.url ~* '\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)(\?|#|$)'
    )
  ORDER BY sub.url, sub.created_at DESC
  LIMIT lim;
END;
$$;

-- Load messages around an anchor for jump-to-message / search result.
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
  reply_to_sender_id  uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int;
  v_at timestamptz;
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;

  SELECT msg.created_at, msg.id
  INTO v_at, v_id
  FROM public.chat_messages msg
  WHERE msg.id = p_message_id AND msg.room_id = p_room_id;

  IF v_at IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING MESSAGE = 'Message not found.';
  END IF;

  lim := greatest(10, least(coalesce(p_limit, 40), 100));
  lim := ceil(lim / 2.0)::int;

  RETURN QUERY
  WITH older AS (
    SELECT
      msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
      msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview,
      msg.reply_to_sender_id
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (
        msg.created_at < v_at
        OR (msg.created_at = v_at AND msg.id <= v_id)
      )
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT lim
  ),
  newer AS (
    SELECT
      msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
      msg.created_at, msg.deleted_at, msg.reply_to_message_id, msg.reply_to_preview,
      msg.reply_to_sender_id
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (
        msg.created_at > v_at
        OR (msg.created_at = v_at AND msg.id > v_id)
      )
    ORDER BY msg.created_at ASC, msg.id ASC
    LIMIT lim
  )
  SELECT * FROM (
    SELECT * FROM older
    UNION ALL
    SELECT * FROM newer
  ) combined
  ORDER BY combined.created_at ASC, combined.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_search_messages(uuid, text, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_pinned_messages_page(uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_pinned_message_ids(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_room_shared_media(uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_room_shared_links(uuid, int, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_messages_window(uuid, uuid, int) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.chat_search_messages(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_pinned_messages_page(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_pinned_message_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_room_shared_media(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_room_shared_links(uuid, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_messages_window(uuid, uuid, int) TO authenticated;

COMMIT;
