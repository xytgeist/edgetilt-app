export function formatPostAge(createdAt) {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function periodLabel(sportKey, index, total) {
  const sk = String(sportKey || '')
  if (sk.includes('baseball')) return String(index + 1)
  if (sk.includes('hockey')) return index < 3 ? `${index + 1}` : 'OT'
  if (index >= 4) return 'OT'
  if (total <= 2) return index === 0 ? 'H1' : 'H2'
  return String(index + 1)
}

export function ordinal(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  const abs = Math.trunc(v)
  if (abs === 1) return '1st'
  if (abs === 2) return '2nd'
  if (abs === 3) return '3rd'
  return `${abs}th`
}

export function american(price) {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) === 0) return '-'
  const n = Number(price)
  return n > 0 ? `+${n}` : String(n)
}

export function signedPoint(point) {
  if (point == null || !Number.isFinite(Number(point))) return '-'
  const n = Number(point)
  if (n > 0) return `+${n}`
  return String(n)
}

/** Pre-game: show ATS spread (same shape as feed pills). Live/final: score. */
export function scoreText(side, status) {
  if (status === 'pre') {
    const point = side?.spread
    if (point == null || !Number.isFinite(Number(point))) return '-'
    const n = Number(point)
    if (n === 0) return 'PK'
    const abs = Math.abs(n)
    const body = Number.isInteger(abs) ? String(abs) : String(abs)
    return n > 0 ? `+${body}` : `-${body}`
  }
  if (side?.score == null) return '-'
  return String(side.score)
}

