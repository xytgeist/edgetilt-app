/**
 * Circa Sports pregame lines (NFL + CFB) from OddsPapi. Circa isn't in The Odds API; it's the sharpest book
 * Nevada bettors can use. Free tier = 250 requests/month and Circa is pre-match only, so one
 * `odds-by-tournaments` call covers both leagues and is shared through `market_quote_cache` (survives cold
 * starts) at most every `REFRESH_MS`. Catalog ids/names are bundled (`oddspapiFootballCatalog.ts`).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ODDSPAPI_FOOTBALL_MARKETS, ODDSPAPI_FOOTBALL_PARTICIPANTS } from './oddspapiFootballCatalog.ts'

/** 3h → ~8 calls/day, ~240/month (free cap 250). */
const REFRESH_MS = 3 * 60 * 60 * 1000
const MEMORY_MS = 5 * 60 * 1000
const CACHE_KEY = 'oddspapi:circa:football'
const TOURNAMENT_IDS = [31, 27653] // NFL, NCAA regular season

export type CircaFixture = {
  home: string
  away: string
  start: string
  home_ml: number | null
  away_ml: number | null
  /** Home handicap (team 1 = home on OddsPapi). */
  home_spread: number | null
  home_spread_price: number | null
  away_spread_price: number | null
  total: number | null
  over_price: number | null
  under_price: number | null
  changed_at: string | null
}

type Payload = { fixtures: CircaFixture[]; fetched_at: string; error?: string }

type OpPlayer = { active?: boolean; price?: number; priceAmerican?: number; changedAt?: string }
type OpMarket = { outcomes?: Record<string, { players?: Record<string, OpPlayer> }> }
type OpFixture = {
  participant1Id?: number
  participant2Id?: number
  startTime?: string
  statusId?: number
  bookmakerOdds?: { circasports?: { markets?: Record<string, OpMarket> } }
}

function american(p: OpPlayer | undefined): number | null {
  const a = Number(p?.priceAmerican)
  if (Number.isFinite(a) && a !== 0) return a
  const d = Number(p?.price)
  if (!Number.isFinite(d) || d <= 1) return null
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1))
}

function player(market: OpMarket, outcomeId: number | string): OpPlayer | undefined {
  return market.outcomes?.[String(outcomeId)]?.players?.['0']
}

function implied(american: number | null): number | null {
  if (american == null) return null
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100)
}

/**
 * Circa keeps several spread / total rungs active (main number plus lopsided alternates like -3.5 at +295/-360);
 * the main line is the active rung whose two sides are priced closest together.
 */
function compactFixture(f: OpFixture): CircaFixture | null {
  const markets = f.bookmakerOdds?.circasports?.markets
  const home = ODDSPAPI_FOOTBALL_PARTICIPANTS[String(f.participant1Id)]
  const away = ODDSPAPI_FOOTBALL_PARTICIPANTS[String(f.participant2Id)]
  if (!markets || !home || !away || f.statusId !== 0) return null
  const best: Record<string, { gap: number; handicap: number; a: number | null; b: number | null; at?: string }> = {}
  for (const [marketId, market] of Object.entries(markets)) {
    const meta = ODDSPAPI_FOOTBALL_MARKETS[marketId]
    if (!meta) continue
    const [kind, handicap, firstId] = meta
    const pa = player(market, firstId)
    const pb = player(market, firstId + 1)
    if (!pa?.active || !pb?.active) continue
    const a = american(pa)
    const b = american(pb)
    const ia = implied(a)
    const ib = implied(b)
    if (ia == null || ib == null) continue
    const gap = Math.abs(ia - ib)
    if (!best[kind] || gap < best[kind].gap) best[kind] = { gap, handicap, a, b, at: pa.changedAt }
  }
  const { m, s, t } = best
  if (!m && !s && !t) return null
  const changed = [m?.at, s?.at, t?.at].filter(Boolean).sort().pop() || null
  return {
    home,
    away,
    start: String(f.startTime || ''),
    home_ml: m?.a ?? null,
    away_ml: m?.b ?? null,
    home_spread: s ? s.handicap : null,
    home_spread_price: s?.a ?? null,
    away_spread_price: s?.b ?? null,
    total: t ? t.handicap : null,
    over_price: t?.a ?? null,
    under_price: t?.b ?? null,
    changed_at: changed,
  }
}

async function fetchFromOddsPapi(key: string): Promise<CircaFixture[]> {
  const qs = new URLSearchParams({
    bookmaker: 'circasports',
    tournamentIds: TOURNAMENT_IDS.join(','),
    oddsFormat: 'american',
    apiKey: key,
  })
  const res = await fetch(`https://api.oddspapi.io/v4/odds-by-tournaments?${qs}`)
  if (!res.ok) throw new Error(`oddspapi ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('oddspapi: unexpected payload')
  return rows.map(compactFixture).filter((f): f is CircaFixture => f != null)
}

let memory: { at: number; payload: Payload } | null = null
let inflight: Promise<Payload | null> | null = null

async function refresh(admin: SupabaseClient): Promise<Payload | null> {
  const { data: row } = await admin
    .from('market_quote_cache')
    .select('payload, fetched_at')
    .eq('cache_key', CACHE_KEY)
    .maybeSingle()
  const stored = (row?.payload as Payload | undefined) || null
  const storedAt = row?.fetched_at ? Date.parse(String(row.fetched_at)) : 0
  if (stored && Date.now() - storedAt < REFRESH_MS) return stored

  const key = Deno.env.get('ODDSPAPI_API_KEY')?.trim()
  if (!key) return stored
  let payload: Payload
  try {
    payload = { fixtures: await fetchFromOddsPapi(key), fetched_at: new Date().toISOString() }
  } catch (err) {
    // Keep serving the last good board; stamping fetched_at still waits REFRESH_MS before retrying (quota).
    payload = {
      fixtures: stored?.fixtures || [],
      fetched_at: stored?.fetched_at || new Date().toISOString(),
      error: String((err as Error)?.message || err),
    }
  }
  await admin.from('market_quote_cache').upsert({
    cache_key: CACHE_KEY,
    asset_class: 'odds',
    symbol: 'circasports',
    payload,
    fetched_at: new Date().toISOString(),
  })
  return payload
}

/** Pregame Circa board (empty without `ODDSPAPI_API_KEY` or an admin client). */
export async function loadCircaFootballFixtures(admin: SupabaseClient | undefined): Promise<CircaFixture[]> {
  if (!admin) return []
  if (memory && Date.now() - memory.at < MEMORY_MS) return memory.payload.fixtures
  if (!inflight) {
    inflight = refresh(admin)
      .catch(() => null)
      .finally(() => {
        inflight = null
      })
  }
  const payload = await inflight
  if (payload) memory = { at: Date.now(), payload }
  return payload?.fixtures || []
}
