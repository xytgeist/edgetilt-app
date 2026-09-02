/**
 * Jeff Sagarin college football Predictor ratings (public HTML).
 * Source: http://sagarin.com/sports/cfsend.htm
 *
 * We use the PREDICTOR column (score-based future-game estimator), not AP/polls.
 */

export const SAGARIN_CF_URL = 'http://sagarin.com/sports/cfsend.htm'

/** Map Sagarin display names → CFBD school keys when they diverge. */
export const SAGARIN_TO_CFBD_SCHOOL = {
  'Miami-Florida': 'Miami',
  'Miami Florida': 'Miami',
  'Miami (FL)': 'Miami',
  'Miami-Ohio': 'Miami (OH)',
  'Southern California': 'USC',
  'Southern Cal': 'USC',
  'Louisiana State': 'LSU',
  'Mississippi': 'Ole Miss',
  'Mississippi State': 'Mississippi State',
  'Central Florida(UCF)': 'UCF',
  'Central Florida': 'UCF',
  'Central Florida (UCF)': 'UCF',
  'Texas Christian': 'TCU',
  'Texas-San Antonio': 'UTSA',
  'Texas-El Paso': 'UTEP',
  'Alabama-Birmingham': 'UAB',
  'Connecticut': 'UConn',
  'Florida International': 'Florida International',
  'Florida Atlantic': 'Florida Atlantic',
  'Louisiana-Lafayette': 'Louisiana',
  'Louisiana-Monroe': 'UL Monroe',
  'Middle Tennessee': 'Middle Tennessee',
  'Appalachian State': 'App State',
  'Bowling Green': 'Bowling Green',
  'Northern Illinois': 'Northern Illinois',
  'Southern Mississippi': 'Southern Miss',
  'Southern Miss': 'Southern Miss',
  'Hawaii': "Hawai'i",
  "Hawai'i": "Hawai'i",
  'San Jose State': 'San José State',
  'San José State': 'San José State',
  'Massachusetts': 'UMass',
  'Brigham Young': 'BYU',
  'SMU': 'SMU',
  'NC State': 'NC State',
  'North Carolina State': 'NC State',
  'Pitt': 'Pittsburgh',
  'Pittsburgh': 'Pittsburgh',
}

/**
 * @param {string} html
 * @returns {Map<string, number>} Sagarin team name → Predictor rating
 */
export function parseSagarinPredictorHtml(html) {
  /** @type {Map<string, number>} */
  const byName = new Map()
  const lines = String(html || '').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.replace(/\*/g, '')
    const m = line.match(/^\s*\d+\s+(.+?)\s+A{1,2}\s+=\s+([\d.]+)\b(.*)$/)
    if (!m) continue
    const name = m[1].replace(/\s+/g, ' ').trim()
    if (!name || name.length < 3) continue
    const overall = Number(m[2])
    const rest = m[3] || ''
    const blocks = [...rest.matchAll(/\|\s*([\d.]+)\s+(\d+)\s*/g)]
    // Layout: … | vsTop30 | PREDICTOR rank | GOLDEN_MEAN | RECENT | …
    let predictor = null
    if (blocks.length >= 2) predictor = Number(blocks[1][1])
    else if (blocks.length === 1) predictor = Number(blocks[0][1])
    if (!Number.isFinite(predictor) || predictor < 15) {
      predictor = Number.isFinite(overall) ? overall : null
    }
    if (predictor == null) continue
    byName.set(name, Math.round(predictor * 100) / 100)
  }
  return byName
}

/**
 * @param {Map<string, number>} sagarinByName
 * @param {Iterable<string>} cfbdSchools
 * @returns {Map<string, number>} CFBD school → Predictor
 */
export function mapSagarinToCfbdSchools(sagarinByName, cfbdSchools) {
  /** @type {Map<string, string>} norm → school */
  const schoolByNorm = new Map()
  for (const school of cfbdSchools) {
    schoolByNorm.set(normKey(school), school)
  }

  /** @type {Map<string, number>} */
  const out = new Map()
  for (const [sagName, rating] of sagarinByName) {
    const mapped = SAGARIN_TO_CFBD_SCHOOL[sagName] || sagName
    let school = schoolByNorm.get(normKey(mapped))
    if (!school) {
      // fuzzy: "Ohio State" matches school "Ohio State"
      for (const [nk, s] of schoolByNorm) {
        if (nk === normKey(mapped) || nk.startsWith(normKey(mapped) + ' ') || normKey(mapped).startsWith(nk)) {
          school = s
          break
        }
      }
    }
    if (!school) continue
    // Prefer first hit; don't overwrite with FCS duplicates if already set
    if (!out.has(school)) out.set(school, rating)
  }
  return out
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * @returns {Promise<{ bySchool: Map<string, number>, byName: Map<string, number>, fetchedAt: string }>}
 */
export async function fetchSagarinPredictorBySchool(cfbdSchools) {
  const res = await fetch(SAGARIN_CF_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'EdgeTilt-cfb-power-sync/1.0 (syndicate consensus; +https://edgetilt.com)',
    },
  })
  if (!res.ok) {
    throw new Error(`Sagarin fetch ${res.status}`)
  }
  const html = await res.text()
  const byName = parseSagarinPredictorHtml(html)
  if (byName.size < 50) {
    throw new Error(`Sagarin parse too few teams (${byName.size})`)
  }
  const bySchool = mapSagarinToCfbdSchools(byName, cfbdSchools)
  return { bySchool, byName, fetchedAt: new Date().toISOString() }
}
