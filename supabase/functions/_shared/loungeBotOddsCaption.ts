/**
 * Sports odds +EV analysis (The Odds API JSON).
 * h2h only: per-book devig → consensus fair prob → EV on best available price.
 */

const CAPTION_MAX = 500

export const DEFAULT_ODDS_WINDOW_HOURS = 48
export const DEFAULT_MIN_BOOKS = 3
/** Reject +EV above this (bad/stale data filter). */
export const DEFAULT_MAX_EV_PCT = 15
/** Default min +EV on $1 stake when config missing (2%). */
export const DEFAULT_MIN_EV_PCT = 2

type Outcome = { name?: string; price?: number }
type Market = { key?: string; outcomes?: Outcome[] }
type Bookmaker = { key?: string; title?: string; markets?: Market[] }
type OddsEvent = {
  id?: string
  sport_key?: string
  home_team?: string
  away_team?: string
  commence_time?: string
  bookmakers?: Bookmaker[]
}

export type OddsPick = {
  sportKey: string
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  marketKey: 'h2h'
  pickName: string
  pickPrice: number
  bookTitle: string
  /** American odds equivalent of consensus fair win probability. */
  consensusPrice: number
  /** +EV percent return on a $1 stake (EV × 100). Stored as edgePct for log compat. */
  edgePct: number
  /** Consensus fair win probability (0-1) after devig across books. */
  consensusProb: number
  bookCount: number
}

export type OddsFeaturedEvent = {
  homeTeam: string
  awayTeam: string
  commenceTime: string
  bookCount: number
}

export type PlusEvPickOptions = {
  minBooks?: number
  minEvPct?: number
  maxEvPct?: number
}

/** American odds → implied probability (with vig). */
export function americanToImplied(price: number): number {
  if (!Number.isFinite(price) || price === 0) return 0
  if (price > 0) return 100 / (price + 100)
  return Math.abs(price) / (Math.abs(price) + 100)
}

/** Profit on a winning $1 stake at American odds. */
export function americanProfitIfWin(price: number, stake = 1): number {
  if (!Number.isFinite(price) || price === 0 || stake <= 0) return 0
  if (price > 0) return (price / 100) * stake
  return (100 / Math.abs(price)) * stake
}

/** +EV on $1 stake using consensus as true win probability. Returns decimal (0.02 = 2%). */
export function computeEvDecimal(consensusProb: number, americanPrice: number, stake = 1): number {
  if (!Number.isFinite(consensusProb) || consensusProb <= 0 || consensusProb >= 1) return 0
  const profit = americanProfitIfWin(americanPrice, stake)
  return consensusProb * profit - (1 - consensusProb) * stake
}

function impliedToAmerican(prob: number): number {
  if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return 0
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob))
  return Math.round(100 * (1 - prob) / prob)
}

function average(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Remove vig for one book's h2h market (normalize implied probs to sum to 1). */
export function devigFairProbsForH2h(market: Market): Map<string, number> | null {
  const implied = new Map<string, number>()
  for (const out of market.outcomes || []) {
    const name = String(out.name || '').trim()
    const price = Number(out.price)
    if (!name || !Number.isFinite(price)) continue
    const imp = americanToImplied(price)
    if (imp <= 0 || imp >= 1) continue
    implied.set(name, imp)
  }
  if (implied.size < 2) return null

  const sum = [...implied.values()].reduce((a, b) => a + b, 0)
  if (sum <= 0) return null

  const fair = new Map<string, number>()
  for (const [name, imp] of implied) {
    fair.set(name, imp / sum)
  }
  return fair
}

/** Only games starting within the next N hours (actionable slate, not season-long futures). */
export function filterOddsEventsByWindow(
  events: OddsEvent[],
  maxHoursAhead = DEFAULT_ODDS_WINDOW_HOURS,
): OddsEvent[] {
  const now = Date.now()
  const maxMs = now + maxHoursAhead * 3_600_000
  return events.filter((ev) => {
    const t = Date.parse(String(ev.commence_time || ''))
    if (!Number.isFinite(t)) return false
    return t > now && t <= maxMs
  })
}

export function formatOddsCommenceTime(iso: string): string {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(t))
}

