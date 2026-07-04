/**
 * Sports odds +EV analysis (The Odds API JSON).
 * h2h only: per-book devig → consensus fair prob → EV on best available price.
 */

const CAPTION_MAX = 2000

export const DEFAULT_ODDS_WINDOW_HOURS = 48
export const DEFAULT_MIN_BOOKS = 3
/** Reject +EV above this (bad/stale data filter). */
export const DEFAULT_MAX_EV_PCT = 15
/** Default min +EV on $1 stake when config missing (2%). */
export const DEFAULT_MIN_EV_PCT = 2

type Outcome = { name?: string; price?: number }
type Market = { key?: string; outcomes?: Outcome[] }
type Bookmaker = { key?: string; title?: string; markets?: Market[] }
export type OddsEvent = {
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

/** PT calendar date (YYYY-MM-DD) for an ISO kickoff. */
export function ptDateFromCommenceIso(iso: string): string {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t))
}

/** Morning slate: games kicking off on one PT calendar day (default today), not yet started. */
export function filterOddsEventsForPtCalendarDay(
  events: OddsEvent[],
  ptDate: string,
): OddsEvent[] {
  const now = Date.now()
  return events.filter((ev) => {
    const iso = String(ev.commence_time || '')
    if (ptDateFromCommenceIso(iso) !== ptDate) return false
    const t = Date.parse(iso)
    return Number.isFinite(t) && t > now
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

/** Compact kickoff for Scott bot captions (e.g. "Sat 2PM PT" or "Sat 7:11PM PT"). */
export function formatOddsCommenceTimeShort(iso: string): string {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const tz = 'America/Los_Angeles'
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? ''
  const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toUpperCase()
  const time = minute === '00' ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
  return `${weekday} ${time} PT`
}

export function formatAmericanOdds(price: number): string {
  if (!Number.isFinite(price) || price === 0) return ''
  return price > 0 ? `+${price}` : String(price)
}

/** US / common The Odds API book keys → display name (avoid bare domains in captions). */
const BOOK_DISPLAY_BY_KEY: Record<string, string> = {
  bovada: 'Bovada',
  fanduel: 'FanDuel',
  draftkings: 'DraftKings',
  betmgm: 'BetMGM',
  betrivers: 'BetRivers',
  pointsbetus: 'PointsBet',
  caesars: 'Caesars',
  williamhill_us: 'Caesars',
  wynnbet: 'WynnBET',
  barstool: 'Barstool',
  twinspires: 'TwinSpires',
  superbook: 'SuperBook',
  unibet_us: 'Unibet',
  espnbet: 'ESPN BET',
  fanatics: 'Fanatics',
  hardrockbet: 'Hard Rock',
  fliff: 'Fliff',
  betus: 'BetUS',
  mybookieag: 'MyBookie',
  betonlineag: 'BetOnline',
  lowvigag: 'LowVig',
  lowvig: 'LowVig',
  bookmaker: 'Bookmaker',
  pinnacle: 'Pinnacle',
  bet365: 'bet365',
}

function hasLinkableDomain(text: string): boolean {
  return /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,}\b/i.test(String(text || ''))
}

/** e.g. MyBookie.ag → mybookie[.ag] when no friendly name is mapped. */
function domainToBracketDisplay(raw: string): string | null {
  const m = String(raw || '').trim().match(/^([a-z0-9][a-z0-9.-]*?)\.([a-z]{2,})$/i)
  if (!m) return null
  const base = m[1].replace(/\./g, '').toLowerCase()
  const tld = m[2].toLowerCase()
  return `${base}[.${tld}]`
}

function bookKeyFromLabel(text: string): string {
  return String(text || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Caption-safe sportsbook label: brand name when known, else domain as name[.tld] (avoids feed auto-linkify). */
export function formatBookDisplayName(title: string, key?: string): string {
  const k = String(key || '').trim().toLowerCase()
  const t = String(title || '').trim()

  if (k && BOOK_DISPLAY_BY_KEY[k]) return BOOK_DISPLAY_BY_KEY[k]

  const titleKey = bookKeyFromLabel(t)
  if (titleKey && BOOK_DISPLAY_BY_KEY[titleKey]) return BOOK_DISPLAY_BY_KEY[titleKey]

  if (t && !hasLinkableDomain(t)) return t

  const fromTitle = domainToBracketDisplay(t)
  if (fromTitle) return fromTitle

  if (k.endsWith('ag') && k.length > 3) {
    if (BOOK_DISPLAY_BY_KEY[k]) return BOOK_DISPLAY_BY_KEY[k]
    return `${k.slice(0, -2)}[.ag]`
  }

  if (k.endsWith('eu') && k.length > 3) {
    return `${k.slice(0, -2)}[.eu]`
  }

  if (t) return t.length <= 20 ? t : `${t.slice(0, 18)}..`
  if (k) return k.length <= 20 ? k : `${k.slice(0, 18)}..`
  return 'Book'
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

      const bookLabel = formatBookDisplayName(String(book.title || ''), book.key)
      fairByBook.push({ book: bookLabel, fair })

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        if (!name || !Number.isFinite(price)) continue
        const cur = bestPriceByOutcome.get(name)
        if (!cur || price > cur.price) {
          bestPriceByOutcome.set(name, { price, book: bookLabel })
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

function joinCaptionLines(lines: string[]): string {
  const cap = lines.join('\n').trim()
  return cap.length <= CAPTION_MAX ? cap : `${cap.slice(0, CAPTION_MAX - 3)}...`
}

/** e.g. "World Cup: France vs Paraguay (Sat 2PM PT)" */
function formatEventMatchupLine(
  event: string | undefined,
  away: string,
  home: string,
  when: string,
): string {
  const matchup = `${away} vs ${home}`
  const body = when ? `${matchup} (${when})` : matchup
  return event ? `${event}: ${body}` : body
}

export function buildOddsEdgeAlertCaption(pick: OddsPick, opts?: { categoryLabel?: string }): string {
  const pickLabel = shortDisplayName(pick.pickName)
  const away = shortDisplayName(pick.awayTeam)
  const home = shortDisplayName(pick.homeTeam)
  const odds = formatAmericanOdds(pick.pickPrice)
  const fair = formatAmericanOdds(pick.consensusPrice)
  const when = formatOddsCommenceTimeShort(pick.commenceTime)
  const event = opts?.categoryLabel?.trim()

  return joinCaptionLines([
    `⚡ ${formatEventMatchupLine(event, away, home, when)}`,
    '',
    `${pickLabel} ML ${odds} at ${pick.bookTitle}`,
    `Fair ${fair} (${pick.bookCount} books)`,
    `+${pick.edgePct}% edge on ML`,
  ])
}

export type SlateCaptionInput = {
  categoryLabel: string
  events: OddsEvent[]
}

export type SlateGameBestLine = {
  awayTeam: string
  homeTeam: string
  commenceTime: string
  picks: { label: string; price: number; book: string }[]
}

function formatSlateGameBlock(game: SlateGameBestLine): string {
  const away = shortDisplayName(game.awayTeam)
  const home = shortDisplayName(game.homeTeam)
  const when = formatOddsCommenceTimeShort(game.commenceTime)
  const head = formatEventMatchupLine(undefined, away, home, when)
  const oddsLine = game.picks
    .map((p) => `${p.label} ${formatAmericanOdds(p.price)} (${p.book})`)
    .join(', ')
  return `${head}\n${oddsLine}`
}

function formatOutcomeLabel(name: string): string {
  const n = String(name || '').trim()
  if (!n) return 'Pick'
  if (/^draw$/i.test(n) || /^tie$/i.test(n)) return 'Draw'
  return shortDisplayName(n)
}

function outcomeSortRank(name: string, away: string, home: string): number {
  const n = name.trim().toLowerCase()
  const a = away.trim().toLowerCase()
  const h = home.trim().toLowerCase()
  if (n === a || n.endsWith(` ${a.split(' ').pop()}`)) return 0
  if (n === h || n.endsWith(` ${h.split(' ').pop()}`)) return 1
  if (/^draw$|^tie$/.test(n)) return 2
  return 3
}

/** Best h2h price per outcome for each upcoming game (slate listing). */
export function extractSlateGameBestLines(events: OddsEvent[]): SlateGameBestLine[] {
  const rows: SlateGameBestLine[] = []

  for (const ev of events) {
    const home = String(ev.home_team || '').trim()
    const away = String(ev.away_team || '').trim()
    const commenceTime = String(ev.commence_time || '').trim()
    if (!home || !away || !commenceTime) continue

    const bestByOutcome = new Map<string, { price: number; book: string }>()

    for (const book of ev.bookmakers || []) {
      const market = (book.markets || []).find((m) => m.key === 'h2h')
      if (!market) continue
      const bookLabel = formatBookDisplayName(String(book.title || ''), book.key)

      for (const out of market.outcomes || []) {
        const name = String(out.name || '').trim()
        const price = Number(out.price)
        if (!name || !Number.isFinite(price)) continue
        const cur = bestByOutcome.get(name)
        if (!cur || price > cur.price) {
          bestByOutcome.set(name, { price, book: bookLabel })
        }
      }
    }

    if (!bestByOutcome.size) continue

    const names = [...bestByOutcome.keys()].sort(
      (a, b) => outcomeSortRank(a, away, home) - outcomeSortRank(b, away, home),
    )
    const picks = names.map((name) => {
      const row = bestByOutcome.get(name)!
      return {
        label: formatOutcomeLabel(name),
        price: row.price,
        book: row.book,
      }
    })

    rows.push({ awayTeam: away, homeTeam: home, commenceTime, picks })
  }

  rows.sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime))
  return rows
}

export function buildOddsSlateCaption(input: SlateCaptionInput): string {
  const event = input.categoryLabel?.trim()
  const header = event ? `${event} slate` : 'Slate'
  const games = extractSlateGameBestLines(input.events)

  if (!games.length) {
    return joinCaptionLines([header, '', 'No games on today\'s slate.'])
  }

  const lines: string[] = [header, '']
  let included = 0

  for (let i = 0; i < games.length; i++) {
    const trialLines = [...lines, formatSlateGameBlock(games[i]), '']
    const omitted = games.length - i - 1
    if (omitted > 0) trialLines.push(`+${omitted} more games today.`)
    if (joinCaptionLines(trialLines).length <= CAPTION_MAX) {
      included = i + 1
    } else if (included === 0 && i === 0) {
      // Single game too long (unlikely): hard truncate odds line
      lines.push(formatSlateGameBlock(games[0]).slice(0, 200))
      included = 1
      break
    } else {
      break
    }
  }

  for (let i = 0; i < included; i++) {
    lines.push(formatSlateGameBlock(games[i]))
    lines.push('')
  }

  const omitted = games.length - included
  if (omitted > 0) lines.push(`+${omitted} more games today.`)

  return joinCaptionLines(lines)
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
