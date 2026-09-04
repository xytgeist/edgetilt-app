#!/usr/bin/env node
/**
 * PVAL v1 — Sleeper depth + weekly fantasy → position-band PVALs.
 *
 *   node scripts/pval-sleeper-sync.mjs --dry-run
 *   node scripts/pval-sleeper-sync.mjs --apply --target=test
 *   node scripts/pval-sleeper-sync.mjs --apply --target=production
 *
 * Never overwrites is_custom_override = true rows.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSleeperPvalRows } from './lib/pvalSleeperSync.mjs'
import { loadSupabaseEnv, repoRoot } from './lib/supabaseEnv.mjs'
import { ensureLinked, poolerUrlWithPassword } from './lib/supabaseDbCli.mjs'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const out = {
    dryRun: true,
    target: 'test',
    week: null,
    season: null,
    outFile: null,
    refresh: false,
    protectExisting: true,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--apply') out.dryRun = false
    else if (a === '--refresh') out.refresh = true
    else if (a === '--no-protect') out.protectExisting = false
    else if (a === '--target' || a === '-t') out.target = argv[++i]
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length)
    else if (a === '--week') out.week = Number(argv[++i])
    else if (a === '--season') out.season = argv[++i]
    else if (a === '--out') out.outFile = argv[++i]
  }
  if (!['test', 'production'].includes(out.target)) {
    throw new Error(`Invalid --target ${out.target}`)
  }
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

async function applyRows(target, rows, { refresh = false, protectExisting = true } = {}) {
  loadSupabaseEnv(target)
  ensureLinked(target)
  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  if (!password) throw new Error(`SUPABASE_DB_PASSWORD missing for ${target}`)
  const pooler = fs.readFileSync(path.join(repoRoot, 'supabase', '.temp', 'pooler-url'), 'utf8').trim()
  const connectionString = poolerUrlWithPassword(pooler, password)

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    if (protectExisting) {
      const prot = await client.query(`
        update public.nfl_player_pvals
        set is_custom_override = true, updated_at = now()
        where is_custom_override = false
          and (notes is null or notes not like 'sleeper v1%')
      `)
      console.log(`Protected curated/seed rows as overrides: ${prot.rowCount}`)
    }

    let upserted = 0
    let skipped = 0
    for (const r of rows) {
      const sql = refresh
        ? `
          insert into public.nfl_player_pvals (
            player_name, normalized_name, team_name, position, side, pval, tier, notes,
            is_custom_override, last_synced_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8, false, now(), now())
          on conflict (normalized_name) do update set
            player_name = excluded.player_name,
            team_name = excluded.team_name,
            position = excluded.position,
            side = excluded.side,
            pval = excluded.pval,
            tier = excluded.tier,
            notes = excluded.notes,
            last_synced_at = now(),
            updated_at = now()
          where public.nfl_player_pvals.is_custom_override = false
          `
        : `
          insert into public.nfl_player_pvals (
            player_name, normalized_name, team_name, position, side, pval, tier, notes,
            is_custom_override, last_synced_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8, false, now(), now())
          on conflict (normalized_name) do nothing
          `
      const res = await client.query(sql, [
        r.player_name,
        r.normalized_name,
        r.team_name,
        r.position,
        r.side,
        r.pval,
        r.tier,
        r.notes,
      ])
      if (res.rowCount === 0) skipped++
      else upserted++
    }
    const countRes = await client.query('select count(*)::int as n from public.nfl_player_pvals')
    const ov = await client.query(
      'select count(*)::int as n from public.nfl_player_pvals where is_custom_override',
    )
    console.log(
      `Apply ${target} (${refresh ? 'refresh non-overrides' : 'insert-new only'}): ` +
        `wrote≈${upserted}, skipped≈${skipped}, table_n=${countRes.rows[0].n}, overrides=${ov.rows[0].n}`,
    )
  } finally {
    await client.end()
  }
}

async function compareToDb(target, rows) {
  loadSupabaseEnv(target)
  ensureLinked(target)
  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  if (!password) return
  const pooler = fs.readFileSync(path.join(repoRoot, 'supabase', '.temp', 'pooler-url'), 'utf8').trim()
  const connectionString = poolerUrlWithPassword(pooler, password)
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const { rows: dbRows } = await client.query(
      'select player_name, normalized_name, pval, is_custom_override from public.nfl_player_pvals',
    )
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
  } finally {
    await client.end()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const built = await buildSleeperPvalRows({ week: args.week, season: args.season })
  printSummary(built)

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

  await compareToDb(args.target, built.rows)

  if (args.dryRun) {
    console.log('\nDry-run only. Re-run with --apply --target=test to insert new rows (curated 57 protected).')
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
