#!/usr/bin/env node
/**
 * TWO·DEEP hole-fill for nfl_player_pvals.
 *
 * Hunter Ansley said we may scrape thetwodeep.com. Be polite (4s / team page).
 * Only patches holes Sleeper leaves: OL years_exp seats, TE2/WR2-3 when Two Deep
 * has a clear starter. Never overwrites curated overrides or fantasy-seated PVALs.
 * Never replaces nflverse EPA, ESPN trench, or Rundown injury status.
 *
 *   node scripts/pval-twodeep-fill.mjs --dry-run --team=lar
 *   node scripts/pval-twodeep-fill.mjs --apply --target=test
 *   npm run syndicate:pval-twodeep:apply:test
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  TWO_DEEP_DELAY_MS,
  TWO_DEEP_NFL_SLUGS,
  loadTwoDeepNflDepth,
} from './lib/twoDeepNflDepth.mjs'
import {
  PVAL_BANDS,
  pvalFromPercentileInBand,
} from './lib/pvalSleeperSync.mjs'
import {
  createSupabaseServiceClient,
  loadSupabaseEnv,
  repoRoot,
} from './lib/supabaseEnv.mjs'

const PAGE = 1000
const UPSERT_CHUNK = 80

function parseArgs(argv) {
  const out = {
    dryRun: true,
    target: 'test',
    team: null,
    delayMs: TWO_DEEP_DELAY_MS,
    noCache: false,
    cacheDir: path.join(repoRoot, 'ap-guide-workspace', '_twodeep-cache'),
  }
  for (const raw of argv) {
    if (raw === '--apply') out.dryRun = false
    else if (raw === '--dry-run') out.dryRun = true
    else if (raw === '--no-cache') out.noCache = true
    else if (raw.startsWith('--target=')) out.target = raw.slice('--target='.length)
    else if (raw.startsWith('--team=')) out.team = raw.slice('--team='.length).toLowerCase()
    else if (raw.startsWith('--delay-ms=')) out.delayMs = Number(raw.slice('--delay-ms='.length))
    else if (raw.startsWith('--cache-dir=')) out.cacheDir = raw.slice('--cache-dir='.length)
  }
  return out
}

function parseSleeperNotes(notes) {
  const n = String(notes || '')
  if (!n.startsWith('sleeper v1')) return null
  const band = String((n.match(/sleeper v1(?:\.\d+)?\s*·\s*([a-z0-9_]+)/i) || [])[1] || '')
    .toLowerCase()
  const hasFantasy = /avg\d+w=/.test(n) || /search_rank=/.test(n)
  return {
    band,
    hasFantasy,
    yearsSeat: /years_exp=/.test(n),
    typicalHole: /typical \(no fantasy/.test(n),
  }
}

function isOlPosition(position) {
  return /^(OT|OL|OG|OC|C|G|T|LT|RT|IOL)$/i.test(String(position || '').trim())
}

function holeKind(row, td) {
  const meta = parseSleeperNotes(row.notes)
  if (!meta) return null
  if (row.is_custom_override) return null
  if (meta.hasFantasy) return null

  const olHole =
    meta.band === 'ot' ||
    meta.band === 'iol' ||
    isOlPosition(row.position)
  if (olHole && (td.bandKey === 'ot' || td.bandKey === 'iol')) return 'ol'

  if (meta.band === 'te2' && td.bandKey === 'te1') return 'te'
  if ((meta.band === 'wr2' || meta.band === 'wr3') && td.bandKey === 'wr1') return 'wr'
  return null
}

function seatPercentile(td) {
  if (td.snapPct != null && Number.isFinite(td.snapPct)) {
    return Math.max(0, Math.min(1, td.snapPct / 100))
  }
  if (td.depthRank === 1) return 0.75
  if (td.depthRank === 2) return 0.35
  return 0.2
}

function isOlStarterInsert(td) {
  if (td.bandKey !== 'ot' && td.bandKey !== 'iol') return false
  if (td.depthRank === 1) return true
  return td.snapPct != null && td.snapPct >= 50
}

function buildFill(row, td, kind) {
  const bandKey = td.bandKey
  const band = PVAL_BANDS[bandKey]
  if (!band) return null
  const pct = seatPercentile(td)
  const pval = pvalFromPercentileInBand(bandKey, pct)
  const snapBit = td.snapPct != null ? `${td.snapPct}% snaps` : 'no snap%'
  return {
    id: row?.id || null,
    player_name: row?.player_name || td.playerName,
    normalized_name: row?.normalized_name || td.normalizedName,
    team_name: row?.team_name || td.teamName,
    position: td.position || row?.position,
    side: td.side || row?.side || band.side,
    pval,
    tier: pct >= 0.85 ? 1 : pct >= 0.55 ? 2 : 3,
    notes: `sleeper v1.1 · ${bandKey} · twodeep fill · ${td.slot || 'slot?'} · ${snapBit} · pct=${pct.toFixed(2)}`,
    prev_pval: row ? Number(row.pval) : null,
    kind,
    slot: td.slot,
    snapPct: td.snapPct,
    insert: !row,
  }
}

async function fetchAllPvals(supabase) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('nfl_player_pvals')
      .select(
        'id, player_name, normalized_name, team_name, position, side, pval, notes, is_custom_override',
      )
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

function printFillPreview(fills) {
  const byKind = { ol: 0, te: 0, wr: 0, 'ol-insert': 0 }
  for (const f of fills) byKind[f.kind] = (byKind[f.kind] || 0) + 1
  console.log(
    `\nFills: ${fills.length}  (ol ${byKind.ol || 0} · ol-insert ${byKind['ol-insert'] || 0} · te ${byKind.te || 0} · wr ${byKind.wr || 0})`,
  )
  for (const f of fills.slice(0, 24)) {
    const prev = f.prev_pval == null ? 'new' : f.prev_pval
    const delta =
      f.prev_pval == null ? 'insert' : `${Math.round((f.pval - f.prev_pval) * 100) / 100}`
    console.log(
      `  ${f.player_name.padEnd(22)} ${String(f.slot || '').padEnd(5)} ${prev} → ${f.pval} (${delta}) ${f.kind}`,
    )
  }
  if (fills.length > 24) console.log(`  … ${fills.length - 24} more`)
}

async function applyFills(supabase, fills) {
  const now = new Date().toISOString()
  let wrote = 0
  const inserts = fills.filter((f) => f.insert)
  const updates = fills.filter((f) => !f.insert)
  for (let i = 0; i < inserts.length; i += UPSERT_CHUNK) {
    const chunk = inserts.slice(i, i + UPSERT_CHUNK).map((f) => ({
      player_name: f.player_name,
      normalized_name: f.normalized_name,
      team_name: f.team_name,
      position: f.position,
      side: f.side,
      pval: f.pval,
      tier: f.tier,
      notes: f.notes,
      is_custom_override: false,
      last_synced_at: now,
      updated_at: now,
    }))
    const { error } = await supabase.from('nfl_player_pvals').insert(chunk)
    if (error) throw error
    wrote += chunk.length
  }
  for (const f of updates) {
    const { error } = await supabase
      .from('nfl_player_pvals')
      .update({
        position: f.position,
        side: f.side,
        pval: f.pval,
        tier: f.tier,
        notes: f.notes,
        last_synced_at: now,
        updated_at: now,
      })
      .eq('id', f.id)
      .eq('is_custom_override', false)
    if (error) throw error
    wrote += 1
  }
  return wrote
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const slugs = args.team
    ? [args.team]
    : TWO_DEEP_NFL_SLUGS
  if (args.team && !TWO_DEEP_NFL_SLUGS.includes(args.team)) {
    throw new Error(`Unknown Two Deep slug ${args.team}. Use one of: ${TWO_DEEP_NFL_SLUGS.join(', ')}`)
  }

  console.log(
    `TWO·DEEP PVAL hole-fill  target=${args.target}  dryRun=${args.dryRun}  teams=${slugs.length}  delay=${args.delayMs}ms`,
  )
  console.log('Polite scrape: sequential team pages only. Cache 20h under ap-guide-workspace/_twodeep-cache.')

  const board = await loadTwoDeepNflDepth({
    slugs,
    delayMs: args.delayMs,
    cacheDir: args.cacheDir,
    allowCache: !args.noCache,
    onProgress: (p) => {
      const src = p.fromCache ? 'cache' : 'live'
      console.log(
        `  ${p.slug.padEnd(4)} ${src}  ${p.skipped ? `skip ${p.status}` : `${p.playerCount} players`}`,
      )
    },
  })
  console.log(
    `Board: ${board.playerCount} players · ${board.teamCount} teams · live=${board.liveFetches} cache=${board.cacheHits}`,
  )

  const outPath = path.join(args.cacheDir, '_board-summary.json')
  fs.mkdirSync(args.cacheDir, { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        fetchedAt: board.fetchedAt,
        liveFetches: board.liveFetches,
        cacheHits: board.cacheHits,
        playerCount: board.playerCount,
        teams: board.teams.map((t) => ({
          slug: t.slug,
          teamAbbr: t.teamAbbr,
          playerCount: t.playerCount,
        })),
      },
      null,
      2,
    ),
  )

  loadSupabaseEnv(args.target)
  const supabase = createSupabaseServiceClient(createClient)
  const rows = await fetchAllPvals(supabase)
  const byName = new Map()
  for (const row of rows) {
    const list = byName.get(row.normalized_name) || []
    list.push(row)
    byName.set(row.normalized_name, list)
  }

  const fills = []
  let matched = 0
  let skippedOverride = 0
  let skippedFantasy = 0
  let insertedOl = 0
  for (const td of board.players) {
    const cands = byName.get(td.normalizedName) || []
    if (!cands.length) {
      if (!isOlStarterInsert(td)) continue
      const fill = buildFill(null, td, 'ol-insert')
      if (fill) {
        fills.push(fill)
        insertedOl += 1
      }
      continue
    }
    matched += 1
    const row =
      cands.find((r) => String(r.team_name || '').toLowerCase() === td.teamName.toLowerCase()) ||
      cands[0]
    if (row.is_custom_override) {
      skippedOverride += 1
      continue
    }
    const meta = parseSleeperNotes(row.notes)
    if (meta?.hasFantasy) {
      skippedFantasy += 1
      continue
    }
    const kind = holeKind(row, td)
    if (!kind) continue
    const fill = buildFill(row, td, kind)
    if (fill) fills.push(fill)
  }

  console.log(
    `Name-matched ${matched} · skipped override ${skippedOverride} · skipped fantasy seat ${skippedFantasy} · ol inserts ${insertedOl}`,
  )
  printFillPreview(fills)

  if (args.dryRun) {
    console.log('\nDry-run only. Re-run with --apply --target=test to write hole fills.')
    return
  }

  const wrote = await applyFills(supabase, fills)
  console.log(`Wrote ${wrote} hole fills on ${args.target}. Overrides untouched.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
