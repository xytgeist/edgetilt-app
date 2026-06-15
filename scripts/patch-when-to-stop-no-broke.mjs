/**
 * Remove "quit when broke" language from When to stop on test guides.
 * Usage: node scripts/patch-when-to-stop-no-broke.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'
import {
  findWhenToStopBrokeTalk,
  scrubWhenToStopBrokeTalk,
} from './lib/apGuideVoiceRules.mjs'

const dryRun = process.argv.includes('--dry-run')

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb.from('guides').select('id, slug, content_markdown')
if (error) throw new Error(error.message)

/** @type {string[]} */
const updated = []

for (const row of data ?? []) {
  const before = row.content_markdown || ''
  if (!findWhenToStopBrokeTalk(before).length) continue

  const after = scrubWhenToStopBrokeTalk(before)
  if (after === before) continue

  // coin-kingdom manual fix for Ryan line
  let md = after
  if (row.slug === 'coin-kingdom-aztec') {
    md = md.replace(
      /Stop when your ladder hits or you exhaust session bankroll\.[^\n]*/i,
      'Stop when your **Major** or **Grand** objective hits.',
    )
  }

  updated.push(row.slug)
  if (dryRun) {
    console.log(`[dry-run] ${row.slug}`)
    continue
  }

  const { error: upErr } = await sb
    .from('guides')
    .update({ content_markdown: md, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) throw new Error(`${row.slug}: ${upErr.message}`)
  console.log(`Patched ${row.slug}`)
}

console.log(`\n${dryRun ? 'Would patch' : 'Patched'} ${updated.length} guide(s).`)
