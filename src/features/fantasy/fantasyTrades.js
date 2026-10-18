import { fantasyPosition } from './fantasyStartSit.js'
import { bestSeats, horizonValue, rowId } from './fantasyWaivers.js'

const SLOT_LABEL = { FLEX: 'FLEX', SUPER_FLEX: 'SUPERFLEX', WRRB_FLEX: 'W/R flex', REC_FLEX: 'W/T flex' }
/** Slightly aggressive, still realistic: they may lose a little lineup value and get ~88% of the value back. */
const THEIR_FLOOR = -0.75
const VALUE_BAND = 0.88
const MIN_GAIN = 0.5

function slotLabel(slot) {
  return SLOT_LABEL[slot] || slot
}

function teamPlayers(rows, byId, scoring, sport) {
  return (rows || [])
    .filter((row) => rowId(row) && (row.slot === 'starter' || row.slot === 'bench'))
    .map((row) => {
      const id = rowId(row)
      const entry = byId.get(id) || { position: row.position, weeks: [] }
      const h = horizonValue(entry, scoring, row.injury_status ?? entry.injury_status, sport)
      return {
        id,
        pos: fantasyPosition(row.position),
        value: h.avg,
        keep: h.known ? Math.max(h.avg, h.healthy) : h.avg,
        h,
        row,
        name: row.player_name,
        team: row.nfl_team || entry.team || '',
      }
    })
}

function seatOf(seats, id) {
  return seats.find((s) => s.p.id === id)?.slot || null
}

function describeFor(players, seats) {
  return players
    .map((p) => {
      const slot = seatOf(seats, p.id)
      const perGame = `~${p.keep.toFixed(1)} pts/gm`
      if (p.h.injury === 'long' || p.h.injury === 'out') return `${p.name} is a ${p.pos} stash worth ${perGame} once healthy`
      if (slot) return `${p.name} starts at ${slotLabel(slot)} for you (${perGame})`
      return `${p.name} adds ${p.pos} depth (${perGame}) for byes and injuries`
    })
    .join('; ')
}

function fairnessFor(theirGain, valueEdge) {
  if (theirGain >= 0.25) return 'Win-win'
  if (valueEdge >= 1) return 'Value for them'
  if (theirGain >= -0.25) return 'Even'
  return 'Slight edge you'
}

/**
 * Trade Finder v1: 1-for-1 and 2-for-1 offers that raise your best starting lineup per week while the
 * other team loses little or gains, inside a value band so the offer is one they could accept.
 * Returns `{ best, ifDeclined, alsoConsider }` in the shape of the suite plan.
 */
