#!/usr/bin/env node
/**
 * PVAL v1 — Sleeper depth + weekly fantasy → position-band PVALs.
 *
 *   node scripts/pval-sleeper-sync.mjs --dry-run
 *   node scripts/pval-sleeper-sync.mjs --apply --target=test
 *   node scripts/pval-sleeper-sync.mjs --apply --refresh --target=test
 *   npm run syndicate:pval-sleeper:refresh:test
 *
 * Never overwrites is_custom_override = true rows.
 * CI uses service-role upsert (same secrets as NFL metrics sync).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { buildSleeperPvalRows } from './lib/pvalSleeperSync.mjs'
import {
  loadSupabaseEnv,
  createSupabaseServiceClient,
  repoRoot,
} from './lib/supabaseEnv.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPSERT_CHUNK = 200
const PAGE = 1000

/** PostgREST caps pages at ~1000; page through for full table reads. */
async function fetchAllRows(supabase, selectCols, { filter } = {}) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('nfl_player_pvals').select(selectCols).range(from, from + PAGE - 1)
    if (typeof filter === 'function') q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

function parseArgs(argv) {
  const out = {
    dryRun: true,
    target: 'test',
    week: null,
    season: null,
    outFile: null,
    refresh: false,
    protectExisting: null,
    noOut: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--apply') out.dryRun = false
    else if (a === '--refresh') out.refresh = true
    else if (a === '--protect') out.protectExisting = true
    else if (a === '--no-protect') out.protectExisting = false
    else if (a === '--no-out') out.noOut = true
    else if (a === '--target' || a === '-t') out.target = argv[++i]
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length)
    else if (a === '--week') out.week = Number(argv[++i])
    else if (a === '--season') out.season = argv[++i]
    else if (a === '--out') out.outFile = argv[++i]
  }
  if (!['test', 'production'].includes(out.target)) {
    throw new Error(`Invalid --target ${out.target}`)
  }
  // First fill may protect curated rows; weekly refresh skips re-protect unless --protect.
  if (out.protectExisting == null) out.protectExisting = !out.refresh
  return out
}

function printSummary(built) {
  console.log(`Sleeper season=${built.season} week=${built.week}`)
  console.log(`Players file ~${built.playerCount} · proposed PVAL rows ${built.rowCount}`)
  console.log('Band counts:', built.bandCounts)
  console.log('\nTop 15 by PVAL:')
  for (const r of built.rows.slice(0, 15)) {
    console.log(
      `  ${r.pval.toFixed(2).padStart(4)}  ${r.bandKey.padEnd(12)}  ${r.player_name} (${r.team_abbr}) depth=${r.depth_order ?? '-'} pts=${r.pts_ppr ?? '-'}`,
    )
  }
  console.log('\nSample WR1:')
  for (const r of built.rows.filter((x) => x.bandKey === 'wr1').slice(0, 8)) {
    console.log(`  ${r.pval.toFixed(2)}  ${r.player_name}  pts=${r.pts_ppr}  pct=${r.percentile}`)
  }
  console.log('\nSample starting_qb:')
  for (const r of built.rows.filter((x) => x.bandKey === 'starting_qb').slice(0, 8)) {
    console.log(`  ${r.pval.toFixed(2)}  ${r.player_name}  pts=${r.pts_ppr}  pct=${r.percentile}`)
  }
}

function rowPayload(r) {
  const now = new Date().toISOString()
  return {
    player_name: r.player_name,
    normalized_name: r.normalized_name,
    team_name: r.team_name,
    position: r.position,
    side: r.side,
    pval: r.pval,
    tier: r.tier,
    notes: r.notes,
    is_custom_override: false,
    last_synced_at: now,
    updated_at: now,
  }
}

