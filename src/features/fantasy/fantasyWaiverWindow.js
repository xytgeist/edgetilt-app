/**
 * Waiver timing and claim odds for Snipe & flip.
 * Hosts store when claims process as ET weekday + hour (league `settings.waiver`); the snipe window runs
 * from Sunday 4 PM ET (most of the week's games are in) until that next run. Unknown leagues use
 * Wednesday 3 AM ET, the default on ESPN, Sleeper, and Yahoo.
 */

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WINDOW_START = 0 * 24 + 16 // Sunday 4 PM ET, in hours from Sunday 00:00 ET

function etNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  const dow = DAY_NAME.indexOf(get('weekday').slice(0, 3))
  return { dow: dow < 0 ? 0 : dow, hour: Number(get('hour')) % 24, minute: Number(get('minute')) || 0 }
}

export function leagueWaiver(league) {
  const w = league?.settings?.waiver
  return w && typeof w === 'object' ? w : null
}

function hourLabel(h) {
  const hr = ((h % 24) + 24) % 24
  const ampm = hr < 12 ? 'AM' : 'PM'
  return `${hr % 12 === 0 ? 12 : hr % 12} ${ampm}`
}

/**
 * `{ open, hoursLeft, label }`: whether we are between Sunday 4 PM ET and the next waiver run, and when
 * that run is ("Wed 3 AM ET").
 */
export function waiverWindow(league, date = new Date()) {
  const w = leagueWaiver(league)
  const days = Array.isArray(w?.days) && w.days.length ? w.days : [3]
  const hour = Number.isFinite(Number(w?.hour_et)) && w?.hour_et != null ? Number(w.hour_et) : 3
  const now = etNow(date)
  const nowH = now.dow * 24 + now.hour + now.minute / 60
  const sinceStart = (nowH - WINDOW_START + 168) % 168
  // Next run after the window opened: the first process slot at or past Sunday 4 PM ET.
  const offsets = days.map((d) => (Number(d) * 24 + hour - WINDOW_START + 168) % 168).sort((a, b) => a - b)
  const runOffset = offsets[0] ?? 59
  const open = sinceStart < runOffset
  const runDow = Math.floor(((runOffset + WINDOW_START) % 168) / 24)
  return {
    open,
    hoursLeft: open ? runOffset - sinceStart : null,
    label: `${DAY_NAME[runDow]} ${hourLabel(hour)} ET`,
    type: w?.type || null,
    known: Boolean(w),
  }
}

/**
 * Who else would chase this pickup, and whether you are likely to land him.
 * Priority leagues: lower rank claims first. FAAB: a bid suggestion from how many teams want him and their budgets.
 */
export function claimOdds({ league, teams, myTeamId, rivalsWanting }) {
  const w = leagueWaiver(league)
  const meta = (t) => (t?.metadata && typeof t.metadata === 'object' ? t.metadata.waiver || {} : {})
  const me = teams.find((t) => t.id === myTeamId)
  const myRank = Number(meta(me).rank) || null
  const field = teams.length
  const rivals = rivalsWanting
    .map((r) => ({ ...r, rank: Number(meta(r.team).rank) || null, faab: meta(r.team).faab_left }))
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))

  if (w?.type === 'faab') {
    const myLeft = Number(meta(me).faab_left)
    const budget = Number(w.budget) || 100
    const top = rivals.map((r) => Number(r.faab)).filter(Number.isFinite).sort((a, b) => b - a)[0]
    const bid = Math.max(1, Math.round(budget * Math.min(0.35, 0.05 + 0.06 * rivals.length)))
    return {
      kind: 'faab',
      text: rivals.length
        ? `FAAB: ${rivals.length} other team${rivals.length > 1 ? 's' : ''} need him; bid ~$${Number.isFinite(myLeft) ? Math.min(bid, myLeft) : bid}${Number.isFinite(top) ? ` (top rival has $${top} left)` : ''}`
        : `FAAB: no other team needs him; $${Math.max(1, Math.round(budget * 0.02))} should do it`,
      likely: rivals.length <= 1,
    }
  }

  if (!myRank) {
    return {
      kind: 'unknown',
      text: rivals.length ? `${rivals.length} other team${rivals.length > 1 ? 's' : ''} could chase him. Sync to load waiver order.` : 'No other team needs him.',
      likely: rivals.length === 0,
    }
  }
  const ahead = rivals.filter((r) => r.rank && r.rank < myRank)
  if (!ahead.length) {
    return { kind: 'priority', text: `You're #${myRank} of ${field}, ahead of every team that needs him. Likely yours.`, likely: true }
  }
  const first = ahead[0]
  return {
    kind: 'priority',
    text: `You're #${myRank}; ${first.team.team_name} (#${first.rank}) needs him and claims first.`,
    likely: false,
  }
}
