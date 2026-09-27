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
  // Same call as the field banner … never "2nd 0:00" at the break.
  if (fieldCenterBanner(game, live) === 'HALFTIME') return 'Halftime'
  const period = live?.period != null ? ordinal(live.period) : ''
  const clock = String(live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  if (clock) return clock
  if (period) return period
  return game.status_label || 'Live'
}

function clockSeconds(clock) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Most advanced period + clock across the hub's ESPN reads … the game detail poll, the slate row
 * (`game.live` / "Q3 10:33" `status_label`) and the newest PBP "(mm:ss)" snap stamps. Each can lag on its own
 * (Q3 stuck at 15:00 while plays run), so take whichever is furthest into the game.
 * @returns {object|null} `live` with `period` / `clock` replaced when a fresher pair exists
 */
export function withFreshestLiveClock(live, game, plays) {
  if (game?.status !== 'in') return live
  // A period break freezes the board on the period that just ended … a slate row already showing
  // "Q2 15:00" would otherwise turn End of 1st into HALFTIME for a poll.
  if (/END_PERIOD|END_OF_PERIOD|HALFTIME/.test(String(live?.status_name || '').toUpperCase())) return live
  const cands = []
  const push = (period, clock) => {
    const p = Number(period)
    const s = clockSeconds(clock)
    if (Number.isFinite(p) && p >= 1 && s != null) cands.push({ p, s, clock: String(clock).trim() })
  }
  push(live?.period, live?.clock)
  push(game?.live?.period, game?.live?.clock)
  const label = /^Q(\d)\s+(\d{1,2}:\d{2})$/.exec(String(game?.status_label || '').trim())
  if (label) push(label[1], label[2])
  for (const row of Array.isArray(plays) ? plays : []) {
    const stamp = /^\s*\((\d{1,2}:\d{2})\)/.exec(String(row?.description || ''))?.[1]
    if (stamp) push(row.period, stamp)
  }
  const curP = Number(live?.period)
  const curS = clockSeconds(live?.clock)
  // Halftime / end-of-period boards carry no running clock … leave those alone.
  if (!cands.length || !Number.isFinite(curP) || curS == null) return live
  // A later quarter needs a PBP row in it … a slate row alone can run ahead and flip the field early.
  let rowP = curP
  for (const row of Array.isArray(plays) ? plays : []) {
    const rp = Number(row?.period)
    if (Number.isFinite(rp) && rp > rowP) rowP = rp
  }
  const allowed = cands.filter((c) => c.p <= rowP)
  if (!allowed.length) return live
  const best = allowed.reduce((a, b) => (b.p > a.p || (b.p === a.p && b.s < a.s) ? b : a))
  if (best.p < curP || (best.p === curP && best.s >= curS)) return live
  return { ...live, period: best.p, clock: best.clock }
}

/** Drop trailing zone tokens (PDT, EST, GMT+1, …) from a kickoff label. */
export function stripTimeZoneSuffix(label) {
  const s = String(label || '').trim()
  if (!s) return ''
  return s
    .replace(/\s+(?:[A-Z]{2,5}|GMT[+-]?\d{0,2}|UTC[+-]?\d{0,2})$/i, '')
    .trim()
}

/** Yards from the ball to the offense's goal line, or null when possession / territory is unknown. */
function yardsToGoal(live) {
  const t = normalizeYardTerritory(live)
  if (!t) return null
  if (t.midfield) return 50
  const poss = live?.possession
  if (!t.side || (poss !== 'home' && poss !== 'away')) return null
  return t.side === poss ? 100 - t.yard : t.yard
}

export function downDistanceLabel(live) {
  if (!live) return ''
  const down = live.down != null ? ordinal(live.down) : ''
  const dist = live.distance != null && Number.isFinite(Number(live.distance)) ? String(live.distance) : ''
  // Line to gain at or past the goal line … no first down without a flag, so it's "& Goal".
  const toGoal = yardsToGoal(live)
  if (down && dist && toGoal != null && Number(dist) >= toGoal) return `${down} & Goal`
  if (down && dist) return `${down} & ${dist}`
  if (down) return down
  return ''
}

/**
 * Last snap at 0:00 that leaves the period open: a TD whose try hasn't posted, an accepted penalty
 * ("No Play" … untimed down), or a replay review.
 */
