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

const MONEY_RE = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/

const BOOK_PATTERNS = [
  { re: /\bbarstool\s*sportsbook\b/i, name: 'Barstool' },
  { re: /\bbarstool\b/i, name: 'Barstool' },
  { re: /\bcirca\s*(?:resort|&|\band\b)?\s*(?:casino)?\b/i, name: 'Circa' },
  { re: /\bmirage\b/i, name: 'Mirage' },
  { re: /\bfliff\b/i, name: 'Fliff' },
  { re: /\bhard\s*rock\b/i, name: 'Hard Rock' },
  { re: /\bdraft\s*kings\b|\bdraftkings\b|\bdk\b/i, name: 'DraftKings' },
  { re: /\bfan\s*duel\b|\bfanduel\b|\bfd\b/i, name: 'FanDuel' },
  { re: /\bbet\s*mgm\b|\bbetmgm\b/i, name: 'BetMGM' },
  { re: /\bcaesars\b/i, name: 'Caesars' },
  { re: /\bfanatics\b/i, name: 'Fanatics' },
  { re: /\bpinnacle\b/i, name: 'Pinnacle' },
  { re: /\bbovada\b/i, name: 'Bovada' },
  { re: /\bbet365\b/i, name: 'bet365' },
  { re: /\bpointsbet\b/i, name: 'PointsBet' },
]

/** NFL nicknames / cities for sport inference when the slip omits "NFL". */
const NFL_TEAM_HINT =
  /\b(49ers|chiefs|bills|raiders|patriots|cowboys|packers|eagles|steelers|ravens|bengals|browns|titans|colts|jaguars|texans|broncos|chargers|raiders|chiefs|rams|seahawks|cardinals|saints|falcons|panthers|buccaneers|bucs|dolphins|jets|giants|commanders|washington|detroit|lions|bears|vikings|nfl)\b/i

const PAYOUT_LINE_RE =
  /\b(max\s*payout|to\s*win|to\s*collect|potential\s*payout|payout|win\s+\$)/i

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

/** Split "A @ B" / "A vs B" / "A / B" (UFC) into away / home. */
export function parseEventMatchup(text) {
  const s = String(text || '').trim()
  if (!s) return { event: '', away_team: '', home_team: '' }
  const m = /^(.+?)\s+(?:@|vs\.?|v\.?)\s+(.+)$/i.exec(s)
  if (m) {
    const away = m[1].trim()
    const home = m[2].trim()
    const sep = /@/.test(m[0]) ? '@' : 'vs'
    return {
      event: `${away} ${sep} ${home}`,
      away_team: away,
      home_team: home,
    }
  }
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
    /\bwager\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\bstake\s*[:=]?\s*\$?\s*([0-9,]+\.?\d*)/i,
    /\d+\s*bet\(s\)\s*@\s*\$?\s*([0-9,]+\.?\d*)/i,
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

  return null
}

function extractEvent(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (PAYOUT_LINE_RE.test(line)) continue
    if (/ticket\s*cost|slip\s*id|internal\s*id|betslip|account\s*#/i.test(line)) continue
    if (/^(straight|single|parlay)\b/i.test(line) && line.length < 24) continue
    // "1 BET(S) @ $50,000.00" is stake, not a matchup
    if (/\bbet\(s\)\s*@\s*\$/i.test(line) || /\b\d+\s*bet\(s\)\b/i.test(line)) continue
    // Skip "101 49ers MLB" style rotation lines (not the matchup)
    if (/^\d{2,5}\s+\S+.+\bMLB\b/i.test(line) && !/(?:@|\bvs\.?\b)/i.test(line)) continue
    // Sport/market headers like "UFC - FIGHT WINNER/TOTAL ROUNDS" are not events
    if (/fight\s*winner|total\s*rounds/i.test(line) && !/(?:@|\bvs\.?\b)/i.test(line)) continue
    // `@` is non-word … do not wrap it in `\b` or "A @ B" never matches
    if (/(?:@|\bvs\.?\b|\bv\.?\b)/i.test(line)) {
      const cleaned = line
        .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*$/i, '')
        .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b.*$/i, '')
        .replace(/\s+[+-]\d{2,5}\s*$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (/\$/.test(cleaned)) continue
      const parsed = parseEventMatchup(cleaned)
      if (parsed.away_team && parsed.home_team) return parsed
    }
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
  if (/\bboxing\b|title\s*bout|lightweight\s*title|fight\s+to\s+go/i.test(s)) {
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
    if (/ticket\s*cost|printed|transaction|slip\s*id|book\s+\d/i.test(line)) score -= 2
    if (/(?:@|\bvs\.?\b)/i.test(line) || /\bnfl\b|\bufc\b|event\s*start/i.test(line)) score += 3
    if (/january|february|march|april|may|june|july|august|september|october|november|december/i.test(line)) {
      score += 1
    }

    // 2/2/2020 3:30 PM
    let m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(line)
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
      if (
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

  // Fight prop Yes/No
  if (/fight\s+to\s+go\s+the\s+distance/i.test(raw)) {
    const yn = /\b(yes|no)\b/i.exec(raw)
    const sideWord = yn ? yn[1] : 'Yes'
    return {
      market: 'other',
      side: 'home',
      line: null,
      player_name: '',
      prop_stat: '',
      selection_label: `${sideWord} Fight To Go The Distance`,
    }
  }

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

  // Generic over/under total (game total, not player)
  const total = /\b(over|under)\s+([0-9]+(?:\.[0-9]+)?)\b/i.exec(raw)
  if (total && !/[A-Za-z]{3,}\s+(over|under)\s+/i.test(raw)) {
    const side = total[1].toLowerCase() === 'under' ? 'under' : 'over'
    return {
      market: 'total',
      side,
      line: Number(total[2]),
      player_name: '',
      prop_stat: '',
      selection_label: `${side === 'under' ? 'Under' : 'Over'} ${total[2]}`,
    }
  }

  if (/\b(ml|moneyline|money\s*line|straight)\b/i.test(raw)) {
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
    side: 'home',
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

  return {
    book: book || '',
    market: mkt || 'other',
    side: sd || 'home',
    line: ln != null && ln !== '' ? String(ln) : '',
    odds: String(american),
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
  }
}

/** Free-text bet slip / share-sheet paste / OCR. */
export function parseSportsBetSlipText(text) {
  const raw = String(text || '').replace(/\r/g, '').trim()
  if (!raw) return []

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

  // Participant sports: map pick onto home/away from fighter names (UI shows those names).
  if (
    isParticipantSport(draft.sport_key, draft.sport_label)
    && draft.market !== 'prop'
    && draft.market !== 'total'
  ) {
    const mapped = sideForParticipantSelection(
      draft.selection_label,
      draft.away_team,
      draft.home_team,
    )
    if (mapped) draft.side = mapped
  }

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
