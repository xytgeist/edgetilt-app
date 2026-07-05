/**
 * Arb Watch — cross-book arbitrage detection for Scott Sharpe.
 * Only publishes when a clean arb clears the min profit threshold (no empty posts).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { resolveAlertSubscriberOnly } from './loungeBotAlertAudience.ts'
import {
  americanToImplied,
  formatAmericanOdds,
  formatBookDisplayName,
  formatOddsCommenceTimeShort,
  ptTodayDate,
  type OddsEvent,
} from './loungeBotOddsCaption.ts'
import {
  hasDedupePublishedToday,
  type OddsBotRow,
  type OddsCfgRow,
} from './loungeBotOddsRun.ts'
import {
  countScheduledKindToday,
  DEFAULT_MIN_POST_GAP_MINUTES,
  hasPendingScheduleDedupe,
  submitLoungeBotAlertPost,
} from './loungeBotPublishSchedule.ts'

const CAPTION_MAX = 2000
const DEFAULT_MIN_ARB_PROFIT_PCT = 3
/** Reject arbs above this (stale / bad line data). */
const DEFAULT_MAX_ARB_PROFIT_PCT = 12
const REFERENCE_TOTAL_STAKE = 100

type Outcome = { name?: string; price?: number; point?: number }
type Market = { key?: string; outcomes?: Outcome[] }
type Bookmaker = { key?: string; title?: string; markets?: Market[] }

export type ArbLeg = {
  outcomeName: string
  price: number
  bookTitle: string
  bookKey: string
  linePoint?: number | null
}

export type ArbOpportunity = {
  sportKey: string
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  marketKey: 'h2h' | 'spreads' | 'totals'
  linePoint: number | null
  legs: ArbLeg[]
  impliedSum: number
  profitPct: number
  totalStake: number
  profitDollars: number
  balancedStakes: Array<ArbLeg & { stake: number }>
}

function outcomeLinePoint(out: Outcome): number | null {
  const point = Number(out.point)
  return Number.isFinite(point) ? point : null
}

function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

function formatPickNameLabel(name: string): string {
  const n = String(name || '').trim()
  if (/^draw$|^tie$/i.test(n)) return 'Draw'
  return shortName(n)
}

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}


function isValidAmericanPrice(price: number): boolean {
  if (!Number.isFinite(price) || price === 0) return false
  if (price > 0) return price >= 100 && price <= 5000
  return price <= -100 && price >= -10000
}

type ArbLegWithMarket = ArbLeg & { marketKey: 'h2h' | 'spreads' | 'totals' }

function formatLegCaptionLine(leg: ArbLegWithMarket): string {
  const odds = formatAmericanOdds(leg.price)
  const label = formatPickNameLabel(leg.outcomeName)
  if (leg.marketKey === 'h2h') return `${label} ML ${odds} @ ${leg.bookTitle}`
  if (leg.linePoint != null && leg.marketKey === 'spreads') {
    const pt = leg.linePoint > 0 ? `+${leg.linePoint}` : String(leg.linePoint)
    return `${label} ${pt} (${odds}) @ ${leg.bookTitle}`
  }
  if (leg.linePoint != null && leg.marketKey === 'totals') {
    const side = /^over$/i.test(leg.outcomeName) ? 'Over' : /^under$/i.test(leg.outcomeName) ? 'Under' : leg.outcomeName
    return `${side} ${leg.linePoint} (${odds}) @ ${leg.bookTitle}`
  }
  return `${label} ${odds} @ ${leg.bookTitle}`
}

export function computeArbFromLegs(
  legs: ArbLeg[],
  opts?: { minProfitPct?: number; maxProfitPct?: number },
): {
  impliedSum: number
  profitPct: number
  totalStake: number
  profitDollars: number
  balancedStakes: Array<ArbLeg & { stake: number }>
} | null {
  if (legs.length < 2) return null
  if (!legs.every((l) => isValidAmericanPrice(l.price))) return null

  const implied = legs.map((l) => americanToImplied(l.price))
  const sum = implied.reduce((a, b) => a + b, 0)
  if (sum <= 0 || sum >= 1) return null

  const profitPct = Math.round((1 / sum - 1) * 1000) / 10
  const minProfit = opts?.minProfitPct ?? DEFAULT_MIN_ARB_PROFIT_PCT
  const maxProfit = opts?.maxProfitPct ?? DEFAULT_MAX_ARB_PROFIT_PCT
  if (profitPct < minProfit || profitPct > maxProfit) return null

  const uniqueBooks = new Set(legs.map((l) => l.bookKey).filter(Boolean))
  if (uniqueBooks.size < 2) return null

  const totalStake = REFERENCE_TOTAL_STAKE
  const balancedStakes = legs.map((leg, i) => ({
    ...leg,
    stake: Math.round((totalStake * implied[i]! / sum) * 100) / 100,
  }))
  const profitDollars = Math.round((totalStake / sum - totalStake) * 100) / 100

  return { impliedSum: sum, profitPct, totalStake, profitDollars, balancedStakes }
}

