/**
 * Backfill close_home_ml / close_away_ml on locked lounge_market_files from
 * Odds API historical Pinnacle h2h at kickoff.
 *
 * Usage:
 *   node scripts/backfill-close-ml.mjs --target=production
 *   node scripts/backfill-close-ml.mjs --target=test
 *   node scripts/backfill-close-ml.mjs --target=both
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const ODDS_BASE = 'https://api.the-odds-api.com/v4'
const SPORT = 'americanfootball_nfl'

function loadEnv(file) {
  const p = path.join(root, file)
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function parseTarget(argv) {
  let target = 'production'
  for (const a of argv) {
    if (a.startsWith('--target=')) target = a.slice('--target='.length)
  }
  if (!['test', 'production', 'both'].includes(target)) {
    throw new Error('--target must be test|production|both')
  }
  return target
}

function kickoffSnapshotIso(commence) {
  const t = Date.parse(commence)
  if (!Number.isFinite(t)) return ''
  const bucket = Math.floor((t - 60_000) / (10 * 60 * 1000)) * (10 * 60 * 1000)
  return new Date(Math.max(0, bucket)).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function teamsMatch(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = na.split(' ').pop()
  const tb = nb.split(' ').pop()
  return Boolean(ta && tb && (na.includes(tb) || nb.includes(ta) || ta === tb))
}

function extractPinnacleMl(event) {
  const books = Array.isArray(event?.bookmakers) ? event.bookmakers : []
  const book =
    books.find((b) => String(b.key || '').toLowerCase() === 'pinnacle') ||
    books.find((b) => String(b.key || '').toLowerCase() === 'lowvig') ||
    null
  if (!book) return null
  const h2h = (book.markets || []).find((m) => String(m.key || '') === 'h2h')
  const outcomes = Array.isArray(h2h?.outcomes) ? h2h.outcomes : []
  if (outcomes.length < 2) return null
  const homeName = String(event.home_team || '')
  const awayName = String(event.away_team || '')
  const home = outcomes.find((o) => teamsMatch(o.name, homeName))
  const away = outcomes.find((o) => teamsMatch(o.name, awayName))
  const homeMl = home?.price != null ? Math.round(Number(home.price)) : null
  const awayMl = away?.price != null ? Math.round(Number(away.price)) : null
  if (!Number.isFinite(homeMl) || !Number.isFinite(awayMl) || homeMl === 0 || awayMl === 0) {
    return null
  }
  return { homeMl, awayMl, source: String(book.key || 'pinnacle') }
}

async function fetchHistorical(oddsKey, dateIso) {
  const qs = new URLSearchParams({
    apiKey: oddsKey,
    regions: 'us,us2',
    markets: 'h2h,spreads',
    oddsFormat: 'american',
    bookmakers: 'pinnacle,lowvig',
    date: dateIso,
  })
  const res = await fetch(`${ODDS_BASE}/historical/sports/${SPORT}/odds?${qs}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`historical ${dateIso} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const body = await res.json()
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
}

async function backfillTarget(target, oddsKey) {
  const env = {
    ...loadEnv('.env'),
    ...loadEnv('.env.local'),
    ...loadEnv(`.env.supabase.${target}`),
  }
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error(`Missing SUPABASE_URL / SERVICE_ROLE for ${target}`)

  const admin = createClient(url, serviceKey)
  const { data: rows, error } = await admin
    .from('lounge_market_files')
    .select('event_id, home_team, away_team, commence_time, close_locked, close_home_ml, close_away_ml')
    .eq('sport_key', SPORT)
    .eq('close_locked', true)
    .or('close_home_ml.is.null,close_away_ml.is.null')

  if (error) throw new Error(`${target} load: ${error.message}`)
  const missing = rows || []
  console.log(`[backfill-close-ml] ${target}: ${missing.length} locked rows missing ML`)
  if (!missing.length) return { updated: 0 }

  const stamps = [
    ...new Set(missing.map((r) => kickoffSnapshotIso(r.commence_time)).filter(Boolean)),
  ]
  console.log(`[backfill-close-ml] ${target}: ${stamps.length} historical stamps`)

  const eventsByStamp = new Map()
  for (const stamp of stamps.slice(0, 12)) {
    try {
      const events = await fetchHistorical(oddsKey, stamp)
      eventsByStamp.set(stamp, events)
      console.log(`[backfill-close-ml] ${target}: ${stamp} → ${events.length} events`)
    } catch (err) {
      console.warn(`[backfill-close-ml] ${target}: ${stamp} failed: ${err.message || err}`)
    }
  }

  const nowIso = new Date().toISOString()
  let updated = 0
  for (const row of missing) {
    const stamp = kickoffSnapshotIso(row.commence_time)
    const events = eventsByStamp.get(stamp) || []
    const matched = events.find(
      (ev) => teamsMatch(ev.home_team, row.home_team) && teamsMatch(ev.away_team, row.away_team),
    )
    if (!matched) {
      console.log(`[backfill-close-ml] ${target}: no hist match ${row.away_team} @ ${row.home_team}`)
      continue
    }
    const ml = extractPinnacleMl(matched)
    if (!ml) {
      console.log(`[backfill-close-ml] ${target}: no h2h ${row.away_team} @ ${row.home_team}`)
      continue
    }
    const { error: upErr } = await admin
      .from('lounge_market_files')
      .update({
        close_home_ml: ml.homeMl,
        close_away_ml: ml.awayMl,
        close_ml_at: nowIso,
        close_ml_source: `hist:${ml.source}`,
        current_home_ml: ml.homeMl,
        current_away_ml: ml.awayMl,
        current_ml_at: nowIso,
        current_ml_source: `hist:${ml.source}`,
      })
      .eq('event_id', row.event_id)
    if (upErr) {
      console.warn(`[backfill-close-ml] ${target}: update failed ${row.event_id}: ${upErr.message}`)
      continue
    }
    updated += 1
    console.log(
      `[backfill-close-ml] ${target}: ${row.away_team} @ ${row.home_team} → home ${ml.homeMl} away ${ml.awayMl}`,
    )
  }
  return { updated }
}

async function main() {
  const target = parseTarget(process.argv.slice(2))
  const envBag = {
    ...loadEnv('.env'),
    ...loadEnv('.env.local'),
    ...loadEnv('.env.supabase.test'),
    ...loadEnv('.env.supabase.production'),
  }
  const oddsKey = String(envBag.THE_ODDS_API_KEY || '').trim()
  if (!oddsKey) throw new Error('THE_ODDS_API_KEY missing (checked .env.supabase.test/production)')

  const targets = target === 'both' ? ['test', 'production'] : [target]
  for (const t of targets) {
    const result = await backfillTarget(t, oddsKey)
    console.log(`[backfill-close-ml] ${t} done updated=${result.updated}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
