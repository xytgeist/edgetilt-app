/**
 * Slip / CSV bones. Heuristic only … user confirms in the composer before save.
 */

import {
  isParticipantSport,
  resolveSportsBetSport,
  SPORTS_BET_SPORT_BOXING,
  SPORTS_BET_SPORT_UFC,
  sportByKey,
} from './sportsBetSports.js'
import {
  americanFromStakeAndPayout,
  americanOddsInputString,
  buildBetSummaryLabel,
  pickSeedFromLabel,
} from './sportsBetMath.js'
import { decimalToAmerican } from './sportsBetCalcMath.js'
import {
  combinedOddsFromLegs,
  normalizeParlayLegs,
  parlaySelectionLabel,
} from './sportsBetParlay.js'

const MONEY_RE = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/

const BOOK_PATTERNS = [
  { re: /\bbarstool\s*sportsbook\b/i, name: 'Barstool' },
  { re: /\bbarstool\b/i, name: 'Barstool' },
  { re: /\bcirca\s*(?:resort|&|\band\b)?\s*(?:casino)?\b/i, name: 'Circa' },
  { re: /\bmirage\b/i, name: 'Mirage' },
  { re: /\bwynn\b/i, name: 'Wynn' },
  { re: /\brampart\b/i, name: 'Rampart' },
  { re: /\bhollywood\b/i, name: 'Hollywood' },
  { re: /\bfliff\b/i, name: 'Fliff' },
  { re: /\bhard\s*rock\b/i, name: 'Hard Rock' },
  { re: /\bdraft\s*kings\b|\bdraftkings\b|\bdk\b/i, name: 'DraftKings' },
  { re: /\bfan\s*duel\b|\bfanduel\b|\bfd\b/i, name: 'FanDuel' },
  { re: /\bbet\s*mgm\b|\bbetmgm\b/i, name: 'BetMGM' },
  { re: /\bcaesars\b/i, name: 'Caesars' },
  { re: /\bfanatics\b/i, name: 'Fanatics' },
  { re: /\bbetrivers\b|\bsugarhouse\b/i, name: 'BetRivers' },
  { re: /\bliga\s*365\b|\bliga365\b/i, name: 'LIGA365' },
  { re: /\bpinnacle\b/i, name: 'Pinnacle' },
  { re: /\bbovada\b/i, name: 'Bovada' },
  { re: /\bbet365\b/i, name: 'bet365' },
  { re: /\bpointsbet\b/i, name: 'PointsBet' },
]

/** NFL nicknames / cities for sport inference when the slip omits "NFL". */
const NFL_TEAM_HINT =
  /\b(49ers|chiefs|bills|raiders|patriots|cowboys|packers|eagles|steelers|ravens|bengals|browns|titans|colts|jaguars|texans|broncos|chargers|raiders|chiefs|rams|seahawks|cardinals|saints|falcons|panthers|buccaneers|bucs|dolphins|jets|giants|commanders|washington|detroit|lions|bears|vikings|nfl)\b/i

const PAYOUT_LINE_RE =
  /\b(max\s*payout|to\s*win|to\s*collect|potential\s*payout|payout|win\s+\$|won\s+on)\b/i

/** FanDuel-style: "DeMar DeRozan Over 23.5" (odds often omitted on settled slips). */
const PLAYER_PROP_OU_LINE_RE =
  /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+(over|under)\s+([0-9]+(?:\.[0-9]+)?)\s*$/i

const FIGHT_METHOD_TOKEN_RE =
  /ko\s*\/\s*tko|tko\s*\/\s*ko|knockout|technical\s*knockout|\btko\b|\bko\b|submission|unanimous\s*decision|split\s*decision|majority\s*decision|technical\s*decision|\bdecision\b|disqualification|\bdq\b/i

function titleYesNo(word) {
  const w = String(word || 'Yes').trim() || 'Yes'
  return `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`
}

function normalizeMethodLabel(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (/^ko\s*\/\s*tko$/i.test(s) || /^tko\s*\/\s*ko$/i.test(s)) return 'KO/TKO'
  if (/^ko$/i.test(s) || /^knockout$/i.test(s)) return 'KO'
  if (/^tko$/i.test(s) || /^technical\s*knockout$/i.test(s)) return 'TKO'
  if (/^dq$/i.test(s) || /^disqualification$/i.test(s)) return 'DQ'
  return titleCaseWords(s)
}

/** "Alvarez by KO" … fighter-sided method bet (not N/A). */
function fighterByMethodMatch(text) {
  const s = String(text || '')
  const m = new RegExp(
    `([A-Za-z][A-Za-z.'\\-]+(?:\\s+[A-Za-z][A-Za-z.'\\-]+){0,3})\\s+by\\s+(${FIGHT_METHOD_TOKEN_RE.source})\\b`,
    'i',
  ).exec(s)
  if (!m) return null
  const name = m[1].trim()
  if (!looksLikePersonName(name)) return null
  if (/\b(win|wins|winner|fight|bout|method|round|rounds|over|under|yes|no)\b/i.test(name)) return null
  return { name, method: normalizeMethodLabel(m[2]) }
}

/**
 * True when the slip/selection is not a home/away (or fighter ML) pick.
 * Fighter+method ("Name by KO") returns false … that still has a Side.
 */
export function looksLikeSideLessBet(text) {
  const s = String(text || '')
  if (!s.trim()) return false
  if (fighterByMethodMatch(s)) return false
  if (/go(?:es)?\s+the\s+distance/i.test(s)) return true
  if (/method\s+of\s+victory/i.test(s)) return true
  // Require a real O/U line … category headers like "FIGHT WINNER/TOTAL ROUNDS" are not side-less picks
  if (/\btotal\s+rounds?\b/i.test(s) && /\b(over|under)\s+\d+(?:\.\d+)?\b/i.test(s)) return true
  if (/\b(over|under)\s+\d+(?:\.\d+)?\s*rounds?\b/i.test(s)) return true
  if (/\brounds?\s+\d+\s*[-–]\s*\d+\b/i.test(s)) return true
  if (/\bround\s+betting\b/i.test(s)) return true
  if (/\b(?:fight\s+)?(?:ends?\s+in\s+)?rounds?\s+\d+\b/i.test(s) && !/\b(over|under)\b/i.test(s)) {
    return true
  }
  if (/\b(over|under)\s+\d+(?:\.\d+)?\s*knockdowns?\b/i.test(s)) return true
  if (/\bwill\s+(?:the\s+)?(?:fight|bout)\b/i.test(s)) return true
  if (/\bwin(?:s|ning)?\s+by\s+/i.test(s) && FIGHT_METHOD_TOKEN_RE.test(s)) return true
  if (
    /\b(yes|no)\b/i.test(s)
    && /\b(fight|bout|distance|decision|knockdown|submission|round)\b/i.test(s)
  ) {
    return true
  }
  return false
}

/** Fight / side-less specials … before fighter ML heuristics. */
function extractSideLessOrFightProp(raw, lines) {
  const text = String(raw || '')

  // Go the distance (Yes/No)
  if (/go(?:es)?\s+the\s+distance/i.test(text)) {
    const yn = /\b(yes|no)\b/i.exec(text)
    return {
      market: 'other',
      side: '',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: `${titleYesNo(yn?.[1])} Fight To Go The Distance`,
    }
  }

  // Fighter + method ("C. Alvarez by KO") … sided h2h-style pick
  const fbm = fighterByMethodMatch(text)
  if (fbm) {
    return {
      market: 'h2h',
      side: 'home',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: `${titleCaseWords(fbm.name)} by ${fbm.method}`,
    }
  }

  // Rounds O/U (± method): "Under 3.5 Rounds by Knockout"
  const roundsOu = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)\s*rounds?\b(?:\s+by\s+([A-Za-z][A-Za-z/]*(?:\s+[A-Za-z][A-Za-z/]*)?))?/i.exec(text)
  if (roundsOu) {
    const side = roundsOu[1].toLowerCase() === 'under' ? 'under' : 'over'
    const method = roundsOu[3] ? ` by ${normalizeMethodLabel(roundsOu[3])}` : ''
    return {
      market: 'total',
      side,
      line: Number(roundsOu[2]),
      player_name: '',
      prop_stat: '',
      selection_label: `${side === 'under' ? 'Under' : 'Over'} ${roundsOu[2]} Rounds${method}`,
    }
  }

  // Knockdowns O/U
  const kdOu = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)\s*knockdowns?\b/i.exec(text)
  if (kdOu) {
    const side = kdOu[1].toLowerCase() === 'under' ? 'under' : 'over'
    return {
      market: 'total',
      side,
      line: Number(kdOu[2]),
      player_name: '',
      prop_stat: '',
      selection_label: `${side === 'under' ? 'Under' : 'Over'} ${kdOu[2]} Knockdowns`,
    }
  }

  // Total Rounds market header + O/U number
  if (/\btotal\s+rounds?\b/i.test(text)) {
    const ou = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)\b/i.exec(text)
    if (ou) {
      const side = ou[1].toLowerCase() === 'under' ? 'under' : 'over'
      return {
        market: 'total',
        side,
        line: Number(ou[2]),
        player_name: '',
        prop_stat: '',
        selection_label: `${side === 'under' ? 'Under' : 'Over'} ${ou[2]} Rounds`,
      }
    }
  }

  // Group rounds: "Rounds 1-3" / "Rounds 4–6"
  const group = /\brounds?\s+(\d+)\s*[-–]\s*(\d+)\b/i.exec(text)
  if (group) {
    return {
      market: 'other',
      side: '',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: `Rounds ${group[1]}-${group[2]}`,
    }
  }

  // Exact round (no O/U): "Round 5" / "Fight ends in Round 3"
  const exact = /\b(?:fight\s+)?(?:ends?\s+in\s+)?rounds?\s+(\d+)\b/i.exec(text)
  if (exact && !/\b(over|under)\b/i.test(text)) {
    return {
      market: 'other',
      side: '',
      line: Number(exact[1]),
      player_name: '',
      prop_stat: '',
      selection_label: `Round ${exact[1]}`,
    }
  }

  // Method of victory / win by … without a fighter name
  if (
    /method\s+of\s+victory/i.test(text)
    || (/\bwin(?:s|ning)?\s+by\s+/i.test(text) && FIGHT_METHOD_TOKEN_RE.test(text))
  ) {
    const methodHit = text.match(new RegExp(FIGHT_METHOD_TOKEN_RE.source, 'i'))
    const method = methodHit ? normalizeMethodLabel(methodHit[0]) : ''
    const label = method
      ? (/method\s+of\s+victory/i.test(text) ? `Method of Victory: ${method}` : `Win by ${method}`)
      : 'Method of Victory'
    return {
      market: 'other',
      side: '',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: label,
    }
  }

  // Yes/No on its own line + fight-ish following label (distance already handled)
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(yes|no)$/i.test(lines[i])) continue
    const next = lines[i + 1] || ''
    if (
      next
      && /fight|bout|distance|decision|knockdown|submission|round|method/i.test(next)
      && !/(?:@|\bvs\.?\b)/i.test(next)
    ) {
      return {
        market: 'other',
        side: '',
        line: null,
        player_name: '',
        prop_stat: '',
        selection_label: `${titleYesNo(lines[i])} ${titleCaseWords(next)}`.trim(),
      }
    }
  }

  return null
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[$,u]/gi, '').trim())
  return Number.isFinite(n) ? n : null
}

function parseMoneyAmount(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).replace(/[$,\s]/g, '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function americanOrNull(v) {
  const s = String(v || '').trim()
  const m = /^([+-]?\d{2,5})$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  // American odds are typically ±100+; allow +120 style. Reject tiny spreads like +3.5 via non-integer path above.
  if (!Number.isFinite(n) || n === 0) return null
  if (Math.abs(n) < 100 && !/^[+-]/.test(s)) return null
  if (Math.abs(n) < 100) return null
  return Math.round(n)
}

function cleanHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pickCol(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return String(row[name]).trim()
  }
  return ''
}

