/**
 * Backup test Supabase guide rows to JSON (form edits live in DB only).
 * Usage: node scripts/ap-guide-backup-test-guides.mjs [slug...]
 *        node scripts/ap-guide-backup-test-guides.mjs --all-batch
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials, repoRoot } from './lib/supabaseEnv.mjs'
import { BATCH1_PAYLOADS } from './lib/apGuideBatch1Payloads.mjs'
import { BATCH2_PAYLOADS } from './lib/apGuideBatch2Payloads.mjs'

const args = process.argv.slice(2)
const allBatch = args.includes('--all-batch')
const slugs = allBatch
  ? [...BATCH1_PAYLOADS, ...BATCH2_PAYLOADS].map((p) => String(p.machine.slug))
  : args.filter((a) => !a.startsWith('--'))

if (!slugs.length) {
  console.error('Usage: node scripts/ap-guide-backup-test-guides.mjs [--all-batch] [slug...]')
  process.exit(1)
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb
  .from('guides')
  .select(
    'slug, title, card_ev_threshold, content_markdown, published, updated_at, machines(name, manufacturer, type, difficulty, popularity, nerf_risk, volatility_index, popularity_summary, release_year, has_calculator, calculator_slug)',
  )
  .in('slug', slugs)
  .order('slug')

if (error) throw new Error(error.message)

const missing = slugs.filter((s) => !data?.some((r) => r.slug === s))
if (missing.length) console.warn('Missing on test:', missing.join(', '))

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = path.join(repoRoot, 'ap-guide-workspace', '_guide-backups')
fs.mkdirSync(dir, { recursive: true })
const outPath = path.join(dir, `${stamp}.json`)
fs.writeFileSync(outPath, JSON.stringify({ backedUpAt: new Date().toISOString(), guides: data }, null, 2))
console.log(`Wrote ${data?.length ?? 0} guides → ${outPath}`)
