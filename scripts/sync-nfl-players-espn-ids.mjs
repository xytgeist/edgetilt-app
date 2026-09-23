#!/usr/bin/env node
/**
 * Fill missing nfl_players.espn_id by matching Sleeper roster rows to ESPN core athletes.
 *
 *   node scripts/sync-nfl-players-espn-ids.mjs --target=test
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

/** ESPN team id by our abbrev (Sleeper / hub). */
const ESPN_TEAM_ID = {
  ARI: 22,
  ATL: 1,
  BAL: 33,
  BUF: 2,
  CAR: 29,
  CHI: 3,
  CIN: 4,
  CLE: 5,
  DAL: 6,
  DEN: 7,
  DET: 8,
  GB: 9,
  HOU: 34,
  IND: 11,
  JAX: 30,
  KC: 12,
  LAC: 24,
  LAR: 14,
  LV: 13,
  MIA: 15,
  MIN: 16,
  NE: 17,
  NO: 18,
  NYG: 19,
  NYJ: 20,
  PHI: 21,
  PIT: 23,
  SF: 25,
  SEA: 26,
  TB: 27,
  TEN: 10,
  WAS: 28,
}

const HEADSHOT_CDN = (espnId) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function parseArgs(argv) {
  const out = { target: 'test', season: '2026', dryRun: false }
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true
    else if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--season=')) out.season = arg.slice('--season='.length)
  }
  return out
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'EdgeTilt-nfl-espn-id-sync/1.0' },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function loadTeamAthletes(season, teamId) {
  const out = []
  let page = 1
  for (;;) {
    const listUrl =
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/teams/${teamId}/athletes?limit=100&page=${page}&active=true`
    const list = await fetchJson(listUrl)
    const items = Array.isArray(list.items) ? list.items : []
    if (!items.length) break
    for (const item of items) {
      const ref = String(item?.$ref || '').replace(/^http:/, 'https:')
      if (!ref) continue
      try {
        const ath = await fetchJson(ref)
        const id = ath?.id != null ? String(ath.id) : ''
        const name = String(ath?.displayName || ath?.fullName || '')
        if (!id || !name) continue
        out.push({
          espn_id: id,
          name,
          key: nameKey(name),
          headshot: ath?.headshot?.href || HEADSHOT_CDN(id),
        })
      } catch {
        /* skip bad athlete */
      }
      await new Promise((r) => setTimeout(r, 20))
    }
    const pageCount = Number(list.pageCount) || 1
    if (page >= pageCount) break
    page += 1
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv(args.target)
  const { url, key } = readSupabaseCredentials()
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: missing, error } = await supabase
    .from('nfl_players')
    .select('sleeper_id, full_name, team, espn_id')
    .is('espn_id', null)
  if (error) throw new Error(error.message)

  console.log(`Missing espn_id: ${(missing || []).length}`)

  const byTeam = new Map()
  for (const row of missing || []) {
    const team = String(row.team || '').toUpperCase()
    if (!ESPN_TEAM_ID[team]) continue
    if (!byTeam.has(team)) byTeam.set(team, [])
    byTeam.get(team).push(row)
  }

  let matched = 0
  let unmatched = 0
  for (const [team, rows] of byTeam) {
    const teamId = ESPN_TEAM_ID[team]
    console.log(`ESPN athletes ${team} (id=${teamId})…`)
    const athletes = await loadTeamAthletes(args.season, teamId)
    const byKey = new Map()
    for (const a of athletes) {
      if (!byKey.has(a.key)) byKey.set(a.key, a)
    }
    console.log(`  athletes=${athletes.length} missing_rows=${rows.length}`)

    for (const row of rows) {
      const key = nameKey(row.full_name)
      const hit = byKey.get(key)
      if (!hit) {
        unmatched += 1
        continue
      }
      matched += 1
      if (args.dryRun) continue
      const { error: upErr } = await supabase
        .from('nfl_players')
        .update({
          espn_id: hit.espn_id,
          headshot_url: hit.headshot,
          local_headshot_path: `/sports/nfl/players/${hit.espn_id}.png`,
          updated_at: new Date().toISOString(),
        })
        .eq('sleeper_id', row.sleeper_id)
      if (upErr) console.warn(`  update fail ${row.full_name}: ${upErr.message}`)
    }
  }

  console.log(`matched=${matched} unmatched=${unmatched}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
