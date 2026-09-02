#!/usr/bin/env node
/**
 * Sync real NFL Off/Def EPA + success rate from nflverse into public.nfl_team_metrics.
 * Skips rows with is_custom_override = true. Does not invent trench win rates.
 *
 * Usage:
 *   node scripts/sync-nfl-team-metrics.mjs --target=test
 *   node scripts/sync-nfl-team-metrics.mjs --target=test --dry-run
 *   node scripts/sync-nfl-team-metrics.mjs --target=test --year=2025
 *   npm run syndicate:sync-nfl-metrics:test
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import {
  NFL_TEAM_META,
  computeNflEpaWithFallback,
} from './lib/nflTeamMetricsFromPbp.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  /** @type {number | null} */
  let year = null
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--year=')) year = Number(arg.slice('--year='.length))
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  if (year != null && !Number.isFinite(year)) {
    throw new Error('--year must be a number')
  }
  return { target, dryRun, year }
}

async function main() {
  const { target, dryRun, year } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)

  console.log(`[nfl-metrics] Computing EPA from nflverse (${targetHuman(target)})…`)
  const result = await computeNflEpaWithFallback(year ?? new Date().getFullYear())
  const abbrs = Object.keys(result.teams)
  console.log(
    `[nfl-metrics] season=${result.year} teams=${abbrs.length} plays=${result.playCount}`,
  )

  const { data: existing, error: loadErr } = await supabase
    .from('nfl_team_metrics')
    .select('team_abbr, is_custom_override')
  if (loadErr) throw loadErr

  const overrideSet = new Set(
    (existing || []).filter((r) => r.is_custom_override).map((r) => r.team_abbr),
  )

  const rows = []
  for (const abbr of abbrs) {
    if (overrideSet.has(abbr)) {
      console.log(`[nfl-metrics] skip ${abbr} (custom override)`)
      continue
    }
    const meta = NFL_TEAM_META[abbr]
    const m = result.teams[abbr]
    rows.push({
      team_abbr: abbr,
      team_name: meta.team_name,
      conference: meta.conference,
      division: meta.division,
      off_epa_play: m.off_epa_play,
      def_epa_play: m.def_epa_play,
      success_rate: m.success_rate,
      updated_at: new Date().toISOString(),
    })
  }

  rows.sort((a, b) => b.off_epa_play - a.off_epa_play)
  console.log('[nfl-metrics] top 5 off EPA:')
  for (const r of rows.slice(0, 5)) {
    console.log(
      `  ${r.team_abbr.padEnd(3)} off=${r.off_epa_play} def=${r.def_epa_play} sr=${r.success_rate}%`,
    )
  }

  if (dryRun) {
    console.log(`[nfl-metrics] dry-run: would upsert ${rows.length} rows`)
    return
  }

  const { error: upsertErr } = await supabase.from('nfl_team_metrics').upsert(rows, {
    onConflict: 'team_abbr',
  })
  if (upsertErr) throw upsertErr
  console.log(`[nfl-metrics] upserted ${rows.length} rows on ${targetHuman(target)}`)
}

main().catch((err) => {
  console.error('[nfl-metrics] FAILED:', err.message || err)
  process.exit(1)
})
