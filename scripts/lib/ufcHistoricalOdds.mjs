/**
 * The Odds API historical MMA snapshots for backtest CLV / ROI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { normalizeName } from './ufcCsvParser.mjs'
import { americanToImplied } from './ufcOddsMath.mjs'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

function cachePathForDate(isoDate) {
  const day = isoDate.slice(0, 10)
  return path.join(process.cwd(), 'data', 'ufc', 'odds-cache', `${day}.json`)
}

async function readCache(isoDate) {
  const p = cachePathForDate(isoDate)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(isoDate, payload) {
  const p = cachePathForDate(isoDate)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(payload, null, 2))
}

function pickBookmaker(event, prefer = ['pinnacle', 'circa', 'lowvig', 'betonlineag']) {
  const books = event?.bookmakers || []
  for (const key of prefer) {
    const hit = books.find((b) => String(b.key || '').toLowerCase().includes(key))
    if (hit) return hit
  }
  return books[0] || null
}

function extractH2h(book, fighterA, fighterB) {
  const market = book?.markets?.find((m) => m.key === 'h2h')
  if (!market?.outcomes?.length) return null
  const outA = market.outcomes.find((o) => normalizeName(o.name) === normalizeName(fighterA))
  const outB = market.outcomes.find((o) => normalizeName(o.name) === normalizeName(fighterB))
  if (!outA?.price || !outB?.price) return null
  return { oddsA: outA.price, oddsB: outB.price, book: book.title || book.key }
}

function findEventInSnapshot(data, fighterA, fighterB) {
  const events = Array.isArray(data) ? data : data?.data || []
  for (const ev of events) {
    const home = ev.home_team || ''
    const away = ev.away_team || ''
    const matchDirect =
      (normalizeName(home) === normalizeName(fighterA) && normalizeName(away) === normalizeName(fighterB)) ||
      (normalizeName(home) === normalizeName(fighterB) && normalizeName(away) === normalizeName(fighterA))
    if (matchDirect) {
      const book = pickBookmaker(ev)
      const prices = extractH2h(book, fighterA, fighterB)
      if (!prices) continue
      const flipped =
        normalizeName(home) === normalizeName(fighterB) && normalizeName(away) === normalizeName(fighterA)
      const base = {
        apiHome: home,
        apiAway: away,
        eventId: ev.id || null,
        source: 'odds-api',
      }
      return flipped
        ? {
            ...base,
            oddsA: prices.oddsB,
            oddsB: prices.oddsA,
            book: prices.book,
            commenceTime: ev.commence_time,
          }
        : { ...base, ...prices, commenceTime: ev.commence_time }
    }
  }
  return null
}

/**
 * Fetch historical odds near event time. Uses noon UTC on event date as default snapshot.
 */
export async function fetchHistoricalOddsForFight(fight, apiKey, opts = {}) {
  if (!apiKey) return null
  const snapshotIso = opts.snapshotIso || `${fight.eventDate}T18:00:00Z`

  let payload = await readCache(snapshotIso)
  if (!payload) {
    const url = new URL(`${ODDS_BASE}/historical/sports/mma_mixed_martial_arts/odds`)
    url.searchParams.set('apiKey', apiKey)
    url.searchParams.set('regions', 'us')
    url.searchParams.set('markets', 'h2h')
    url.searchParams.set('oddsFormat', 'american')
    url.searchParams.set('dateFormat', 'iso')
    url.searchParams.set('date', snapshotIso)

    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Odds API historical ${res.status}: ${body.slice(0, 200)}`)
    }
    payload = await res.json()
    writeCache(snapshotIso, payload)
  }

  const match = findEventInSnapshot(payload.data || payload, fight.fighterA, fight.fighterB)
  if (!match) return null

  return {
    ...match,
    impliedA: americanToImplied(match.oddsA),
    impliedB: americanToImplied(match.oddsB),
    snapshotIso,
  }
}

/** Batch by unique event dates to minimize API calls. */
export async function attachHistoricalOdds(fights, apiKey, opts = {}) {
  if (!apiKey) return { attached: 0, missed: fights.length }

  const byDate = new Map()
  for (const f of fights) {
    if (!byDate.has(f.eventDate)) byDate.set(f.eventDate, [])
    byDate.get(f.eventDate).push(f)
  }

  let attached = 0
  let missed = 0

  for (const [date, list] of byDate) {
    const snapshotIso = `${date}T18:00:00Z`
    let payload = await readCache(snapshotIso)
    if (!payload) {
      const url = new URL(`${ODDS_BASE}/historical/sports/mma_mixed_martial_arts/odds`)
      url.searchParams.set('apiKey', apiKey)
      url.searchParams.set('regions', 'us')
      url.searchParams.set('markets', 'h2h')
      url.searchParams.set('oddsFormat', 'american')
      url.searchParams.set('dateFormat', 'iso')
      url.searchParams.set('date', snapshotIso)

      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`Odds historical fetch failed for ${date}: ${res.status}`)
        missed += list.length
        continue
      }
      payload = await res.json()
      writeCache(snapshotIso, payload)
      if (opts.verbose) {
        const rem = res.headers.get('x-requests-remaining')
        console.log(`Odds API ${date} snapshot cached (remaining credits: ${rem ?? '?'})`)
      }
    }

    for (const fight of list) {
      const match = findEventInSnapshot(payload.data || payload, fight.fighterA, fight.fighterB)
      if (!match) {
        missed += 1
        continue
      }
      fight.marketOdds = match
      attached += 1
    }
  }

  return { attached, missed }
}
