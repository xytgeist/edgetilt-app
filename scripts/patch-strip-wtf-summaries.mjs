/**
 * Remove **Summary:** blocks from ## 📍 Where to find on test guides.
 * Usage: node scripts/patch-strip-wtf-summaries.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const dryRun = process.argv.includes('--dry-run')
const WTF_HEADER = '## 📍 Where to find'

/** @param {string} md */
export function stripWtfSummary(md) {
  const start = md.indexOf(WTF_HEADER)
  if (start < 0) return { md, changed: false }

  const nextSection = md.indexOf('\n## ', start + WTF_HEADER.length)
  const wtfEnd = nextSection >= 0 ? nextSection : md.length
  const wtfSection = md.slice(start, wtfEnd)
  const sumMatch = wtfSection.match(/\n\*\*Summary:\*\*/i)
  if (!sumMatch || sumMatch.index == null) return { md, changed: false }

  const trimmed = wtfSection.slice(0, sumMatch.index).replace(/\s+$/, '') + '\n\n'
  const out = md.slice(0, start) + trimmed + md.slice(wtfEnd)
  return { md: out, changed: true }
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb.from('guides').select('id, slug, content_markdown').eq('published', true)
if (error) throw new Error(error.message)

/** @type {string[]} */
const updated = []

for (const row of data ?? []) {
  const { md, changed } = stripWtfSummary(row.content_markdown || '')
  if (!changed) continue

  updated.push(row.slug)
  if (dryRun) {
    console.log(`[dry-run] would strip Summary: ${row.slug}`)
    continue
  }

  const { error: upErr } = await sb
    .from('guides')
    .update({ content_markdown: md, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) throw new Error(`${row.slug}: ${upErr.message}`)
  console.log(`Stripped Summary: ${row.slug}`)
}

console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updated.length} guide(s).`)
