/**
 * Sync Sleeper NFL players → public.nfl_players (+ optional ESPN headshot download).
 *
 * Usage:
 *   node scripts/sync-nfl-players.mjs --target=test
 *   node scripts/sync-nfl-players.mjs --target=test --download
 *   node scripts/sync-nfl-players.mjs --target=test --download --teams=ATL,GB
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, readSupabaseCredentials } from './lib/supabaseEnv.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'
const FANTASY_POS = new Set(['QB', 'RB', 'WR', 'TE'])
const HEADSHOT_CDN = (espnId) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

function parseArgs(argv) {
  const out = { target: 'test', download: false, teams: null, dryRun: false }
  for (const arg of argv) {
    if (arg === '--download') out.download = true
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length)
    else if (arg.startsWith('--teams=')) {
      out.teams = new Set(
        arg
          .slice('--teams='.length)
          .split(',')
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean),
      )
    }
  }
  return out
}

function normalizeTeam(team) {
  const t = String(team || '').trim().toUpperCase()
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  return t || null
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'EdgeTilt-nfl-players-sync/1.0' },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function downloadHeadshot(espnId, destPath) {
  const url = HEADSHOT_CDN(espnId)
  const res = await fetch(url, {
    headers: {
      Accept: 'image/png,image/*',
      Referer: 'https://www.espn.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  })
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 500) return false
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  await fs.promises.writeFile(destPath, buf)
  return true
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv(args.target)
  const { url, key } = readSupabaseCredentials()
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  console.log(`Fetching Sleeper players…`)
  const raw = await fetchJson(SLEEPER_PLAYERS)
  const rows = []
  for (const [sleeperId, p] of Object.entries(raw || {})) {
    if (!p || typeof p !== 'object') continue
    const team = normalizeTeam(p.team)
    const position = String(p.position || '').toUpperCase() || null
    const fantasy = Array.isArray(p.fantasy_positions)
      ? p.fantasy_positions.map((x) => String(x).toUpperCase())
      : []
    const activeish =
      Boolean(team) &&
      (FANTASY_POS.has(position) || fantasy.some((fp) => FANTASY_POS.has(fp))) &&
      String(p.status || '').toLowerCase() !== 'retired'
    if (!activeish) continue
    if (args.teams && !args.teams.has(team)) continue
    const espnId = p.espn_id != null && String(p.espn_id).trim() ? String(p.espn_id).trim() : null
    const localPath = espnId ? `/sports/nfl/players/${espnId}.png` : null
    rows.push({
      sleeper_id: String(sleeperId),
      espn_id: espnId,
      full_name: String(p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || sleeperId),
      position,
      team,
      fantasy_positions: fantasy,
      search_rank: Number.isFinite(Number(p.search_rank)) ? Number(p.search_rank) : null,
      status: p.status != null ? String(p.status) : null,
      headshot_url: espnId ? HEADSHOT_CDN(espnId) : null,
      local_headshot_path: localPath,
      updated_at: new Date().toISOString(),
    })
  }

  console.log(`Active fantasy-relevant rows: ${rows.length}`)
  if (args.dryRun) {
    console.log(rows.slice(0, 5))
    return
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const chunk = 200
  let wrote = 0
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    const { error } = await supabase.from('nfl_players').upsert(slice, { onConflict: 'sleeper_id' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
    wrote += slice.length
    process.stdout.write(`\rupserted ${wrote}/${rows.length}`)
  }
  console.log('')

  if (args.download) {
    const outDir = path.join(repoRoot, 'public', 'sports', 'nfl', 'players')
    await fs.promises.mkdir(outDir, { recursive: true })
    let ok = 0
    let skip = 0
    let fail = 0
    for (const row of rows) {
      if (!row.espn_id) {
        skip += 1
        continue
      }
      const dest = path.join(outDir, `${row.espn_id}.png`)
      if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
        skip += 1
        continue
      }
      const good = await downloadHeadshot(row.espn_id, dest)
      if (good) ok += 1
      else fail += 1
      if ((ok + fail) % 25 === 0) process.stdout.write(`\rdownload ok=${ok} fail=${fail} skip=${skip}`)
      await new Promise((r) => setTimeout(r, 40))
    }
    console.log(`\nheadshots ok=${ok} fail=${fail} skip=${skip} → ${outDir}`)
  }

  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
