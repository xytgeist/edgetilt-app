#!/usr/bin/env node
/**
 * Sherdog result tape for odds-board names UFC Stats does not list.
 * Does not fill takedown or sig-strike counts. Does not touch a real UFC Stats row.
 *
 *   node scripts/sync-ufc-sherdog-last5.mjs --target=test --ensure="Bryce Meredith"
 *   npm run syndicate:sync-ufc-sherdog:production -- --ensure="Bryce Meredith"
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import { normSherdogName, scrapeSherdogFighter } from './lib/sherdogScrape.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  const ensure = []
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg === '--ensure' || arg.startsWith('--ensure=')) {
      const bits = arg.startsWith('--ensure=') ? [arg.slice('--ensure='.length)] : []
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        i += 1
        bits.push(args[i])
      }
      ensure.push(
        ...bits.join(' ').split(',').map((s) => s.trim()).filter(Boolean),
      )
    }
  }
  if (target !== 'test' && target !== 'production') throw new Error('--target must be test or production')
  if (!ensure.length) throw new Error('--ensure="Name" is required')
  return { target, dryRun, ensure }
}

async function main() {
  const { target, dryRun, ensure } = parseArgs(process.argv)
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  console.log(`[sherdog] ${targetHuman(target)} names=${ensure.length}${dryRun ? ' dry-run' : ''}`)

  let wrote = 0
  let skipped = 0
  let failed = 0

  for (const name of ensure) {
    try {
      const tape = await scrapeSherdogFighter(name)
      console.log(
        `[sherdog] ${tape.fighterName} (${tape.division}) fights=${tape.fightCount} ${tape.wins}-${tape.losses} subW=${tape.subWins} koW=${tape.koWins}`,
      )
      if (tape.fightCount < 1) throw new Error('empty pro history')

      const { data: existing, error: loadErr } = await supabase
        .from('ufc_fighter_metrics')
        .select('id, fighter_name, career_measured')
        .ilike('fighter_name', tape.fighterName)
        .maybeSingle()
      if (loadErr) throw loadErr

      if (existing?.career_measured !== false && existing) {
        console.log(`[sherdog] skip ${existing.fighter_name} (already a measured UFC Stats row)`)
        skipped += 1
        continue
      }

      if (dryRun) {
        wrote += 1
        continue
      }

      let fighterId = existing?.id || null
      if (!fighterId) {
        const { data: inserted, error: insErr } = await supabase
          .from('ufc_fighter_metrics')
          .insert({
            fighter_name: tape.fighterName,
            division: tape.division || 'Unknown',
            stance: 'Orthodox',
            career_measured: false,
            is_custom_override: true,
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        fighterId = inserted.id
      }

      const syncedAt = new Date().toISOString()
      const { error: upErr } = await supabase.from('ufc_fighter_last5').upsert(
        {
          fighter_metrics_id: fighterId,
          fighter_name: tape.fighterName,
          fight_count: tape.fightCount,
          wins: tape.wins,
          losses: tape.losses,
          ko_wins: tape.koWins,
          sub_wins: tape.subWins,
          dec_wins: tape.decWins,
          td_landed: 0,
          sig_str_landed: 0,
          rounds_fought: tape.roundsFought,
          distance_fights: tape.distanceFights,
          fights: tape.fights,
          counts_measured: false,
          tape_source: 'sherdog',
          source_synced_at: syncedAt,
          updated_at: syncedAt,
        },
        { onConflict: 'fighter_metrics_id' },
      )
      if (upErr) throw upErr

      if (normSherdogName(name) !== normSherdogName(tape.fighterName)) {
        const { error: aliasErr } = await supabase.from('ufc_fighter_aliases').upsert(
          {
            fighter_metrics_id: fighterId,
            source: 'manual',
            alias: name,
            alias_norm: normSherdogName(name),
          },
          { onConflict: 'source,alias_norm' },
        )
        if (aliasErr) throw aliasErr
      }
      wrote += 1
    } catch (err) {
      failed += 1
      console.warn(`[sherdog] FAIL ${name}: ${err.message || err}`)
    }
  }

  console.log(`[sherdog] done wrote=${wrote} skipped=${skipped} failed=${failed}`)
  if (failed > 0 && wrote === 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[sherdog]', err)
  process.exit(1)
})
