/**
 * TWO·DEEP NFL depth pages (thetwodeep.com).
 *
 * Hunter Ansley (Two Deep LLC) told Ryan we may scrape for desk hole-fills.
 * Be polite: sequential, 4s between live fetches, cache 20h, team pages only.
 * Do not hit player / money / formation / college URLs from here.
 */
import fs from 'fs'
import path from 'path'
import { NFL_TEAM_META } from './nflTeamMetricsFromPbp.mjs'
import { normalizePlayerNameKey } from './pvalSleeperSync.mjs'

export const TWO_DEEP_ORIGIN = 'https://www.thetwodeep.com'
export const TWO_DEEP_USER_AGENT =
  'EdgeTiltTwoDeepFill/1.0 (+https://edgetilt.com; polite weekly PVAL hole-fill; Hunter Ansley permission; 1 NFL team page / 4s)'
export const TWO_DEEP_DELAY_MS = 4000
export const TWO_DEEP_CACHE_TTL_MS = 20 * 3600_000
export const TWO_DEEP_FETCH_TIMEOUT_MS = 20_000

/** Homepage slugs. wsh → WAS in our meta. */
export const TWO_DEEP_NFL_SLUGS = [
  'buf', 'mia', 'ne', 'nyj',
  'bal', 'cin', 'cle', 'pit',
  'hou', 'ind', 'jax', 'ten',
  'den', 'kc', 'lv', 'lac',
  'dal', 'nyg', 'phi', 'wsh',
  'chi', 'det', 'gb', 'min',
  'atl', 'car', 'no', 'tb',
  'ari', 'lar', 'sf', 'sea',
]

const ST_FAMILIES = new Set(['H', 'KR', 'LS', 'PK', 'PR', 'PT', 'KOS'])

const SLUG_TO_ABBR = {
  wsh: 'WAS',
}

export function twoDeepSlugToAbbr(slug) {
  const s = String(slug || '').trim().toLowerCase()
  return SLUG_TO_ABBR[s] || s.toUpperCase()
}

export function twoDeepTeamName(slug) {
  const abbr = twoDeepSlugToAbbr(slug)
  return NFL_TEAM_META[abbr]?.team_name || abbr
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSlotLabel(raw) {
  const m = String(raw || '')
    .toUpperCase()
    .match(/^([A-Z]{1,5})(\d{1,2})$/)
  if (!m) return null
  return { family: m[1], rank: Number(m[2]), raw: m[0] }
}

export function slotToBand(slot) {
  if (!slot) return null
  if (ST_FAMILIES.has(slot.family)) {
    return { bandKey: 'special', pos: 'ST', side: 'offense', skip: true }
  }
  const f = slot.family
  const rank = slot.rank
  if (f === 'QB') {
    return {
      bandKey: rank <= 1 ? 'starting_qb' : 'backup_qb',
      pos: 'QB',
      side: 'offense',
    }
  }
  if (f === 'RB' || f === 'HB' || f === 'FB') {
    return { bandKey: rank <= 1 ? 'rb1' : 'rb2', pos: 'RB', side: 'offense' }
  }
  if (f === 'LWR' || f === 'SWR' || f === 'WR' || f === 'RWR') {
    return {
      bandKey: rank <= 1 ? 'wr1' : rank === 2 ? 'wr2' : 'wr3',
      pos: 'WR',
      side: 'offense',
    }
  }
  if (f === 'TE' || f === 'TE2') {
    return { bandKey: rank <= 1 ? 'te1' : 'te2', pos: 'TE', side: 'offense' }
  }
  if (f === 'LT' || f === 'RT') {
    return { bandKey: 'ot', pos: 'OT', side: 'offense' }
  }
  if (f === 'LG' || f === 'RG' || f === 'C' || f === 'OG' || f === 'IOL') {
    return { bandKey: 'iol', pos: 'OL', side: 'offense' }
  }
  if (f === 'LOLB' || f === 'ROLB' || f === 'OLB' || f === 'EDGE') {
    return {
      bandKey: rank <= 1 ? 'edge1' : 'edge2',
      pos: 'EDGE',
      side: 'defense',
    }
  }
  if (f === 'DE' || f === 'DE2' || f === 'NT' || f === 'DT' || f === 'IDL') {
    return { bandKey: 'idl', pos: 'DT', side: 'defense' }
  }
  if (f === 'LILB' || f === 'RILB' || f === 'MLB' || f === 'WLB' || f === 'ILB' || f === 'LB') {
    return { bandKey: 'lb', pos: 'LB', side: 'defense' }
  }
  if (f === 'LCB' || f === 'RCB' || f === 'NCB' || f === 'CB' || f === 'SCB') {
    return {
      bandKey: rank <= 1 ? 'cb1' : 'cb2',
      pos: 'CB',
      side: 'defense',
    }
  }
  if (f === 'FS' || f === 'SS' || f === 'S') {
    return { bandKey: 's', pos: 'S', side: 'defense' }
  }
  return null
}

export function parseTwoDeepTeamHtml(html, slug) {
  const teamAbbr = twoDeepSlugToAbbr(slug)
  const teamName = twoDeepTeamName(slug)
  const players = []
  const linkRe =
    /<a class="td-plink"[^>]*href="\/nfl\/([a-z]+)\/players\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

  let match
  while ((match = linkRe.exec(html))) {
    const pageSlug = match[1]
    const playerSlug = match[2]
    const inner = match[3]
    const nameMatch = inner.match(/class="td-pname"[^>]*>([\s\S]*?)<\/span>/i)
    const playerName = stripTags(nameMatch?.[1] || '').replace(/\s+/g, ' ').trim()
    if (!playerName) continue

    const text = stripTags(inner)
    const slotMatch = text.match(/\b([A-Z]{1,5}\d{1,2})\b/)
    const slot = parseSlotLabel(slotMatch?.[1] || '')
    const snapMatch = text.match(/(\d+(?:\.\d+)?)%\s*snaps/i)
    const snapPct = snapMatch ? Number(snapMatch[1]) : null
    const band = slotToBand(slot)
    if (!band || band.skip) continue

    players.push({
      playerName,
      normalizedName: normalizePlayerNameKey(playerName),
      playerSlug,
      teamSlug: pageSlug,
      teamAbbr,
      teamName,
      slot: slot?.raw || null,
      slotFamily: slot?.family || null,
      depthRank: slot?.rank ?? null,
      snapPct: Number.isFinite(snapPct) ? snapPct : null,
      bandKey: band.bandKey,
      position: band.pos,
      side: band.side,
    })
  }

  const byKey = new Map()
  for (const row of players) {
    const key = row.normalizedName
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, row)
      continue
    }
    const prevSnap = prev.snapPct ?? -1
    const nextSnap = row.snapPct ?? -1
    if (nextSnap > prevSnap) byKey.set(key, row)
  }

  return {
    slug,
    teamAbbr,
    teamName,
    playerCount: byKey.size,
    players: [...byKey.values()],
  }
}