function titleCaseWords(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() && w.length > 2
      ? w.charAt(0) + w.slice(1).toLowerCase()
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

function looksLikePersonName(part) {
  const s = String(part || '').trim()
  if (!s || s.length > 40) return false
  if (/\b(winner|total|rounds|fight|event|ticket|straight|bet)\b/i.test(s)) return false
  return /^[A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,3}$/.test(s)
}

/** Drop date/time / rotation junk glued onto a matchup side (OCR). */
function stripMatchupSideJunk(side) {
  return String(side || '')
    .replace(/[®©™]/g, '')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*$/i, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, '')
    .replace(/\s+[+-]\d{2,5}\s*$/i, '')
    .replace(/^\d{2,5}\s+/i, '')
    .replace(/\bMLB\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Vision OCR often mangles `@` spacing / width / trademark glue. */
function normalizeMatchupOcrText(text) {
  return String(text || '')
    .replace(/\uFF20/g, '@') // fullwidth ＠
    .replace(/[®©™]\s*@/g, '@')
    .replace(/@\s*[®©™]/g, '@')
    .replace(/[®©™]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const NFL_NICKNAME_TOKEN_RE =
  /\b(49ers|chiefs|bills|raiders|patriots|cowboys|packers|eagles|steelers|ravens|bengals|browns|titans|colts|jaguars|texans|broncos|chargers|rams|seahawks|cardinals|saints|falcons|panthers|buccaneers|bucs|dolphins|jets|giants|commanders|lions|bears|vikings)\b/gi

/** When OCR drops `@`, recover "49ers Chiefs 2/2/2020" style NFL lines. */
function parseNflNicknamePairMatchup(text) {
  const s = normalizeMatchupOcrText(text)
  if (!s || /@|\bvs\.?\b|\bat\b/i.test(s)) return null
  if (!/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(s) && !/\b\d{1,2}:\d{2}\b/.test(s)) return null
  const hits = []
  for (const m of s.matchAll(NFL_NICKNAME_TOKEN_RE)) {
    const nick = m[1]
    if (!hits.some((h) => h.toLowerCase() === nick.toLowerCase())) hits.push(nick)
    if (hits.length > 2) return null
  }
  if (hits.length !== 2) return null
  return {
    event: `${hits[0]} @ ${hits[1]}`,
    away_team: hits[0],
    home_team: hits[1],
  }
}

/** Split "A @ B" / "A vs B" / "A at B" / "A / B" (UFC) into away / home. */
export function parseEventMatchup(text) {
  const s = normalizeMatchupOcrText(text)
  if (!s) return { event: '', away_team: '', home_team: '' }

  const fromParts = (awayRaw, homeRaw, sep) => {
    const away = stripMatchupSideJunk(awayRaw)
    const home = stripMatchupSideJunk(homeRaw)
    if (!away || !home || /\$/.test(away) || /\$/.test(home)) return null
    return {
      event: `${away} ${sep} ${home}`,
      away_team: away,
      home_team: home,
    }
  }

  // `@` with optional spaces: "A @ B", "A@B", OCR "A@ B" / "A @B"
  let m = /^(.+?)\s*@\s*(.+)$/.exec(s)
  if (m) {
    const hit = fromParts(m[1], m[2], '@')
    if (hit) return hit
  }
  // vs / v. / at … require spaces so we never match a letter inside a name
  // Do not use bare "v" … that splits Alvarez / EVENT.
  m = /^(.+?)\s+(?:vs\.?|v\.|at)\s+(.+)$/i.exec(s)
  if (m) {
    const sep = /\bat\b/i.test(m[0]) ? '@' : 'vs'
    const hit = fromParts(m[1], m[2], sep)
    if (hit) return hit
  }

  const nflPair = parseNflNicknamePairMatchup(s)
  if (nflPair) return nflPair

  // "POIRIER/MCGREGOR" or "MAIN EVENT - POIRIER/MCGREGOR"
  const slash = /([A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,2})\s*\/\s*([A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,2})\s*$/.exec(s)
  if (slash && looksLikePersonName(slash[1]) && looksLikePersonName(slash[2])) {
    const away = slash[1].trim()
    const home = slash[2].trim()
    return {
      event: s,
      away_team: away,
      home_team: home,
    }
  }
  return { event: s, away_team: s, home_team: '' }
}

function normalizeNameKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Map a selection string onto away/home when names overlap. */
export function sideForParticipantSelection(selection, awayTeam, homeTeam) {
  const sel = normalizeNameKey(selection)
  if (!sel) return null
  // Whole-slip blobs contain both fighters … do not guess from that.
  if (sel.includes('\n') || sel.length > 48) return null
  const away = normalizeNameKey(awayTeam)
  const home = normalizeNameKey(homeTeam)
  const selTokens = sel.split(/\s+/).filter(Boolean)
  const last = selTokens[selTokens.length - 1] || ''
  const hitAway = away && (sel.includes(away) || away.includes(sel) || (last && away.includes(last)))
  const hitHome = home && (sel.includes(home) || home.includes(sel) || (last && home.includes(last)))
  if (hitAway && !hitHome) return 'away'
  if (hitHome && !hitAway) return 'home'
  if (hitAway && hitHome) {
    // Prefer the longer / more specific match (e.g. "d poirier" vs bare last names in event).
    const awayScore = away.includes(sel) || sel.includes(away) ? away.length : (last && away.includes(last) ? last.length : 0)
    const homeScore = home.includes(sel) || sel.includes(home) ? home.length : (last && home.includes(last) ? last.length : 0)
    if (awayScore > homeScore) return 'away'
    if (homeScore > awayScore) return 'home'
  }
  return null
}

function extractBook(text) {
  const s = String(text || '')
  for (const { re, name } of BOOK_PATTERNS) {
    if (re.test(s)) return name
  }
  return ''
}

function extractStakeDollars(text) {
  const raw = String(text || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  const tryLine = (line, re) => {
    const m = re.exec(line)
    if (!m) return null
    return parseMoneyAmount(m[1])
  }

  const labeled = [
    /ticket\s*cost\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\brisk\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\btotal\s*wager\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\bwager\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\bstake\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\btake\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\d+\s*bet\(s\)\s*@\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\bplace\s*bet\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\bbet\s*amount\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
  ]

  for (const line of lines) {
    if (PAYOUT_LINE_RE.test(line) && !/ticket\s*cost/i.test(line) && !/\brisk\b/i.test(line) && !/\bwager\b/i.test(line)) {
      continue
    }
    for (const re of labeled) {
      const n = tryLine(line, re)
      if (n != null && n > 0) return n
    }
  }

  // FanDuel settled: "$5.00" on the line above "TOTAL WAGER"
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^total\s*wager\b/i.test(lines[i])) continue
    const prev = lines[i - 1] || ''
    const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(prev)
    if (m) {
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // DraftKings betslip OCR: "$" then "10.00" under "3 Pick Parlay"
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\$\s*$/.test(lines[i])) continue
    const m = /^([0-9]+(?:\.[0-9]{1,2})?)\s*$/.exec(lines[i + 1] || '')
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n != null && n > 0) return n
  }

  // "Wager" / "Risk" / "Wager Amount:" then amount on next line (or first bare $ soon after)
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:wager(?:\s*amount)?|risk)\s*:?\s*$/i.test(lines[i])) continue
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(lines[j])
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // "$500,000.00 Straight" / "$6,500.00 Straight Bet"
  for (const line of lines) {
    if (PAYOUT_LINE_RE.test(line)) continue
    const m = /\$\s*([0-9,]+\.?\d*)\s+straight(?:\s+bet)?\b/i.exec(line)
    if (m) {
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // Units: "2u" / "1.5 units" (not dollars)
  const units = /(\d+(?:\.\d+)?)\s*u(?:nits?)?\b/i.exec(raw)
  if (units && !MONEY_RE.test(raw)) {
    return null
  }

  // DraftKings receipt: bare "$5.00" then "$408.82" (payout) with no Wager label
  const bare = []
  for (const line of lines) {
    const m = /^\$\s*([0-9,]+\.?\d*)\s*$/.exec(line)
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n != null && n > 0) bare.push(n)
  }
  if (bare.length >= 2) {
    const lo = Math.min(...bare)
    const hi = Math.max(...bare)
    if (hi > lo * 1.5) return lo
  }

  return null
}

/** Payout that includes stake (for americanFromStakeAndPayout). Prefer collect/max over to-win. */
function extractPayoutDollars(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)

  const tryRes = [
    /(?:potential\s*payout|max\s*payout|max\s*pay|to\s*collect|est\.?\s*\/?\s*payout|total\s*payout)(?:\s*\([^)]*\))?\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /(?:payout)(?:\s*\([^)]*\))?\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
  ]
  for (const re of tryRes) {
    for (const line of lines) {
      const m = re.exec(line)
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // Casino OCR: "TO COLLECT:" then "$9,735.00" on the next line
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:to\s*collect|max\s*payout|potential\s*payout|to\s*win|win|total\s*payout)\s*:?\s*$/i.test(lines[i])) continue
    const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(lines[i + 1] || '')
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n == null || n <= 0) continue
    if (/^(?:to\s*win|win)\b/i.test(lines[i])) {
      const stake = extractStakeDollars(text)
      if (stake != null && stake > 0) return n + stake
    }
    return n
  }

  // "$611.82" above "WON ON FANDUEL"
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^won\s+on\b/i.test(lines[i])) continue
    const prev = lines[i - 1] || ''
    const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(prev)
    if (m) {
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // Last resort: TO WIN is profit-only … add stake when we have it
  for (const line of lines) {
    const m = /\bto\s*win\b\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i.exec(line)
    if (!m) continue
    const win = parseMoneyAmount(m[1])
    if (win == null || win <= 0) continue
    const stake = extractStakeDollars(text)
    if (stake != null && stake > 0) return win + stake
    return win
  }

  // DraftKings: larger bare "$408.82" next to smaller wager
  const bare = []
  for (const line of lines) {
    const m = /^\$\s*([0-9,]+\.?\d*)\s*$/.exec(line)
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n != null && n > 0) bare.push(n)
  }
  if (bare.length >= 2) {
    const lo = Math.min(...bare)
    const hi = Math.max(...bare)
    if (hi > lo * 1.5) return hi
  }

  // "$1,514.01 ($299.81 Boost)" on a messy OCR line
  for (const line of lines) {
    const m = /\$\s*([0-9,]+\.?\d*)\s*\([^)]*boost/i.exec(line)
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n != null && n > 0) return n
  }

  return null
}

function isParlayLegJunkLine(line) {
  return /must\s*start|plate\s*appearance|bet\s*with\s*friends|keep\s*picks|terms\s+and|download\s+the|sign\s*up|mobile\s*wagering|clear\s*betslip|help\s*center|place\s*bet|round\s*robin|stake\s*all|quick\s*sgp|log\s*in/i.test(
    String(line || ''),
  )
}

/** Casino OCR often prints ½ instead of .5 */
function normalizeSlipOcrText(text) {
  return String(text || '')
    .replace(/\u00bd/g, '.5')
    .replace(/(\d)\s*1\/2\b/g, '$1.5')
}

/**
 * Vision OCR often dumps all juices after the picks. Zip bare American odds onto
 * incomplete legs (skip ticket combined odds when present).
 */
function zipBunchedAmericanOdds(legs, text, { skipTicketTotal = true } = {}) {
  const list = Array.isArray(legs) ? legs.map((l) => ({ ...l })) : []
  const needIdx = list.map((l, i) => (!l.odds ? i : -1)).filter((i) => i >= 0)
  const need = needIdx.length
  if (!need) return list
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const ticket = skipTicketTotal ? extractTotalParlayOdds(text) : null
  const pool = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const oddsStr = bareAmericanOddsLine(line)
    if (!oddsStr) continue
    const prev = lines[i - 1] || ''
    const next = lines[i + 1] || ''
    const am = americanOrNull(oddsStr)
    // Drop known ticket combined price; keep leg juices even when listed under "Parlay (4 Picks)"
    if (ticket != null && am === ticket) continue
    // Lone total under "3 Pick Parlay" with no following bare odds
    if (
      skipTicketTotal
      && /pick\s+parlay|\bparlay\s*\(/i.test(prev)
      && !bareAmericanOddsLine(next)
      && (ticket == null || am === ticket || Math.abs(am) > 500)
    ) {
      continue
    }
    // Skip "Win" / ticket echo sitting above leg juices
    if (skipTicketTotal && /^(win|to\s*win|risk)$/i.test(prev) && Math.abs(am) > 500) continue
    pool.push(oddsStr)
  }
  let oddsPool = pool
  if (pool.length === need + 1) {
    // Ticket total first (+8076, +360…) or last (…, +1252)
    const first = americanOrNull(pool[0])
    const last = americanOrNull(pool[pool.length - 1])
    if (ticket != null && first === ticket) oddsPool = pool.slice(1)
    else if (ticket != null && last === ticket) oddsPool = pool.slice(0, -1)
    else if (Math.abs(first) > 1000 && Math.abs(first) > Math.abs(americanOrNull(pool[1]) || 0) * 2) {
      oddsPool = pool.slice(1)
    } else {
      oddsPool = pool.slice(0, -1)
    }
  } else if (pool.length > need) {
    const last = americanOrNull(pool[pool.length - 1])
    if (ticket != null && last === ticket) oddsPool = pool.slice(0, need)
    else oddsPool = pool.slice(0, need)
  }
  let oi = 0
  for (const i of needIdx) {
    if (oi >= oddsPool.length) break
    list[i].odds = oddsPool[oi]
    oi += 1
  }
  return list.filter((l) => l.odds || l.selection_label)
}

/**
 * DraftKings / app props:
 * - "Over 0.5 (Matt Olson)" + HOME RUNS + matchup + odds
 * - "100+ (Ja'Marr Chase)" + ALTERNATE RECEIVING YARDS (OCR may bunch odds at end)
 */
function extractAppPlayerPropLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    // 100+ (Player) / 125+ (Player) … alt milestone props
    const plus = /^(\d+(?:\.\d+)?)\+\s*\(([^)]+)\)\s*$/i.exec(line)
    const m = plus
      ? null
      : (
        /^(over|under)\s+(\d+(?:\.\d+)?)\s*\(([^)]+)\)\s*$/i.exec(line)
        || /^(over|under)\s+(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s*$/i.exec(line)
      )
    let side = 'over'
    let lineNum = NaN
    let player = ''
    if (plus) {
      lineNum = Number(plus[1])
      player = titleCaseWords(plus[2].trim())
      side = 'over'
    } else if (m) {
      side = m[1].toLowerCase() === 'under' ? 'under' : 'over'
      lineNum = Number(m[2])
      player = titleCaseWords(m[3].trim())
    } else {
      continue
    }
    if (!player || !Number.isFinite(lineNum)) continue
    if (/^(point|total|team|game|the)$/i.test(player)) continue

    let stat = ''
    let event_label = ''
    let away_team = ''
    let home_team = ''
    let odds = ''
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      const next = lines[j]
      if (/^(over|under)\s+\d/i.test(next) || /^\d+\+\s*\(/i.test(next)) break
      if (isParlayLegJunkLine(next)) continue
      if (/^[+-]\d{3,5}$/.test(next)) {
        // Bunched trail (+360/+295/+350) … leave empty for zip. Interleaved single odds … take it.
        const after = lines.slice(j + 1).find((l) => l && !isParlayLegJunkLine(l))
        if (after && /^[+-]\d{3,5}$/.test(after)) break
        odds = americanOddsInputString(next)
        break
      }
      if (
        !stat
        && /home\s*runs?|passing|rushing|receiving|points|rebounds|assists|strikeouts|hits|bases|yards|touchdowns?|alternate/i.test(next)
      ) {
        const stripped = next.replace(new RegExp(player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim()
        stat = titleCaseWords(stripped || next)
        continue
      }
      if (!event_label && /(?:@|\bat\b)/i.test(next) && !/\$/.test(next)) {
        const ev = parseEventMatchup(next.replace(/\s*\(Today[^)]*\)/i, '').trim())
        event_label = ev.event || next
        away_team = ev.away_team || ''
        home_team = ev.home_team || ''
      }
    }

    const ou = side === 'under' ? 'Under' : 'Over'
    const selection_label = [player, ou, String(lineNum), stat].filter(Boolean).join(' ')
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) continue
    seen.add(key)

    const sport = extractSport([selection_label, stat, event_label].filter(Boolean).join(' '))
    pending.push({
      market: 'prop',
      side,
      line: String(lineNum),
      odds,
      selection_label,
      player_name: player,
      prop_stat: stat,
      home_team,
      away_team,
      event_label,
      sport_key: sport.key || (/\bhome\s*runs?\b/i.test(stat) ? 'baseball_mlb' : ''),
      sport_label: sport.label || (/\bhome\s*runs?\b/i.test(stat) ? 'MLB' : ''),
      commence_time: '',
      event_id: '',
    })
  }

  const zipped = zipBunchedAmericanOdds(pending, text)
  return zipped.filter((l) => l.odds)
}

function sportHintFromLine(line) {
  const s = String(line || '')
  if (/\bNCAAF\b|\bCFB\b|\bCOLLEGE\s*FOOTBALL\b/i.test(s)) return 'CFB'
  if (/\bNFL\b/i.test(s)) return 'NFL'
  if (/\bNBA\b/i.test(s)) return 'NBA'
  if (/\bNHL\b/i.test(s)) return 'NHL'
  if (/\bMLB\b/i.test(s)) return 'MLB'
  if (/\bMLS\b/i.test(s)) return 'MLS'
  return ''
}

/**
 * Circa juice lines: "+2-110", "+2 -110", "UN 54-110", "+348", "(+2 -110)".
 * @returns {{ market: string, side: string, line: string, odds: string } | null}
 */
function parseCasinoJuiceToken(raw) {
  const s = normalizeSlipOcrText(raw).trim().replace(/^\(|\)$/g, '').replace(/\s+/g, ' ')
  if (!s) return null

  // Totals: UN 54-110 / OV 57.5-110 / UN 54 -110
  const tot = /^(OV|UN|OVER|UNDER)\s+(\d+(?:\.\d+)?)([+-]\d{3,5})$/i.exec(s)
    || /^(OV|UN|OVER|UNDER)\s+(\d+(?:\.\d+)?)\s+([+-]\d{3,5})$/i.exec(s)
  if (tot) {
    const side = /^(UN|UNDER)$/i.test(tot[1]) ? 'under' : 'over'
    return {
      market: 'total',
      side,
      line: String(Number(tot[2])),
      odds: americanOddsInputString(tot[3]),
    }
  }

  // Pure ML before glued spread (so "+348" is not misread)
  if (/^[+-]\d{3,5}$/.test(s)) {
    return { market: 'h2h', side: '', line: '', odds: americanOddsInputString(s) }
  }

  // Spread + odds glued or spaced: +2-110 / +2 -110 / -6-110
  const spr = /^([+-]\d+(?:\.\d+)?)([+-]\d{3,5})$/.exec(s)
    || /^([+-]\d+(?:\.\d+)?)\s+([+-]\d{3,5})$/.exec(s)
  if (spr) {
    const lineN = Number(spr[1])
    if (Math.abs(lineN) < 100 || String(spr[1]).includes('.')) {
      return {
        market: 'spread',
        side: '',
        line: String(lineN),
        odds: americanOddsInputString(spr[2]),
      }
    }
  }

  return null
}

function casinoPickTeams(pickRaw) {
  const event_label = ''
  let away_team = ''
  let home_team = ''
  let event = ''
  if (String(pickRaw || '').includes('/')) {
    const parts = pickRaw.split('/').map((p) => titleCaseWords(p.trim())).filter(Boolean)
    if (parts.length === 2) {
      away_team = parts[0]
      home_team = parts[1]
      event = `${away_team} @ ${home_team}`
    }
  }
  return { away_team, home_team, event_label: event }
}

function casinoLegFromPickAndJuice(pickRaw, juice, sportHint) {
  const parsed = parseCasinoJuiceToken(juice)
  if (!parsed || !parsed.odds) return null
  const pick = String(pickRaw || '').trim().replace(/\s+/g, ' ')
  if (!pick) return null
  const teams = casinoPickTeams(pick)
  let selection_label = ''
  if (parsed.market === 'total') {
    const ou = parsed.side === 'under' ? 'Under' : 'Over'
    selection_label = `${ou} ${parsed.line}`
  } else if (parsed.market === 'spread') {
    const n = Number(parsed.line)
    const signed = n > 0 ? `+${n}` : String(n)
    selection_label = `${titleCaseWords(pick)} ${signed}`.trim()
  } else {
    selection_label = `${titleCaseWords(pick)} ML`
  }
  const sport = extractSport(
    [sportHint, teams.event_label, selection_label, pick].filter(Boolean).join(' '),
  )
  return {
    market: parsed.market,
    side: parsed.side,
    line: parsed.line,
    odds: parsed.odds,
    selection_label,
    player_name: '',
    prop_stat: '',
    home_team: teams.home_team,
    away_team: teams.away_team,
    event_label: teams.event_label,
    sport_key: sport.key || '',
    sport_label: sport.label || sportHint || '',
    commence_time: '',
    event_id: '',
  }
}

/**
 * Circa / the D / Wynn casino legs.
 * Prefer zip-by-order: Vision OCR often lists all [rot] picks then all juices.
 * Same-line / parenthesized forms still win immediately.
 */
function extractCasinoBracketLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const legs = []
  const seen = new Set()
  let sportHint = ''
  const picks = []

  const push = (stub) => {
    if (!stub) return
    const key = `${normalizeNameKey(stub.selection_label)}|${stub.odds || 'na'}`
    if (seen.has(key)) return
    seen.add(key)
    legs.push(stub)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const hint = sportHintFromLine(line)
    if (hint) sportHint = hint
    if (/\bcollege\s*fb\b|\bpro\s*basketball\b|\bpro\s*football\b/i.test(line)) {
      if (/basketball/i.test(line)) sportHint = 'NBA'
      else if (/football|fb/i.test(line)) sportHint = /college/i.test(line) ? 'CFB' : 'NFL'
    }

    const paren = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s+\(([^)]+)\)\s*$/i.exec(line)
    if (paren) {
      push(casinoLegFromPickAndJuice(paren[2], paren[3], sportHint))
      continue
    }

    const same = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s+((?:OV|UN|OVER|UNDER)\s+\d+(?:\.\d+)?[+\-\s]*\d{3,5}|[+-]\d+(?:\.\d+)?[+\-\s]*\d{3,5}|[+-]\d{3,5})\s*$/i.exec(line)
    if (same) {
      push(casinoLegFromPickAndJuice(same[2], same[3], sportHint))
      continue
    }

    const head = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s*$/i.exec(line)
    if (!head) continue
    const pickRaw = head[2].trim()
    if (!pickRaw || /^(ticket|parlay|straight|bet)/i.test(pickRaw)) continue
    picks.push({ pickRaw, sportHint })
  }

  // Always zip picks → juice lines in document order (handles bunched OCR).
  if (picks.length >= 2) {
    const juices = []
    for (const line of lines) {
      if (/^\[/.test(line)) continue
      if (/ticket\s*cost|to\s*win|to\s*collect|^\$|parlay\s*\(|bet\(s\)/i.test(line)) continue
      if (parseCasinoJuiceToken(line)) juices.push(line)
    }
    const n = Math.min(picks.length, juices.length)
    for (let i = 0; i < n; i += 1) {
      push(casinoLegFromPickAndJuice(picks[i].pickRaw, juices[i], picks[i].sportHint))
    }
  }

  return legs
}

/**
 * Retail Parlay Card: "133 Michigan -1.5 Spread" (+ optional "At" matchup / datetime lines).
 */
function extractParlayCardLegs(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const legs = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const m = /^(\d{2,4})\s+(.+?)\s+([+-]\d+(?:\.\d+)?)\s+Spread\b/i.exec(line)
    if (!m) continue
    let team = m[2].trim().replace(/\s+/g, ' ')
    // OCR wrap: "Washington Football" then next line starts with "Team +9.5 Spread" … handled if full on one line
    if (/^(team|football)$/i.test(team)) continue
    const lineNum = Number(m[3])
    if (!Number.isFinite(lineNum)) continue
    const signed = lineNum > 0 ? `+${lineNum}` : String(lineNum)
    const selection_label = `${team} ${signed}`.trim()

    let event_label = ''
    let away_team = ''
    let home_team = ''
    let commence_time = ''
    const next = lines[i + 1] || ''
    const next2 = lines[i + 2] || ''
    if (/\bat\b/i.test(next) && !/\bSpread\b/i.test(next)) {
      const ev = parseEventMatchup(next)
      event_label = ev.event || next
      away_team = ev.away_team || ''
      home_team = ev.home_team || ''
      const dt = extractCommenceTime(`${next2}\n${next}`)
      if (dt) commence_time = dt
    } else {
      const dt = extractCommenceTime(next)
      if (dt) commence_time = dt
    }

    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) continue
    seen.add(key)

    const sport = extractSport([selection_label, event_label, next].filter(Boolean).join(' '))
    legs.push({
      market: 'spread',
      side: '',
      line: String(lineNum),
      odds: '',
      selection_label,
      player_name: '',
      prop_stat: '',
      home_team,
      away_team,
      event_label,
      sport_key: sport.key || '',
      sport_label: sport.label || '',
      commence_time,
      event_id: '',
    })
  }
  return legs
}

