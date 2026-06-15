/**
 * Apply voice scrubs to guides.content_markdown IN PLACE (keeps Ryan's saved copy).
 * Does NOT re-ingest from repo payloads.
 *
 * Usage:
 *   node scripts/ap-guide-patch-voice-in-place.mjs [--dry-run] [--all-batch] [slug...]
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'
import { BATCH1_PAYLOADS } from './lib/apGuideBatch1Payloads.mjs'
import { BATCH2_PAYLOADS } from './lib/apGuideBatch2Payloads.mjs'
import {
  findGameplayApCopy,
  findWhenToStopBrokeTalk,
  findWtfScoutFiller,
  scrubGuideMarkdownVoice,
} from './lib/apGuideVoiceRules.mjs'

const dryRun = process.argv.includes('--dry-run')
const allBatch = process.argv.includes('--all-batch')
const slugs = allBatch
  ? [...BATCH1_PAYLOADS, ...BATCH2_PAYLOADS].map((p) => String(p.machine.slug))
  : process.argv.slice(2).filter((a) => !a.startsWith('--'))

if (!slugs.length) {
  console.error('Usage: node scripts/ap-guide-patch-voice-in-place.mjs [--dry-run] [--all-batch] [slug...]')
  process.exit(1)
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb.from('guides').select('id, slug, content_markdown').in('slug', slugs)
if (error) throw new Error(error.message)

/** @type {string[]} */
const patched = []
/** @type {string[]} */
const skipped = []

for (const row of data ?? []) {
  const before = row.content_markdown || ''
  const after = scrubGuideMarkdownVoice(before)

  const hadIssue =
    findWtfScoutFiller(before).length ||
    findGameplayApCopy(before).length ||
    findWhenToStopBrokeTalk(before).length ||
    /\*\*Summary:\*\*/i.test(before)

  if (after === before) {
    if (hadIssue) skipped.push(`${row.slug} (unchanged — review manually)`)
    continue
  }

  patched.push(row.slug)
  if (dryRun) {
    console.log(`[dry-run] ${row.slug}`)
    continue
  }

  const { error: upErr } = await sb
    .from('guides')
    .update({ content_markdown: after, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) throw new Error(`${row.slug}: ${upErr.message}`)
  console.log(`Patched ${row.slug}`)
}

console.log(`\n${dryRun ? 'Would patch' : 'Patched'} ${patched.length}: ${patched.join(', ') || '(none)'}`)
if (skipped.length) console.log(`Skipped unchanged: ${skipped.join(', ')}`)