async function applyRows(target, rows, { refresh = false, protectExisting = true } = {}) {
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)

  if (protectExisting) {
    const candidates = await fetchAllRows(supabase, 'id, notes, is_custom_override', {
      filter: (q) => q.eq('is_custom_override', false),
    })
    const toProtect = candidates.filter(
      (r) => !r.notes || !String(r.notes).startsWith('sleeper v1'),
    )
    if (toProtect.length) {
      for (let i = 0; i < toProtect.length; i += UPSERT_CHUNK) {
        const chunk = toProtect.slice(i, i + UPSERT_CHUNK)
        const { error: protErr } = await supabase
          .from('nfl_player_pvals')
          .update({ is_custom_override: true, updated_at: new Date().toISOString() })
          .in(
            'id',
            chunk.map((r) => r.id),
          )
        if (protErr) throw protErr
      }
    }
    console.log(`Protected curated/seed rows as overrides: ${toProtect.length}`)
  }

  const existing = await fetchAllRows(supabase, 'normalized_name, is_custom_override')

  const overrideSet = new Set(
    existing.filter((r) => r.is_custom_override).map((r) => r.normalized_name),
  )
  const existingSet = new Set(existing.map((r) => r.normalized_name))

  const toWrite = []
  let skipped = 0
  for (const r of rows) {
    if (overrideSet.has(r.normalized_name)) {
      skipped++
      continue
    }
    if (!refresh && existingSet.has(r.normalized_name)) {
      skipped++
      continue
    }
    toWrite.push(rowPayload(r))
  }

  let upserted = 0
  for (let i = 0; i < toWrite.length; i += UPSERT_CHUNK) {
    const chunk = toWrite.slice(i, i + UPSERT_CHUNK)
    const { error: upsertErr } = await supabase.from('nfl_player_pvals').upsert(chunk, {
      onConflict: 'normalized_name',
    })
    if (upsertErr) throw upsertErr
    upserted += chunk.length
  }

  const { count: tableN, error: countErr } = await supabase
    .from('nfl_player_pvals')
    .select('*', { count: 'exact', head: true })
  if (countErr) throw countErr
  const { count: overrideN, error: ovErr } = await supabase
    .from('nfl_player_pvals')
    .select('*', { count: 'exact', head: true })
    .eq('is_custom_override', true)
  if (ovErr) throw ovErr

  console.log(
    `Apply ${target} (${refresh ? 'refresh non-overrides' : 'insert-new only'}): ` +
      `wrote≈${upserted}, skipped≈${skipped}, table_n=${tableN ?? '?'}, overrides=${overrideN ?? '?'}`,
  )
}

async function compareToDb(target, rows) {
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  const dbRows = await fetchAllRows(
    supabase,
    'player_name, normalized_name, pval, is_custom_override',
  )
  if (!dbRows.length) return

  const byNorm = new Map(rows.map((r) => [r.normalized_name, r]))
  console.log(`\nCompare to existing ${target} table (${dbRows.length} rows):`)
  let matched = 0
  const diffs = []
  for (const d of dbRows) {
    const prop = byNorm.get(d.normalized_name)
    if (!prop) continue
    matched++
    const delta = Math.round((prop.pval - Number(d.pval)) * 100) / 100
    if (Math.abs(delta) >= 0.5) {
      diffs.push({
        name: d.player_name,
        db: Number(d.pval),
        prop: prop.pval,
        delta,
        override: d.is_custom_override,
        band: prop.bandKey,
      })
    }
  }
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  console.log(`  name-matched ${matched} · |Δ|≥0.5 → ${diffs.length}`)
  for (const d of diffs.slice(0, 12)) {
    console.log(
      `  ${d.name}: db ${d.db} → prop ${d.prop} (Δ${d.delta > 0 ? '+' : ''}${d.delta}) ${d.band}${d.override ? ' [OVERRIDE]' : ''}`,
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const built = await buildSleeperPvalRows({ week: args.week, season: args.season })
  printSummary(built)

  const skipOut = args.noOut || process.env.CI === 'true'
  if (!skipOut) {
    const outPath =
      args.outFile ||
      path.join(repoRoot, 'ap-guide-workspace', `_pval-sleeper-week${built.week}-${built.season}.json`)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          season: built.season,
          week: built.week,
          rowCount: built.rowCount,
          bandCounts: built.bandCounts,
          rows: built.rows.map((r) => ({
            player_name: r.player_name,
            normalized_name: r.normalized_name,
            team_name: r.team_name,
            position: r.position,
            side: r.side,
            bandKey: r.bandKey,
            pval: r.pval,
            tier: r.tier,
            depth_order: r.depth_order,
            pts_ppr: r.pts_ppr,
            percentile: r.percentile,
            notes: r.notes,
          })),
        },
        null,
        2,
      ),
    )
    console.log(`\nWrote ${outPath}`)
  }

  await compareToDb(args.target, built.rows)

  if (args.dryRun) {
    console.log('\nDry-run only. Re-run with --apply --target=test to insert new rows (curated protected).')
    console.log('Add --refresh to update existing non-override sleeper rows on later weeks.')
    return
  }

  await applyRows(args.target, built.rows, {
    refresh: args.refresh,
    protectExisting: args.protectExisting,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
