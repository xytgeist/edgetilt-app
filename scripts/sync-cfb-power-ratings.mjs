#!/usr/bin/env node
/**
 * Sync CFB Elo/SRS power board from CollegeFootballData into public.cfb_team_power_ratings.
 * Skips is_custom_override rows. Requires CFBD_API_KEY in env / .env.supabase.{target}.
 *
 * Usage:
 *   node scripts/sync-cfb-power-ratings.mjs --target=test
 *   node scripts/sync-cfb-power-ratings.mjs --target=test --dry-run
 *   npm run syndicate:sync-cfb-power:test
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import { buildCfbPowerBoard } from './lib/cfbPowerRatingsFromCfbd.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  /** @type {number | null} */
  let season = null
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--season=')) season = Number(arg.slice('--season='.length))
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  return { target, dryRun, season }
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Map CFBD school name onto an existing DB team_name when possible
 * (e.g. "Indiana" → "Indiana Hoosiers") so we do not fork duplicate rows.
 */
function resolveExistingTeamName(cfbdName, abbr, existing) {
  const nk = normKey(cfbdName)
  const abbrU = String(abbr || '').toUpperCase()
  for (const row of existing) {
    if (abbrU && String(row.team_abbr || '').toUpperCase() === abbrU) return row.team_name
  }
  for (const row of existing) {
    if (normKey(row.team_name) === nk) return row.team_name
  }
  for (const row of existing) {
    const rn = normKey(row.team_name)
    if (nk.length >= 4 && (rn === nk || rn.startsWith(nk + ' ') || rn.startsWith(nk))) {
      return row.team_name
    }
  }
  return cfbdName
}

async function main() {
  const { target, dryRun, season } = parseArgs(process.argv)
  loadSupabaseEnv(target)

  const apiKey = process.env.CFBD_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'Missing CFBD_API_KEY. Get a free key at https://collegefootballdata.com/key and add it to .env.supabase.test / .env.supabase.production (and GitHub Actions secrets for cron).',
    )
  }

  const year = season ?? new Date().getFullYear()
  console.log(`[cfb-power] Building FPI/SP+ board for ${year} (${targetHuman(target)})…`)
  const result = await buildCfbPowerBoard({ apiKey, season: year })
  console.log(
    `[cfb-power] FPI year=${result.fpiYear} SP year=${result.spYear} games=${result.gameCount} (season=${result.seasonGameCount}) teams=${result.board.length}`,
  )
  console.log('[cfb-power] top 10:')
  for (const row of result.board.slice(0, 10)) {
    console.log(
      `  ${String(row.power_rating).padStart(5)}  ${row.team_name} (FPI ${row.fpi ?? '—'} / SP ${row.sp ?? '—'} · off ${row.off_rating} / def ${row.def_rating} · HFA ${row.home_field_advantage} · tempo ${row.tempo_rating})`,
    )
  }

  const supabase = createSupabaseServiceClient(createClient)
  const { data: existing, error: loadErr } = await supabase
    .from('cfb_team_power_ratings')
    .select('team_name, team_abbr, is_custom_override')
  if (loadErr) throw loadErr

  const existingList = existing || []
  const overrideSet = new Set(
    existingList.filter((r) => r.is_custom_override).map((r) => r.team_name),
  )

  const rows = []
  for (const b of result.board) {
    const team_name = resolveExistingTeamName(b.team_name, b.team_abbr, existingList)
    if (overrideSet.has(team_name)) {
      console.log(`[cfb-power] skip ${team_name} (custom override)`)
      continue
    }
    const prior = existingList.find((r) => r.team_name === team_name)
    rows.push({
      team_name,
      team_abbr: prior?.team_abbr || b.team_abbr,
      conference: b.conference,
      power_rating: b.power_rating,
      off_rating: b.off_rating,
      def_rating: b.def_rating,
      tempo_rating: b.tempo_rating,
      home_field_advantage: b.home_field_advantage,
      updated_at: new Date().toISOString(),
    })
  }

  if (dryRun) {
    console.log(`[cfb-power] dry-run: would upsert ${rows.length} rows`)
    return
  }

  // Upsert in chunks (unique on team_name)
  const chunkSize = 50
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('cfb_team_power_ratings').upsert(chunk, {
      onConflict: 'team_name',
    })
    if (error) throw error
  }
  console.log(`[cfb-power] upserted ${rows.length} rows on ${targetHuman(target)}`)
}

main().catch((err) => {
  console.error('[cfb-power] FAILED:', err.message || err)
  process.exit(1)
})
