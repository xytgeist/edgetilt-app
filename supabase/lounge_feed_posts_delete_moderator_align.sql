-- Align moderator DELETE on community_feed_posts with SocialFeed "staff" (moderator + admin).
-- Previously only `admin` could delete others' rows; the UI allows moderators to staff-delete.
-- Apply on any Supabase project that already ran `supabase/feed_phase_a_profiles_public_read.sql`.

drop policy if exists community_feed_posts_delete_moderator on public.community_feed_posts;

create policy community_feed_posts_delete_moderator on public.community_feed_posts
  for delete to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('moderator', 'admin')
    )
  );
