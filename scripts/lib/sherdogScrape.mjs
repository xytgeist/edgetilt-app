/**
 * Sherdog result tape. Win / loss / method / round / time only.
 * Does not invent takedown or sig-strike counts. Those stay unmeasured.
 */

const UA = 'Mozilla/5.0 (compatible; EdgeTiltSyndicate/1.0; +https://edgetilt.com)'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripTags(raw) {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normSherdogName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function parseClockSeconds(raw) {
  const m = String(raw || '').trim().match(/(\d+):(\d+)/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

function classifyMethod(raw) {
  const s = String(raw || '').toUpperCase()
  if (/SUB|CHOKE|ARM|TRIANGLE|HEEL|KIMURA|GUILLOTINE|REAR NAKED/.test(s)) return 'SUB'
  if (/\bKO\b|\bTKO\b|PUNCH|KICK|ELBOW|KNEE|STRIKE/.test(s)) return 'KO'
  if (/DEC|DECISION/.test(s)) return 'DEC'
  return 'OTHER'
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  })
  const html = await res.text()
  if (!res.ok) throw new Error(`Sherdog HTTP ${res.status} for ${url}`)
  return html
}

/**
 * Exact full-name hit only. A shared first name is a miss.
 * @returns {Promise<string | null>}
 */
export async function searchSherdogFighterUrl(name) {
  const q = String(name || '').trim()
  const want = normSherdogName(q)
  if (!want) return null
  const html = await fetchHtml(
    `https://www.sherdog.com/stats/fightfinder?SearchTxt=${encodeURIComponent(q)}`,
  )
  const hits = new Set()
  const re = /<a[^>]+href="(\/fighter\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    if (normSherdogName(stripTags(m[2])) !== want) continue
    hits.add(`https://www.sherdog.com${m[1]}`)
  }
  if (hits.size !== 1) return null
  return [...hits][0]
}

export function parseSherdogFighterHtml(html) {
  const fighterName = stripTags((html.match(/<span class="fn">([\s\S]*?)<\/span>/i) || [])[1] || '')
  if (!fighterName) throw new Error('Sherdog page missing fighter name')
  const division =
    stripTags(
      (html.match(/fightfinder\?weightclass=[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '',
    ) || 'Unknown'

  const block = (html.match(/id="fight_history"[\s\S]*?<\/table>/i) || [])[0]
    || (html.match(/fight_history[\s\S]*?<\/table>/i) || [])[0]
    || ''
  const fights = []
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi
  let row
  while ((row = rowRe.exec(block))) {
    const result = ((row[1].match(/final_result\s+(win|loss|draw)/i) || [])[1] || '').toLowerCase()
    if (!result) continue
    const cells = [...row[1].matchAll(/<td\b[\s\S]*?>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]))
    const methodBlob = (cells[3] || '').replace(/\s*VIEW PLAY-BY-PLAY.*/i, '').trim()
    const methodRaw = (methodBlob.match(/^(?:Decision|TKO|KO|Submission|DQ|No Contest|Technical)[^)]*\)/i) || [])[0] || methodBlob
    const method = classifyMethod(methodRaw)
    const round = Number.parseInt(cells[4] || '', 10) || 0
    const timeSec = parseClockSeconds(cells[5] || '')
    fights.push({
      result,
      opponent: cells[1] || '',
      method,
      methodRaw,
      round,
      distance: method === 'DEC' || (round >= 3 && timeSec >= 300),
    })
    if (fights.length >= 5) break
  }

  let wins = 0
  let losses = 0
  let koWins = 0
  let subWins = 0
  let decWins = 0
  let roundsFought = 0
  let distanceFights = 0
  for (const f of fights) {
    if (f.result === 'win') {
      wins += 1
      if (f.method === 'KO') koWins += 1
      else if (f.method === 'SUB') subWins += 1
      else if (f.method === 'DEC') decWins += 1
    } else if (f.result === 'loss') losses += 1
    roundsFought += f.round
    if (f.distance) distanceFights += 1
  }

  return {
    fighterName,
    division,
    url: null,
    fightCount: fights.length,
    wins,
    losses,
    koWins,
    subWins,
    decWins,
    roundsFought,
    distanceFights,
    fights,
  }
}

export async function scrapeSherdogFighter(name, opts = {}) {
  const delayMs = Number(opts.delayMs) || 700
  const url = opts.url || (await searchSherdogFighterUrl(name))
  if (!url) throw new Error(`no Sherdog match for "${name}"`)
  await sleep(delayMs)
  const html = await fetchHtml(url)
  const parsed = parseSherdogFighterHtml(html)
  if (normSherdogName(parsed.fighterName) !== normSherdogName(name) && !opts.url) {
    throw new Error(`Sherdog name mismatch: wanted "${name}", page says "${parsed.fighterName}"`)
  }
  return { ...parsed, url }
}
