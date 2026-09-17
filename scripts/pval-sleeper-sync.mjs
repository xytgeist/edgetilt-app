#!/usr/bin/env node
/**
 * PVAL v1 — Sleeper depth + weekly fantasy → position-band PVALs.
 *
 *   node scripts/pval-sleeper-sync.mjs --dry-run
 *   node scripts/pval-sleeper-sync.mjs --apply --target=test
 *   node scripts/pval-sleeper-sync.mjs --apply --refresh --target=test
 *   npm run syndicate:pval-sleeper:refresh:test
 *
 * Skips is_custom_override = true rows. Does not auto-protect seed notes
 * unless you pass --protect. Ops switch / Save can still lock a row.
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
  if (out.protectExisting == null) out.protectExisting = false
  return out
}

function printSummary(built) {
  console.log(`Sleeper season=${built.season} week=${built.week} lookback=${built.lookbackWeeks} weeks=${(built.weeksUsed || []).join(',')}`)
  console.log(`Players file ~${built.playerCount} · proposed PVAL rows ${built.rowCount}`)
  console.log('Band counts:', built.bandCounts)
  console.log('\nTop 15 by PVAL:')
  for (const r of built.rows.slice(0, 15)) {
    console.log(
      `  ${r.pval.toFixed(2).padStart(4)}  ${r.bandKey.padEnd(12)}  ${r.player_name} (${r.team_abbr}) depth=${r.depth_order ?? '-'} avg=${r.pts_avg ?? '-'} cur=${r.pts_ppr ?? '-'}`,
    )
  }
  console.log('\nSample WR1:')
  for (const r of built.rows.filter((x) => x.bandKey === 'wr1').slice(0, 8)) {
    console.log(
      `  ${r.pval.toFixed(2)}  ${r.player_name}  avg=${r.pts_avg}  cur=${r.pts_ppr}  pct=${r.percentile}`,
    )
  }
  console.log('\nSample starting_qb:')
  for (const r of built.rows.filter((x) => x.bandKey === 'starting_qb').slice(0, 8)) {
    console.log(
      `  ${r.pval.toFixed(2)}  ${r.player_name}  avg=${r.pts_avg}  cur=${r.pts_ppr}  pct=${r.percentile}`,
    )
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

function roundPval(n) {
  return Math.round(Number(n) * 100) / 100
}

function buildPvalCompare(dbRows, proposed, { refresh = false } = {}) {
  const byNorm = new Map(proposed.map((r) => [r.normalized_name, r]))
  const existing = new Map(dbRows.map((d) => [d.normalized_name, d]))
  const movers = []
  const overrideBlocked = []
  let matched = 0
  let unchanged = 0
  let inserted = 0
  let updated = 0
  let skippedOverrides = 0

  for (const r of proposed) {
    const d = existing.get(r.normalized_name)
    if (!d) {
      inserted++
      movers.push({
        kind: 'insert',
        name: r.player_name,
        team: r.team_abbr || r.team_name || '',
        band: r.bandKey,
        from: null,
        to: r.pval,
        delta: r.pval,
        override: false,
      })
      continue
    }
    matched++
    const from = roundPval(d.pval)
    const to = roundPval(r.pval)
    const delta = roundPval(to - from)
    if (d.is_custom_override) {
      skippedOverrides++
      if (Math.abs(delta) >= 0.25) {
        overrideBlocked.push({
          kind: 'override',
          name: d.player_name,
          team: r.team_abbr || r.team_name || '',
          band: r.bandKey,
          from,
          to,
          delta,
          override: true,
        })
      }
      continue
    }
    if (!refresh) {
      unchanged++
      continue
    }
    if (Math.abs(delta) < 0.05) {
      unchanged++
      continue
    }
    updated++
    movers.push({
      kind: 'update',
      name: d.player_name,
      team: r.team_abbr || r.team_name || '',
      band: r.bandKey,
      from,
      to,
      delta,
      override: false,
    })
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  overrideBlocked.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    matched,
    inserted,
    updated,
    unchanged,
    skippedOverrides,
    movers,
    overrideBlocked,
  }
}

async function savePvalSyncRun(target, dump) {
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  const { error } = await supabase.from('nfl_pval_sync_runs').insert({
    source: 'sleeper',
    season: dump.season,
    week: dump.week,
    proposed_rows: dump.proposed_rows,
    wrote: dump.wrote,
    inserted_n: dump.inserted_n,
    updated_n: dump.updated_n,
    unchanged_n: dump.unchanged_n,
    skipped_overrides: dump.skipped_overrides,
    table_n: dump.table_n,
    override_n: dump.override_n,
    band_counts: dump.band_counts,
    movers: dump.movers,
    override_blocked: dump.override_blocked,
    summary: dump.summary,
  })
  if (error) {
    console.warn(`[pval-sleeper] sync-run dump failed: ${error.message}`)
    return
  }
  console.log(`[pval-sleeper] wrote ops dump (${dump.movers.length} movers)`)
}

async function applyRows(target, rows, { refresh = false, protectExisting = false } = {}) {
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
  return { upserted, skipped, tableN: tableN ?? 0, overrideN: overrideN ?? 0 }
}

async function loadDbPvals(target) {
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  return fetchAllRows(supabase, 'player_name, normalized_name, pval, is_custom_override')
}

function printCompare(cmp) {
  const big = cmp.movers.filter((m) => Math.abs(m.delta) >= 0.5)
  console.log(`\nCompare: matched ${cmp.matched} · new ${cmp.inserted} · |Δ|≥0.05 ${cmp.updated} · |Δ|≥0.5 ${big.length}`)
  for (const d of big.slice(0, 12)) {
    console.log(
      `  ${d.name}: ${d.from ?? '-'} -> ${d.to} (d${d.delta > 0 ? '+' : ''}${d.delta}) ${d.band}${d.override ? ' [OVERRIDE]' : ''}`,
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

  const dbBefore = await loadDbPvals(args.target)
  const cmp = buildPvalCompare(dbBefore, built.rows, { refresh: args.refresh })
  printCompare(cmp)

  if (args.dryRun) {
    console.log('\nDry-run only. Re-run with --apply --refresh --target=test to write non-override rows.')
    console.log('Pass --protect only if you want leftover seed notes locked as overrides.')
    return
  }

  const applied = await applyRows(args.target, built.rows, {
    refresh: args.refresh,
    protectExisting: args.protectExisting,
  })
  const dump = {
    season: built.season,
    week: built.week,
    proposed_rows: built.rowCount,
    wrote: applied.upserted,
    inserted_n: cmp.inserted,
    updated_n: cmp.updated,
    unchanged_n: cmp.unchanged,
    skipped_overrides: cmp.skippedOverrides,
    table_n: applied.tableN,
    override_n: applied.overrideN,
    band_counts: built.bandCounts,
    movers: cmp.movers.slice(0, 120),
    override_blocked: cmp.overrideBlocked.slice(0, 40),
    summary: `Sleeper week ${built.week} ${built.season}: pulled ${built.rowCount}, wrote ${applied.upserted} (${cmp.inserted} new, ${cmp.updated} moved), left ${cmp.skippedOverrides} overrides.`,
  }
  await savePvalSyncRun(args.target, dump)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
