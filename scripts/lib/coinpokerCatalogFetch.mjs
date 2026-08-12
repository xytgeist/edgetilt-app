/**
 * CoinPoker marketing-site schedule scrape → catalog one_off rows.
 *
 * Source is WordPress HTML tables on coinpoker.com/tournaments/* (not a live lobby API).
 * - Dated series schedules (e.g. Battle of Malta Online /schedule/)
 * - Sunday template tables (Sunday Specials / Sunday PKOs) expanded to upcoming Sundays
 *
 * Soft-fail friendly: callers should catch errors so MTTDB sync still succeeds.
 */

import { parseBuyInFromText } from './pokerTournamentCatalog.mjs'
import { inferTournamentGameVariantFromText } from './pokerTournamentGameVariant.mjs'

/** @param {Date} d */
function utcYmd(d) {
  return d.toISOString().slice(0, 10)
}

/** @param {Date} d @param {number} days */
function addUtcDays(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
}

export const COINPOKER_ORIGIN = 'https://coinpoker.com'
export const COINPOKER_VENUE_LABEL = 'CoinPoker'
export const COINPOKER_HORIZON_DAYS = 14
export const COINPOKER_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
export const COINPOKER_FETCH_GAP_MS = 1500

/**
 * Seed pages always attempted. Extra tournament schedule URLs are discovered
 * from the page sitemap when available.
 */
export const COINPOKER_SEED_PAGES = [
  {
    url: `${COINPOKER_ORIGIN}/tournaments/battle-of-malta-online/schedule/`,
    mode: 'dated',
  },
  {
    url: `${COINPOKER_ORIGIN}/tournaments/sunday-specials/`,
    mode: 'sunday',
  },
  {
    url: `${COINPOKER_ORIGIN}/tournaments/sunday-pkos/`,
    mode: 'sunday',
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [attempt]
 */
export async function coinpokerFetchHtml(url, fetchImpl = fetch, attempt = 0) {
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': COINPOKER_FETCH_UA,
      Accept: 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  })
  if (res.status === 429 && attempt < 2) {
    await sleep(2500 * (attempt + 1))
    return coinpokerFetchHtml(url, fetchImpl, attempt + 1)
  }
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`CoinPoker HTTP ${res.status} for ${url}`)
  }
  return text
}

/** @param {string} html */
export function coinpokerParseTables(html) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0])
  return tables.map((tableHtml) => {
    const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => {
      const cells = [...m[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
        decodeHtml(c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
      )
      return cells
    })
    return {
      headers: rows[0] || [],
      rows: rows.slice(1).filter((r) => r.some(Boolean)),
    }
  })
}

/** @param {string} s */
function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

/** @param {string} header */
function classifyHeader(header) {
  const h = String(header || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!h) return null
  if (/^date$/.test(h) || h === 'event date') return 'date'
  if (/^day$/.test(h)) return 'day'
  if (/time/.test(h) && /utc|start/.test(h)) return 'time'
  if (/^time/.test(h)) return 'time'
  if (/buy/.test(h)) return 'buyin'
  if (/guarantee|^gtd$/.test(h)) return 'gtd'
  if (/^name$|tournament/.test(h)) return 'name'
  if (/trophy/.test(h)) return 'trophy'
  if (/coin awarded/.test(h)) return 'coin'
  return null
}

/**
 * @param {string[]} headers
 * @returns {Record<string, number>}
 */
export function coinpokerMapColumns(headers) {
  /** @type {Record<string, number>} */
  const map = {}
  headers.forEach((h, i) => {
    const key = classifyHeader(h)
    if (key && map[key] == null) map[key] = i
  })
  return map
}

/**
 * CoinPoker tables use DD/MM/YYYY (e.g. 12/07/2026 = 12 Jul 2026).
 * @param {string} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function coinpokerParseDate(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** @param {string} raw */