export function liveClockLabel(game, live) {
  if (game.status === 'post') return game.status_label || 'Final'
  if (game.status === 'pre') {
    return formatKickoff(game.commence_time) || stripTimeZoneSuffix(game.status_label) || 'Upcoming'
  }
  const period = live?.period != null ? ordinal(live.period) : ''
  const clock = String(live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  if (clock) return clock
  if (period) return period
  return game.status_label || 'Live'
}

/** Drop trailing zone tokens (PDT, EST, GMT+1, …) from a kickoff label. */
export function stripTimeZoneSuffix(label) {
  const s = String(label || '').trim()
  if (!s) return ''
  return s
    .replace(/\s+(?:[A-Z]{2,5}|GMT[+-]?\d{0,2}|UTC[+-]?\d{0,2})$/i, '')
    .trim()
}

export function downDistanceLabel(live) {
  if (!live) return ''
  const down = live.down != null ? ordinal(live.down) : ''
  const dist = live.distance != null && Number.isFinite(Number(live.distance)) ? String(live.distance) : ''
  if (down && dist) return `${down} & ${dist}`
  if (down) return down
  return ''
}

/**
 * Big center-field banner for stoppages … TIMEOUT / End of 1st / HALFTIME / End of 3rd / GAME OVER.
 */
export function fieldCenterBanner(game, live) {
  if (!game) return ''
  if (game.status === 'post') return 'GAME OVER'

  const statusName = String(live?.status_name || '').toUpperCase().replace(/\s+/g, '_')
  const detail = String(live?.status_detail || game.status_label || '').trim()
  const detailLower = detail.toLowerCase()
  const clock = String(live?.clock || '').trim()
  const clockLower = clock.toLowerCase()
  const lastPlay = String(live?.last_play || '').toLowerCase()
  const period = Number(live?.period)
  const hay = `${statusName} ${detailLower} ${clockLower}`

  if (
    /STATUS_TIMEOUT|STATUS_TV_TIMEOUT|TIMEOUT/.test(statusName)
    || /\btimeout\b/.test(detailLower)
    || /\btimeout\b/.test(clockLower)
    || /\btimeout\b/.test(lastPlay)
  ) {
    return 'TIMEOUT'
  }

  if (
    /STATUS_HALFTIME|HALFTIME/.test(statusName)
    || /\bhalf\s*time\b|\bhalftime\b|\bht\b/.test(detailLower)
    || /\bhalf\s*time\b|\bhalftime\b/.test(clockLower)
  ) {
    return 'HALFTIME'
  }

  if (/STATUS_FINAL|STATUS_FULL_TIME/.test(statusName) || /\bfinal\b|\bgame over\b/.test(detailLower)) {
    return 'GAME OVER'
  }

  if (/STATUS_END_PERIOD|END_PERIOD|END_OF_PERIOD/.test(statusName) || /end of\b/.test(detailLower)) {
    if (/1st|first|\bq1\b/.test(detailLower) || period === 1) return 'End of 1st'
    if (/3rd|third|\bq3\b/.test(detailLower) || period === 3) return 'End of 3rd'
    if (/2nd|second|\bq2\b/.test(detailLower) || period === 2) return 'HALFTIME'
    if (/4th|fourth|\bq4\b/.test(detailLower) || period === 4) return 'GAME OVER'
    if (Number.isFinite(period) && period >= 1) {
      if (period === 1) return 'End of 1st'
      if (period === 2) return 'HALFTIME'
      if (period === 3) return 'End of 3rd'
      return 'GAME OVER'
    }
  }

  // Clock at :00 with a known quarter often means the period just ended.
  if (/^(?:0:00|00:00|0\.00)$/.test(clock) && Number.isFinite(period) && period >= 1) {
    if (period === 1) return 'End of 1st'
    if (period === 2) return 'HALFTIME'
    if (period === 3) return 'End of 3rd'
    if (period >= 4) return 'GAME OVER'
  }

  // Detail-only phrases without STATUS_* keys (Rundown).
  if (/end of\s*(the\s*)?(1st|first)/i.test(hay)) return 'End of 1st'
  if (/end of\s*(the\s*)?(3rd|third)/i.test(hay)) return 'End of 3rd'

  return ''
}

/**
 * Field position label … "IU 35" / "NU 37" / "50".
 * Territory is whose half the ball is on (not who has possession).
 * Yard number is always 1–50 (bare "50" at midfield).
 */
export function yardLineLabel(game, live) {
  const normalized = normalizeYardTerritory(live)
  if (!normalized) return ''
  if (normalized.midfield) return '50'
  if (!normalized.side) return String(normalized.yard)
  const abbrev =
    normalized.side === 'home'
      ? String(game?.home?.abbrev || '').trim()
      : String(game?.away?.abbrev || '').trim()
  if (!abbrev) return String(normalized.yard)
  return `${abbrev} ${normalized.yard}`
}

/**
 * Field orientation flips at halftime (teams switch ends).
 * First half / pregame: home endzone on the right.
 * Halftime + 2H + OT: home endzone on the left.
 */
export function isFieldOrientationFlipped(game, live) {
  const period = Number(live?.period)
  if (Number.isFinite(period) && period >= 3) return true
  return fieldCenterBanner(game, live) === 'HALFTIME'
}

/**
 * Attack direction on the 0–100 field axis.
 * First half: home toward left (−1), away toward right (+1).
 * After flip: invert.
 */
export function attackDirection(possessionSide, flipped = false) {
  const base = possessionSide === 'home' ? -1 : 1
  return flipped ? -base : base
}

/**
 * Map live yard fields onto 0–100 field percent.
 * First half: away endzone left → home right. Flipped: home left → away right.
 */
export function fieldPercent(live, opts = {}) {
  const flipped = Boolean(opts.flipped)
  const normalized = normalizeYardTerritory(live)
  if (!normalized) {
    if (live?.possession === 'home') return flipped ? 38 : 62
    if (live?.possession === 'away') return flipped ? 62 : 38
    return null
  }
  if (normalized.midfield) return 50
  let pos
  if (normalized.side === 'home') {
    pos = flipped ? normalized.yard : 100 - normalized.yard
  } else if (normalized.side === 'away') {
    pos = flipped ? 100 - normalized.yard : normalized.yard
  } else {
    return null
  }
  return Math.max(6, Math.min(94, pos))
}

/**
 * Resolve territory + 1–50 yard line.
 * Prefers explicit `yard_side`. Values above 50 are treated as ESPN absolute
 * (0 = home endzone, 100 = away endzone) … scoreboard should already fold
 * yards-to-endzone into 1–50 + side before the client sees them.
 */
export function normalizeYardTerritory(live) {
  if (!live) return null
  let yard = live.yard_line == null ? null : Math.round(Number(live.yard_line))
  if (yard != null && !Number.isFinite(yard)) yard = null
  if (yard == null) return null

  const side = live.yard_side === 'home' || live.yard_side === 'away' ? live.yard_side : null

  if (yard === 50) return { midfield: true, side: null, yard: 50 }

  if (side) {
    const n = yard > 50 ? 100 - yard : yard
    return { midfield: false, side, yard: Math.max(1, Math.min(50, n)) }
  }

  // Safety net for raw ESPN absolute (e.g. 99 → away 1).
  if (yard > 50 && yard <= 100) {
    return { midfield: false, side: 'away', yard: Math.max(1, 100 - yard) }
  }
  if (yard >= 0 && yard < 50 && live.espn_absolute === true) {
    return { midfield: false, side: 'home', yard: Math.max(1, yard) }
  }

  if (yard >= 1 && yard <= 50) return { midfield: false, side: null, yard }
  return null
}

export function formatKickoff(commenceTime) {
  if (!commenceTime) return ''
  const d = new Date(commenceTime)
  if (Number.isNaN(d.getTime())) return ''
  // Local wall time … no timeZoneName (PDT/EST) so it reads as the viewer's clock.
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Football game clock → seconds remaining in the period ("14:32" → 872).
 * Returns null when the string is not a mm:ss / m:ss clock.
 */
export function playClockToSeconds(clock) {
  const m = String(clock || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const mins = Number(m[1])
  const secs = Number(m[2])
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null
  return mins * 60 + secs
}

/** Normalize PBP text for last-play ↔ list dedupe. */
export function normalizePlayDescription(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Chronological compare for football PBP (oldest → newest).
 * Period asc, then clock remaining desc (clocks count down), then stable index.
 */
export function comparePlaysChronological(a, b, aIndex = 0, bIndex = 0) {
  const ap = Number(a?.period)
  const bp = Number(b?.period)
  const aHasP = Number.isFinite(ap) && ap > 0
  const bHasP = Number.isFinite(bp) && bp > 0
  if (aHasP && bHasP && ap !== bp) return ap - bp
  if (aHasP !== bHasP) return aHasP ? -1 : 1

  const ac = playClockToSeconds(a?.clock)
  const bc = playClockToSeconds(b?.clock)
  if (ac != null && bc != null && ac !== bc) return bc - ac
  if ((ac != null) !== (bc != null)) return ac != null ? -1 : 1

  return aIndex - bIndex
}

/** Newest play first for the Hub Plays tab. */
export function sortPlaysNewestFirst(plays) {
  if (!Array.isArray(plays) || plays.length === 0) return []
  const indexed = plays.map((play, index) => ({ play, index }))
  indexed.sort((a, b) => -comparePlaysChronological(a.play, b.play, a.index, b.index))
  return indexed.map((row) => row.play)
}

/**
 * Ensure the live last-play string sits at the top of the Plays list when the
 * PBP feed omitted it (common Rundown ↔ live mismatch). Dedupes on description.
 */
export function mergeLastPlayIntoPlays(plays, lastPlayText, meta = null) {
  const sorted = sortPlaysNewestFirst(plays)
  const last = String(lastPlayText || '').trim()
  if (!last) return sorted
  const norm = normalizePlayDescription(last)
  if (sorted.some((p) => normalizePlayDescription(p?.description) === norm)) {
    return sorted
  }
  return [
    {
      id: 'hub-live-last-play',
      period: meta?.period ?? null,
      clock: String(meta?.clock || '').trim(),
      description: last,
      team: meta?.team === 'home' || meta?.team === 'away'
        ? meta.team
        : meta?.possession === 'home' || meta?.possession === 'away'
          ? meta.possession
          : null,
    },
    ...sorted,
  ]
}

export function kalshiCents(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value) * 100)}¢`
}

/** Compact contract counts for Kalshi volume / OI / book size. */
export function kalshiContracts(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Math.round(Number(value))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** Extract signed yardage from ESPN / Rundown PBP text. */
function extractPlayYards(raw) {
  let m = raw.match(/\bfor\s+(\d+)\s+yards?\s+(?:gain|gained)\b/i)
  if (m) return Number(m[1])
  m = raw.match(/\b(?:gain|gained)\s+of\s+(\d+)\s+yards?\b/i)
  if (m) return Number(m[1])
  m = raw.match(/\bfor\s+(\d+)\s+yds?\s+(?:gain|gained)?\b/i)
  if (m) return Number(m[1])
  m = raw.match(/\bfor\s+-(\d+)\s+yards?\b/i)
  if (m) return -Number(m[1])
  m = raw.match(/\bfor\s+(\d+)\s+yards?\b/i)
  if (m) return Number(m[1])
  m = raw.match(/\b(?:a\s+)?loss\s+of\s+(\d+)\s+yards?\b/i)
  if (m) return -Number(m[1])
  // Short cards: "25 Yd TD Rush", "20-yd touchdown pass"
  m = raw.match(/\b(\d+)\s*-?\s*yds?(?:\s+td|\s+touchdown)?\b/i)
  if (m) return Number(m[1])
  if (/\bfor\s+no\s+gain\b/i.test(raw)) return 0
  return null
}

export function playTextIsTouchdown(text) {
  const lower = String(text || '').toLowerCase()
  return /\btouchdown\b/.test(lower) || /\bfor\s+a\s+td\b/.test(lower) || /\b\d+\s*-?\s*yds?\s+td\b/.test(lower)
}

/**
 * ESPN often appends PAT / clock / review junk after the scoring play
 * ("… TOUCHDOWN, clock 09:39 #15 N.Radicic kick attempt good").
 * Strip that trailer so kick/extra-point filters don't kill TD replays.
 */
function scoringPlayCoreText(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const td = raw.match(/\btouchdown\b/i)
  if (td && td.index != null) {
    return `${raw.slice(0, td.index)}TOUCHDOWN`.trim()
  }
  const forTd = raw.match(/\bfor\s+a\s+td\b/i)
  if (forTd && forTd.index != null) {
    return `${raw.slice(0, forTd.index)}for a TD`.trim()
  }
  return raw
}

const PLAYER_NAME_TOKEN =
  '(?:#?\\d+\\s+)?[A-Za-z][A-Za-z.\'’-]*(?:\\s+[A-Za-z][A-Za-z.\'’-]*){0,3}'

/** ESPN rush lanes without an explicit "rush/run" verb. */
const ESPN_RUSH_LANE =
  /\b(?:left|right)\s+(?:end|tackle|guard)\b|\bup the middle\b|\b(?:left|right)\s+middle\b/i

const FORMATION_SKIP =
  /^(?:shotgun|no huddle|no[\s-]huddle|pistol|wildcat|empty|trips|bunch)$/i

/**
 * Parse ESPN / Rundown rush / scramble play text.
 * Covers explicit "rushed/run/scramble" and ESPN lane verbs
 * ("left end", "up the middle", "right tackle").
 * Positive-yard gains and rushing TDs are replayable.
 * @returns {{ yards: number, playerHint: string, isTouchdown: boolean } | null}
 */
export function parseRushPlay(text) {
  const rawFull = String(text || '').trim()
  if (!rawFull) return null
  const raw = scoringPlayCoreText(rawFull)
  const lower = raw.toLowerCase()
  if (/\bpass(?:ed|es|ing)?\b/.test(lower) && !/\bscrambl/.test(lower)) return null
  if (/\bsack(?:ed|s)?\b/.test(lower)) return null
  // Kickoff / FG only … do not reject PAT trailers (already stripped) or "kick attempt".
  if (/\bkickoff\b/.test(lower)) return null
  if (/\bkicked\b/.test(lower)) return null
  if (/\bpunt(?:ed|s|ing)?\b/.test(lower)) return null
  if (/\bpenalty\b/.test(lower)) return null
  if (/\btimeout\b/.test(lower)) return null
  if (/\bfield\s+goal\b/.test(lower)) return null
  if (/\bextra\s+point\b/.test(lower)) return null

  const isTouchdown = playTextIsTouchdown(raw)
  const explicitRush =
    /\brush(?:ed|es|ing)?\b/.test(lower) ||
    /\brun(?:s|ning)?\b/.test(lower) ||
    /\bscrambl(?:e|es|ed|ing)\b/.test(lower) ||
    /\b\d+\s*-?\s*yds?\s+td\s+rush\b/.test(lower)
  const espnLaneRush = ESPN_RUSH_LANE.test(lower)
  if (!explicitRush && !espnLaneRush) return null

  let yards = extractPlayYards(raw)
  // TD with no explicit yards still replays (spots resolver aims at the endzone).
  if (yards == null && isTouchdown) yards = 0
  if (yards == null || !Number.isFinite(yards)) return null
  if (!isTouchdown && yards < 1) return null

  let playerHint = ''
  const cleaned = raw
    .replace(/^(?:\([^)]*\)\s*)+/g, '')
    .replace(/^(?:no[\s-]?huddle(?:,\s*)?)*(?:shotgun|pistol|wildcat)?\s*/i, '')
    .trim()
  const nameMatch = cleaned.match(
    new RegExp(
      `^((?:#?\\d+\\s+)?[A-Za-z][A-Za-z.'’-]*(?:\\s+[A-Za-z][A-Za-z.'’-]*){0,3}?)\\s+(?:rush(?:ed|es|ing)?|run(?:s|ning)?|scrambl(?:e|es|ed|ing)|left|right|up the)\\b`,
      'i',
    ),
  )
  if (nameMatch) {
    const hint = nameMatch[1].trim()
    const parts = hint.split(/\s+/)
    while (parts.length && FORMATION_SKIP.test(parts[0])) parts.shift()
    playerHint = parts.join(' ').trim()
  }

  return { yards, playerHint, isTouchdown }
}

/**
 * Parse ESPN / Rundown completed pass play text.
 * Player hint is the receiver (catcher), not the QB.
 * Handles "pass complete to X" and ESPN "pass short right to X … for N yards".
 * Incomplete / INT / sack / no-play penalties are excluded.
 * @returns {{ yards: number, playerHint: string, isTouchdown: boolean } | null}
 */
export function parsePassPlay(text) {
  const rawFull = String(text || '').trim()
  if (!rawFull) return null
  const raw = scoringPlayCoreText(rawFull)
  const lower = raw.toLowerCase()
  if (!/\bpass(?:ed|es|ing)?\b/.test(lower) && !/\b\d+\s*-?\s*yds?\s+td\s+pass\b/.test(lower)) {
    return null
  }
  if (/\bincomplete\b/.test(lower)) return null
  if (/\bintercept(?:ed|ion|s)?\b/.test(lower)) return null
  if (/\bsack(?:ed|s)?\b/.test(lower)) return null
  if (/\bpenalty\b/.test(lower) && /\bno\s+play\b/.test(lower)) return null
  const isTouchdown = playTextIsTouchdown(raw)
  // "pass short/deep left/right/middle to Name" or "pass complete to Name"
  const looksComplete =
    /\bcomplete(?:d)?\b/.test(lower) ||
    /\bpass(?:ed|es|ing)?(?:\s+\w+){0,5}\s+to\b/.test(lower) ||
    /\b\d+\s*-?\s*yds?\s+td\s+pass\b/.test(lower) ||
    (isTouchdown && /\bpass(?:ed|es|ing)?\b/.test(lower))
  if (!looksComplete) return null

  let yards = extractPlayYards(raw)
  if (yards == null && isTouchdown) yards = 0
  if (yards == null || !Number.isFinite(yards)) return null
  if (!isTouchdown && yards < 1) return null

  let playerHint = ''
  const toMatch = raw.match(
    new RegExp(
      `\\b(?:complete(?:d)?\\s+to|pass(?:ed|es|ing)?(?:\\s+(?:short|deep|left|right|middle))+\\s+to|pass(?:ed|es|ing)?\\s+to)\\s+((?:#?\\d+\\s+)?[A-Za-z][A-Za-z.'’-]*(?:\\s+[A-Za-z][A-Za-z.'’-]*){0,3}?)(?=\\s+(?:to|for|ran|pushed)\\b|\\s*$|,)`,
      'i',
    ),
  )
  if (toMatch) playerHint = toMatch[1].trim()

  return { yards, playerHint, isTouchdown }
}

/** True when a PBP row is a completed pass or a run for a gain / TD (field replay). */
export function isFieldReplayablePlay(text) {
  return Boolean(parseRushPlay(text) || parsePassPlay(text))
}

/**
 * Map a territory label ("NW", "IU", "IND") onto home/away for this game.
 * @returns {'home'|'away'|null}
 */
function matchTerritorySide(token, game) {
  const raw = String(token || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!raw) return null

  const scoreSide = (side) => {
    if (!side) return 0
    const abbrev = String(side.abbrev || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    const mascot = String(side.mascot || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    const name = String(side.name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    let score = 0
    if (abbrev && (raw === abbrev || abbrev.startsWith(raw) || raw.startsWith(abbrev))) score += 3
    if (mascot && (raw === mascot || mascot.startsWith(raw))) score += 2
    if (name && name.includes(raw) && raw.length >= 2) score += 1
    // CFB PBP often prints NW while the slate abbrev is NU.
    if (raw === 'NW' && (abbrev === 'NU' || mascot.includes('WILDCAT') || name.includes('NORTHWESTERN'))) {
      score += 3
    }
    if (raw === 'NU' && abbrev === 'NW') score += 3
    return score
  }

  const away = scoreSide(game?.away)
  const home = scoreSide(game?.home)
  if (away <= 0 && home <= 0) return null
  if (away === home) return null
  return away > home ? 'away' : 'home'
}

/**
 * Convert side + 1–50 yard line into 0–100 field percent.
 * First half: away left → home right. Flipped: home left → away right.
 */
function territoryToFieldPercent(side, yard, flipped = false) {
  const y = Math.max(0, Math.min(50, Math.round(Number(yard))))
  if (side === 'home') return Math.max(0, Math.min(100, flipped ? y : 100 - y))
  if (side === 'away') return Math.max(0, Math.min(100, flipped ? 100 - y : y))
  return null
}

/**
 * Parse "to the NW 05" / "to the 50" / "to the End Zone" into a field percent.
 * @returns {number|null}
 */
export function parsePlayEndFieldPercent(text, game, attackDir = 1, flipped = false) {
  const raw = String(text || '')
  if (!raw) return null

  if (/\bto(?:\s+the)?\s+(?:50|midfield)\b/i.test(raw)) return 50

  const m = raw.match(/\bto(?:\s+the)?\s+([A-Za-z]{2,5})\s*(\d{1,2})\b/i)
  if (m) {
    const side = matchTerritorySide(m[1], game)
    const yard = Number(m[2])
    if (side && Number.isFinite(yard)) return territoryToFieldPercent(side, yard, flipped)
  }

  if (/\bto(?:\s+the)?\s+end\s*zones?\b/i.test(raw) || playTextIsTouchdown(raw)) {
    return attackDir < 0 ? 0 : 100
  }

  return null
}

/**
 * Resolve start/end field percents for a rush/catch animation.
 * Prefer PBP "to the NW 05" (and yards) over the live LOS whenever both parse …
 * live LOS is often already the *next* play's spot on historical taps.
 *
 * @returns {{ startPct: number, endPct: number, fromText: boolean }}
 */
export function resolvePlayAnimationPercents({
  text,
  yards,
  game,
  possessionSide,
  livePos,
  preferTextSpots = false,
  isTouchdown = false,
  flipped = false,
} = {}) {
  const attackDir = attackDirection(possessionSide, flipped)
  const yd = Number(yards)
  const hasYards = Number.isFinite(yd) && yd > 0
  const textEnd = parsePlayEndFieldPercent(text, game, attackDir, flipped)

  let endPct = null
  let startPct = null
  let fromText = false

  // Text spots win whenever we can resolve an end yardline + positive yards.
  if (textEnd != null && hasYards) {
    endPct = textEnd
    startPct = endPct - attackDir * yd
    fromText = true
  } else if ((preferTextSpots || isTouchdown) && textEnd != null) {
    endPct = textEnd
    fromText = true
    if (hasYards) {
      startPct = endPct - attackDir * yd
    } else if (isTouchdown) {
      startPct = attackDir > 0 ? Math.max(0, endPct - 25) : Math.min(100, endPct + 25)
    }
  }

  if (endPct == null && livePos != null && Number.isFinite(Number(livePos))) {
    endPct = Number(livePos)
  }
  if (startPct == null && endPct != null && hasYards) {
    startPct = endPct - attackDir * yd
  }
  if (startPct == null && endPct != null) {
    startPct = endPct
  }
  if (endPct == null) {
    endPct = 50
    startPct = 50
  }

  startPct = Math.max(0, Math.min(100, startPct))
  endPct = Math.max(0, Math.min(100, endPct))
  return { startPct, endPct, fromText }
}

function normalizePlayerToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#.’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Match a rush ballcarrier hint against hub roster rows.
 * Prefers possession-side `team` abbrev when provided.
 * @returns {object | null} player row with headshot_url preferred
 */
export function matchRushPlayer(hint, players, sideAbbrev = '') {
  const list = Array.isArray(players) ? players : []
  if (!list.length || !hint) return null
  const raw = String(hint).trim()
  const side = String(sideAbbrev || '')
    .trim()
    .toUpperCase()

  let jersey = null
  let namePart = raw
  const jMatch = raw.match(/^#?(\d+)\s+(.+)$/)
  if (jMatch) {
    jersey = jMatch[1]
    namePart = jMatch[2].trim()
  }

  const hintNorm = normalizePlayerToken(namePart)
  const hintParts = hintNorm.split(' ').filter(Boolean)
  const hintLast = hintParts.length ? hintParts[hintParts.length - 1] : ''

  const scored = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const pName = normalizePlayerToken(p.name || p.full_name || '')
    if (!pName) continue
    const pParts = pName.split(' ').filter(Boolean)
    const pLast = pParts.length ? pParts[pParts.length - 1] : ''
    const pJersey = p.jersey != null ? String(p.jersey) : ''
    const pTeam = String(p.team || p.team_abbrev || '')
      .trim()
      .toUpperCase()

    let score = 0
    if (hintNorm && pName === hintNorm) score += 100
    else if (hintNorm && pName.includes(hintNorm)) score += 70
    else if (hintLast && pLast === hintLast) score += 50
    else if (hintLast && pName.includes(hintLast)) score += 30
    else continue

    if (jersey && pJersey && jersey === pJersey) score += 40
    if (side && pTeam && side === pTeam) score += 25
    if (p.headshot_url) score += 5
    scored.push({ p, score })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  return scored[0].p
}
