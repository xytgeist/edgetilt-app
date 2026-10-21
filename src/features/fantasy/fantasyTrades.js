import { fantasyPosition } from './fantasyStartSit.js'
import { bestSeats, horizonValue, rowId } from './fantasyWaivers.js'

const SLOT_LABEL = { FLEX: 'FLEX', SUPER_FLEX: 'SUPERFLEX', WRRB_FLEX: 'W/R flex', REC_FLEX: 'W/T flex' }
/** Slightly aggressive, still realistic: they may lose a little lineup value and get ~88% of the value back. */
const THEIR_FLOOR = -0.75
const VALUE_BAND = 0.88
const MIN_GAIN = 0.5
/**
 * Counters answer an offer they started, so they get more room than a cold offer: up to -2/wk, and up to 1.75x
 * the per-game value back (2-for-1 consolidation premium for the side landing the best piece).
 */
const COUNTER_FLOOR = -2
const COUNTER_BAND = 1.75

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

function nameList(players) {
  const names = players.map((p) => p.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || ''
}

/** The casual "why" for you: the spot the incoming player fills, without spelling out the whole idea. */
function helpLine(players) {
  const pos = players[0]?.pos === 'DEF' ? 'D/ST' : players[0]?.pos
  return pos ? `I could use some help at ${pos}.` : ''
}

/** Text-a-friend version: no team names, no stat tags, no pitch for their side. */
function casualMessage(opener, give, get) {
  return [opener, '', `${nameList(give)} for ${nameList(get)}?`, '', [helpLine(get), 'Let me know what you think.'].filter(Boolean).join(' ')].join('\n')
}

/** Plain-text offer you can paste into the league app, a text, or an email. `style` 'casual' reads like a text to a friend. */
export function composeOfferMessage(offer, myTeamName, style = 'formal') {
  if (!offer) return ''
  if (style === 'casual') return casualMessage('Interested in a trade?', offer.give, offer.get)
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

  const rosters = new Map()
  for (const team of teams) {
    if (team.id === mine.id) continue
    const list = teamPlayers(detail.rostersByTeam?.[team.id], byId, scoring, sport)
    if (list.length) rosters.set(team.id, { team, list, base: total(list) })
  }
  /** Every rival whose lineup this free player would lift by 1.5+/wk (they would put in a claim too). */
  const wanting = (x) => {
    const out = []
    for (const { team, list, base } of rosters.values()) {
      const gain = total([...list, x]) - base
      if (gain >= 1.5) out.push({ team, gain })
    }
    return out.sort((a, b) => b.gain - a.gain)
  }

  const flips = []
  for (const team of teams) {
    if (team.id === mine.id) continue
    const entry = rosters.get(team.id)
    if (!entry) continue
    const theirs = entry.list
    const theirBase = entry.base
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
    if (best) flips.push({ ...best, rivalsWanting: wanting(need.x) })
  }
  flips.sort((a, b) => b.score - a.score)
  return flips.slice(0, 4)
}

/** The flip pitch, written as if the pickup already cleared (send it after your claim goes through). */
export function composeFlipMessage(flip, myTeamName, style = 'formal') {
  if (!flip) return ''
  const them = flip.team?.team_name || 'there'
  const status = flip.lost.h.injury === 'long' ? 'on IR' : flip.lost.h.injury === 'doubtful' ? 'banged up' : 'out'
  if (style === 'casual') return casualMessage(`Saw ${flip.lost.name} is ${status}, that sucks. Interested in a trade?`, flip.give, flip.get)
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

/** Who moves into and out of the best starting lineup, with their weekly projection. */
function lineupMoves(before, after) {
  const inn = after.seats.filter((s) => !before.seated.has(s.p.id)).map((s) => s.p)
  const out = before.seats.filter((s) => !after.seated.has(s.p.id)).map((s) => s.p)
  return { inn, out }
}

function moveLine({ inn, out }, whose) {
  if (!inn.length && !out.length) return whose === 'you' ? 'Your starting lineup stays the same.' : 'Their starting lineup stays the same.'
  const fmt = (list) => list.map((p) => `${p.name} (${p.pos === 'DEF' ? 'D/ST' : p.pos} ${p.value.toFixed(1)})`).join(', ')
  return [inn.length ? `In: ${fmt(inn)}` : '', out.length ? `Out: ${fmt(out)}` : ''].filter(Boolean).join('. ')
}

function evaluate({ myPlayers, theirs, giveIds, getIds, slots }) {
  const give = myPlayers.filter((p) => giveIds.has(p.id))
  const get = theirs.filter((p) => getIds.has(p.id))
  const myBefore = bestSeats(myPlayers, slots)
  const theirBefore = bestSeats(theirs, slots)
  const myAfter = bestSeats([...myPlayers.filter((p) => !giveIds.has(p.id)), ...get], slots)
  const theirAfter = bestSeats([...theirs.filter((p) => !getIds.has(p.id)), ...give], slots)
  const giveKeep = give.reduce((a, p) => a + p.keep, 0)
  const getKeep = get.reduce((a, p) => a + p.keep, 0)
  return {
    give,
    get,
    myGain: myAfter.total - myBefore.total,
    theirGain: theirAfter.total - theirBefore.total,
    valueEdge: getKeep - giveKeep,
    myMoves: lineupMoves(myBefore, myAfter),
    theirMoves: lineupMoves(theirBefore, theirAfter),
    myAfter,
    theirAfter,
  }
}

/**
 * Offer Review: grade an inbound (or any typed-in) offer in league scoring. `giveIds` are your players going
 * out, `getIds` are theirs coming in. Verdict leans on the weekly lineup gain over the next few weeks; counters
 * stay inside the Finder's "they could accept it" band.
 */
export function reviewOffer({ values, detail, scoring, slots, sport = 'nfl', teamId, giveIds, getIds }) {
  const byId = new Map((values?.league_players || []).map((p) => [String(p.sleeper_id), p]))
  const teams = detail?.teams || []
  const mine = teams.find((t) => t.is_mine)
  const team = teams.find((t) => t.id === teamId)
  if (!mine || !team || !slots?.length) return null
  const myPlayers = teamPlayers(detail.rostersByTeam?.[mine.id], byId, scoring, sport)
  const theirs = teamPlayers(detail.rostersByTeam?.[team.id], byId, scoring, sport)
  const give = new Set([...giveIds].map(String))
  const get = new Set([...getIds].map(String))
  if (!give.size || !get.size) return null
  const ev = evaluate({ myPlayers, theirs, giveIds: give, getIds: get, slots })

  // Receiving more bodies than you send means a cut; name the weakest bench player that keeps slots legal.
  const extra = ev.get.length - ev.give.length
  const drops =
    extra > 0
      ? [...myPlayers.filter((p) => !give.has(p.id)), ...ev.get]
          .filter((p) => !ev.myAfter.seated.has(p.id) && p.h.injury !== 'long')
          .sort((a, b) => a.keep - b.keep)
          .slice(0, extra)
      : []

  // Counters start from their offer: keep what they asked for and re-pick what comes back, keep their package
  // and send someone else, or trim / add one piece. Each must beat accepting by 0.75+/wk.
  const counters = []
  const names = (list) => list.map((p) => p.name).join(' + ')
  const tryCounter = (g, t, kind, why) => {
    if (!g.size || !t.size) return
    const key = `${[...g].sort().join(',')}|${[...t].sort().join(',')}`
    if (counters.some((x) => x.key === key)) return
    const c = evaluate({ myPlayers, theirs, giveIds: g, getIds: t, slots })
    if (c.myGain < Math.max(ev.myGain + 0.75, MIN_GAIN) || c.theirGain < COUNTER_FLOOR) return
    const giveKeep = c.give.reduce((a, p) => a + p.keep, 0)
    const getKeep = c.get.reduce((a, p) => a + p.keep, 0)
    if (getKeep > COUNTER_BAND * giveKeep && c.theirGain < 0.25) return
    counters.push({
      key,
      kind,
      why: why(c),
      team,
      give: c.give,
      get: c.get,
      myGain: c.myGain,
      theirGain: c.theirGain,
      fairness: fairnessFor(c.theirGain, -c.valueEdge),
      forThem: describeFor(c.give, c.theirAfter.seats),
      score: c.myGain + 0.6 * Math.min(c.theirGain, 3) - 0.2 * Math.max(0, c.give.length + c.get.length - 2),
    })
  }
  const tradeable = (p) => p.pos !== 'K' && p.pos !== 'DEF' && p.keep > 0
  const theirPool = theirs.filter(tradeable).sort((a, b) => b.keep - a.keep).slice(0, 12)
  const askFor = (list) => tryCounter(give, new Set(list.map((p) => p.id)), 'ask', (c) => `They want ${names(ev.give)}: ask for ${names(c.get)} instead`)
  for (let i = 0; i < theirPool.length; i++) {
    askFor([theirPool[i]])
    for (let j = i + 1; j < theirPool.length; j++) askFor([theirPool[i], theirPool[j]])
  }
  for (const z of theirPool.filter((p) => !get.has(p.id)).slice(0, 8)) {
    tryCounter(give, new Set([...get, z.id]), 'more', () => `Ask them to add ${z.name}`)
  }
  if (give.size > 1) for (const id of give) {
    const p = ev.give.find((x) => x.id === id)
    tryCounter(new Set([...give].filter((x) => x !== id)), get, 'keep', () => `Keep ${p?.name || 'one of yours'} out of it`)
  }
  for (const p of myPlayers.filter((x) => tradeable(x) && !give.has(x.id))) {
    tryCounter(new Set([p.id]), get, 'swap', () => `Take their package, send ${p.name} instead of ${names(ev.give)}`)
  }
  counters.sort((a, b) => b.score - a.score)
  // One of each kind first so the advice is not three versions of the same ask.
  const ids = (list) => list.map((p) => p.id)
  const padded = (c) =>
    counters.some(
      (x) =>
        x !== c &&
        ids(x.give).join() === ids(c.give).join() &&
        x.get.length < c.get.length &&
        ids(x.get).every((id) => ids(c.get).includes(id)) &&
        c.myGain < x.myGain + 0.5,
    )
  const useful = counters.filter((c) => !padded(c))
  const picked = []
  for (const c of useful) if (!picked.some((x) => x.kind === c.kind) && picked.length < 3) picked.push(c)
  for (const c of useful) if (!picked.includes(c) && picked.length < 3) picked.push(c)
  picked.sort((a, b) => b.score - a.score)

  let verdict
  let confidence
  if (ev.myGain >= 1 && ev.myGain < 2.5 && ev.valueEdge < -4) {
    verdict = counters.length ? 'Counter' : 'Accept'
    confidence = 'Low'
  } else if (ev.myGain >= 1) {
    verdict = 'Accept'
    confidence = ev.myGain >= 2.5 ? 'High' : 'Medium'
  } else if (ev.myGain > -1) {
    verdict = counters.length ? 'Counter' : ev.myGain >= 0 ? 'Accept' : 'Decline'
    confidence = 'Low'
  } else {
    verdict = counters.length && ev.myGain > -2.5 ? 'Counter' : 'Decline'
    confidence = ev.myGain <= -2.5 ? 'High' : 'Medium'
  }

  let betterAsk = null
  if (verdict === 'Decline' && !picked.length) {
    const alt = findTrades({ values, detail: { ...detail, teams: [mine, team] }, scoring, slots, sport })
    betterAsk = alt.best
  }

  const theirAngle =
    ev.theirGain >= 0.25
      ? `Their lineup gains ${ev.theirGain.toFixed(1)}/wk: ${moveLine(ev.theirMoves, 'them')}`
      : ev.valueEdge < -1
        ? `They get more total value (+${(-ev.valueEdge).toFixed(1)} pts/gm across the players) even if their lineup ${ev.theirGain >= -0.25 ? 'holds steady' : 'dips'}.`
        : `Their lineup ${ev.theirGain >= -0.25 ? 'holds steady' : `drops ${(-ev.theirGain).toFixed(1)}/wk`}: ${moveLine(ev.theirMoves, 'them')}`

  const stashes = ev.give.filter((p) => p.h.injury === 'long' || p.h.injury === 'out').map((p) => p.name)
  const valueNote =
    ev.valueEdge <= -2
      ? `You send ${(-ev.valueEdge).toFixed(1)} more pts/gm of player value than you get${stashes.length ? ` (${stashes.join(' and ')} ${stashes.length > 1 ? 'are stashes' : 'is a stash'} for when healthy)` : ''}.`
      : ev.valueEdge >= 2
        ? `You get ${ev.valueEdge.toFixed(1)} more pts/gm of player value than you send.`
        : 'Player value is about even.'

  return {
    team,
    verdict,
    confidence,
    valueNote,
    give: ev.give,
    get: ev.get,
    myGain: ev.myGain,
    theirGain: ev.theirGain,
    valueEdge: ev.valueEdge,
    needYou: moveLine(ev.myMoves, 'you'),
    theirAngle,
    drops,
    counters: picked,
    betterAsk,
  }
}

function nameKeys(name) {
  const clean = String(name || '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').trim()
  const parts = clean.split(/\s+/)
  return { full: clean, last: parts[parts.length - 1] || '', initial: parts.length > 1 ? `${parts[0][0]} ${parts[parts.length - 1]}` : clean }
}

/**
 * Paste the host's trade notice (or any text naming the players). Players are matched to the two rosters by
 * full name, then "F. Last", then a unique last name. Your players are the ones you'd give.
 */
export function parseOfferText(text, detail) {
  const teams = detail?.teams || []
  const mine = teams.find((t) => t.is_mine)
  if (!mine || !text) return null
  const hay = ` ${String(text).toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
  const rows = []
  for (const team of teams) {
    for (const row of detail.rostersByTeam?.[team.id] || []) {
      const id = rowId(row)
      if (id && row.player_name) rows.push({ team, id, keys: nameKeys(row.player_name) })
    }
  }
  const lastCount = {}
  for (const r of rows) lastCount[r.keys.last] = (lastCount[r.keys.last] || 0) + 1
  const hits = rows.filter(
    (r) =>
      hay.includes(` ${r.keys.full} `) ||
      hay.includes(` ${r.keys.initial} `) ||
      (lastCount[r.keys.last] === 1 && r.keys.last.length > 3 && hay.includes(` ${r.keys.last} `)),
  )
  const giveIds = hits.filter((r) => r.team.id === mine.id).map((r) => r.id)
  const others = hits.filter((r) => r.team.id !== mine.id)
  const tally = {}
  for (const r of others) tally[r.team.id] = (tally[r.team.id] || 0) + 1
  const teamId = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null
  return { teamId, giveIds, getIds: others.filter((r) => r.team.id === teamId).map((r) => r.id) }
}

/** Counter pitch for an offer they sent you. */
export function composeCounterMessage(counter, myTeamName, style = 'formal') {
  if (!counter) return ''
  if (style === 'casual') return casualMessage('Thanks for the offer! What about this instead?', counter.give, counter.get)
  const them = counter.team?.team_name || 'there'
  return [
    `Hey ${them}, thanks for the offer. ${myTeamName || 'I'} would do this instead:`,
    '',
    `You get: ${counter.give.map(playerLine).join(' + ')}`,
    `I get: ${counter.get.map(playerLine).join(' + ')}`,
    '',
    `Why it still works for you: ${counter.forThem}${counter.theirGain >= 0.25 ? `, about +${counter.theirGain.toFixed(1)} projected pts a week for your lineup` : ''}.`,
  ].join('\n')
}
