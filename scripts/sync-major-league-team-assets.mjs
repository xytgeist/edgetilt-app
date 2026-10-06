#!/usr/bin/env node
/**
 * Download NBA / NHL / MLB / MLS team logos (+ light/dark wash variants) and
 * regenerate the client catalogs (colors, names, ESPN ids).
 *
 * Source: ESPN public team boards. Same job as `sync-cfb-team-assets.mjs` for
 * the non-football hubs.
 *
 *   node scripts/sync-major-league-team-assets.mjs
 *   node scripts/sync-major-league-team-assets.mjs --dry-run
 *   node scripts/sync-major-league-team-assets.mjs --league=nba
 *   npm run sports:teams:assets
 *
 * After a catalog regen, refresh
 * `supabase/functions/_shared/loungeSportsMajorLeagueAbbrevs.ts` so Edge
 * slate keys stay aligned with client kits.
 */
import fs from 'fs'
import path from 'path'
import { repoRoot } from './lib/supabaseEnv.mjs'

const UA = 'EdgeTiltSportsAssets/1.0'
const CONCURRENCY = 8

const LEAGUES = [
  {
    id: 'nba',
    exportName: 'NBA_TEAM_CATALOG',
    espnPath: 'basketball/nba',
    catalogFile: 'nbaTeamCatalog.generated.js',
  },
  {
    id: 'nhl',
    exportName: 'NHL_TEAM_CATALOG',
    espnPath: 'hockey/nhl',
    catalogFile: 'nhlTeamCatalog.generated.js',
  },
  {
    id: 'mlb',
    exportName: 'MLB_TEAM_CATALOG',
    espnPath: 'baseball/mlb',
    catalogFile: 'mlbTeamCatalog.generated.js',
  },
  {
    id: 'mls',
    exportName: 'MLS_TEAM_CATALOG',
    espnPath: 'soccer/usa.1',
    catalogFile: 'mlsTeamCatalog.generated.js',
  },
]

/** Odds / Rundown letter codes that are not the ESPN board abbrev. */
const EXTRA_ALIASES = {
  nba: {
    GSW: 'GS',
    SAS: 'SA',
    NYK: 'NY',
    NOP: 'NO',
    PHO: 'PHX',
    WAS: 'WSH',
    UTA: 'UTAH',
    BRK: 'BKN',
    CHO: 'CHA',
  },
  nhl: {
    TBL: 'TB',
    LAK: 'LA',
    SJS: 'SJ',
    NJD: 'NJ',
    MTL: 'MTL',
    MON: 'MTL',
    WAS: 'WSH',
    VEG: 'VGK',
    ARZ: 'UTAH',
    ARI: 'UTAH',
  },
  mlb: {
    CHW: 'CHW',
    CWS: 'CHW',
    KCR: 'KC',
    SDP: 'SD',
    SFG: 'SF',
    TBR: 'TB',
    WAS: 'WSH',
    OAK: 'ATH',
    AZ: 'ARI',
  },
  mls: {
    LAG: 'LA',
    LAFC: 'LAFC',
    NER: 'NE',
    NYC: 'NYC',
    NYRB: 'RBNY',
    NY: 'RBNY',
    SKC: 'SKC',
    RSL: 'RSL',
    DCU: 'DC',
    ATL: 'ATL',
  },
}

function parseArgs(argv) {
  const league = String(argv.find((a) => a.startsWith('--league=')) || '').split('=')[1] || ''
  return { dryRun: argv.includes('--dry-run'), league: league.toLowerCase() }
}

function normHex(value, fallback = '#3F3F46') {
  let s = String(value || '').trim()
  if (!s) return fallback
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return fallback
  return s.toUpperCase()
}

function pickLogoHref(espnTeam, preferDark) {
  const logos = Array.isArray(espnTeam?.logos) ? espnTeam.logos : []
  const want = preferDark ? 'dark' : 'default'
  for (const lg of logos) {
    const rel = Array.isArray(lg.rel) ? lg.rel.map(String) : []
    if (rel.includes(want) && !rel.includes('scoreboard') && lg.href) return String(lg.href)
  }
  for (const lg of logos) {
    const rel = Array.isArray(lg.rel) ? lg.rel.map(String) : []
    if (rel.includes(want) && lg.href) return String(lg.href)
  }
  return ''
}

async function downloadPng(url, dest, { dryRun }) {
  if (!url) return { ok: false, status: 'no-url' }
  if (dryRun) return { ok: true, skipped: true }
  const res = await fetch(url, {
    headers: {
      Accept: 'image/png,image/*,*/*',
      Referer: 'https://www.espn.com/',
      'User-Agent': UA,
    },
  })
  if (!res.ok) return { ok: false, status: res.status }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 200) return { ok: false, status: 'tiny' }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  return { ok: true, bytes: buf.length }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i
      i += 1
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