export function findTrades({ values, detail, scoring, slots, sport = 'nfl' }) {
  const byId = new Map((values?.league_players || []).map((p) => [String(p.sleeper_id), p]))
  const teams = detail?.teams || []
  const mine = teams.find((t) => t.is_mine)
  if (!mine || !slots?.length) return { best: null, ifDeclined: [], alsoConsider: [] }
  const total = (list) => bestSeats(list, slots).total
  const myPlayers = teamPlayers(detail.rostersByTeam?.[mine.id], byId, scoring, sport)
  const myBase = total(myPlayers)
  const tradeable = (list) => list.filter((p) => p.pos !== 'K' && p.pos !== 'DEF' && p.keep > 0)
  const myOut = tradeable(myPlayers).sort((a, b) => b.keep - a.keep)
  const pairs = []
  const pairPool = myOut.slice(0, 10)
  for (let i = 0; i < pairPool.length; i++) {
    for (let j = i + 1; j < pairPool.length; j++) pairs.push([pairPool[i], pairPool[j]])
  }
  const gives = [...myOut.map((p) => [p]), ...pairs]

  const byTeam = []
  for (const team of teams) {
    if (team.id === mine.id) continue
    const theirs = teamPlayers(detail.rostersByTeam?.[team.id], byId, scoring, sport)
    if (!theirs.length) continue
    const theirBase = total(theirs)
    const offers = []
    for (const get of tradeable(theirs)) {
      for (const give of gives) {
        const giveIds = new Set(give.map((p) => p.id))
        const giveKeep = give.reduce((a, p) => a + p.keep, 0)
        if (giveKeep < VALUE_BAND * get.keep) continue
        const newMine = [...myPlayers.filter((p) => !giveIds.has(p.id)), get]
        const mySeats = bestSeats(newMine, slots)
        const myGain = mySeats.total - myBase
        if (myGain < MIN_GAIN) continue
        const newTheirs = [...theirs.filter((p) => p.id !== get.id), ...give]
        const theirSeats = bestSeats(newTheirs, slots)
        const theirGain = theirSeats.total - theirBase
        if (theirGain < THEIR_FLOOR) continue
        offers.push({
          team,
          give,
          get: [get],
          myGain,
          theirGain,
          score: myGain + 0.4 * Math.min(theirGain, 3) - 0.15 * (give.length - 1),
          fairness: fairnessFor(theirGain, giveKeep - get.keep),
          forYou: `${get.name} starts at ${slotLabel(seatOf(mySeats.seats, get.id) || get.pos)} (+${myGain.toFixed(1)}/wk)`,
          forThem: describeFor(give, theirSeats.seats),
        })
      }
    }
    offers.sort((a, b) => b.score - a.score)
    const distinct = []
    for (const o of offers) {
      const key = `${o.get[0].id}|${o.give.map((p) => p.id).sort().join(',')}`
      if (distinct.some((d) => d.key === key)) continue
      if (distinct.some((d) => d.o.get[0].id === o.get[0].id && d.o.give.length === o.give.length && d.o.give[0].id === o.give[0].id)) continue
      distinct.push({ key, o })
      if (distinct.length >= 3) break
    }
    if (distinct.length) byTeam.push(distinct.map((d) => d.o))
  }

  byTeam.sort((a, b) => b[0].score - a[0].score)
  const [top, ...rest] = byTeam
  return {
    best: top ? top[0] : null,
    ifDeclined: top ? top.slice(1, 3) : [],
    alsoConsider: rest.slice(0, 2).map((list) => list[0]),
  }
}

function playerLine(p) {
  const pos = p.pos === 'DEF' ? 'D/ST' : p.pos
  return `${p.name} (${pos}${p.team ? `, ${p.team}` : ''})`
}

/** Plain-text offer you can paste into the league app, a text, or an email. */
export function composeOfferMessage(offer, myTeamName) {
  if (!offer) return ''
  const them = offer.team?.team_name || 'there'
  const lines = [
    `Hey ${them}, trade idea from ${myTeamName || 'me'}:`,
    '',
    `You get: ${offer.give.map(playerLine).join(' + ')}`,
    `I get: ${offer.get.map(playerLine).join(' + ')}`,
    '',
    `Why it works for you: ${offer.forThem}${offer.theirGain >= 0.25 ? `, about +${offer.theirGain.toFixed(1)} projected pts a week for your lineup` : ''}.`,
    '',
    'Open to tweaks if you want to counter.',
  ]
  return lines.join('\n')
}

function isHurt(p) {
  return p.h.injury === 'out' || p.h.injury === 'long' || p.h.injury === 'doubtful'
}

/**
 * Snipe & flip: a rival lost a starter (out / IR / doubtful) and the best free player at that position would
 * fill the hole. Claim him, then offer him (alone or with one of your surplus players) for one of theirs that
 * improves your lineup. Same acceptance band as the trade finder.
 */
