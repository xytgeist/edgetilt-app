/**
 * Post-consensus side modifiers (QB / injury).
 *
 * Real sources only:
 * - Manual rows in syndicate_side_modifiers (CFB-first, any sport override)
 * - NFL/CFB Rundown hard-outs × known PVAL (no invented values for unmatched players)
 *
 * Applied AFTER the consensus board, BEFORE Scott's model-vs-market value flag.
 * Does not change Tank totals unless a future totals_impact is added.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchGameInjuryPval, type GameInjurySummary } from './loungeBotInjuryPval.ts'
import { shortDisplayName } from './loungeBotOddsCaption.ts'

export type SideModifier = {
  eventId: string
  sportKey: string
  homeTeam: string
  awayTeam: string
  /** Positive favors home (away more hurt). Clamped ±10. */
  netSpreadImpactHome: number
  reason: string
  source: 'manual' | 'rundown_pval'
  /** True when |impact| is large enough to move Scott's value gate. */
  isSignificant: boolean
}

const MANUAL_MIN_ABS = 0.5
const AUTO_MIN_ABS = 1.5
const AUTO_CLAMP = 7

type SlateEventLike = {
  id?: string
  home_team?: string
  away_team?: string
  commence_time?: string
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function teamsMatch(a: string, b: string): boolean {
  const na = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const nb = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/**
 * Adjust home-centric model spread for injury.
 * Positive netSpreadImpactHome (home healthier) → more home-favored model (more negative).
 */
export function applySideModifierToModelSpread(
  modelSpreadHome: number,
  netSpreadImpactHome: number,
): number {
  return Math.round((modelSpreadHome - netSpreadImpactHome) * 10) / 10
}

/** Recompute Scott value flag from adjusted model vs market. */
export function valueFlagFromModelMarket(
  modelSpreadHome: number,
  marketSpreadHome: number | null,
  minEdgePts = 2.5,
): { spreadDelta: number; isValuePlay: boolean; valueSide: 'home' | 'away' | null } {
  if (marketSpreadHome == null || !Number.isFinite(marketSpreadHome)) {
    return { spreadDelta: 0, isValuePlay: false, valueSide: null }
  }
  const deltaOnHome = marketSpreadHome - modelSpreadHome
  const spreadDelta = Math.round(Math.abs(deltaOnHome) * 10) / 10
  if (deltaOnHome >= minEdgePts) {
    return { spreadDelta, isValuePlay: true, valueSide: 'home' }
  }
  if (deltaOnHome <= -minEdgePts) {
    return { spreadDelta, isValuePlay: true, valueSide: 'away' }
  }
  return { spreadDelta, isValuePlay: false, valueSide: null }
}

function fromManualRow(row: Record<string, unknown>, eventId: string, sportKey: string): SideModifier | null {
  const impact = Number(row.net_spread_impact_home)
  if (!Number.isFinite(impact) || Math.abs(impact) < MANUAL_MIN_ABS) return null
  const reason = String(row.reason || '').trim()
  if (!reason) return null
  return {
    eventId,
    sportKey,
    homeTeam: String(row.home_team || ''),
    awayTeam: String(row.away_team || ''),
    netSpreadImpactHome: clamp(Math.round(impact * 10) / 10, -10, 10),
    reason,
    source: 'manual',
    isSignificant: Math.abs(impact) >= MANUAL_MIN_ABS,
  }
}

function fromInjurySummary(
  eventId: string,
  sportKey: string,
  summary: GameInjurySummary,
): SideModifier | null {
  // Only count absences that had a real PVAL match (already filtered in calculator).
  const qbOrBig = [...summary.homeReport.keyAbsences, ...summary.awayReport.keyAbsences]
    .filter((a) => a.pval >= 1.5 || a.pos === 'QB')
  if (!qbOrBig.length) return null

  const impact = clamp(
    Math.round(summary.netSpreadImpactHome * 10) / 10,
    -AUTO_CLAMP,
    AUTO_CLAMP,
  )
  if (Math.abs(impact) < AUTO_MIN_ABS && !qbOrBig.some((a) => a.pos === 'QB' && a.pval >= 2.5)) {
    return null
  }
  if (Math.abs(impact) < 1.0) return null

  const bits = qbOrBig
    .slice(0, 3)
    .map((a) => `${a.name} ${a.pos} ${a.status} (−${a.pval})`)
  const favor = impact > 0
    ? shortDisplayName(summary.homeTeam)
    : shortDisplayName(summary.awayTeam)

  return {
    eventId,
    sportKey,
    homeTeam: summary.homeTeam,
    awayTeam: summary.awayTeam,
    netSpreadImpactHome: impact,
    reason: `Injury PVAL · +${Math.abs(impact).toFixed(1)} toward ${favor}: ${bits.join('; ')}`,
    source: 'rundown_pval',
    isSignificant: Math.abs(impact) >= AUTO_MIN_ABS || qbOrBig.some((a) => a.pos === 'QB'),
  }
}

async function loadManualModifiers(
  admin: SupabaseClient,
  sportKey: string,
  events: SlateEventLike[],
): Promise<Map<string, SideModifier>> {
  const out = new Map<string, SideModifier>()
  if (!events.length) return out

  const eventIds = events.map((e) => String(e.id || '').trim()).filter(Boolean)
  const { data, error } = await admin
    .from('syndicate_side_modifiers')
    .select('*')
    .eq('sport_key', sportKey)
    .eq('active', true)

  if (error) {
    console.warn('syndicate_side_modifiers load:', error.message)
    return out
  }

  for (const row of data || []) {
    const rowEventId = row.event_id != null ? String(row.event_id).trim() : ''
    if (rowEventId && eventIds.includes(rowEventId)) {
      const mod = fromManualRow(row as Record<string, unknown>, rowEventId, sportKey)
      if (mod) out.set(rowEventId, mod)
      continue
    }
    // Fallback match on team names when event_id not set yet
    for (const ev of events) {
      const id = String(ev.id || '').trim()
      if (!id || out.has(id)) continue
      if (
        teamsMatch(String(row.home_team || ''), String(ev.home_team || '')) &&
        teamsMatch(String(row.away_team || ''), String(ev.away_team || ''))
      ) {
        const mod = fromManualRow(row as Record<string, unknown>, id, sportKey)
        if (mod) out.set(id, mod)
      }
    }
  }

  return out
}

/**
 * Resolve per-event side modifiers for a slate.
 * Manual DB rows win. Otherwise try Rundown × PVAL (only when real PVAL matches exist).
 */
export async function resolveSideModifiersForSlate(
  admin: SupabaseClient,
  sportKey: string,
  events: SlateEventLike[],
  opts: { skipAuto?: boolean; concurrency?: number } = {},
): Promise<Map<string, SideModifier>> {
  const manuals = await loadManualModifiers(admin, sportKey, events)
  if (opts.skipAuto) return manuals

  const pending = events.filter((ev) => {
    const id = String(ev.id || '').trim()
    return id && !manuals.has(id)
  })

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 5))
  let i = 0
  async function worker() {
    while (i < pending.length) {
      const idx = i++
      const ev = pending[idx]!
      const id = String(ev.id || '').trim()
      try {
        const summary = await fetchGameInjuryPval(
          sportKey,
          String(ev.home_team || ''),
          String(ev.away_team || ''),
          String(ev.commence_time || ''),
          admin,
        )
        if (!summary || !summary.isSignificant) continue
        // Prefer hard signal: at least one PVAL-tagged absence
        if (!summary.homeReport.keyAbsences.length && !summary.awayReport.keyAbsences.length) continue
        const mod = fromInjurySummary(id, sportKey, summary)
        if (mod?.isSignificant) manuals.set(id, mod)
      } catch (err) {
        console.warn(
          'side modifier auto failed:',
          id,
          err instanceof Error ? err.message : String(err),
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return manuals
}
