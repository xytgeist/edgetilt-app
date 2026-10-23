#!/usr/bin/env node
/**
 * CFB season stats → public.cfb_players.season_stats (game hub Players expand).
 * One CFBD call for every team (~24MB); CFBD playerId is the ESPN athlete id.
 *
 *   node scripts/sync-cfb-player-stats.mjs --target=test
 *   node scripts/sync-cfb-player-stats.mjs --target=both        (test + production, one CFBD call)
 *   node scripts/sync-cfb-player-stats.mjs --target=test --dry-run
 *
 * Requires: migration 20261023150000_cfb_players_season_stats, CFBD_API_KEY, service role.
 * CFBD free tier is 1,000 calls / month … run this once a day, never per request.
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const RPC_CHUNK = 2000

/** CFBD category:statType → NFL hub key (GameHubPlayersPane `season_*`). */
const STAT_KEYS = {
  'passing:COMPLETIONS': 'season_pass_cmp',
  'passing:ATT': 'season_pass_att',
  'passing:YDS': 'season_pass_yd',
  'passing:TD': 'season_pass_td',
  'passing:INT': 'season_pass_int',
  'passing:YPA': 'season_pass_ypa',
  'rushing:CAR': 'season_rush_att',
  'rushing:YDS': 'season_rush_yd',
  'rushing:TD': 'season_rush_td',
  'rushing:LONG': 'season_rush_lng',
  'rushing:YPC': 'season_rush_ypa',
  'receiving:REC': 'season_rec',
  'receiving:YDS': 'season_rec_yd',
  'receiving:TD': 'season_rec_td',
  'receiving:LONG': 'season_rec_lng',
  'fumbles:LOST': 'season_fum_lost',
  'fumbles:REC': 'season_fum_rec',
  'kicking:FGM': 'season_fgm',
  'kicking:LONG': 'season_fgm_lng',
  'kicking:XPM': 'season_xpm',
  'kicking:XPA': 'season_xpa',
  'kicking:PTS': 'season_kick_pts',
}

function parseArgs(argv) {
  const out = { target: 'test', dryRun: false, year: 0 }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg.startsWith('--year=')) out.year = Number(arg.slice('--year='.length)) || 0
  }
  return out
}

/** CFB season = calendar year of the August kickoff (Jan bowls still count to last year). */
function currentSeason() {
  const now = new Date()
  return now.getUTCMonth() < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
}

async function fetchSeasonStats(year, apiKey) {
  const res = await fetch(`https://api.collegefootballdata.com/stats/player/season?year=${year}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`CFBD HTTP ${res.status}`)
  const remaining = res.headers.get('x-calllimit-remaining')
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('CFBD payload is not an array')
  return { rows, remaining }
}

function buildPlayerStats(rows) {
  const byId = new Map()
  for (const r of rows) {
    const id = String(r.playerId || '').trim()
    if (!id) continue
    const key = STAT_KEYS[`${r.category}:${r.statType}`]
    let stats = byId.get(id)
    if (!stats) {
      stats = {}
      byId.set(id, stats)
    }
    if (key) {
      const v = Number(r.stat)
      if (Number.isFinite(v)) stats[key] = v
    } else if (r.category === 'kicking' && r.statType === 'FGA') {
      stats._fga = Number(r.stat)
    }
  }
  const out = []
  for (const [id, stats] of byId) {
    if (Number.isFinite(stats._fga) && Number.isFinite(stats.season_fgm)) {
      stats.season_fgmiss = Math.max(0, stats._fga - stats.season_fgm)
    }
    delete stats._fga
    if (Object.keys(stats).length) out.push({ espn_id: id, stats })
  }
  return out
}

async function writeTarget(target, year, players, dryRun) {
  loadSupabaseEnv(target)
  const { url, key } = readSupabaseCredentials()
  if (!url || !key) throw new Error(`Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for ${target}`)
  if (dryRun) {
    console.log(`[${target}] dry run: would send ${players.length} players`)
    return
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  let updated = 0
  for (let i = 0; i < players.length; i += RPC_CHUNK) {
    const chunk = players.slice(i, i + RPC_CHUNK)
    const { data, error } = await supabase.rpc('cfb_players_set_season_stats', {
      p_year: year,
      p_rows: chunk,
    })
    if (error) throw new Error(`[${target}] ${error.message}`)
    updated += Number(data) || 0
  }
  console.log(`[${target}] updated ${updated} of ${players.length} CFBD players (rest are not on a cfb_players roster)`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = args.target === 'both' ? ['test', 'production'] : [args.target]
  loadSupabaseEnv(targets[0])
  const apiKey = String(process.env.CFBD_API_KEY || '').trim()
  if (!apiKey) throw new Error('Missing CFBD_API_KEY')
  const year = args.year || currentSeason()

  const t0 = Date.now()
  const { rows, remaining } = await fetchSeasonStats(year, apiKey)
  const players = buildPlayerStats(rows)
  console.log(
    `CFBD ${year}: ${rows.length} stat rows, ${players.length} players, ${Date.now() - t0}ms, calls left this month: ${remaining ?? '?'}`,
  )
  for (const target of targets) await writeTarget(target, year, players, args.dryRun)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
