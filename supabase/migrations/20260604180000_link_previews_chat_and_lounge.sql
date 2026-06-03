-- Link preview cache + jsonb on chat messages, feed posts, and feed comments.
-- Unfurl runs server-side (Edge: lounge-link-unfurl; chat send_message).

BEGIN;

CREATE TABLE IF NOT EXISTS public.link_preview_cache (
  url_normalized text PRIMARY KEY,
  preview        jsonb NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.link_preview_cache IS
  'Cached Open Graph / lounge-permalink previews keyed by normalized URL.';

ALTER TABLE public.link_preview_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_preview_cache_select_authenticated ON public.link_preview_cache;
CREATE POLICY link_preview_cache_select_authenticated ON public.link_preview_cache
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS link_preview jsonb;

ALTER TABLE public.community_feed_posts
  ADD COLUMN IF NOT EXISTS link_preview jsonb;

ALTER TABLE public.feed_comments
  ADD COLUMN IF NOT EXISTS link_preview jsonb;

COMMENT ON COLUMN public.chat_messages.link_preview IS
  'Denormalized link card payload (url, title, image_url, layout, …). Set by Edge unfurl.';

NOTIFY pgrst, 'reload schema';

COMMIT;
