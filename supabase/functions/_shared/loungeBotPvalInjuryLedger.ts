/**
 * PVAL calibration ledger (v2 scaffold).
 *
 * On NFL odds polls: first hard-OUT → insert row with booked PVAL + spread snapshot.
 * When market close locks: fill residual = actual spread move − expected from booked PVAL.
 * Never auto-rewrites nfl_player_pvals.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { OddsEvent } from './loungeBotOddsCaption.ts'
import {
  loadMarketFilesByEventIds,
  type MarketFileRow,
} from './loungeBotMarketFile.ts'
import {
  applyQbReplacementDeltas,
  isHardOutStatus,
  priorPvalFromRundownPlayer,
  scalePvalForStatus,
  type PvalAbsencePiece,
} from './loungeBotPvalBands.ts'
import {
  isRundownEnabled,
  resolveRundownEvent,
} from './loungeBotRundownContext.ts'
import {
  listTeamQbRoster,
  loadDbPlayerPvalMap,
  lookupPlayerPval,
  normalizePlayerNameKey,
  type PlayerValueEntry,
} from './loungeSportsPlayerValues.ts'

export const NFL_PVAL_LEDGER_SPORT = 'americanfootball_nfl'

function teamSideFor(
  playerTeamId: number | undefined,
  homeTeamId: number | undefined,
  awayTeamId: number | undefined,
): 'home' | 'away' | null {
  if (playerTeamId == null) return null
  if (homeTeamId != null && playerTeamId === homeTeamId) return 'home'
  if (awayTeamId != null && playerTeamId === awayTeamId) return 'away'
  return null
}

function buildPiecesForTeam(
  inactives: Array<{
    name: string
    status: string
    position?: string | null
    depthOrder?: number | null
  }>,
  dynamicDbMap: Map<string, PlayerValueEntry> | null,
): PvalAbsencePiece[] {
  const pieces: PvalAbsencePiece[] = []
  for (const p of inactives) {
    const valEntry = lookupPlayerPval(p.name, dynamicDbMap)
    if (valEntry && valEntry.pval > 0) {
      const scaled = scalePvalForStatus(valEntry.pval, p.status)
      if (scaled <= 0) continue
      pieces.push({
        name: valEntry.name,
        pos: valEntry.pos,
        pval: scaled,
        status: p.status,
        side: valEntry.side,
        isQb: valEntry.pos === 'QB',
      })
      continue
    }
    const prior = priorPvalFromRundownPlayer({
      name: p.name,
      status: p.status,
      position: p.position,
      depthOrder: p.depthOrder,
    })
    if (prior) pieces.push(prior)
  }
  return pieces
}

/**
 * Expected home-spread move from one team's player OUT.
 * Away OUT → home more favored → more negative home spread.
 * Home OUT → home less favored → more positive home spread.
 */
export function expectedSpreadMoveHome(
  teamSide: 'home' | 'away',
  bookedPval: number,
): number {
  const p = Number(bookedPval) || 0
  if (teamSide === 'away') return Math.round(-p * 100) / 100
  return Math.round(p * 100) / 100
}

