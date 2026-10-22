/**
 * Create the Lounge NFL news bot (Jordan Pike, pipeline sports_news) on a Supabase project (default: test).
 * Starts stopped … set run_state = running in /?tab=bots after a dry run looks right.
 *
 * Usage:
 *   node scripts/create-sports-news-bot.mjs
 *   node scripts/create-sports-news-bot.mjs --target=production --i-mean-it
 *
 * Prod requires Ryan's explicit ask.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SLUG = 'jordan-pike'
const HANDLE = 'dreknowsball'
const DISPLAY_NAME = 'Jordan Pike'
const BIO = 'NFL news that moves lineups and lines.'

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name)
  if (!existsSync(path)) return {}
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
const targetArg = args.find((a) => a.startsWith('--target='))
const target = targetArg ? targetArg.split('=')[1] : 'test'
if (target === 'production' && !args.includes('--i-mean-it')) {
  console.error('Refusing production create without --i-mean-it (Ryan explicit).')
  process.exit(1)
}

const env = loadEnvFile(`.env.supabase.${target}`)
const master = loadEnvFile('.env.master')
// The gateway rejects the legacy service-role JWT on these projects; prefer the sb_secret key.
const key = master[target === 'production' ? 'PROD_SUPABASE_SECRET_KEY' : 'TEST_SUPABASE_SECRET_KEY'] || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!env.SUPABASE_URL || !key) {
  console.error(`Need SUPABASE_URL in .env.supabase.${target} and a secret key (.env.master)`)
  process.exit(1)
}
const admin = createClient(env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: existing } = await admin.from('lounge_bot_accounts').select('user_id, slug, run_state').eq('slug', SLUG).maybeSingle()
if (existing?.user_id) {
  console.log(JSON.stringify({ ok: true, already: true, ...existing, target }, null, 2))
  process.exit(0)
}

const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email: `bot.${SLUG}.${crypto.randomUUID().slice(0, 8)}@bots.edgetilt.local`,
  password: crypto.randomUUID() + crypto.randomUUID(),
  email_confirm: true,
  user_metadata: { is_bot: true, bot_slug: SLUG },
})
if (authErr || !authData.user?.id) {
  console.error(authErr?.message || 'Auth create failed')
  process.exit(1)
}
const userId = authData.user.id

const { error: profileErr } = await admin.from('profiles').insert({
  user_id: userId,
  handle: HANDLE,
  display_name: DISPLAY_NAME,
  bio: BIO,
  role: 'user',
  is_bot: true,
})
if (profileErr) {
  await admin.auth.admin.deleteUser(userId)
  console.error(profileErr.message)
  process.exit(1)
}

const { error: botErr } = await admin.from('lounge_bot_accounts').insert({
  user_id: userId,
  slug: SLUG,
  pipeline: 'sports_news',
  review_mode: 'automatic',
  display_name: DISPLAY_NAME,
  run_state: 'stopped',
  category_pills_default: ['sports'],
  max_posts_per_day: 10,
  max_posts_per_hour: 2,
  publish_score_threshold: 55,
  config: { sport: 'nfl' },
})
if (botErr) {
  await admin.auth.admin.deleteUser(userId)
  console.error(botErr.message)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, created: true, target, user_id: userId, slug: SLUG, handle: HANDLE, run_state: 'stopped' }, null, 2))
