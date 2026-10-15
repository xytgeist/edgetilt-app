/**
 * Slip / CSV bones. Heuristic only … user confirms in the composer before save.
 */

import {
  isParticipantSport,
  resolveSportsBetSport,
  SPORTS_BET_SPORT_BOXING,
  SPORTS_BET_SPORT_TABLE_TENNIS,
  SPORTS_BET_SPORT_TENNIS,
  SPORTS_BET_SPORT_UFC,
  sportByKey,
} from './sportsBetSports.js'
import {
  americanOddsInputString,
  buildBetSummaryLabel,
  pickSeedFromLabel,
} from './sportsBetMath.js'
import { decimalToAmerican } from './sportsBetCalcMath.js'
import {
  combinedOddsFromLegs,
  isParlayTicketChromeSelection,
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
  { re: /\bgolden\s*nugget\b/i, name: 'Golden Nugget' },
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
  let s = String(raw).replace(/[$\s]/g, '').trim()
  if (!s) return null
  // European thousands: "1.200.00" / "3.600,00" → 1200 / 3600
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+\.\d{2}$/.test(s)) {
    const parts = s.split('.')
    s = `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function americanOrNull(v) {
  const s = String(v || '').trim()
  // Up to 6 digits … fat casino parlays (+52285) and boost tickets
  const m = /^([+-]?\d{2,6})$/.exec(s)
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
  // FanDuel My Bets chrome when logo OCR is missing
  if (/\breuse\s*selections\b/i.test(s) || /\bwon\s+on\s+fanduel\b/i.test(s)) return 'FanDuel'
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
    /ticket\s*cost\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\brisk\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\btotal\s*wager\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\bwager\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\bstake\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\btake\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
    /\d+\s*bet\(s\)\s*@\s*\$?\s*([0-9.,]+)/i,
    /\d+\s*bets?\s*@\s*\$?\s*([0-9.,]+)/i,
    /\bplace\s*bet\s*\$?\s*([0-9.,]+)/i,
    /\bbet\s*amount\s*[:=]?\s*\$?\s*([0-9.,]+)/i,
  ]

  for (const line of lines) {
    if (PAYOUT_LINE_RE.test(line) && !/ticket\s*cost/i.test(line) && !/\brisk\b/i.test(line) && !/\bwager\b/i.test(line)) {
      continue
    }
    for (const re of labeled) {
      const n = tryLine(line, re)
      if (n != null && n > 0) return n
    }
    // Vision often glues "$70.00 TOTAL WAGER" (amount before label)
    const glued = /^\$?\s*([0-9,]+\.?\d*)\s+(?:total\s*wager|wager(?:\s*amount)?|ticket\s*cost|risk)\b/i.exec(line)
    if (glued) {
      const n = parseMoneyAmount(glued[1])
      if (n != null && n > 0) return n
    }
  }

  // FanDuel settled: "$5.00" on the line above OR below "TOTAL WAGER"
  // Open My Bets footer: "$10.00 $2,129.55" then "TOTAL WAGER TOTAL PAYOUT" (stake is left $)
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\btotal\s*wager\b/i.test(lines[i])) continue
    for (const candidate of [lines[i - 1] || '', lines[i + 1] || '']) {
      const dual = /^\$?\s*([0-9,]+\.?\d*)\s+\$?\s*([0-9,]+\.?\d*)\s*$/.exec(candidate)
      if (dual) {
        const a = parseMoneyAmount(dual[1])
        const b = parseMoneyAmount(dual[2])
        if (a != null && a > 0 && b != null && b > 0) return Math.min(a, b)
      }
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(candidate)
      if (!m) continue
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

  // "Wager" / "Risk" / "Ticket Cost:" then amount on a later bare $ line
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:wager(?:\s*amount)?|risk|ticket\s*cost)\s*:?\s*$/i.test(lines[i])) continue
    for (let j = i + 1; j < Math.min(i + 14, lines.length); j += 1) {
      if (PAYOUT_LINE_RE.test(lines[j]) && !/ticket\s*cost/i.test(lines[j])) continue
      const m = /^\$?\s*([0-9.,]+)\s*$/.exec(lines[j])
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

/**
 * Caesars / casino slips print TICKET COST / TO WIN / TO COLLECT labels, then
 * dates / juices / ids, then bunched `$25` / `$13,071` / `$13,096`. Also YOU WON.
 * Returns { stake, toWin, collect } when enough money is found.
 */
function extractCasinoFooterMoney(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  let footerStart = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^(?:ticket\s*cost|to\s*win|to\s*collect|you\s*won)\b/i.test(lines[i])) {
      footerStart = i
      break
    }
  }

  const amounts = []
  const pushAmt = (raw) => {
    const n = parseMoneyAmount(raw)
    if (n != null && n > 0) amounts.push(n)
  }

  const scanFrom = footerStart >= 0 ? footerStart : 0
  const scanTo = footerStart >= 0 ? Math.min(footerStart + 28, lines.length) : lines.length
  for (let j = scanFrom; j < scanTo; j += 1) {
    const line = lines[j]
    // Skip American juices so look-ahead does not treat them as money
    if (/^[+-]\d{3,6}$/.test(line)) continue
    const inline = (
      /(?:you\s*won|to\s*collect|to\s*win|ticket\s*cost|max\s*payout)\s*:?\s*\$?\s*([0-9,]+\.?\d*)/i.exec(line)
      || /^(?:won)\s*:?\s*\$?\s*([0-9,]+\.?\d*)/i.exec(line)
    )
    if (inline) {
      pushAmt(inline[1])
      continue
    }
    if (footerStart < 0) continue
    const bare = /^\$?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{1,2})?|[0-9]+\.\d{1,2}|[0-9]{2,})\s*$/.exec(line)
    if (bare) pushAmt(bare[1])
  }

  // Whole-text YOU WON / TO COLLECT when footer block missed
  if (!amounts.length) {
    const blob = String(text || '')
    for (const re of [
      /you\s*won\s*:?\s*\$?\s*([0-9,]+\.?\d*)/ig,
      /to\s*collect\s*:?\s*\$?\s*([0-9,]+\.?\d*)/ig,
    ]) {
      let m
      while ((m = re.exec(blob))) pushAmt(m[1])
    }
  }

  if (!amounts.length) return null
  const collect = Math.max(...amounts)
  const stake = amounts.length >= 2 ? Math.min(...amounts) : null
  if (stake != null && collect > stake * 1.05) {
    return { stake, toWin: collect - stake, collect }
  }
  if (collect > 0) return { stake: null, toWin: null, collect }
  return null
}

/** TO WIN / profit only (excludes stake). Does not treat YOU WON / TO COLLECT as win. */
function extractToWinDollars(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = /\bto\s*win\b\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i.exec(line)
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n != null && n > 0) return n
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^to\s*win\s*:?\s*$/i.test(lines[i])) continue
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j += 1) {
      if (/^[+-]\d{3,6}$/.test(lines[j])) continue
      if (/^(?:ticket\s*cost|to\s*collect|you\s*won)\b/i.test(lines[j])) continue
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(lines[j])
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      // Skip stake-sized first hit when a larger amount follows in the footer bunch
      if (n == null || n <= 0) continue
      const footer = extractCasinoFooterMoney(text)
      if (footer?.toWin != null) return footer.toWin
      return n
    }
  }
  const footer = extractCasinoFooterMoney(text)
  return footer?.toWin ?? null
}

/** Stake + TO WIN / TO COLLECT from OCR (and optional draft hints). */
export function ticketMoneyFromText(text, draft = null) {
  const raw = String(text || '')
  const footer = raw ? extractCasinoFooterMoney(raw) : null
  let stake = (raw ? extractStakeDollars(raw) : null)
    ?? footer?.stake
    ?? parseMoneyAmount(draft?.stake_dollars)
  let toCollect = parseMoneyAmount(draft?.to_collect_dollars ?? draft?.to_collect)
    ?? (raw ? extractPayoutDollars(raw) : null)
    ?? footer?.collect
    ?? null
  let toWin = parseMoneyAmount(draft?.to_win_dollars ?? draft?.to_win)
    ?? (raw ? extractToWinDollars(raw) : null)
    ?? footer?.toWin
    ?? null
  if (toWin == null && toCollect != null && stake != null && toCollect > stake) {
    toWin = Math.round((toCollect - stake) * 100) / 100
  }
  if (toCollect == null && toWin != null && stake != null) {
    toCollect = Math.round((toWin + stake) * 100) / 100
  }
  // If WON ON sat under TOTAL WAGER $, collect may equal stake … prefer a larger bare $
  if (
    stake != null
    && toCollect != null
    && Math.abs(toCollect - stake) < 0.009
    && raw
  ) {
    const bare = []
    for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(line)
        || /^\$?\s*([0-9,]+\.?\d*)\s+(?:won\s+on|you\s*won|to\s*collect|payout)\b/i.exec(line)
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      if (n != null && n > stake * 1.05) bare.push(n)
    }
    if (bare.length) {
      toCollect = Math.max(...bare)
      toWin = Math.round((toCollect - stake) * 100) / 100
    }
  }
  // BetRivers: "Win" / "+2620" then bare "2620.25" profit (no $)
  if (toWin == null && raw) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    let afterWin = false
    for (const line of lines) {
      if (/^to\s*win\b/i.test(line)) continue
      if (/^win\b/i.test(line) || /^[+-]\d{2,6}$/.test(line)) {
        afterWin = true
        continue
      }
      if (!afterWin) continue
      const m = /^([0-9]+(?:\.\d{2})?)$/.exec(line)
      if (!m) continue
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0 && (stake == null || n !== stake)) {
        toWin = n
        break
      }
    }
    if (toCollect == null && toWin != null && stake != null) {
      toCollect = Math.round((toWin + stake) * 100) / 100
    }
  }
  return {
    stake_dollars: stake,
    to_win_dollars: toWin,
    to_collect_dollars: toCollect,
  }
}

/**
 * Settled receipt vs open betslip.
 * won: WON ON / YOU WON / Total Won
 * lost: LOST badge / LOST ON / did not win / $0 return on a settled receipt
 * Never treat an open PLACE BET slip as lost (nav "Settled" tab alone is not enough).
 */
export function detectSlipResult(text) {
  const raw = String(text || '')
  if (!raw.trim()) return 'open'

  // Cashed tickets first … never reclassify as lost
  if (/\b(?:won\s+on\b|you\s*won\b|total\s*won\b)/i.test(raw)) return 'won'

  // Explicit loss copy (FanDuel / DK / Caesars / etc.)
  if (/\b(?:lost\s+on\b|you\s*lost\b|total\s*lost\b)/i.test(raw)) return 'lost'
  if (/\b(?:did\s*not\s*win|didn'?t\s*win|not\s*a\s*winner)\b/i.test(raw)) return 'lost'
  if (/\b(?:bet\s*lost|ticket\s*lost|wager\s*lost)\b/i.test(raw)) return 'lost'
  // Standalone LOST / Loss badge on its own line (My Bets settled)
  if (/(?:^|\n)\s*(?:lost|loss)\s*(?:\n|$)/i.test(raw)) return 'lost'
  // Standalone WON badge (DK My Bets … "WON ON" already handled above)
  if (/(?:^|\n)\s*won\s*(?:\n|$)/i.test(raw)) return 'won'

  // Open betslip chrome … do not infer loss from nav "Settled" alone
  if (/\b(?:place\s*bet|review\s*line\s*changes|keep\s*picks|add\s*(?:to\s*)?(?:bet)?slip|clear\s*betslip)\b/i.test(raw)) {
    return 'open'
  }

  // $0.00 return / payout / to collect / won on a settled receipt (no WON ON above)
  const zeroReturn = (
    /\$\s*0(?:\.00)?\s*(?:payout|return|to\s*collect|won|winnings)?\b/i.test(raw)
    || /(?:payout|return|to\s*collect|max\s*payout|won)\s*[:=]?\s*\$?\s*0(?:\.00)?\b/i.test(raw)
    || /(?:^|\n)\s*\$\s*0(?:\.00)?\s*(?:\n|$)/i.test(raw)
  )
  const settledReceipt = (
    /\btotal\s*wager\b/i.test(raw)
    && (/\bfinished\b/i.test(raw) || /\bmy\s*bets\b/i.test(raw))
    && !/\b(?:to\s*win|potential\s*payout)\s*[:=]?\s*\$?\s*[1-9]/i.test(raw)
  )
  if (zeroReturn && settledReceipt) return 'lost'

  // Settled My Bets: Finished legs + TOTAL WAGER + no win payout and no positive TO WIN
  // (FanDuel losses often omit LOST copy but never show WON ON FANDUEL)
  const finishedN = (raw.match(/\bfinished\b/gi) || []).length
  const hasWager = /\btotal\s*wager\b/i.test(raw)
  const hasWinPayout = /\b(?:won\s+on\b|you\s*won\b|total\s*won\b)/i.test(raw)
  const hasOpenToWin = /\b(?:to\s*win|potential\s*payout)\s*[:=]?\s*\$?\s*[1-9]/i.test(raw)
  if (
    finishedN >= 2
    && hasWager
    && !hasWinPayout
    && !hasOpenToWin
    && /\b(?:settled|my\s*bets)\b/i.test(raw)
  ) {
    // Require a $0 line or a clear Lost-ish zero collect nearby to avoid open history slips
    if (zeroReturn || /\$\s*0(?:\.00)?\b/.test(raw)) return 'lost'
  }

  return 'open'
}

/** Apply OCR ticket stake / to-win / to-collect. Prefer OCR over unit-size defaults. */
export function applyTicketMoneyFromOcr(draft, text = '', { overwriteStake = true } = {}) {
  if (!draft || typeof draft !== 'object') return draft
  const money = ticketMoneyFromText(text, draft)
  const next = { ...draft }
  if (money.stake_dollars != null) {
    const prev = String(next.stake_dollars || '').trim()
    if (overwriteStake || !prev) {
      next.stake_dollars = String(money.stake_dollars)
    }
  }
  if (money.to_win_dollars != null) {
    next.to_win_dollars = String(money.to_win_dollars)
  }
  if (money.to_collect_dollars != null) {
    next.to_collect_dollars = String(money.to_collect_dollars)
  }
  const result = detectSlipResult(text)
  if (result === 'won' || result === 'lost') {
    next.status = result
  } else if (!next.status) {
    next.status = 'open'
  }
  // Lost tickets … no collect / to-win; UI shows Lost ($) = stake
  if (result === 'lost') {
    next.to_win_dollars = '0'
    next.to_collect_dollars = '0'
  }
  return next
}

function attachTicketMoney(draft, text = '') {
  return applyTicketMoneyFromOcr(draft, text, { overwriteStake: true })
}

/** Payout that includes stake (for americanFromStakeAndPayout). Prefer collect/max over to-win. */
function extractPayoutDollars(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const stakeHint = extractStakeDollars(text)

  const tryRes = [
    // "WON ON FANDUEL $207.85" … book name may sit between label and $
    /\bwon\s+on\b(?:\s+[A-Za-z.]+)*\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\b(?:you\s*won|total\s*won)\b(?:\s+[A-Za-z.]+)*\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    // DK My Bets: "Wager: $2.94 Paid: $3.45"
    /\bpaid\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
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

  // Vision glue: "$207.85 WON ON FANDUEL" / "$832.44 You Won"
  for (const line of lines) {
    const glued = (
      /^\$?\s*([0-9,]+\.?\d*)\s+(?:won\s+on|you\s*won|total\s*won)\b/i.exec(line)
      || /^\$?\s*([0-9,]+\.?\d*)\s+(?:to\s*collect|max\s*payout|potential\s*payout|total\s*payout)\b/i.exec(line)
    )
    if (!glued) continue
    const n = parseMoneyAmount(glued[1])
    if (n != null && n > 0) return n
  }

  // Casino OCR: "TO COLLECT:" then "$9,735.00" on the next line
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:to\s*collect|max\s*payout|potential\s*payout|to\s*win|you\s*won|win|total\s*payout|won\s+on|total\s*won)\s*:?\s*$/i.test(lines[i])) continue
    const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(lines[i + 1] || '')
    if (!m) continue
    const n = parseMoneyAmount(m[1])
    if (n == null || n <= 0) continue
    if (/^(?:to\s*win|win)\b/i.test(lines[i])) {
      if (stakeHint != null && stakeHint > 0) return n + stakeHint
    }
    return n
  }

  // Caesars: labels then dates/juices then bunched $ amounts … take max as collect
  const footer = extractCasinoFooterMoney(text)
  if (footer?.collect != null && footer.collect > 0) return footer.collect

  // FanDuel open My Bets: "$10.00 $2,129.55" / "TOTAL WAGER TOTAL PAYOUT" (payout is right $)
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\btotal\s*payout\b/i.test(lines[i])) continue
    for (const candidate of [lines[i - 1] || '', lines[i + 1] || '']) {
      const dual = /^\$?\s*([0-9,]+\.?\d*)\s+\$?\s*([0-9,]+\.?\d*)\s*$/.exec(candidate)
      if (dual) {
        const a = parseMoneyAmount(dual[1])
        const b = parseMoneyAmount(dual[2])
        if (a != null && a > 0 && b != null && b > 0) return Math.max(a, b)
      }
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(candidate)
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) return n
    }
  }

  // "$611.82" above OR below "WON ON FANDUEL" … never steal TOTAL WAGER $ as the win
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:won\s+on|you\s*won|total\s*won)\b/i.test(lines[i])) continue
    const neighbors = []
    for (const candidate of [lines[i - 1] || '', lines[i + 1] || '']) {
      const m = /^\$?\s*([0-9,]+\.?\d*)\s*$/.exec(candidate)
      if (!m) continue
      const n = parseMoneyAmount(m[1])
      if (n != null && n > 0) neighbors.push(n)
    }
    const notStake = neighbors.filter((n) => (
      stakeHint == null || Math.abs(n - stakeHint) > 0.009
    ))
    if (notStake.length) return Math.max(...notStake)
    // Prefer next-line when both equal stake (rare) or only stake-sized neighbor
    if (neighbors.length >= 2) return Math.max(...neighbors)
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
  const s = String(line || '')
  if (isParlayTicketChromeSelection(s)) return true
  return /must\s*start|plate\s*appearance|bet\s*with\s*friends|keep\s*picks|terms\s+and|download\s+the|sign\s*up|mobile\s*wagering|clear\s*betslip|help\s*center|place\s*bet|round\s*robin|stake\s*all|quick\s*sgp|log\s*in|bet\s*id\b|hide\s*legs|show\s*legs|^placed\s*:/i.test(
    s,
  )
}

/** Casino OCR often prints ½ instead of .5 */
function normalizeSlipOcrText(text) {
  return String(text || '')
    .replace(/\u00bd/g, '.5')
    .replace(/(\d)\s*1\/2\b/g, '$1.5')
    // Caesars OCR: "- 1700" (do not eat the next line's team name)
    .replace(/([+-])\s+(\d{3,6})\b/g, '$1$2')
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
    // 100+ (Player) … or DK "× 40+" then "Cade Cunningham Points + Rebounds"
    const plusParen = /^[×xX]?\s*(\d+(?:\.\d+)?)\+\s*\(([^)]+)\)\s*$/i.exec(line)
    const plusBare = /^[×xX]?\s*(\d+(?:\.\d+)?)\+\s*$/i.exec(line)
    const m = plusParen || plusBare
      ? null
      : (
        /^(over|under)\s+(\d+(?:\.\d+)?)\s*\(([^)]+)\)\s*$/i.exec(line)
        || /^(over|under)\s+(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s*$/i.exec(line)
      )
    let side = 'over'
    let lineNum = NaN
    let player = ''
    let stat = ''
    if (plusParen) {
      lineNum = Number(plusParen[1])
      player = titleCaseWords(plusParen[2].trim())
    } else if (plusBare) {
      lineNum = Number(plusBare[1])
      // Next line(s): "Cade Cunningham Points + Rebounds" / "+ Assists"
      const detail = []
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
        const next = lines[j]
        if (/^[×xX]?\s*\d+\+/.test(next) || /^(over|under)\s+\d/i.test(next)) break
        if (isParlayLegJunkLine(next)) break
        if (/(?:@|\bat\b)/i.test(next) || bareAmericanOddsLine(next) || /^\$|stake|parlay|0\.00|wager\s*:|paid\s*:/i.test(next)) break
        detail.push(next.replace(/^\+\s*/, ''))
      }
      const blob = detail.join(' ').replace(/\s+/g, ' ').trim()
      // First Last (+ optional Jr/III) then stat … do not swallow "Touchdowns Scored" into the name
      const pm = /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,1}(?:\s+(?:jr|sr|ii|iii|iv)\.?)?)\s+(.+)$/i.exec(blob)
      if (pm) {
        player = titleCaseWords(pm[1])
        stat = titleCaseWords(pm[2])
      }
    } else if (m) {
      side = m[1].toLowerCase() === 'under' ? 'under' : 'over'
      lineNum = Number(m[2])
      player = titleCaseWords(m[3].trim())
    } else {
      continue
    }
    if (!player || !Number.isFinite(lineNum)) continue
    if (/^(point|total|team|game|the)$/i.test(player)) continue

    let event_label = ''
    let away_team = ''
    let home_team = ''
    let odds = ''
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j += 1) {
      const next = lines[j]
      if (/^(over|under)\s+\d/i.test(next) || /^[×xX]?\s*\d+\+\s*(\(|$)/i.test(next)) break
      if (isParlayLegJunkLine(next)) continue
      const oddsTok = bareAmericanOddsLine(next)
      if (oddsTok) {
        const after = lines.slice(j + 1).find((l) => l && !isParlayLegJunkLine(l) && l !== '0.00')
        if (after && bareAmericanOddsLine(after)) break
        odds = oddsTok
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
    const selection_label = [player, `${lineNum}+`, stat || ou].filter(Boolean).join(' ')
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
  // Keep all legs when ticket combined odds exist (partial zip OK … DK bunched odds miss some)
  if (pending.length >= 2 && extractTotalParlayOdds(text) != null) {
    return zipped.length >= 2 ? zipped : pending
  }
  return zipped.filter((l) => l.odds)
}

/**
 * FanDuel open Same Game Parlay betslip:
 * - "PARLAY SELECTIONS" / Team MONEYLINE / Player ANY TIME TD / "Over +41.5" + RECEIVING
 * - Or mixed "X GB Packers" Moneyline + "× 1+" / "Jalen Hurts Touchdowns Scored"
 */
function extractFanDuelSgpLegs(text) {
  const raw = normalizeSlipOcrText(text)
  if (!/\bsgp\b|same\s*game\s*parlay/i.test(raw)) return []
  // Settled dual-SGP / My Bets use extractFanDuelMyBetsLegs
  if (/(?:my\s*bets|won\s+on\s+fanduel|total\s*wager)/i.test(raw) && !/parlay\s*selections/i.test(raw)) {
    return []
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  const push = (stub) => {
    if (!stub?.selection_label) return
    const key = normalizeNameKey(stub.selection_label)
    if (seen.has(key)) return
    seen.add(key)
    pending.push(stub)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const next = lines[i + 1] || ''

    // Team + MONEYLINE / SPREAD
    if (/^(?:moneyline|money\s*line|spread)$/i.test(next)) {
      const team = line.replace(/^[×xX]\s*/, '').trim()
      if (team && team.length < 48 && !/parlay|straight|selection|wager|sgp|same\s*game|betslip/i.test(team)) {
        const isMl = /money/i.test(next)
        push(emptyLegStub({
          market: isMl ? 'h2h' : 'spread',
          selection_label: isMl ? `${titleCaseWords(team)} ML` : titleCaseWords(team),
        }))
        continue
      }
    }

    // Player + ANY TIME TOUCHDOWN…
    if (/any\s*time\s*touchdown/i.test(next)) {
      const player = line.replace(/^[×xX]\s*/, '').trim()
      if (player && /^[A-Za-z]/.test(player) && player.length < 40) {
        push(emptyLegStub({
          market: 'prop',
          selection_label: `${titleCaseWords(player)} ATD`,
          player_name: titleCaseWords(player),
          prop_stat: 'Anytime Touchdown',
        }))
        continue
      }
    }

    // "Chase Claypool Over +41.5" + "CHASE CLAYPOOL - RECEIVING YDS"
    const ouPlayer = /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,3})\s+(over|under)\s+\+?(\d+(?:\.\d+)?)\s*$/i.exec(line)
    if (ouPlayer) {
      const player = titleCaseWords(ouPlayer[1])
      const side = ouPlayer[2].toLowerCase() === 'under' ? 'under' : 'over'
      const lineNum = Number(ouPlayer[3])
      let stat = ''
      if (/receiving|rushing|passing|yards|points|rebounds|assists|touchdown/i.test(next)) {
        stat = titleCaseWords(next.replace(new RegExp(player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/^[\s\-–]+/, ''))
      }
      push(emptyLegStub({
        market: 'prop',
        side,
        line: String(lineNum),
        selection_label: [player, side === 'under' ? 'Under' : 'Over', String(lineNum), stat].filter(Boolean).join(' '),
        player_name: player,
        prop_stat: stat,
      }))
      continue
    }

    // "× 1+" / "Jalen Hurts Touchdowns Scored"
    const plusBare = /^[×xX]?\s*(\d+(?:\.\d+)?)\+\s*$/i.exec(line)
    if (plusBare && /^[A-Za-z]/.test(next) && !/(?:@|\bat\b)/i.test(next)) {
      const lineNum = Number(plusBare[1])
      const pm = /^([A-Za-z][A-Za-z.'\-]+(?:\s+[A-Za-z][A-Za-z.'\-]+){0,1}(?:\s+(?:jr|sr|ii|iii|iv)\.?)?)\s+(.+)$/i.exec(next)
      if (pm) {
        const player = titleCaseWords(pm[1])
        const stat = titleCaseWords(pm[2])
        push(emptyLegStub({
          market: 'prop',
          side: 'over',
          line: String(lineNum),
          selection_label: `${player} ${lineNum}+ ${stat}`,
          player_name: player,
          prop_stat: stat,
        }))
        continue
      }
    }

  }

  if (pending.length < 2) return []
  // Open SGP: per-leg juices usually absent; do not zip stray straights ML (+112) onto leg 1
  if (extractTotalParlayOdds(text) != null) return pending
  return zipBunchedAmericanOdds(pending, text).filter((l) => l.odds)
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

/** True when a leg selection is OCR/AI junk (dates, ticket footer, glued rotation). */
export function legSelectionLooksJunk(sel) {
  const s = String(sel || '').trim()
  if (!s) return true
  if (/ticket\s*cost|to\s*win|to\s*collect|you\s*won|max\s*payout|max\s*win/i.test(s)) return true
  // Open betslip footer chrome mistaken for a pick: "3 Leg Parlay" / "3 Leg Parlay +584"
  if (isParlayTicketChromeSelection(s)) return true
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s) && /\d{4}/.test(s)) return true
  // "[109] BILLS Jan 11 2026 - NFL PLAYOFF" / ">25] LAKERS an 12 2026 - NBA"
  if (/[\[\]>]\s*\d*\]/.test(s) && /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\bnba\b|\bnfl\b|playoff)/i.test(s)) {
    return true
  }
  if (/\d{4}\s*[-–•]\s*(?:nba|nfl|mlb|nhl|cfb|playoff)/i.test(s)) return true
  // FanDuel settled scoreboard glued into selection (opponent periods + Finished)
  if (/\bfinish(?:ed)?\b/i.test(s)) return true
  // "26 25 31 23 105" / "28 20 21 24 93" quarter/period tallies
  if (/(?:\b\d{1,3}\b[\s,]+){3,}\d{1,3}\b/.test(s)) return true
  // "012032200 10" / "3014" inning or period digit runs after a team name
  if (/[A-Za-z]{3,}.*\d{4,}/.test(s) && !/[+-]\d+(?:\.\d+)?/.test(s)) return true
  return false
}

function countJunkLegSelections(legs) {
  return (Array.isArray(legs) ? legs : []).filter((l) => legSelectionLooksJunk(l?.selection_label)).length
}

function isCasinoPickJunk(pickRaw) {
  const s = String(pickRaw || '').trim()
  if (!s) return true
  if (/^(ticket|parlay|straight|bet|to\s*win|to\s*collect|cost)/i.test(s)) return true
  if (/ticket\s*cost|to\s*win|to\s*collect/i.test(s)) return true
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s)) return true
  if (/^\d{1,2}\s+\d{4}/.test(s)) return true
  if (/^(?:nba|nfl|mlb|nhl|cfb|playoffs?)\s*$/i.test(s)) return true
  return false
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
    if (legSelectionLooksJunk(stub.selection_label)) return
    const key = `${normalizeNameKey(stub.selection_label)}|${stub.odds || 'na'}`
    if (seen.has(key)) return
    seen.add(key)
    legs.push(stub)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const hint = sportHintFromLine(line)
    if (hint) sportHint = hint
    if (/\bcollege\s*fb\b|\bpro\s*basketball\b|\bpro\s*football\b|\bnfl\s*playoffs?\b|\bnba\b/i.test(line)) {
      if (/basketball|\bnba\b/i.test(line)) sportHint = 'NBA'
      else if (/football|fb|nfl/i.test(line)) sportHint = /college/i.test(line) ? 'CFB' : 'NFL'
    }

    const paren = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s+\(([^)]+)\)\s*$/i.exec(line)
    if (paren) {
      if (!isCasinoPickJunk(paren[2])) push(casinoLegFromPickAndJuice(paren[2], paren[3], sportHint))
      continue
    }

    const same = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s+((?:OV|UN|OVER|UNDER)\s+\d+(?:\.\d+)?[+\-\s]*\d{3,5}|[+-]\d+(?:\.\d+)?[+\-\s]*\d{3,5}|[+-]\d{3,5})\s*$/i.exec(line)
    if (same) {
      if (!isCasinoPickJunk(same[2])) push(casinoLegFromPickAndJuice(same[2], same[3], sportHint))
      continue
    }

    // "[101] RAVENS" / OCR drop "[" → "522] KNICKS" / thumb junk → ">25] LAKERS"
    const head = /^\[(\d+(?:\/\d+)?)\]\s+(.+?)\s*$/i.exec(line)
      || /^[>]\s*(\d{2,4}(?:\/\d{2,4})?)\]\s+(.+?)\s*$/i.exec(line)
      || /^(\d{2,4}(?:\/\d{2,4})?)\]\s+(.+?)\s*$/i.exec(line)
    if (!head) continue
    const pickRaw = head[2].trim()
    if (isCasinoPickJunk(pickRaw)) continue
    picks.push({ pickRaw, sportHint })
  }

  // Always zip picks → juice lines in document order (handles bunched OCR).
  if (picks.length >= 2) {
    const juices = []
    for (const line of lines) {
      if (/^[\[>]?\d/.test(line) && /\]/.test(line)) continue
      if (/ticket\s*cost|to\s*win|to\s*collect|^\$|parlay\s*\(|bet\(s\)|you\s*won/i.test(line)) continue
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
  if (/\btable\s*tennis\b|\bittf\b|\btt\s*elite\b|\bchallenger\s*tt\b/i.test(s)) {
    return sportByKey(SPORTS_BET_SPORT_TABLE_TENNIS)
      || { key: SPORTS_BET_SPORT_TABLE_TENNIS, label: 'Table Tennis' }
  }
  if (/\btennis\b|\batp\b|\bwta\b/i.test(s)) {
    return sportByKey(SPORTS_BET_SPORT_TENNIS) || { key: SPORTS_BET_SPORT_TENNIS, label: 'Tennis' }
  }
  // MLB club names before NFL nickname hints … Giants/Rangers/etc. collide
  const mlbClubHits = (s.match(
    /\b(?:cubs|braves|yankees|dodgers|giants|astros|orioles|reds|rays|twins|pirates|nationals|white\s*sox|cardinals|rangers|phillies|mets|red\s*sox|guardians|tigers|royals|mariners|athletics|angels|padres|rockies|diamondbacks|brewers|marlins)\b/gi,
  ) || []).length
  if (mlbClubHits >= 2) {
    return resolveSportsBetSport('baseball_mlb', 'MLB')
  }
  // NBA nicknames before NFL … Lions/Giants-style collisions are rare here; Pacers/Nuggets unique
  const nbaClubHits = (s.match(
    /\b(?:pacers|nuggets|lakers|celtics|bulls|heat|knicks|nets|76ers|sixers|cavaliers|cavs|pistons|bucks|hawks|hornets|wizards|magic|thunder|blazers|trail\s*blazers|jazz|kings|suns|warriors|clippers|rockets|spurs|mavericks|mavs|grizzlies|pelicans|timberwolves|wolves)\b/gi,
  ) || []).length
  if (nbaClubHits >= 2) {
    return resolveSportsBetSport('basketball_nba', 'NBA')
  }
  if (NFL_TEAM_HINT.test(s)) {
    return resolveSportsBetSport('americanfootball_nfl', 'NFL')
  }
  if (mlbClubHits >= 1) {
    return resolveSportsBetSport('baseball_mlb', 'MLB')
  }
  if (nbaClubHits >= 1) {
    return resolveSportsBetSport('basketball_nba', 'NBA')
  }
  // Person vs person moneyline parlays with no league printed … US books flood table tennis
  {
    const personVs = [...s.matchAll(
      /\b([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3})\s+vs\.?\s+([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3})\b/gi,
    )]
    const teamish = (
      NFL_TEAM_HINT.test(s)
      || /\b(?:nfl|nba|mlb|nhl|cfb|ncaaf|mls|ufc|mma|boxing)\b/i.test(s)
    )
    if (personVs.length >= 2 && !teamish) {
      return sportByKey(SPORTS_BET_SPORT_TABLE_TENNIS)
        || { key: SPORTS_BET_SPORT_TABLE_TENNIS, label: 'Table Tennis' }
    }
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
  allowMissingOdds = false,
  toWinDollars = null,
  toCollectDollars = null,
}) {
  const american = odds === '' || odds == null ? null : americanOrNull(odds)
  if (american == null && !allowMissingOdds) return null

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
    odds: american != null ? americanOddsInputString(american) : '',
    stake_units: units != null ? String(units) : '',
    stake_dollars: dollars != null ? String(dollars) : '',
    to_win_dollars: toWinDollars != null && Number(toWinDollars) > 0 ? String(toWinDollars) : '',
    to_collect_dollars: toCollectDollars != null && Number(toCollectDollars) > 0
      ? String(toCollectDollars)
      : '',
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
  if (/\bparlay\b|\bpa[yi]lay\b|\bsgp\b|same\s*game\s*parlay|\d+\s*-\s*leg\b|\d+\s+legs?\b|multiples/i.test(raw)) {
    return true
  }
  // FanDuel settled multi-prop: no "Parlay" word, just stacked Over/Under legs + TOTAL WAGER
  if (countPlayerPropOuLines(raw) >= 2) return true
  // FanDuel My Bets alt lines / spreads … no "Parlay" word
  if (/(?:my\s*bets|won\s+on\s+fanduel|total\s*wager)/i.test(raw)) {
    const markets = raw.match(
      /\b(?:alternate\s*(?:run\s*lines?|spread|puck\s*line)|total\s*match\s*points|spread\s*betting|moneyline|half-?time\s*result)\b/gi,
    ) || []
    if (markets.length >= 2) return true
  }
  // DK "SINGLES" stake-all / multi-ML betslip with no Parlay label
  const mlHits = raw.match(/\b(?:moneyline|money\s*line)\b/gi) || []
  if (mlHits.length >= 2 && /(?:bet\s*slip|place\s*bet|total\s*payout|total\s*wager)/i.test(raw)) {
    return true
  }
  return false
}

/** Bare American odds line, optionally with trailing OCR junk (x / ł). */
function bareAmericanOddsLine(line) {
  const m = /^([+-])\s*(\d{3,6})\s*[^\d]*$/.exec(String(line || '').trim())
  return m ? americanOddsInputString(`${m[1]}${m[2]}`) : ''
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
  // FanDuel open betslip: "3 Leg Parlay +584" on one line (ticket total, not a leg)
  {
    const same = (
      /(?:^|\n)\s*\d+\s*-?\s*leg\s+pa[ry]lay\s+([+-]\d{3,6})\s*(?:\n|$)/i.exec(raw)
      || /(?:^|\n)\s*\d+\s*pick\s+pa[ry]lay\s+([+-]\d{3,6})\s*(?:\n|$)/i.exec(raw)
      || /(?:^|\n)\s*\d+\s*-?\s*leg\s+pa[ry]lay\s*\n\s*([+-]\d{3,6})\s*(?:\n|$)/i.exec(raw)
    )
    if (same) {
      const n = americanOrNull(same[1])
      if (n != null) return n
    }
  }
  const m = /total\s*odds\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /combined\s*(?:odds|price)\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /parlay\s*odds\s*[:=]?\s*([+-]\d{3,5})/i.exec(raw)
    || /parlay\s*\(\d+\)\s*@\s*([+-]\d{3,5})/i.exec(raw)
  if (m) {
    const oddsTok = m[2] && /^[+-]/.test(m[2]) ? m[2] : m[1]
    const n = americanOrNull(oddsTok)
    if (n != null) return n
  }
  // "4 Pick Parlay" / "3 Leg Parlay" / "10-Leg Parlay" … bunched juices then ticket plus
  {
    const block = /(\d+)\s*(?:pick\s+)?pa[ry]lay([\s\S]{0,280})/i.exec(raw)
      || /(\d+)\s*-?\s*leg\s+pa[ryi]lay([\s\S]{0,280})/i.exec(raw)
    if (block) {
      const found = [...block[2].matchAll(/([+-]\d{3,6})/g)]
        .map((x) => americanOrNull(x[1]))
        .filter((n) => n != null)
      const pos = found.filter((n) => n > 0)
      if (pos.length) return Math.max(...pos)
      if (found.length === 1) return found[0]
    }
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
  // Open / settled SGP: ticket juice often alone on a line (+479 / +1859 / +1231)
  if (/\bsgp\b|same\s*game\s*parlay|\bpa[yi]lay\b/i.test(raw)) {
    const bare = []
    for (const line of raw.split('\n')) {
      const o = bareAmericanOddsLine(String(line || '').trim())
      if (!o) continue
      const n = americanOrNull(o)
      if (n != null && Math.abs(n) >= 200) bare.push(n)
    }
    if (bare.length === 1) return bare[0]
    const pos = bare.filter((n) => n > 0)
    if (pos.length) return Math.max(...pos)
  }
  // BetRivers: "Win" / "Win +2620" as the printed ticket American (not TO WIN $)
  {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (/^to\s*win\b/i.test(line)) continue
      const inline = /^(?:win|total\s*odds|combined(?:\s*odds)?)\s*[:=]?\s*([+-]\d{2,6})\s*$/i.exec(line)
      if (inline) {
        const n = americanOrNull(inline[1])
        if (n != null) return n
      }
      if (!/^(?:win|total\s*odds|combined(?:\s*odds)?)\s*:?\s*$/i.test(line)) continue
      const next = bareAmericanOddsLine(lines[i + 1] || '') || String(lines[i + 1] || '').trim()
      const n = americanOrNull(next)
      if (n != null) return n
    }
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
    } else if (isMl) {
      // "× GB Packers" / "Los Angeles Rams" + Moneyline (strip leading × before letter check)
      const team = line.replace(/^[×xX$]\s*/, '').trim()
      if (!/^[A-Za-z]/.test(team) || team.length > 48 || /^(over|under|parlay)/i.test(team)) {
        /* skip */
      } else if (/parlay|wager|odds|singles|clear|remove|straights|betslip/i.test(team)) {
        /* skip */
      } else {
        stub = emptyLegStub({
          market: 'h2h',
          selection_label: `${titleCaseWords(team)} ML`,
        })
      }
    } else if (/^spread$/i.test(next) && /^[A-Za-z]/.test(line.replace(/^[×xX]\s*/, '')) && !/[+-]\d/.test(line)) {
      // FanDuel OCR drop: "Washington Commanders" + SPREAD (line missing)
      const team = line.replace(/^[×xX]\s*/, '').trim()
      if (team && team.length < 48 && !/wager|parlay|betslip/i.test(team)) {
        stub = emptyLegStub({
          market: 'spread',
          selection_label: titleCaseWords(team),
        })
      }
    }
    if (!stub) continue

    const matchupLine = lines[i + 2] || ''
    // Prefer \bvs\b … bare \bv\b wrongly misses "vs" (word-boundary after v fails)
    if (/(?:@|\bat\b|\bvs\.?\b)/i.test(matchupLine)) {
      const cleaned = matchupLine
        .replace(/^[•·→]\s*/, '')
        .replace(/\bNFL\s*[•·]\s*/i, '')
        .replace(/[©]/g, '@')
        .replace(/\s*[•·«].*$/, '')
        .replace(/\s+Today\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
      const ev = parseEventMatchup(cleaned)
      stub.event_label = ev.event || cleaned
      stub.away_team = ev.away_team || ''
      stub.home_team = ev.home_team || ''
      const sport = extractSport([matchupLine, text].join('\n'))
      stub.sport_key = sport.key || ''
      stub.sport_label = sport.label || ''
    }

    const key = normalizeNameKey(stub.selection_label)
    if (seen.has(key)) continue
    seen.add(key)
    pending.push(stub)
  }

  const zipped = zipBunchedAmericanOdds(pending, text)
  if (pending.length >= 2 && extractTotalParlayOdds(text) != null) {
    return zipped.length >= 2 ? zipped : pending
  }
  return zipped.filter((l) => l.odds)
}

/**
 * DraftKings / Fanatics open betslip moneylines:
 * "× GB Packers" / Moneyline / matchup / -238  (odds may be bunched)
 */
function extractAppMoneylineBetslipLegs(text) {
  const lines = normalizeSlipOcrText(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()
  // When ticket odds exist, juices are usually bunched … leave empty for zip (avoid
  // Pittsburgh's "-1700" before Money Line stealing alignment).
  const preferZip = extractTotalParlayOdds(text) != null

  const isSkipLookbackLine = (l) => (
    bareAmericanOddsLine(l)
    || /(?:\bat\b|event\s*time|football\s*\||^ticket|^max\s|money\s*line|^\d{1,2}:\d{2})/i.test(l)
  )

  const pushTeam = (teamRaw, fromIdx) => {
    const team = String(teamRaw || '').replace(/^[×xX$]\s*/, '').trim()
    if (!team || team.length > 48 || /singles|parlay|stake|clear|straights|remove|ticket|max\s*win|caesars|event\s*time|football\s*\|/i.test(team)) {
      return
    }
    if (bareAmericanOddsLine(team) || /^(?:moneyline|money\s*line)/i.test(team)) return
    if (/(?:@|\bat\b)/i.test(team) && team.length > 28) return // matchup line, not pick
    let event_label = ''
    let away_team = ''
    let home_team = ''
    let odds = ''
    const prev = lines[fromIdx - 1] || ''
    if (!preferZip && bareAmericanOddsLine(prev)) odds = bareAmericanOddsLine(prev)

    for (let j = fromIdx + 1; j < Math.min(fromIdx + 10, lines.length); j += 1) {
      const next = lines[j]
      if (/^(?:moneyline|money\s*line)(?:\s+ft)?$/i.test(next) || /^[×xX]/.test(next)) break
      if (/^[A-Za-z].{2,40}$/.test(next) && /^(?:moneyline|money\s*line)/i.test(lines[j + 1] || '')) break
      const oddsTok = bareAmericanOddsLine(next)
      if (oddsTok) {
        if (preferZip) break // leave for zipBunched
        const after = lines.slice(j + 1).find((l) => l && !/^(sun|mon|tue|wed|thu|fri|sat|\d{1,2}:\d{2}|0\.00)/i.test(l))
        if (after && bareAmericanOddsLine(after)) break // bunched trail
        odds = oddsTok
        break
      }
      if (/(?:@|\bat\b|\bvs\.?\b)/i.test(next)) {
        const cleaned = next
          .replace(/^[•·→]\s*/, '')
          .replace(/\s*[•·«].*$/, '')
          .replace(/\s*[·•]\s*Today\b.*$/i, '')
          .replace(/\s+Today\b.*$/i, '')
          .trim()
        const ev = parseEventMatchup(cleaned)
        event_label = ev.event || cleaned
        away_team = ev.away_team || ''
        home_team = ev.home_team || ''
      }
    }
    const selection_label = `${titleCaseWords(team)} ML`
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) return
    seen.add(key)
    const sport = extractSport([selection_label, event_label, text].join(' '))
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

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    // DK / Fanatics: "GB Packers" then "Moneyline"
    if (/^(?:moneyline|money\s*line)$/i.test(lines[i + 1] || '')) {
      pushTeam(line, i + 1)
      continue
    }
    // Caesars retail: odds may sit between team and "Money Line"
    // "Pittsburgh Panthers" / "-1700" / "Money Line"
    if (/^(?:moneyline|money\s*line)$/i.test(line)) {
      let j = i - 1
      while (j >= 0 && isSkipLookbackLine(lines[j])) j -= 1
      if (j >= 0) pushTeam(lines[j], i)
    }
  }

  const zipped = zipBunchedAmericanOdds(pending, text)
  if (pending.length >= 2 && extractTotalParlayOdds(text) != null) {
    return zipped.length >= 2 ? zipped : pending
  }
  const withOdds = zipped.filter((l) => l.odds)
  if (withOdds.length >= 2) return withOdds
  // Settled My Bets ML parlays (Lost / Did not win / TOTAL WAGER) often omit per-leg juice
  const settledNoBetslip = (
    pending.length >= 2
    && !/\bplace\s*bet\b/i.test(String(text || ''))
    && /\b(?:total\s*wager|did\s*not\s*win|won\s+on|you\s*won|my\s*bets)\b/i.test(String(text || ''))
  )
  if (settledNoBetslip) return pending
  return withOdds
}

/**
 * Declared leg count from slip headers: "Parlay 5 bets", "5-Leg Parlay", "PARLAY (5 TEAMS)".
 * @returns {number|null}
 */
export function declaredParlayLegCount(text) {
  const raw = String(text || '')
  const m = /parlay\s+(\d+)\s*bets?\b/i.exec(raw)
    || /(\d+)\s*-?\s*leg\s+pa[ryi]lay/i.exec(raw)
    || /parlay\s*\(\s*(\d+)\s*teams?\s*\)/i.exec(raw)
    || /(\d+)\s*(?:pick\s+)?pa[ry]lay/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 2 && n <= 40) return n
  }
  // FanDuel settled alt lines: one ALTERNATE RUN LINES / SPREAD / PUCK LINE per leg
  const altN = (raw.match(/\balternate\s*(?:run\s*lines?|spread|puck\s*line)\b/gi) || []).length
  if (altN >= 2 && altN <= 40) return altN
  return null
}

/** Strip retail "Money Line FT" noise from a selection label → "Team ML". */
function cleanRetailMoneyLineSelection(sel) {
  const s = String(sel || '').trim()
  const m = /^(?:\d{3,5}\s+)?(.+?)\s+money\s*line(?:\s*ft)?\s*$/i.exec(s)
  if (m) return `${titleCaseWords(m[1].trim())} ML`
  return s
}

/**
 * Golden Nugget AC / retail: "3585 Creighton Bluejays Money Line FT" + bunched odds.
 */
function extractNumberedMoneyLineFtLegs(text) {
  const raw = normalizeSlipOcrText(text)
  // FT may OCR as Ft / F1; also allow bare "Money Line" on numbered retail parlays
  if (!/money\s*line/i.test(raw)) return []
  if (!/money\s*line\s*ft|parlay\s+\d+\s*bets|golden\s*nugget/i.test(raw)) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    let m = /^(\d{3,5})\s+(.+?)\s+money\s*line(?:\s*ft|\s*f1)?\s*$/i.exec(line)
    // Split OCR: "4427 Duke Blue Devils" / "Money Line FT"
    if (!m && /^(?:money\s*line)(?:\s*ft|\s*f1)?\s*$/i.test(line)) {
      const prev = lines[i - 1] || ''
      m = /^(\d{3,5})\s+(.+?)\s*$/i.exec(prev)
    }
    if (!m) continue
    let team = titleCaseWords(m[2].trim().replace(/\s+money\s*line.*$/i, ''))
    if (!team || team.length > 48) continue
    if (/^(ticket|parlay|total|number)/i.test(team)) continue
    let event_label = ''
    let away_team = ''
    let home_team = ''
    const next = lines[i + 1] || ''
    const next2 = lines[i + 2] || ''
    const matchupLine = /(?:@|\bat\b)/i.test(next) ? next : (/(?:@|\bat\b)/i.test(next2) ? next2 : '')
    if (matchupLine) {
      const ev = parseEventMatchup(matchupLine.replace(/\s+/g, ' '))
      event_label = ev.event || matchupLine
      away_team = ev.away_team || ''
      home_team = ev.home_team || ''
    }
    const selection_label = `${team} ML`
    const key = normalizeNameKey(selection_label)
    if (seen.has(key)) continue
    seen.add(key)
    const sport = extractSport([selection_label, event_label, raw].join(' '))
    pending.push(emptyLegStub({
      market: 'h2h',
      selection_label,
      home_team,
      away_team,
      event_label,
      sport_key: sport.key || 'basketball_ncaab',
      sport_label: sport.label || 'CBB',
    }))
  }

  const zipped = zipBunchedAmericanOdds(pending, text)
  if (pending.length >= 2 && extractTotalParlayOdds(text) != null) {
    return zipped.length >= 2 ? zipped : pending
  }
  return zipped.filter((l) => l.odds)
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
 * Alt lines: bold "Team +3.5" directly above ALTERNATE RUN LINES / SPREAD / PUCK LINE
 * (scoreboard rows under the pick are junk … never use those as selection).
 */
function extractFanDuelMyBetsLegs(text) {
  const raw = normalizeSlipOcrText(text)
  const altMarketHits = (raw.match(/\balternate\s*(?:run\s*lines?|spread|puck\s*line)\b/gi) || []).length
  // Only My Bets / settled receipts … or alt-line slips (≥2 ALTERNATE markets)
  if (!/(?:my\s*bets|won\s+on\s+fanduel|total\s*wager)/i.test(raw) && altMarketHits < 2) {
    return []
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const pending = []
  const marketRe = /^(moneyline|half-?time\s*result|1st\s*half\s*over\/under|spread\s*betting|total\s*points|total\s*match\s*points|spread|alternate\s*(?:run\s*lines?|spread|puck\s*line)|any\s*time\s*touchdown)/i
  // OCR: "1ST HALE OVERJUNDER D.5 GOLLS"
  const marketFuzzy = /moneyline|half-?time|over\s*\/?\s*under|hale\s*over|gol|spread|puck|alternate|touchdown|receiving|total/i
  const altPickRe = /^(.+?)\s+([+-]\d+(?:\.\d+)?)\s*$/

  // Prefer clean "Team +line" rows immediately above ALTERNATE … beats scoreboard noise
  if (altMarketHits >= 2) {
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^alternate\s*(?:run\s*lines?|spread|puck\s*line)\b/i.test(lines[i])) continue
      const sel = lines[i - 1] || ''
      const spreadSel = altPickRe.exec(sel)
      if (!spreadSel) continue
      if (legSelectionLooksJunk(sel)) continue
      const team = spreadSel[1].trim()
      if (team.length < 3 || team.length > 40) continue
      const lineNum = Number(spreadSel[2])
      if (!Number.isFinite(lineNum)) continue
      const signed = lineNum > 0 ? `+${lineNum}` : String(lineNum)
      pending.push(emptyLegStub({
        market: 'spread',
        side: '',
        line: String(lineNum),
        selection_label: `${titleCaseWords(team)} ${signed}`,
      }))
    }
    if (pending.length >= 2) {
      const zipped = zipBunchedAmericanOdds(pending, text)
      const out = zipped.filter((l) => l.odds)
      if (out.length >= 2) return out
      // Settled alt slips sometimes OCR juices as "-500 Finished" … still return picks
      if (pending.length >= altMarketHits) return pending
      return out.length ? out : pending
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const marketRaw = lines[i + 1] || ''
    const market = marketRaw.replace(/^[^A-Za-z]+/, '').trim()
    const selRaw = lines[i]
    // Strip leading icon OCR junk: "(©)", "&", "$", "In "
    const sel = String(selRaw || '').replace(/^[\s(©®™*&$@~•·→xX]+/, '').trim()
    if (!sel || sel.length > 80) continue
    if (/^(my\s*bets|active|settled|saved|fanduel|panduel|draw\s*moneyline|\d+\s*leg|sgp|same\s*game)/i.test(sel)) continue
    // Collapsed header: "Cubs Moneyline, Braves Moneyline, …"
    if (/moneyline.*,.*moneyline/i.test(sel)) continue
    if (bareAmericanOddsLine(sel) || /^finished$|^live$/i.test(sel)) continue
    if (/^\d/.test(sel) && !/^(1st|2nd|\d+\+)/i.test(sel)) continue
    if (legSelectionLooksJunk(sel)) continue

    const ou = /^(?:1st\s*half\s+)?(over|under)\s+(\d+(?:\.\d+)?)\s*goals?\s*$/i.exec(sel)
      || /^(?:1st\s*half\s+)?(over|under)\s+(\d+(?:\.\d+)?)\s*$/i.exec(sel)
    const spreadSel = altPickRe.exec(sel)
    const marketOk = marketRe.test(market) || ((ou || spreadSel) && marketFuzzy.test(marketRaw))
    if (!marketOk) continue

    let marketKind = 'h2h'
    let side = ''
    let line = ''
    let odds = ''
    let selection_label = titleCaseWords(sel)
    if (ou) {
      marketKind = 'total'
      side = ou[1].toLowerCase() === 'under' ? 'under' : 'over'
      line = String(Number(ou[2]))
      const is1h = /^1st\s*half/i.test(sel)
      selection_label = is1h
        ? `1H ${side === 'under' ? 'Under' : 'Over'} ${line} Goals`
        : `${side === 'under' ? 'Under' : 'Over'} ${line}`
    } else if (spreadSel && /spread|puck|run\s*line|alternate/i.test(market)) {
      marketKind = 'spread'
      const team = spreadSel[1].trim()
      const lineNum = Number(spreadSel[2])
      line = String(lineNum)
      const signed = lineNum > 0 ? `+${lineNum}` : String(lineNum)
      selection_label = `${titleCaseWords(team)} ${signed}`
    } else if (/^draw$/i.test(sel)) {
      marketKind = 'h2h'
      selection_label = 'Draw'
    } else if (/half-?time\s*result/i.test(market)) {
      marketKind = 'other'
      selection_label = `${titleCaseWords(sel)} HT`
    } else if (/touchdown/i.test(market)) {
      marketKind = 'prop'
      selection_label = `${titleCaseWords(sel)} ATD`
    } else if (/moneyline/i.test(market)) {
      marketKind = 'h2h'
      // Open My Bets: "Chicago Cubs -120" / MONEYLINE (juice on the pick line)
      const withJuice = /^(.+?)\s+([+-]\d{3,6})\s*$/.exec(sel)
      if (withJuice && Math.abs(Number(withJuice[2])) >= 100) {
        selection_label = `${titleCaseWords(withJuice[1].trim())} ML`
        odds = americanOddsInputString(withJuice[2]) || withJuice[2]
      } else {
        selection_label = `${titleCaseWords(sel)} ML`
      }
    } else if (/^spread$/i.test(market) && !/[+-]\d/.test(sel)) {
      marketKind = 'spread'
      selection_label = titleCaseWords(sel)
    }

    pending.push(emptyLegStub({
      market: marketKind,
      side,
      line,
      odds,
      selection_label,
    }))
  }

  const zipped = zipBunchedAmericanOdds(pending, text)
  // Settled dual-SGP often omits per-leg juice … keep legs when ticket odds exist
  if (pending.length >= 2 && extractTotalParlayOdds(text) != null) {
    return zipped.length >= 2 ? zipped : pending
  }
  return zipped.filter((l) => l.odds)
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

  // FanDuel open SGP before generic props (props alone would drop the ML leg)
  const fdSgp = extractFanDuelSgpLegs(text)
  if (fdSgp.length >= 2) return fdSgp

  // DraftKings "Over 0.5 (Player)" / "100+ (Player)" props before disclaimer/+odds pairing invents junk legs.
  const appProps = extractAppPlayerPropLegs(text)
  if (appProps.length >= 2) return appProps

  const combo = extractDkMlTotalComboLegs(text)
  if (combo.length >= 2) return combo

  // Golden Nugget AC "3585 Creighton Bluejays Money Line FT"
  const mlFt = extractNumberedMoneyLineFtLegs(text)
  if (mlFt.length >= 2) return mlFt

  const fdMine = extractFanDuelMyBetsLegs(text)
  if (fdMine.length >= 2) return fdMine

  const ufc = extractUfcFighterParlayLegs(text)
  if (ufc.length >= 2) return ufc

  const decimalLegs = extractDecimalOddsParlayLegs(text)
  if (decimalLegs.length >= 2) return decimalLegs

  // Caesars retail "Money Line" (two words) with juices between team+market … beat spreadTot.
  // Require the space so FanDuel/DK "Moneyline" open slips stay on spreadTot.
  {
    const moneyLineHits = (String(text || '').match(/\bmoney\s+line\b/gi) || []).length
    if (moneyLineHits >= 2) {
      const mlFirst = extractAppMoneylineBetslipLegs(text)
      if (mlFirst.length >= 2) return mlFirst
    }
  }

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

  // Only fill combined odds when the ticket prints an American/decimal total.
  // Do NOT invent from leg product or stake→payout (those go in To win / To collect).
  const totalOdds = extractTotalParlayOdds(raw)
  const money = ticketMoneyFromText(raw)
  const stakeDollars = money.stake_dollars ?? extractStakeDollars(raw)

  const book = extractBook(raw)
  const commence_time = extractCommenceTime(raw)
  let sport = extractSport(raw)
  // Prefer a sport already on legs (e.g. person-vs-person → Table Tennis)
  if (!sport.key) {
    for (const leg of legs) {
      const ls = resolveSportsBetSport(leg.sport_key, leg.sport_label)
      if (ls.key) {
        sport = ls
        break
      }
    }
  }
  let normalized = normalizeParlayLegs(legs)
  if (sport.key) {
    normalized = normalized.map((leg) => (
      leg.sport_key
        ? leg
        : { ...leg, sport_key: sport.key, sport_label: sport.label }
    ))
  }

  const draft = draftFromBits({
    selection: parlaySelectionLabel(normalized),
    odds: totalOdds,
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
    allowMissingOdds: true,
    toWinDollars: money.to_win_dollars,
    toCollectDollars: money.to_collect_dollars,
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
  const withMoney = attachTicketMoney(draft, raw)
  withMoney.status = detectSlipResult(raw)
  return withMoney
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
export function isWeakSportsBetDraft(draft, ocrText = '') {
  if (!draft || typeof draft !== 'object') return true
  const odds = String(draft.odds || '').trim()
  const hasOdds = Boolean(odds && /^[+-]?\d{2,6}$/.test(odds))
  const hasMoney = (
    parseMoneyAmount(draft.to_collect_dollars) != null
    || parseMoneyAmount(draft.to_win_dollars) != null
  )
  const market = String(draft.market || '')
  const parlayLegsOk = market === 'parlay' && countUsableParlayLegs(draft.legs) >= 2
  // Casino parlays often omit printed American totals … money or legs are enough
  if (!hasOdds && !hasMoney && !parlayLegsOk) return true
  const event = String(draft.event_label || '').trim()
  const away = String(draft.away_team || '').trim()
  const home = String(draft.home_team || '').trim()
  const matchup = event || [away, home].filter(Boolean).join(' @ ')
  if (looksLikeTerminalMatchup(away, home, event)) return true
  const sel = String(draft.selection_label || '')
  const stake = String(draft.stake_dollars || '').trim()
  if (market === 'other' && !stake && !/distance|method|round|knock/i.test(sel)) {
    // other with only a junk event/odds and no real pick label
    if (!sel || sel === matchup || sel.startsWith(matchup)) return true
  }
  if ((market === 'spread' || market === 'h2h') && !away && !home && !sel) return true
  // "Parlay 5 bets" but only 4 legs → weak so Edge / hydrate can recover the miss
  if (market === 'parlay') {
    const declared = declaredParlayLegCount(ocrText)
      || declaredParlayLegCount(draft.notes)
      || declaredParlayLegCount(sel)
    const n = countUsableParlayLegs(draft.legs)
    if (declared != null && n > 0 && n < declared) return true
    // Date lines / "TO WIN: TICKET COST:" as selections → weak (prefer OCR hydrate)
    if (countJunkLegSelections(draft.legs) > 0) return true
  }
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
 * Clear invented combined odds (stolen leg juice / leg product). Fill To win /
 * To collect from OCR or Edge money fields. Do not derive American from $.
 * When Combined odds is blank, backfill from labeled ticket total ("3 Leg Parlay +584").
 */
function repairParlayTicketOdds(draft, ocrText = '') {
  if (!draft || typeof draft !== 'object') return draft
  let next = attachTicketMoney(draft, ocrText)
  const rawLegs = Array.isArray(next.legs) ? next.legs : []
  // Salvage +584 off a chrome "3 Leg Parlay" leg before stripping it
  const chromeOdds = rawLegs
    .filter((l) => isParlayTicketChromeSelection(l?.selection_label))
    .map((l) => americanOrNull(l.odds))
    .find((n) => n != null)
  const legs = rawLegs.filter((l) => !isParlayTicketChromeSelection(l?.selection_label))
  if (legs.length !== rawLegs.length) {
    next = { ...next, legs }
  }
  if (legs.length < 2) return next

  const printed = (
    (ocrText ? extractTotalParlayOdds(ocrText) : null)
    ?? (next.notes ? extractTotalParlayOdds(String(next.notes)) : null)
    ?? chromeOdds
    ?? null
  )
  let current = americanOrNull(next.odds)
  // Edge / weak path often leaves odds blank after chrome is stripped … fill Combined odds
  if (current == null && printed != null) {
    const tok = americanOddsInputString(printed) || (printed > 0 ? `+${printed}` : String(printed))
    next = { ...next, odds: tok }
    current = printed
  }
  if (current == null) return next

  const fromLegs = combinedOddsFromLegs(legs)
  const legOdds = new Set(
    legs.map((l) => americanOrNull(l.odds)).filter((n) => n != null),
  )
  const stolen = legOdds.has(current)
  const legProductOnly = fromLegs != null
    && Math.abs(current - fromLegs) <= Math.max(5, Math.abs(fromLegs) * 0.02)
  // Keep labeled ticket totals ("3 Leg Parlay +584") even when they ≈ leg product.
  const keepPrinted = printed != null && printed === current
  if (!keepPrinted && (stolen || legProductOnly)) {
    next = { ...next, odds: '' }
  }
  return next
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
  }).map((leg) => ({
    ...leg,
    selection_label: cleanRetailMoneyLineSelection(leg.selection_label),
  }))
  const fromText = (ocrText ? extractParlayLegs(ocrText) : []).map((leg) => ({
    ...leg,
    selection_label: cleanRetailMoneyLineSelection(leg.selection_label),
  }))
  const fromNotes = legsFromParlayNotes(draft.notes).map((leg) => ({
    ...leg,
    selection_label: cleanRetailMoneyLineSelection(leg.selection_label),
  }))

  const declared = declaredParlayLegCount(ocrText)
    || declaredParlayLegCount(draft.notes)
    || declaredParlayLegCount(draft.selection_label)

  const candidates = [
    { legs: current, n: countUsableParlayLegs(current), junk: countJunkLegSelections(current) },
    { legs: fromText, n: countUsableParlayLegs(fromText), junk: countJunkLegSelections(fromText) },
    { legs: fromNotes, n: countUsableParlayLegs(fromNotes), junk: countJunkLegSelections(fromNotes) },
  ]
  const byQuality = (a, b) => {
    // Prefer more legs, then fewer junk selections (Edge often glues dates / ticket footers)
    if (b.n !== a.n) return b.n - a.n
    if (a.junk !== b.junk) return a.junk - b.junk
    return 0
  }
  let next = draft
  // Prefer a source that hits the slip's declared leg count ("Parlay 5 bets")
  if (declared != null) {
    const exact = candidates.filter((c) => c.n === declared)
    if (exact.length) {
      exact.sort(byQuality)
      next = { ...draft, legs: exact[0].legs }
      return repairParlayTicketOdds(next, ocrText)
    }
  }
  candidates.sort(byQuality)
  const best = candidates[0]
  if (best.n >= 2) next = { ...draft, legs: best.legs }
  else if (!parlayLegsNeedHydrate(draft.legs) && current.length) {
    next = { ...draft, legs: current }
  }
  return repairParlayTicketOdds(next, ocrText)
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
