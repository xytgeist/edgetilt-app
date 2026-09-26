#!/usr/bin/env node
/**
 * Download FBS college football team logos (+ light/dark wash variants) and
 * regenerate the client catalog (colors, names, ESPN ids).
 * Also pulls FCS / non-FBS opponents from the current ESPN scoreboard window
 * so cupcake games (Howard Bison, etc.) get local marks.
 *
 * Source: CFBD /teams/fbs + ESPN team board + ESPN scoreboard.
 * Helmets: no public ESPN/CFBD helmet pack (NFL cartoon helmets were removed).
 *
 *   node scripts/sync-cfb-team-assets.mjs
 *   node scripts/sync-cfb-team-assets.mjs --dry-run
 *   npm run cfb:teams:assets
 *
 * Requires CFBD_API_KEY in .env.supabase.test (or env).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadSupabaseEnv, repoRoot } from './lib/supabaseEnv.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const YEAR = 2026
const LOGOS_DIR = path.join(repoRoot, 'public/sports/cfb/logos')
const CATALOG_OUT = path.join(repoRoot, 'src/features/lounge/cfbTeamCatalog.generated.js')
const ESPN_MAP_OUT = path.join(repoRoot, 'supabase/functions/_shared/cfbTeamEspnByAbbrev.json')
const NAME_ABBREV_OUT = path.join(repoRoot, 'supabase/functions/_shared/cfbTeamNameAbbrev.json')
const ESPN_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000'
const UA = 'EdgeTiltCfbAssets/1.0'
const CONCURRENCY = 8

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') }
}

function normHex(value, fallback = '#3f3f46') {
  let s = String(value || '').trim()
  if (!s) return fallback
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return fallback
  return s.toUpperCase()
}

async function cfbdFetch(apiKey, pathAndQuery) {
  const url = `https://api.collegefootballdata.com${pathAndQuery}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`CFBD ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function loadEspnById() {
  const res = await fetch(ESPN_TEAMS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`ESPN teams ${res.status}`)
  const pack = await res.json()
  const map = new Map()
  for (const sport of pack.sports || []) {
    for (const league of sport.leagues || []) {
      for (const row of league.teams || []) {
        const team = row.team || row
        const id = String(team.id || '').trim()
        if (id) map.set(id, team)
      }
    }
  }
  return map
}

/** Non-FBS teams on the live ESPN scoreboard (±4 days) so cupcake logos exist. */
async function loadEspnSlateExtras(haveEspnIds) {
  const extras = new Map()
  const base = new Date()
  for (let i = -4; i <= 4; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '')
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${yyyymmdd}&limit=300`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    })
    if (!res.ok) continue
    const pack = await res.json()
    for (const ev of pack.events || []) {
      for (const c of ev.competitions?.[0]?.competitors || []) {
        const t = c.team || {}
        const id = String(t.id || '').trim()
        if (!id || haveEspnIds.has(id) || extras.has(id)) continue
        const abbrev = String(t.abbreviation || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, '')
        if (!abbrev) continue
        const school = String(t.location || t.shortDisplayName || '').trim()
        const display = String(t.displayName || t.name || '').trim()
        const mascot = display.replace(new RegExp(`^${school}\\s*`, 'i'), '').trim() || school
        const logos = Array.isArray(t.logos) ? t.logos : []
        const defaultLogo =
          logos.find((l) => (l.rel || []).includes('default'))?.href ||
          logos[0]?.href ||
          `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
        const darkLogo =
          logos.find((l) => (l.rel || []).includes('dark'))?.href ||
          `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${id}.png`
        extras.set(id, {
          abbrev,
          espn: id,
          espnSlug: String(t.slug || '').trim(),
          color: normHex(t.color),
          color2: normHex(t.alternateColor, '#FFFFFF'),
          conference: 'FCS',
          mascot,
          school: school || display,
          names: [...new Set([display, school, mascot, `${school} ${mascot}`.trim()].filter(Boolean))],
          defaultUrl: String(defaultLogo),
          darkUrl: String(darkLogo),
        })
      }
    }
  }
  return extras
}

