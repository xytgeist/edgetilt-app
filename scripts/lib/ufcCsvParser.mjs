/**
 * Parse UFC fight CSVs (HuggingFace xtinkarpiu format + Kaggle scarekrow f_1_* format).
 */

/** @typedef {object} UfcFighterSnapshot */
/** @typedef {object} UfcFightRow
 * @property {string} id
 * @property {string} eventName
 * @property {string} eventDate ISO date YYYY-MM-DD
 * @property {string} fighterA
 * @property {string} fighterB
 * @property {string} winner
 * @property {string} division
 * @property {boolean} isFiveRounds
 * @property {boolean} isApexCage
 * @property {number} completedRounds
 * @property {UfcFighterSnapshot} snapshotA pre-fight stats for A (may be partial)
 * @property {UfcFighterSnapshot} snapshotB pre-fight stats for B
 * @property {object} fightTotals in-fight totals for walk-forward { a: FightTotals, b: FightTotals }
 * @property {string} format 'hf' | 'kaggle'
 */

/** @typedef {object} FightTotals
 * @property {number} sigStrikesLanded
 * @property {number} sigStrikesAttempted
 * @property {number} takedownsLanded
 * @property {number} takedownsAttempted
 * @property {number} subAttempts
 * @property {number} fightSeconds
 * @property {boolean} won
 * @property {boolean} finishWin
 */

export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function pct(v, fallback = 50) {
  const n = num(v, NaN)
  if (!Number.isFinite(n)) return fallback
  if (n <= 1 && n >= 0) return Math.round(n * 100)
  return Math.round(n)
}

function pickCol(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx >= 0) return headers[idx]
  }
  for (const c of candidates) {
    const hit = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()))
    if (hit) return hit
  }
  return null
}

function detectFormat(headers) {
  if (headers.includes('fighter1_name') && headers.includes('event_date')) return 'hf'
  if (headers.some((h) => h.startsWith('f_1_')) && headers.some((h) => h.startsWith('f_2_'))) return 'kaggle'
  return 'unknown'
}

function normalizeDivision(raw, gender) {
  let d = String(raw || '')
    .replace(/\s+Bout$/i, '')
    .replace(/\s+Title\s+Fight$/i, '')
    .trim()
  if (!d) return 'Lightweight'
  if (/women/i.test(d) || gender === 'F') {
    if (/straw/i.test(d)) return "Women's Strawweight"
    if (/fly/i.test(d)) return "Women's Flyweight"
    if (/bantam/i.test(d)) return "Women's Bantamweight"
    if (/feather/i.test(d)) return "Women's Featherweight"
  }
  const map = {
    flyweight: 'Flyweight',
    bantamweight: 'Bantamweight',
    featherweight: 'Featherweight',
    lightweight: 'Lightweight',
    welterweight: 'Welterweight',
    middleweight: 'Middleweight',
    'light heavyweight': 'Light Heavyweight',
    heavyweight: 'Heavyweight',
  }
  const key = d.toLowerCase()
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v
  }
  return d
}

function normalizeStance(raw) {
  const s = String(raw || '').trim()
  if (/southpaw/i.test(s)) return 'Southpaw'
  if (/switch/i.test(s)) return 'Switch'
  return 'Orthodox'
}

function inferApex(eventName, location) {
  const blob = `${eventName} ${location}`.toLowerCase()
  return blob.includes('apex') || /fight night/i.test(eventName)
}

function hfSnapshot(row, headers, prefix, fighterName, division) {
  const g = (suffix) => row[headers.indexOf(`${prefix}${suffix}`)]
  const reachCm = num(g('reach_cm'), 0)
  const reachIn = reachCm > 0 ? Math.round((reachCm / 2.54) * 10) / 10 : 72

  return {
    fighter_name: fighterName,
    division,
    reach_inches: reachIn,
    stance: normalizeStance(g('stance')),
    slpm: num(g('significant_strikes_per_minute'), 0),
    sapm: num(g('significant_strikes_absorbed_per_minute'), 0),
    str_acc: pct(g('significant_striking_accuracy'), 50),
    str_def: pct(g('significant_strike_defence'), 50),
    td_avg: num(g('average_takedown_landed_per_15_minutes'), 0),
    td_acc: pct(g('takedown_accuracy'), 50),
    td_def: pct(g('takedown_defence'), 50),
    sub_avg: num(g('average_submission_landed_per_15_minutes'), 0),
    finish_rate: 50,
    ko_finish_rate: 33,
    sub_finish_rate: 17,
    priorFightCount: num(g('prior_fights'), 0),
  }
}

