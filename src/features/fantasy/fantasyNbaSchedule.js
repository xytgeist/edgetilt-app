import { bestSeats, eligOf, rowId } from './fantasyWaivers.js'

const ET_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_MS = 86_400_000

export const etToday = (now = Date.now()) => ET_DATE.format(now)

function sitsOut(status) {
  const s = String(status || '').trim().toLowerCase()
  return /^(o|out|ir|inj|sus|suspended|na)$/.test(s) || s.includes('reserve')
}

const prevDate = (date) => new Date(Date.parse(`${date}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10)

/** Players on this side who can start (starter / bench rows), with their week `wk` games keyed by date. */
function sidePlayers(rows, cards, wk) {
  return (rows || [])
    .filter((row) => rowId(row) && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const card = cards?.[rowId(row)] || null
      const games = new Map()
      const all = new Set((card?.schedule || []).map((g) => g.date))
      for (const g of card?.schedule || []) {
        if (g.wk !== wk) continue
        games.set(g.date, { ...g, b2b: all.has(prevDate(g.date)) })
      }
      return {
        id: rowId(row),
        row,
        card,
        pos: String(row.position || card?.pos || '').toUpperCase(),
        elig: card?.elig?.length ? card.elig : eligOf(null, 'nba'),
        out: sitsOut(row.injury_status),
        games,
        value: 1,
      }
    })
}

/** Nights a lineup can still use: each night, how many slots this side can fill with healthy players who play. */
function nightStarts(players, slots, dates, today) {
  const out = {}
  for (const d of dates) {
    const playing = players.filter((p) => !p.out && p.games.get(d) && p.games.get(d).state !== 'post')
    out[d] = d < today ? null : bestSeats(playing, slots).seats.length
  }
  return out
}

/**
 * NBA schedule planner for one matchup: night columns for week `wk` (0 this week, 1 next), my rows with each game
 * (opponent, home / away, back-to-back), per-night starts (slots this side can fill), and starts left per side.
 */
export function schedulePlan({ mine, opp, cards, slots, wk = 0, now = Date.now() }) {
  const today = etToday(now)
  const me = sidePlayers(mine, cards, wk)
  const them = sidePlayers(opp, cards, wk)
  const dates = [...new Set([...me, ...them].flatMap((p) => [...p.games.keys()]))].sort()
  const starts = nightStarts(me, slots, dates, today)
  const oppStarts = nightStarts(them, slots, dates, today)
  const sum = (by) => Object.values(by).reduce((a, n) => a + (n || 0), 0)
  const left = (p) => [...p.games.values()].filter((g) => g.state !== 'post' && g.date >= today).length
  const rows = me
    .map((p) => ({ ...p, left: p.out ? 0 : left(p) }))
    .sort((a, b) => (a.row.slot === b.row.slot ? 0 : a.row.slot === 'starter' ? -1 : 1) || b.left - a.left)
  return {
    today,
    dates,
    rows,
    starts,
    slots: slots.length,
    mineLeft: sum(starts),
    oppLeft: opp?.length ? sum(oppStarts) : null,
  }
}
