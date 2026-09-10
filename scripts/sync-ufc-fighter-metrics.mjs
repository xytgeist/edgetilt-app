#!/usr/bin/env node
/**
 * Sync public.ufc_fighter_metrics from live UFC Stats (ufcstats.com).
 * Updates existing rows (skips is_custom_override). Inserts anyone on
 * upcoming + recent UFC cards who is not on the roster yet.
 *
 * Usage:
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test --dry-run
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test --ensure="Paddy Pimblett"
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
  listUfcStatsEventUrls,
  scrapeUfcStatsEventFighters,
  normUfcStatsName,
} from './lib/ufcStatsScrape.mjs'
import { UFC_STATS_NAME_ALIASES } from './lib/ufcStatsNameAliases.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  let limit = 0
  let completedLimit = 3
  const ensure = []
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length)) || 0
    else if (arg.startsWith('--completed=')) completedLimit = Number(arg.slice('--completed='.length)) || 0
    else if (arg === '--ensure' || arg.startsWith('--ensure=')) {
      const bits = arg.startsWith('--ensure=') ? [arg.slice('--ensure='.length)] : []
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        i += 1
        bits.push(args[i])
      }
      ensure.push(
        ...bits
          .join(' ')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    }
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  return { target, dryRun, limit, completedLimit, ensure }
}

function metricsPatch(metrics, url, syncedAt, division) {
  return {
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
    ...(division ? { division } : {}),
  }
}

async function collectCardFighters(jar, byUrl, completedLimit) {
  const eventUrls = await listUfcStatsEventUrls(jar, { completedLimit, delayMs: 350 })
  console.log(`[ufc-metrics] card events=${eventUrls.length}`)
  /** @type {Map<string, { name: string, url: string, division: string | null }>} */
  const byNorm = new Map()
  for (const eventUrl of eventUrls) {
    const fighters = await scrapeUfcStatsEventFighters(jar, eventUrl, { byUrl })
    console.log(`[ufc-metrics]   ${eventUrl.split('/').pop()} fighters=${fighters.length}`)
    for (const f of fighters) {
      const key = normUfcStatsName(f.name)
      if (!key) continue
      if (!byNorm.has(key)) byNorm.set(key, f)
    }
  }
  return [...byNorm.values()]
}

function findExisting(roster, name, url) {
  const key = normUfcStatsName(name)
  const byName = roster.find((row) => normUfcStatsName(row.fighter_name) === key)
  if (byName) return byName
  if (url) return roster.find((row) => row.ufcstats_url === url) || null
  return null
}

async function main() {
  const { target, dryRun, limit, completedLimit, ensure } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)

  console.log(`[ufc-metrics] Opening UFC Stats session (${targetHuman(target)})…`)
  const jar = await openUfcStatsSession()

  console.log('[ufc-metrics] Building fighter name index (a–z)…')
  const { byNormName, byUrl } = await buildUfcStatsNameIndex(jar, { delayMs: 350 })
  console.log(`[ufc-metrics] index size=${byNormName.size}`)

  const { data: existing, error: loadErr } = await supabase
    .from('ufc_fighter_metrics')
    .select('id, fighter_name, division, is_custom_override, ufcstats_url')
    .order('fighter_name', { ascending: true })
  if (loadErr) throw loadErr

  let roster = existing || []
  console.log(`[ufc-metrics] roster=${roster.length}`)

  const cardFighters = await collectCardFighters(jar, byUrl, completedLimit)
  const wantedNew = []
  const seenWanted = new Set()
  for (const f of cardFighters) {
    const key = normUfcStatsName(f.name)
    if (seenWanted.has(key)) continue
    if (findExisting(roster, f.name, f.url)) continue
    seenWanted.add(key)
    wantedNew.push(f)
  }
  for (const name of ensure) {
    const key = normUfcStatsName(name)
    if (seenWanted.has(key)) continue
    if (findExisting(roster, name, null)) continue
    seenWanted.add(key)
    wantedNew.push({ name, url: null, division: null })
  }

  const syncedAt = new Date().toISOString()
  let inserted = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const f of wantedNew) {
    try {
      const lookupName = UFC_STATS_NAME_ALIASES[f.name] || f.name
      const { url, metrics } = await scrapeUfcStatsFighterByName(jar, lookupName, f.url, {
        nameIndex: byNormName,
        delayMs: 650,
      })
      const officialName = metrics.fighter_name || f.name
      if (findExisting(roster, officialName, url)) {
        console.log(`[ufc-metrics] skip insert ${officialName} (already on roster as alias)`)
        skipped += 1
        continue
      }
      const row = {
        fighter_name: officialName,
        division: metrics.division || f.division || 'Lightweight',
        is_custom_override: false,
        ...metricsPatch(metrics, url, syncedAt),
      }
      console.log(
        `[ufc-metrics] INSERT ${row.fighter_name} (${row.division}): SLpM ${row.slpm} SApM ${row.sapm} TD ${row.td_avg}`,
      )
      if (!dryRun) {
        const { data, error } = await supabase.from('ufc_fighter_metrics').insert(row).select('id, fighter_name, division, is_custom_override, ufcstats_url').single()
        if (error) throw error
        roster.push(data)
      } else {
        roster.push({
          id: `dry-${officialName}`,
          fighter_name: officialName,
          division: row.division,
          is_custom_override: false,
          ufcstats_url: url,
        })
      }
      inserted += 1
    } catch (err) {
      failed += 1
      console.warn(`[ufc-metrics] INSERT FAIL ${f.name}: ${err.message || err}`)
    }
  }

  let refresh = roster
  if (limit > 0) refresh = roster.slice(0, limit)
  console.log(`[ufc-metrics] refresh=${refresh.length} (skipping custom overrides)`)

  for (const row of refresh) {
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
        { nameIndex: byNormName, delayMs: 650 },
      )
      const patch = metricsPatch(metrics, url, syncedAt, metrics.division || null)
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
    `[ufc-metrics] done${dryRun ? ' (dry-run)' : ''}: inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failed}`,
  )
  if (failed > 0 && inserted === 0 && updated === 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[ufc-metrics]', err)
  process.exit(1)
})
