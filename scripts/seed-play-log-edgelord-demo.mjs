/**
 * Seed random Play Logbook entries for @edgelord (chart / Analyze QA).
 *
 * Usage:
 *   node scripts/seed-play-log-edgelord-demo.mjs --target=test
 *   node scripts/seed-play-log-edgelord-demo.mjs --target=test --count=100
 *   node scripts/seed-play-log-edgelord-demo.mjs --target=test --cleanup
 */

import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, createSupabaseServiceClient, targetHuman } from './lib/supabaseEnv.mjs'

export const PLAY_LOG_DEMO_SEED_NOTES = '[play-log-demo-seed]'

const DEFAULT_HANDLE = 'edgelord'
const DEFAULT_COUNT = 100
const BATCH = 25

const PREFERRED_TEMPLATE_SLUGS = [
  'phoenix-link',
  'buffalo-link',
  'must-hit-by',
  'stack-up-pays',
  '88-fortunes',
]

function parseArgs(argv) {
  let target = 'test'
  let count = DEFAULT_COUNT
  let cleanup = false
  let handle = DEFAULT_HANDLE
  for (const arg of argv.slice(2)) {
    if (arg === '--cleanup') cleanup = true
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--count=')) count = Math.max(1, Number(arg.slice('--count='.length)) || DEFAULT_COUNT)
    else if (arg.startsWith('--handle=')) handle = arg.slice('--handle='.length).trim()
  }
  return { target, count, cleanup, handle }
}

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function roundMoney(n) {
  return Math.round(n * 100) / 100
}

function randomCapturedAt(daysBack) {
  const now = Date.now()
  const ms = daysBack * 24 * 60 * 60 * 1000
  return new Date(now - Math.random() * ms).toISOString()
}

function randomPlayValues() {
  const betSize = Math.round(rand(1, 25))
  const denom = pick([0.01, 0.02, 0.05, 0.1])
  const moneyIn = roundMoney(rand(150, 2500))
  const targetRtp = rand(88, 108)
  const noise = rand(-0.12, 0.12)
  const moneyOut = roundMoney(Math.max(0, moneyIn * (targetRtp / 100 + noise)))
  const spins = Math.round(rand(80, 900))
  const bonuses = Math.max(0, Math.round(spins * rand(0.005, 0.04)))
  const currentEvRtp = Math.round(rand(96, 104) * 10) / 10

  /** @type {Record<string, number | string>} */
  const values = {
    bet_size: betSize,
    denom: String(denom),
    money_in: moneyIn,
    money_out: moneyOut,
    spin_count: spins,
    bonus_count: bonuses,
  }

  if (Math.random() > 0.35) {
    values.current_ev_rtp = currentEvRtp
  }

  if (Math.random() > 0.85) {
    values.acquisition_fee = roundMoney(rand(5, 45))
  }

  return values
}

async function main() {
  const { target, count, cleanup, handle } = parseArgs(process.argv)
  loadSupabaseEnv(target === 'production' ? 'production' : 'test')
  const supabase = createSupabaseServiceClient(createClient)

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('user_id, handle')
    .ilike('handle', handle)
    .maybeSingle()

  if (profErr) throw profErr
  if (!profile?.user_id) {
    throw new Error(`No profile found for handle "${handle}" on ${targetHuman(target)}.`)
  }

  const userId = profile.user_id

  if (cleanup) {
    const { data: existing, error: listErr } = await supabase
      .from('play_log_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('notes', PLAY_LOG_DEMO_SEED_NOTES)
    if (listErr) throw listErr
    const ids = (existing || []).map(r => r.id)
    if (!ids.length) {
      console.log(`No demo seed rows to remove for @${handle}.`)
      return
    }
    const { error: delErr } = await supabase.from('play_log_entries').delete().in('id', ids)
    if (delErr) throw delErr
    console.log(`Removed ${ids.length} demo seed play(s) for @${handle} on ${targetHuman(target)}.`)
    return
  }

  const { data: templates, error: tplErr } = await supabase
    .from('play_log_game_templates')
    .select('id, slug, display_name')
    .eq('is_system', true)
  if (tplErr) throw tplErr
  if (!templates?.length) throw new Error('No system play log templates found.')

  const bySlug = new Map(templates.map(t => [String(t.slug || ''), t]))
  const pool = PREFERRED_TEMPLATE_SLUGS.map(s => bySlug.get(s)).filter(Boolean)
  const templatePool = pool.length ? pool : templates

  const casinos = ['Aria', 'Bellagio', 'Cosmopolitan', 'Wynn', 'Resorts World', 'Venetian', 'MGM Grand']

  /** @type {object[]} */
  const rows = []
  for (let i = 0; i < count; i += 1) {
    const tpl = pick(templatePool)
    rows.push({
      user_id: userId,
      template_id: tpl.id,
      captured_at: randomCapturedAt(365),
      casino_name: pick(casinos),
      notes: PLAY_LOG_DEMO_SEED_NOTES,
      values: randomPlayValues(),
    })
  }

  rows.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())

  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error: insErr } = await supabase.from('play_log_entries').insert(chunk)
    if (insErr) throw insErr
    inserted += chunk.length
  }

  console.log(
    `Inserted ${inserted} demo play log entries for @${handle} on ${targetHuman(target)} (${PLAY_LOG_DEMO_SEED_NOTES}).`,
  )
  console.log(`Cleanup: node scripts/seed-play-log-edgelord-demo.mjs --target=${target} --cleanup`)
}

main().catch(err => {
  console.error(err?.message || err)
  process.exit(1)
})
