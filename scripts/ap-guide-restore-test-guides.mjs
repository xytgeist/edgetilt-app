/**
 * Restore guide cards on test from a backup JSON (your form edits, byte-for-byte).
 *
 * Usage:
 *   node scripts/ap-guide-restore-test-guides.mjs ap-guide-workspace/_guide-backups/<file>.json
 *   node scripts/ap-guide-restore-test-guides.mjs --latest
 *   node scripts/ap-guide-restore-test-guides.mjs --latest --dry-run
 *
 * Backups are created with:
 *   node scripts/ap-guide-backup-test-guides.mjs --all-published
 *
 * This writes content_markdown + machine metadata + heroes exactly as saved in the backup.
 * It does NOT use batch repo payloads — safe undo after a bad ingest.
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials, repoRoot } from './lib/supabaseEnv.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const useLatest = args.includes('--latest')
const fileArg = args.find((a) => !a.startsWith('--'))

const backupDir = path.join(repoRoot, 'ap-guide-workspace', '_guide-backups')

/** @returns {string} */
function resolveBackupPath() {
  if (fileArg) return path.resolve(fileArg)
  if (useLatest) {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.json') && f.includes('all-published'))
      .sort()
      .reverse()
    if (!files.length) {
      throw new Error(`No *-all-published.json backups in ${backupDir}`)
    }
    return path.join(backupDir, files[0])
  }
  throw new Error(
    'Usage: node scripts/ap-guide-restore-test-guides.mjs <backup.json> | --latest [--dry-run]',
  )
}

const backupPath = resolveBackupPath()
const raw = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
/** @type {Array<Record<string, unknown>>} */
const guides = Array.isArray(raw) ? raw : raw.guides
if (!Array.isArray(guides) || !guides.length) {
  throw new Error(`No guides[] in backup: ${backupPath}`)
}

console.log(`Restore source: ${backupPath}`)
console.log(`Guides in backup: ${guides.length}`)
if (dryRun) console.log('DRY RUN — no DB writes\n')

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

/** @type {string[]} */
const restored = []
/** @type {string[]} */
const failed = []

for (const row of guides) {
  const slug = String(row.slug ?? '').trim()
  if (!slug) {
    failed.push('(missing slug)')
    continue
  }

  /** @type {Record<string, unknown> | null} */
  const m = /** @type {Record<string, unknown> | null} */ (row.machines ?? null)
  if (!m) {
    failed.push(`${slug}: no machines block in backup`)
    continue
  }

  const machinePayload = {
    slug,
    name: m.name,
    manufacturer: m.manufacturer,
    type: m.type,
    difficulty: m.difficulty,
    popularity: m.popularity ?? m.vegas_availability,
    nerf_risk: m.nerf_risk,
    has_calculator: m.has_calculator ?? false,
    calculator_slug: m.calculator_slug ?? null,
    thumbnail_url: m.thumbnail_url ?? row.thumbnail_url ?? null,
    volatility_index: m.volatility_index ?? null,
    popularity_summary: m.popularity_summary ?? null,
    release_year: m.release_year ?? null,
  }

  const guidePayload = {
    slug,
    title: row.title,
    content_markdown: row.content_markdown,
    card_ev_threshold: row.card_ev_threshold ?? null,
    published: row.published !== false,
    difficulty: m.difficulty ?? null,
    thumbnail_url: row.thumbnail_url ?? m.thumbnail_url ?? null,
    updated_at: new Date().toISOString(),
  }

  if (dryRun) {
    console.log(`  would restore ${slug} (${String(row.content_markdown ?? '').length} chars)`)
    restored.push(slug)
    continue
  }

  try {
    const { data: upserted, error: me } = await sb
      .from('machines')
      .upsert(machinePayload, { onConflict: 'slug' })
      .select('id')
      .single()
    if (me) throw new Error(`machines: ${me.message}`)

    const { error: ge } = await sb.from('guides').upsert(
      { ...guidePayload, machine_id: upserted.id },
      { onConflict: 'slug' },
    )
    if (ge) throw new Error(`guides: ${ge.message}`)

    restored.push(slug)
    console.log(`✓ ${slug}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failed.push(`${slug}: ${msg}`)
    console.error(`✗ ${slug}: ${msg}`)
  }
}

console.log(`\nRestored ${restored.length}, failed ${failed.length}`)
if (failed.length) process.exit(1)