function bestLeg(
  map: Map<string, ArbLeg>,
  key: string,
  candidate: ArbLeg,
): void {
  const cur = map.get(key)
  if (!cur || candidate.price > cur.price) map.set(key, candidate)
}

function findH2hArbs(
  ev: OddsEvent,
  sportKey: string,
  minProfitPct: number,
  maxProfitPct: number,
): ArbOpportunity[] {
  const home = String(ev.home_team || '').trim()
  const away = String(ev.away_team || '').trim()
  const commenceTime = String(ev.commence_time || '').trim()
  if (!home || !away || !commenceTime) return []

  const bestByOutcome = new Map<string, ArbLeg>()
  let booksWithMarket = 0

  for (const book of ev.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'h2h')
    if (!market?.outcomes?.length) continue
    booksWithMarket += 1
    const bookTitle = formatBookDisplayName(String(book.title || ''), book.key)
    const bookKey = String(book.key || book.title || '').trim()

    for (const out of market.outcomes) {
      const name = String(out.name || '').trim()
      const price = Number(out.price)
      if (!name || !isValidAmericanPrice(price)) continue
      if (name !== home && name !== away && !/^draw$/i.test(name) && !/^tie$/i.test(name)) continue
      bestLeg(bestByOutcome, name, {
        outcomeName: name,
        price,
        bookTitle,
        bookKey,
        linePoint: null,
      })
    }
  }

  if (booksWithMarket < 2) return []

  const hasDraw = [...bestByOutcome.keys()].some((n) => /^draw$/i.test(n) || /^tie$/i.test(n))
  const outcomeSet = hasDraw
    ? [home, away, [...bestByOutcome.keys()].find((n) => /^draw$/i.test(n) || /^tie$/i.test(n))!]
    : [home, away]

  const legs = outcomeSet
    .map((name) => bestByOutcome.get(name))
    .filter((l): l is ArbLeg => Boolean(l))

  if (legs.length !== outcomeSet.length) return []

  const computed = computeArbFromLegs(legs, { minProfitPct, maxProfitPct })
  if (!computed) return []

  return [{
    sportKey,
    eventId: String(ev.id || `${home}-${away}`),
    homeTeam: home,
    awayTeam: away,
    commenceTime,
    marketKey: 'h2h',
    linePoint: null,
    legs,
    ...computed,
  }]
}

function findSpreadArbs(
  ev: OddsEvent,
  sportKey: string,
  minProfitPct: number,
  maxProfitPct: number,
): ArbOpportunity[] {
  const home = String(ev.home_team || '').trim()
  const away = String(ev.away_team || '').trim()
  const commenceTime = String(ev.commence_time || '').trim()
  if (!home || !away || !commenceTime) return []

  const bestByKey = new Map<string, ArbLeg>()
  let booksWithMarket = 0

  for (const book of ev.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'spreads')
    if (!market?.outcomes?.length) continue
    booksWithMarket += 1
    const bookTitle = formatBookDisplayName(String(book.title || ''), book.key)
    const bookKey = String(book.key || book.title || '').trim()

    for (const out of market.outcomes) {
      const name = String(out.name || '').trim()
      const point = outcomeLinePoint(out)
      const price = Number(out.price)
      if (!name || point == null || !isValidAmericanPrice(price)) continue
      if (name !== home && name !== away) continue
      bestLeg(bestByKey, `${name}|${point}`, {
        outcomeName: name,
        price,
        bookTitle,
        bookKey,
        linePoint: point,
      })
    }
  }

  if (booksWithMarket < 2) return []

  const found: ArbOpportunity[] = []
  const seen = new Set<string>()

  for (const [key, leg] of bestByKey) {
    const team = leg.outcomeName
    const oppTeam = team === home ? away : home
    const oppPoint = leg.linePoint != null ? -leg.linePoint : null
    if (oppPoint == null) continue
    const oppLeg = bestByKey.get(`${oppTeam}|${oppPoint}`)
    if (!oppLeg) continue

    const sig = `spread:${Math.abs(leg.linePoint ?? 0)}`
    if (seen.has(sig)) continue
    seen.add(sig)

    const pair = team === home ? [leg, oppLeg] : [oppLeg, leg]
    const computed = computeArbFromLegs(pair, { minProfitPct, maxProfitPct })
    if (!computed) continue

    found.push({
      sportKey,
      eventId: String(ev.id || `${home}-${away}`),
      homeTeam: home,
      awayTeam: away,
      commenceTime,
      marketKey: 'spreads',
      linePoint: Math.abs(leg.linePoint ?? 0),
      legs: pair,
      ...computed,
    })
  }

  return found
}

