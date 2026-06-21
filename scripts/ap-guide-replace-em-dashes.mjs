/**
 * Replace em dashes (U+2014) with hyphens in published guide content_markdown on test.
 * Does not touch en dashes (U+2013) used in numeric ranges (e.g. 14-15).
 *
 * Usage:
 *   node scripts/ap-guide-replace-em-dashes.mjs [--dry-run] --all-published
 */
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const EM_DASH = '\u2014'
const EM_DASH_RE = /\u2014/g

const dryRun = process.argv.includes('--dry-run')
const allPublished = process.argv.includes('--all-published')

if (!allPublished) {
  console.error('Usage: node scripts/ap-guide-replace-em-dashes.mjs [--dry-run] --all-published')
  process.exit(1)
}

/** @param {string} markdown */
function whereToFindBody(markdown) {
  const head = markdown.match(/^## [^\n]*Where to find[^\n]*\n/im)
  if (!head || head.index == null) return ''
  let body = markdown.slice(head.index + head[0].length)
  const next = body.search(/^## /m)
  if (next >= 0) body = body.slice(0, next)
  return body
}

/** @param {string} markdown */
function emDashCountInWhereToFind(markdown) {
  return (whereToFindBody(markdown).match(EM_DASH_RE) ?? []).length
}

/** @param {string} markdown */
function replaceAllEmDashes(markdown) {
  const hits = (markdown.match(EM_DASH_RE) ?? []).length
  if (!hits) return { markdown, count: 0 }
  return { markdown: markdown.replace(EM_DASH_RE, '-'), count: hits }
}

loadSupabaseEnv('test')
const { url, key } = readSupabaseCredentials()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb
  .from('guides')
  .select('id, slug, content_markdown')
  .eq('published', true)
  .order('slug')
if (error) throw new Error(error.message)

/** @type {string[]} */
const patched = []
/** @type {string[]} */
const outsideWarnings = []
let totalReplacements = 0
let wtfReplacements = 0

for (const row of data ?? []) {
  const before = row.content_markdown || ''
  const { markdown: after, count } = replaceAllEmDashes(before)
  if (!count) continue

  const inWtf = emDashCountInWhereToFind(before)
  const outside = count - inWtf
  if (outside > 0) outsideWarnings.push(`${row.slug} (${outside} outside Where to find)`)

  totalReplacements += count
  wtfReplacements += inWtf
  patched.push(`${row.slug} (${count})`)

  if (dryRun) {
    console.log(`[dry-run] ${row.slug}: ${count} em dash(es) (${inWtf} in Where to find)`)
    continue
  }

  const { error: upErr } = await sb
    .from('guides')
    .update({ content_markdown: after, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (upErr) throw new Error(`${row.slug}: ${upErr.message}`)
  console.log(`Patched ${row.slug} (${count})`)
}

console.log(
  `\n${dryRun ? 'Would patch' : 'Patched'} ${patched.length} guide(s), ${totalReplacements} em dash → hyphen (${wtfReplacements} in Where to find).`,
)
if (outsideWarnings.length) {
  console.log(`\nEm dashes also fixed outside Where to find:`)
  console.log(outsideWarnings.join('\n'))
}
