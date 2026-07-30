/**
 * Upsert Live tournament catalog rows (source=catalog) for the poker Start/Log picker.
 *
 * Usage:
 *   npm run poker:catalog:seed:test
 *   npm run poker:catalog:seed:test:dry
 *   node scripts/seed-poker-tournament-catalog.mjs --target=test --file=supabase/seed/poker_tournament_catalog_ca.json
 *
 * Prefer `npm run poker:catalog:sync:test` for all regions + optional Wynn series fetch.
 */

import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, createSupabaseServiceClient, targetHuman } from './lib/supabaseEnv.mjs'
import { buildCatalogUpsertRowsFromPayloads, loadCatalogSeedFiles, repoRootFromCatalogLib } from './lib/pokerTournamentCatalog.mjs'

const repoRoot = repoRootFromCatalogLib

function parseArgs(argv) {
  let target = 'test'
  let dryRun = false
  /** @type {string | null} */
  let file = null
  let noPrune = false
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--no-prune') noPrune = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--file=')) file = path.resolve(repoRoot, arg.slice('--file='.length))
  }
  return { target, dryRun, file, noPrune }
}

async function main() {
  const { target, dryRun, file, noPrune } = parseArgs(process.argv)
  loadSupabaseEnv(target)

  const { paths, payloads } = loadCatalogSeedFiles(file)
  if (!payloads.length) {
    console.error('No catalog seed files found.')
    process.exit(1)
  }

  const rows = buildCatalogUpsertRowsFromPayloads(payloads)
  if (!rows.length) {
    console.error('No valid catalog rows to upsert.')
    process.exit(1)
  }

  console.log(`Target: ${targetHuman(target)}`)
  console.log(`Files: ${paths.map((p) => path.relative(repoRoot, p)).join(', ')}`)
  console.log(`Rows: ${rows.length}${dryRun ? ' (dry run)' : ''}`)

  if (dryRun) {
    for (const row of rows.slice(0, 5)) {
      console.log('  sample:', row.external_id, row.event_date, row.starts_at || '—', row.venue_name, row.buy_in)
    }
    if (rows.length > 5) console.log(`  … +${rows.length - 5} more`)
    return
  }

  const supabase = createSupabaseServiceClient(createClient)
  const { data, error } = await supabase.rpc('upsert_poker_tournament_catalog', {
    p_rows: rows,
    p_prune_past: !noPrune,
  })

  if (error) {
    console.error('upsert_poker_tournament_catalog failed:', error.message)
    process.exit(1)
  }

  console.log('Done:', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export { buildCatalogUpsertRowsFromPayloads } from './lib/pokerTournamentCatalog.mjs'
