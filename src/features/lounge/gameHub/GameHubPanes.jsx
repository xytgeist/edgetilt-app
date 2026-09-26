import { useEffect, useMemo, useState } from 'react'
import {
  american,
  formatKickoff,
  formatPostAge,
  isFieldReplayablePlay,
  mergeLastPlayIntoPlays,
  normalizePlayDescription,
  ordinal,
  periodLabel,
  signedPoint,
  stripTimeZoneSuffix,
} from './gameHubFormatters.js'
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

/** Two-way de-vig home win probability (falls back to raw home implied). */
function deVigHomeImplied(homeMl, awayMl) {
  const h = americanToImplied(homeMl)
  const a = americanToImplied(awayMl)
  if (h == null) return null
  if (a == null || h + a <= 0) return h
  return h / (h + a)
}

function median(values) {
  const a = values.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/** Cents of juice between two American prices (same-side comparison). */
function juiceCentsApart(a, b) {
  const x = numOrNull(a)
  const y = numOrNull(b)
  if (x == null || y == null) return null
  if ((x < 0 && y < 0) || (x > 0 && y > 0)) return Math.abs(x - y)
  // Mixed signs … use implied-prob gap × 100 as a cents-ish stand-in.
  const ix = americanToImplied(x)
  const iy = americanToImplied(y)
  if (ix == null || iy == null) return null
  return Math.abs(ix - iy) * 100
}

function halfPointKey(v) {
  return Math.round(Number(v) * 2) / 2
}

/** Largest half-point cluster; used as “market already settled here.” */
function majorityCluster(values) {
  const counts = new Map()
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    const k = halfPointKey(v)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let best = null
  for (const [value, n] of counts) {
    if (!best || n > best.n) best = { value, n }
  }
  return best
}

const ML_OUTLIER_PCT = 2.5
const ML_HEAVY_OUTLIER_PCT = 3.5
/** Half-point alone is noise on NFL; full point clears the badge floor. */
const SPREAD_POINT_FLAG = 0.5
const SPREAD_POINT_STRONG = 1.0
const JUICE_CENTS_FLAG = 13
const NOISE_FLOOR_PCT = 2.0

/** Pinnacle is the sharp anchor … never the hanging/outlier book. */
function isPinnacleBook(book) {
  return String(book?.book || book?.key || '')
    .trim()
    .toLowerCase()
    .includes('pinnacle')
}

/**
 * Flag the book furthest past hanging/outlier thresholds.
 * - Outlier: ≥2.5% de-vig implied off consensus (3.5% when ±300+)
 * - Hanging: same gap *and* the book is isolated on its number while a majority
 *   cluster sits elsewhere (snapshot proxy for “other books already moved”)
 * - Spread/total: full 1.0pt off number (0.5pt is ignored … common alt number),
 *   or ≥13¢ juice on the same number
 * - Below ~2% / sub-threshold gaps: no badge
 * - Pinnacle is always excluded as the badge target (still in consensus math)
 *
 * Needs ≥3 books.
 * @returns {{
 *   book: string,
 *   kind: 'hanging'|'outlier',
 *   score: number,
 *   markets: Array<'spread'|'total'|'ml'>,
 * } | null}
 */
function consensusHangOrOutlier(books) {
  const list = Array.isArray(books) ? books : []
  if (list.length < 3) return null

  const medSpread = median(list.map((b) => numOrNull(b.home_spread)))
  const medTotal = median(list.map((b) => numOrNull(b.total)))
  const medMl = median(list.map((b) => deVigHomeImplied(b.home_ml, b.away_ml)))

  const spreadCounts = new Map()
  const totalCounts = new Map()
  for (const b of list) {
    const sp = numOrNull(b.home_spread)
    const tot = numOrNull(b.total)
    if (sp != null) {
      const k = halfPointKey(sp)
      spreadCounts.set(k, (spreadCounts.get(k) || 0) + 1)
    }
    if (tot != null) {
      const k = halfPointKey(tot)
      totalCounts.set(k, (totalCounts.get(k) || 0) + 1)
    }
  }
  const spreadCluster = majorityCluster(list.map((b) => numOrNull(b.home_spread)))
  const totalCluster = majorityCluster(list.map((b) => numOrNull(b.total)))
  const majorityNeed = Math.ceil(list.length / 2)
  const spreadSettled = spreadCluster && spreadCluster.n >= majorityNeed
  const totalSettled = totalCluster && totalCluster.n >= majorityNeed

  const sameSpreadBooks = list.filter(
    (b) => medSpread != null && numOrNull(b.home_spread) != null && halfPointKey(b.home_spread) === halfPointKey(medSpread),
  )
  const medSpreadJuice = median(sameSpreadBooks.map((b) => numOrNull(b.home_spread_price)))
  const sameTotalBooks = list.filter(
    (b) => medTotal != null && numOrNull(b.total) != null && halfPointKey(b.total) === halfPointKey(medTotal),
  )
  const medOverJuice = median(sameTotalBooks.map((b) => numOrNull(b.over_price)))

  let best = null
  for (const b of list) {
    if (isPinnacleBook(b)) continue

    /** @type {Array<{ score: number, market: 'spread'|'total'|'ml', hangingHint: boolean }>} */
    const flags = []

    const sp = numOrNull(b.home_spread)
    const tot = numOrNull(b.total)
    const ml = deVigHomeImplied(b.home_ml, b.away_ml)
    const heavy =
      Math.abs(numOrNull(b.home_ml) || 0) >= 300 || Math.abs(numOrNull(b.away_ml) || 0) >= 300
    const mlThresh = heavy ? ML_HEAVY_OUTLIER_PCT : ML_OUTLIER_PCT

    if (ml != null && medMl != null) {
      const gapPct = Math.abs(ml - medMl) * 100
      if (gapPct >= mlThresh) {
        // ML “moved”: most books within 1% of median and this one isn’t.
        const nearMed = list.filter((row) => {
          const p = deVigHomeImplied(row.home_ml, row.away_ml)
          return p != null && Math.abs(p - medMl) * 100 <= 1.0
        }).length
        flags.push({
          score: gapPct,
          market: 'ml',
          hangingHint: nearMed >= majorityNeed,
        })
      }
    }

    if (sp != null && medSpread != null) {
      const ptGap = Math.abs(sp - medSpread)
      const aloneOnNumber = (spreadCounts.get(halfPointKey(sp)) || 0) <= 1
      if (ptGap >= SPREAD_POINT_STRONG) {
        flags.push({
          score: ptGap * 4,
          market: 'spread',
          hangingHint:
            Boolean(spreadSettled) &&
            halfPointKey(sp) !== halfPointKey(spreadCluster.value) &&
            aloneOnNumber,
        })
      } else if (ptGap >= SPREAD_POINT_FLAG) {
        // 0.5pt is a common alt number … only badge when this book is alone there.
        if (aloneOnNumber) {
          flags.push({
            score: ptGap * 4,
            market: 'spread',
            hangingHint:
              Boolean(spreadSettled) && halfPointKey(sp) !== halfPointKey(spreadCluster.value),
          })
        }
      } else if (ptGap < 0.01 && medSpreadJuice != null) {
        const cents = juiceCentsApart(b.home_spread_price, medSpreadJuice)
        if (cents != null && cents >= JUICE_CENTS_FLAG) {
          // Hanging juice = worse than median (more negative / shorter plus), not LowVig sharp.
          const mine = numOrNull(b.home_spread_price)
          const worseThanMed =
            mine != null &&
            medSpreadJuice != null &&
            ((mine < 0 && medSpreadJuice < 0 && mine < medSpreadJuice) ||
              (mine > 0 && medSpreadJuice > 0 && mine < medSpreadJuice))
          flags.push({
            score: cents / 5,
            market: 'spread',
            hangingHint: Boolean(spreadSettled) && worseThanMed,
          })
        }
      }
    }

    if (tot != null && medTotal != null) {
      const ptGap = Math.abs(tot - medTotal)
      const aloneOnNumber = (totalCounts.get(halfPointKey(tot)) || 0) <= 1
      if (ptGap >= SPREAD_POINT_STRONG) {
        flags.push({
          score: ptGap * 4,
          market: 'total',
          hangingHint:
            Boolean(totalSettled) &&
            halfPointKey(tot) !== halfPointKey(totalCluster.value) &&
            aloneOnNumber,
        })
      } else if (ptGap >= SPREAD_POINT_FLAG) {
        if (aloneOnNumber) {
          flags.push({
            score: ptGap * 4,
            market: 'total',
            hangingHint:
              Boolean(totalSettled) && halfPointKey(tot) !== halfPointKey(totalCluster.value),
          })
        }
      } else if (ptGap < 0.01 && medOverJuice != null) {
        const cents = juiceCentsApart(b.over_price, medOverJuice)
        if (cents != null && cents >= JUICE_CENTS_FLAG) {
          const mine = numOrNull(b.over_price)
          const worseThanMed =
            mine != null &&
            medOverJuice != null &&
            ((mine < 0 && medOverJuice < 0 && mine < medOverJuice) ||
              (mine > 0 && medOverJuice > 0 && mine < medOverJuice))
          flags.push({
            score: cents / 5,
            market: 'total',
            hangingHint: Boolean(totalSettled) && worseThanMed,
          })
        }
      }
    }

    if (!flags.length) continue
    const score = Math.max(...flags.map((f) => f.score))
    if (score < NOISE_FLOOR_PCT) continue
    const topFlags = flags.filter((f) => f.score >= NOISE_FLOOR_PCT)
    const markets = [...new Set(topFlags.map((f) => f.market))]
    const hangingHint = topFlags.some((f) => f.hangingHint)
    if (!best || score > best.score) {
      best = {
        book: b.book,
        score,
        kind: hangingHint ? 'hanging' : 'outlier',
        markets,
      }
    }
  }

  return best
}

function OddsMarketDot({ show, label }) {
  if (!show) return null
  return (
    <span
      className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 align-middle"
      title={label}
      aria-label={label}
    />
  )
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
        <span className={live ? 'text-rose-400' : ''}>
          {game.status === 'pre'
            ? formatKickoff(game.commence_time) || stripTimeZoneSuffix(game.status_label) || 'Upcoming'
            : game.status_label}
        </span>
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
  const badge = useMemo(() => consensusHangOrOutlier(list), [list])
  const badgeBook = badge?.book || null
  const badgeKind = badge?.kind || null
  const badgeMarkets = Array.isArray(badge?.markets) ? badge.markets : []
  const badgeLabel = badgeKind === 'hanging' ? 'Hanging' : badgeKind === 'outlier' ? 'Outlier' : null
  const marketHint = badgeMarkets.length
    ? badgeMarkets.map((m) => (m === 'ml' ? 'ML' : m === 'spread' ? 'spread' : 'total')).join(' + ')
    : ''
  const badgeTitle =
    badgeKind === 'hanging'
      ? `Hanging ${marketHint} … ≥2% off consensus while other books clustered elsewhere`
      : badgeKind === 'outlier'
        ? `Outlier ${marketHint} … ≥2% implied (or 0.5pt / 10¢ juice) off consensus`
        : undefined

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
  const showCellDots = Boolean(badgeBook && row?.book === badgeBook)
  const flagSpread = showCellDots && badgeMarkets.includes('spread')
  const flagTotal = showCellDots && badgeMarkets.includes('total')
  const flagMl = showCellDots && badgeMarkets.includes('ml')
  const cellDotLabel = badgeLabel || 'Flagged'

  return (
    <div
      data-lounge-game-odds
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
    >
      <div className="border-b border-zinc-800/80 px-2 pt-2">
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Odds</span>
          {badgeLabel ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-zinc-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
              {badgeLabel}
              {marketHint ? <span className="text-zinc-600">· {marketHint}</span> : null}
            </span>
          ) : null}
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {list.map((b) => {
              const active = b.book === row.book
              const isBadged = badgeBook != null && b.book === badgeBook
              return (
                <button
                  key={b.book}
                  type="button"
                  onClick={() => setBookId(b.book)}
                  title={isBadged ? badgeTitle : undefined}
                  aria-label={
                    isBadged
                      ? `${b.book}, ${badgeLabel}${marketHint ? ` on ${marketHint}` : ''}`
                      : b.book
                  }
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold touch-manipulation ${
                    active ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {isBadged ? (
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
              <OddsMarketDot show={flagSpread} label={`${cellDotLabel} spread`} />
            </td>
            <td className="px-2 py-2 tabular-nums">
              O {row.total ?? '-'} <span className="text-zinc-500">{american(row.over_price)}</span>
              <OddsMarketDot show={flagTotal} label={`${cellDotLabel} total`} />
            </td>
            <td className="px-3 py-2 font-semibold tabular-nums">
              {american(row.away_ml)}
              <OddsMarketDot show={flagMl} label={`${cellDotLabel} ML`} />
            </td>
          </tr>
          <tr className="border-t border-zinc-800">
            <td className="px-3 py-2 text-left font-semibold">{game.home?.abbrev}</td>
            <td className="px-2 py-2 tabular-nums">
              {signedPoint(row.home_spread)}{' '}
              <span className="text-zinc-500">{american(row.home_spread_price)}</span>
              <OddsMarketDot show={flagSpread} label={`${cellDotLabel} spread`} />
            </td>
            <td className="px-2 py-2 tabular-nums">
              U {row.total ?? '-'} <span className="text-zinc-500">{american(row.under_price)}</span>
              <OddsMarketDot show={flagTotal} label={`${cellDotLabel} total`} />
            </td>
            <td className="px-3 py-2 font-semibold tabular-nums">
              {american(row.home_ml)}
              <OddsMarketDot show={flagMl} label={`${cellDotLabel} ML`} />
            </td>
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

export function PlayList({
  game,
  plays,
  lastPlayText = '',
  lastPlayMeta = null,
  onSelectPlay,
  activePlayText = '',
}) {
  const rows = mergeLastPlayIntoPlays(plays, lastPlayText, lastPlayMeta)
  if (!rows.length) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Play-by-play is not on this feed yet. Scores and Lounge chat still update.
      </div>
    )
  }
  const activeNorm = normalizePlayDescription(activePlayText)
  return (
    <ul className="divide-y divide-zinc-800">
      {rows.map((play, i) => {
        const side = play.team === 'home' ? game.home : play.team === 'away' ? game.away : null
        const desc = String(play.description || '').trim()
        const isActive = activeNorm && normalizePlayDescription(desc) === activeNorm
        const canReplay = Boolean(onSelectPlay && desc && isFieldReplayablePlay(desc))
        return (
          <li key={play.id || `${play.period}-${play.clock}-${i}`}>
            <button
              type="button"
              disabled={!canReplay}
              onClick={() => {
                if (!canReplay) return
                onSelectPlay?.(play)
              }}
              className={`w-full py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                canReplay ? 'active:opacity-80' : ''
              } ${isActive ? 'bg-white/[0.04]' : ''}`}
              aria-label={canReplay ? `Replay play: ${desc}` : undefined}
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-400">
                {side?.logo ? <img src={side.logo} alt="" className="h-4 w-4 object-contain" /> : null}
                <span>
                  {play.period != null ? ordinal(play.period) : ''}
                  {play.clock ? ` · ${play.clock}` : ''}
                </span>
                {canReplay ? (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Tap to replay
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[14px] leading-snug text-zinc-200">{desc}</p>
            </button>
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
