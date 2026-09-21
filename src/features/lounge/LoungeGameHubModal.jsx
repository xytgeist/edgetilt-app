import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import { loungeSportsGameDetail } from '../../utils/loungeSportsApi.js'
import { formatLoungeSearchError, loungeSearch, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { executeLoungeCommunityPostSubmission } from './loungePostSubmitJob.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { loungeSportsHubGames } from './loungeSportsSlateWindow.js'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

function formatPostAge(createdAt) {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function periodLabel(sportKey, index, total) {
  const sk = String(sportKey || '')
  if (sk.includes('baseball')) return String(index + 1)
  if (sk.includes('hockey')) return index < 3 ? `${index + 1}` : 'OT'
  if (index >= 4) return 'OT'
  if (total <= 2) return index === 0 ? 'H1' : 'H2'
  return String(index + 1)
}

function ordinal(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  const abs = Math.trunc(v)
  if (abs === 1) return '1st'
  if (abs === 2) return '2nd'
  if (abs === 3) return '3rd'
  return `${abs}th`
}

function american(price) {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) === 0) return '—'
  const n = Number(price)
  return n > 0 ? `+${n}` : String(n)
}

function signedPoint(point) {
  if (point == null || !Number.isFinite(Number(point))) return '—'
  const n = Number(point)
  if (n > 0) return `+${n}`
  return String(n)
}