export function coinpokerParseTimeUtc(raw) {
  const m = String(raw || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = String(Number(m[1])).padStart(2, '0')
  const mm = m[2]
  if (Number(hh) > 23) return null
  return `${hh}:${mm}`
}

/** @param {string} raw */
export function coinpokerParseBuyIn(raw) {
  const s = String(raw || '').trim()
  if (!s) return 0
  if (/^free/i.test(s)) return 0
  if (/^\$?0+(\.0+)?$/i.test(s)) return 0
  const fromText = parseBuyInFromText(s)
  if (fromText != null) return fromText
  const digits = s.replace(/[^0-9.]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56)
}

/**
 * @param {string} eventDate
 * @param {string} timeUtc HH:MM
 */
export function coinpokerStartsAtIso(eventDate, timeUtc) {
  if (!eventDate || !timeUtc) return null
  return `${eventDate}T${timeUtc}:00.000Z`
}

/**
 * Next Sundays (UTC calendar) from today through horizon, inclusive of today if Sunday.
 * @param {Date} now
 * @param {number} horizonDays
 * @returns {string[]} YYYY-MM-DD
 */
export function coinpokerUpcomingSundays(now, horizonDays = COINPOKER_HORIZON_DAYS) {
  /** @type {string[]} */
  const out = []
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const d = addUtcDays(now, offset)
    if (d.getUTCDay() === 0) out.push(utcYmd(d))
  }
  return out
}

/**
 * @param {object} args
 * @param {string[]} args.cells
 * @param {Record<string, number>} args.col
 * @param {'dated' | 'sunday'} args.mode
 * @param {string} args.pageKey
 * @param {Date} args.now
 * @param {string} args.horizonIso
 * @param {string[]} [args.sundayDates]
 */
export function coinpokerRowsFromTableCells({
  cells,
  col,
  mode,
  pageKey,
  now,
  horizonIso,
  sundayDates = [],
}) {
  const nameIdx = col.name
  const timeIdx = col.time
  const buyIdx = col.buyin
  if (nameIdx == null || timeIdx == null || buyIdx == null) return []

  const name = String(cells[nameIdx] || '').trim()
  const timeUtc = coinpokerParseTimeUtc(cells[timeIdx])
  const buyIn = coinpokerParseBuyIn(cells[buyIdx])
  if (!name || !timeUtc || buyIn == null) return []

  const game = inferTournamentGameVariantFromText(name)
  const today = utcYmd(now)

  /** @type {object[]} */
  const out = []

  if (mode === 'dated' && col.date != null) {
    const eventDate = coinpokerParseDate(cells[col.date])
    if (!eventDate || eventDate < today || eventDate > horizonIso) return []
    const startsAt = coinpokerStartsAtIso(eventDate, timeUtc)
    out.push({
      external_id: `coinpoker:web:${pageKey}:${eventDate}:${slugify(name)}:${timeUtc.replace(':', '')}`,
      venue_name: COINPOKER_VENUE_LABEL,
      event_date: eventDate,
      starts_at: startsAt,
      buy_in: buyIn,
      currency: 'USD',
      display_name: name,
      game_variant: game || undefined,
      timezone: 'UTC',
      catalog_scope: 'online',
    })
    return out
  }

  if (mode === 'sunday') {
    for (const eventDate of sundayDates) {
      if (eventDate < today || eventDate > horizonIso) continue
      const startsAt = coinpokerStartsAtIso(eventDate, timeUtc)
      out.push({
        external_id: `coinpoker:web:${pageKey}:${eventDate}:${slugify(name)}:${timeUtc.replace(':', '')}`,
        venue_name: COINPOKER_VENUE_LABEL,
        event_date: eventDate,
        starts_at: startsAt,
        buy_in: buyIn,
        currency: 'USD',
        display_name: name,
        game_variant: game || undefined,
        timezone: 'UTC',
        catalog_scope: 'online',
      })
    }
  }

  return out
}

/**
 * @param {string} html
 * @param {{ mode: 'dated' | 'sunday', pageKey: string, now: Date, horizonIso: string, sundayDates?: string[] }} ctx
 */
