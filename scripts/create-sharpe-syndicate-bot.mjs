/**
 * Create Sharpe Syndicate desk bot on a Supabase project (default: test).
 * Keeps run_state=stopped so odds cron does not duplicate Signal polls.
 *
 * Usage:
 *   node scripts/create-sharpe-syndicate-bot.mjs
 *   node scripts/create-sharpe-syndicate-bot.mjs --target=production
 *
 * Prod requires Ryan's explicit ask (this script refuses production unless --i-mean-it).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SLUG = 'sharpe-syndicate'
const HANDLE = 'sharpesyndicate'
const DISPLAY_NAME = 'Sharpe Syndicate'
const BIO = 'Four-desk ATS + totals cards. Full slate for Syndicate subscribers.'

function loadEnvFile(target) {
  const path = resolve(process.cwd(), `.env.supabase.${target}`)
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
  const raw = readFileSync(path, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
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
const meanIt = args.includes('--i-mean-it')

if (target === 'production' && !meanIt) {
  console.error('Refusing production create without --i-mean-it (Ryan explicit).')
  process.exit(1)
}

const env = loadEnvFile(target)
const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.supabase.' + target)
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: existing } = await admin
  .from('lounge_bot_accounts')
  .select('user_id, slug, run_state')
  .eq('slug', SLUG)
  .maybeSingle()

if (existing?.user_id) {
  console.log(JSON.stringify({ ok: true, already: true, ...existing, target }, null, 2))
  process.exit(0)
}

const email = `bot.${SLUG}.${crypto.randomUUID().slice(0, 8)}@bots.edgetilt.local`
const password = crypto.randomUUID() + crypto.randomUUID()

const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email,
  password,
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
  pipeline: 'odds_api',
  review_mode: 'automatic',
  display_name: DISPLAY_NAME,
  run_state: 'stopped',
  category_pills_default: ['sports'],
  max_posts_per_day: 12,
  max_posts_per_hour: 4,
  publish_score_threshold: 55,
  config: { product: 'syndicate_desk' },
})
if (botErr) {
  await admin.auth.admin.deleteUser(userId)
  console.error(botErr.message)
  process.exit(1)
}

const { error: oddsErr } = await admin.from('lounge_bot_odds_config').upsert({
  bot_user_id: userId,
  sports_keys: ['americanfootball_nfl', 'americanfootball_ncaaf', 'mma_mixed_martial_arts'],
  regions: ['us'],
  markets: ['h2h', 'spreads', 'totals'],
  min_edge_pct: 4,
  max_picks_per_run: 1,
  max_edge_alerts_per_day: 1,
  max_slate_posts_per_day: 12,
  daily_slate_enabled: false,
  coffee_covers_enabled: false,
  enabled: true,
})
if (oddsErr) {
  console.warn('odds_config upsert warning:', oddsErr.message)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      created: true,
      target,
      user_id: userId,
      slug: SLUG,
      handle: HANDLE,
      run_state: 'stopped',
      next: [
        'Staff sign-in-as-bot → Connect + go live fan sub (creates fan_room_id)',
        'Redeploy lounge-odds-poll so slate remount + creator_fan_only ship',
        'Do not set run_state=running (avoids duplicate Signal polls)',
      ],
    },
    null,
    2,
  ),
)
