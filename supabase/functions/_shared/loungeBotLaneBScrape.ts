/**
 * Lane B discover + scrape (VSiN / Covers / Boyds / BetFirms).
 * PARKED 2026-09-04: publisher HTML never yielded reconstructible tickets.
 * Stubs remain so old imports do not crash; refresh / load are no-ops.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'

/** Master kill switch … keep false until a structured ticket feed exists. */
export const LANE_B_ENABLED = false

export type LaneBMarket = 'side' | 'total' | 'ml'

export type LaneBParsedTicket = {
  source_id: string
  sport_key: string
  event_id: string | null
  matchup_text: string
  market: LaneBMarket
  selection: string
  line: number | null
  posted_at: string
  source_url: string
  weight_factor: number
  raw_excerpt: string
}

export type LaneBRefreshResult = {
  ok: boolean
  scrape_run_id: string
  discovered_urls: number
  fetched_ok: number
  tickets_parsed: number
  tickets_upserted: number
  matched_events: number
  errors: string[]
  soft_fail?: boolean
}

/**
 * Discover + scrape + upsert Lane B tickets for the current slate events.
 * PARKED: always soft-fails while LANE_B_ENABLED is false.
 */
export async function refreshLaneBTicketsForSlate(
  _admin: SupabaseClient,
  _sportKey: string,
  _events: OddsEvent[],
): Promise<LaneBRefreshResult> {
  return {
    ok: false,
    scrape_run_id: crypto.randomUUID(),
    discovered_urls: 0,
    fetched_ok: 0,
    tickets_parsed: 0,
    tickets_upserted: 0,
    matched_events: 0,
    errors: ['lane_b_parked'],
    soft_fail: true,
  }
}

/** Load active Lane B tickets for sport. Parked … always empty while disabled. */
export async function loadLaneBTicketsForSport(
  _admin: SupabaseClient,
  _sportKey: string,
  _opts?: { sinceHours?: number; limit?: number },
): Promise<LaneBParsedTicket[]> {
  return []
}

/**
 * Weighted Lane B side consensus for one event (for Quorum fold-in).
 * Parked … always null.
 */
export function laneBSideConsensusForEvent(
  _tickets: LaneBParsedTicket[],
  _eventId: string,
  _homeTeam: string,
  _awayTeam: string,
): { side: 'home' | 'away'; weight: number; n: number } | null {
  return null
}
