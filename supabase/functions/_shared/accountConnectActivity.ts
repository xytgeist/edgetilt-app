import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Fresh accounts older than this cannot start a connect. */
export const CONNECT_FRESH_MAX_AGE_MS = 60 * 60 * 1000

const ACTIVITY_CHECKS: Array<[table: string, column: string]> = [
  ['community_feed_posts', 'user_id'],
  ['feed_comments', 'user_id'],
  ['chat_messages', 'sender_id'],
  ['follows', 'user_id'],
  ['profile_follows', 'follower_id'],
  ['user_subscriptions', 'user_id'],
  ['creator_subscriptions', 'subscriber_user_id'],
]

/**
 * Returns the first table where this user has real activity, `'error'` if a check failed,
 * or `null` when the account is empty and safe to delete for a connect.
 */
export async function freshAccountActivity(admin: SupabaseClient, userId: string): Promise<string | null> {
  // Every new profile auto-follows @edgelord (profiles_auto_follow_edgelord_after_insert); not real activity.
  const { data: edgelord } = await admin.from('profiles').select('user_id').ilike('handle', 'edgelord').maybeSingle()
  const edgelordId = String(edgelord?.user_id || '')

  for (const [table, column] of ACTIVITY_CHECKS) {
    let query = admin.from(table).select(column, { count: 'exact', head: true }).eq(column, userId)
    if (table === 'profile_follows' && edgelordId) query = query.neq('following_id', edgelordId)
    const { count, error } = await query
    if (error) return 'error'
    if ((count ?? 0) > 0) return table
  }
  return null
}
