#!/usr/bin/env node
/**
 * Crosswalk nfl_players.espn_id → nflverse headshot (NFL.com Cloudinary) → R2 v2.
 *
 *   node scripts/sync-nfl-player-headshots-nflcom-r2.mjs --target=test
 *   node scripts/sync-nfl-player-headshots-nflcom-r2.mjs --target=production --limit=30
 *
 * Writes sports/nfl/players/v2/{espn_id}.png and updates nfl_players.headshot_url.
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const NFLVERSE_PLAYERS_CSV =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv'
const DEFAULT_LIMIT = 30
const PAUSE_MS = 500

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs(argv) {
  const out = { target: 'test', limit: DEFAULT_LIMIT, force: false }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
    else if (arg === '--force') out.force = true
  }
  return out
}

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

async function loadNflverseEspnHeadshotMap() {
  const res = await fetch(NFLVERSE_PLAYERS_CSV, {
    headers: { Accept: 'text/csv,*/*', 'User-Agent': 'edgetilt-nfl-headshot-sync/1.0' },
  })
  if (!res.ok) throw new Error(`nflverse players.csv HTTP ${res.status}`)
  const text = await res.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('nflverse players.csv empty')

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const espnIdx = headers.indexOf('espn_id')
  const headIdx = headers.indexOf('headshot')
  if (espnIdx < 0 || headIdx < 0) {
    throw new Error(`nflverse missing columns (espn_id=${espnIdx} headshot=${headIdx})`)
  }

  const map = new Map()
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i])
    const espnId = String(cols[espnIdx] || '').replace(/[^0-9]/g, '')
    const headshot = String(cols[headIdx] || '').trim()
    if (!espnId || !headshot) continue
    if (!/^https:\/\/static\.www\.nfl\.com\//i.test(headshot)) continue
    if (!map.has(espnId)) map.set(espnId, headshot)
  }
  return map
}

async function loadNflPlayers(supabase) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('nfl_players')
      .select('sleeper_id, espn_id, position, headshot_url, local_headshot_path, search_rank')
      .not('espn_id', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

function needsNflComMirror(row, force) {
  const pos = String(row.position || '').toUpperCase()
  if (pos === 'DEF' || pos === 'DST') return false
  const path = String(row.local_headshot_path || '')
  const url = String(row.headshot_url || '')
  if (path === 'nflcom_missing') return false
  if (!force && (path.includes('/sports/nfl/players/v2/') || url.includes('/sports/nfl/players/v2/'))) {
    return false
  }
  return true
}

async function runBatch(baseUrl, key, items) {
  const res = await fetch(`${baseUrl}/functions/v1/lounge-nfl-game-fantasy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ mirror_nflcom_headshots: true, items }),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 240)}`)
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv(args.target)
  const { url, key } = readSupabaseCredentials()
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  console.log(`NFL.com → R2 v2 mirror  target=${args.target}  batch=${args.limit}  force=${args.force}`)
  console.log('loading nflverse players.csv…')
  const espnMap = await loadNflverseEspnHeadshotMap()
  console.log(`nflverse espn→headshot: ${espnMap.size}`)

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const players = await loadNflPlayers(supabase)
  console.log(`nfl_players with espn_id: ${players.length}`)

  const queue = []
  let noNflverse = 0
  for (const row of players) {
    if (!needsNflComMirror(row, args.force)) continue
    const espnId = String(row.espn_id || '').replace(/[^0-9]/g, '')
    if (!espnId) continue
    const sourceUrl = espnMap.get(espnId)
    if (!sourceUrl) {
      noNflverse += 1
      continue
    }
    queue.push({
      sleeper_id: String(row.sleeper_id),
      espn_id: espnId,
      source_url: sourceUrl,
    })
  }
  console.log(`queued=${queue.length}  no_nflverse_match=${noNflverse}`)

  let totalMirrored = 0
  let totalFailed = 0
  for (let i = 0, n = 1; i < queue.length; i += args.limit, n += 1) {
    const chunk = queue.slice(i, i + args.limit)
    const result = await runBatch(url, key, chunk)
    totalMirrored += Number(result.mirrored) || 0
    totalFailed += Number(result.failed) || 0
    console.log(
      `[batch ${n}] scanned=${result.scanned} mirrored=${result.mirrored} failed=${result.failed} remaining≈${result.remaining}`,
    )
    if (Array.isArray(result.failures) && result.failures.length) {
      console.log('  sample failures:', JSON.stringify(result.failures.slice(0, 5)))
    }
    await sleep(PAUSE_MS)
  }

  console.log(`totals mirrored=${totalMirrored} failed=${totalFailed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
