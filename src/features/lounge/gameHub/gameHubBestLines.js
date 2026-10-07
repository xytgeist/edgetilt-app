/**
 * Line shopping for the landscape pregame board: best line per side across the books, ranked by EV against
 * Pinnacle's no-vig price (consensus no-vig when Pinnacle is missing). Pinnacle is the reference, not a pick.
 */
import { sportsbookHomeUrl } from './sportsbookLinks.js'
import { fillBookLinkState, isLegalBook } from './gameHubLegalBooks.js'

/** Rule-of-thumb cover / total prob per half point off the reference number (ranking only). */
const PROB_PER_HALF_POINT = 0.015

const isPinnacle = (row) => /pinnacle/i.test(String(row?.book || ''))

function num(v) {
  const n = Number(v)
  return v != null && Number.isFinite(n) ? n : null
}

function implied(american) {
  const a = num(american)
  if (a == null || a === 0) return null
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100)
}

function decimal(american) {
  const a = num(american)
  if (a == null || a === 0) return null
  return a > 0 ? 1 + a / 100 : 1 + 100 / -a
}

/** No-vig probability of side A from a two-way price pair. */
function noVig(priceA, priceB) {
  const a = implied(priceA)
  const b = implied(priceB)
  if (a == null || b == null || a + b <= 0) return null
  return a / (a + b)
}

