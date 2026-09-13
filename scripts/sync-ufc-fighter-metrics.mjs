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
 *   node scripts/sync-ufc-fighter-metrics.mjs --target=test --cards-only
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
  scrapeUfcStatsEventCard,
  normUfcStatsName,
  normUfcAlias,
} from './lib/ufcStatsScrape.mjs'
import { UFC_STATS_NAME_ALIASES, UFC_MANUAL_BOARD_ALIASES } from './lib/ufcStatsNameAliases.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  let cardsOnly = false
  let limit = 0
  let completedLimit = 3
  const ensure = []
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--cards-only') cardsOnly = true
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
  return { target, dryRun, cardsOnly, limit, completedLimit, ensure }
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

async function collectCards(jar, byUrl, completedLimit) {
  const eventUrls = await listUfcStatsEventUrls(jar, { completedLimit, delayMs: 350 })
  console.log(`[ufc-metrics] card events=${eventUrls.length}`)
  const cards = []
  /** @type {Map<string, { name: string, url: string, division: string | null }>} */
  const byNorm = new Map()
  for (const eventUrl of eventUrls) {
    const card = await scrapeUfcStatsEventCard(jar, eventUrl, { byUrl })
    cards.push(card)
    console.log(
      `[ufc-metrics]   ${card.eventName || eventUrl.split('/').pop()} fights=${card.fights.length} venue=${card.venue || '?'} apex=${card.isApex}`,
    )
    for (const fight of card.fights) {
      for (const f of [
        { name: fight.fighterA, url: fight.fighterAUrl, division: fight.division },
        { name: fight.fighterB, url: fight.fighterBUrl, division: fight.division },
      ]) {
        const key = normUfcStatsName(f.name)
        if (!key) continue
        if (!byNorm.has(key)) byNorm.set(key, f)
      }
    }
  }
  return { cards, cardFighters: [...byNorm.values()] }
}

async function upsertAlias(supabase, dryRun, fighterId, source, alias) {
  const aliasNorm = normUfcAlias(alias)
  if (!fighterId || !aliasNorm) return
  if (dryRun) return
  const { error } = await supabase.from('ufc_fighter_aliases').upsert(
    {
      fighter_metrics_id: fighterId,
      source,
      alias,
      alias_norm: aliasNorm,
    },
    { onConflict: 'source,alias_norm' },
  )
  if (error) throw error
}

async function upsertCardFacts(supabase, dryRun, cards, roster, syncedAt) {
  let fights = 0
  let mismatches = 0
  for (const card of cards) {
    for (let i = 0; i < card.fights.length; i += 1) {
      const fight = card.fights[i]
      const row = {
        event_url: card.eventUrl,
        event_name: card.eventName || '',
        venue: card.venue || '',
        is_apex: Boolean(card.isApex),
        fight_index: i,
        fighter_a: fight.fighterA,
        fighter_b: fight.fighterB,
        fighter_a_url: fight.fighterAUrl,
        fighter_b_url: fight.fighterBUrl,
        fighter_a_norm: normUfcAlias(fight.fighterA),
        fighter_b_norm: normUfcAlias(fight.fighterB),
        division: fight.division,
        scheduled_rounds: fight.scheduledRounds,
        source_synced_at: syncedAt,
        updated_at: syncedAt,
      }
      fights += 1
      if (!dryRun) {
        const { error } = await supabase
          .from('ufc_card_fights')
          .upsert(row, { onConflict: 'event_url,fight_index' })
        if (error) throw error
      }
      for (const name of [fight.fighterA, fight.fighterB]) {
        const hit = findExisting(roster, name, null)
        if (hit) {
          await upsertAlias(supabase, dryRun, hit.id, 'ufcstats', hit.fighter_name)
          await upsertAlias(supabase, dryRun, hit.id, 'ufcstats', name)
        } else {
          mismatches += 1
          if (!dryRun) {
            const { error } = await supabase.from('ufc_fighter_name_mismatches').upsert(
              {
                raw_name: name,
                raw_norm: normUfcAlias(name),
                source: 'ufcstats',
                event_url: card.eventUrl,
                last_seen_at: syncedAt,
              },
              { onConflict: 'source,raw_norm' },
            )
            if (error) throw error
          }
        }
      }
    }
  }

  for (const [official, extras] of Object.entries(UFC_MANUAL_BOARD_ALIASES)) {
    const hit = findExisting(roster, official, null)
    if (!hit) continue
    await upsertAlias(supabase, dryRun, hit.id, 'manual', official)
    for (const extra of extras) {
      await upsertAlias(supabase, dryRun, hit.id, 'manual', extra)
    }
  }

  console.log(`[ufc-metrics] card fights upserted=${fights} name mismatches=${mismatches}`)
}

function findExisting(roster, name, url) {
  const key = normUfcStatsName(name)
  const byName = roster.find((row) => normUfcStatsName(row.fighter_name) === key)
  if (byName) return byName
  if (url) return roster.find((row) => row.ufcstats_url === url) || null
  return null
}

async function main() {
  const { target, dryRun, cardsOnly, limit, completedLimit, ensure } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)

  console.log(`[ufc-metrics] Opening UFC Stats session (${targetHuman(target)})…`)
  const jar = await openUfcStatsSession()

  let byNormName = null
  let byUrl = null
  if (!cardsOnly) {
    console.log('[ufc-metrics] Building fighter name index (a–z)…')
    const index = await buildUfcStatsNameIndex(jar, { delayMs: 350 })
    byNormName = index.byNormName
    byUrl = index.byUrl
    console.log(`[ufc-metrics] index size=${byNormName.size}`)
  } else {
    console.log('[ufc-metrics] cards-only … skipping a–z index')
    byUrl = new Map()
  }

  const { data: existing, error: loadErr } = await supabase
    .from('ufc_fighter_metrics')
    .select('id, fighter_name, division, is_custom_override, ufcstats_url')
    .order('fighter_name', { ascending: true })
  if (loadErr) throw loadErr

  let roster = existing || []
  console.log(`[ufc-metrics] roster=${roster.length}`)

  const { cards, cardFighters } = await collectCards(jar, byUrl, completedLimit)
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

  try {
    await upsertCardFacts(supabase, dryRun, cards, roster, syncedAt)
  } catch (err) {
    console.warn(`[ufc-metrics] card facts skipped: ${err.message || err}`)
  }

  if (cardsOnly) {
    console.log(`[ufc-metrics] cards-only done${dryRun ? ' (dry-run)' : ''}`)
    return
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