function findTotalArbs(
  ev: OddsEvent,
  sportKey: string,
  minProfitPct: number,
  maxProfitPct: number,
): ArbOpportunity[] {
  const home = String(ev.home_team || '').trim()
  const away = String(ev.away_team || '').trim()
  const commenceTime = String(ev.commence_time || '').trim()
  if (!home || !away || !commenceTime) return []

  const bestOver = new Map<number, ArbLeg>()
  const bestUnder = new Map<number, ArbLeg>()
  let booksWithMarket = 0

  for (const book of ev.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'totals')
    if (!market?.outcomes?.length) continue
    booksWithMarket += 1
    const bookTitle = formatBookDisplayName(String(book.title || ''), book.key)
    const bookKey = String(book.key || book.title || '').trim()

    for (const out of market.outcomes) {
      const name = String(out.name || '').trim()
      const point = outcomeLinePoint(out)
      const price = Number(out.price)
      if (!name || point == null || !isValidAmericanPrice(price)) continue
      const leg: ArbLeg = { outcomeName: name, price, bookTitle, bookKey, linePoint: point }
      if (/^over$/i.test(name)) {
        const cur = bestOver.get(point)
        if (!cur || price > cur.price) bestOver.set(point, leg)
      } else if (/^under$/i.test(name)) {
        const cur = bestUnder.get(point)
        if (!cur || price > cur.price) bestUnder.set(point, leg)
      }
    }
  }

  if (booksWithMarket < 2) return []

  const found: ArbOpportunity[] = []
  for (const [point, overLeg] of bestOver) {
    const underLeg = bestUnder.get(point)
    if (!underLeg) continue
    const computed = computeArbFromLegs([overLeg, underLeg], { minProfitPct, maxProfitPct })
    if (!computed) continue
    found.push({
      sportKey,
      eventId: String(ev.id || `${home}-${away}`),
      homeTeam: home,
      awayTeam: away,
      commenceTime,
      marketKey: 'totals',
      linePoint: point,
      legs: [overLeg, underLeg],
      ...computed,
    })
  }
  return found
}

export function findArbitrageOpportunities(
  events: OddsEvent[],
  sportKey: string,
  opts?: {
    minProfitPct?: number
    maxProfitPct?: number
    marketKeys?: Array<'h2h' | 'spreads' | 'totals'>
  },
): ArbOpportunity[] {
  const minProfitPct = opts?.minProfitPct ?? DEFAULT_MIN_ARB_PROFIT_PCT
  const maxProfitPct = opts?.maxProfitPct ?? DEFAULT_MAX_ARB_PROFIT_PCT
  const marketKeys = opts?.marketKeys?.length
    ? opts.marketKeys
    : ['h2h', 'spreads', 'totals']

  const all: ArbOpportunity[] = []
  for (const ev of events) {
    if (marketKeys.includes('h2h')) {
      all.push(...findH2hArbs(ev, sportKey, minProfitPct, maxProfitPct))
    }
    if (marketKeys.includes('spreads')) {
      all.push(...findSpreadArbs(ev, sportKey, minProfitPct, maxProfitPct))
    }
    if (marketKeys.includes('totals')) {
      all.push(...findTotalArbs(ev, sportKey, minProfitPct, maxProfitPct))
    }
  }

  all.sort((a, b) => b.profitPct - a.profitPct)
  return all
}

export function arbWatchDedupeKey(arb: ArbOpportunity, ptDay = ptTodayDate()): string {
  const lineSig = arb.linePoint != null ? `:${arb.linePoint}` : ''
  return `arb_watch:${ptDay}:${arb.eventId}:${arb.marketKey}${lineSig}`
}

function formatStakeSummary(arb: ArbOpportunity): string {
  const legs = arb.balancedStakes.map((leg) => ({
    ...leg,
    marketKey: arb.marketKey,
  })) as ArbLegWithMarket[]

  if (legs.length === 2) {
    const [a, b] = legs
    const aLabel = formatPickNameLabel(a.outcomeName)
    const bLabel = formatPickNameLabel(b.outcomeName)
    return `Stake $${a.stake} on ${aLabel} and $${b.stake} on ${bLabel} ($${arb.totalStake} total) for $${arb.profitDollars} profit.`
  }

  const parts = legs.map((leg) => `$${leg.stake} on ${formatPickNameLabel(leg.outcomeName)}`)
  return `Stake ${parts.join(', ')} ($${arb.totalStake} total) for $${arb.profitDollars} profit.`
}

