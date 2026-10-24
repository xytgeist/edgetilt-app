/**
 * NBA market value for trades: ESPN's average auction price (`ownership.auctionValueAverage`, dollars from real ESPN
 * drafts). FantasyCalc (the NFL trade market) has no NBA, so this is the closest public read of what managers pay.
 * Draft-time prices, so the app blends it with our rest-of-season value instead of using it alone.
 * Shared cache 6h; keyed by ESPN player id.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sharedCached } from './edgeSharedCache.ts'

/** ESPN files the NBA season under the year it ends (2026-27 = 2027). */
function espnNbaSeason(now = new Date()): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
}

export function loadNbaAuctionValues(admin?: SupabaseClient): Promise<Record<string, number>> {
  const season = espnNbaSeason()
  return sharedCached(
    `fantasy:nba-espn-auction:${season}:v1`,
    { ttlMs: 6 * 60 * 60_000, staleMaxMs: 48 * 60 * 60_000, leaseMs: 30_000, admin, shouldStore: (v) => Object.keys(v).length > 0 },
    async () => {
      const filter = { players: { limit: 500, sortPercOwned: { sortPriority: 1, sortAsc: false } } }
      const res = await fetch(
        `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`,
        { headers: { Accept: 'application/json', 'x-fantasy-filter': JSON.stringify(filter) }, signal: AbortSignal.timeout(10_000) },
      )
      if (!res.ok) throw new Error(`ESPN NBA players ${res.status}`)
      const body = (await res.json()) as { players?: Array<{ player?: { id?: number; ownership?: { auctionValueAverage?: number } } }> }
      const out: Record<string, number> = {}
      for (const row of body.players || []) {
        const id = row.player?.id
        const value = Number(row.player?.ownership?.auctionValueAverage)
        if (id != null && Number.isFinite(value) && value > 0) out[String(id)] = Math.round(value * 10) / 10
      }
      return out
    },
  ).catch(() => ({}))
}
