/**
 * Boxing Coffee & Covers — main-card fights only (skip deep undercard mismatches).
 */
import type { OddsEvent } from './loungeBotOddsCaption.ts'

/** Max fight cards in the Best Lines thread (e.g. two PPV main cards). */
export const BOXING_COFFEE_MAX_CARDS = 2
/** Top fights per card cluster. */
export const BOXING_COFFEE_MAX_FIGHTS_PER_CARD = 2
/** Skip extreme undercard mismatches (e.g. -2500 vs +1200). */
export const BOXING_COFFEE_MAIN_CARD_MAX_ABS_ML = 900
/** Fights on the same card usually start within this window (ms). */
export const BOXING_COFFEE_CARD_CLUSTER_GAP_MS = 2 * 60 * 60 * 1000

export function isBoxingCoffeeSport(sportKey: string, categoryLabel?: string): boolean {
  const sk = String(sportKey || '').trim().toLowerCase()
  if (sk.startsWith('boxing_')) return true
  const label = String(categoryLabel || '').trim().toLowerCase()
  return label.includes('boxing')
}

function h2hPrices(ev: OddsEvent): number[] {
  const prices: number[] = []
  for (const book of ev.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'h2h')
    if (!market) continue
    for (const out of market.outcomes || []) {
      const price = Number(out.price)
      if (Number.isFinite(price) && price !== 0) prices.push(price)
    }
  }
  return prices
}

function bookCountWithH2h(ev: OddsEvent): number {
  let count = 0
  for (const book of ev.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'h2h')
    if (market?.outcomes?.length) count += 1
  }
  return count
}

function scoreLooseMainCardFight(ev: OddsEvent): number {
  const home = String(ev.home_team || '').trim()
  const away = String(ev.away_team || '').trim()
  if (!home || !away) return -1

  const books = bookCountWithH2h(ev)
  if (books <= 0) return -1

  const prices = h2hPrices(ev)
  if (prices.length < 2) return -1

  const maxAbs = Math.max(...prices.map((p) => Math.abs(p)))
  if (maxAbs > 2500) return -1

  return books * 10 + (maxAbs <= 900 ? 20 : 0)
}

function scoreMainCardFight(ev: OddsEvent): number {
  const home = String(ev.home_team || '').trim()
  const away = String(ev.away_team || '').trim()
  if (!home || !away) return -1

  const books = bookCountWithH2h(ev)
  if (books <= 0) return -1

  const prices = h2hPrices(ev)
  if (prices.length < 2) return -1

  const maxAbs = Math.max(...prices.map((p) => Math.abs(p)))
  if (maxAbs > BOXING_COFFEE_MAIN_CARD_MAX_ABS_ML) return -1

  let score = books * 12
  if (maxAbs <= 350) score += 40
  else if (maxAbs <= 550) score += 24
  else if (maxAbs <= 750) score += 12
  return score
}

function clusterBoxingCards(events: OddsEvent[]): OddsEvent[][] {
  const scored = events
    .map((ev) => ({
      ev,
      score: scoreMainCardFight(ev),
      t: Date.parse(String(ev.commence_time || '')),
    }))
    .filter((row) => row.score > 0 && Number.isFinite(row.t))
    .sort((a, b) => a.t - b.t)

  if (!scored.length) return []

  const clusters: Array<{ events: OddsEvent[]; maxScore: number; start: number }> = []
  let current: OddsEvent[] = [scored[0]!.ev]
  let clusterMax = scored[0]!.score
  let clusterStart = scored[0]!.t

  for (let i = 1; i < scored.length; i++) {
    const row = scored[i]!
    const gap = row.t - scored[i - 1]!.t
    if (gap > BOXING_COFFEE_CARD_CLUSTER_GAP_MS) {
      clusters.push({ events: current, maxScore: clusterMax, start: clusterStart })
      current = [row.ev]
      clusterMax = row.score
      clusterStart = row.t
    } else {
      current.push(row.ev)
      clusterMax = Math.max(clusterMax, row.score)
    }
  }
  clusters.push({ events: current, maxScore: clusterMax, start: clusterStart })

  return clusters
    .sort((a, b) => b.maxScore - a.maxScore || b.start - a.start)
    .slice(0, BOXING_COFFEE_MAX_CARDS)
    .map((cluster) => {
      return [...cluster.events]
        .map((ev) => ({ ev, score: scoreMainCardFight(ev) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, BOXING_COFFEE_MAX_FIGHTS_PER_CARD)
        .map((row) => row.ev)
    })
}

/** Keep headline main-card fights only for Coffee Best Lines + pick scans. */
export function filterBoxingCoffeeMainCardEvents(
  events: OddsEvent[],
  sportKey: string,
  categoryLabel?: string,
): { events: OddsEvent[]; totalBefore: number } {
  const totalBefore = Array.isArray(events) ? events.length : 0
  if (!totalBefore || !isBoxingCoffeeSport(sportKey, categoryLabel)) {
    return { events: Array.isArray(events) ? events : [], totalBefore }
  }

  let cards = clusterBoxingCards(events)
  let picked = cards.flat()
  if (!picked.length) {
    picked = [...events]
      .map((ev) => ({ ev, score: scoreLooseMainCardFight(ev) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, BOXING_COFFEE_MAX_CARDS * BOXING_COFFEE_MAX_FIGHTS_PER_CARD)
      .map((row) => row.ev)
    if (!picked.length) {
      return { events: [], totalBefore }
    }
  }

  const order = new Map(picked.map((ev, idx) => [String(ev.id || `${ev.home_team}-${ev.away_team}-${ev.commence_time}`), idx]))
  picked.sort((a, b) => {
    const ka = String(a.id || `${a.home_team}-${a.away_team}-${a.commence_time}`)
    const kb = String(b.id || `${b.home_team}-${b.away_team}-${b.commence_time}`)
    return (order.get(ka) ?? 0) - (order.get(kb) ?? 0)
  })

  return { events: picked, totalBefore }
}
