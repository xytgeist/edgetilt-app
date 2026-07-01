# lounge-cf-stream-delete-video

Authenticated **author**, **moderator**, or **admin** can delete the **Cloudflare Stream** asset for a `community_feed_posts` row. The function loads **`stream_video_uid`** with the service role (callers must not pass the uid).

Used by **`src/utils/loungeVideoUpload.js`** (`deleteCfStreamForCommunityFeedPost`) before the client deletes the post row, so Stream storage is released.

## Secrets

Same as **`lounge-cf-stream-direct-upload`**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` (Stream:Edit includes delete). Use **`--project-ref jtjgtucumuoswnbauxry`** on `supabase secrets set` for **test** (see direct-upload README).

## Deploy

**Test** project ref for this workspace:

```bash
supabase functions deploy lounge-cf-stream-delete-video --project-ref jtjgtucumuoswnbauxry
```

**Production** uses **`jtjgtucumuoswnbauxry`**. **Test sandbox:** **`kcosfvmreeiosdjdzycb`**.

## RLS

Staff delete in the app expects **moderators** to delete others’ posts. If your project still has `community_feed_posts_delete_moderator` restricted to **admin** only, run **`supabase/lounge_feed_posts_delete_moderator_align.sql`** so moderator DB deletes match the UI (and Stream cleanup + row delete stay in sync).