function TeamLogo({ side, size = 40 }) {
  const letter = String(side?.abbrev || '?').slice(0, 1)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-sm font-bold text-zinc-200"
      style={{ width: size, height: size }}
    >
      {side?.logo ? (
        <img
          src={side.logo}
          alt=""
          className="h-full w-full object-contain"
          onError={(ev) => {
            ev.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        letter
      )}
    </span>
  )
}

function scoreText(side, status) {
  if (status === 'pre' || side?.score == null) return '—'
  return String(side.score)
}

function liveClockLabel(game, live) {
  if (game.status === 'post') return game.status_label || 'Final'
  if (game.status === 'pre') return game.status_label || 'Upcoming'
  const period = live?.period != null ? ordinal(live.period) : ''
  const clock = String(live?.clock || '').trim()
  if (period && clock) return `${period} ${clock}`
  if (clock) return clock
  if (period) return period
  return game.status_label || 'Live'
}

function downDistanceLabel(live) {
  if (!live) return ''
  const down = live.down != null ? ordinal(live.down) : ''
  const dist = live.distance != null && Number.isFinite(Number(live.distance)) ? String(live.distance) : ''
  if (down && dist) return `${down} & ${dist}`
  if (down) return down
  return ''
}

function yardLineLabel(game, live) {
  if (live?.yard_line == null) return ''
  const yard = Math.round(Number(live.yard_line))
  if (!Number.isFinite(yard)) return ''
  const side =
    live.yard_side === 'home'
      ? game.home?.abbrev
      : live.yard_side === 'away'
        ? game.away?.abbrev
        : live.possession === 'home'
          ? game.home?.abbrev
          : live.possession === 'away'
            ? game.away?.abbrev
            : ''
  return side ? `${side} ${yard}` : String(yard)
}

function fieldPercent(live) {
  const yard = Number(live?.yard_line)
  if (!Number.isFinite(yard)) {
    if (live?.possession === 'home') return 62
    if (live?.possession === 'away') return 38
    return null
  }
  let pos = yard
  if (live.yard_side === 'home') pos = 100 - yard
  else if (live.yard_side === 'away') pos = yard
  else if (live.possession === 'home') pos = 100 - yard
  return Math.max(6, Math.min(94, pos))
}

function FieldBar({ game, live }) {
  if (!String(game.sport_key || '').includes('football')) return null
  if (game.status === 'pre') return null
  const pos = fieldPercent(live)
  if (pos == null && !live?.possession) return null
  const left = pos == null ? 50 : pos
  return (
    <div data-lounge-game-field className="px-3 pb-2 pt-1">
      <div className="relative h-[52px] overflow-hidden rounded-xl bg-emerald-800">
        <div className="absolute inset-y-0 left-[20%] w-px bg-white/25" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-300/80" />
        <div className="absolute inset-y-0 left-[80%] w-px bg-white/25" />
        <span className="absolute left-2 top-1 text-[9px] font-bold uppercase tracking-wide text-white/80">
          {game.away?.abbrev}
        </span>
        <span className="absolute right-2 top-1 text-[9px] font-bold uppercase tracking-wide text-white/80">
          {game.home?.abbrev}
        </span>
        <span className="absolute bottom-1 left-[20%] -translate-x-1/2 text-[8px] font-semibold text-white/70">20</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-white/70">50</span>
        <span className="absolute bottom-1 left-[80%] -translate-x-1/2 text-[8px] font-semibold text-white/70">20</span>
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-300 shadow"
          style={{ left: `${left}%` }}
        />
      </div>
    </div>
  )
}

function BoxScoreCard({ game }) {
  const awayLines = Array.isArray(game.away?.linescores) ? game.away.linescores : []
  const homeLines = Array.isArray(game.home?.linescores) ? game.home.linescores : []
  const cols = Math.max(awayLines.length, homeLines.length, 0)
  const live = game.status === 'in'
  const final = game.status === 'post'

  return (
    <div
      data-lounge-game-box
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
    >
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>
          {game.sport_label}
          {game.commence_time ? ` · ${new Date(game.commence_time).toLocaleDateString(undefined, { weekday: 'short' })}` : ''}
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
              {[game.away, game.home].map((side) => (
                <tr key={side.abbrev}>
                  <td className="px-1 py-1 text-left font-semibold">{side.abbrev}</td>
                  {Array.from({ length: cols }, (_, i) => (
                    <td key={i} className="px-1 py-1 tabular-nums">
                      {side.linescores?.[i] ?? '—'}
                    </td>
                  ))}
                  <td className="px-1 py-1 font-bold tabular-nums">{final || live ? side.score ?? '—' : '—'}</td>
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

function OddsTable({ game, books }) {
  if (!Array.isArray(books) || books.length === 0) {
    return <div className="py-4 text-center text-sm text-zinc-500">Live lines are not up for this game yet.</div>
  }
  return (
    <div data-lounge-game-odds className="space-y-2">
      {books.map((row) => (
        <div key={row.book} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Odds · {row.book}
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
                  O {row.total ?? '—'} <span className="text-zinc-500">{american(row.over_price)}</span>
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
                  U {row.total ?? '—'} <span className="text-zinc-500">{american(row.under_price)}</span>
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">{american(row.home_ml)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function PlayerStats({ game, stats }) {
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
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{group.cat}</div>
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
                    <span className="shrink-0 text-[11px] font-semibold uppercase text-zinc-500">{side.abbrev}</span>
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

function PlayList({ game, plays }) {
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
              {side?.logo ? (
                <img src={side.logo} alt="" className="h-4 w-4 object-contain" />
              ) : null}
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

function PostList({ posts, postsLoading, postsErr, emptyLabel, onOpenPost, closeHub }) {
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

/**
 * Game destination opened from the in-post score pill.
 * Live clock / down-distance, field marker, multi-book odds, PBP, Lounge chat.
 */
export default function LoungeGameHubModal({ supabaseClient, hydratePosts, onOpenPost, loungeReadOnly = false }) {
  const sports = useLoungeSportsFeed()
  const game = sports?.hubGame
  const games = sports?.games || []
  const [tab, setTab] = useState('chat')
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
  const [postsNonce, setPostsNonce] = useState(0)
  const [detail, setDetail] = useState({ odds: [], plays: [], stats: [], live: null })
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [chatErr, setChatErr] = useState('')

  const sameSportGames = useMemo(
    () => loungeSportsHubGames(games, game?.sport_key),
    [game?.sport_key, games],
  )

  const searchQuery = useMemo(() => {
    if (!game) return ''
    const mascot = (side) => String(side?.mascot || side?.name || '').trim()
    return `${mascot(game.away)} ${mascot(game.home)}`.trim().slice(0, 80)
  }, [game])

  const live = detail.live || game?.live || null
  const lastPlay = String(live?.last_play || detail.plays?.[detail.plays.length - 1]?.description || '').trim()

  useEffect(() => {
    if (!game || !supabaseClient) {
      setDetail({ odds: [], plays: [], stats: [], live: null })
      return undefined
    }
    let cancelled = false
    const load = () => {
      void loungeSportsGameDetail(supabaseClient, game.id).then((data) => {
        if (cancelled || data?.error) return
        setDetail({
          odds: Array.isArray(data.odds) ? data.odds : [],
          plays: Array.isArray(data.plays) ? data.plays : [],
          stats: Array.isArray(data.stats) ? data.stats : [],
          live: data.game?.live || data.live || null,
        })
      })
    }
    load()
    const ms = game.status === 'in' ? 20_000 : 120_000
    const id = setInterval(load, ms)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [game?.id, game?.status, supabaseClient])

  const wantsPosts = tab === 'top' || tab === 'latest' || tab === 'chat'
  const postSort = tab === 'top' ? LOUNGE_SEARCH_SORT.ENGAGEMENT : LOUNGE_SEARCH_SORT.RECENT

  useEffect(() => {
    if (!game || !supabaseClient || !wantsPosts || searchQuery.length < 2) {
      setPosts([])
      setPostsErr('')
      setPostsLoading(false)
      return undefined
    }
    let cancelled = false
    setPostsLoading(true)
    setPostsErr('')
    void loungeSearch(supabaseClient, searchQuery, {
      sort: postSort,
      postsLimit: 16,
      profilesLimit: 0,
      commentsLimit: 0,
    })
      .then(async (result) => {
        if (cancelled) return
        const raw = Array.isArray(result.posts) ? result.posts : []
        const hydrated = hydratePosts ? await hydratePosts(raw) : raw
        if (!cancelled) setPosts(hydrated)
      })
      .catch((err) => {
        if (cancelled) return
        setPosts([])
        setPostsErr(formatLoungeSearchError(err))
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [game, hydratePosts, postSort, postsNonce, searchQuery, supabaseClient, wantsPosts])

  useEffect(() => {
    setTab(game?.status === 'in' ? 'chat' : 'top')
    setDraft('')
    setChatErr('')
    setDetail({ odds: [], plays: [], stats: [], live: null })
  }, [game?.id])

  if (!game || typeof document === 'undefined') return null

  const sendChat = async () => {
    const caption = draft.trim()
    if (!caption || posting || loungeReadOnly) return
    setPosting(true)
    setChatErr('')
    try {
      await executeLoungeCommunityPostSubmission({
        supabaseClient,
        snapshot: {
          caption,
          gifOnlyUrl: '',
          imageFiles: [],
          existingImageUrls: [],
          videoFile: null,
          streamVideoUid: '',
          wantsPin: false,
          isStaffPoster: false,
          categoryPills: ['sports'],
          marketSymbols: [],
          sportsGame: { suppress: false, eventId: game.id },
        },
        signal: new AbortController().signal,
        rateLimitMessage: (msg) => String(msg || 'Slow down a second and try again.'),
      })
      setDraft('')
      setTab('chat')
      setPostsNonce((n) => n + 1)
    } catch (err) {
      setChatErr(err?.message || 'Could not post.')
    } finally {
      setPosting(false)
    }
  }

  const tabs = [
    { id: 'top', label: 'Top' },
    { id: 'latest', label: 'Latest' },
    { id: 'stats', label: 'Stats' },
    { id: 'plays', label: 'Plays' },
    { id: 'chat', label: 'Chat' },
  ]

  return createPortal(
    <div
      data-lounge-game-hub
      className="fixed inset-0 flex flex-col bg-zinc-950 text-white"
      style={{ zIndex: Z_APP_MODAL }}
    >
      <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-1">
        <button
          type="button"
          onClick={() => sports.closeHub?.()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-zinc-800"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex gap-2 pr-2">
            {sameSportGames.map((g) => {
              const active = g.id === game.id
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => sports.openHub?.(g)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold touch-manipulation ${
                    active ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {g.away?.abbrev} {g.status === 'pre' ? '@' : g.away?.score ?? ''} {g.home?.abbrev}{' '}
                  {g.status === 'pre' ? '' : g.home?.score ?? ''} · {g.status === 'post' ? 'F' : g.status === 'in' ? 'Live' : g.status_label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-4 pb-1 pt-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TeamLogo side={game.away} size={44} />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{game.away?.abbrev}</div>
              <div className="text-[32px] font-bold leading-none tabular-nums">{scoreText(game.away, game.status)}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-1 text-center">
            <span className={`text-[13px] font-semibold ${game.status === 'in' ? 'text-rose-400' : 'text-zinc-400'}`}>
              {liveClockLabel(game, live)}
            </span>
            {downDistanceLabel(live) ? (
              <span className="text-[12px] font-semibold text-zinc-300">{downDistanceLabel(live)}</span>
            ) : null}
            {yardLineLabel(game, live) ? (
              <span className="text-[12px] font-semibold text-zinc-400">{yardLineLabel(game, live)}</span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="min-w-0 text-right">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{game.home?.abbrev}</div>
              <div className="text-[32px] font-bold leading-none tabular-nums">{scoreText(game.home, game.status)}</div>
            </div>
            <TeamLogo side={game.home} size={44} />
          </div>
        </div>
      </div>

      <FieldBar game={game} live={live} />

      {lastPlay ? (
        <div className="truncate px-4 pb-2 text-[12px] text-zinc-400">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">Last play </span>
          {lastPlay}
        </div>
      ) : null}

      <div className="flex shrink-0 gap-5 overflow-x-auto border-b border-zinc-800 px-4">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px shrink-0 border-b-2 pb-2.5 pt-1 text-[15px] font-semibold touch-manipulation ${
              tab === item.id ? 'border-white text-white' : 'border-transparent text-zinc-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
        {tab === 'stats' ? (
          <div className="space-y-3 py-3">
            <OddsTable game={game} books={detail.odds} />
            <BoxScoreCard game={game} />
            <PlayerStats game={game} stats={detail.stats} />
          </div>
        ) : tab === 'plays' ? (
          <div className="py-2">
            <PlayList game={game} plays={detail.plays} />
          </div>
        ) : (
          <PostList
            posts={posts}
            postsLoading={postsLoading}
            postsErr={postsErr}
            emptyLabel="No Lounge posts on this game yet."
            onOpenPost={onOpenPost}
            closeHub={sports.closeHub}
          />
        )}
      </div>

      {tab === 'chat' && !loungeReadOnly ? (
        <form
          className="shrink-0 border-t border-zinc-800 px-3 pb-[max(0.75rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] pt-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            void sendChat()
          }}
        >
          {chatErr ? <div className="pb-1 text-[12px] text-lv-red">{chatErr}</div> : null}
          <div className="flex items-center gap-2">
            <input
              data-lounge-game-chat
              type="text"
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              maxLength={280}
              placeholder="Talk about the game"
              className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={posting || !draft.trim()}
              className="shrink-0 rounded-full bg-zinc-100 px-3 py-2 text-[13px] font-semibold text-zinc-950 disabled:opacity-40"
            >
              {posting ? '…' : 'Post'}
            </button>
          </div>
        </form>
      ) : null}
    </div>,
    document.body,
  )
}
