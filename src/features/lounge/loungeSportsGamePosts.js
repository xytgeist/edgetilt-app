import { COMMUNITY_FEED_SELECT, filterLoungeFeedTimelinePosts } from '../../utils/loungeFeedScope.js'

/**
 * Lounge posts pinned to a game (`community_feed_posts.sports_game` event id), newest first. The game hub Posts
 * tab merges these with its team-name search so a post about a player ("Davante Adams") still shows on its game.
 * Two reads because older rows store `{ event_id }` only; current rows also carry `{ event_ids: [...] }`.
 */
export async function loungeSportsGamePinnedPosts(supabaseClient, eventId, { limit = 24 } = {}) {
  const id = String(eventId || '').trim()
  if (!supabaseClient || !id) return []
  const base = () =>
    supabaseClient
      .from('community_feed_posts')
      .select(COMMUNITY_FEED_SELECT)
      .is('hidden_at', null)
      .not('feed_visible_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
  const [multi, single] = await Promise.all([
    base().contains('sports_game', { event_ids: [id] }),
    base().eq('sports_game->>event_id', id),
  ])
  if (multi.error && single.error) throw multi.error
  const seen = new Set()
  const rows = [...(multi.data || []), ...(single.data || [])].filter((row) => {
    if (!row?.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
  return filterLoungeFeedTimelinePosts(rows)
}

const engagement = (p) =>
  (Number(p?.like_count) || 0) + 2 * (Number(p?.comment_count) || 0) + 2 * (Number(p?.repost_count) || 0)

/**
 * Pinned posts merged into a search result list without duplicates. `top` sorts by engagement, `latest` by time.
 */
export function mergeGamePosts(searchPosts, pinnedPosts, sort = 'latest', limit = 16) {
  const seen = new Set()
  const out = []
  for (const post of [...(pinnedPosts || []), ...(searchPosts || [])]) {
    const key = String(post?.id || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(post)
  }
  out.sort((a, b) =>
    sort === 'top'
      ? engagement(b) - engagement(a) || Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
      : Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0),
  )
  return out.slice(0, limit)
}