async function insertNewHardOutsForEvent(
  admin: SupabaseClient,
  event: OddsEvent,
  market: MarketFileRow | undefined,
  dynamicDbMap: Map<string, PlayerValueEntry> | null,
): Promise<number> {
  const eventId = String(event.id || '').trim()
  const homeTeam = String(event.home_team || '').trim()
  const awayTeam = String(event.away_team || '').trim()
  const commenceTime = String(event.commence_time || '').trim()
  if (!eventId || !homeTeam || !awayTeam || !commenceTime) return 0

  const ctx = await resolveRundownEvent({
    sportKey: NFL_PVAL_LEDGER_SPORT,
    homeTeam,
    awayTeam,
    commenceTime,
  })
  if (!ctx) return 0

  const hardOuts = (ctx.inactivePlayers || []).filter((p) => isHardOutStatus(p.status))
  if (!hardOuts.length) return 0

  const homeInactives = hardOuts.filter((p) => p.teamId === ctx.homeTeamId)
  const awayInactives = hardOuts.filter((p) => p.teamId === ctx.awayTeamId)

  const homePieces = applyQbReplacementDeltas(buildPiecesForTeam(homeInactives, dynamicDbMap), {
    teamName: homeTeam,
    rosterQbs: listTeamQbRoster(homeTeam, dynamicDbMap),
  })
  const awayPieces = applyQbReplacementDeltas(buildPiecesForTeam(awayInactives, dynamicDbMap), {
    teamName: awayTeam,
    rosterQbs: listTeamQbRoster(awayTeam, dynamicDbMap),
  })

  const pieceByNorm = new Map<string, PvalAbsencePiece>()
  for (const p of [...homePieces, ...awayPieces]) {
    const key = normalizePlayerNameKey(p.name)
    if (key) pieceByNorm.set(key, p)
  }

  const nowIso = new Date().toISOString()
  const rows: Record<string, unknown>[] = []

  for (const p of hardOuts) {
    const side = teamSideFor(p.teamId, ctx.homeTeamId, ctx.awayTeamId)
    if (!side) continue
    const norm = normalizePlayerNameKey(p.name)
    if (!norm) continue
    const piece = pieceByNorm.get(norm)
    const booked = piece ? Number(piece.pval) || 0 : 0
    const teamName = side === 'home' ? homeTeam : awayTeam

    rows.push({
      event_id: eventId,
      sport_key: NFL_PVAL_LEDGER_SPORT,
      home_team: homeTeam,
      away_team: awayTeam,
      commence_time: commenceTime,
      player_name: String(p.name || '').trim(),
      normalized_name: norm,
      team_name: teamName,
      team_side: side,
      position: piece?.pos || p.position || null,
      status: String(p.status || '').trim(),
      booked_pval: booked,
      booked_note: piece?.note || null,
      detected_at: nowIso,
      spread_home_at_detect: market?.current_spread_home ?? market?.open_spread_home ?? null,
      spread_source_at_detect: market?.current_spread_source ?? market?.open_spread_source ?? null,
      open_spread_home: market?.open_spread_home ?? null,
      updated_at: nowIso,
    })
  }

  if (!rows.length) return 0

  // Idempotent: only first detection wins.
  const { data, error } = await admin
    .from('nfl_pval_injury_events')
    .upsert(rows, {
      onConflict: 'event_id,normalized_name',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) {
    // Older PostgREST may not like ignoreDuplicates — fall back to per-row insert.
    if (/ignoreDuplicates|onConflict|duplicate/i.test(error.message)) {
      let inserted = 0
      for (const row of rows) {
        const { error: insErr } = await admin.from('nfl_pval_injury_events').insert(row)
        if (!insErr) inserted += 1
        else if (!/duplicate|unique/i.test(insErr.message)) {
          console.warn('[pval-ledger] insert failed:', insErr.message)
        }
      }
      return inserted
    }
    throw new Error(`nfl_pval_injury_events upsert: ${error.message}`)
  }

  return (data || []).length
}

async function fillResidualsForLockedEvents(
  admin: SupabaseClient,
  markets: Map<string, MarketFileRow>,
): Promise<number> {
  const lockedIds = [...markets.values()]
    .filter((m) => m.close_locked && m.close_spread_home != null)
    .map((m) => m.event_id)
  if (!lockedIds.length) return 0

  const { data: pending, error } = await admin
    .from('nfl_pval_injury_events')
    .select(
      'id, event_id, team_side, booked_pval, spread_home_at_detect',
    )
    .in('event_id', lockedIds)
    .is('residual_filled_at', null)

  if (error) throw new Error(`nfl_pval_injury_events pending load: ${error.message}`)
  if (!pending?.length) return 0

  const nowIso = new Date().toISOString()
  let filled = 0

  for (const row of pending) {
    const market = markets.get(String(row.event_id))
    if (!market || market.close_spread_home == null) continue
    const atDetect = row.spread_home_at_detect != null ? Number(row.spread_home_at_detect) : null
    if (atDetect == null || !Number.isFinite(atDetect)) continue

    const close = Number(market.close_spread_home)
    const move = Math.round((close - atDetect) * 100) / 100
    const expected = expectedSpreadMoveHome(
      row.team_side === 'home' ? 'home' : 'away',
      Number(row.booked_pval) || 0,
    )
    const residual = Math.round((move - expected) * 100) / 100

    const { error: updErr } = await admin
      .from('nfl_pval_injury_events')
      .update({
        close_spread_home: close,
        spread_move_home: move,
        expected_spread_move_home: expected,
        residual_home: residual,
        residual_filled_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', row.id)

    if (updErr) {
      console.warn('[pval-ledger] residual update failed:', updErr.message)
      continue
    }
    filled += 1
  }

  return filled
}

/**
 * NFL-only ledger sync. Safe to call after market-file upsert; never throws to caller
 * (caller should still try/catch). Returns counts for logs.
 */
export async function syncNflPvalInjuryLedger(
  admin: SupabaseClient,
  events: OddsEvent[],
  opts: { dryRun?: boolean } = {},
): Promise<{ inserted: number; residualsFilled: number; eventsScanned: number }> {
  if (opts.dryRun || !events.length || !isRundownEnabled()) {
    return { inserted: 0, residualsFilled: 0, eventsScanned: 0 }
  }

  const nflEvents = events.filter((ev) => {
    const id = String(ev.id || '').trim()
    return Boolean(id && ev.home_team && ev.away_team && ev.commence_time)
  })
  if (!nflEvents.length) return { inserted: 0, residualsFilled: 0, eventsScanned: 0 }

  const eventIds = nflEvents.map((ev) => String(ev.id).trim())
  const markets = await loadMarketFilesByEventIds(admin, eventIds)
  const dynamicDbMap = await loadDbPlayerPvalMap(admin)

  let inserted = 0
  for (const event of nflEvents) {
    try {
      inserted += await insertNewHardOutsForEvent(
        admin,
        event,
        markets.get(String(event.id || '').trim()),
        dynamicDbMap,
      )
    } catch (err) {
      console.warn(
        '[pval-ledger] event scan failed:',
        event.away_team,
        '@',
        event.home_team,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  let residualsFilled = 0
  try {
    residualsFilled = await fillResidualsForLockedEvents(admin, markets)
  } catch (err) {
    console.warn(
      '[pval-ledger] residual fill failed:',
      err instanceof Error ? err.message : String(err),
    )
  }

  return { inserted, residualsFilled, eventsScanned: nflEvents.length }
}
