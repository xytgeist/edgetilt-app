#!/usr/bin/env node
/**
 * Mirror NFL player headshots ESPN → Cloudflare R2 (sports/nfl/players/{espn_id}.png)
 * via lounge-nfl-game-fantasy Edge (service role). Updates nfl_players.headshot_url.
 *
 *   node scripts/sync-nfl-player-headshots-r2.mjs --target=test
 *   node scripts/sync-nfl-player-headshots-r2.mjs --target=test --limit=40
 */
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const DEFAULT_LIMIT = 40
const MAX_BATCHES = 80
const PAUSE_MS = 400

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs(argv) {
  const out = { target: 'test', limit: DEFAULT_LIMIT }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice('--limit='.length)) || DEFAULT_LIMIT
  }
  return out
}

async function runBatch(url, key, limit) {
  const res = await fetch(`${url}/functions/v1/lounge-nfl-game-fantasy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ mirror_headshots: true, limit }),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 240)}`)
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv(args.target)
  const { url, key } = readSupabaseCredentials()
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  console.log(`NFL headshot R2 mirror  target=${args.target}  batch=${args.limit}`)

  let totalMirrored = 0
  let totalFailed = 0
  for (let n = 1; n <= MAX_BATCHES; n += 1) {
    const result = await runBatch(url, key, args.limit)
    totalMirrored += Number(result.mirrored) || 0
    totalFailed += Number(result.failed) || 0
    console.log(
      `[batch ${n}] scanned=${result.scanned} mirrored=${result.mirrored} failed=${result.failed} remaining≈${result.remaining}`,
    )
    if (Array.isArray(result.failures) && result.failures.length) {
      console.log('  sample failures:', JSON.stringify(result.failures.slice(0, 5)))
    }
    if (!result.scanned || result.remaining <= 0) {
      console.log('done')
      break
    }
    await sleep(PAUSE_MS)
  }

  console.log(`totals mirrored=${totalMirrored} failed=${totalFailed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
