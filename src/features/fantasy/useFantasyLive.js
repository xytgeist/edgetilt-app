/**
 * Fantasy Live: which NFL games hold either side's starters, and the plays in those games that scored for them.
 * Board ids come from the Lounge scoreboard (not ESPN), matched to roster teams by abbreviation. Polls only
 * while the Live tab is on screen and the page is visible.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loungeNflGameFantasy, loungeSportsGameDetail, loungeSportsScoreboard, readLoungeSportsScoreboardCache } from '../../utils/loungeSportsApi.js'
import { teamsMatch } from '../lounge/gameHub/gameHubFormatters.js'
import { playFantasyPoints } from '../lounge/gameHub/gameHubPlayFantasy.js'
import { fantasyPosition } from './fantasyStartSit.js'

const POLL_MS = 30000
const NFL = 'americanfootball_nfl'

function nflGames(list) {
  return (Array.isArray(list) ? list : []).filter((g) => String(g?.sport_key || '').includes(NFL) && g?.home?.abbrev && g?.away?.abbrev)
}

function starters(rows) {
  return (rows || []).filter((r) => r?.slot === 'starter' && r?.nfl_team)
}

function onTeam(rows, abbrev) {
  return rows.filter((r) => teamsMatch(r.nfl_team, abbrev))
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/** Games this week (live, starting soon, just final) with each side's starters in them. */
export function useLiveGames({ supabaseClient, active, leftRows, rightRows }) {
  const visible = usePageVisible()
  const [board, setBoard] = useState(() => nflGames(readLoungeSportsScoreboardCache()))
  useEffect(() => {
    if (!supabaseClient || !active || !visible) return undefined
    let alive = true
    const load = () =>
      loungeSportsScoreboard(supabaseClient, { scope: 'active' }).then((data) => {
        if (alive && Array.isArray(data?.games)) setBoard(nflGames(data.games))
      })
    void load()
    const t = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [supabaseClient, active, visible])

  return useMemo(() => {
    const left = starters(leftRows)
    const right = starters(rightRows)
    const out = []
    for (const g of board) {
      const leftIn = [...onTeam(left, g.home.abbrev), ...onTeam(left, g.away.abbrev)]
      const rightIn = [...onTeam(right, g.home.abbrev), ...onTeam(right, g.away.abbrev)]
      if (!leftIn.length && !rightIn.length) continue
      out.push({ game: g, left: leftIn, right: rightIn })
    }
    const rank = { in: 0, pre: 1, post: 2 }
    return out.sort(
      (a, b) =>
        (rank[a.game.status] ?? 3) - (rank[b.game.status] ?? 3) ||
        Date.parse(a.game.commence_time || 0) - Date.parse(b.game.commence_time || 0),
    )
  }, [board, leftRows, rightRows])
}

/**
 * Plays in live games that earned (or cost) either side's starters points, newest first. A play's "newest"
 * is when we first saw it, so plays across games interleave in real order after the first load.
 */
export function useLivePlays({ supabaseClient, active, games, rates }) {
  const visible = usePageVisible()
  const live = useMemo(() => games.filter((x) => x.game.status === 'in'), [games])
  const liveKey = live.map((x) => x.game.id).join(',')
  const rostersRef = useRef(new Map())
  const [feed, setFeed] = useState({})

  useEffect(() => {
    if (!supabaseClient || !active || !visible || !liveKey) return undefined
    let alive = true
    const ids = liveKey.split(',')
    const load = async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          const entry = live.find((x) => String(x.game.id) === id)
          if (!entry) return [id, null]
          const g = entry.game
          if (!rostersRef.current.has(id)) {
            const fan = await loungeNflGameFantasy(supabaseClient, { eventId: id, awayAbbrev: g.away.abbrev, homeAbbrev: g.home.abbrev })
            if (Array.isArray(fan?.players)) rostersRef.current.set(id, fan.players)
          }
          const detail = await loungeSportsGameDetail(supabaseClient, id, { omitRosters: true })
          return [id, Array.isArray(detail?.plays) ? detail.plays : null, rostersRef.current.get(id) || []]
        }),
      )
      if (!alive) return
      const now = Date.now()
      setFeed((prev) => {
        const next = { ...prev }
        for (const [id, list, players] of results) {
          if (!list) continue
          const seen = new Map((prev[id]?.plays || []).map((p) => [p.id, p.seen]))
          next[id] = { players, plays: list.map((p) => ({ ...p, seen: seen.get(p.id) ?? now })) }
        }
        return next
      })
    }
    void load()
    const t = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
    // `live` rows change identity every board poll; the id list is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseClient, active, visible, liveKey])

  return useMemo(() => {
    const out = []
    for (const { game, left, right } of games) {
      const list = feed[game.id]?.plays
      if (!list?.length) continue
      const players = feed[game.id].players
      const leftIds = new Set(left.map((r) => String(r.sleeper_id || '')).filter(Boolean))
      const rightIds = new Set(right.map((r) => String(r.sleeper_id || '')).filter(Boolean))
      const leftDef = left.filter((r) => fantasyPosition(r.position) === 'DEF')
      const rightDef = right.filter((r) => fantasyPosition(r.position) === 'DEF')
      list.forEach((play, idx) => {
        const offense = play.team === 'home' ? game.home : play.team === 'away' ? game.away : null
        const defense = play.team === 'home' ? game.away : play.team === 'away' ? game.home : null
        const rows = playFantasyPoints(play.description, {
          players,
          offenseAbbrev: offense?.abbrev || '',
          defenseAbbrev: defense?.abbrev || '',
          defenseLogo: defense?.logo || '',
          turnover: Boolean(play.turnover),
          rates,
        })
        for (const r of rows) {
          let side = null
          if (r.position === 'DEF') {
            if (leftDef.some((d) => teamsMatch(d.nfl_team, r.name))) side = 'left'
            else if (rightDef.some((d) => teamsMatch(d.nfl_team, r.name))) side = 'right'
          } else if (r.sleeperId) {
            if (leftIds.has(r.sleeperId)) side = 'left'
            else if (rightIds.has(r.sleeperId)) side = 'right'
          }
          if (!side) continue
          out.push({ ...r, key: `${game.id}:${play.id || idx}:${r.key}`, side, game, play, idx, seen: play.seen })
        }
      })
    }
    return out.sort((a, b) => b.seen - a.seen || b.idx - a.idx).slice(0, 25)
  }, [games, feed, rates])
}
