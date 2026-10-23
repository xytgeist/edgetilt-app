/**
 * Drop leagues the host no longer lists for this connection + sport (left, deleted, removed by the commissioner).
 * Call only after the host's league list read succeeded. An empty list never prunes: a shape change or a hiccup that
 * returns nothing must not wipe a user's leagues (leaving every league of a sport keeps the last one until disconnect).
 * Teams, rosters, and matchups cascade with the league.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function pruneMissingLeagues(
  admin: SupabaseClient,
  connectionId: string,
  sport: string,
  listedExternalIds: Iterable<string>,
): Promise<number> {
  const keep = new Set([...listedExternalIds].map((id) => String(id || '').trim()).filter(Boolean))
  if (!connectionId || !keep.size) return 0
  const { data, error } = await admin
    .from('fantasy_leagues')
    .select('id, external_league_id')
    .eq('connection_id', connectionId)
    .eq('sport', sport)
  if (error || !Array.isArray(data)) return 0
  const gone = data.filter((row) => !keep.has(String(row.external_league_id || '').trim())).map((row) => row.id)
  if (!gone.length) return 0
  const { error: delErr } = await admin.from('fantasy_leagues').delete().in('id', gone)
  if (delErr) {
    console.error('fantasy league prune', connectionId, sport, delErr.message)
    return 0
  }
  return gone.length
}