function hfFightTotals(row, headers, prefix, won, method) {
  const g = (suffix) => row[headers.indexOf(`${prefix}${suffix}`)]
  const seconds = num(g('control_time_in_seconds'), 0)
  const eventSeconds = num(row[headers.indexOf('event_total_seconds')], 0)
  const fightSeconds = eventSeconds > 0 ? eventSeconds : Math.max(seconds, 300)
  return {
    sigStrikesLanded: num(g('landed_significant_strikes'), 0),
    sigStrikesAttempted: num(g('total_significant_strikes'), 0),
    takedownsLanded: num(g('success_takedown'), 0),
    takedownsAttempted: num(g('total_attempted_takedown'), 0),
    subAttempts: num(g('submission_attempt'), 0),
    fightSeconds,
    won,
    finishWin: /ko|tko|submission|sub/i.test(String(method || '')),
  }
}

function kaggleSnapshot(row, colMap, side, fighterName, division) {
  const p = side === 1 ? 'f_1_' : 'f_2_'
  const g = (suffix) => {
    const col = colMap[`${p}${suffix}`]
    return col != null ? row[col] : ''
  }

  return {
    fighter_name: fighterName,
    division,
    reach_inches: num(g('reach'), num(g('reach_inches'), 72)),
    stance: normalizeStance(g('stance')),
    slpm: num(g('slpm'), num(g('sig_str_landed_per_min'), 0)),
    sapm: num(g('sapm'), num(g('sig_str_absorbed_per_min'), 0)),
    str_acc: pct(g('str_acc'), pct(g('str_acc_pct'), 50)),
    str_def: pct(g('str_def'), 50),
    td_avg: num(g('td_avg'), 0),
    td_acc: pct(g('td_acc'), 50),
    td_def: pct(g('td_def'), 50),
    sub_avg: num(g('sub_avg'), 0),
    finish_rate: pct(g('finish_rate'), 50),
    ko_finish_rate: pct(g('ko_finish_rate'), 33),
    sub_finish_rate: pct(g('sub_finish_rate'), 17),
    priorFightCount: 0,
  }
}

function buildKaggleColMap(headers) {
  /** @type {Record<string, number>} */
  const map = {}
  headers.forEach((h, i) => {
    map[h] = i
  })
  return map
}

function parseKaggleRow(values, headers, colMap) {
  const row = values
  const idx = (name) => colMap[name]

  const f1NameCol = pickCol(headers, ['f_1_name', 'f_1_fighter_name', 'f_1_fighter'])
  const f2NameCol = pickCol(headers, ['f_2_name', 'f_2_fighter_name', 'f_2_fighter'])
  const dateCol = pickCol(headers, ['event_date', 'date', 'fight_date'])
  const winnerCol = pickCol(headers, ['winner', 'event_winner'])
  const eventCol = pickCol(headers, ['event_name', 'event'])
  const wcCol = pickCol(headers, ['weight_class', 'division'])
  const genderCol = pickCol(headers, ['gender'])
  const titleCol = pickCol(headers, ['title_fight', 'is_title_fight'])
  const finishRoundCol = pickCol(headers, ['finish_round', 'num_rounds', 'round'])
  const locationCol = pickCol(headers, ['location', 'event_location'])

  if (!f1NameCol || !f2NameCol || !dateCol) return null

  const fighterA = row[idx(f1NameCol)] || ''
  const fighterB = row[idx(f2NameCol)] || ''
  const eventDate = String(row[idx(dateCol)] || '').slice(0, 10)
  const winner = row[idx(winnerCol)] || ''
  const eventName = eventCol ? row[idx(eventCol)] : ''
  const gender = genderCol ? row[idx(genderCol)] : ''
  const division = normalizeDivision(wcCol ? row[idx(wcCol)] : '', gender)
  const titleFight = titleCol ? String(row[idx(titleCol)]).toLowerCase() === 'true' : false
  const completedRounds = num(finishRoundCol ? row[idx(finishRoundCol)] : 3, 3)
  const location = locationCol ? row[idx(locationCol)] : ''

  const snapA = kaggleSnapshot(row, colMap, 1, fighterA, division)
  const snapB = kaggleSnapshot(row, colMap, 2, fighterB, division)

  const wonA = normalizeName(winner) === normalizeName(fighterA)
  const wonB = normalizeName(winner) === normalizeName(fighterB)

  return {
    id: `${eventDate}:${normalizeName(fighterA)}:${normalizeName(fighterB)}`,
    eventName,
    eventDate,
    fighterA,
    fighterB,
    winner,
    division,
    isFiveRounds: titleFight || completedRounds >= 5,
    isApexCage: inferApex(eventName, location),
    completedRounds,
    snapshotA: snapA,
    snapshotB: snapB,
    fightTotals: {
      a: {
        sigStrikesLanded: num(row[colMap['f_1_sig_str_landed']] ?? row[colMap['f_1_total_sig_strikes_landed']], 0),
        sigStrikesAttempted: num(row[colMap['f_1_sig_str_attempted']], 0),
        takedownsLanded: num(row[colMap['f_1_td_landed']], 0),
        takedownsAttempted: num(row[colMap['f_1_td_attempted']], 0),
        subAttempts: num(row[colMap['f_1_sub_attempts']], 0),
        fightSeconds: completedRounds * 300,
        won: wonA,
        finishWin: wonA && completedRounds < 5,
      },
      b: {
        sigStrikesLanded: num(row[colMap['f_2_sig_str_landed']] ?? row[colMap['f_2_total_sig_strikes_landed']], 0),
        sigStrikesAttempted: num(row[colMap['f_2_sig_str_attempted']], 0),
        takedownsLanded: num(row[colMap['f_2_td_landed']], 0),
        takedownsAttempted: num(row[colMap['f_2_td_attempted']], 0),
        subAttempts: num(row[colMap['f_2_sub_attempts']], 0),
        fightSeconds: completedRounds * 300,
        won: wonB,
        finishWin: wonB && completedRounds < 5,
      },
    },
    format: 'kaggle',
  }
}