export function coinpokerHtmlToOneOffs(html, ctx) {
  /** @type {object[]} */
  const oneOff = []
  let parsed = 0
  let skipped = 0
  for (const table of coinpokerParseTables(html)) {
    const col = coinpokerMapColumns(table.headers)
    if (ctx.mode === 'dated' && col.date == null) continue
    if (col.name == null || col.time == null || col.buyin == null) continue
    for (const cells of table.rows) {
      parsed++
      const rows = coinpokerRowsFromTableCells({
        cells,
        col,
        mode: ctx.mode,
        pageKey: ctx.pageKey,
        now: ctx.now,
        horizonIso: ctx.horizonIso,
        sundayDates: ctx.sundayDates,
      })
      if (!rows.length) {
        skipped++
        continue
      }
      oneOff.push(...rows)
    }
  }
  return { oneOff, parsed, skipped }
}

/**
 * Discover extra dated tournament schedule URLs from the EN page sitemap.
 * @param {typeof fetch} [fetchImpl]
 */
export async function coinpokerDiscoverScheduleUrls(fetchImpl = fetch) {
  /** @type {string[]} */
  const found = []
  try {
    const html = await coinpokerFetchHtml(`${COINPOKER_ORIGIN}/page-sitemap1.xml`, fetchImpl)
    for (const m of html.matchAll(/<loc>(https:\/\/coinpoker\.com\/tournaments\/[^<]+)<\/loc>/g)) {
      const url = m[1]
      if (/\/schedule\/?$/i.test(url)) found.push(url.replace(/\/?$/, '/'))
    }
  } catch {
    /* optional discovery */
  }
  return [...new Set(found)]
}

function pageKeyFromUrl(url) {
  try {
    const u = new URL(url)
    return slugify(u.pathname.replace(/^\/tournaments\//, '').replace(/\/$/, '')) || 'page'
  } catch {
    return 'page'
  }
}

/**
 * @param {{
 *   now?: Date,
 *   fetchImpl?: typeof fetch,
 *   pages?: typeof COINPOKER_SEED_PAGES,
 *   discover?: boolean,
 * }} [opts]
 */
export async function fetchCoinpokerCatalogOneOffs(opts = {}) {
  const {
    now = new Date(),
    fetchImpl = fetch,
    pages = COINPOKER_SEED_PAGES,
    discover = true,
  } = opts

  const horizonIso = utcYmd(addUtcDays(now, COINPOKER_HORIZON_DAYS))
  const sundayDates = coinpokerUpcomingSundays(now, COINPOKER_HORIZON_DAYS)

  /** @type {Array<{ url: string, mode: 'dated' | 'sunday' }>} */
  const queue = [...pages]
  if (discover) {
    const discovered = await coinpokerDiscoverScheduleUrls(fetchImpl)
    for (const url of discovered) {
      if (!queue.some((p) => p.url === url)) queue.push({ url, mode: 'dated' })
    }
  }

  /** @type {Map<string, object>} */
  const byExternal = new Map()
  let parsed = 0
  let skipped = 0
  let pagesOk = 0
  let pagesFailed = 0
  /** @type {string[]} */
  const pageErrors = []

  for (let i = 0; i < queue.length; i++) {
    const page = queue[i]
    if (i > 0) await sleep(COINPOKER_FETCH_GAP_MS)
    try {
      const html = await coinpokerFetchHtml(page.url, fetchImpl)
      const result = coinpokerHtmlToOneOffs(html, {
        mode: page.mode,
        pageKey: pageKeyFromUrl(page.url),
        now,
        horizonIso,
        sundayDates,
      })
      parsed += result.parsed
      skipped += result.skipped
      for (const row of result.oneOff) {
        byExternal.set(row.external_id, row)
      }
      pagesOk++
    } catch (err) {
      pagesFailed++
      pageErrors.push(`${page.url}: ${err?.message || err}`)
    }
  }

  return {
    oneOff: [...byExternal.values()],
    stats: {
      parsed,
      ingested: byExternal.size,
      skipped,
      pagesOk,
      pagesFailed,
      pageErrors,
      sundayDates,
    },
  }
}