export function buildArbWatchCaption(
  arb: ArbOpportunity,
  _opts?: { displayName?: string; categoryLabel?: string },
): string {
  const away = shortName(arb.awayTeam)
  const home = shortName(arb.homeTeam)
  const when = formatOddsCommenceTimeShort(arb.commenceTime)
  const legsWithMarket = arb.legs.map((leg) => ({ ...leg, marketKey: arb.marketKey })) as ArbLegWithMarket[]

  const lines = [
    `🔒 Arb Watch`,
    'Risk-Free Opportunity',
    '',
    ...legsWithMarket.map(formatLegCaptionLine),
    '',
    `Guaranteed +${arb.profitPct}% profit no matter the result.`,
    formatStakeSummary(arb),
  ]

  if (when) {
    lines.splice(3, 0, `${away} vs ${home} (${when})`, '')
  }

  return joinCaptionLines(lines)
}

export async function tryPublishArbWatchAlerts(
  admin: SupabaseClient,
  bot: OddsBotRow & { display_name?: string | null },
  events: OddsEvent[],
  sportKey: string,
  categoryLabel: string,
  oddsCfg: OddsCfgRow,
  dayStart: string,
  dryRun: boolean,
): Promise<{
  published: number
  detected: number
  skipped?: string
  best?: { profitPct: number; marketKey: string; eventId: string } | null
}> {
  if (oddsCfg.arb_watch_enabled === false) {
    return { published: 0, detected: 0, skipped: 'arb_watch_disabled' }
  }
  if (!events.length) {
    return { published: 0, detected: 0, skipped: 'no_games_today' }
  }

  const minProfit = Number(oddsCfg.min_arb_profit_pct) || DEFAULT_MIN_ARB_PROFIT_PCT
  const maxPerDay = Number(oddsCfg.max_arb_alerts_per_day) || 6
  const arbs = findArbitrageOpportunities(events, sportKey, { minProfitPct: minProfit })

  if (!arbs.length) {
    return { published: 0, detected: 0, skipped: 'no_qualifying_arb' }
  }

  if (dryRun) {
    const best = arbs[0]!
    return {
      published: 0,
      detected: arbs.length,
      best: { profitPct: best.profitPct, marketKey: best.marketKey, eventId: best.eventId },
    }
  }

  let publishedToday = 0
  const { count } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', bot.user_id)
    .eq('status', 'published')
    .eq('post_kind', 'arb_watch')
    .gte('created_at', dayStart)
  publishedToday = count ?? 0
  publishedToday += await countScheduledKindToday(admin, bot.user_id, 'arb_watch', dayStart)

  let published = 0
  const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
  const minGap = Number(oddsCfg.min_post_gap_minutes) || DEFAULT_MIN_POST_GAP_MINUTES

  for (const arb of arbs) {
    if (publishedToday >= maxPerDay) break

    const dedupeKey = arbWatchDedupeKey(arb)
    if (await hasDedupePublishedToday(admin, bot.user_id, dedupeKey, dayStart)) continue
    if (await hasPendingScheduleDedupe(admin, bot.user_id, dedupeKey)) continue

    const caption = buildArbWatchCaption(arb, {
      displayName: bot.display_name || 'Scott Sharpe',
      categoryLabel,
    })
    const subscriberOnly = resolveAlertSubscriberOnly('arb_watch', oddsCfg.alert_audience)
    const result = await submitLoungeBotAlertPost(admin, {
      botUserId: bot.user_id,
      caption,
      categoryPills: pills,
      subscriberOnly,
      postKind: 'arb_watch',
      dedupeKey,
      score: arb.profitPct,
      minGapMinutes: minGap,
      priority: 'urgent',
    })

    if (result.accepted) {
      published += 1
      publishedToday += 1
    } else if (!result.skipped) {
      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: bot.user_id,
        caption,
        score: arb.profitPct,
        status: 'failed',
        post_kind: 'arb_watch',
        dedupe_key: dedupeKey,
        error_message: result.error?.slice(0, 400),
      })
    }
  }

  const best = arbs[0]!
  return {
    published,
    detected: arbs.length,
    best: { profitPct: best.profitPct, marketKey: best.marketKey, eventId: best.eventId },
  }
}