function median(values) {
  const a = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/** Some books (BetMGM, Caesars) template the user's state into the URL (`{state}`); we can't fill it without a state. */
export function usableLink(link) {
  const s = String(link || '').trim()
  return s && !/[{}]/.test(s) ? s : null
}

function bookUrl(row, link, legalState) {
  return usableLink(fillBookLinkState(link, legalState)) || sportsbookHomeUrl(row.book)
}

/** Legal-books mode: only books licensed in the viewer's state can be picked (Pinnacle stays as the pregame reference). */
function shopRows(rows, legalState) {
  const list = Array.isArray(rows) ? rows : []
  if (!legalState) return list
  const legal = list.filter((r) => isLegalBook(r.book, legalState))
  return legal.length ? [...list.filter(isPinnacle), ...legal] : []
}

function displayBook(name) {
  return String(name || '').replace(/\.(ag|com|eu|lv)$/i, '').replace(/\s*\(US\)\s*$/i, '').trim()
}

/**
 * Reference for one market side: `{ point, prob }` from Pinnacle, else the median across books of each
 * book's no-vig prob (point = median point).
 */
function reference(rows, pickA) {
  const pin = rows.find(isPinnacle)
  if (pin) {
    const r = pickA(pin)
    const prob = noVig(r.price, r.otherPrice)
    if (prob != null) return { point: r.point, prob }
  }
  const probs = []
  const points = []
  for (const row of rows) {
    const r = pickA(row)
    const prob = noVig(r.price, r.otherPrice)
    if (prob != null) {
      probs.push(prob)
      points.push(r.point)
    }
  }
  const prob = median(probs)
  return prob == null ? null : { point: median(points.filter((p) => p != null)), prob }
}

/**
 * Best candidate for one side. `better` = +1 when a higher point helps this side (dog spread, under),
 * -1 when lower helps (over); 0 for moneylines. EV is exact when the point matches the reference.
 */
function bestSide(rows, pickA, better, legalState) {
  const ref = reference(rows, pickA)
  const candidates = rows.filter((r) => !isPinnacle(r))
  const pool = candidates.length ? candidates : rows
  let best = null
  for (const row of pool) {
    const r = pickA(row)
    const dec = decimal(r.price)
    if (dec == null || (better !== 0 && r.point == null)) continue
    // Snapshot rows (old OddsPapi Circa) only compete at the reference number.
    if (row.snapshot && better !== 0 && ref?.point != null && r.point !== ref.point) continue
    let ev = null
    let score = dec
    if (ref) {
      const halfPoints = better === 0 || ref.point == null ? 0 : ((r.point - ref.point) * better) / 0.5
      const prob = Math.min(0.99, Math.max(0.01, ref.prob + halfPoints * PROB_PER_HALF_POINT))
      score = prob * dec - 1
      if (halfPoints === 0) ev = score
    }
    if (!best || score > best.score) {
      best = {
        score,
        point: r.point,
        price: num(r.price),
        book: displayBook(row.book),
        url: bookUrl(row, r.link, legalState),
        ev,
      }
    }
  }
  return best
}

/**
 * `{ books, away: { spread, ml }, home: { spread, ml }, over, under }` … each pick `{ point, price, book, url, ev }`;
 * `books` = how many books were shopped.
 */
export function pregameBestLines(rows, { legalState = null } = {}) {
  const list = shopRows(rows, legalState)
  if (!list.length) return null
  const side = (s, o) => ({
    spread: bestSide(
      list,
      (r) => ({ point: num(r[`${s}_spread`]), price: r[`${s}_spread_price`], otherPrice: r[`${o}_spread_price`], link: r[`${s}_spread_link`] }),
      1,
      legalState,
    ),
    ml: bestSide(list, (r) => ({ point: null, price: r[`${s}_ml`], otherPrice: r[`${o}_ml`], link: r[`${s}_ml_link`] }), 0, legalState),
  })
  const shopped = list.filter((r) => !isPinnacle(r)).length
  return {
    books: shopped || list.length,
    away: side('away', 'home'),
    home: side('home', 'away'),
    over: bestSide(list, (r) => ({ point: num(r.total), price: r.over_price, otherPrice: r.under_price, link: r.over_link }), -1, legalState),
    under: bestSide(list, (r) => ({ point: num(r.total), price: r.under_price, otherPrice: r.over_price, link: r.under_link }), 1, legalState),
  }
}

/** Live books move every few seconds; a book this far behind the freshest one has likely suspended the market. */
const LIVE_FRESH_MS = 30_000
/** Drop a live price whose no-vig win prob sits this far off the fresh-book median (stale / suspended). */
const LIVE_ML_OUTLIER = 0.06

function stampMs(row) {
  const t = Date.parse(String(row?.last_update || ''))
  return Number.isFinite(t) ? t : null
}

function pickFrom(row, price, point, link, legalState) {
  return {
    point,
    price: num(price),
    book: displayBook(row.book),
    url: bookUrl(row, link, legalState),
    ev: null,
  }
}

/** Most common point among books; ties go to the one nearest the median. */
function consensusPoint(points) {
  const list = points.filter((p) => p != null)
  if (!list.length) return null
  const counts = new Map()
  for (const p of list) counts.set(p, (counts.get(p) || 0) + 1)
  const mid = median(list)
  let best = null
  for (const [p, c] of counts) {
    if (!best || c > best.c || (c === best.c && Math.abs(p - mid) < Math.abs(best.p - mid))) best = { p, c }
  }
  return best.p
}

/**
 * In-game line shopping: only books stamped within `LIVE_FRESH_MS` of the freshest book, moneylines that
 * agree with the fresh consensus, spreads at the consensus number … then the best price per side.
 * The pregame EV ranking doesn't hold live (stale Pinnacle reference, books spread across 4+ points).
 * Same shape as `pregameBestLines` (`ev` is always null).
 */
export function liveBestLines(rows, { legalState = null } = {}) {
  const list = shopRows(rows, legalState)
  const stamps = list.map(stampMs).filter((t) => t != null)
  if (!stamps.length) return null
  const newest = Math.max(...stamps)
  const fresh = list.filter((r) => {
    const t = stampMs(r)
    return t != null && newest - t <= LIVE_FRESH_MS
  })
  if (!fresh.length) return null
  const books = fresh.filter((r) => !isPinnacle(r))
  const pool = books.length || legalState ? books : fresh

  const homeProbs = fresh.map((r) => noVig(r.home_ml, r.away_ml))
  const mlMid = median(homeProbs)
  const mlOk = (r) => {
    const p = noVig(r.home_ml, r.away_ml)
    return p != null && (mlMid == null || Math.abs(p - mlMid) <= LIVE_ML_OUTLIER)
  }
  const bestMl = (s) => {
    let best = null
    for (const r of pool) {
      if (!mlOk(r)) continue
      const dec = decimal(r[`${s}_ml`])
      if (dec != null && (!best || dec > best.dec)) best = { dec, pick: pickFrom(r, r[`${s}_ml`], null, r[`${s}_ml_link`], legalState) }
    }
    return best?.pick || null
  }

  const homePoint = consensusPoint(pool.map((r) => num(r.home_spread)))
  const bestSpread = (s) => {
    if (homePoint == null) return null
    const want = s === 'home' ? homePoint : -homePoint
    let best = null
    for (const r of pool) {
      if (num(r[`${s}_spread`]) !== want) continue
      const dec = decimal(r[`${s}_spread_price`])
      if (dec != null && (!best || dec > best.dec)) {
        best = { dec, pick: pickFrom(r, r[`${s}_spread_price`], want, r[`${s}_spread_link`], legalState) }
      }
    }
    return best?.pick || null
  }

  const totalPoint = consensusPoint(pool.map((r) => num(r.total)))
  const bestTotal = (side) => {
    if (totalPoint == null) return null
    const priceKey = side === 'over' ? 'over_price' : 'under_price'
    const linkKey = side === 'over' ? 'over_link' : 'under_link'
    let best = null
    for (const r of pool) {
      if (num(r.total) !== totalPoint) continue
      const dec = decimal(r[priceKey])
      if (dec != null && (!best || dec > best.dec)) {
        best = { dec, pick: pickFrom(r, r[priceKey], totalPoint, r[linkKey], legalState) }
      }
    }
    return best?.pick || null
  }

  return {
    books: pool.length,
    away: { spread: bestSpread('away'), ml: bestMl('away') },
    home: { spread: bestSpread('home'), ml: bestMl('home') },
    over: bestTotal('over'),
    under: bestTotal('under'),
  }
}
