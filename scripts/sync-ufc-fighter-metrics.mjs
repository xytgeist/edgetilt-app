#!/usr/bin/env node
/**
 * Sync public.ufc_fighter_metrics from live UFC Stats (ufcstats.com).
 * Skips is_custom_override rows. Stores ufcstats_url for faster re-syncs.
 *
 * Usage:
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test --dry-run
 *   npm run syndicate:sync-ufc-metrics:test
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import {
  openUfcStatsSession,
  buildUfcStatsNameIndex,
  scrapeUfcStatsFighterByName,
} from './lib/ufcStatsScrape.mjs'
import { UFC_STATS_NAME_ALIASES } from './lib/ufcStatsNameAliases.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  let limit = 0
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length)) || 0
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  return { target, dryRun, limit }
}

async function main() {
  const { target, dryRun, limit } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)

  console.log(`[ufc-metrics] Opening UFC Stats session (${targetHuman(target)})…`)
  const jar = await openUfcStatsSession()

  console.log('[ufc-metrics] Building fighter name index (a–z)…')
  const nameIndex = await buildUfcStatsNameIndex(jar, { delayMs: 350 })
  console.log(`[ufc-metrics] index size=${nameIndex.size}`)

  const { data: existing, error: loadErr } = await supabase
    .from('ufc_fighter_metrics')
    .select(
      'id, fighter_name, division, is_custom_override, ufcstats_url',
    )
    .order('fighter_name', { ascending: true })
  if (loadErr) throw loadErr

  let roster = existing || []
  if (limit > 0) roster = roster.slice(0, limit)
  console.log(`[ufc-metrics] roster=${roster.length} (skipping custom overrides)`)

  const syncedAt = new Date().toISOString()
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of roster) {
    if (row.is_custom_override) {
      console.log(`[ufc-metrics] skip ${row.fighter_name} (custom override)`)
      skipped += 1
      continue
    }
    try {
      const lookupName = UFC_STATS_NAME_ALIASES[row.fighter_name] || row.fighter_name
      const { url, metrics } = await scrapeUfcStatsFighterByName(
        jar,
        lookupName,
        row.ufcstats_url || null,
        { nameIndex, delayMs: 650 },
      )
      const patch = {
        reach_inches: metrics.reach_inches,
        stance: metrics.stance,
        slpm: metrics.slpm,
        sapm: metrics.sapm,
        str_acc: metrics.str_acc,
        str_def: metrics.str_def,
        td_avg: metrics.td_avg,
        td_acc: metrics.td_acc,
        td_def: metrics.td_def,
        sub_avg: metrics.sub_avg,
        finish_rate: metrics.finish_rate,
        ko_finish_rate: metrics.ko_finish_rate,
        sub_finish_rate: metrics.sub_finish_rate,
        ufcstats_url: url,
        source_synced_at: syncedAt,
        updated_at: syncedAt,
      }
      console.log(
        `[ufc-metrics] ${row.fighter_name}: SLpM ${metrics.slpm} SApM ${metrics.sapm} TD ${metrics.td_avg} finish ${metrics.finish_rate}% (${metrics.career_wins}W)`,
      )
      if (!dryRun) {
        const { error } = await supabase.from('ufc_fighter_metrics').update(patch).eq('id', row.id)
        if (error) throw error
      }
      updated += 1
    } catch (err) {
      failed += 1
      console.warn(`[ufc-metrics] FAIL ${row.fighter_name}: ${err.message || err}`)
    }
  }

  console.log(
    `[ufc-metrics] done${dryRun ? ' (dry-run)' : ''}: updated=${updated} skipped=${skipped} failed=${failed}`,
  )
  if (failed > 0 && updated === 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[ufc-metrics]', err)
  process.exit(1)
})