/** "DEMAR DEROZAN - ALT POINTS" → "Alt Points" */
function extractAltPropStatLine(line) {
  const s = String(line || '').trim()
  if (!s) return ''
  const dashed = /^[A-Za-z][A-Za-z0-9.'\s]*?\s*[-–—]\s*(ALT\s+.+)$/i.exec(s)
  if (dashed) return titleCaseWords(dashed[1].replace(/\s+/g, ' '))
  if (/^ALT\s+/i.test(s) && s.length <= 48) return titleCaseWords(s)
  return ''
}

function cleanEventCandidateLine(line) {
  return normalizeMatchupOcrText(line)
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*$/i, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, '')
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b.*$/i, '')
    .replace(/\s+[+-]\d{2,5}\s*$/i, '')
    // Prefer the matchup when OCR glues rotation + pick onto the same line
    .replace(/^\d{2,5}\s+[A-Za-z0-9.]+\s+MLB\s+[+-]\d{2,5}\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractEvent(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const skipLine = (line) => {
    if (PAYOUT_LINE_RE.test(line)) return true
    if (/ticket\s*cost|slip\s*id|internal\s*id|betslip|account\s*#/i.test(line)) return true
    if (/^(straight|single|parlay)\b/i.test(line) && line.length < 24) return true
    // Circa / the D promo header … "… Account at the counter …" false-matches \bat\b
    if (/sign\s*up|mobile\s*wagering|download\s+the\s+circa|circasports\.com/i.test(line)) return true
    // "1 BET(S) @ $50,000.00" is stake, not a matchup
    if (/\bbet\(s\)\s*@\s*\$/i.test(line) || /\b\d+\s*bet\(s\)\b/i.test(line)) return true
    // Skip "101 49ers MLB" style rotation lines (not the matchup)
    if (/^\d{2,5}\s+\S+.+\bMLB\b/i.test(line) && !/(?:@|\bat\b|\bvs\.?\b)/i.test(line)) return true
    // Sport/market headers like "UFC - FIGHT WINNER/TOTAL ROUNDS" are not events
    if (/fight\s*winner|total\s*rounds/i.test(line) && !/(?:@|\bat\b|\bvs\.?\b)/i.test(line)) return true
    return false
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (skipLine(line)) continue
    // Join "49ers" + "@ Chiefs …" when OCR splits the matchup across lines
    let candidate = line
    const next = lines[i + 1]
    if (
      next
      && !skipLine(next)
      && !/(?:@|\bat\b|\bvs\.?\b)/i.test(line)
      && /^\s*@/.test(normalizeMatchupOcrText(next))
    ) {
      candidate = `${line} ${next}`
    }
    // `@` is non-word … do not wrap it in `\b` or "A @ B" never matches
    const hasSep = /(?:@|\bat\b|\bvs\.?\b|\bv\.?\b)/i.test(candidate)
    const hasNflPairDate = NFL_TEAM_HINT.test(candidate)
      && /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}:\d{2}\b/.test(candidate)
    if (!hasSep && !hasNflPairDate) continue
    const cleaned = cleanEventCandidateLine(candidate)
    if (!cleaned || /\$/.test(cleaned)) continue
    const parsed = parseEventMatchup(
      hasSep ? cleaned : candidate, // keep date on no-@ NFL pair path
    )
    if (parsed.away_team && parsed.home_team) return parsed
  }
  // UFC card title as event when no @/vs (prefer MAIN EVENT / numbered cards)
  for (const line of lines) {
    if (/\bufc\s*\d+/i.test(line) || /\bmain\s*event\b/i.test(line)) {
      const parsed = parseEventMatchup(line.trim())
      return {
        event: parsed.event || line.trim(),
        away_team: parsed.home_team ? parsed.away_team : '',
        home_team: parsed.home_team || '',
      }
    }
  }
  for (const line of lines) {
    if (/\bufc\b/i.test(line) && /(?:vs|\/)/i.test(line)) {
      const parsed = parseEventMatchup(line.trim())
      return {
        event: parsed.event || line.trim(),
        away_team: parsed.home_team ? parsed.away_team : '',
        home_team: parsed.home_team || '',
      }
    }
  }
  return { event: '', away_team: '', home_team: '' }
}

function extractSport(text, { casinoMlbIsMoneyline = false } = {}) {
  const s = String(text || '')
  // Explicit league labels first
  if (/\bnfl\b/i.test(s) || /\bfootball\s*\/\s*nfl\b/i.test(s)) {
    return resolveSportsBetSport('americanfootball_nfl', 'NFL')
  }
  if (/\bncaaf\b|\bcfb\b|\bcollege\s*football\b/i.test(s)) {
    return resolveSportsBetSport('americanfootball_ncaaf', 'CFB')
  }
  if (/\bnba\b/i.test(s)) return resolveSportsBetSport('basketball_nba', 'NBA')
  if (/\bnhl\b/i.test(s)) return resolveSportsBetSport('icehockey_nhl', 'NHL')
  if (/\bmls\b/i.test(s)) return resolveSportsBetSport('soccer_usa_mls', 'MLS')
  if (/\bpga\b|\bgolf\b/i.test(s)) return resolveSportsBetSport('golf_pga', 'Golf')
  // Baseball only when clearly baseball (not casino "MLB" moneyline token)
  if (!casinoMlbIsMoneyline && /\bbaseball\b/i.test(s)) {
    return resolveSportsBetSport('baseball_mlb', 'MLB')
  }
  if (!casinoMlbIsMoneyline && /\bmlb\b/i.test(s) && !/\d{2,5}\s+\S+\s+MLB\b/i.test(s) && !/\bMLB\s*[+-]\d/i.test(s)) {
    // "MLB |" style app labels OK; bare casino rotation "TEAM MLB" handled via casinoMlbIsMoneyline
    if (/\|/.test(s) || /baseball\s*\/\s*mlb/i.test(s)) {
      return resolveSportsBetSport('baseball_mlb', 'MLB')
    }
  }
  if (/\bufc\b/i.test(s) || /\bmma\b/i.test(s)) {
    return sportByKey(SPORTS_BET_SPORT_UFC) || { key: SPORTS_BET_SPORT_UFC, label: 'UFC' }
  }
  if (
    /\bboxing\b|title\s*bout|lightweight\s*title|fight\s+to\s+go|method\s+of\s+victory/i.test(s)
    || (/\b[A-Z]\.\s*[A-Za-z]+\s+vs\.?\s+[A-Z]\.\s*[A-Za-z]+\b/.test(s) && !/\bufc\b|\bmma\b/i.test(s))
  ) {
    return sportByKey(SPORTS_BET_SPORT_BOXING) || { key: SPORTS_BET_SPORT_BOXING, label: 'Boxing' }
  }
  if (NFL_TEAM_HINT.test(s)) {
    return resolveSportsBetSport('americanfootball_nfl', 'NFL')
  }
  return { key: '', label: '' }
}

function monthIndex(name) {
  const n = String(name || '').toLowerCase().slice(0, 3)
  const map = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  return map[n]
}

function toIsoLocal(y, mo, d, h = 12, mi = 0, s = 0) {
  if (!y || mo == null || !d) return ''
  const dt = new Date(y, mo, d, h, mi, s)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toISOString()
}

function parseAmPmTime(hStr, mStr, ap) {
  let h = Number(hStr)
  const mi = Number(mStr || 0)
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return { h: 12, mi: 0 }
  const a = String(ap || '').toLowerCase()
  if (a.startsWith('p') && h < 12) h += 12
  if (a.startsWith('a') && h === 12) h = 0
  return { h, mi }
}

function extractCommenceTime(text) {
  const raw = String(text || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  // Prefer lines that look like event timing (near matchup / sport), not ticket print
  const candidates = []

  const push = (iso, score) => {
    if (iso) candidates.push({ iso, score })
  }

  for (const line of lines) {
    let score = 1
    if (/ticket\s*cost|printed|transaction|slip\s*id|book\s+\d|internal\s*id/i.test(line)) score -= 2
    if (/(?:@|\bvs\.?\b)/i.test(line) || /\bnfl\b|\bufc\b|event\s*start/i.test(line)) score += 3
    if (/\bevent\s*date\b/i.test(line)) score += 6
    if (/january|february|march|april|may|june|july|august|september|october|november|december/i.test(line)) {
      score += 1
    }

    // Event Date 10/17/2020  (explicit label … highest confidence date-only)
    let m = /\bevent\s*date\s*[:=]?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i.exec(line)
    if (m) {
      let y = Number(m[3])
      if (y < 100) y += 2000
      push(toIsoLocal(y, Number(m[1]) - 1, Number(m[2]), 12, 0), score + 2)
      continue
    }

    // 2/2/2020 3:30 PM
    m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(line)
    if (m) {
      let y = Number(m[3])
      if (y < 100) y += 2000
      const { h, mi } = parseAmPmTime(m[4], m[5], m[7] || 'pm')
      push(toIsoLocal(y, Number(m[1]) - 1, Number(m[2]), h, mi, Number(m[6] || 0)), score)
      continue
    }

    // Oct 18, 4:25 pm  /  Oct 18, 2024, 4:25 pm
    m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,?\s*(\d{4}))?,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i.exec(line)
    if (m) {
      const mo = monthIndex(m[1])
      const day = Number(m[2])
      const y = m[3] ? Number(m[3]) : new Date().getFullYear()
      const { h, mi } = parseAmPmTime(m[4], m[5], m[7])
      push(toIsoLocal(y, mo, day, h, mi, Number(m[6] || 0)), score)
      continue
    }

    // January 24, 2021, 6:40:00 PM
    m = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i.exec(line)
    if (m) {
      const mo = monthIndex(m[1])
      const { h, mi } = parseAmPmTime(m[4], m[5], m[7])
      push(toIsoLocal(Number(m[3]), mo, Number(m[2]), h, mi, Number(m[6] || 0)), score)
      continue
    }

    // Jul 10 2021 20:27:51 (24h)
    m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(line)
    if (m) {
      const mo = monthIndex(m[1])
      push(toIsoLocal(Number(m[3]), mo, Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6] || 0)), score)
      continue
    }

    // 05/03/25, 11:55 PM
    m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(line)
    if (m) {
      let y = Number(m[3])
      if (y < 100) y += 2000
      const { h, mi } = parseAmPmTime(m[4], m[5], m[6])
      push(toIsoLocal(y, Number(m[1]) - 1, Number(m[2]), h, mi), score)
      continue
    }

    // Bare date-only 10/17/2020 (noon). Boost when slip has Event Date / fight context.
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(line)
    if (m) {
      let y = Number(m[3])
      if (y < 100) y += 2000
      let dateScore = score
      if (/\bevent\s*date\b/i.test(raw)) dateScore += 5
      if (/\b(fight|bout|title|ufc|boxing|mma)\b/i.test(raw)) dateScore += 1
      push(toIsoLocal(y, Number(m[1]) - 1, Number(m[2]), 12, 0), dateScore)
    }
  }

  if (!candidates.length) return ''
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].iso
}

function looksLikeTicketIdOdds(line) {
  const s = String(line || '')
  // Hex ticket fragments: F2C76-E1FF-8055 → "-8055"
  if (/[A-F0-9]{3,}-[A-F0-9]{3,}-[A-F0-9]{3,}/i.test(s)) return true
  if (/^[A-Z0-9-]{8,}$/i.test(s.trim()) && !/\b(ml|mlb|over|under|spread|odds)\b/i.test(s)) return true
  return false
}

function scoreOddsLine(line, odds) {
  let score = 0
  const s = String(line || '')
  if (looksLikeTicketIdOdds(s)) return -100
  if (/\b(over|under)\b/i.test(s)) score += 5
  if (/\b(mlb|ml|moneyline|spread|point\s*spread)\b/i.test(s)) score += 4
  if (/\b(total\s*odds)\b/i.test(s)) score += 3
  if (/\[\d+\]/.test(s) || /^\s*\d{3,5}\s+[A-Za-z]/.test(s)) score += 3
  if (/[A-Za-z]{3,}/.test(s)) score += 1
  if (PAYOUT_LINE_RE.test(s)) score -= 3
  if (Math.abs(odds) >= 100 && Math.abs(odds) <= 10000) score += 1
  return score
}

