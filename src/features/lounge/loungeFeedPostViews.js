/**
 * Lounge feed post view tracking (unique per signed-in viewer; author excluded in RPC).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** @type {Set<string>} */
const recordedPostIds = new Set()

/**
 * @param {unknown} postId
 * @returns {string}
 */
export function loungeFeedPostViewId(postId) {
  const id = String(postId || '').trim()
  return UUID_RE.test(id) ? id : ''
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} postId
 * @param {{ authorUserId?: string | null, viewerUserId?: string | null }} [opts]
 * @returns {Promise<number | null>} Updated view_count, or null if skipped / failed
 */
export async function recordLoungeFeedPostView(supabaseClient, postId, opts = {}) {
  const id = loungeFeedPostViewId(postId)
  const viewerUserId = String(opts.viewerUserId || '').trim()
  const authorUserId = String(opts.authorUserId || '').trim()
  if (!supabaseClient || !id || !viewerUserId) return null
  if (authorUserId && authorUserId === viewerUserId) return null
  if (recordedPostIds.has(id)) return null

  recordedPostIds.add(id)
  const { data, error } = await supabaseClient.rpc('lounge_record_feed_post_view', {
    p_post_id: id,
  })
  if (error) {
    recordedPostIds.delete(id)
    if (import.meta.env.DEV) {
      console.debug('[loungeFeedPostView]', id, error.message)
    }
    return null
  }
  return typeof data === 'number' && Number.isFinite(data) ? data : null
}