function cachePaths(cacheDir, slug) {
  return {
    html: path.join(cacheDir, `${slug}.html`),
    meta: path.join(cacheDir, `${slug}.meta.json`),
  }
}

function readFreshCache(cacheDir, slug, ttlMs) {
  const { html, meta } = cachePaths(cacheDir, slug)
  if (!fs.existsSync(html) || !fs.existsSync(meta)) return null
  try {
    const info = JSON.parse(fs.readFileSync(meta, 'utf8'))
    const age = Date.now() - Date.parse(info.fetchedAt || '')
    if (!Number.isFinite(age) || age > ttlMs) return null
    if (Number(info.status) !== 200) return null
    return fs.readFileSync(html, 'utf8')
  } catch {
    return null
  }
}

function writeCache(cacheDir, slug, html, status) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const { html: htmlPath, meta } = cachePaths(cacheDir, slug)
  fs.writeFileSync(htmlPath, html)
  fs.writeFileSync(
    meta,
    JSON.stringify(
      {
        slug,
        status,
        fetchedAt: new Date().toISOString(),
        bytes: html.length,
      },
      null,
      2,
    ),
  )
}

async function fetchTeamHtml(slug) {
  const url = `${TWO_DEEP_ORIGIN}/nfl/${slug}`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TWO_DEEP_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': TWO_DEEP_USER_AGENT,
        From: 'ops@edgetilt.com',
      },
    })
    const html = await res.text()
    return { status: res.status, html }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Load one NFL team page. Uses disk cache when fresh. Live fetches are sequential
 * and delayed by the caller.
 */
export async function loadTwoDeepTeamPage(slug, opts = {}) {
  const cacheDir = opts.cacheDir
  const ttlMs = opts.ttlMs ?? TWO_DEEP_CACHE_TTL_MS
  const allowCache = opts.allowCache !== false
  const s = String(slug || '').trim().toLowerCase()
  if (!s) throw new Error('missing Two Deep slug')

  if (allowCache && cacheDir) {
    const cached = readFreshCache(cacheDir, s, ttlMs)
    if (cached) {
      return { html: cached, fromCache: true, status: 200 }
    }
  }

  const { status, html } = await fetchTeamHtml(s)
  if (cacheDir && status === 200 && html) {
    writeCache(cacheDir, s, html, status)
  }
  return { html, fromCache: false, status }
}

export async function loadTwoDeepNflDepth(opts = {}) {
  const slugs = (opts.slugs || TWO_DEEP_NFL_SLUGS).map((s) => String(s).toLowerCase())
  const delayMs = Number.isFinite(Number(opts.delayMs))
    ? Number(opts.delayMs)
    : TWO_DEEP_DELAY_MS
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const teams = []
  let liveFetches = 0
  let cacheHits = 0
  let consecutiveFailures = 0

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]
    const page = await loadTwoDeepTeamPage(slug, opts)
    if (page.fromCache) {
      cacheHits += 1
    } else {
      liveFetches += 1
      if (i < slugs.length - 1 && delayMs > 0) {
        await sleep(delayMs)
      }
    }

    if (page.status === 429 || page.status === 503) {
      throw new Error(
        `Two Deep ${slug} → ${page.status}. Stopping so we do not retry-storm the site.`,
      )
    }
    if (page.status !== 200 || !page.html) {
      consecutiveFailures += 1
      if (consecutiveFailures >= 3) {
        throw new Error(`Two Deep failed ${consecutiveFailures} pages in a row (last ${slug} → ${page.status}).`)
      }
      onProgress?.({ slug, status: page.status, fromCache: page.fromCache, skipped: true })
      continue
    }
    consecutiveFailures = 0
    const parsed = parseTwoDeepTeamHtml(page.html, slug)
    teams.push(parsed)
    onProgress?.({
      slug,
      status: page.status,
      fromCache: page.fromCache,
      playerCount: parsed.playerCount,
    })
  }

  const players = teams.flatMap((t) => t.players)
  return {
    fetchedAt: new Date().toISOString(),
    liveFetches,
    cacheHits,
    teamCount: teams.length,
    playerCount: players.length,
    teams,
    players,
  }
}