function findPrimaryOdds(text) {
  const lines = String(text || '').split('\n')
  const candidates = []
  for (const line of lines) {
    const re = /(?<![.\d])([+-]\d{3,5})(?!\d)/g
    let m
    while ((m = re.exec(line))) {
      const n = americanOrNull(m[1])
      if (n == null) continue
      const score = scoreOddsLine(line, n)
      if (score < 0) continue
      candidates.push({ odds: n, line, score })
    }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return { odds: candidates[0].odds, line: candidates[0].line }
}

function extractMarketDetails(text, oddsLine) {
  const raw = String(text || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  // Player prop: "Kirk Cousins Over 4.5" (+odds) + "PASSING TOUCHDOWNS"
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const prop = /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+(over|under)\s+([0-9]+(?:\.[0-9]+)?)\b/i.exec(line)
    if (prop) {
      const player = prop[1].trim()
      // Avoid "Point Spread: … Over" false paths; player names usually have 2+ tokens or a capital first name
      if (/^(point|total|team|game|the)$/i.test(player)) continue
      const side = prop[2].toLowerCase() === 'under' ? 'under' : 'over'
      const lineNum = Number(prop[3])
      let stat = ''
      const next = lines[i + 1] || ''
      const altStat = extractAltPropStatLine(next)
      if (altStat) {
        stat = altStat
      } else if (
        next
        && !/(?:@|\bvs\.?\b)/i.test(next)
        && !/[+-]\d{3,5}/.test(next)
        && (
          /^[A-Z0-9][A-Z0-9\s/&-]{2,40}$/.test(next)
          || /touchdown|passing|rushing|receiving|yards|points|assists|rebounds|strikeout/i.test(next)
        )
      ) {
        stat = titleCaseWords(next)
      }
      const ou = side === 'under' ? 'Under' : 'Over'
      const selection_label = [player, ou, String(lineNum), stat].filter(Boolean).join(' ')
      return {
        market: 'prop',
        side,
        line: lineNum,
        player_name: player,
        prop_stat: stat,
        selection_label,
      }
    }
  }

  // Point Spread: BUF Bills +3.5
  const spreadLabeled = /point\s*spread\s*:\s*(.+?)\s+([+-][0-9]+(?:\.[0-9]+)?)\s*$/i.exec(raw)
    || /(?:^|\n)\s*(.+?)\s+([+-][0-9]+(?:\.[0-9]+)?)\s*$/im.exec(
      lines.find((l) => /point\s*spread/i.test(l) || (/[+-]\d+\.\d/.test(l) && !americanOrNull(l.match(/[+-]\d+/)?.[0]))) || '',
    )
  if (spreadLabeled || /point\s*spread/i.test(raw)) {
    const pickLine = lines.find((l) => /point\s*spread\s*:/i.test(l))
      || lines.find((l) => /[+-]\d+\.\d/.test(l) && !/[+-]\d{3,5}/.test(l.replace(/[+-]\d+\.\d/, '')))
    const sm = pickLine
      ? /(?:point\s*spread\s*:\s*)?(.+?)\s+([+-][0-9]+(?:\.[0-9]+)?)\s*$/i.exec(pickLine)
      : null
    if (sm) {
      const team = sm[1].replace(/point\s*spread\s*:/i, '').trim()
      const lineNum = Number(sm[2])
      return {
        market: 'spread',
        side: 'away',
        line: lineNum,
        player_name: '',
        prop_stat: '',
        selection_label: `${team} ${sm[2]}`.trim(),
      }
    }
  }

  // Fight props / side-less specials (distance, rounds, method, …) before fighter ML
  const sideLess = extractSideLessOrFightProp(raw, lines)
  if (sideLess) return sideLess

  // Casino moneyline: "101 49ers MLB" + odds  (MLB = moneyline bet)
  const casinoMl = /(\d{2,5})\s+([A-Za-z0-9.]+(?:\s+[A-Za-z0-9.]+)?)\s+MLB\b/i.exec(raw)
  if (casinoMl) {
    const team = casinoMl[2].trim()
    return {
      market: 'h2h',
      side: 'away',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: team,
      casinoMlbIsMoneyline: true,
    }
  }

  // Fighter ML heuristics … skip when the ticket is clearly a side-less fight prop
  if (!looksLikeSideLessBet(raw)) {
    // Circa-style "[24901] D POIRIER" or "2101 LOPEZ T"
    const fighter = /\[\d+\]\s*([A-Z][A-Z0-9. ]+?)(?:\s+[+-]\d{3,5})?\s*$/m.exec(raw)
      || /^\s*\d{3,5}\s+([A-Z][A-Z0-9. ]+?)\s*$/m.exec(oddsLine || '')
      || /^\s*\d{3,5}\s+([A-Za-z][A-Za-z0-9. ]+?)\s*$/m.exec(
        lines.find((l) => /^\d{3,5}\s+[A-Za-z]/.test(l) && !/\bMLB\b/i.test(l)) || '',
      )
    if (fighter && (/\bufc\b|fight|bout|title/i.test(raw) || fighter)) {
      const name = fighter[1].trim().replace(/\s+/g, ' ')
      if (name.length >= 2 && !/straight|ticket|bet/i.test(name)) {
        return {
          market: 'h2h',
          side: 'home',
          line: null,
          player_name: '',
          prop_stat: '',
          selection_label: titleCaseWords(name),
        }
      }
    }

    // Barstool / app UFC: fighter on its own line above American odds ("D Poirier" / "-145")
    if (/\bufc\b|\bmma\b|\bboxing\b|fight|bout|title/i.test(raw)) {
      const oddsTrim = String(oddsLine || '').trim()
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const isOddsLine = /^[+-]\d{3,5}\s*$/.test(line)
          || (oddsTrim && (line === oddsTrim || line.includes(oddsTrim)))
        if (!isOddsLine) continue
        const prev = lines[i - 1] || ''
        if (
          looksLikePersonName(prev)
          && !/\b(sportsbook|event|ticket|straight|risk|payout|main|total|rounds)\b/i.test(prev)
        ) {
          return {
            market: 'h2h',
            side: 'home',
            line: null,
            player_name: '',
            prop_stat: '',
            selection_label: titleCaseWords(prev),
          }
        }
      }
    }
  }

  // Generic over/under total (game total, not player)
  const total = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)\b/i.exec(raw)
  if (total && !/[A-Za-z]{3,}\s+(over|under)\s+/i.test(raw)) {
    const side = total[1].toLowerCase() === 'under' ? 'under' : 'over'
    const unit = /\brounds?\b/i.test(raw) ? ' Rounds' : (/\bknockdowns?\b/i.test(raw) ? ' Knockdowns' : '')
    return {
      market: 'total',
      side,
      line: Number(total[2]),
      player_name: '',
      prop_stat: '',
      selection_label: `${side === 'under' ? 'Under' : 'Over'} ${total[2]}${unit}`,
    }
  }

  // "Straight Bet" alone is not a moneyline pick (often wraps props)
  if (/\b(ml|moneyline|money\s*line)\b/i.test(raw)) {
    return {
      market: 'h2h',
      side: 'home',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: '',
    }
  }

  return {
    market: 'other',
    side: '',
    line: null,
    player_name: '',
    prop_stat: '',
    selection_label: '',
  }
}

function draftFromBits({
  selection,
  odds,
  stakeDollars,
  stakeUnits,
  book,
  event,
  source,
  market,
  side,
  line,
  player_name,
  prop_stat,
  selection_label,
  sport_key,
  sport_label,
  home_team,
  away_team,
  commence_time,
}) {
  const american = americanOrNull(odds)
  if (american == null) return null

  const eventBits = parseEventMatchup(event)
  const away = away_team || eventBits.away_team || ''
  const home = home_team || eventBits.home_team || ''
  const eventLabel = eventBits.event || event || [away, home].filter(Boolean).join(' @ ')

  let mkt = market || ''
  let sd = side || ''
  let ln = line
  let label = selection_label || ''
  let player = player_name || ''
  let stat = prop_stat || ''

  if (!mkt) {
    const guessed = extractMarketDetails(selection || eventLabel, '')
    mkt = guessed.market
    sd = guessed.side
    ln = guessed.line
    label = guessed.selection_label || label
    player = guessed.player_name || player
    stat = guessed.prop_stat || stat
  }

  if (!label) {
    const sel = String(selection || '').trim()
    if (sel && !sel.includes('\n') && sel.length <= 80) {
      label = sel.slice(0, 120)
    } else if (eventLabel) {
      label = String(eventLabel).slice(0, 120)
    }
  }

  const dollars = stakeDollars != null && Number(stakeDollars) > 0 ? Number(stakeDollars) : null
  const units = stakeUnits != null && Number(stakeUnits) > 0 ? Number(stakeUnits) : null

  const marketFinal = mkt || 'other'
  // h2h/spread default home; other/parlay may be side-less (distance props, etc.)
  const sideDefault = (marketFinal === 'h2h' || marketFinal === 'spread') ? 'home' : ''
  return {
    book: book || '',
    market: marketFinal,
    side: marketFinal === 'parlay' ? '' : (sd != null && sd !== '' ? sd : sideDefault),
    line: ln != null && ln !== '' ? String(ln) : '',
    odds: americanOddsInputString(american),
    stake_units: units != null ? String(units) : '',
    stake_dollars: dollars != null ? String(dollars) : '',
    selection_label: label,
    notes: '',
    home_team: home,
    away_team: away,
    sport_label: sport_label || '',
    event_id: '',
    sport_key: sport_key || '',
    commence_time: commence_time || '',
    player_name: player,
    prop_stat: stat,
    event_label: eventLabel,
    source,
    legs: [],
  }
}

function countPlayerPropOuLines(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  let n = 0
  for (const line of lines) {
    const m = PLAYER_PROP_OU_LINE_RE.exec(line)
    if (!m) continue
    if (/^(point|total|team|game|the)$/i.test(m[1])) continue
    n += 1
  }
  return n
}

function looksLikeParlayText(text) {
  const raw = String(text || '')
  if (/\bparlay\b|\bsgp\b|same\s*game\s*parlay|\d+\s*-\s*leg\b|\d+\s+legs?\b|multiples/i.test(raw)) {
    return true
  }
  // FanDuel settled multi-prop: no "Parlay" word, just stacked Over/Under legs + TOTAL WAGER
  if (countPlayerPropOuLines(raw) >= 2) return true
  // DK "SINGLES" stake-all / multi-ML betslip with no Parlay label
  const mlHits = raw.match(/\b(?:moneyline|money\s*line)\b/gi) || []
  if (mlHits.length >= 2 && /(?:bet\s*slip|place\s*bet|total\s*payout|total\s*wager)/i.test(raw)) {
    return true
  }
  return false
}

/** Bare American odds line, optionally with trailing OCR "x" / "X". */
function bareAmericanOddsLine(line) {
  const m = /^([+-]\d{3,6})\s*[xX]?\s*$/.exec(String(line || '').trim())
  return m ? americanOddsInputString(m[1]) : ''
}

function extractTotalParlayOdds(text) {
  const raw = normalizeSlipOcrText(text)
  // Boosted: "+7994 +9993" / OCR "B0OST" → take the last (boosted) price first
  if (/boost|b0ost/i.test(raw)) {
    const boost = /([+-]\d{3,5})\s+([+-]\d{3,5})/.exec(raw)
    if (boost) {
      const a = americanOrNull(boost[1])
      const b = americanOrNull(boost[2])
      if (a != null && b != null) return Math.abs(b) >= Math.abs(a) ? b : a
    }
  }
  const m = /total\s*odds\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /combined\s*(?:odds|price)\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /parlay\s*odds\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /parlay\s*\(\d+\)\s*@\s*([+-]\d{3,5})/i.exec(raw)
    || /(\d+)\s*(?:pick\s+)?parlay[\s\S]{0,80}?([+-]\d{3,6})/i.exec(raw)
    || /(\d+)\s*leg(?:\s+parlay)?[\s\S]{0,40}?([+-]\d{3,6})/i.exec(raw)
  if (m) {
    const oddsTok = m[2] && /^[+-]/.test(m[2]) ? m[2] : m[1]
    const n = americanOrNull(oddsTok)
    if (n != null) return n
  }
  // Decimal combined odds (LIGA365): prefer the largest "Odds: X.XX" (ticket vs per-leg)
  let bestDec = null
  for (const mDec of raw.matchAll(/(?:^|\n)\s*odds\s*:\s*(\d+\.\d{2,})\s*(?:\n|$)/gi)) {
    const d = Number(mDec[1])
    if (!(d > 1.5 && d < 500)) continue
    if (bestDec == null || d > bestDec) bestDec = d
  }
  if (bestDec != null) {
    const a = decimalToAmerican(bestDec)
    if (a != null) return a
  }
  return null
}

function legStubFromSelection(sel, odds, rawSport, { allowMissingOdds = false } = {}) {
  const selection = String(sel || '').trim()
  if (!selection || selection.length > 100) return null
  if (/^(total|parlay|straight|single|wager|risk|payout|ticket)/i.test(selection)) return null
  if (/\bodds\b/i.test(selection) && selection.length < 24) return null
  const american = odds == null || odds === '' ? null : americanOrNull(odds)
  if (american == null && !allowMissingOdds) return null
  const details = extractMarketDetails(
    selection,
    american != null ? `${selection} ${american}` : selection,
  )
  const eventBits = parseEventMatchup(selection)
  const sport = rawSport || extractSport(selection, {
    casinoMlbIsMoneyline: Boolean(details.casinoMlbIsMoneyline),
  })
  let market = details.market || 'h2h'
  if (market === 'other' && /[+-]\d+\.\d/.test(selection)) market = 'spread'
  if (market === 'other') market = 'h2h'
  return {
    market,
    side: details.side || '',
    line: details.line != null && details.line !== '' ? String(details.line) : '',
    odds: american != null ? americanOddsInputString(american) : '',
    selection_label: details.selection_label || selection,
    player_name: details.player_name || '',
    prop_stat: details.prop_stat || '',
    home_team: eventBits.home_team || '',
    away_team: eventBits.home_team ? eventBits.away_team : '',
    event_label: eventBits.event || '',
    sport_key: sport.key || '',
    sport_label: sport.label || '',
    commence_time: '',
    event_id: '',
  }
}

/**
 * FanDuel-style prop legs without per-leg juice:
 * "DeMar DeRozan Over 23.5" / "DEMAR DEROZAN - ALT POINTS"
 */
function extractPropLegsWithoutOdds(text, rawSport) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const legs = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i += 1) {
    const m = PLAYER_PROP_OU_LINE_RE.exec(lines[i])
    if (!m) continue
    const player = m[1].trim()
    if (/^(point|total|team|game|the)$/i.test(player)) continue
    const side = m[2].toLowerCase() === 'under' ? 'under' : 'over'
    const lineNum = Number(m[3])
    let stat = extractAltPropStatLine(lines[i + 1] || '')
    if (!stat) {
      const next = lines[i + 1] || ''
      if (
        next
        && !PLAYER_PROP_OU_LINE_RE.test(next)
        && !/(?:@|\bvs\.?\b)/i.test(next)
        && !/[+-]\d{3,5}/.test(next)
        && (
          /^[A-Z0-9][A-Z0-9\s/&-]{2,48}$/.test(next)
          || /touchdown|passing|rushing|receiving|yards|points|assists|rebounds|strikeout/i.test(next)
        )
      ) {
        stat = titleCaseWords(next)
      }
    }
    const ou = side === 'under' ? 'Under' : 'Over'
    const selection_label = [player, ou, String(lineNum), stat].filter(Boolean).join(' ')
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) continue
    seen.add(key)
    const sport = rawSport || extractSport(`${selection_label} ${stat}`)
    legs.push({
      market: 'prop',
      side,
      line: String(lineNum),
      odds: '',
      selection_label,
      player_name: player,
      prop_stat: stat,
      home_team: '',
      away_team: '',
      event_label: '',
      sport_key: sport.key || '',
      sport_label: sport.label || '',
      commence_time: '',
      event_id: '',
    })
  }
  return legs
}

