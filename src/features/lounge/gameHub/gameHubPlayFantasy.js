/**
 * Fantasy points a single PBP row earned each player on it, calculated from the play text (full PPR default):
 * rush / rec 0.1 per yd, rec +`recPoints` (1 / 0.5 / 0), rush / rec / return TD 6, pass 0.04 per yd, pass TD 4, INT -2,
 * FG 3 (<40) / 4 (40-49) / 5 (50+), FG miss -1, plus a team DEF row (`playDefenseFantasyPoints`).
 * Player fumbles, 2-pt tries and IDP are not scored.
 */
import {
  matchRushPlayer,
  parseFieldGoalPlay,
  parseInterceptionPlay,
  parseInterceptionReturn,
  parseKickoffReturn,
  parsePassPlay,
  parsePasserHint,
  parsePuntReturn,
  parseRushPlay,
  playTextIsTouchdown,
  teamsMatch,
} from './gameHubFormatters.js'

const round1 = (n) => Math.round(n * 10) / 10

/** "#80 C.Becker" → "Becker"; full roster names → last name (keeps "St. Brown"). */
function lastName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && /^(?:st\.?|del|de|da|di|du|la|le|van|von|mc)$/i.test(parts[parts.length - 2])) {
    return parts.slice(-2).join(' ')
  }
  return parts[parts.length - 1] || ''
}

function shortName(hint, matched) {
  const full = String(matched?.name || matched?.full_name || '').trim()
  if (full) return lastName(full)
  const s = String(hint || '')
    .replace(/^#?\d{1,2}\s+/, '')
    .replace(/^[A-Za-z]{1,2}\.\s*(?=[A-Za-z])/, '')
    .trim()
  return lastName(s)
}

function row(hint, points, players, sideAbbrev) {
  if (!hint || !Number.isFinite(points) || points === 0) return null
  let matched = matchRushPlayer(hint, players, sideAbbrev)
  const matchedTeam = matched?.team || matched?.team_abbrev
  if (matched && sideAbbrev && matchedTeam && !teamsMatch(matchedTeam, sideAbbrev)) matched = null
  const name = shortName(hint, matched)
  if (!name) return null
  return {
    key: `${name}:${points}`,
    name,
    position: String(matched?.position || '').toUpperCase(),
    headshotUrl: matched?.headshot_url ? String(matched.headshot_url) : '',
    points: round1(points),
  }
}

const abbrevKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Team defense / special teams points on one row (standard): sack 1, INT 2, fumble recovery 2, safety 2,
 * blocked kick 2, defensive or return TD 6. Points-allowed tiers are game-level and not scored per play.
 */
export function playDefenseFantasyPoints(text, { defenseAbbrev = '', turnover = false } = {}) {
  const raw = String(text || '').trim()
  if (!raw || /\bno\s+play\b/i.test(raw)) return 0
  const lower = raw.toLowerCase()
  const td = playTextIsTouchdown(raw)
  let pts = 0

  if (/\bsack(?:ed)?\b/.test(lower)) pts += 1

  const pick = parseInterceptionReturn(raw) || parseInterceptionPlay(raw)
  if (pick) pts += 2 + (pick.isTouchdown ? 6 : 0)

  const kickPlay = /\bpunts?\b|\bkicks?\s*off\b|\bkickoff\b/.test(lower)
  if (!pick && !kickPlay && /\bfumble[sd]?\b/.test(lower)) {
    const rec = raw.match(/\brecovered\s+by\s+([A-Za-z]{2,5})\s*-/i)
    const defenseRecovered = rec ? abbrevKey(rec[1]) === abbrevKey(defenseAbbrev) : turnover
    if (defenseRecovered) pts += 2 + (td ? 6 : 0)
  }

  if (/\bsafety\b/.test(lower) && !/\bsafety\s+kick\b|\bfree\s+kick\b/.test(lower)) pts += 2

  const blockedKick =
    /\bblocked\b/.test(lower) && (kickPlay || /\bfield\s+goal\b|\bextra\s+point\b|\bfg\b|\bpat\b|\bkick\b/.test(lower))
  if (blockedKick) pts += 2 + (td ? 6 : 0)

  const ret = parseKickoffReturn(raw) || parsePuntReturn(raw)
  if (ret?.isTouchdown && !blockedKick) pts += 6

  return pts
}

/**
 * @param {string} text PBP row
 * @param {{ players?: object[], offenseAbbrev?: string, defenseAbbrev?: string, defenseLogo?: string, turnover?: boolean, recPoints?: number }} ctx
 * @returns {{ key: string, name: string, position: string, headshotUrl: string, points: number }[]}
 */
export function playFantasyPoints(text, ctx = {}) {
  const out = playerFantasyPoints(text, ctx)
  const { defenseAbbrev = '', defenseLogo = '' } = ctx
  const dst = defenseAbbrev ? playDefenseFantasyPoints(text, ctx) : 0
  if (dst) {
    const name = String(defenseAbbrev).toUpperCase()
    out.push({ key: `DEF:${name}:${dst}`, name, position: 'DEF', headshotUrl: defenseLogo, points: dst })
  }
  return out
}

function playerFantasyPoints(text, { players = [], offenseAbbrev = '', defenseAbbrev = '', recPoints = 1 } = {}) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const out = []
  const push = (r) => {
    if (r) out.push(r)
  }

  const fg = parseFieldGoalPlay(raw)
  if (fg) {
    const pts = fg.made ? (fg.yards != null && fg.yards >= 50 ? 5 : fg.yards != null && fg.yards >= 40 ? 4 : 3) : -1
    push(row(fg.playerHint, pts, players, offenseAbbrev))
    return out
  }

  const rush = parseRushPlay(raw)
  if (rush) {
    push(row(rush.playerHint, rush.yards * 0.1 + (rush.isTouchdown ? 6 : 0), players, offenseAbbrev))
    return out
  }

  const pass = parsePassPlay(raw)
  if (pass) {
    const td = pass.isTouchdown || playTextIsTouchdown(raw)
    let receiver = pass.playerHint
    if (!receiver) {
      const lead = raw.match(/^((?:#?\d{1,2}\s+)?[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}?)\s+\d+\s*-?\s*yds?\s+pass\b/i)
      if (lead) receiver = lead[1].trim()
    }
    push(row(receiver, recPoints + pass.yards * 0.1 + (td ? 6 : 0), players, offenseAbbrev))
    push(row(parsePasserHint(raw), pass.yards * 0.04 + (td ? 4 : 0), players, offenseAbbrev))
    return out
  }

  if (parseInterceptionReturn(raw) || parseInterceptionPlay(raw)) {
    push(row(parsePasserHint(raw), -2, players, offenseAbbrev))
    return out
  }

  const ret = parseKickoffReturn(raw) || parsePuntReturn(raw)
  if (ret?.isTouchdown) push(row(ret.playerHint, 6, players, defenseAbbrev))
  return out
}

/** "+12.4" / "-2" / "+3" */
export function formatFantasyPoints(points) {
  const n = round1(Number(points) || 0)
  const body = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1)
  return `${n < 0 ? '-' : '+'}${body}`
}
