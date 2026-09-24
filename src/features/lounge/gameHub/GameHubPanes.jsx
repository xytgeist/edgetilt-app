import { useEffect, useMemo, useState } from 'react'
import { american, formatPostAge, ordinal, periodLabel, signedPoint } from './gameHubFormatters.js'
import { feedPostDisplayCaption } from '../../../utils/communityFeedPost.js'

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function americanToImplied(ml) {
  const n = numOrNull(ml)
  if (n == null || n === 0) return null
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100)
}

function median(values) {
  const a = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/**
 * Book furthest from the median consensus across spread / total / ML.
 * Needs ≥3 books so "consensus" means something.
 */
function biggestConsensusDeltaBook(books) {
  const list = Array.isArray(books) ? books : []
  if (list.length < 3) return null

  const medSpread = median(list.map((b) => numOrNull(b.home_spread)))
  const medTotal = median(list.map((b) => numOrNull(b.total)))
  const medMl = median(list.map((b) => americanToImplied(b.home_ml)))

  let best = null
  for (const b of list) {
    const deltas = []
    const sp = numOrNull(b.home_spread)
    const tot = numOrNull(b.total)
    const ml = americanToImplied(b.home_ml)
    // Normalize: 1 spread/total point ≈ 1; ML uses percentage points.
    if (sp != null && medSpread != null) deltas.push(Math.abs(sp - medSpread))
    if (tot != null && medTotal != null) deltas.push(Math.abs(tot - medTotal))
    if (ml != null && medMl != null) deltas.push(Math.abs(ml - medMl) * 100)
    if (!deltas.length) continue
    const score = Math.max(...deltas)
    if (!best || score > best.score) best = { book: b.book, score }
  }
  // Ignore noise (half a point / half a % still looks like agreement).
  if (!best || best.score < 0.5) return null
  return best.book
}

export function BoxScoreCard({ game }) {
  const awayLines = Array.isArray(game.away?.linescores) ? game.away.linescores : []
  const homeLines = Array.isArray(game.home?.linescores) ? game.home.linescores : []
  const cols = Math.max(awayLines.length, homeLines.length, 0)
  const live = game.status === 'in'
  const final = game.status === 'post'

  return (
    <div data-lounge-game-box className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>
          {game.sport_label}
          {game.commence_time
            ? ` · ${new Date(game.commence_time).toLocaleDateString(undefined, { weekday: 'short' })}`
            : ''}
        </span>
        <span className={live ? 'text-rose-400' : ''}>{game.status_label}</span>
      </div>
      {cols > 0 ? (
        <div className="overflow-x-auto px-3 py-2">
          <table className="w-full min-w-[16rem] text-center text-[12px]">
            <thead>
              <tr className="text-zinc-500">
                <th className="px-1 py-1 text-left font-semibold">Team</th>
                {Array.from({ length: cols }, (_, i) => (
                  <th key={i} className="px-1 py-1 font-semibold">
                    {periodLabel(game.sport_key, i, cols)}
                  </th>
                ))}
                <th className="px-1 py-1 font-semibold">T</th>
              </tr>
            </thead>
            <tbody className="text-zinc-200">
              {[game.away, game.home].filter(Boolean).map((side) => (
                <tr key={side.abbrev || side.name || 'side'}>
                  <td className="px-1 py-1 text-left font-semibold">{side.abbrev}</td>
                  {Array.from({ length: cols }, (_, i) => (
                    <td key={i} className="px-1 py-1 tabular-nums">
                      {side.linescores?.[i] ?? '—'}
                    </td>
                  ))}
                  <td className="px-1 py-1 font-bold tabular-nums">
                    {final || live ? side.score ?? '—' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 pb-3 text-[13px] text-zinc-500">Period scores land once the game is underway.</div>
      )}
    </div>
  )
}

export function OddsTable({ game, books }) {
  const list = Array.isArray(books) ? books : []
  const [bookId, setBookId] = useState(() => list[0]?.book || '')
  const outlierBook = useMemo(() => biggestConsensusDeltaBook(list), [list])

  useEffect(() => {
    if (!list.length) {
      setBookId('')
      return
    }
    if (!list.some((row) => row.book === bookId)) {
      setBookId(list[0].book)
    }
  }, [list, bookId])

  if (!list.length) {
    return <div className="py-4 text-center text-sm text-zinc-500">Live lines are not up for this game yet.</div>
  }

  const row = list.find((b) => b.book === bookId) || list[0]

  return (
    <div
      data-lounge-game-odds
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
    >
      <div className="border-b border-zinc-800/80 px-2 pt-2">
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Odds
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {list.map((b) => {
              const active = b.book === row.book
              const isOutlier = outlierBook != null && b.book === outlierBook
              return (
                <button
                  key={b.book}
                  type="button"
                  onClick={() => setBookId(b.book)}
                  title={isOutlier ? 'Biggest gap from consensus' : undefined}
                  aria-label={isOutlier ? `${b.book}, biggest gap from consensus` : b.book}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold touch-manipulation ${
                    active ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {isOutlier ? (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? 'bg-amber-500' : 'bg-amber-400'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  {b.book}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-3 py-1 text-left font-semibold"> </th>
            <th className="px-2 py-1 font-semibold">Spread</th>
            <th className="px-2 py-1 font-semibold">Total</th>
            <th className="px-3 py-1 font-semibold">ML</th>
          </tr>
        </thead>
        <tbody className="text-zinc-200">
          <tr className="border-t border-zinc-800">
            <td className="px-3 py-2 text-left font-semibold">{game.away?.abbrev}</td>
            <td className="px-2 py-2 tabular-nums">
              {signedPoint(row.away_spread)}{' '}
              <span className="text-zinc-500">{american(row.away_spread_price)}</span>
            </td>
            <td className="px-2 py-2 tabular-nums">
              O {row.total ?? '-'} <span className="text-zinc-500">{american(row.over_price)}</span>
            </td>
            <td className="px-3 py-2 font-semibold tabular-nums">{american(row.away_ml)}</td>
          </tr>
          <tr className="border-t border-zinc-800">
            <td className="px-3 py-2 text-left font-semibold">{game.home?.abbrev}</td>
            <td className="px-2 py-2 tabular-nums">
              {signedPoint(row.home_spread)}{' '}
              <span className="text-zinc-500">{american(row.home_spread_price)}</span>
            </td>
            <td className="px-2 py-2 tabular-nums">
              U {row.total ?? '-'} <span className="text-zinc-500">{american(row.under_price)}</span>
            </td>
            <td className="px-3 py-2 font-semibold tabular-nums">{american(row.home_ml)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function PlayerStats({ game, stats }) {
  if (!Array.isArray(stats) || stats.length === 0) return null
  const groups = []
  for (const row of stats) {
    const cat = row.category || 'Stats'
    let group = groups.find((g) => g.cat === cat)
    if (!group) {
      group = { cat, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return (
    <div className="space-y-3 pt-3">
      {groups.map((group) => (
        <div key={group.cat} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {group.cat}
          </div>
          <ul className="divide-y divide-zinc-800">
            {group.rows.slice(0, 12).map((row) => {
              const side = row.side === 'home' ? game.home : row.side === 'away' ? game.away : null
              return (
                <li key={`${row.name}-${row.line}`} className="flex gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-zinc-100">{row.name}</div>
                    <div className="truncate text-[12px] text-zinc-400">{row.line}</div>
                  </div>
                  {side?.abbrev ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase text-zinc-500">
                      {side.abbrev}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function PlayList({ game, plays }) {
  if (!Array.isArray(plays) || plays.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Play-by-play is not on this feed yet. Scores and Lounge chat still update.
      </div>
    )
  }
  const newestFirst = [...plays].reverse()
  return (
    <ul className="divide-y divide-zinc-800">
      {newestFirst.map((play, i) => {
        const side = play.team === 'home' ? game.home : play.team === 'away' ? game.away : null
        return (
          <li key={play.id || i} className="py-3">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-400">
              {side?.logo ? <img src={side.logo} alt="" className="h-4 w-4 object-contain" /> : null}
              <span>
                {play.period != null ? ordinal(play.period) : ''}
                {play.clock ? ` · ${play.clock}` : ''}
              </span>
              {i === 0 ? (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                  Latest
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[14px] leading-snug text-zinc-200">{play.description}</p>
          </li>
        )
      })}
    </ul>
  )
}

export function PostList({ posts, postsLoading, postsErr, emptyLabel, onOpenPost, closeHub }) {
  if (postsLoading) return <div className="py-8 text-center text-sm text-zinc-500">Loading posts…</div>
  if (postsErr) return <div className="py-8 text-center text-sm text-lv-red">{postsErr}</div>
  if (!posts.length) return <div className="py-8 text-center text-sm text-zinc-500">{emptyLabel}</div>
  return (
    <ul className="divide-y divide-zinc-800">
      {posts.map((post) => {
        const profile = post.author_profile
        const caption = feedPostDisplayCaption(post)
        return (
          <li key={post.id}>
            <button
              type="button"
              className="flex w-full gap-3 py-3 text-left touch-manipulation active:opacity-90"
              onClick={() => {
                onOpenPost?.(post)
                closeHub?.()
              }}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                  {(profile?.display_name || profile?.handle || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="truncate text-[14px] font-bold">
                    {profile?.display_name || profile?.handle || 'Member'}
                  </span>
                  {profile?.handle ? (
                    <span className="truncate text-[13px] text-zinc-500">@{profile.handle}</span>
                  ) : null}
                  <span className="text-[13px] text-zinc-500">· {formatPostAge(post.created_at)}</span>
                </div>
                {caption ? (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-snug text-zinc-300">
                    {caption}
                  </p>
                ) : null}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
