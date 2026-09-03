/**
 * UFC Stats (ufcstats.com) session + fighter page scrape.
 * Site gates with a tiny JS PoW (`/__c`); we solve it in Node and keep the cookie.
 */
import crypto from 'node:crypto'

const UA =
  'Mozilla/5.0 (compatible; EdgeTiltSyndicateBot/1.0; +https://sharpesyndicate.com)'

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg).digest('hex')
}

function setCookiePairs(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

function applySetCookies(jar, res) {
  for (const c of setCookiePairs(res)) {
    const [pair] = String(c).split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Open a session past the ufcstats.com browser check.
 * @returns {Promise<Map<string, string>>}
 */
export async function openUfcStatsSession() {
  const jar = new Map()
  const r1 = await fetch('http://ufcstats.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  })
  const html = await r1.text()
  applySetCookies(jar, r1)

  const nonce = (html.match(/nonce="([^"]+)"/) || [])[1]
  if (!nonce) {
    // Already past gate (or layout changed) ... return whatever cookies we have.
    if (html.includes('UFC Stats') || html.includes('fighter')) return jar
    throw new Error('ufcstats.com: could not find PoW nonce')
  }

  const zeros = Number((html.match(/new Array\((\d+)\+1\)\.join\('0'\)/) || [])[1] || 2)
  const target = '0'.repeat(Math.max(1, zeros))
  let n = 0
  while (!sha256Hex(`${nonce}:${n}`).startsWith(target)) n += 1

  const r2 = await fetch('http://ufcstats.com/__c', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
    },
    body: `nonce=${encodeURIComponent(nonce)}&n=${n}`,
    redirect: 'manual',
  })
  applySetCookies(jar, r2)
  if (!jar.has('_fmc') && r2.status >= 400) {
    throw new Error(`ufcstats.com PoW failed HTTP ${r2.status}`)
  }
  return jar
}

async function fetchHtml(url, jar) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      Cookie: cookieHeader(jar),
    },
  })
  const html = await res.text()
  if (html.includes('Checking your browser') && html.includes('nonce=')) {
    // Session expired ... refresh once
    const fresh = await openUfcStatsSession()
    for (const [k, v] of fresh) jar.set(k, v)
    const res2 = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        Cookie: cookieHeader(jar),
      },
    })
    return { status: res2.status, html: await res2.text() }
  }
  return { status: res.status, html }
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseReachInches(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function parsePct(raw) {
  const m = String(raw || '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function parseNum(raw) {
  const m = String(raw || '').match(/(-?\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function extractCareerStatMap(html) {
  /** @type {Record<string, string>} */
  const out = {}
  const re =
    /<li[^>]*b-list__box-list-item[^>]*>[\s\S]*?<i[^>]*>\s*([^<:]+):\s*<\/i>([\s\S]*?)<\/li>/gi
  let m
  while ((m = re.exec(html))) {
    const key = stripTags(m[1]).replace(/\s+/g, ' ').trim().toLowerCase()
    const val = stripTags(m[2])
    if (key) out[key] = val
  }
  return out
}

function extractLiValue(html, labelRe) {
  const re = new RegExp(
    `<li[^>]*>[\\s\\S]*?<i[^>]*>\\s*${labelRe}\\s*<\\/i>([\\s\\S]*?)<\\/li>`,
    'i',
  )
  const m = html.match(re)
  if (!m) return null
  return stripTags(m[1])
}

/**
 * Build first+last name → detail URL map from UFC Stats letter index pages.
 * Char pages split name across multiple <a> tags with the same href.
 */
export async function buildUfcStatsNameIndex(jar, opts = {}) {
  const delayMs = Number(opts.delayMs) || 400
  const chars = opts.chars || 'abcdefghijklmnopqrstuvwxyz'.split('')
  /** @type {Map<string, string>} */
  const byNormName = new Map()
  /** @type {Map<string, { first: string, last: string }>} */
  const partsByUrl = new Map()

  for (const ch of chars) {
    const url = `http://ufcstats.com/statistics/fighters?char=${encodeURIComponent(ch)}&page=all`
    const { html } = await fetchHtml(url, jar)
    const re = /href="(http:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m
    while ((m = re.exec(html))) {
      const href = m[1]
      const text = stripTags(m[2])
      if (!text) continue
      const prev = partsByUrl.get(href) || { first: '', last: '' }
      if (!prev.first) prev.first = text
      else if (!prev.last) prev.last = text
      partsByUrl.set(href, prev)
    }
    await sleep(delayMs)
  }

  for (const [href, parts] of partsByUrl) {
    const full = `${parts.first} ${parts.last}`.trim()
    if (!full) continue
    byNormName.set(normName(full), href)
    // Also index last, first for soft match helpers
    if (parts.last && parts.first) {
      byNormName.set(normName(`${parts.last} ${parts.first}`), href)
    }
  }

  return byNormName
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Search UFC Stats for a fighter detail URL by name.
 * Prefer letter-index map when provided; GET search is unreliable on this host.
 * @returns {Promise<string | null>}
 */
export async function searchUfcStatsFighterUrl(jar, fighterName, nameIndex = null) {
  const target = normName(fighterName)
  if (!target) return null

  if (nameIndex instanceof Map) {
    if (nameIndex.has(target)) return nameIndex.get(target)
    // Soft: unique contains match
    const soft = []
    for (const [n, href] of nameIndex) {
      if (n === target) return href
      if (n.includes(target) || target.includes(n)) soft.push(href)
    }
    const uniq = [...new Set(soft)]
    if (uniq.length === 1) return uniq[0]
  }

  // Fallback GET search (often empty on current ufcstats.com)
  const url = `http://ufcstats.com/statistics/fighters/search?query=${encodeURIComponent(String(fighterName || '').trim())}`
  const { html } = await fetchHtml(url, jar)
  const links = []
  const re = /href="(http:\/\/ufcstats\.com\/fighter-details\/[a-f0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    links.push({ href: m[1], name: stripTags(m[2]) })
  }
  const exact = links.find((l) => normName(l.name) === target)
  if (exact) return exact.href
  return null
}

/**
 * Parse career metrics + finish mix from a fighter-details HTML page.
 */
export function parseUfcStatsFighterHtml(html) {
  const name = stripTags(
    (html.match(/b-content__title-highlight[^>]*>([\s\S]*?)<\//i) || [])[1] || '',
  )
  if (!name) throw new Error('fighter page missing name')

  const reachRaw = extractLiValue(html, 'Reach:')
  const stanceRaw = extractLiValue(html, 'STANCE:')

  const career = extractCareerStatMap(html)
  const slpm = parseNum(career['slpm'])
  const strAcc = parsePct(career['str. acc.'])
  const sapm = parseNum(career['sapm'])
  const strDef = parsePct(career['str. def'])
  const tdAvg = parseNum(career['td avg.'])
  const tdAcc = parsePct(career['td acc.'])
  const tdDef = parsePct(career['td def.'])
  const subAvg = parseNum(career['sub. avg.'])

  // Fight history: outcome in first col, method later. Win rows only for finish mix.
  let wins = 0
  let koWins = 0
  let subWins = 0
  const rowRe =
    /<tr[^>]*b-fight-details__table-row[^>]*>([\s\S]*?)<\/tr>/gi
  let row
  while ((row = rowRe.exec(html))) {
    const cells = [...row[1].matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]),
    )
    if (cells.length < 8) continue
    const result = cells[0].toLowerCase()
    if (!result.startsWith('win')) continue
    wins += 1
    const method = `${cells[7] || ''} ${cells[8] || ''}`.toUpperCase()
    if (/\bKO\b|\bTKO\b|PUNCH|KICK|ELBOW|KNEE|STRIKE/.test(method) && !/SUB/.test(method)) {
      koWins += 1
    } else if (/SUB|CHOKE|ARM|TRIANGLE|HEEL|KIMURA|GUILLOTINE|REAR NAKED/.test(method)) {
      subWins += 1
    } else if (/\bKO\b|\bTKO\b/.test(method)) {
      koWins += 1
    } else if (/SUB/.test(method)) {
      subWins += 1
    }
  }

  const finishWins = koWins + subWins
  const finishRate = wins > 0 ? Math.round((finishWins / wins) * 100) : null
  const koFinishRate = wins > 0 ? Math.round((koWins / wins) * 100) : null
  const subFinishRate = wins > 0 ? Math.round((subWins / wins) * 100) : null

  const missing = []
  if (slpm == null) missing.push('slpm')
  if (sapm == null) missing.push('sapm')
  if (strAcc == null) missing.push('str_acc')
  if (strDef == null) missing.push('str_def')
  if (tdAvg == null) missing.push('td_avg')
  if (tdAcc == null) missing.push('td_acc')
  if (tdDef == null) missing.push('td_def')
  if (subAvg == null) missing.push('sub_avg')
  if (missing.length) {
    throw new Error(`missing career stats (${missing.join(', ')}) for ${name}`)
  }

  return {
    fighter_name: name,
    reach_inches: parseReachInches(reachRaw) ?? 70,
    stance: /southpaw/i.test(stanceRaw || '')
      ? 'Southpaw'
      : /switch/i.test(stanceRaw || '')
        ? 'Switch'
        : 'Orthodox',
    slpm,
    sapm,
    str_acc: strAcc,
    str_def: strDef,
    td_avg: tdAvg,
    td_acc: tdAcc,
    td_def: tdDef,
    sub_avg: subAvg,
    finish_rate: finishRate ?? 0,
    ko_finish_rate: koFinishRate ?? 0,
    sub_finish_rate: subFinishRate ?? 0,
    career_wins: wins,
  }
}

/**
 * Fetch + parse one fighter by detail URL.
 */
export async function scrapeUfcStatsFighter(jar, detailUrl) {
  const { status, html } = await fetchHtml(detailUrl, jar)
  if (status !== 200) throw new Error(`HTTP ${status} for ${detailUrl}`)
  return parseUfcStatsFighterHtml(html)
}

/**
 * Resolve URL (search if needed) then scrape. Polite delay between calls.
 */
export async function scrapeUfcStatsFighterByName(jar, fighterName, knownUrl, opts = {}) {
  const delayMs = Number(opts.delayMs) || 650
  const nameIndex = opts.nameIndex || null
  let url = knownUrl || null
  if (!url) {
    url = await searchUfcStatsFighterUrl(jar, fighterName, nameIndex)
    await sleep(Math.min(delayMs, 200))
  }
  if (!url) throw new Error(`no UFC Stats match for "${fighterName}"`)
  const metrics = await scrapeUfcStatsFighter(jar, url)
  await sleep(delayMs)
  return { url, metrics }
}
