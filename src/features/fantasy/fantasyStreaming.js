import { scoreLine } from './fantasyBoxScore.js'
import { bestSeats, eligOf, rowId } from './fantasyWaivers.js'

/** Streaming only looks at the weakest few players as the cut; anyone better is a keeper, not a stream spot. */
const DROP_POOL = 3
/** A stream has to add at least this share of one of his games over the week to be worth an add. */
const MIN_GAIN_GAMES = 0.5

const ET_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

function sitsOut(status) {
  const s = String(status || '').trim().toLowerCase()
  return /^(o|out|ir|inj|sus|suspended|na)$/.test(s) || s.includes('reserve')
}

function perGame(entry, scoring) {
  const v = entry?.per_game ? scoreLine(entry.per_game, scoring, 'nba', entry.position) : null
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Night-by-night lineup total: each night, the best seats among players with a game that night. */
function weekTotal(list, days, slots) {
  let total = 0
  const byDay = {}
  for (const d of days) {
    const seats = bestSeats(list.filter((p) => p.nights.has(d)), slots)
    total += seats.total
    byDay[d] = seats
  }
  return { total, byDay }
}

/**
 * NBA streaming for daily-lineup leagues where every game counts (ESPN / Yahoo): nights this week (or next, when the
 * matchup has not started) where a lineup slot has nobody playing, and the available players who fill them.
 * Each pick swaps one of the roster's weakest healthy players for the pickup and keeps the one that adds the most
 * started value over the remaining nights.
 */
export function streamPlan({ pool, rosterRows, scoring, slots, upcoming = false, now = Date.now() }) {
  if (!slots?.length) return { days: [], picks: [] }
  const today = ET_DATE.format(now)
  const nightsKey = upcoming ? 'nights_next' : 'nights'
  const nightsOf = (entry, out) => new Set(out ? [] : (entry?.[nightsKey] || []).filter((d) => d >= today))
  const rosterById = new Map((pool?.roster || []).map((p) => [String(p.sleeper_id), p]))

  const mine = (rosterRows || [])
    .filter((row) => rowId(row) && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const entry = rosterById.get(rowId(row)) || null
      const out = sitsOut(row.injury_status ?? entry?.injury_status)
      return {
        id: rowId(row),
        pos: String(row.position || entry?.position || '').toUpperCase(),
        elig: eligOf(entry, 'nba'),
        value: perGame(entry, scoring),
        nights: nightsOf(entry, out),
        out,
        name: row.player_name || entry?.name || '',
        row,
      }
    })
  const days = [...new Set(mine.flatMap((p) => [...p.nights]).concat((pool?.players || []).flatMap((e) => e?.[nightsKey] || [])))]
    .filter((d) => d >= today)
    .sort()
  if (!days.length || !mine.length) return { days: [], picks: [] }

  const base = weekTotal(mine, days, slots)
  const dayRows = days.map((d) => {
    const seats = base.byDay[d]
    return { date: d, open: Math.max(0, slots.length - seats.seats.length), playing: mine.filter((p) => p.nights.has(d)).length }
  })
  const openDays = new Set(dayRows.filter((r) => r.open > 0).map((r) => r.date))
  if (!openDays.size) return { days: dayRows, picks: [] }

  const dropPool = mine
    .filter((p) => !p.out)
    .sort((a, b) => a.value - b.value)
    .slice(0, DROP_POOL)

  const picks = []
  for (const entry of pool?.players || []) {
    if (sitsOut(entry?.injury_status)) continue
    const cand = {
      id: String(entry.sleeper_id),
      pos: String(entry.position || '').toUpperCase(),
      elig: eligOf(entry, 'nba'),
      value: perGame(entry, scoring),
      nights: nightsOf(entry, false),
      name: entry.name,
      entry,
    }
    if (cand.value <= 0 || ![...cand.nights].some((d) => openDays.has(d))) continue
    let best = null
    for (const drop of dropPool) {
      const trial = weekTotal([...mine.filter((p) => p.id !== drop.id), cand], days, slots)
      const gain = trial.total - base.total
      if (!best || gain > best.gain) best = { drop, gain, trial }
    }
    if (!best || best.gain < MIN_GAIN_GAMES * cand.value) continue
    const fills = days.filter((d) => best.trial.byDay[d].seated.has(cand.id))
    const lost = days.filter((d) => base.byDay[d].seated.has(best.drop.id))
    picks.push({ cand, drop: best.drop, gain: best.gain, fills, lost })
  }
  picks.sort((a, b) => b.gain - a.gain || b.cand.value - a.cand.value)
  return { days: dayRows, picks }
}