async function loadEspnBoard(espnPath) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/teams?limit=200`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`ESPN ${espnPath} ${res.status}`)
  const pack = await res.json()
  const teams = []
  for (const sport of pack.sports || []) {
    for (const league of sport.leagues || []) {
      for (const row of league.teams || []) {
        const team = row.team || row
        if (team?.id) teams.push(team)
      }
    }
  }
  return teams
}

function buildRow(leagueId, team) {
  const abbrev = String(team.abbreviation || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
  const location = String(team.location || '').trim()
  const nickname = String(team.name || team.nickname || '').trim()
  const display = String(team.displayName || '').trim() || [location, nickname].filter(Boolean).join(' ')
  const shortName = String(team.shortDisplayName || '').trim()
  const names = [...new Set([display, location, nickname, shortName, `${location} ${nickname}`.trim()].filter(Boolean))]
  const aliases = []
  const extra = EXTRA_ALIASES[leagueId] || {}
  for (const [from, to] of Object.entries(extra)) {
    if (to === abbrev && from !== abbrev) aliases.push(from)
  }
  return {
    abbrev,
    espn: String(team.id || '').trim(),
    espnSlug: String(team.slug || '').trim(),
    color: normHex(team.color),
    color2: normHex(team.alternateColor, '#FFFFFF'),
    mascot: nickname || location,
    location,
    names,
    aliases,
    defaultUrl: pickLogoHref(team, false),
    darkUrl: pickLogoHref(team, true),
  }
}

function writeCatalog(league, rows) {
  const sorted = [...rows].sort((a, b) => a.abbrev.localeCompare(b.abbrev))
  const body = sorted
    .map((r) => {
      const names = JSON.stringify(r.names)
      const aliases = JSON.stringify(r.aliases || [])
      return (
        `  { abbrev: ${JSON.stringify(r.abbrev)}, espn: ${JSON.stringify(r.espn)}, ` +
        `espnSlug: ${JSON.stringify(r.espnSlug)}, color: ${JSON.stringify(r.color)}, ` +
        `color2: ${JSON.stringify(r.color2)}, mascot: ${JSON.stringify(r.mascot)}, ` +
        `location: ${JSON.stringify(r.location)}, names: ${names}, aliases: ${aliases} },`
      )
    })
    .join('\n')
  const dest = path.join(repoRoot, 'src/features/lounge', league.catalogFile)
  const src =
    `/** Auto-generated by scripts/sync-major-league-team-assets.mjs … do not edit by hand. */\n` +
    `export const ${league.exportName} = [\n${body}\n]\n`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, src)
  return dest
}

async function syncLeague(league, args) {
  const logosDir = path.join(repoRoot, 'public/sports', league.id, 'logos')
  console.log(`\n${league.id.toUpperCase()}  espn=${league.espnPath}  dryRun=${args.dryRun}`)
  const teams = await loadEspnBoard(league.espnPath)
  console.log(`  ESPN board=${teams.length}`)
  const rows = []
  const jobs = []
  const used = new Set()
  for (const team of teams) {
    const row = buildRow(league.id, team)
    if (!row.abbrev || !row.espn) {
      console.warn(`  skip incomplete`, team.displayName)
      continue
    }
    if (used.has(row.abbrev)) {
      console.warn(`  skip duplicate abbrev ${row.abbrev}`, team.displayName)
      continue
    }
    used.add(row.abbrev)
    rows.push(row)
    jobs.push({
      abbrev: row.abbrev,
      defaultUrl: row.defaultUrl,
      darkUrl: row.darkUrl,
      dest: path.join(logosDir, `${row.abbrev}.png`),
      destLight: path.join(logosDir, `${row.abbrev}-light.png`),
    })
  }
  let ok = 0
  let fail = 0
  await mapPool(jobs, CONCURRENCY, async (job) => {
    const a = await downloadPng(job.defaultUrl, job.dest, args)
    const b = await downloadPng(job.darkUrl, job.destLight, args)
    if (a.ok) {
      if (!b.ok && !args.dryRun) {
        try {
          fs.copyFileSync(job.dest, job.destLight)
        } catch {
          /* ignore */
        }
      }
      ok += 1
      process.stdout.write('.')
    } else {
      fail += 1
      console.warn(`\n  logo fail ${job.abbrev}`, a, b)
    }
  })
  console.log(`\n  logos ok=${ok} fail=${fail}`)
  if (!args.dryRun) {
    const dest = writeCatalog(league, rows)
    console.log(`  catalog ${path.relative(repoRoot, dest)} (${rows.length})`)
  }
  return { id: league.id, rows: rows.length, ok, fail }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const list = args.league ? LEAGUES.filter((l) => l.id === args.league) : LEAGUES
  if (!list.length) throw new Error(`Unknown league ${args.league}`)
  const results = []
  for (const league of list) results.push(await syncLeague(league, args))
  console.log('\nDone', results)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
