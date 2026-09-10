#!/usr/bin/env node
/**
 * Write ESPN Analytics 2025 end-of-season PBWR / PRWR / RBWR / RSWR
 * onto public.nfl_team_metrics. Does not touch EPA or success_rate.
 * Skips is_custom_override rows. Pressure rates stay as stored.
 *
 * Usage:
 *   node scripts/sync-nfl-trench-win-rates.mjs --target=test
 *   node scripts/sync-nfl-trench-win-rates.mjs --target=test --dry-run
 *   npm run syndicate:sync-nfl-trench:test
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import { loadEspnNfl2025TeamWinRates } from './lib/espnNfl2025TeamWinRates.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  return { target, dryRun }
}

async function main() {
  const { target, dryRun } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  const board = loadEspnNfl2025TeamWinRates()
  const abbrs = Object.keys(board.teams)
  if (abbrs.length !== 32) {
    throw new Error(`Expected 32 teams, got ${abbrs.length}`)
  }

  console.log(
    `[nfl-trench] ESPN ${board.season} through ${board.through} (${targetHuman(target)})`,
  )

  const { data: existing, error: loadErr } = await supabase
    .from('nfl_team_metrics')
    .select('team_abbr, is_custom_override')
  if (loadErr) throw loadErr

  const overrideSet = new Set(
    (existing || []).filter((r) => r.is_custom_override).map((r) => r.team_abbr),
  )

  const now = new Date().toISOString()
  const rows = []
  for (const abbr of abbrs.sort()) {
    if (overrideSet.has(abbr)) {
      console.log(`[nfl-trench] skip ${abbr} (custom override)`)
      continue
    }
    const t = board.teams[abbr]
    rows.push({
      team_abbr: abbr,
      pass_block_win_rate: t.pbwr,
      pass_rush_win_rate: t.prwr,
      run_block_win_rate: t.rbwr,
      run_stop_win_rate: t.rswr,
      updated_at: now,
    })
  }

  console.log('[nfl-trench] board:')
  for (const r of rows) {
    console.log(
      `  ${r.team_abbr.padEnd(3)} PBWR=${r.pass_block_win_rate} PRWR=${r.pass_rush_win_rate} RBWR=${r.run_block_win_rate} RSWR=${r.run_stop_win_rate}`,
    )
  }

  if (dryRun) {
    console.log(`[nfl-trench] dry-run: would update ${rows.length} trench rows`)
    return
  }

  // Per-row UPDATE so we never insert a partial row or wipe EPA / success_rate.
  for (const r of rows) {
    const { error: updErr } = await supabase
      .from('nfl_team_metrics')
      .update({
        pass_block_win_rate: r.pass_block_win_rate,
        pass_rush_win_rate: r.pass_rush_win_rate,
        run_block_win_rate: r.run_block_win_rate,
        run_stop_win_rate: r.run_stop_win_rate,
        updated_at: r.updated_at,
      })
      .eq('team_abbr', r.team_abbr)
    if (updErr) throw updErr
  }
  console.log(`[nfl-trench] updated ${rows.length} rows on ${targetHuman(target)}`)
}

main().catch((err) => {
  console.error('[nfl-trench] FAILED:', err.message || err)
  process.exit(1)
})
