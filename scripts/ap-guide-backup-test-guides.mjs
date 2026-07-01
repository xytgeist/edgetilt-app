/**
 * Backup test Supabase guide rows to JSON (form edits live in DB only).
 * Usage: node scripts/ap-guide-backup-test-guides.mjs [slug...]
 *        node scripts/ap-guide-backup-test-guides.mjs --all-published
 *        node scripts/ap-guide-backup-test-guides.mjs --all-batch
 *        node scripts/ap-guide-backup-test-guides.mjs --target=production --all-batch
 *
 * Run before any Ryan-approved batch ingest. See AGENTS.md AGENT_RULE_TEST_IS_PROD.
 *
 * Restore all cards from a backup (undo bad ingest / wiped edits):
 *   node scripts/ap-guide-restore-test-guides.mjs --latest
 * Or: node scripts/ap-guide-restore-test-guides.mjs ap-guide-workspace/_guide-backups/<file>.json
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials, repoRoot } from './lib/supabaseEnv.mjs'

const GUIDE_SELECT =
  'slug, title, card_ev_threshold, content_markdown, published, thumbnail_url, card_accent_color, updated_at, machines(slug, name, manufacturer, type, difficulty, popularity, nerf_risk, volatility_index, popularity_summary, release_year, has_calculator, calculator_slug, thumbnail_url)'

const args = process.argv.slice(2)
const targetRaw = args.find((a) => a.startsWith('--target='))?.split('=')[1]?.trim().toLowerCase()
const target = targetRaw === 'test' ? 'test' : 'production'
const allPublished = args.includes('--all-published')
const allBatch = args.includes('--all-batch')
const slugArgs = args.filter((a) => !a.startsWith('--'))

/** @type {string[]} */
let slugs = slugArgs

if (allBatch) {
  slugs = []
  for (let n = 1; n <= 6; n++) {
    try {
      const mod = await import(`./lib/apGuideBatch${n}Payloads.mjs`)
      const key = `BATCH${n}_PAYLOADS`
      if (mod[key]?.length) {
        slugs.push(...mod[key].map((p) => String(p.machine.slug)))
      }
    } catch {
      /* batch file optional */
    }
  }
  slugs = [...new Set(slugs)]
}

if (!slugs.length && !allPublished) {
  console.error(
    'Usage: node scripts/ap-guide-backup-test-guides.mjs [--all-published | --all-batch] [slug...]',
  )
  process.exit(1)
}

loadSupabaseEnv(target)
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

/** @type {import('@supabase/supabase-js').PostgrestSingleResponse<unknown>} */
let data
/** @type {import('@supabase/supabase-js').PostgrestError | null} */
let error

if (allPublished) {
  ;({ data, error } = await sb.from('guides').select(GUIDE_SELECT).eq('published', true).order('slug'))
} else {
  ;({ data, error } = await sb.from('guides').select(GUIDE_SELECT).in('slug', slugs).order('slug'))
}

if (error) throw new Error(error.message)

if (!allPublished) {
  const missing = slugs.filter((s) => !/** @type {Array<{ slug: string }>} */ (data)?.some((r) => r.slug === s))
  if (missing.length) console.warn('Missing on test:', missing.join(', '))
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = path.join(repoRoot, 'ap-guide-workspace', '_guide-backups')
fs.mkdirSync(dir, { recursive: true })
const label = allPublished ? 'all-published' : allBatch ? 'all-batch' : slugArgs.join('-') || 'backup'
const outPath = path.join(dir, `${stamp}-${label}.json`)
fs.writeFileSync(
  outPath,
  JSON.stringify({ backedUpAt: new Date().toISOString(), guides: data }, null, 2),
)
console.log(`Wrote ${/** @type {unknown[]} */ (data)?.length ?? 0} guides → ${outPath}`)