/**
 * Open betslip spreads/totals: "CLE Browns -3" / "Point Spread" / matchup (+ odds bunched).
 */
function emptyLegStub(extra = {}) {
  return {
    market: 'h2h',
    side: '',
    line: '',
    odds: '',
    selection_label: '',
    player_name: '',
    prop_stat: '',
    home_team: '',
    away_team: '',
    event_label: '',
    sport_key: '',
    sport_label: '',
    commence_time: '',
    event_id: '',
    ...extra,
  }
}

function extractAppSpreadTotalLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const next = lines[i + 1] || ''
    // Fanatics: "Spread -3.5" / "Total Points 40.5" / "Moneyline"
    const marketLine = /^(point\s*spread|spread(?:\s+betting|\s+[+-]?\d+(?:\.\d+)?)?|total\s*points|moneyline|money\s*line|ml)\b/i.test(next)
    if (!marketLine) continue

    const under = /^(over|under)\s+(\d+(?:\.\d+)?)\s*$/i.exec(line)
    const spread = /^(.+?)\s+([+-]\d+(?:\.\d+)?)\s*$/.exec(line)
    const isMl = /^(?:moneyline|money\s*line|ml)\b/i.test(next)
    let stub = null
    if (under) {
      const side = under[1].toLowerCase() === 'under' ? 'under' : 'over'
      const lineNum = Number(under[2])
      stub = emptyLegStub({
        market: 'total',
        side,
        line: String(lineNum),
        selection_label: `${side === 'under' ? 'Under' : 'Over'} ${lineNum}`,
      })
    } else if (spread && !/^(over|under)$/i.test(spread[1])) {
      const team = spread[1].replace(/^[×xX]\s*/, '').trim()
      if (/parlay|wager|odds|singles|clear|straights|fanatics/i.test(team)) continue
      const lineNum = Number(spread[2])
      if (!Number.isFinite(lineNum) || Math.abs(lineNum) >= 100) continue
      const signed = lineNum > 0 ? `+${lineNum}` : String(lineNum)
      stub = emptyLegStub({
        market: isMl ? 'h2h' : 'spread',
        line: isMl ? '' : String(lineNum),
        selection_label: isMl ? `${titleCaseWords(team)} ML` : `${titleCaseWords(team)} ${signed}`,
      })
    } else if (isMl && /^[A-Za-z]/.test(line) && line.length < 48 && !/^(over|under|parlay)/i.test(line)) {
      // "Los Angeles Rams" + Moneyline (no ± on selection line)
      const team = line.replace(/^[×xX]\s*/, '').trim()
      if (/parlay|wager|odds|singles|clear|remove|straights|betslip/i.test(team)) continue
      stub = emptyLegStub({
        market: 'h2h',
        selection_label: `${titleCaseWords(team)} ML`,
      })
    }
    if (!stub) continue

    const matchupLine = lines[i + 2] || ''
    if (/(?:@|\bat\b|\bv\.?\b)/i.test(matchupLine)) {
      const cleaned = matchupLine
        .replace(/^[•·→]\s*/, '')
        .replace(/\bNFL\s*[•·]\s*/i, '')
        .replace(/[©]/g, '@')
        .replace(/\s+/g, ' ')
      const ev = parseEventMatchup(cleaned)
      stub.event_label = ev.event || cleaned
      stub.away_team = ev.away_team || ''
      stub.home_team = ev.home_team || ''
      const sport = extractSport(matchupLine)
      stub.sport_key = sport.key || ''
      stub.sport_label = sport.label || ''
    }

    const key = normalizeNameKey(stub.selection_label)
    if (seen.has(key)) continue
    seen.add(key)
    pending.push(stub)
  }

  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
}

/**
 * DraftKings / Fanatics open betslip moneylines:
 * "× GB Packers" / Moneyline / matchup / -238  (odds may be bunched)
 */
function extractAppMoneylineBetslipLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!/^(?:moneyline|money\s*line)$/i.test(lines[i + 1] || '')) continue
    const team = line.replace(/^[×xX$]\s*/, '').trim()
    if (!team || team.length > 48 || /singles|parlay|stake|clear|straights|remove/i.test(team)) continue
    let event_label = ''
    let away_team = ''
    let home_team = ''
    let odds = ''
    // Leading juice on previous line (DK: "-200" then "TB Rays")
    const prev = lines[i - 1] || ''
    if (/^[+-]\d{3,5}$/.test(prev)) odds = americanOddsInputString(prev)

    for (let j = i + 2; j < Math.min(i + 10, lines.length); j += 1) {
      const next = lines[j]
      if (/^(?:moneyline|money\s*line)$/i.test(next) || /^[×xX]/.test(next)) break
      if (/^[+-]\d{3,5}$/.test(next)) {
        const after = lines.slice(j + 1).find((l) => l && !/^(sun|mon|tue|wed|thu|fri|sat|\d{1,2}:\d{2}|0\.00)/i.test(l))
        if (after && /^[+-]\d{3,5}$/.test(after)) break // bunched trail
        odds = americanOddsInputString(next)
        break
      }
      if (/(?:@|\bat\b)/i.test(next)) {
        const ev = parseEventMatchup(next.replace(/^[•·→]\s*/, '').replace(/\s*[•·].*$/, ''))
        event_label = ev.event || next
        away_team = ev.away_team || ''
        home_team = ev.home_team || ''
      }
    }
    const selection_label = `${titleCaseWords(team)} ML`
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) continue
    seen.add(key)
    const sport = extractSport([selection_label, event_label].join(' '))
    pending.push(emptyLegStub({
      market: 'h2h',
      odds,
      selection_label,
      home_team,
      away_team,
      event_label,
      sport_key: sport.key || '',
      sport_label: sport.label || '',
    }))
  }

  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
}

/**
 * DraftKings My Bets: "Boston Red Sox / Under 8.5" MONEY LINE / TOTAL RUNS PARLAY
 */
function extractDkMlTotalComboLegs(text) {
  const raw = normalizeSlipOcrText(text)
  if (!/money\s*line\s*\/\s*total|total\s*runs\s*parlay/i.test(raw)) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i]
    // OCR wrap: "Colorado Rockies / Under" then "10.5"
    if (/\/\s*(over|under)\s*$/i.test(line) && /^\d+(?:\.\d+)?$/.test(lines[i + 1] || '')) {
      line = `${line} ${lines[i + 1]}`
    }
    const m = /^(.+?)\s*\/\s*(over|under)\s+(\d+(?:\.\d+)?)\s*$/i.exec(line)
    if (m) {
      const team = titleCaseWords(m[1].trim())
      const side = m[2].toLowerCase() === 'under' ? 'under' : 'over'
      const lineNum = Number(m[3])
      const ou = side === 'under' ? 'Under' : 'Over'
      const selection_label = `${team} / ${ou} ${lineNum}`
      const key = normalizeNameKey(selection_label)
      if (seen.has(key)) continue
      seen.add(key)
      pending.push(emptyLegStub({
        market: 'other',
        side,
        line: String(lineNum),
        selection_label,
        prop_stat: 'ML / Total',
        sport_key: 'baseball_mlb',
        sport_label: 'MLB',
      }))
      continue
    }
    // Plain ML leg in same ticket: "San Francisco Giants" + MONEYLINE
    if (/^moneyline$/i.test(lines[i + 1] || '') && /^[A-Za-z]/.test(line) && !/\//.test(line)) {
      const team = titleCaseWords(line)
      if (/boston|tampa|colorado|minnesota|cincinnati|washington|baltimore|san francisco|giants|rockies|rays|red sox/i.test(team)
        || pending.length) {
        const selection_label = `${team} ML`
        const key = normalizeNameKey(selection_label)
        if (seen.has(key)) continue
        seen.add(key)
        pending.push(emptyLegStub({
          market: 'h2h',
          selection_label,
          sport_key: 'baseball_mlb',
          sport_label: 'MLB',
        }))
      }
    }
  }
  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
}

/**
 * FanDuel My Bets settled: selection then MONEYLINE / 1ST HALF … odds bunched at end.
 */
function extractFanDuelMyBetsLegs(text) {
  const raw = normalizeSlipOcrText(text)
  // Only My Bets / settled receipts … not open FanDuel betslips (those use spread/ML extractors)
  if (!/(?:my\s*bets|won\s+on\s+fanduel|total\s*wager)/i.test(raw)) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const marketRe = /^(moneyline|half-?time\s*result|1st\s*half\s*over\/under|spread\s*betting|total\s*points)\b/i
  // OCR: "1ST HALE OVERJUNDER D.5 GOLLS"
  const marketFuzzy = /moneyline|half-?time|over\s*\/?\s*under|hale\s*over|gol/i

  for (let i = 0; i < lines.length; i += 1) {
    const market = lines[i + 1] || ''
    const sel = lines[i]
    if (!sel || sel.length > 60) continue
    if (/^(my\s*bets|active|settled|saved|fanduel|panduel|draw\s*moneyline|\d+\s*leg)/i.test(sel)) continue
    if (bareAmericanOddsLine(sel) || /^finished$|^live$/i.test(sel)) continue
    if (/^\d/.test(sel) && !/^(1st|2nd)/i.test(sel)) continue

    const ou = /^(?:1st\s*half\s+)?(over|under)\s+(\d+(?:\.\d+)?)\s*goals?\s*$/i.exec(sel)
      || /^(?:1st\s*half\s+)?(over|under)\s+(\d+(?:\.\d+)?)\s*$/i.exec(sel)
    const marketOk = marketRe.test(market) || (ou && marketFuzzy.test(market))
    if (!marketOk) continue

    let marketKind = 'h2h'
    let side = ''
    let line = ''
    let selection_label = titleCaseWords(sel)
    if (ou) {
      marketKind = 'total'
      side = ou[1].toLowerCase() === 'under' ? 'under' : 'over'
      line = String(Number(ou[2]))
      selection_label = `1H ${side === 'under' ? 'Under' : 'Over'} ${line} Goals`
    } else if (/^draw$/i.test(sel)) {
      marketKind = 'h2h'
      selection_label = 'Draw'
    } else if (/half-?time\s*result/i.test(market)) {
      marketKind = 'other'
      selection_label = `${titleCaseWords(sel)} HT`
    } else if (/moneyline/i.test(market)) {
      marketKind = 'h2h'
      selection_label = `${titleCaseWords(sel)} ML`
    }

    // Same market text can appear twice (two Under 0.5 legs) … keep both
    pending.push(emptyLegStub({
      market: marketKind,
      side,
      line,
      selection_label,
    }))
  }

  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
}

/** BetRivers / SugarHouse UFC multiples: fighter + "A vs B" + bunched odds. */
function extractUfcFighterParlayLegs(text) {
  const raw = normalizeSlipOcrText(text)
  if (!/parlay\s*\(\d+\s*picks?\)|multiples/i.test(raw)) return []
  if (!/\bvs\.?\b/i.test(raw)) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const matchup = lines[i + 1] || ''
    if (!/\bvs\.?\b/i.test(matchup)) continue
    const fighter = lines[i]
    if (!fighter || fighter.length > 40) continue
    if (/parlay|singles|multiples|risk|win|open\s*bets|bet\s*slip/i.test(fighter)) continue
    if (/^[+-]\d/.test(fighter)) continue
    // Fighter should appear in the matchup line
    const fKey = normalizeNameKey(fighter)
    if (!normalizeNameKey(matchup).includes(fKey.split(' ').pop() || fKey)) continue
    const key = fKey
    if (seen.has(key)) continue
    seen.add(key)
    pending.push(emptyLegStub({
      market: 'h2h',
      selection_label: `${titleCaseWords(fighter)} ML`,
      event_label: matchup.replace(/\s+/g, ' '),
      sport_key: 'mma_mixed_martial_arts',
      sport_label: 'UFC',
    }))
  }
  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
}

