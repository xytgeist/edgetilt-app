/**
 * One-off: strip InvestingLive HTML leftovers from Luna-era wire bot captions.
 *
 * Usage:
 *   node scripts/repair-bot-html-captions.mjs --target=production --i-mean-it
 *   node scripts/repair-bot-html-captions.mjs --target=test --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
}

function decodeOnce(s) {
  return String(s || '')
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .replace(/&#0*(\d+);/g, (m, n) => {
      const code = Number(n)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => {
      const code = parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m
    })
}

function decodeHtmlEntities(raw) {
  let s = String(raw || '')
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(s)
    if (next === s) break
    s = next
  }
  return s
}

function stripHtmlToPlainText(raw) {
  let s = decodeHtmlEntities(String(raw || ''))
  if (!s) return ''
  s = s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\s*\/\s*p\s*>/gi, ' ')
    .replace(/<\s*p\b[^>]*>/gi, ' ')
    .replace(/<\s*\/\s*li\s*>/gi, ' ')
    .replace(/<\s*li\b[^>]*>/gi, ' • ')
    .replace(/<[^>]+>/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

function cleanBody(text) {
  let s = stripHtmlToPlainText(text)
  s = s.replace(/https?:\/\/[^\s<>"']+/gi, ' ')
  s = s.replace(/\bwww\.[^\s<>"']+/gi, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Keep headline; strip HTML/URLs from synopsis. Drop synopsis if it was markup-only junk. */
function repairCaption(caption) {
  const raw = String(caption || '')
  if (!/<[a-z]|<\/[a-z]|&lt;[a-z]/i.test(raw)) return null

  const parts = raw.split(/\n\n+/)
  const headline = stripHtmlToPlainText(parts[0] || '').trim()
  if (!headline) return null

  const bodyRaw = parts.slice(1).join('\n\n')
  const body = cleanBody(bodyRaw)
  // Wrap dumps that are mostly linked headlines → headline only
  const looksLikeWrapDump =
    /^headlines?:/i.test(body) ||
    ((body.match(/•/g) || []).length >= 5 && body.length > 400)

  if (!body || looksLikeWrapDump) return headline
  // Cap repaired synopsis so we do not leave a novel under the wire line
  const clipped = body.length > 420 ? `${body.slice(0, 419).trim()}…` : body
  return `${headline}\n\n${clipped}`
}

function loadEnvFile(target) {
  const path = resolve(process.cwd(), `.env.supabase.${target}`)
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

const args = process.argv.slice(2)
const target = (args.find((a) => a.startsWith('--target=')) || '--target=test').split('=')[1]
const dryRun = args.includes('--dry-run')
const meanIt = args.includes('--i-mean-it')

if (target === 'production' && !meanIt && !dryRun) {
  console.error('Refusing production repair without --i-mean-it (or --dry-run).')
  process.exit(1)
}

const env = loadEnvFile(target)
const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(`Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.supabase.${target}`)
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: bots, error: botErr } = await admin.from('lounge_bot_accounts').select('user_id')
if (botErr) throw botErr
const botIds = (bots || []).map((b) => b.user_id)
if (!botIds.length) {
  console.log('No bot accounts.')
  process.exit(0)
}

const { data: posts, error: postErr } = await admin
  .from('community_feed_posts')
  .select('id, caption, created_at, user_id')
  .in('user_id', botIds)
  .gte('created_at', '2026-10-14T00:00:00Z')
  .order('created_at', { ascending: false })
  .limit(200)

if (postErr) throw postErr

const bad = (posts || []).filter((p) => /<[a-z]|<\/[a-z]|&lt;[a-z]/i.test(String(p.caption || '')))
console.log(`target=${target} scanned=${posts?.length || 0} html_bad=${bad.length} dryRun=${dryRun}`)

let updated = 0
for (const post of bad) {
  const next = repairCaption(post.caption)
  if (!next || next === post.caption) {
    console.log(`skip ${post.id}`)
    continue
  }
  console.log(`\n${post.id} ${post.created_at}`)
  console.log(`  before (${post.caption.length}): ${post.caption.slice(0, 120).replace(/\n/g, '\\n')}`)
  console.log(`  after  (${next.length}): ${next.slice(0, 160).replace(/\n/g, '\\n')}`)
  if (dryRun) continue
  const { error } = await admin.from('community_feed_posts').update({ caption: next }).eq('id', post.id)
  if (error) {
    console.error(`  FAIL ${error.message}`)
    continue
  }
  updated += 1
}

console.log(`\nDone. updated=${updated}`)
