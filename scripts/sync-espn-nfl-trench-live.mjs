#!/usr/bin/env node
/**
 * Live ESPN Analytics NFL trench win rates → public.nfl_team_metrics.
 * Skips is_custom_override. Does not touch EPA / success_rate.
 *
 * Usage:
 *   node scripts/sync-espn-nfl-trench-live.mjs --target=test
 *   node scripts/sync-espn-nfl-trench-live.mjs --target=both --dry-run
 *   node scripts/sync-espn-nfl-trench-live.mjs --target=both --force
 *   ESPN_NFL_TRENCH_STORY_ID=49742016 npm run syndicate:sync-espn-trench:both
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import {
  fetchEspnTeamWinRateBoardIfChanged,
  writeEspnTrenchLiveState,
} from './lib/espnNflTeamWinRatesLive.mjs'
import {
  SYNDICATE_ESPN_TRENCH_SYNC_JOB_ID,
  recordSyndicateHomePcHeartbeatForTarget,
} from './lib/opsJobHeartbeat.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  let force = false
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--force') force = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
  }
  if (target !== 'test' && target !== 'production' && target !== 'both') {
    throw new Error('--target must be test, production, or both')
  }
  return { target, dryRun, force }
}

async function applyBoard(supabase, board, { dryRun, label }) {
  const abbrs = Object.keys(board.teams)
  if (abbrs.length !== 32) {
    throw new Error(`Expected 32 teams, got ${abbrs.length}`)
  }

  const { data: existing, error: loadErr } = await supabase
    .from('nfl_team_metrics')
    .select('team_abbr, is_custom_override')
  if (loadErr) throw loadErr

  const overrideSet = new Set(
    (existing || []).filter((r) => r.is_custom_override).map((r) => r.team_abbr),
  )

  const now = new Date().toISOString()
  let updated = 0
  let skipped = 0

  for (const abbr of abbrs.sort()) {
    if (overrideSet.has(abbr)) {
      console.log(`[espn-trench] ${label} skip ${abbr} (custom override)`)
      skipped += 1
      continue
    }
    const t = board.teams[abbr]
    const patch = {
      pass_block_win_rate: t.pbwr,
      pass_rush_win_rate: t.prwr,
      run_block_win_rate: t.rbwr,
      run_stop_win_rate: t.rswr,
      updated_at: now,
    }
    if (dryRun) {
      console.log(
        `[espn-trench] dry ${label} ${abbr.padEnd(3)} PBWR=${t.pbwr} PRWR=${t.prwr} RBWR=${t.rbwr} RSWR=${t.rswr}`,
      )
      updated += 1
      continue
    }
    const { error: updErr } = await supabase
      .from('nfl_team_metrics')
      .update(patch)
      .eq('team_abbr', abbr)
    if (updErr) throw updErr
    updated += 1
  }

  return { updated, skipped }
}

async function heartbeatProd(argTarget, status, detail) {
  loadSupabaseEnv('production')
  const supabase = createSupabaseServiceClient(createClient)
  await recordSyndicateHomePcHeartbeatForTarget(
    supabase,
    argTarget,
    SYNDICATE_ESPN_TRENCH_SYNC_JOB_ID,
    status,
    detail,
  )
}

async function main() {
  const { target, dryRun, force } = parseArgs(process.argv)
  try {
    const { skip, reason, board } = await fetchEspnTeamWinRateBoardIfChanged({ force })

    console.log(
      `[espn-trench] story=${board.storyId} lastModified=${board.lastModified || '?'} ` +
        `through=${board.through || '?'} teams=${board.teamCount}`,
    )
    console.log(`[espn-trench] ${board.headline}`)

    if (skip) {
      console.log(`[espn-trench] skip write: ${reason}`)
      if (!dryRun) {
        await heartbeatProd(target, 'ok', {
          message: reason,
          skippedUnchanged: true,
          storyId: board.storyId,
          lastModified: board.lastModified,
          through: board.through,
          teams: board.teamCount,
        })
      }
      return
    }

    const targets = target === 'both' ? ['test', 'production'] : [target]
    let lastUpdated = 0
    let lastSkipped = 0
    for (const t of targets) {
      loadSupabaseEnv(t)
      const supabase = createSupabaseServiceClient(createClient)
      const { updated, skipped } = await applyBoard(supabase, board, {
        dryRun,
        label: targetHuman(t),
      })
      lastUpdated = updated
      lastSkipped = skipped
      console.log(
        `[espn-trench] ${targetHuman(t)} updated=${updated} skipped=${skipped}${dryRun ? ' (dry)' : ''}`,
      )
    }

    if (!dryRun) {
      writeEspnTrenchLiveState({
        storyId: board.storyId,
        lastModified: board.lastModified,
        through: board.through,
        headline: board.headline,
        pulledAt: new Date().toISOString(),
        teamCount: board.teamCount,
      })
      await heartbeatProd(target, 'ok', {
        message: `updated=${lastUpdated} skippedOverrides=${lastSkipped}`,
        storyId: board.storyId,
        lastModified: board.lastModified,
        through: board.through,
        teams: board.teamCount,
        updated: lastUpdated,
        skippedOverrides: lastSkipped,
        mirrored: targets,
      })
    }
    console.log('[espn-trench] done')
  } catch (err) {
    if (!dryRun) {
      try {
        await heartbeatProd(target, 'failed', {
          message: err?.message || String(err),
        })
      } catch {
        /* best-effort */
      }
    }
    throw err
  }
}

main().catch((err) => {
  console.error('[espn-trench] FATAL', err)
  process.exit(1)
})