function parseHfRow(values, headers) {
  const row = values
  const idx = (name) => headers.indexOf(name)

  const fighterA = row[idx('fighter1_name')] || ''
  const fighterB = row[idx('fighter2_name')] || ''
  const eventDate = String(row[idx('event_date')] || '').slice(0, 10)
  const winner = row[idx('event_winner')] || ''
  const eventName = row[idx('event_name')] || ''
  const division = normalizeDivision(row[idx('event_weight_class')] || '', '')
  const method = row[idx('event_winning_method')] || ''
  const completedRounds = num(row[idx('event_total_rounds')], 3)
  const titleFight = /title/i.test(eventName) || completedRounds >= 5

  const snapA = hfSnapshot(row, headers, 'fighter1_', fighterA, division)
  const snapB = hfSnapshot(row, headers, 'fighter2_', fighterB, division)

  const wonA = normalizeName(winner) === normalizeName(fighterA)
  const wonB = normalizeName(winner) === normalizeName(fighterB)

  return {
    id: `${eventDate}:${normalizeName(fighterA)}:${normalizeName(fighterB)}`,
    eventName,
    eventDate,
    fighterA,
    fighterB,
    winner,
    division,
    isFiveRounds: titleFight,
    isApexCage: inferApex(eventName, ''),
    completedRounds,
    snapshotA: snapA,
    snapshotB: snapB,
    fightTotals: {
      a: hfFightTotals(row, headers, 'fighter1_', wonA, method),
      b: hfFightTotals(row, headers, 'fighter2_', wonB, method),
    },
    format: 'hf',
  }
}

/** @returns {{ fights: UfcFightRow[], format: string, headers: string[] }} */
export function parseUfcCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { fights: [], format: 'unknown', headers: [] }
  }

  const headers = parseCsvLine(lines[0])
  const format = detectFormat(headers)
  const colMap = buildKaggleColMap(headers)
  /** @type {UfcFightRow[]} */
  const fights = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    if (values.length < headers.length / 2) continue

    let parsed = null
    if (format === 'hf') parsed = parseHfRow(values, headers)
    else if (format === 'kaggle') parsed = parseKaggleRow(values, headers, colMap)

    if (!parsed?.fighterA || !parsed?.fighterB || !parsed?.eventDate) continue
    if (!parsed.winner) continue
    fights.push(parsed)
  }

  fights.sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  return { fights, format, headers }
}

export function probeCsvColumns(headers) {
  const format = detectFormat(headers)
  return {
    format,
    sampleColumns: headers.slice(0, 40),
    totalColumns: headers.length,
    hasWalkForwardTotals: headers.some((h) => /landed_significant|sig_str_landed|f_1_sig/i.test(h)),
  }
}
