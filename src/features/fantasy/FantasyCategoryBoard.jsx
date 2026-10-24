/**
 * Categories-league matchup UI (ESPN / Yahoo NBA H2H categories): the matchup card's category score, and the
 * category board under it (projected finals per category, win chance per category and overall). Math lives in
 * `fantasyCategories.js`.
 */
import { useMemo } from 'react'
import { categoryOutlook, sideProjection } from './fantasyCategories.js'

const CAT_GRID = 'grid grid-cols-[3rem_minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-x-2 px-1.5'

function startersOf(rows) {
  return (rows || []).filter((r) => r.slot === 'starter')
}

function shortTeamName(team) {
  const name = String(team?.team_name || '').trim()
  return name.length > 14 ? `${name.slice(0, 13)}…` : name
}

/** Categories leagues list their scored categories in settings (ESPN / Yahoo sync); points leagues have none. */
export function leagueCategories(league) {
  const list = league?.settings?.categories
  return Array.isArray(list) && list.length ? list : null
}

/** Season-long formats with no weekly matchup: ESPN ROTO / TOTAL_SEASON_POINTS, Yahoo roto / point. */
export function seasonLongFormat(league) {
  const t = String(league?.settings?.scoring_type || '').toUpperCase()
  if (t === 'ROTO') return 'roto'
  if (t === 'TOTAL_SEASON_POINTS' || t === 'POINT') return 'points'
  return null
}

function standingTotal(team) {
  const n = Number(team?.metadata?.standings?.points ?? team?.points_for)
  return Number.isFinite(n) ? n : 0
}

/** Teams by host season total, best first; `started` once anyone has scored. */
export function seasonStandingRows(teams) {
  const rows = (teams || []).map((t) => ({ t, total: standingTotal(t), stats: t?.metadata?.standings?.stats || {} })).sort((a, b) => b.total - a.total)
  return { rows, started: rows.some((r) => r.total > 0) }
}

export function seasonStatCell(key, v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  if (/_pct$/.test(key)) return n > 0 ? n.toFixed(3).replace(/^0/, '') : '-'
  return String(Math.round(n))
}

/** One side's starters: per-game lines (market blended) with games still to play and games already in the host totals. */
function categorySide(roster, cards, upcoming = false) {
  const remaining = []
  const played = []
  for (const row of startersOf(roster)) {
    const card = row?.sleeper_id ? cards?.[row.sleeper_id] : null
    if (!card?.proj_line) continue
    const line = { ...card.proj_line, ...(card.market_line || {}) }
    // An upcoming week (not started): next week's games, nothing played yet.
    const live = !upcoming && card.game_status === 'in_progress'
    let left = upcoming ? Number(card.games_next) || 0 : Number(card.games_left) || 0
    if (!live && String(row.injury_status || '').toLowerCase() === 'out' && left > 0) left -= 1
    const progress = live ? Math.min(1, Math.max(0, Number(card.game_progress) || 0.5)) : 0
    remaining.push({ line, games: left + (live ? 1 - progress : 0) })
    played.push({ line, games: upcoming ? 0 : (Number(card.games_played) || 0) + (live ? progress : 0) })
  }
  return { remaining, played }
}

/** Category-by-category projection and win chances for a categories matchup (null for points leagues / byes). */
export function useCategoryMatchup(page, cards, categories, upcoming = false) {
  return useMemo(() => {
    if (!categories?.length || !page?.right) return null
    const c = upcoming ? {} : page.categories || {}
    const L = categorySide(page.roster, cards, upcoming)
    const R = categorySide(page.oppRoster, cards, upcoming)
    const left = sideProjection(categories, c.left || {}, L.remaining, L.played)
    const right = sideProjection(categories, c.right || {}, R.remaining, R.played)
    return { ...categoryOutlook(categories, left, right), record: { wins: Number(c.wins) || 0, losses: Number(c.losses) || 0, ties: Number(c.ties) || 0 } }
  }, [page, cards, categories, upcoming])
}

function catValue(side, digits = 0) {
  if (!side) return '-'
  if (side.pct) return side.mean > 0 ? side.mean.toFixed(3).replace(/^0/, '') : '-'
  return digits ? side.mean.toFixed(digits) : String(Math.round(side.mean))
}

/** `playing`: a starter on this side is in a game right now (same rule as the points card's LIVE). */
export function CategoryScoreLine({ won, expected, align, lead, playing = false }) {
  const end = align === 'right'
  return (
    <div className={`min-w-0 ${end ? 'text-right' : 'text-left'}`}>
      <div
        className={`text-[26px] font-bold tabular-nums leading-none ${lead === 'trail' ? 'fantasy-vs-trail' : lead === 'lead' ? 'fantasy-vs-lead' : ''}`}
      >
        {won}
      </div>
      <div className={`mt-1 flex items-baseline gap-1.5 ${end ? 'justify-end' : ''}`}>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {playing ? (
            <span data-fantasy-live-dot aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="fantasy-live-dot-halo absolute inline-flex h-full w-full rounded-full motion-safe:animate-ping" />
              <span className="fantasy-live-dot-core relative inline-flex h-1.5 w-1.5 rounded-full" />
            </span>
          ) : null}
          {playing ? 'Live · proj' : 'Cats · proj'}
        </span>
        <span className="text-[11px] font-bold tabular-nums text-zinc-300">{expected.toFixed(1)}</span>
      </div>
    </div>
  )
}

/** Categories table under a categories matchup: each category's projected final for both sides and your win chance. */
export function CategoryBoard({ page, cards, categories, upcoming = false }) {
  const cat = useCategoryMatchup(page, cards, categories, upcoming)
  if (!cat) return null
  return (
    <div data-fantasy-cat-board className="fantasy-card-lift rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-bold text-zinc-100">Categories</div>
        <span className="text-[11px] font-semibold tabular-nums text-zinc-400">
          {cat.expected.toFixed(1)} of {cat.total} projected · {Math.round(cat.win * 100)}% to win
        </span>
      </div>
      {/* Value columns are centered and every other row is banded so a category reads straight across. */}
      <div className="mt-2 text-[12px] tabular-nums">
        <div className={`${CAT_GRID} pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500`}>
          <span>Cat</span>
          <span className="truncate text-center">{shortTeamName(page.left) || 'You'}</span>
          <span className="text-center">Win</span>
          <span className="truncate text-center">{shortTeamName(page.right) || 'Opp'}</span>
        </div>
        {cat.cats.map((c, i) => (
          <div key={c.key} data-fantasy-cat-stripe={i % 2 === 0 ? '' : undefined} className={`${CAT_GRID} rounded-md py-1`}>
            <span className="font-semibold text-zinc-300">{c.label}</span>
            <span className={`text-center ${c.p >= 0.5 ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>{catValue(c.left)}</span>
            <span
              className={`text-center text-[11px] font-bold ${c.p >= 0.6 ? 'fantasy-proj-up' : c.p <= 0.4 ? 'fantasy-proj-down' : 'text-zinc-400'}`}
            >
              {Math.round(c.p * 100)}%
            </span>
            <span className={`text-center ${c.p < 0.5 ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>{catValue(c.right)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        {upcoming
          ? "Projected finals for next week: each starter's per-game projection times his games that week."
          : "Projected finals: totals so far plus each starter's per-game projection for the games left this week."}
      </p>
    </div>
  )
}