export function findFlips({ values, pool, detail, scoring, slots, sport = 'nfl' }) {
  const byId = new Map((values?.league_players || []).map((p) => [String(p.sleeper_id), p]))
  const teams = detail?.teams || []
  const mine = teams.find((t) => t.is_mine)
  if (!mine || !slots?.length) return []
  const total = (list) => bestSeats(list, slots).total
  const myPlayers = teamPlayers(detail.rostersByTeam?.[mine.id], byId, scoring, sport)
  const mySeats = bestSeats(myPlayers, slots)
  const myBase = mySeats.total
  const surplus = myPlayers
    .filter((p) => !mySeats.seated.has(p.id) && p.pos !== 'K' && p.pos !== 'DEF' && p.keep > 0 && !isHurt(p))
    .sort((a, b) => b.keep - a.keep)
    .slice(0, 6)

  const free = (pool?.players || [])
    .map((entry) => {
      const h = horizonValue(entry, scoring, entry.injury_status, sport)
      return {
        id: String(entry.sleeper_id),
        pos: fantasyPosition(entry.position),
        value: h.avg,
        keep: h.known ? Math.max(h.avg, h.healthy) : h.avg,
        h,
        row: { position: entry.position, injury_status: entry.injury_status },
        name: entry.name,
        team: entry.team || '',
        entry,
      }
    })
    .filter((p) => p.pos !== 'K' && p.pos !== 'DEF' && p.value > 0 && !isHurt(p))
    .sort((a, b) => b.value - a.value)
    .slice(0, 60)

  const flips = []
  for (const team of teams) {
    if (team.id === mine.id) continue
    const theirs = teamPlayers(detail.rostersByTeam?.[team.id], byId, scoring, sport)
    if (!theirs.length) continue
    const theirBase = total(theirs)
    const hurtStarters = theirs.filter(isHurt).sort((a, b) => b.keep - a.keep)
    if (!hurtStarters.length) continue

    let need = null
    for (const x of free) {
      const lost = hurtStarters.find((p) => p.pos === x.pos)
      if (!lost) continue
      const gain = total([...theirs, x]) - theirBase
      if (gain < 1.5) continue
      if (!need || gain > need.gain) need = { x, lost, gain }
    }
    if (!need) continue

    const packages = [[need.x], ...surplus.filter((y) => y.id !== need.x.id).map((y) => [need.x, y])]
    let best = null
    for (const z of theirs.filter((p) => p.pos !== 'K' && p.pos !== 'DEF' && !isHurt(p))) {
      for (const give of packages) {
        const giveKeep = give.reduce((a, p) => a + p.keep, 0)
        if (giveKeep < 0.88 * z.keep) continue
        const mineIds = new Set(give.map((p) => p.id))
        const newMine = [...myPlayers.filter((p) => !mineIds.has(p.id)), z]
        const myAfter = bestSeats(newMine, slots)
        const myGain = myAfter.total - myBase
        if (myGain < 0.5) continue
        const newTheirs = [...theirs.filter((p) => p.id !== z.id), ...give]
        const theirAfter = bestSeats(newTheirs, slots)
        const theirGain = theirAfter.total - theirBase
        if (theirGain < -0.75) continue
        const score = myGain + 0.3 * Math.min(theirGain, 4) - 0.2 * (give.length - 1)
        if (!best || score > best.score) {
          best = {
            team,
            pickup: need.x,
            lost: need.lost,
            fillGain: need.gain,
            give,
            get: [z],
            myGain,
            theirGain,
            score,
            fairness: theirGain >= 0.25 ? 'Win-win' : theirGain >= -0.25 ? 'Even' : 'Slight edge you',
            forYou: `${z.name} starts at ${slotLabel(seatOf(myAfter.seats, z.id) || z.pos)} (+${myGain.toFixed(1)}/wk)`,
            forThem: `${need.x.name} steps in for ${need.lost.name}${give.length > 1 ? `, plus ${give.slice(1).map((p) => p.name).join(' and ')}` : ''}`,
          }
        }
      }
    }
    if (best) flips.push(best)
  }
  flips.sort((a, b) => b.score - a.score)
  return flips.slice(0, 4)
}

/** The flip pitch, written as if the pickup already cleared (send it after your claim goes through). */
export function composeFlipMessage(flip, myTeamName) {
  if (!flip) return ''
  const them = flip.team?.team_name || 'there'
  const status = flip.lost.h.injury === 'long' ? 'on IR' : flip.lost.h.injury === 'doubtful' ? 'banged up' : 'out'
  return [
    `Hey ${them}, saw ${flip.lost.name} is ${status}. ${myTeamName || 'I'} can help:`,
    '',
    `You get: ${flip.give.map(playerLine).join(' + ')}`,
    `I get: ${flip.get.map(playerLine).join(' + ')}`,
    '',
    `${flip.pickup.name} can step right into ${flip.lost.name}'s spot${flip.theirGain >= 0.25 ? `, about +${flip.theirGain.toFixed(1)} projected pts a week for your lineup` : ''}.`,
    '',
    'Open to tweaks if you want to counter.',
  ].join('\n')
}
