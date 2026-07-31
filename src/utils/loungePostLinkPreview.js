import { feedPostImageUrls, feedPostStreamVideoUid } from './communityFeedPost.js'

/** @typedef {{
 *   user_id?: string | null,
 *   display_name?: string | null,
 *   handle?: string | null,
 *   avatar_url?: string | null,
 *   role?: string | null,
 *   is_og?: boolean | null,
 * }} LoungePostEmbedAuthor */

/** @typedef {{
 *   id?: string | null,
 *   caption?: string | null,
 *   created_at?: string | null,
 *   pinned?: boolean | null,
 *   author?: LoungePostEmbedAuthor | null,
 *   media_url?: string | null,
 *   gif_url?: string | null,
 *   image_urls?: unknown,
 *   stream_video_uid?: string | null,
 *   stream_poster_url?: string | null,
 *   stream_video_width?: number | null,
 *   stream_video_height?: number | null,
 * }} LoungePostEmbedPreview */

const LOUNGE_POST_EMBED_MEDIA_SELECT =
  'id,caption,created_at,pinned,user_id,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {Pick<LoungePostEmbedPreview, 'media_url' | 'gif_url' | 'image_urls' | 'stream_video_uid' | 'stream_poster_url' | 'stream_video_width' | 'stream_video_height'>}
 */
export function loungePostMediaFieldsFromRow(row) {
  if (!row) {
    return {
      media_url: null,
      gif_url: null,
      image_urls: null,
      stream_video_uid: null,
      stream_poster_url: null,
      stream_video_width: null,
      stream_video_height: null,
    }
  }
  return {
    media_url: row.media_url ? String(row.media_url) : null,
    gif_url: row.gif_url ? String(row.gif_url) : null,
    image_urls: row.image_urls ?? null,
    stream_video_uid: row.stream_video_uid ? String(row.stream_video_uid) : null,
    stream_poster_url: row.stream_poster_url ? String(row.stream_poster_url) : null,
    stream_video_width:
      row.stream_video_width == null || row.stream_video_width === '' ? null : Number(row.stream_video_width),
    stream_video_height:
      row.stream_video_height == null || row.stream_video_height === '' ? null : Number(row.stream_video_height),
  }
}

/**
 * @param {LoungePostEmbedPreview | null | undefined} embed
 * @returns {boolean}
 */
export function loungePostEmbedHasMedia(embed) {
  if (!embed) return false
  if (feedPostStreamVideoUid(embed)) return true
  if (String(embed.media_url || embed.gif_url || '').trim()) return true
  return feedPostImageUrls(embed).length > 0
}

/**
 * @param {string | null | undefined} createdAt
 * @returns {string}
 */
export function loungePostAgeLabel(createdAt) {
  if (!createdAt) return ''
  const createdMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) return ''
  const diffMs = Date.now() - createdMs
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) return `${Math.max(0, diffMinutes)}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays <= 3) return `${diffDays}d`
  const dt = new Date(createdAt)
  const now = new Date()
  const sameYear = dt.getFullYear() === now.getFullYear()
  return dt.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * @param {{ lounge_post_id?: string | null, embed_kind?: string | null, lounge_post?: LoungePostEmbedPreview | null } | null | undefined} preview
 * @returns {boolean}
 */
export function isLoungePostLinkPreview(preview) {
  if (!preview) return false
  if (preview.embed_kind === 'lounge_post') return true
  return Boolean(String(preview.lounge_post_id || '').trim())
}

/**
 * @param {{ lounge_post_id?: string | null, lounge_post?: LoungePostEmbedPreview | null } | null | undefined} preview
 * @returns {LoungePostEmbedPreview | null}
 */
export function resolveLoungePostEmbedFromPreview(preview) {
  if (!preview) return null
  const embedded = preview.lounge_post
  if (embedded && typeof embedded === 'object') {
    const id = String(embedded.id || preview.lounge_post_id || '').trim()
    if (!id) return null
    return { ...embedded, id }
  }
  const postId = String(preview.lounge_post_id || '').trim()
  if (!postId) return null
  return { id: postId }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string} postId
 * @returns {Promise<LoungePostEmbedPreview | null>}
 */
export async function fetchChatLoungePostEmbed(supabaseClient, postId) {
  const id = String(postId || '').trim()
  if (!supabaseClient || !id) return null

  const { data: post, error } = await supabaseClient
    .from('community_feed_posts')
    .select(LOUNGE_POST_EMBED_MEDIA_SELECT)
    .eq('id', id)
    .is('hidden_at', null)
    .maybeSingle()
  if (error || !post) return null

  const { data: prof } = await supabaseClient
    .from('profiles')
    .select('user_id,display_name,handle,avatar_url,role,is_og')
    .eq('user_id', post.user_id)
    .maybeSingle()

  return {
    id: post.id,
    caption: post.caption,
    created_at: post.created_at,
    pinned: post.pinned === true,
    ...loungePostMediaFieldsFromRow(post),
    author: prof
      ? {
          user_id: prof.user_id,
          display_name: prof.display_name,
          handle: prof.handle,
          avatar_url: prof.avatar_url,
          role: prof.role,
          is_og: prof.is_og === true,
        }
      : { user_id: post.user_id },
  }
}