function periodEndPending(lastPlay) {
  const t = String(lastPlay || '').toLowerCase()
  if (!t) return false
  if (/\breview|\bchalleng|\bno play\b/.test(t)) return true
  if (/\btouchdown\b/.test(t) && !/\bnullified\b/.test(t)) {
    return !/extra point|\bkick\)|\bkick is\b|two-point|2-pt|\bpat\b|conversion/.test(t)
  }
  return false
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
  const awayN = Number(game.away?.score)
  const homeN = Number(game.home?.score)
  // Tied after the 4th / an OT period … overtime is next, not a final.
  const periodEndBanner = () =>
    Number.isFinite(awayN) && awayN === homeN
      ? (period > 4 ? 'End of OT' : 'End of Regulation')
      : 'GAME OVER'

  // A period break / final outranks a timeout that only lingers in the last play or detail text.
  const statusBreak = /END_PERIOD|END_OF_PERIOD|HALFTIME|FINAL|FULL_TIME/.test(statusName)
  if (
    /STATUS_TIMEOUT|STATUS_TV_TIMEOUT|TIMEOUT/.test(statusName)
    || (!statusBreak && (
      /\btimeout\b/.test(detailLower)
      || /\btimeout\b/.test(clockLower)
      || /\btimeout\b/.test(lastPlay)
    ))
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
    // Ordinals only from an "End of …" phrase … a running label ("Q2 15:00") names the next period.
    const endDetail = /\bend\b/.test(detailLower) ? detailLower : ''
    if (/1st|first|\bq1\b/.test(endDetail) || (!endDetail && period === 1)) return 'End of 1st'
    if (/3rd|third|\bq3\b/.test(endDetail) || (!endDetail && period === 3)) return 'End of 3rd'
    if (/2nd|second|\bq2\b/.test(endDetail) || (!endDetail && period === 2)) return 'HALFTIME'
    if (/4th|fourth|\bq4\b/.test(endDetail) || (!endDetail && period === 4)) return periodEndBanner()
    if (Number.isFinite(period) && period >= 1) {
      if (period === 1) return 'End of 1st'
      if (period === 2) return 'HALFTIME'
      if (period === 3) return 'End of 3rd'
      return periodEndBanner()
    }
  }

  // Clock at :00 with a known quarter often means the period just ended … unless the last snap left a try,
  // an untimed down or a review to play.
  if (
    /^(?:0:00|00:00|0\.00)$/.test(clock)
    && Number.isFinite(period)
    && period >= 1
    && !periodEndPending(live?.last_play)
  ) {
    if (period === 1) return 'End of 1st'
    if (period === 2) return 'HALFTIME'
    if (period === 3) return 'End of 3rd'
    if (period >= 4) return periodEndBanner()
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
 * Each team defends its own painted end zone all game (away left, home right): home always attacks left,
 * away right. No feed says which physical end a team defends (ESPN spots are team-relative, the toss /
 * halftime choice isn't published), so mirroring the real quarter-by-quarter switch was a guess.
 */
export function periodFieldFlipped(_period) {
  return false
}

export function isFieldOrientationFlipped(game, live) {
  return periodFieldFlipped(live?.period)
}

/**
 * Attack direction on the 0–100 field axis.
 * Q1 / Q3: home toward left (−1), away toward right (+1).
 * Q2 / Q4 (flipped): invert.
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

/** True when two PBP blurbs are the same play (exact or one is a prefix/suffix of the other). */
export function playDescriptionsMatch(a, b) {
  const na = normalizePlayDescription(a)
  const nb = normalizePlayDescription(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Live last_play often strips the leading "(12:05) " clock ESPN puts on drive plays.
  const stripClock = (s) => s.replace(/^\(\d{1,2}:\d{2}\)\s+/, '')
  const ca = stripClock(na)
  const cb = stripClock(nb)
  if (ca === cb) return true
  if (ca.length >= 24 && cb.length >= 24 && (ca.includes(cb) || cb.includes(ca))) return true
  return false
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
 * Running score from the newest scoring PBP row (`home_score` / `away_score` from the Edge).
 * @returns {{ id: string, home: number, away: number } | null}
 */
export function latestPlayScore(plays) {
  for (const row of sortPlaysNewestFirst(plays)) {
    const home = Number(row?.home_score)
    const away = Number(row?.away_score)
    if (row?.home_score != null && row?.away_score != null && Number.isFinite(home) && Number.isFinite(away)) {
      return { id: String(row.id || `${home}-${away}`), home, away }
    }
  }
  return null
}

function hasYardSpot(spot) {
  return spot != null && Number.isFinite(Number(spot.yard_line))
}

/**
 * LOS for one play from the feed rows: its own `start_spot`, else the `end_spot` of the nearest
 * earlier row that has one (penalty rows move the ball; timeouts / quarter ends carry no spot).
 * `play` is matched by reference first, then newest row with the same text. When the text is not
 * in the list yet (live last_play ahead of the PBP poll), the newest row's end is the LOS.
 * @returns {{ yard_line: number, yard_side: 'home'|'away'|null } | null}
 */
export function resolvePlayStartSpot(plays, { play = null, text = '' } = {}) {
  const newestFirst = sortPlaysNewestFirst(plays)
  if (!newestFirst.length) return null
  const needle = String(text || play?.description || '').trim()
  let idx = play ? newestFirst.indexOf(play) : -1
  if (idx < 0 && needle) idx = newestFirst.findIndex((p) => String(p?.description || '').trim() === needle)
  if (idx >= 0 && hasYardSpot(newestFirst[idx]?.start_spot)) return newestFirst[idx].start_spot
  for (let i = idx >= 0 ? idx + 1 : 0; i < newestFirst.length; i += 1) {
    if (hasYardSpot(newestFirst[i]?.end_spot)) return newestFirst[i].end_spot
  }
  return null
}

/** Drop adjacent/list dupes that share description (or play id). */
export function dedupePlaysByDescription(plays) {
  if (!Array.isArray(plays) || plays.length === 0) return []
  const out = []
  const seenIds = new Set()
  for (const play of plays) {
    const id = String(play?.id || '').trim()
    if (id && id !== 'hub-live-last-play') {
      if (seenIds.has(id)) continue
      seenIds.add(id)
    }
    const desc = play?.description
    if (out.some((p) => playDescriptionsMatch(p?.description, desc))) continue
    out.push(play)
  }
  return out
}

/**
 * Ensure the live last-play string sits at the top of the Plays list when the
 * PBP feed omitted it (common Rundown ↔ live mismatch). Dedupes on description.
 */
export function mergeLastPlayIntoPlays(plays, lastPlayText, meta = null) {
  const sorted = dedupePlaysByDescription(sortPlaysNewestFirst(plays))
  const last = String(lastPlayText || '').trim()
  if (!last) return sorted
  if (sorted.some((p) => playDescriptionsMatch(p?.description, last))) {
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
  // "… TOUCHDOWN nullified by penalty … NO PLAY" … the drive goes on.
  if (/\btouchdown\s+(?:is\s+|was\s+)?(?:nullified|negated|reversed|overturned|called\s+back|wiped\s+out)\b/.test(lower)) return false
  return /\btouchdown\b/.test(lower) || /\bfor\s+a\s+td\b/.test(lower) || /\b\d+\s*-?\s*yds?\s+td\b/.test(lower)
}

/**
 * TD or its try (PAT / two-point). ESPN parks the spot on the try line (CFB 3, NFL 15),
 * so the field should show no LOS/ball until the kickoff play lands.
 */
export function playTextIsScoreTry(text) {
  const lower = String(text || '').toLowerCase()
  if (!lower) return false
  if (playTextIsTouchdown(lower)) return true
  if (/\bkickoff\b/.test(lower)) return false
  // Missed FG leaves a live spot … only PAT-style kicks count here.
  if (/\bfield\s+goal\b|\bfg\b/.test(lower)) return false
  return (
    /\bextra\s+point\b/.test(lower) ||
    /\bkick\s+attempt\b/.test(lower) ||
    /\bpat\b/.test(lower) ||
    /\btwo[-\s]point\b/.test(lower) ||
    /\b2[-\s]?pt\b/.test(lower)
  )
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

const RUSH_LANE_DEPTH = { end: 1, tackle: 0.65, guard: 0.35 }

/**
 * Called side of a snap from the offense's view: -1 left … 1 right, 0 middle / unstated.
 * NFL lanes ("left end", "right guard", "up the middle"), CFB "rush left", pass "short right" / "deep left".
 */
function playLateralFromText(raw, kind) {
  const s = String(raw || '').toLowerCase()
  const sign = (side) => (side === 'left' ? -1 : side === 'right' ? 1 : 0)
  if (kind === 'pass') {
    const m = /\bpass(?:\s+complete(?:d)?)?\s+(short|deep)\s+(left|right|middle)\b/.exec(s)
    return m ? sign(m[2]) * (m[1] === 'deep' ? 1 : 0.75) : 0
  }
  const lane = /\b(left|right)\s+(end|tackle|guard)\b/.exec(s)
  if (lane) return sign(lane[1]) * RUSH_LANE_DEPTH[lane[2]]
  const cfb = /\b(?:rush(?:ed|es)?|runs?|scrambl(?:e|es|ed))\s+(left|right|middle)\b/.exec(s)
  return cfb ? sign(cfb[1]) * 0.8 : 0
}

const FORMATION_SKIP =
  /^(?:shotgun|no huddle|no[\s-]huddle|pistol|wildcat|empty|trips|bunch)$/i

/**
 * Strip clock parens + formation tags so the ballcarrier/QB starts the string.
 * Handles "No Huddle-Shotgun", "No Huddle, Shotgun", bare "Shotgun", etc.
 */
function stripPlayFormationPrefix(raw) {
  let s = String(raw || '')
    .replace(/^(?:\([^)]*\)\s*)+/g, '')
    .trim()
  // Repeat: ESPN sometimes stacks "No Huddle-Shotgun" as one token with hyphens/commas.
  for (let i = 0; i < 4; i += 1) {
    const next = s
      .replace(
        /^(?:no[\s-]?huddle|shotgun|pistol|wildcat)(?:[\s,-]+(?:no[\s-]?huddle|shotgun|pistol|wildcat))*[\s,-]*/i,
        '',
      )
      .trim()
    if (next === s) break
    s = next
  }
  return s
}

/** "#80 C.Becker" / "C.Becker" / "Beebe" → jersey digits + remaining name text. */
export function splitPlayerHint(raw) {
  const s = String(raw || '').trim()
  if (!s) return { jersey: null, namePart: '' }
  const m = s.match(/^#?(\d{1,2})\s+(.+)$/)
  if (m) return { jersey: m[1], namePart: m[2].trim() }
  return { jersey: null, namePart: s }
}

/**
 * Jersey for the field figure: roster match wins, else `#N` from PBP text.
 * Treats jersey `0` as valid.
 */
export function resolveFigureJersey(parsed, matched) {
  const roster = matched?.jersey
  if (roster != null && String(roster).trim() !== '') return String(roster).trim()
  const fromText = parsed?.jerseyHint
  if (fromText != null && String(fromText).trim() !== '') return String(fromText).trim()
  return ''
}

/**
 * Parse ESPN / Rundown rush / scramble play text.
 * Covers explicit "rushed/run/scramble" and ESPN lane verbs
 * ("left end", "up the middle", "right tackle").
 * Positive-yard gains and rushing TDs are replayable.
 * @returns {{ yards: number, playerHint: string, jerseyHint: string|null, isTouchdown: boolean, lateral: number } | null}
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
  const cleaned = stripPlayFormationPrefix(raw)
  const nameMatch = cleaned.match(
    new RegExp(
      `^((?:#?\\d{1,2}\\s+)?[A-Za-z][A-Za-z.'’-]*(?:\\s+[A-Za-z][A-Za-z.'’-]*){0,3}?)\\s+(?:rush(?:ed|es|ing)?|run(?:s|ning)?|scrambl(?:e|es|ed|ing)|left|right|up the)\\b`,
      'i',
    ),
  )
  if (nameMatch) {
    const hint = nameMatch[1].trim()
    const parts = hint.split(/\s+/)
    while (parts.length && FORMATION_SKIP.test(parts[0])) parts.shift()
    playerHint = parts.join(' ').trim()
  }
  // Fallback: "#5 S.Brown rush …" buried after a formation we didn't strip.
  if (!playerHint) {
    const buried = cleaned.match(
      /#(\d{1,2})\s+([A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2})\s+(?:rush(?:ed|es|ing)?|run(?:s|ning)?|scrambl(?:e|es|ed|ing)|left|right|up the)\b/i,
    )
    if (buried) playerHint = `#${buried[1]} ${buried[2]}`.trim()
  }

  const { jersey: jerseyHint } = splitPlayerHint(playerHint)
  return { yards, playerHint, jerseyHint, isTouchdown, lateral: playLateralFromText(raw, 'rush') }
}

/**
 * Parse ESPN / Rundown completed pass play text.
 * Player hint is the receiver (catcher), not the QB.
 * Handles "pass complete to X" and ESPN "pass short right to X … for N yards".
 * Incomplete / INT / sack / no-play penalties are excluded.
 * @returns {{ yards: number, playerHint: string, jerseyHint: string|null, isTouchdown: boolean, lateral: number } | null}
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

  let playerHint = extractPassReceiverHint(raw)
  const { jersey: jerseyHint } = splitPlayerHint(playerHint)
  return { yards, playerHint, jerseyHint, isTouchdown, lateral: playLateralFromText(raw, 'pass') }
}

/**
 * Thrower on a pass / interception row: "(Shotgun) P.Mahomes pass short right to …", "#11 C.Ward pass complete
 * to …", scoring card "X.Restrepo 12 Yd pass from Cam Ward (…)".
 * @returns {string} player hint ('' when the row doesn't name one)
 */
export function parsePasserHint(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const from = raw.match(
    /\bpass\s+from\s+((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}?)(?=\s*[(,.]|\s+for\b|$)/i,
  )
  if (from) return from[1].trim()
  const cleaned = stripPlayFormationPrefix(raw)
  const lead = cleaned.match(
    /^((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,3}?)\s+pass(?:es|ed)?\b/i,
  )
  if (!lead) return ''
  const parts = lead[1].trim().split(/\s+/)
  while (parts.length && FORMATION_SKIP.test(parts[0])) parts.shift()
  return parts.join(' ').trim()
}

/** Tokens that are never part of a player name in PBP. */
const PLAYER_NAME_STOP = new Set([
  'to',
  'for',
  'at',
  'the',
  'caught',
  'ran',
  'pushed',
  'out',
  'of',
  'bounds',
  'touchdown',
  'yd',
  'yds',
  'yard',
  'yards',
])

/**
 * Receiver after "… to #4 K.Davis" / "to C.Becker" / "to A.St. Brown".
 * Stops at ESPN trailers: caught at / for / to the / to DET 12 / tackler parens.
 */
function extractPassReceiverHint(raw) {
  const s = String(raw || '')
  if (!s) return ''
  const lead =
    s.match(
      /\b(?:complete(?:d)?|pass(?:ed|es|ing)?)\b(?:\s+(?:short|deep|left|right|middle|complete(?:d)?))*\s+to\s+(?!the\b)/i,
    ) || s.match(/\bto\s+(?!the\b)/i)
  if (!lead || lead.index == null) return ''
  const rest = s.slice(lead.index + lead[0].length)
  // NFL often writes "to A.St. Brown to DET 12 for 22 yards" (no "the" before team).
  const stop = rest.search(
    /\s+(?:caught|for|to the|to\s+[A-Za-z]{2,5}\b|ran|pushed|out of bounds|touchdown|yds?\b|yards?\b)\b|\s*\(|,/i,
  )
  const chunk = (stop >= 0 ? rest.slice(0, stop) : rest).trim()
  const name = chunk.match(
    /^((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,3})/,
  )
  if (!name) return ''
  const parts = name[1].trim().split(/\s+/).filter(Boolean)
  while (parts.length && PLAYER_NAME_STOP.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop()
  }
  while (parts.length && PLAYER_NAME_STOP.has(parts[0].toLowerCase())) {
    parts.shift()
  }
  return parts.join(' ').trim()
}

/**
 * Interception returned for a TD (pick-six). ESPN CFB: "pass intercepted by #6 R.Morgan at USC23
 * #6 R.Morgan return 23 yards to the USC00 TOUCHDOWN"; NFL: "INTERCEPTED by B.Baker at KC 38.
 * B.Baker for 38 yards, TOUCHDOWN"; scoring card: "Kobe King 44 Yd Interception Return".
 * Non-scoring picks: `parseInterceptionPlay`.
 * @returns {{ returnYards: number|null, playerHint: string, jerseyHint: string|null, isTouchdown: true } | null}
 */
export function parseInterceptionReturn(text) {
  const rawFull = String(text || '').trim()
  if (!rawFull) return null
  const raw = scoringPlayCoreText(rawFull)
  const lower = raw.toLowerCase()
  const at = lower.search(/\bintercept(?:ed|ion|s)?\b/)
  if (at < 0) return null
  if (/\bno\s+play\b/.test(lower)) return null
  const scoringCard = raw.match(/\b(\d+)\s*-?\s*yds?\s+interception\s+return\b/i)
  if (!playTextIsTouchdown(raw) && !scoringCard) return null

  const after = raw.slice(at)
  let returnYards = null
  const ret =
    after.match(/\breturn(?:s|ed)?\s+(?:for\s+)?(\d+)\s+(?:yards?|yds?)\b/i) ||
    after.match(/\bfor\s+(\d+)\s+(?:yards?|yds?)\b/i) ||
    scoringCard
  if (ret) returnYards = Number(ret[1])

  let playerHint = ''
  const by = after.match(
    /\bintercept(?:ed|ion)?\s+by\s+((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}?)(?=\s+(?:at|return|returns|returned|for|to|ran|runs|pushed)\b|\s*[,.(]|$)/i,
  )
  if (by) playerHint = by[1].trim()
  else if (scoringCard) {
    const lead = stripPlayFormationPrefix(raw).match(
      /^((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}?)\s+\d+\s*-?\s*yds?\s+interception/i,
    )
    if (lead) playerHint = lead[1].trim()
  }
  const { jersey: jerseyHint } = splitPlayerHint(playerHint)
  return { returnYards, playerHint, jerseyHint, isTouchdown: true }
}

/**
 * Non-scoring interception. ESPN CFB: "pass intercepted by #5 S.Harris at FRES31 #5 S.Harris return
 * 8 yards to the FRES39 (#56 N.Bledsoe)" / "… at TTU40, End Of Play" / "… at OSU00, Touchback";
 * NFL: "INTERCEPTED by B.Baker at KC 38. B.Baker to KC 20 for 18 yards (T.Kelce)." Pick-sixes and
 * NO PLAY rows return null (see `parseInterceptionReturn`). The hero places the pick from the row's
 * end spot minus the return, so the "at" spot's school codes don't have to resolve.
 * @returns {{ returnYards: number, playerHint: string, jerseyHint: string|null, touchback: boolean, isTouchdown: false } | null}
 */
export function parseInterceptionPlay(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  const at = lower.search(/\bintercept(?:ed|ion|s)?\b/)
  if (at < 0) return null
  if (/\bno\s+play\b/.test(lower) || playTextIsTouchdown(raw) || parseInterceptionReturn(raw)) return null
  const after = raw.slice(at)
  const touchback = /\btouchback\b/i.test(after)
  let returnYards = 0
  if (!touchback) {
    const ret =
      after.match(/\breturn(?:s|ed)?\s+(?:for\s+)?(-?\d+)\s+(?:yards?|yds?)\b/i) ||
      after.match(/\bfor\s+(-?\d+)\s+(?:yards?|yds?)\b/i)
    if (ret) returnYards = Number(ret[1]) || 0
  }
  let playerHint = ''
  const by = after.match(
    /\bintercept(?:ed|ion)?\s+by\s+((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}?)(?=\s+(?:at|return|returns|returned|for|to|ran|runs|pushed)\b|\s*[,.(]|$)/i,
  )
  if (by) playerHint = by[1].trim()
  const { jersey: jerseyHint } = splitPlayerHint(playerHint)
  return { returnYards, playerHint, jerseyHint, touchback, isTouchdown: false }
}

const CFB_KICKOFF = /\bkickoff\s+(?:for\s+)?(-?\d+)\s+(?:yds?|yards?)\b(?:\s+to\s+the\s+([A-Za-z]{2,8})\s*(\d{1,2})\b)?/i
const NFL_KICKOFF = /\bkicks\s+(-?\d+)\s+yards?\s+from\s+([A-Za-z]{2,5})\s+(\d{1,2})\b/i

/**
 * Kickoff touchback. ESPN CFB: "#33 A.Birr kickoff 65 yards to the STAN00, Touchback";
 * NFL: "H.Butker kicks 65 yards from KC 35 to end zone, Touchback."
 * @returns {{ kickYards: number|null, kickFromAbbrev: string|null, kickFromYard: number|null, landAbbrev: string|null } | null}
 */
export function parseKickoffTouchback(text) {
  const raw = String(text || '').trim()
  if (!raw || !/\btouchback\b/i.test(raw) || /\bno\s+play\b/i.test(raw)) return null
  const nfl = raw.match(NFL_KICKOFF)
  if (nfl) {
    return { kickYards: Number(nfl[1]), kickFromAbbrev: nfl[2].toUpperCase(), kickFromYard: Number(nfl[3]), landAbbrev: null }
  }
  const cfb = raw.match(CFB_KICKOFF)
  if (!cfb) return null
  return { kickYards: Number(cfb[1]), kickFromAbbrev: null, kickFromYard: null, landAbbrev: cfb[2] ? cfb[2].toUpperCase() : null }
}

/**
 * Punt touchback. ESPN CFB: "#43 M.Chiumento punt 54 yards to the TENN00, Touchback";
 * NFL: "T.Townsend punts 60 yards to end zone, Center-M.Cox, Touchback."
 * @returns {{ puntYards: number|null, punt: true } | null}
 */
export function parsePuntTouchback(text) {
  const raw = String(text || '').trim()
  if (!raw || !/\btouchback\b/i.test(raw) || /\bno\s+play\b|\bblocked\b/i.test(raw)) return null
  const m = raw.match(/\bpunts?\s+(?:for\s+)?(-?\d+)\s+(?:yards?|yds?)\b/i)
  if (!m && !/\bpunts?\b/i.test(raw)) return null
  return { puntYards: m ? Number(m[1]) : null, punt: true }
}

const KICK_RETURNER_NAME =
  '((?:#?\\d{1,2}\\s+)?[A-Za-z][A-Za-z.\'’-]*(?:\\s+[A-Za-z][A-Za-z.\'’-]*){0,2}?)'

/**
 * Kickoff that was fielded and returned. NFL: "N.Folk kicks 55 yards from ATL 35 to GB 10.
 * B.Melton to GB 31 for 21 yards (C.Harris)."; ESPN CFB: "#15 L.Cooper kickoff for 65 yds ,
 * #3 X.Smith return to the FLA25" / "… return for 23 yds to the ALA 26". Touchbacks, fair catches,
 * onside kicks, and fumbles/muffs are not replayed. Spots are raw feed abbrevs … the hero maps sides.
 * @returns {{
 *   kickYards: number|null,
 *   kickFromAbbrev: string|null,
 *   kickFromYard: number|null,
 *   landAbbrev: string|null,
 *   landYard: number|null,
 *   returnYards: number|null,
 *   endAbbrev: string|null,
 *   endYard: number|null,
 *   playerHint: string,
 *   jerseyHint: string|null,
 *   isTouchdown: boolean,
 * } | null}
 */
export function parseKickoffReturn(text) {
  const rawFull = String(text || '').trim()
  if (!rawFull) return null
  const raw = scoringPlayCoreText(rawFull)
  const lower = raw.toLowerCase()
  if (/\btouchback\b|\bfair\s+catch\b|\bonside\b|\bfumble[sd]?\b|\bmuff(?:ed|s)?\b|\bno\s+play\b/.test(lower)) {
    return null
  }
  const nfl = raw.match(
    /\bkicks\s+(-?\d+)\s+yards?\s+from\s+([A-Za-z]{2,5})\s+(\d{1,2})\s+to\s+(?:([A-Za-z]{2,5})\s+(-?\d{1,2})|end\s+zone)/i,
  )
  // CFB: "kickoff for 65 yds" (older) or "kickoff 65 yards to the USC00" (current ESPN wording).
  const cfb = nfl ? null : raw.match(CFB_KICKOFF)
  if (!nfl && !cfb) return null

  const out = {
    kickYards: Number(nfl ? nfl[1] : cfb[1]),
    kickFromAbbrev: nfl ? nfl[2].toUpperCase() : null,
    kickFromYard: nfl ? Number(nfl[3]) : null,
    landAbbrev: nfl ? (nfl[4] ? nfl[4].toUpperCase() : null) : cfb[2] ? cfb[2].toUpperCase() : null,
    landYard: nfl ? (nfl[5] != null ? Number(nfl[5]) : 0) : cfb[3] != null ? Number(cfb[3]) : null,
    returnYards: null,
    endAbbrev: null,
    endYard: null,
    playerHint: '',
    jerseyHint: null,
    isTouchdown: playTextIsTouchdown(raw),
  }
  const after = raw.slice((nfl || cfb).index + (nfl || cfb)[0].length)

  if (nfl) {
    const ret = after.match(
      new RegExp(`^[\\s.,]*${KICK_RETURNER_NAME}\\s+(?:to|for|ran|pushed|runs|return(?:s|ed)?)\\b`, 'i'),
    )
    if (ret) out.playerHint = ret[1].trim()
    const yds = after.match(/\bfor\s+(-?\d+)\s+yards?\b/i)
    if (yds) out.returnYards = Number(yds[1])
    else if (/\bfor\s+no\s+gain\b/i.test(after)) out.returnYards = 0
    const end = after.match(/\b(?:to|ob\s+at|at)\s+([A-Za-z]{2,5})\s+(\d{1,2})\b/i)
    if (end) {
      out.endAbbrev = end[1].toUpperCase()
      out.endYard = Number(end[2])
    }
  } else {
    const ret = after.match(new RegExp(`^[\\s.,]*${KICK_RETURNER_NAME}\\s+return(?:s|ed)?\\b`, 'i'))
    if (ret) out.playerHint = ret[1].trim()
    const yds = after.match(/\breturn(?:s|ed)?\s+(?:for\s+)?(-?\d+)\s+(?:yds?|yards?)\b/i)
    if (yds) out.returnYards = Number(yds[1])
    const end = after.match(/\bto\s+the\s+([A-Za-z]{2,8})\s*(\d{1,2})\b/i)
    if (end) {
      out.endAbbrev = end[1].toUpperCase()
      out.endYard = Number(end[2])
    }
  }

  if (!out.playerHint) return null
  if (out.returnYards == null && out.endYard == null && !out.isTouchdown) return null
  out.jerseyHint = splitPlayerHint(out.playerHint).jersey
  return out
}

/**
 * Punt that was fielded (returned or fair caught). ESPN CFB: "#48 E.Jasso punt 42 yards to the TXST30
 * #20 D.Crowe return 21 yards to the UIW49" / "return for loss of 4 yards to the KSU31" / "fair catch
 * by #4 T.Burgess Jr. at TXST27"; NFL: "T.Way punts 51 yards to DAL 9, Center-C.Stephens. K.Turpin to
 * DAL 24 for 15 yards (J.Doe)." Stated punt yards may be gross or net of the return depending on the
 * feed … the hero prefers end spot minus return for the catch. Touchbacks, downed / out-of-bounds
 * punts, blocks, and muffs are not replayed.
 * @returns {{
 *   puntYards: number|null,
 *   landAbbrev: string|null,
 *   landYard: number|null,
 *   returnYards: number|null,
 *   endAbbrev: string|null,
 *   endYard: number|null,
 *   playerHint: string,
 *   jerseyHint: string|null,
 *   isTouchdown: boolean,
 *   fairCatch: boolean,
 * } | null}
 */
export function parsePuntReturn(text) {
  const rawFull = String(text || '').trim()
  if (!rawFull) return null
  const raw = scoringPlayCoreText(rawFull)
  const lower = raw.toLowerCase()
  if (/\btouchback\b|\bblocked\b|\bmuff(?:ed|s)?\b|\bfumble[sd]?\b|\bno\s+play\b/.test(lower)) {
    return null
  }
  const punt = raw.match(
    /\bpunts?\s+(?:(-?\d+)\s+(?:yards?|yds?)\s+)?to\s+(?:the\s+)?(?:([A-Za-z]{2,6})\s*(-?\d{1,2})\b|end\s+zone)/i,
  )
  if (!punt) return null
  const out = {
    puntYards: punt[1] != null ? Number(punt[1]) : null,
    landAbbrev: punt[2] ? punt[2].toUpperCase() : null,
    landYard: punt[3] != null ? Number(punt[3]) : null,
    returnYards: null,
    endAbbrev: null,
    endYard: null,
    playerHint: '',
    jerseyHint: null,
    isTouchdown: playTextIsTouchdown(raw),
    fairCatch: false,
  }
  const after = raw.slice(punt.index + punt[0].length)

  // "fair catch by #4 T.Burgess Jr. at TXST27" / "fair catch by K.Turpin." … caught where it lands.
  const fair = after.match(
    new RegExp(`\\bfair\\s+catch\\s+by\\s+${KICK_RETURNER_NAME}(?=\\s+at\\b|\\s*[,(]|\\.?\\s*$|\\.\\s)`, 'i'),
  )
  if (fair) {
    out.fairCatch = true
    out.isTouchdown = false
    out.playerHint = fair[1].trim().replace(/\.$/, '')
    out.returnYards = 0
    const at = after.match(/\bfair\s+catch\b[^]*?\bat\s+(?:the\s+)?([A-Za-z]{2,6})\s*(\d{1,2})\b/i)
    if (at) {
      out.endAbbrev = at[1].toUpperCase()
      out.endYard = Number(at[2])
    } else {
      out.endAbbrev = out.landAbbrev
      out.endYard = out.landYard
    }
    out.jerseyHint = splitPlayerHint(out.playerHint).jersey
    return out
  }

  const cfb = after.match(new RegExp(`^[\\s,]*${KICK_RETURNER_NAME}\\s+return(?:s|ed)?\\b`, 'i'))
  if (cfb) {
    out.playerHint = cfb[1].trim()
    const tail = after.slice(cfb.index + cfb[0].length)
    const yds = tail.match(/^\s*(?:for\s+)?(?:(loss\s+of\s+)?(\d+)\s+(?:yards?|yds?)|(no\s+gain))/i)
    if (yds) out.returnYards = yds[3] ? 0 : Number(yds[2]) * (yds[1] ? -1 : 1)
    const end = tail.match(/\bto\s+the\s+([A-Za-z]{2,6})\s*(\d{1,2})\b/i)
    if (end) {
      out.endAbbrev = end[1].toUpperCase()
      out.endYard = Number(end[2])
    }
  } else {
    // NFL: returner sentence follows ", Center-X." … anchor on a sentence break.
    const nfl = after.match(
      new RegExp(`\\.\\s+${KICK_RETURNER_NAME}\\s+(?:to|for|ran|pushed|runs)\\b`, 'i'),
    )
    if (!nfl) return null
    out.playerHint = nfl[1].trim()
    const tail = after.slice(nfl.index)
    const yds = tail.match(/\bfor\s+(-?\d+)\s+yards?\b/i)
    if (yds) out.returnYards = Number(yds[1])
    else if (/\bfor\s+no\s+gain\b/i.test(tail)) out.returnYards = 0
    const end = tail.match(/\b(?:to|ob\s+at)\s+([A-Za-z]{2,5})\s+(\d{1,2})\b/i)
    if (end) {
      out.endAbbrev = end[1].toUpperCase()
      out.endYard = Number(end[2])
    }
  }

  if (!out.playerHint) return null
  if (out.returnYards == null && out.endYard == null && !out.isTouchdown) return null
  out.jerseyHint = splitPlayerHint(out.playerHint).jersey
  return out
}

/** True when a PBP row is a completed pass, a run for a gain / TD, a FG attempt, an interception, or a kick / punt return (field replay). */
export function isFieldReplayablePlay(text) {
  return Boolean(
    parseRushPlay(text) ||
      parsePassPlay(text) ||
      parseFieldGoalPlay(text) ||
      parseInterceptionReturn(text) ||
      parseInterceptionPlay(text) ||
      parseKickoffReturn(text) ||
      parsePuntReturn(text) ||
      parseKickoffTouchback(text) ||
      parsePuntTouchback(text),
  )
}

/**
 * Parse ESPN / Rundown field-goal attempt text (made or missed).
 * @returns {{
 *   yards: number|null,
 *   made: boolean,
 *   missSide: 'left'|'right'|null,
 *   playerHint: string,
 *   jerseyHint: string|null,
 * } | null}
 */
export function parseFieldGoalPlay(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  const looksFg =
    /\bfield\s+goals?\b/.test(lower) ||
    /\b\d{1,2}\s*-?\s*yds?\s+fg\b/.test(lower) ||
    /\bfg\s+(?:is\s+)?(?:good|no\s+good)\b/.test(lower)
  if (!looksFg) return null
  // Formation-only lines without an attempt result are not replayable.
  const hasResult =
    /\b(?:is\s+)?(?:good|no\s+good)\b/.test(lower) ||
    /\b(?:made|miss(?:ed|es)?|wide\s+(?:left|right)|short|blocked)\b/.test(lower) ||
    /\bfg\s+good\b/.test(lower)
  if (!hasResult) return null

  const noGood = /\bno\s+good\b/.test(lower)
  const missed =
    noGood ||
    /\bmiss(?:ed|es)?\b/.test(lower) ||
    /\bwide\s+(?:left|right)\b/.test(lower) ||
    /\bblocked\b/.test(lower) ||
    (/\bshort\b/.test(lower) && /\bfield\s+goal\b/.test(lower))
  const made = !missed && (/\b(?:is\s+)?good\b/.test(lower) || /\bfg\s+good\b/.test(lower) || /\bmade\b/.test(lower))
  if (!made && !missed) return null

  let yards = null
  let m =
    raw.match(/(\d{1,2})\s*-?\s*(?:yards?|yds?)\s+field\s+goals?\b/i) ||
    raw.match(/\bfield\s+goals?\b.*?(\d{1,2})\s*-?\s*(?:yards?|yds?)\b/i) ||
    raw.match(/(\d{1,2})\s*-?\s*yds?\s+fg\b/i) ||
    raw.match(/\bfg\b.*?(\d{1,2})\s*-?\s*(?:yards?|yds?)\b/i)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 17 && n <= 75) yards = n
  }

  let missSide = null
  if (missed) {
    if (/\bwide\s+left\b/i.test(raw) || /\bleft\s+upright\b/i.test(raw)) missSide = 'left'
    else if (/\bwide\s+right\b/i.test(raw) || /\bright\s+upright\b/i.test(raw)) missSide = 'right'
    else {
      // Stable pick from text so replays don't flip sides.
      let h = 0
      for (let i = 0; i < raw.length; i += 1) h = (h + raw.charCodeAt(i) * (i + 1)) % 2
      missSide = h === 0 ? 'left' : 'right'
    }
  }

  let playerHint = ''
  const cleaned = stripPlayFormationPrefix(raw.replace(/^\([^)]*\)\s*/g, ''))
  const nameMatch = cleaned.match(
    new RegExp(
      `^((?:#?\\d{1,2}\\s+)?[A-Za-z][A-Za-z.'’-]*(?:\\s+[A-Za-z][A-Za-z.'’-]*){0,3}?)\\s+(?:\\d{1,2}\\s*-?\\s*(?:yard|yds?)\\s+)?(?:field\\s+goal|fg)\\b`,
      'i',
    ),
  )
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/)
    while (parts.length && FORMATION_SKIP.test(parts[0])) parts.shift()
    playerHint = parts.join(' ').trim()
  }
  const { jersey: jerseyHint } = splitPlayerHint(playerHint)
  return { yards, made, missSide, playerHint, jerseyHint }
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
 * Play `start_spot` ({ yard_line 1–50, yard_side }) → 0–100 field percent. 50 with no side = midfield.
 * @returns {number|null}
 */
export function playSpotFieldPercent(spot, flipped = false) {
  const yard = Number(spot?.yard_line)
  if (!Number.isFinite(yard) || yard < 0 || yard > 50) return null
  if (yard === 50) return 50
  return territoryToFieldPercent(spot?.yard_side, yard, flipped)
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
 * When text end + yards are known, pick the attack direction that keeps the
 * start on the field. Live `possession` is often already the *next* play
 * (or the defense) by the time last_play lands, which used to clamp a 49-yd
 * start onto the catch spot so the WR only appeared at the reception.
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
  knownStartPct = null,
} = {}) {
  const attackDir = attackDirection(possessionSide, flipped)
  const yd = Number(yards)
  const hasYards = Number.isFinite(yd) && yd > 0
  const textEnd = parsePlayEndFieldPercent(text, game, attackDir, flipped)

  // Feed LOS for this exact play … no inference from live pos or yardage.
  if (knownStartPct != null && Number.isFinite(Number(knownStartPct))) {
    const startPct = Math.max(0, Math.min(100, Number(knownStartPct)))
    let endPct
    if (textEnd != null) endPct = textEnd
    else if (isTouchdown) endPct = attackDir < 0 ? 0 : 100
    else if (Number.isFinite(yd)) endPct = startPct + attackDir * yd
    else endPct = startPct
    return { startPct, endPct: Math.max(0, Math.min(100, endPct)), fromText: true }
  }

  let endPct = null
  let startPct = null
  let fromText = false

  // Text spots win whenever we can resolve an end yardline + positive yards.
  if (textEnd != null && hasYards) {
    endPct = textEnd
    const startAlong = textEnd - attackDir * yd
    const startOpposite = textEnd + attackDir * yd
    const alongOk = startAlong >= 0 && startAlong <= 100
    const oppositeOk = startOpposite >= 0 && startOpposite <= 100
    if (alongOk && !oppositeOk) {
      startPct = startAlong
    } else if (oppositeOk && !alongOk) {
      // Possession/attackDir is stale relative to the PBP … trust geometry.
      startPct = startOpposite
    } else if (alongOk) {
      startPct = startAlong
    } else {
      startPct = Math.max(0, Math.min(100, startAlong))
    }
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
    const startAlong = endPct - attackDir * yd
    const startOpposite = endPct + attackDir * yd
    const alongOk = startAlong >= 0 && startAlong <= 100
    const oppositeOk = startOpposite >= 0 && startOpposite <= 100
    if (alongOk && !oppositeOk) startPct = startAlong
    else if (oppositeOk && !alongOk) startPct = startOpposite
    else startPct = startAlong
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
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '')
    .replace(/[#.’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compact alphanumeric key … "Amon-Ra St. Brown" / "A.St.Brown" → amonrastbrown / astbrown. */
function playerMatchKey(s) {
  return normalizePlayerToken(s).replace(/[^a-z0-9]/g, '')
}

function normMatchTeam(team) {
  const t = String(team || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (t === 'WSH') return 'WAS'
  if (t === 'JAC') return 'JAX'
  return t
}

/** True when slate abbrev and roster team refer to the same club (LA↔LAR/LAC, WSH↔WAS). */
export function teamsMatch(a, b) {
  const na = normMatchTeam(a)
  const nb = normMatchTeam(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if ((na === 'LA' && (nb === 'LAR' || nb === 'LAC')) || (nb === 'LA' && (na === 'LAR' || na === 'LAC'))) {
    return true
  }
  return false
}

/**
 * ESPN often prints "C.Beebe" / "J.Gibbs" / "A.St. Brown" / "A.J. Brown".
 * Detect Initial(+optional middle initial) + last before normalize collapses periods.
 */
function parseInitialLastName(namePart) {
  const raw = String(namePart || '').trim()
  if (!raw) return null
  // Single-token Initial.Last … "J.Gibbs" / "S.LaPorta"
  let m = raw.match(/^([A-Za-z])[.'’-]([A-Za-z][A-Za-z.'’-]+)$/)
  if (m) {
    return {
      initial: m[1].toLowerCase(),
      last: normalizePlayerToken(m[2]),
    }
  }
  // "A.St. Brown" / "A.J. Brown" / "A. St Brown" … initial then remainder as last cluster
  m = raw.match(/^([A-Za-z])[.'’-](.+)$/)
  if (m && /[\s.'’-]/.test(m[2])) {
    return {
      initial: m[1].toLowerCase(),
      last: normalizePlayerToken(m[2]),
    }
  }
  // "AJ Brown" (no punctuation) when first token is 1–2 letters
  m = raw.match(/^([A-Za-z]{1,2})\s+([A-Za-z][A-Za-z.'’\s-]+)$/)
  if (m) {
    return {
      initial: m[1][0].toLowerCase(),
      last: normalizePlayerToken(m[2]),
    }
  }
  return null
}

const rosterNameKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')

/**
 * Field-figure roster: hub players (fantasy / CFB roster) with ESPN's current uniform numbers laid over them,
 * plus every other ESPN roster player (returners, defenders) so play text without `#N` still finds a number.
 * @param {object[]} players hub roster rows `{ name, team, side, jersey, … }`
 * @param {{ away?: object[], home?: object[] } | null} rosters scoreboard detail `rosters`
 * @param {object} game hub game (side abbrevs)
 */
export function mergeFieldRoster(players, rosters, game) {
  const base = Array.isArray(players) ? players : []
  if (!rosters || (!rosters.away?.length && !rosters.home?.length)) return base
  const espnBySide = { away: new Map(), home: new Map() }
  for (const side of ['away', 'home']) {
    for (const r of Array.isArray(rosters[side]) ? rosters[side] : []) {
      const k = rosterNameKey(r?.name)
      if (k) espnBySide[side].set(k, r)
    }
  }
  const seen = { away: new Set(), home: new Set() }
  const out = base.map((p) => {
    const side = p?.side === 'home' || p?.side === 'away' ? p.side : null
    const k = rosterNameKey(p?.name)
    const espn = side && k ? espnBySide[side].get(k) : null
    if (!espn) return p
    seen[side].add(k)
    return {
      ...p,
      jersey: espn.jersey || p.jersey,
      headshot_url: p.headshot_url || espn.headshot || null,
    }
  })
  for (const side of ['away', 'home']) {
    const team = String(game?.[side]?.abbrev || '')
    for (const [k, r] of espnBySide[side]) {
      if (seen[side].has(k)) continue
      out.push({
        name: r.name,
        team,
        side,
        jersey: r.jersey,
        position: r.position || null,
        headshot_url: r.headshot || null,
        espn_roster_only: true,
      })
    }
  }
  return out
}

/**
 * Match a rush/catch player hint against hub roster rows.
 * Prefers possession-side `team` abbrev when provided.
 * Handles "#80 C.Becker", "C.Becker", "A.St. Brown", "Beebe", and full names.
 * NFL PBP rarely has `#N`, so name matching must be strong.
 * @returns {object | null} player row with headshot_url preferred
 */
export function matchRushPlayer(hint, players, sideAbbrev = '') {
  const list = Array.isArray(players) ? players : []
  if (!list.length || !hint) return null
  const raw = String(hint).trim()
  const side = normMatchTeam(sideAbbrev)

  const { jersey, namePart } = splitPlayerHint(raw)
  const initialLast = parseInitialLastName(namePart)
  const hintNorm = normalizePlayerToken(namePart)
  const hintKey = playerMatchKey(namePart)
  const hintParts = hintNorm.split(' ').filter(Boolean)
  const hintLast = initialLast?.last || (hintParts.length ? hintParts[hintParts.length - 1] : '')
  const hintLastKey = playerMatchKey(hintLast)
  const hintInitial = initialLast?.initial || null

  // Unique last-name on the possession side → strong signal when NFL omits `#N`.
  let uniqueSideLast = null
  if (side && hintLastKey && hintLastKey.length >= 3) {
    const sideHits = []
    for (const p of list) {
      if (!p || typeof p !== 'object') continue
      if (!teamsMatch(p.team || p.team_abbrev, side)) continue
      const pKey = playerMatchKey(p.name || p.full_name || '')
      if (!pKey) continue
      if (pKey === hintLastKey || pKey.endsWith(hintLastKey)) sideHits.push(p)
    }
    if (sideHits.length === 1) uniqueSideLast = sideHits[0]
  }

  const scored = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const pRawName = p.name || p.full_name || ''
    const pName = normalizePlayerToken(pRawName)
    if (!pName) continue
    const pKey = playerMatchKey(pRawName)
    const pParts = pName.split(' ').filter(Boolean)
    const pLast = pParts.length ? pParts[pParts.length - 1] : ''
    const pLastKey = playerMatchKey(pLast)
    const pFirst = pParts.length ? pParts[0] : ''
    const pJersey = p.jersey != null ? String(p.jersey).trim() : ''
    const pTeam = normMatchTeam(p.team || p.team_abbrev)
    const onSide = Boolean(side && pTeam && teamsMatch(side, pTeam))

    let score = 0
    if (hintKey && pKey && hintKey === pKey) score += 110
    else if (hintNorm && pName === hintNorm) score += 100
    else if (
      hintInitial &&
      hintLastKey &&
      hintLastKey.length >= 3 &&
      pKey.startsWith(hintInitial) &&
      (pKey.endsWith(hintLastKey) || pLastKey === hintLastKey)
    ) {
      // J.Gibbs → Jahmyr Gibbs; A.St.Brown → Amon-Ra St. Brown
      score += 92
    } else if (hintInitial && hintLast && pLast === hintLast && pFirst.startsWith(hintInitial)) {
      score += 85
    } else if (uniqueSideLast && uniqueSideLast === p) {
      score += 80
    } else if (hintNorm && pName.includes(hintNorm) && hintNorm.length >= 3) score += 70
    else if (hintLastKey && hintLastKey.length >= 4 && (pLastKey === hintLastKey || pKey.endsWith(hintLastKey))) {
      score += 55
    } else if (hintLast && pLast === hintLast) score += 50
    else if (hintLast && hintLast.length >= 4 && pName.includes(hintLast)) score += 30
    else if (jersey && pJersey && jersey === pJersey && onSide) {
      // Jersey + side only … last resort when name tokens miss.
      score += 35
    } else continue

    if (jersey && pJersey && jersey === pJersey) score += 40
    if (onSide) score += 25
    else if (side && pTeam && !onSide) score -= 15
    if (p.headshot_url) score += 5
    scored.push({ p, score })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  // Require a clear winner when top two are close and neither is on-side unique.
  if (scored.length >= 2 && scored[0].score - scored[1].score < 8) {
    const aSide = teamsMatch(side, scored[0].p.team || scored[0].p.team_abbrev)
    const bSide = teamsMatch(side, scored[1].p.team || scored[1].p.team_abbrev)
    if (aSide && !bSide) return scored[0].p
    if (bSide && !aSide) return scored[1].p
  }
  return scored[0].p
}

const DRIVE_BREAK_PLAY = /\bkick(?:s|ed)?\s+off\b|\bkickoff\b|\bkicks\s+-?\d+\s+yards?\s+from\b|\bpunts?\b|\bintercept(?:ed|ion)?\b|\bturnover\s+on\s+downs\b/i
const DRIVE_SKIP_PLAY =
  /\bfield\s+goal\b|\bextra\s+point\b|\bkick\s+attempt\b|\bpat\b|\btwo[-\s]point\b|\b2[-\s]?pt\b|\btimeout\b|\bend\s+of\s+(?:the\s+)?(?:\d\w*\s+)?(?:period|half|quarter|game)\b|\bno\s+play\b/i
const DRIVE_SCORE_FG = /\bfield\s+goal\b[^.]*\b(?:is\s+)?good\b/i
/** Stoppage rows that don't change the ball … timeouts, quarter breaks, reviews. */
const PLAY_STOPPAGE = /^\s*(?:\(\d{1,2}:\d{2}\)\s*)?(?:timeout\b|end\s+of\s+(?:the\s+)?(?:\d\w*\s+)?(?:period|quarter)\b|official\s+timeout\b|injury\s+timeout\b)/i

/**
 * Last real play once stoppage rows (timeouts, quarter breaks) are skipped … a timeout right after a TD must
 * not bring the LOS / drive back before the kickoff.
 * @returns {string}
 */
export function lastBallPlayText(plays, lastPlayText = '') {
  const text = String(lastPlayText || '').trim()
  if (text && !PLAY_STOPPAGE.test(text)) return text
  for (const row of sortPlaysNewestFirst(plays)) {
    const desc = String(row?.description || '').trim()
    if (desc && !PLAY_STOPPAGE.test(desc)) return desc
  }
  return text
}
const DRIVE_LABEL_MAX = 54

/**
 * Short label for a tapped drive segment: "S.Irvin rush right for 3 yards loss", "D.Warren pass incomplete short
 * middle to C.High", "FLAG · GT · Holding · 10 yds".
 */
export function drivePlayShortLabel(mark) {
  const text = String(mark?.text || '')
  const penAt = text.search(/\bpenalty\b/i)
  if (mark?.kind === 'penalty') {
    const pen = penAt >= 0 ? text.slice(penAt) : text
    const foul = /\bPENALTY\s+(?:on\s+)?[A-Z][A-Z&]{1,5}(?:-[^,]+)?[,\s]+([A-Za-z][A-Za-z' -]*?)(?=\s*\(|,|\s+\d+\s+yards?|$)/i.exec(pen)?.[1]
    const yds = /\b(\d+)\s+yards?\b/i.exec(pen)?.[1]
    return ['FLAG', mark.flagTeam, foul?.trim(), yds ? `${yds} yds` : ''].filter(Boolean).join(' · ')
  }
  let s = stripPlayFormationPrefix(penAt >= 0 ? text.slice(0, penAt) : text)
    .replace(/#\d{1,2}\s+/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/,?\s*clock\s+\d{1,2}:\d{2}.*$/i, '')
    .replace(/\s+(?:caught|sacked)?\s*at\s+[A-Za-z]{2,8}\s*\d{1,2}\b,?/gi, (m) => (/sacked/i.test(m) ? ' sacked' : ''))
    .replace(/\s+to\s+[A-Z]{2,4}\s+\d{1,2}\b/g, '')
    .replace(/\s+(?:thrown\s+to|to\s+the|out\s+of\s+bounds)\b.*$/i, '')
    .replace(/[\s,.]+$/, '')
    .trim()
  const forYards = /^(.*?\b(?:for\s+(?:a\s+)?(?:loss\s+of\s+)?-?\d+\s+(?:yards?|yds?)(?:\s+loss)?|no\s+gain))\b/i.exec(s)
  if (forYards) s = forYards[1]
  s = s.replace(/\bpass\s+complete(?:d)?\b/i, 'pass').replace(/\b(\d+)\s+yards?\b/gi, '$1 yds')
  return s.length > DRIVE_LABEL_MAX ? `${s.slice(0, DRIVE_LABEL_MAX - 1).trimEnd()}…` : s
}

/** Flagged team: CFB "PENALTY GT Holding", NFL "PENALTY on KC-T.Smith" / "PENALTY on KC, Delay of Game". */
const PENALTY_TEAM = /\b(?:PENALTY|Penalty)\s+(?:on\s+)?([A-Z][A-Z&]{1,5})(?=[\s,-])/
const THROWN_TO_SPOT = /\bthrown\s+to\s+(?:the\s+)?[A-Za-z]{2,6}\s*(\d{1,2})\b/i
const INCOMPLETE_DIR = /\bincomplete\b(?:\s+(short|deep))?(?:\s+(left|right|middle))?/i
const PASS_DIR_ANYWHERE = /\b(short|deep)\s+(left|right|middle)\b/i
const INCOMPLETE_DEPTH_YDS = { short: 7, deep: 20, none: 10 }

function playHalf(period) {
  const n = Number(period)
  return Number.isFinite(n) && n >= 3 ? 2 : 1
}

/**
 * Live clock has moved into the next half but the feed's newest row is still from the last one (Q3 15:00
 * before the kickoff lands) … its drive, LOS and down/distance are stale.
 */
export function playsFromEarlierHalf(plays, livePeriod) {
  const live = Number(livePeriod)
  const newest = sortPlaysNewestFirst(plays).find((row) => Number.isFinite(Number(row?.period)))
  if (!Number.isFinite(live) || !newest) return false
  return playHalf(newest.period) < playHalf(live)
}

const KICKOFF_ROW = /\bkick(?:s|ed)?\s+off\b|\bkickoff\b|\bkicks\s+-?\d+\s+yards?\s+from\b/i

/**
 * Opening kick of a half (Q1 / Q3 at 15:00), not one after a score. The feed only carries the newest ~80 rows,
 * so "first kickoff in the list" isn't reliable … the 15:00 clock is.
 */
export function isOpeningKickoffRow(row) {
  const period = Number(row?.period)
  const desc = String(row?.description || '')
  if ((period !== 1 && period !== 3) || !KICKOFF_ROW.test(desc)) return false
  const clock = String(row.clock || '').trim() || /^\s*\((\d{1,2}:\d{2})\)/.exec(desc)?.[1] || ''
  return /^15:00$/.test(clock)
}

/** Snap yardage before any penalty clause: "for 3 yards", "for loss of 6 yards", "for -2 yards", "no gain". */
function playYardsFromText(text) {
  const raw = String(text || '')
  if (/\bno\s+gain\b/i.test(raw)) return 0
  const trailingLoss = /\bfor\s+(\d+)\s+(?:yards?|yds?)\s+loss\b/i.exec(raw)
  if (trailingLoss) return -Number(trailingLoss[1])
  const m = /\bfor\s+(?:a\s+)?(loss\s+of\s+)?(-?\d+)\s+(?:yards?|yds?)\b/i.exec(raw)
  if (!m) return null
  const n = Number(m[2])
  return m[1] ? -Math.abs(n) : n
}

function playHasSpot(play) {
  return hasYardSpot(play?.start_spot) || hasYardSpot(play?.end_spot)
}

/**
 * Current possession's drive chart … rushes / completions / sacks as LOS → new LOS lines, incompletions
 * as a short arc to a red X, enforced penalties as a red dashed line. Empty once the ball changes hands (kickoff, punt,
 * pick, lost fumble via the feed `turnover` flag) or the half ends.
 * @returns {{ team: 'home'|'away'|null, attackDir: number, marks: Array<{
 *   key: string, kind: 'line'|'incomplete'|'penalty', text: string, fromPct: number, toPct: number,
 *   lateral: number (-1 left … 1 right of the offense), isNewest: boolean, flagTeam?: string (penalized abbrev),
 *   touchdown?: boolean (scoring play line … painted gold)
 * }> }}
 */
export function buildPossessionDriveMarks(plays, { keepScoringDrive = false, livePeriod = null } = {}) {
  const empty = { team: null, attackDir: 1, marks: [] }
  if (playsFromEarlierHalf(plays, livePeriod)) return empty
  let newestFirst = sortPlaysNewestFirst(plays).filter(playHasSpot)
  // Scoring drive mode: skip a trailing PAT / 2-pt row so the offensive TD row leads and its drive is kept.
  if (keepScoringDrive) {
    const lead = newestFirst.findIndex((row) => {
      const desc = String(row?.description || '')
      return !(playTextIsScoreTry(desc) && !playTextIsTouchdown(desc))
    })
    newestFirst = lead > 0 ? newestFirst.slice(lead) : newestFirst
  }
  if (!newestFirst.length) return empty
  const head = newestFirst[0]
  const team = head?.team === 'home' || head?.team === 'away' ? head.team : null
  // A score ends the possession too … the field clears until the kickoff (timeouts after it stay empty).
  const breaksDrive = (row) => {
    const desc = String(row?.description || '')
    return row?.turnover === true || DRIVE_BREAK_PLAY.test(desc) || playTextIsTouchdown(desc) || DRIVE_SCORE_FG.test(desc)
  }
  // Offensive TD at the head (not a pick-six / return score) stays on the chart while its label is up.
  const headDesc = String(head?.description || '')
  const keepHead =
    keepScoringDrive && head?.turnover !== true && !DRIVE_BREAK_PLAY.test(headDesc) && playTextIsTouchdown(headDesc)
  if (!team || (breaksDrive(head) && !keepHead)) return empty
  const half = playHalf(head.period)
  const drive = []
  for (const row of newestFirst) {
    if (row.team !== team || playHalf(row.period) !== half) break
    if (breaksDrive(row) && !(keepHead && row === head)) break
    drive.unshift(row)
  }
  // Whole drive in one direction … a drive that crosses the end of Q1 / Q3 stays one chain.
  const flipped = periodFieldFlipped(head.period)
  const attackDir = attackDirection(team, flipped)
  const goalPct = attackDir > 0 ? 100 : 0
  const marks = []
  let prevEnd = null
  let middleIncompletes = 0
  drive.forEach((row, i) => {
    const text = String(row.description || '').trim()
    const startPct = playSpotFieldPercent(row.start_spot, flipped) ?? prevEnd
    const next = drive[i + 1]
    let endPct = playSpotFieldPercent(row.end_spot, flipped) ?? playSpotFieldPercent(next?.start_spot, flipped)
    if (playTextIsTouchdown(text)) endPct = goalPct
    if (endPct != null) prevEnd = endPct
    if (startPct == null) return
    const key = String(row.id || `${i}:${text.slice(0, 24)}`)
    const isNewest = row === head

    const penaltyAt = text.search(/\bpenalty\b/i)
    const penaltyText = penaltyAt >= 0 ? text.slice(penaltyAt) : ''
    const penaltyEnforced = Boolean(penaltyText) && !/\b(?:declined|offsetting)\b/i.test(penaltyText)
    let playText = penaltyAt >= 0 ? text.slice(0, penaltyAt) : text
    // ESPN appends the PAT to the TD row ("… TOUCHDOWN, clock 00:31 #80 S.X kick attempt good").
    const tdAt = playText.search(/\btouchdown\b/i)
    if (tdAt >= 0) playText = playText.slice(0, tdAt)
    const hasSnap = /\b(?:pass|rush|run|ran|sacked|scrambles?|kneels?)\b/i.test(playText)
    const pushPenalty = (fromPct) => {
      if (endPct == null || Math.abs(endPct - fromPct) < 0.2) return
      const flagTeam = PENALTY_TEAM.exec(penaltyText)?.[1] || ''
      marks.push({ key: `${key}:penalty`, kind: 'penalty', text, fromPct, toPct: endPct, lateral: 0, isNewest, flagTeam })
    }
    const inc = INCOMPLETE_DIR.exec(playText)
    // A nullified run / catch shows only the flag; an incompletion still happened (DPI, holding), so it keeps its arc.
    if (penaltyEnforced && (!hasSnap || (!inc && /\bno\s+play\b/i.test(text)))) {
      pushPenalty(startPct)
      return
    }
    if (DRIVE_SKIP_PLAY.test(playText)) return
    if (penaltyAt >= 0 && !hasSnap) return

    if (inc) {
      const dir = PASS_DIR_ANYWHERE.exec(playText)
      const depth = (inc[1] || dir?.[1] || '').toLowerCase()
      const side = (inc[2] || dir?.[2] || '').toLowerCase()
      let yds = INCOMPLETE_DEPTH_YDS[depth] ?? INCOMPLETE_DEPTH_YDS.none
      // "thrown to USC40" … the text abbrev can differ from the board's, so take whichever side of the
      // field puts the spot downfield of the LOS.
      const thrown = THROWN_TO_SPOT.exec(playText)
      if (thrown) {
        const yl = Number(thrown[1])
        const depths = [yl, 100 - yl]
          .map((p) => (p - startPct) * attackDir)
          .filter((d) => d >= -1 && d <= 60)
          .sort((a, b) => a - b)
        if (depths.length) yds = Math.max(3, depths[0])
      }
      marks.push({
        key,
        kind: 'incomplete',
        text,
        fromPct: startPct,
        toPct: Math.max(0, Math.min(100, startPct + attackDir * yds)),
        // Middle / unspecified still lands off the ball line (half width), alternating so repeats don't stack.
        lateral: side === 'right' ? 1 : side === 'left' ? -1 : (middleIncompletes++ % 2 === 0 ? -0.5 : 0.5),
        isNewest,
      })
      if (penaltyEnforced) pushPenalty(startPct)
      return
    }

    const snapYards = playYardsFromText(playText)
    // Enforced penalty after a live play: the snap line stops at the play spot, the penalty runs on from there.
    const playEndPct = penaltyEnforced
      ? (snapYards != null ? startPct + attackDir * snapYards : null)
      : endPct ?? (snapYards != null ? startPct + attackDir * snapYards : null)
    if (playEndPct == null) {
      if (penaltyEnforced) pushPenalty(startPct)
      return
    }
    marks.push({
      key,
      kind: 'line',
      text,
      fromPct: startPct,
      toPct: playEndPct,
      lateral: 0,
      isNewest,
      ...(playTextIsTouchdown(text) ? { touchdown: true } : {}),
    })
    if (penaltyEnforced) pushPenalty(playEndPct)
  })
  return { team, attackDir, marks }
}
