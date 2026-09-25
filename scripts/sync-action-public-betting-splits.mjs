#!/usr/bin/env node
/**
 * Pull Action Network public betting (ticket % / handle %) → syndicate_betting_splits.
 *
 * Residential / home-PC cron (same idea as MTTDB). Prefer API v2 JSON; HTML
 * __NEXT_DATA__ fallback if needed. Upserts source=action_pro only (VSiN paste stays).
 *
 * Usage:
 *   node scripts/sync-action-public-betting-splits.mjs --target=test
 *   node scripts/sync-action-public-betting-splits.mjs --target=test --dry-run
 *   node scripts/sync-action-public-betting-splits.mjs --target=both
 *   node scripts/sync-action-public-betting-splits.mjs --target=production --sport=nfl
 *   npm run syndicate:sync-action-splits:test
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  targetHuman,
} from './lib/supabaseEnv.mjs'
import {
  ACTION_SPORTS,
  fetchActionPublicBettingRows,
} from './lib/actionNetworkPublicBetting.mjs'

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  /** @type {Array<'nfl' | 'ncaaf'>} */
  let sports = ['nfl', 'ncaaf']
  let preferHtml = false
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--prefer-html') preferHtml = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--sport=')) {
      const s = arg.slice('--sport='.length).toLowerCase()
      if (s !== 'nfl' && s !== 'ncaaf') throw new Error('--sport must be nfl or ncaaf')
      sports = [s]
    }
  }
  if (target !== 'test' && target !== 'production' && target !== 'both') {
    throw new Error('--target must be test, production, or both')
  }
  return { target, dryRun, sports, preferHtml }
}

async function upsertRows(supabase, rows, { dryRun, label }) {
  let saved = 0
  let skipped = 0
  for (const raw of rows) {
    const p = {
      sport_key: raw.sport_key,
      event_id: null,
      home_team: raw.home_team,
      away_team: raw.away_team,
      commence_time: raw.commence_time,
      home_ticket_pct: raw.home_ticket_pct,
      home_handle_pct: raw.home_handle_pct,
      away_ticket_pct: raw.away_ticket_pct,
      away_handle_pct: raw.away_handle_pct,
      over_ticket_pct: raw.over_ticket_pct,
      over_handle_pct: raw.over_handle_pct,
      source: 'action_pro',
      notes: raw.notes,
      active: true,
      updated_at: new Date().toISOString(),
    }
    if (!p.home_team || !p.away_team) {
      skipped += 1
      continue
    }
    if (dryRun) {
      console.log(
        `[action-splits] dry ${label} ${p.away_team} @ ${p.home_team} ` +
          `t ${p.away_ticket_pct}/${p.home_ticket_pct} m ${p.away_handle_pct}/${p.home_handle_pct}` +
          (p.over_ticket_pct != null ? ` ou ${p.over_ticket_pct}/${p.over_handle_pct}` : ''),
      )
      saved += 1
      continue
    }

    const { error: deactErr } = await supabase
      .from('syndicate_betting_splits')
      .update({ active: false, updated_at: p.updated_at })
      .eq('sport_key', p.sport_key)
      .eq('home_team', p.home_team)
      .eq('away_team', p.away_team)
      .eq('source', 'action_pro')
      .eq('active', true)
    if (deactErr) throw deactErr

    const { error: insErr } = await supabase.from('syndicate_betting_splits').insert(p)
    if (insErr) throw insErr
    saved += 1
  }
  return { saved, skipped }
}

async function runForTarget(target, sports, { dryRun, preferHtml }) {
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  console.log(`[action-splits] target=${targetHuman(target)} sports=${sports.join(',')}`)

  let totalSaved = 0
  for (const sport of sports) {
    if (!ACTION_SPORTS[sport]) continue
    const board = await fetchActionPublicBettingRows(sport, { preferHtml })
    console.log(
      `[action-splits] ${sport} source=${board.source} games=${board.gameCount} rows=${board.rows.length}`,
    )
    const { saved, skipped } = await upsertRows(supabase, board.rows, {
      dryRun,
      label: `${target}/${sport}`,
    })
    console.log(`[action-splits] ${sport} saved=${saved} skipped=${skipped}${dryRun ? ' (dry)' : ''}`)
    totalSaved += saved
  }
  return totalSaved
}

async function main() {
  const { target, dryRun, sports, preferHtml } = parseArgs(process.argv)
  const targets = target === 'both' ? ['test', 'production'] : [target]
  let sum = 0
  for (const t of targets) {
    sum += await runForTarget(t, sports, { dryRun, preferHtml })
  }
  console.log(`[action-splits] done saved=${sum}${dryRun ? ' (dry)' : ''}`)
}

main().catch((err) => {
  console.error('[action-splits] FATAL', err)
  process.exit(1)
})
