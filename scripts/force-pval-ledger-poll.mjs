/**
 * One-shot: force NFL PVAL injury ledger sync (market file + hard-OUT residuals).
 * Does not post Lounge alerts. Works even if the odds bot is stopped.
 *
 * Usage:
 *   node scripts/force-pval-ledger-poll.mjs --target=test
 *   node scripts/force-pval-ledger-poll.mjs --target=production
 *   node scripts/force-pval-ledger-poll.mjs --target=both
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv(file) {
  const p = path.join(root, file)
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function parseTarget(argv) {
  let target = 'both'
  for (const a of argv) {
    if (a.startsWith('--target=')) target = a.slice('--target='.length)
  }
  if (!['test', 'production', 'both'].includes(target)) {
    throw new Error('--target must be test|production|both')
  }
  return target
}

async function forceLedger(target) {
  const env = {
    ...loadEnv('.env'),
    ...loadEnv(`.env.supabase.${target}`),
  }
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Missing SUPABASE_URL / SERVICE_ROLE for ${target}`)

  console.log(`[force-pval-ledger] ${target} → pval_injury_ledger…`)
  const res = await fetch(`${url}/functions/v1/lounge-odds-poll`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slug: 'sports-odds',
      action: 'pval_injury_ledger',
      force: true,
      dryRun: false,
    }),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 1000) }
  }
  console.log(`[force-pval-ledger] ${target} HTTP ${res.status}`)
  console.log(JSON.stringify(data, null, 2).slice(0, 2500))
  if (!res.ok || data?.error) {
    throw new Error(`${target} failed: ${data?.error || res.status}`)
  }
  return data
}

const target = parseTarget(process.argv.slice(2))
const targets = target === 'both' ? ['test', 'production'] : [target]
for (const t of targets) {
  await forceLedger(t)
}