function pickLogoHref(espnTeam, preferDark) {
  const logos = Array.isArray(espnTeam?.logos) ? espnTeam.logos : []
  const want = preferDark ? 'dark' : 'default'
  for (const lg of logos) {
    const rel = Array.isArray(lg.rel) ? lg.rel.map(String) : []
    if (rel.includes(want) && lg.href) return String(lg.href)
  }
  const id = String(espnTeam?.id || '').trim()
  if (!id) return ''
  return preferDark
    ? `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${id}.png`
    : `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
}

async function downloadPng(url, dest, { dryRun }) {
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

function buildCatalogRow(cfbd, espn) {
  const espnId = String(cfbd.id || espn?.id || '').trim()
  // File/URL-safe … CFBD uses TA&M which breaks query strings in logo paths.
  const abbrev = String(cfbd.abbreviation || espn?.abbreviation || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
  const school = String(cfbd.school || espn?.location || '').trim()
  const mascot = String(cfbd.mascot || espn?.name || espn?.nickname || '').trim()
  const display =
    String(espn?.displayName || '').trim() ||
    [school, mascot].filter(Boolean).join(' ').trim() ||
    school
  const color = normHex(espn?.color || cfbd.color, '#3F3F46')
  const color2 = normHex(espn?.alternateColor || cfbd.alt_color, '#FFFFFF')
  const names = [...new Set([display, school, mascot, `${school} ${mascot}`.trim()].filter(Boolean))]
  return {
    abbrev,
    espn: espnId,
    espnSlug: String(espn?.slug || '').trim(),
    color,
    color2,
    conference: String(cfbd.conference || '').trim(),
    names,
    mascot,
    school,
  }
}

function writeCatalog(rows) {
  const sorted = [...rows].sort((a, b) => a.abbrev.localeCompare(b.abbrev))
  const body = sorted
    .map((r) => {
      const names = JSON.stringify(r.names)
      return (
        `  { abbrev: ${JSON.stringify(r.abbrev)}, espn: ${JSON.stringify(r.espn)}, ` +
        `espnSlug: ${JSON.stringify(r.espnSlug)}, color: ${JSON.stringify(r.color)}, ` +
        `color2: ${JSON.stringify(r.color2)}, conference: ${JSON.stringify(r.conference)}, ` +
        `mascot: ${JSON.stringify(r.mascot)}, school: ${JSON.stringify(r.school)}, ` +
        `names: ${names} },`
      )
    })
    .join('\n')
  const src =
    `/** Auto-generated by scripts/sync-cfb-team-assets.mjs … do not edit by hand. */\n` +
    `export const CFB_TEAM_CATALOG = [\n${body}\n]\n`
  fs.mkdirSync(path.dirname(CATALOG_OUT), { recursive: true })
  fs.writeFileSync(CATALOG_OUT, src)
  const espnMap = {}
  for (const r of sorted) {
    if (r.abbrev && r.espn) espnMap[r.abbrev] = String(r.espn)
  }
  fs.mkdirSync(path.dirname(ESPN_MAP_OUT), { recursive: true })
  fs.writeFileSync(ESPN_MAP_OUT, `${JSON.stringify(espnMap)}\n`)
  const nameAbbrev = {}
  const fold = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  for (const r of sorted) {
    const mascotN = fold(r.mascot)
    const schoolN = fold(r.school)
    const keys = [r.school, r.names?.[0], String(r.espnSlug || '').replace(/-/g, ' ')]
    for (const n of keys) {
      const p = fold(n)
      if (!p || p.length < 3) continue
      if (mascotN && p === mascotN && p !== schoolN) continue
      nameAbbrev[p] = r.abbrev
    }
  }
  fs.writeFileSync(NAME_ABBREV_OUT, `${JSON.stringify(nameAbbrev)}\n`)
  return sorted.length
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadSupabaseEnv('test')
  const apiKey = process.env.CFBD_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing CFBD_API_KEY')

  console.log(`CFB team assets  year=${YEAR}  dryRun=${args.dryRun}`)
  const [cfbdTeams, espnById] = await Promise.all([
    cfbdFetch(apiKey, `/teams/fbs?year=${YEAR}`),
    loadEspnById(),
  ])
  if (!Array.isArray(cfbdTeams) || !cfbdTeams.length) {
    throw new Error('CFBD returned no FBS teams')
  }
  console.log(`CFBD FBS=${cfbdTeams.length}  ESPN board=${espnById.size}`)

  const rows = []
  const jobs = []
  const usedAbbrev = new Set()
  const haveEspnIds = new Set()
  for (const cfbd of cfbdTeams) {
    const espnId = String(cfbd.id || '').trim()
    const espn = espnById.get(espnId) || null
    const row = buildCatalogRow(cfbd, espn)
    if (!row.abbrev || !row.espn) {
      console.warn(`skip incomplete team`, cfbd.school)
      continue
    }
    rows.push(row)
    usedAbbrev.add(row.abbrev)
    haveEspnIds.add(row.espn)
    const defaultUrl =
      pickLogoHref(espn, false) ||
      `https://a.espncdn.com/i/teamlogos/ncaa/500/${row.espn}.png`
    const darkUrl =
      pickLogoHref(espn, true) ||
      `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${row.espn}.png`
    jobs.push({
      abbrev: row.abbrev,
      defaultUrl,
      darkUrl,
      dest: path.join(LOGOS_DIR, `${row.abbrev}.png`),
      destLight: path.join(LOGOS_DIR, `${row.abbrev}-light.png`),
    })
  }

  const slateExtras = await loadEspnSlateExtras(haveEspnIds)
  console.log(`ESPN slate FCS extras=${slateExtras.size}`)
  for (const extra of slateExtras.values()) {
    let abbrev = extra.abbrev
    if (usedAbbrev.has(abbrev)) abbrev = `${abbrev}${extra.espn.slice(-2)}`
    usedAbbrev.add(abbrev)
    haveEspnIds.add(extra.espn)
    const { defaultUrl, darkUrl, ...row } = { ...extra, abbrev }
    rows.push(row)
    jobs.push({
      abbrev,
      defaultUrl,
      darkUrl,
      dest: path.join(LOGOS_DIR, `${abbrev}.png`),
      destLight: path.join(LOGOS_DIR, `${abbrev}-light.png`),
    })
  }

  let ok = 0
  let fail = 0
  await mapPool(jobs, CONCURRENCY, async (job) => {
    const a = await downloadPng(job.defaultUrl, job.dest, args)
    const b = await downloadPng(job.darkUrl, job.destLight, args)
    if (a.ok && (b.ok || args.dryRun)) {
      if (!b.ok && !args.dryRun && a.ok) fs.copyFileSync(job.dest, job.destLight)
      ok += 1
      process.stdout.write('.')
    } else {
      fail += 1
      console.warn(`\nlogo fail ${job.abbrev}`, a, b)
    }
  })
  console.log(`\nlogos ok=${ok} fail=${fail}`)

  const n = writeCatalog(rows)
  console.log(`catalog wrote ${n} teams → ${path.relative(repoRoot, CATALOG_OUT)}`)
  console.log(`logos dir ${path.relative(repoRoot, LOGOS_DIR)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
