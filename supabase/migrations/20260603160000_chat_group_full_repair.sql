-- Full group chat repair — run this ONE file if any group feature is broken.
-- Idempotent: safe to re-run on a DB that already has some or all of these.
-- Covers: stars, pins, search, media/links, member list, extended inbox RPC,
--         avatar_url + description columns, all grants, PostgREST reload.
BEGIN;

-- ── Columns ──────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS avatar_url  text,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS moderation_muted_until timestamptz;

-- ── Stars table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_message_stars (
  message_id uuid NOT NULL REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_stars_user_room_idx
  ON public.chat_message_stars (user_id, created_at DESC);

ALTER TABLE public.chat_message_stars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_stars_select ON public.chat_message_stars;
CREATE POLICY chat_message_stars_select ON public.chat_message_stars
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.chat_messages msg
      JOIN public.chat_room_members mem ON mem.room_id = msg.room_id
      WHERE msg.id = chat_message_stars.message_id
        AND mem.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS chat_message_stars_mutate ON public.chat_message_stars;
CREATE POLICY chat_message_stars_mutate ON public.chat_message_stars
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Pins table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_pinned_messages (
  room_id     uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  pinned_by   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  pinned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, message_id)
);

ALTER TABLE public.chat_pinned_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_pinned_messages_select ON public.chat_pinned_messages;
CREATE POLICY chat_pinned_messages_select ON public.chat_pinned_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_room_members m
      WHERE m.room_id = chat_pinned_messages.room_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

-- ── Member RPCs (LEFT JOIN so members without profiles still appear) ─────────

CREATE OR REPLACE FUNCTION public.chat_group_header_members(p_room_id uuid)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  joined_at    timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, p.display_name, p.handle, p.avatar_url, m.joined_at
  FROM public.chat_room_members m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_id = p_room_id
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members v
      WHERE v.room_id = p_room_id AND v.user_id = auth.uid()
    )
  ORDER BY m.joined_at ASC NULLS LAST
  LIMIT 3;
$$;

CREATE OR REPLACE FUNCTION public.chat_group_members_list(p_room_id uuid)
RETURNS TABLE (
  user_id                uuid,
  display_name           text,
  handle                 text,
  avatar_url             text,
  role                   text,
  joined_at              timestamptz,
  moderation_muted_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.user_id, p.display_name, p.handle, p.avatar_url,
    m.role, m.joined_at, m.moderation_muted_until
  FROM public.chat_room_members m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_id = p_room_id
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members v
      WHERE v.room_id = p_room_id AND v.user_id = auth.uid()
    )
  ORDER BY m.joined_at ASC NULLS LAST;
$$;

