/**
 * Backfill close_total on locked lounge_market_files from Odds API historical
 * Pinnacle totals at kickoff.
 *
 * Usage:
 *   node scripts/backfill-close-total.mjs --target=production
 *   node scripts/backfill-close-total.mjs --target=test
 *   node scripts/backfill-close-total.mjs --target=both
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

function extractPinnacleTotal(event) {
  const books = Array.isArray(event?.bookmakers) ? event.bookmakers : []
  const book =
    books.find((b) => String(b.key || '').toLowerCase() === 'pinnacle') ||
    books.find((b) => String(b.key || '').toLowerCase() === 'lowvig') ||
    null
  if (!book) return null
  const totals = (book.markets || []).find((m) => String(m.key || '') === 'totals')
  const outcomes = Array.isArray(totals?.outcomes) ? totals.outcomes : []
  const over = outcomes.find((o) => String(o.name || '').toLowerCase() === 'over')
  const under = outcomes.find((o) => String(o.name || '').toLowerCase() === 'under')
  const point =
    over?.point != null
      ? Number(over.point)
      : under?.point != null
        ? Number(under.point)
        : null
  if (!Number.isFinite(point)) return null
  return { total: point, source: String(book.key || 'pinnacle') }
}

async function fetchHistorical(oddsKey, dateIso) {
  const qs = new URLSearchParams({
    apiKey: oddsKey,
    regions: 'eu,us,us2',
    markets: 'totals',
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
    .select('event_id, home_team, away_team, commence_time, close_locked, close_total')
    .eq('sport_key', SPORT)
    .eq('close_locked', true)
    .is('close_total', null)

  if (error) throw new Error(`${target} load: ${error.message}`)
  const missing = rows || []
  console.log(`[backfill-close-total] ${target}: ${missing.length} locked rows missing total`)
  if (!missing.length) return { updated: 0 }

  const stamps = [
    ...new Set(missing.map((r) => kickoffSnapshotIso(r.commence_time)).filter(Boolean)),
  ]
  console.log(`[backfill-close-total] ${target}: ${stamps.length} historical stamps`)

  const eventsByStamp = new Map()
  for (const stamp of stamps.slice(0, 24)) {
    try {
      const events = await fetchHistorical(oddsKey, stamp)
      eventsByStamp.set(stamp, events)
      console.log(`[backfill-close-total] ${target}: ${stamp} → ${events.length} events`)
    } catch (err) {
      console.warn(`[backfill-close-total] ${target}: ${stamp} failed: ${err.message || err}`)
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
      console.log(`[backfill-close-total] ${target}: no hist match ${row.away_team} @ ${row.home_team}`)
      continue
    }
    const tot = extractPinnacleTotal(matched)
    if (!tot) {
      console.log(`[backfill-close-total] ${target}: no totals ${row.away_team} @ ${row.home_team}`)
      continue
    }
    const { error: upErr } = await admin
      .from('lounge_market_files')
      .update({
        close_total: tot.total,
        close_total_at: nowIso,
        close_total_source: `hist:${tot.source}`,
        current_total: tot.total,
        current_total_at: nowIso,
        current_total_source: `hist:${tot.source}`,
      })
      .eq('event_id', row.event_id)
    if (upErr) {
      console.warn(`[backfill-close-total] ${target}: update failed ${row.event_id}: ${upErr.message}`)
      continue
    }
    updated += 1
    console.log(
      `[backfill-close-total] ${target}: ${row.away_team} @ ${row.home_team} → ${tot.total}`,
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
    console.log(`[backfill-close-total] ${t} done updated=${result.updated}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
