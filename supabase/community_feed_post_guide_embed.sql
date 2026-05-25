-- Guide embed columns for community_feed_posts.
-- When a post is created from "Ask Community" on an AP Guide card:
--   is_ap_guide_post = true  → feed renders the guide embed card below the caption
--   guide_thumbnail_url      → snapshot of the guide's hero at post time (null = use static fallback)
--
-- Apply on test, then prod.

ALTER TABLE public.community_feed_posts
  ADD COLUMN IF NOT EXISTS is_ap_guide_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guide_thumbnail_url text;

-- RLS: same public-read policy as the parent table — no extra policy needed.
-- Inserting: handled by existing INSERT policy (authenticated users can insert their own posts).
