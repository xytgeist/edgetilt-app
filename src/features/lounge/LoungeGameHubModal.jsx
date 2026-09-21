import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import { formatLoungeSearchError, loungeSearch, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
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

function TeamLogo({ side, size = 40 }) {
  const letter = String(side?.abbrev || '?').slice(0, 1)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-sm font-bold text-zinc-200"
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
      <div className="flex items-end justify-between gap-3 px-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamLogo side={game.away} size={44} />
          <span className="text-center text-[12px] font-semibold text-zinc-200">{game.away?.name}</span>
        </div>
        <div className="flex items-baseline gap-2 tabular-nums text-[32px] font-bold leading-none text-white">
          <span>{game.status === 'pre' || game.away?.score == null ? '—' : game.away.score}</span>
          <span className="text-[18px] font-semibold text-zinc-500">-</span>
          <span>{game.status === 'pre' || game.home?.score == null ? '—' : game.home.score}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamLogo side={game.home} size={44} />
          <span className="text-center text-[12px] font-semibold text-zinc-200">{game.home?.name}</span>
        </div>
      </div>
      {cols > 0 ? (
        <div className="overflow-x-auto border-t border-zinc-800 px-3 py-2">
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
      ) : null}
    </div>
  )
}

/**
 * Game destination opened from the in-post score pill.
 * Edge version: scoreboard + box + Lounge conversation (no licensed highlights).
 */
export default function LoungeGameHubModal({ supabaseClient, hydratePosts, onOpenPost }) {
  const sports = useLoungeSportsFeed()
  const game = sports?.hubGame
  const games = sports?.games || []
  const [tab, setTab] = useState('lounge')
  const [postSort, setPostSort] = useState(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')

  const sameSportGames = useMemo(
    () => games.filter((g) => g.sport_key === game?.sport_key),
    [game?.sport_key, games],
  )

  const searchQuery = useMemo(() => {
    if (!game) return ''
    const mascot = (side) => String(side?.mascot || side?.name || '').trim()
    return `${mascot(game.away)} ${mascot(game.home)}`.trim().slice(0, 80)
  }, [game])

  useEffect(() => {
    if (!game || !supabaseClient || tab !== 'lounge' || searchQuery.length < 2) {
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
  }, [game, hydratePosts, postSort, searchQuery, supabaseClient, tab])

  useEffect(() => {
    setTab('lounge')
    setPostSort(LOUNGE_SEARCH_SORT.ENGAGEMENT)
  }, [game?.id])

  if (!game || typeof document === 'undefined') return null

  return createPortal(
    <div
      data-lounge-game-hub
      className="fixed inset-0 flex flex-col bg-zinc-950 text-white"
      style={{ zIndex: Z_APP_MODAL }}
    >
      <div
        className="flex items-center gap-2 px-2 pt-[max(0.5rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-1"
      >
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

      <div className="px-4 pb-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <TeamLogo side={game.away} size={52} />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{game.away?.abbrev}</span>
            <span className="text-[36px] font-bold leading-none tabular-nums">
              {game.status === 'pre' || game.away?.score == null ? '—' : game.away.score}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 px-2">
            <span className={`text-[13px] font-semibold uppercase tracking-wide ${game.status === 'in' ? 'text-rose-400' : 'text-zinc-400'}`}>
              {game.status_label}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <TeamLogo side={game.home} size={52} />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{game.home?.abbrev}</span>
            <span className="text-[36px] font-bold leading-none tabular-nums">
              {game.status === 'pre' || game.home?.score == null ? '—' : game.home.score}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-5 border-b border-zinc-800 px-4">
        {[
          { id: 'lounge', label: 'Lounge' },
          { id: 'box', label: 'Box' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 pb-2.5 pt-1 text-[15px] font-semibold touch-manipulation ${
              tab === item.id ? 'border-white text-white' : 'border-transparent text-zinc-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
        {tab === 'box' ? (
          <div className="py-3">
            <BoxScoreCard game={game} />
          </div>
        ) : (
          <>
            <div className="flex gap-4 pt-2">
              {[
                { id: LOUNGE_SEARCH_SORT.ENGAGEMENT, label: 'Top' },
                { id: LOUNGE_SEARCH_SORT.RECENT, label: 'Latest' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPostSort(item.id)}
                  className={`text-[13px] font-semibold touch-manipulation ${
                    postSort === item.id ? 'text-white' : 'text-zinc-500'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pt-2">
              <BoxScoreCard game={game} />
            </div>
            {postsLoading ? (
              <div className="py-8 text-center text-sm text-zinc-500">Loading posts…</div>
            ) : postsErr ? (
              <div className="py-8 text-center text-sm text-lv-red">{postsErr}</div>
            ) : posts.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-500">No Lounge posts on this game yet.</div>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-800">
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
                          sports.closeHub?.()
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
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