-- ── Star RPCs ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_starred_messages_page(
  p_room_id uuid,
  p_limit   int DEFAULT 50
)
RETURNS TABLE (
  message_id uuid,
  body       text,
  created_at timestamptz,
  sender_id  uuid,
  starred_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT msg.id, msg.body, msg.created_at, msg.sender_id, s.created_at
  FROM public.chat_message_stars s
  JOIN public.chat_messages msg ON msg.id = s.message_id
  WHERE s.user_id = auth.uid()
    AND msg.room_id = p_room_id
    AND msg.deleted_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
$$;

CREATE OR REPLACE FUNCTION public.chat_starred_message_ids(p_room_id uuid)
RETURNS TABLE (message_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.message_id
  FROM public.chat_message_stars s
  JOIN public.chat_messages msg ON msg.id = s.message_id
  WHERE s.user_id = auth.uid()
    AND msg.room_id = p_room_id;
$$;

-- ── Search RPC ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_search_messages(
  p_room_id uuid,
  p_query   text,
  p_limit   int DEFAULT 30
)
RETURNS TABLE (
  message_id uuid,
  body       text,
  created_at timestamptz,
  sender_id  uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; q text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_MEMBER' USING MESSAGE = 'You are not a member of this room.';
  END IF;
  q := trim(coalesce(p_query, ''));
  IF length(q) < 2 THEN RETURN; END IF;
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

-- ── Pin RPCs ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_pinned_messages_page(
  p_room_id uuid,
  p_limit   int DEFAULT 50
)
RETURNS TABLE (
  message_id  uuid,
  body        text,
  image_urls  text[],
  created_at  timestamptz,
  sender_id   uuid,
  pinned_at   timestamptz,
  pinned_by   uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT msg.id, msg.body, msg.image_urls, msg.created_at, msg.sender_id,
         pin.pinned_at, pin.pinned_by
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- ── Media / links RPCs ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chat_room_shared_media(
  p_room_id uuid,
  p_limit   int DEFAULT 80
)
RETURNS TABLE (
  message_id uuid,
  url        text,
  created_at timestamptz,
  sender_id  uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  p_room_id  uuid,
  p_limit    int DEFAULT 80,
  p_docs_only boolean DEFAULT false
)
RETURNS TABLE (
  message_id   uuid,
  url          text,
  created_at   timestamptz,
  sender_id    uuid,
  body_preview text
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
  lim := greatest(1, least(coalesce(p_limit, 80), 200));
  RETURN QUERY
  SELECT DISTINCT ON (sub.url)
    sub.message_id, sub.url, sub.created_at, sub.sender_id, sub.body_preview
  FROM (
    SELECT msg.id AS message_id, lower((m)[1]) AS url,
           msg.created_at, msg.sender_id, left(msg.body, 120) AS body_preview
    FROM public.chat_messages msg
    CROSS JOIN LATERAL regexp_matches(
      coalesce(msg.body, ''), '(https?://[^\s<>"\]]+)', 'gi'
    ) AS m
    WHERE msg.room_id = p_room_id
      AND msg.deleted_at IS NULL
      AND coalesce(msg.body, '') <> ''
  ) sub
  WHERE sub.url IS NOT NULL
    AND (NOT p_docs_only
         OR sub.url ~* '\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z)(\?|#|$)')
  ORDER BY sub.url, sub.created_at DESC
  LIMIT lim;
END;
$$;

-- ── Jump-to-message window ───────────────────────────────────────────────────

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
           msg.reply_to_preview, msg.reply_to_sender_id
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at < v_at OR (msg.created_at = v_at AND msg.id <= v_id))
    ORDER BY msg.created_at DESC, msg.id DESC LIMIT lim
  ),
  newer AS (
    SELECT msg.id, msg.room_id, msg.sender_id, msg.body, msg.image_urls,
           msg.created_at, msg.deleted_at, msg.reply_to_message_id,
           msg.reply_to_preview, msg.reply_to_sender_id
    FROM public.chat_messages msg
    WHERE msg.room_id = p_room_id
      AND (msg.created_at > v_at OR (msg.created_at = v_at AND msg.id > v_id))
    ORDER BY msg.created_at ASC, msg.id ASC LIMIT lim
  )
  SELECT * FROM (SELECT * FROM older UNION ALL SELECT * FROM newer) c
  ORDER BY c.created_at ASC, c.id ASC;
END;
$$;

-- ── Extended inbox RPC (returns avatar_url + description for group rooms) ────
-- Must DROP first because CREATE OR REPLACE cannot change OUT parameter types.

DROP FUNCTION IF EXISTS public.chat_rooms_for_user(uuid);

CREATE OR REPLACE FUNCTION public.chat_rooms_for_user(
  p_user_id uuid DEFAULT auth.uid()
)
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
  ORDER BY COALESCE(m.pinned, false) DESC, r.last_message_at DESC NULLS LAST;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.chat_group_header_members(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_group_members_list(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_starred_messages_page(uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_starred_message_ids(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_search_messages(uuid, text, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_pinned_messages_page(uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_pinned_message_ids(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_room_shared_media(uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_room_shared_links(uuid, int, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_messages_window(uuid, uuid, int) FROM public, anon;
REVOKE ALL ON FUNCTION public.chat_rooms_for_user(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.chat_group_header_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_group_members_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_starred_messages_page(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_starred_message_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_search_messages(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_pinned_messages_page(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_pinned_message_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_room_shared_media(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_room_shared_links(uuid, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_messages_window(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_rooms_for_user(uuid) TO authenticated, anon;

-- ── Realtime publication — include chat_rooms so UPDATE events propagate ──────
-- Members have a SELECT RLS policy on chat_rooms so they only receive events
-- for rooms they belong to. Required for group photo/name/description changes
-- to appear immediately on all members' screens.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables = true
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
    END IF;
  END IF;
END $$;

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