/** LIGA365-style decimal odds parlays: "Bet : Over 2" / "Odds: 1.51". */
function extractDecimalOddsParlayLegs(text) {
  const raw = normalizeSlipOcrText(text)
  if (!/odds\s*:\s*\d+\.\d+/i.test(raw) || !/bet\s*:/i.test(raw)) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const legs = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const betLine = lines[i]
    const bet = /^bet\s*:\s*(.+)$/i.exec(betLine)
    if (!bet) continue
    const selection = bet[1].trim()
    let decimal = null
    // Odds may be on same block: previous "Odds: 1.51" or next lines
    for (let j = Math.max(0, i - 3); j < Math.min(lines.length, i + 3); j += 1) {
      const om = /odds\s*:\s*(\d+\.\d+)/i.exec(lines[j])
      if (om) {
        const d = Number(om[1])
        if (d > 1 && d < 50) {
          decimal = d
          break
        }
      }
    }
    if (decimal == null) continue
    const american = decimalToAmerican(decimal)
    if (american == null) continue
    const odds = americanOddsInputString(american)
    let market = 'other'
    let side = ''
    let line = ''
    let selection_label = selection
    const ou = /^(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(selection)
    if (ou) {
      market = 'total'
      side = ou[1].toLowerCase() === 'under' ? 'under' : 'over'
      line = String(Number(ou[2]))
      selection_label = `${side === 'under' ? 'Under' : 'Over'} ${line}`
    } else if (/away\s*win/i.test(selection)) {
      market = 'h2h'
      selection_label = 'Away ML'
    } else if (/home\s*win/i.test(selection)) {
      market = 'h2h'
      selection_label = 'Home ML'
    } else if (/^(.+?)\s+([+-]\d+(?:\.\d+)?)$/.test(selection)) {
      const sm = /^(.+?)\s+([+-]\d+(?:\.\d+)?)$/.exec(selection)
      market = 'spread'
      line = String(Number(sm[2]))
      selection_label = `${titleCaseWords(sm[1])} ${Number(sm[2]) > 0 ? `+${Number(sm[2])}` : String(Number(sm[2]))}`
    }
    const key = `${normalizeNameKey(selection_label)}|${odds}`
    if (seen.has(key)) continue
    seen.add(key)
    legs.push(emptyLegStub({
      market,
      side,
      line,
      odds,
      selection_label,
    }))
  }
  return legs
}

/** Futures: "ATL Braves (Winner)" + odds (Hollywood / championship slips). */
function extractFuturesWinnerLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(.+?)\s*\((winner)\)\s*$/i.exec(lines[i])
    if (!m) continue
    const team = titleCaseWords(m[1].trim())
    if (!team || team.length > 48) continue
    let odds = ''
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      if (/\(winner\)/i.test(lines[j])) break
      if (/^[+-]\d{3,5}$/.test(lines[j])) {
        odds = americanOddsInputString(lines[j])
        break
      }
    }
    const key = normalizeNameKey(team)
    if (seen.has(key)) continue
    seen.add(key)
    pending.push({
      market: 'other',
      side: '',
      line: '',
      odds,
      selection_label: `${team} Winner`,
      player_name: '',
      prop_stat: 'Winner',
      home_team: '',
      away_team: '',
      event_label: '',
      sport_key: '',
      sport_label: '',
      commence_time: '',
      event_id: '',
    })
  }
  return zipBunchedAmericanOdds(pending, text, { skipTicketTotal: false }).filter((l) => l.odds)
}

