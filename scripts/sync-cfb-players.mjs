#!/usr/bin/env node
/**
 * Sync FBS college football rosters from ESPN → public.cfb_players.
 * Headshot URLs point at ESPN CDN (same pattern as early NFL before R2 mirror).
 *
 *   node scripts/sync-cfb-players.mjs --target=test
 *   node scripts/sync-cfb-players.mjs --target=test --limit-teams=5
 *   npm run cfb:players:sync
 *
 * Requires: migration 20260925200000_cfb_players + SUPABASE service role.
 * Catalog: run npm run cfb:teams:assets first (cfbTeamCatalog.generated.js).
 */
import { createClient } from '@supabase/supabase-js'
import { CFB_TEAM_CATALOG } from '../src/features/lounge/cfbTeamCatalog.generated.js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const UA = 'EdgeTiltCfbPlayers/1.0'
const CONCURRENCY = 4
const UPSERT_CHUNK = 200

function parseArgs(argv) {
  const out = { target: 'test', limitTeams: 0 }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--limit-teams=')) {
      out.limitTeams = Number(arg.slice('--limit-teams='.length)) || 0
    }
  }
  return out
}

function headshotUrl(espnId) {
  const id = String(espnId || '').replace(/[^0-9]/g, '')
  if (!id) return null
  return `https://a.espncdn.com/i/headshots/college-football/players/full/${id}.png`
}

async function fetchRoster(teamEspnId) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${teamEspnId}/roster`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) return { ok: false, status: res.status, athletes: [] }
  const pack = await res.json()
  const athletes = []
  for (const group of pack.athletes || []) {
    for (const a of group.items || []) athletes.push(a)
  }
  // Some payloads put athletes at top level
  if (!athletes.length && Array.isArray(pack.athletes)) {
    for (const a of pack.athletes) {
      if (a && a.id && !a.items) athletes.push(a)
    }
  }
  return { ok: true, athletes }
}

function rowFromAthlete(a, team) {
  const espnId = String(a.id || '').trim()
  if (!espnId) return null
  const fullName = String(a.displayName || a.fullName || '').trim()
  if (!fullName) return null
  const pos = a.position && typeof a.position === 'object'
    ? String(a.position.abbreviation || a.position.name || '').trim()
    : ''
  const href = a.headshot && typeof a.headshot === 'object'
    ? String(a.headshot.href || '').trim()
    : ''
  return {
    espn_id: espnId,
    full_name: fullName,
    first_name: String(a.firstName || '').trim() || null,
    last_name: String(a.lastName || '').trim() || null,
    position: pos || null,
    jersey: a.jersey != null ? String(a.jersey) : null,
    team_abbrev: team.abbrev,
    team_espn_id: String(team.espn),
    school: team.school || null,
    headshot_url: href || headshotUrl(espnId),
    local_headshot_path: null,
    status: a.status && typeof a.status === 'object'
      ? String(a.status.name || a.status.type || '').trim() || null
      : null,
    updated_at: new Date().toISOString(),
  }
}

async function mapPool(items, limit, fn) {
  const out = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i
      i += 1
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv(args.target)
  const { url, key } = readSupabaseCredentials()
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  let teams = [...CFB_TEAM_CATALOG]
  if (args.limitTeams > 0) teams = teams.slice(0, args.limitTeams)
  console.log(`CFB players sync  target=${args.target}  teams=${teams.length}`)

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const allRows = []
  let rosterFails = 0

  await mapPool(teams, CONCURRENCY, async (team) => {
    const { ok, status, athletes } = await fetchRoster(team.espn)
    if (!ok) {
      rosterFails += 1
      console.warn(`roster fail ${team.abbrev} espn=${team.espn} status=${status}`)
      return
    }
    for (const a of athletes) {
      const row = rowFromAthlete(a, team)
      if (row) allRows.push(row)
    }
    process.stdout.write('.')
  })
  console.log(`\nathletes=${allRows.length}  rosterFails=${rosterFails}`)

  let upserted = 0
  for (let i = 0; i < allRows.length; i += UPSERT_CHUNK) {
    const chunk = allRows.slice(i, i + UPSERT_CHUNK)
    const { error } = await supabase.from('cfb_players').upsert(chunk, { onConflict: 'espn_id' })
    if (error) throw new Error(`upsert: ${error.message}`)
    upserted += chunk.length
    console.log(`upserted ${upserted}/${allRows.length}`)
  }
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