/** Compact kickoff for feed captions (e.g. "Sun Jul 5 at 3am PT"). */
export function formatOddsCommenceTimeShort(iso: string): string {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const tz = 'America/Los_Angeles'
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
  const monthDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(d)
  const timeRaw = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
  const time = timeRaw.replace(':00', '').replace(' AM', 'am').replace(' PM', 'pm')
  return `${weekday} ${monthDay} at ${time} PT`
}

function formatAmericanOdds(price: number): string {
  if (!Number.isFinite(price) || price === 0) return ''
  return price > 0 ? `+${price}` : String(price)
}

/** Last word for long player/team names (Mochizuki, Sinner, Chiefs). */
function shortDisplayName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return parts[parts.length - 1]!
}

/**
 * Find all h2h +EV opportunities: devig per book, average fair prob consensus, EV on best line.
 */
export function findPlusEvOpportunities(
  events: OddsEvent[],
  sportKey: string,
  opts: PlusEvPickOptions = {},
): OddsPick[] {
  const minBooks = opts.minBooks ?? DEFAULT_MIN_BOOKS
  const minEvPct = opts.minEvPct ?? DEFAULT_MIN_EV_PCT
  const maxEvPct = opts.maxEvPct ?? DEFAULT_MAX_EV_PCT
  const opportunities: OddsPick[] = []

  for (const ev of events) {
    const home = String(ev.home_team || 'Home').trim()
    const away = String(ev.away_team || 'Away').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!home || !away || !commenceTime) continue

    const fairByBook: { book: string; fair: Map<string, number> }[] = []
    const bestPriceByOutcome = new Map<string, { price: number; book: string }>()

    for (const book of ev.bookmakers || []) {
      const market = (book.markets || []).find((m) => m.key === 'h2h')
      if (!market) continue

      const fair = devigFairProbsForH2h(market)
      if (!fair?.size) continue

      const bookTitle = String(book.title || book.key || 'Book')
      fairByBook.push({ book: bookTitle, fair })

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        if (!name || !Number.isFinite(price)) continue
        const cur = bestPriceByOutcome.get(name)
        if (!cur || price > cur.price) {
          bestPriceByOutcome.set(name, { price, book: bookTitle })
        }
      }
    }

    if (fairByBook.length < minBooks) continue

    const outcomeNames = new Set<string>()
    for (const row of fairByBook) {
      for (const name of row.fair.keys()) outcomeNames.add(name)
    }

    for (const name of outcomeNames) {
      const fairSamples: number[] = []
      for (const row of fairByBook) {
        const p = row.fair.get(name)
        if (p != null && p > 0 && p < 1) fairSamples.push(p)
      }
      if (fairSamples.length < minBooks) continue

      const best = bestPriceByOutcome.get(name)
      if (!best) continue

      const consensusProb = average(fairSamples)
      const evDecimal = computeEvDecimal(consensusProb, best.price, 1)
      const evPct = Math.round(evDecimal * 1000) / 10

      if (evPct < minEvPct || evPct > maxEvPct) continue

      opportunities.push({
        sportKey,
        eventId: String(ev.id || `${home}-${away}`),
        homeTeam: home,
        awayTeam: away,
        commenceTime,
        marketKey: 'h2h',
        pickName: name,
        pickPrice: best.price,
        bookTitle: best.book,
        consensusPrice: impliedToAmerican(consensusProb),
        consensusProb: Math.round(consensusProb * 1000) / 1000,
        edgePct: evPct,
        bookCount: fairSamples.length,
      })
    }
  }

  opportunities.sort((a, b) => b.edgePct - a.edgePct)
  return opportunities
}

/** Best single h2h +EV pick across events (or null). */
export function pickBestOddsCandidate(
  events: OddsEvent[],
  sportKey: string,
  opts: PlusEvPickOptions = {},
): OddsPick | null {
  const list = findPlusEvOpportunities(events, sportKey, opts)
  return list[0] ?? null
}