/** Rampart-style half-point card: "87 EAGLES -0.5" (may be split across lines). */
function extractHalfPointCardLegs(text) {
  const raw = normalizeSlipOcrText(text)
  if (!/parlay\s*card|half\s*point\s*card/i.test(raw)) return []
  const legs = []
  const seen = new Set()

  const push = (team, lineNum) => {
    if (!team || !Number.isFinite(lineNum)) return
    const signed = lineNum > 0 ? `+${lineNum}` : String(lineNum)
    const selection_label = `${titleCaseWords(team)} ${signed}`
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) return
    seen.add(key)
    const sport = extractSport(team)
    legs.push({
      market: 'spread',
      side: '',
      line: String(lineNum),
      odds: '',
      selection_label,
      player_name: '',
      prop_stat: '',
      home_team: '',
      away_team: '',
      event_label: '',
      sport_key: sport.key || 'americanfootball_nfl',
      sport_label: sport.label || 'NFL',
      commence_time: '',
      event_id: '',
    })
  }

  // Flatten OCR into tokens then pair "NN TEAM" with following ±line
  const flat = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ')
  const re = /(\d{1,3})\s+([A-Z]{3,}[A-Z']*)\s+([+-]\d+(?:\.\d+)?)/g
  let m
  while ((m = re.exec(flat))) {
    push(m[2], Number(m[3]))
  }
  const flatCount = legs.length

  // Split / two-column OCR: "87 EAGLES" + "-0.5 91 PACKERS" — zip teams↔spreads
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const teams = []
  const spreads = []
  for (const line of lines) {
    const head = /^(\d{1,3})\s+([A-Za-z][A-Za-z.']+)\s*$/.exec(line)
    if (head) {
      teams.push(head[2])
      continue
    }
    const ju = /^([+-]\d+(?:\.\d+)?)\s*(?:(\d{1,3})\s+([A-Za-z][A-Za-z.']+))?$/.exec(line)
    if (ju) {
      spreads.push(Number(ju[1]))
      if (ju[2] && ju[3]) teams.push(ju[3])
    }
  }
  if (Math.min(teams.length, spreads.length) > flatCount) {
    legs.length = 0
    seen.clear()
    const n = Math.min(teams.length, spreads.length)
    for (let i = 0; i < n; i += 1) push(teams[i], spreads[i])
  }
  return legs
}

/** Extract ≥2 legs from a parlay slip. */
export function extractParlayLegs(text) {
  // Circa / the D / Wynn rotation legs first … naive "sel +odds" steals HORNETS/+348 as a 1-leg miss.
  const casino = extractCasinoBracketLegs(text)
  if (casino.length >= 2) return casino

  // DraftKings "Over 0.5 (Player)" / "100+ (Player)" props before disclaimer/+odds pairing invents junk legs.
  const appProps = extractAppPlayerPropLegs(text)
  if (appProps.length >= 2) return appProps

  const combo = extractDkMlTotalComboLegs(text)
  if (combo.length >= 2) return combo

  const fdMine = extractFanDuelMyBetsLegs(text)
  if (fdMine.length >= 2) return fdMine

  const ufc = extractUfcFighterParlayLegs(text)
  if (ufc.length >= 2) return ufc

  const decimalLegs = extractDecimalOddsParlayLegs(text)
  if (decimalLegs.length >= 2) return decimalLegs

  // Spreads/totals/ML open betslips before ML-only … mixed CBB slips must not stop at 3 moneylines
  const spreadTot = extractAppSpreadTotalLegs(text)
  if (spreadTot.length >= 2) return spreadTot

  const mlLegs = extractAppMoneylineBetslipLegs(text)
  if (mlLegs.length >= 2) return mlLegs

  const futures = extractFuturesWinnerLegs(text)
  if (futures.length >= 2) return futures

  const halfCard = extractHalfPointCardLegs(text)
  if (halfCard.length >= 2) return halfCard

  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const sport = extractSport(text)
  const legs = []
  const seen = new Set()

  const pushLeg = (sel, odds, opts) => {
    if (isParlayLegJunkLine(sel)) return
    const stub = legStubFromSelection(sel, odds, sport, opts)
    if (!stub) return
    const key = `${normalizeNameKey(stub.selection_label)}|${stub.odds || 'na'}`
    if (seen.has(key)) return
    seen.add(key)
    legs.push(stub)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (
      /total\s*odds|potential\s*payout|ticket\s*cost|to\s*win|to\s*collect|max\s*payout|total\s*wager|won\s+on|printed|transaction|betslip|terms and conditions/i.test(line)
    ) {
      continue
    }
    if (/^wager\b|^risk\b/i.test(line)) continue
    if (isParlayLegJunkLine(line)) continue
    if (looksLikeTicketIdOdds(line)) continue

    const withOdds = /^(.+?)\s+([+-]\d{3,5})\s*$/.exec(line)
    if (withOdds) {
      pushLeg(withOdds[1], withOdds[2])
      continue
    }

    if (/^[+-]\d{3,5}\s*$/.test(line)) {
      // Skip ticket-level parlay odds sitting under "3 Pick Parlay"
      const prev = lines[i - 1] || ''
      if (/pick\s+parlay|\bparlay\b/i.test(prev) && !/over|under|spread|money/i.test(prev)) continue
      if (prev && !/total\s*odds|parlay|wager|risk|payout|ticket|straight|single/i.test(prev)) {
        pushLeg(prev, line)
      }
    }
  }

  // Retail Parlay Card: "133 Michigan -1.5 Spread"
  if (legs.length < 2) {
    for (const stub of extractParlayCardLegs(text)) {
      const key = `${normalizeNameKey(stub.selection_label)}|${stub.odds || 'na'}`
      if (seen.has(key)) continue
      seen.add(key)
      legs.push(stub)
    }
  }

  // Settled FanDuel props: no per-leg odds … fill from Over/Under + ALT lines
  if (legs.length < 2) {
    for (const stub of extractPropLegsWithoutOdds(text, sport)) {
      const key = `${normalizeNameKey(stub.selection_label)}|${stub.odds || 'na'}`
      if (seen.has(key)) continue
      seen.add(key)
      legs.push(stub)
    }
  }

  return legs
}

export function parseParlaySlipText(text) {
  const raw = String(text || '').replace(/\r/g, '').trim()
  if (!raw || !looksLikeParlayText(raw)) return null

  const legs = extractParlayLegs(raw)
  if (legs.length < 2) return null

  const totalOdds = extractTotalParlayOdds(raw)
  const fromLegs = combinedOddsFromLegs(legs)
  const stakeDollars = extractStakeDollars(raw)
  const payoutDollars = extractPayoutDollars(raw)
  const fromPayout = americanFromStakeAndPayout(stakeDollars, payoutDollars)
  // Printed ticket price (Total Odds / TO COLLECT / Max Payout) beats recomputed leg juice.
  const odds = totalOdds ?? fromPayout ?? fromLegs
  if (odds == null) return null

  const book = extractBook(raw)
  const commence_time = extractCommenceTime(raw)
  const sport = extractSport(raw)
  const normalized = normalizeParlayLegs(legs)

  const draft = draftFromBits({
    selection: parlaySelectionLabel(normalized),
    odds,
    stakeDollars,
    book,
    event: '',
    source: 'slip',
    market: 'parlay',
    side: '',
    line: null,
    selection_label: parlaySelectionLabel(normalized),
    sport_key: sport.key || '',
    sport_label: sport.label || 'Parlay',
    home_team: '',
    away_team: '',
    commence_time,
  })
  if (!draft) return null
  draft.legs = normalized
  draft.market = 'parlay'
  draft.side = ''
  draft.home_team = ''
  draft.away_team = ''
  draft.event_label = ''
  draft.selection_label = buildBetSummaryLabel({
    ...draft,
    selection_label: parlaySelectionLabel(normalized),
    legs: normalized,
  })
  return draft
}

function looksLikeTerminalMatchup(away, home, eventLabel) {
  const event = String(eventLabel || '').trim()
  const a = String(away || '').trim()
  const h = String(home || '').trim()
  const matchup = event || [a, h].filter(Boolean).join(' @ ')
  if (/^[A-Z0-9]{2,6}\s*@\s*[A-Z0-9]{2,6}$/i.test(matchup)) return true
  if (a.length > 0 && a.length <= 3 && h.length > 0 && h.length <= 3) {
    if (!/[a-z]{4,}/i.test(`${a} ${h}`)) return true
  }
  return false
}

/**
 * True when a heuristic draft is junk / too thin to trust (e.g. terminal id as event).
 * Batch intake treats these as fails → LLM retry → Failed pill.
 */
export function isWeakSportsBetDraft(draft) {
  if (!draft || typeof draft !== 'object') return true
  const odds = String(draft.odds || '').trim()
  if (!odds || !/^[+-]?\d{2,5}$/.test(odds)) return true
  const event = String(draft.event_label || '').trim()
  const away = String(draft.away_team || '').trim()
  const home = String(draft.home_team || '').trim()
  const matchup = event || [away, home].filter(Boolean).join(' @ ')
  if (looksLikeTerminalMatchup(away, home, event)) return true
  const market = String(draft.market || '')
  const sel = String(draft.selection_label || '')
  const stake = String(draft.stake_dollars || '').trim()
  if (market === 'other' && !stake && !/distance|method|round|knock/i.test(sel)) {
    // other with only a junk event/odds and no real pick label
    if (!sel || sel === matchup || sel.startsWith(matchup)) return true
  }
  if ((market === 'spread' || market === 'h2h') && !away && !home && !sel) return true
  return false
}

/**
 * AI often dumps "Parlay legs: A over 0.5 HR (+360), B …" into notes with no legs[].
 * @returns {Array<object>}
 */
export function legsFromParlayNotes(notes) {
  const s = String(notes || '')
  const block = /parlay\s*legs?\s*:\s*([^\n]+)/i.exec(s)
  if (!block) return []
  let chunk = block[1].trim()
  const stop = chunk.search(/\.\s+(Receipt|Event|Ticket|Total|Individual)/i)
  if (stop > 0) chunk = chunk.slice(0, stop)
  chunk = chunk.replace(/\.\s*$/, '').trim()
  // Split on "), " between legs
  const parts = chunk
    .split(/\)\s*,\s*/)
    .map((p, i, arr) => (i < arr.length - 1 && !p.endsWith(')') ? `${p})` : p))
    .map((p) => p.trim())
    .filter(Boolean)

  const legs = []
  for (const part of parts) {
    const m = /^(.+?)\s+(over|under)\s+(\d+(?:\.\d+)?)\s*(.*?)\s*\(([+-]\d{3,5})\)\s*$/i.exec(part)
    if (!m) continue
    const player = titleCaseWords(m[1])
    const side = m[2].toLowerCase() === 'under' ? 'under' : 'over'
    const lineNum = Number(m[3])
    let statRaw = String(m[4] || '').trim()
    if (/^hr\.?$/i.test(statRaw)) statRaw = 'Home Runs'
    else if (statRaw) statRaw = titleCaseWords(statRaw)
    const odds = americanOddsInputString(m[5])
    const ou = side === 'under' ? 'Under' : 'Over'
    const selection_label = [player, ou, String(lineNum), statRaw].filter(Boolean).join(' ')
    legs.push({
      market: 'prop',
      side,
      line: String(lineNum),
      odds,
      selection_label,
      player_name: player,
      prop_stat: statRaw,
      home_team: '',
      away_team: '',
      event_label: '',
      sport_key: /home\s*runs?|^hr$/i.test(statRaw) ? 'baseball_mlb' : '',
      sport_label: /home\s*runs?|^hr$/i.test(statRaw) ? 'MLB' : '',
      commence_time: '',
      event_id: '',
    })
  }
  return legs
}

/** Count legs that look like real picks (not blank "Leg 1" placeholders). */
function countUsableParlayLegs(legs) {
  const list = Array.isArray(legs) ? legs : []
  return list.filter((leg) => {
    const sel = String(leg?.selection_label || '').trim()
    return sel && !/^leg\s*\d+$/i.test(sel)
  }).length
}

/** True when legs are missing or only blank "Leg 1" placeholders. */
function parlayLegsNeedHydrate(legs) {
  return countUsableParlayLegs(legs) < 2
}

/**
 * Fill parlay.legs from OCR text or AI notes when the structured array is empty/placeholder.
 * Prefer the richest source (notes often list all legs when OCR only got 2).
 */
export function hydrateParlayLegsForDraft(draft, ocrText = '') {
  if (!draft || typeof draft !== 'object') return draft
  if (String(draft.market || '') !== 'parlay') return draft

  const current = (Array.isArray(draft.legs) ? draft.legs : []).filter((leg) => {
    const sel = String(leg?.selection_label || '').trim()
    return sel && !/^leg\s*\d+$/i.test(sel)
  })
  const fromText = ocrText ? extractParlayLegs(ocrText) : []
  const fromNotes = legsFromParlayNotes(draft.notes)

  const candidates = [
    { legs: current, n: countUsableParlayLegs(current) },
    { legs: fromText, n: countUsableParlayLegs(fromText) },
    { legs: fromNotes, n: countUsableParlayLegs(fromNotes) },
  ]
  candidates.sort((a, b) => b.n - a.n)
  const best = candidates[0]
  if (best.n >= 2) return { ...draft, legs: best.legs }
  if (!parlayLegsNeedHydrate(draft.legs) && current.length) {
    return { ...draft, legs: current }
  }
  return draft
}

/**
 * Drop terminal-id "events" and other poison so a Failed Fill still gets usable fields.
 */
export function sanitizeSportsBetPartialDraft(draft) {
  if (!draft || typeof draft !== 'object') return null
  let next = { ...draft }
  if (looksLikeTerminalMatchup(next.away_team, next.home_team, next.event_label)) {
    next.away_team = ''
    next.home_team = ''
    next.event_label = ''
    const sel = String(next.selection_label || '')
    if (/^[A-Z0-9]{2,6}\s*@\s*[A-Z0-9]{2,6}/i.test(sel) || /^cgt\b/i.test(sel)) {
      next.selection_label = ''
    }
  }
  next = hydrateParlayLegsForDraft(next)
  return next
}

/** Merge partials left→right; later non-empty strings win. Legs: prefer more usable picks. */
export function mergeSportsBetPartialDrafts(...parts) {
  const out = {}
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    for (const [key, value] of Object.entries(part)) {
      if (key === 'legs') {
        if (!Array.isArray(value) || !value.length) continue
        const nextN = countUsableParlayLegs(value)
        const prevN = countUsableParlayLegs(out.legs)
        if (nextN > prevN || (nextN === prevN && value.length >= (out.legs?.length || 0))) {
          out.legs = value
        }
        continue
      }
      if (value == null) continue
      const s = typeof value === 'string' ? value.trim() : value
      if (s === '' || s === false) continue
      out[key] = typeof value === 'string' ? value.trim() : value
    }
  }
  return out
}

/**
 * Best-effort fields even when odds/market parse fails (Failed Fill prefill).
 */
export function extractSportsBetPartialFields(text) {
  const raw = String(text || '').replace(/\r/g, '').trim()
  if (!raw) return null
  const primary = findPrimaryOdds(raw)
  const marketBits = primary
    ? extractMarketDetails(raw, primary.line)
    : {
      market: '',
      side: '',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: '',
    }
  const eventBits = extractEvent(raw)
  const sport = extractSport(raw, { casinoMlbIsMoneyline: Boolean(marketBits.casinoMlbIsMoneyline) })
  const book = extractBook(raw)
  const stakeDollars = extractStakeDollars(raw)
  const commence_time = extractCommenceTime(raw)
  let away = eventBits.away_team || ''
  let home = eventBits.home_team || ''
  let event_label = eventBits.event || ''
  if (looksLikeTerminalMatchup(away, home, event_label)) {
    away = ''
    home = ''
    event_label = ''
  }
  return sanitizeSportsBetPartialDraft({
    book,
    market: marketBits.market || '',
    side: marketBits.side || '',
    line: marketBits.line != null && marketBits.line !== '' ? String(marketBits.line) : '',
    odds: primary ? americanOddsInputString(primary.odds) : '',
    stake_dollars: stakeDollars != null ? String(stakeDollars) : '',
    selection_label: marketBits.selection_label || '',
    home_team: home,
    away_team: away,
    event_label,
    sport_key: sport.key || '',
    sport_label: sport.label || '',
    commence_time: commence_time || '',
    player_name: marketBits.player_name || '',
    prop_stat: marketBits.prop_stat || '',
    source: 'slip',
    legs: [],
  })
}

/** Free-text bet slip / share-sheet paste / OCR. */
export function parseSportsBetSlipText(text) {
  const raw = String(text || '').replace(/\r/g, '').trim()
  if (!raw) return []

  const parlay = parseParlaySlipText(raw)
  if (parlay) return [parlay]

  const primary = findPrimaryOdds(raw)
  if (!primary) return []

  const marketBits = extractMarketDetails(raw, primary.line)
  const eventBits = extractEvent(raw)
  const sport = extractSport(raw, { casinoMlbIsMoneyline: Boolean(marketBits.casinoMlbIsMoneyline) })
  const book = extractBook(raw)
  const stakeDollars = extractStakeDollars(raw)
  const commence_time = extractCommenceTime(raw)

  // If h2h without label, use event away/home pick from odds line team
  let selection_label = marketBits.selection_label
  if (!selection_label && marketBits.market === 'h2h') {
    selection_label = eventBits.away_team || eventBits.event || ''
  }

  const draft = draftFromBits({
    selection: selection_label || raw.slice(0, 200),
    odds: primary.odds,
    stakeDollars,
    book,
    event: eventBits.event,
    source: 'slip',
    market: marketBits.market,
    side: marketBits.side,
    line: marketBits.line,
    player_name: marketBits.player_name,
    prop_stat: marketBits.prop_stat,
    selection_label,
    sport_key: sport.key,
    sport_label: sport.label,
    home_team: eventBits.home_team,
    away_team: eventBits.away_team,
    commence_time,
  })

  if (!draft) return []

  const pickSeed = pickSeedFromLabel(draft.selection_label)
  const sideLessTicket = looksLikeSideLessBet(raw) || looksLikeSideLessBet(pickSeed)
  const fighterMethod = fighterByMethodMatch(raw) || fighterByMethodMatch(pickSeed)

  // Safety net: side-less fight props must not keep a fighter/home Side
  if (sideLessTicket && !fighterMethod) {
    if (draft.side === 'over' || draft.side === 'under') {
      // rounds / knockdowns O/U … keep Over/Under
      if (draft.market === 'h2h' || draft.market === 'spread') draft.market = 'total'
    } else {
      draft.side = ''
      if (draft.market === 'h2h' || draft.market === 'spread') draft.market = 'other'
    }
  }

  // Map pick onto home/away for Side (fighters or team ML).
  // Skip side-less markets … UI shows N/A (or Over/Under for totals).
  if (
    !sideLessTicket
    && draft.market !== 'prop'
    && draft.market !== 'total'
    && draft.market !== 'other'
    && draft.market !== 'parlay'
    && pickSeed
  ) {
    const mapped = sideForParticipantSelection(
      pickSeed,
      draft.away_team,
      draft.home_team,
    )
    if (mapped) draft.side = mapped
  } else if (
    !sideLessTicket
    && isParticipantSport(draft.sport_key, draft.sport_label)
    && draft.market !== 'prop'
    && draft.market !== 'total'
    && draft.market !== 'other'
    && draft.market !== 'parlay'
  ) {
    const mapped = sideForParticipantSelection(
      draft.selection_label,
      draft.away_team,
      draft.home_team,
    )
    if (mapped) draft.side = mapped
  } else if (fighterMethod) {
    const mapped = sideForParticipantSelection(
      fighterMethod.name,
      draft.away_team,
      draft.home_team,
    )
    if (mapped) draft.side = mapped
  }

  // Keep a short seed on the draft for summary, then replace with the rich Label.
  draft.selection_label = buildBetSummaryLabel({
    ...draft,
    selection_label: pickSeed || draft.selection_label,
  })

  return [draft]
}

function parseDelimited(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const delim = (lines[0].match(/,/g) || []).length >= (lines[0].match(/\t/g) || []).length ? ',' : '\t'

  const split = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        q = !q
        continue
      }
      if (!q && ch === delim) {
        out.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const headers = split(lines[0]).map(cleanHeader)
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = split(line)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cells[i] || ''
    })
    rows.push(row)
  }
  return rows
}

const ODDS_HEADERS = ['odds', 'price', 'american', 'american odds', 'odds american']
const STAKE_HEADERS = ['stake', 'wager', 'risk', 'amount', 'units', 'stake units']
const SEL_HEADERS = ['selection', 'pick', 'bet', 'outcome', 'team', 'wager selection']
const EVENT_HEADERS = ['event', 'game', 'match', 'fixture', 'description']
const BOOK_HEADERS = ['book', 'sportsbook', 'bookmaker']
const MARKET_HEADERS = ['market', 'bet type', 'type']

function marketFromCsv(raw) {
  const s = String(raw || '').toLowerCase()
  if (s.includes('prop') || s.includes('player')) return 'prop'
  if (s.includes('spread') || s.includes('puck') || s.includes('run line')) return 'spread'
  if (s.includes('money') || s === 'ml' || s.includes('h2h')) return 'h2h'
  if (s.includes('total') || s.includes('over') || s.includes('under')) return 'total'
  return ''
}

/** DK / FD-ish bet history CSV. Odds column required. */
export function parseSportsBetCsv(text) {
  const rows = parseDelimited(text)
  const drafts = []
  for (const row of rows) {
    const odds = pickCol(row, ODDS_HEADERS)
    const selection = pickCol(row, SEL_HEADERS)
    const event = pickCol(row, EVENT_HEADERS)
    const stakeRaw = pickCol(row, STAKE_HEADERS)
    const stakeNum = numOrNull(stakeRaw)
    const looksUnits = /\bu(?:nits?)?\b/i.test(stakeRaw) || (STAKE_HEADERS.includes('units') && /units/i.test(
      Object.keys(row).find((k) => row[k] === stakeRaw) || '',
    ))
    const draft = draftFromBits({
      selection: selection || event,
      odds,
      stakeDollars: looksUnits ? null : stakeNum,
      stakeUnits: looksUnits ? stakeNum : null,
      book: pickCol(row, BOOK_HEADERS),
      event,
      source: 'csv',
    })
    if (!draft) continue
    const m = marketFromCsv(pickCol(row, MARKET_HEADERS))
    if (m) draft.market = m
    if (draft.market === 'total' && /under/i.test(selection)) draft.side = 'under'
    drafts.push(draft)
  }
  return drafts
}

export function parseSportsBetIntake(text) {
  const raw = String(text || '')
  const first = raw.split('\n').find((l) => l.trim()) || ''
  const looksCsv = /odds|price|american|stake|selection/i.test(first) && /[,|\t]/.test(first)
  return looksCsv ? parseSportsBetCsv(raw) : parseSportsBetSlipText(raw)
}