/** Headline match for slate posts when no edge (most books, soonest kickoff). */
export function pickFeaturedEvent(events: OddsEvent[]): OddsFeaturedEvent | null {
  let best: OddsFeaturedEvent | null = null
  let bestBooks = -1
  let bestTime = Infinity

  for (const ev of events) {
    const home = String(ev.home_team || '').trim()
    const away = String(ev.away_team || '').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    const t = Date.parse(commenceTime)
    if (!home || !away || !Number.isFinite(t)) continue

    const bookCount = (ev.bookmakers || []).length
    if (bookCount > bestBooks || (bookCount === bestBooks && t < bestTime)) {
      bestBooks = bookCount
      bestTime = t
      best = { homeTeam: home, awayTeam: away, commenceTime, bookCount }
    }
  }

  return best
}

export function buildOddsEdgeAlertCaption(pick: OddsPick, opts?: { categoryLabel?: string }): string {
  const pickLabel = shortDisplayName(pick.pickName)
  const away = shortDisplayName(pick.awayTeam)
  const home = shortDisplayName(pick.homeTeam)
  const odds = formatAmericanOdds(pick.pickPrice)
  const fair = formatAmericanOdds(pick.consensusPrice)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const event = opts?.categoryLabel?.trim()

  const opener = event ? `${event}: ` : ''
  const matchup = when ? `${away} vs ${home}, ${when}` : `${away} vs ${home}`
  const cap =
    `⚡ ${opener}${pickLabel} ${odds} at ${pick.bookTitle} looks like the play. ` +
    `Fair closer to ${fair} across ${pick.bookCount} books, roughly +${pick.edgePct}% edge on the ML. ` +
    `${matchup}.`

  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

export type SlateCaptionInput = {
  categoryLabel: string
  eventsInWindow: number
  featured: OddsFeaturedEvent | null
}

export function buildOddsSlateCaption(input: SlateCaptionInput): string {
  const { categoryLabel, eventsInWindow, featured } = input
  const event = categoryLabel?.trim()
  const label = event ? `${event}: ` : ''

  if (eventsInWindow <= 0) {
    const cap = `${label}Checked the board... no matches in our 48h window. Nothing to post today.`
    return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
  }

  const matchWord = eventsInWindow === 1 ? 'match' : 'matches'

  if (featured) {
    const when = formatOddsCommenceTimeShort(featured.commenceTime)
    const away = shortDisplayName(featured.awayTeam)
    const home = shortDisplayName(featured.homeTeam)
    const nextUp = when ? `${away} vs ${home}, ${when}` : `${away} vs ${home}`
    const cap =
      `${label}Ran ${eventsInWindow} ${matchWord} in the next 48h... books look aligned, nothing +EV enough to fire today. ` +
      `Next up: ${nextUp}.`
    return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
  }

  const cap =
    `${label}Ran ${eventsInWindow} ${matchWord} in the next 48h... market's tight, nothing we like enough to post today.`
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

/** @deprecated use buildOddsEdgeAlertCaption */
export function buildOddsPickCaption(pick: OddsPick, opts?: { categoryLabel?: string }): string {
  return buildOddsEdgeAlertCaption(pick, opts)
}

export function edgeAlertDedupeKey(pick: OddsPick, ptDay: string): string {
  return `edge:${pick.sportKey}:${pick.eventId}:${pick.marketKey}:${pick.pickName}:${ptDay}`
}

export function slateDedupeKey(calendarSlug: string, ptDay: string): string {
  return `slate:${calendarSlug}:${ptDay}`
}

export function oddsExternalKey(pick: OddsPick): string {
  return edgeAlertDedupeKey(pick, new Date().toISOString().slice(0, 10))
}

/** @deprecated renamed DEFAULT_MAX_EV_PCT */
export const DEFAULT_MAX_EDGE_PCT = DEFAULT_MAX_EV_PCT
