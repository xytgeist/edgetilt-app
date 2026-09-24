import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { loungeNflGameFantasy, loungeSportsGameDetail } from '../../utils/loungeSportsApi.js'
import { formatLoungeSearchError, loungeSearch, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { executeLoungeCommunityPostSubmission } from './loungePostSubmitJob.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { loungeSportsHubGames } from './loungeSportsSlateWindow.js'
import {
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import GameHubHero from './gameHub/GameHubHero.jsx'
import GameHubPlayersPane from './gameHub/GameHubPlayersPane.jsx'
import GameHubFantasyPane from './gameHub/GameHubFantasyPane.jsx'
import { KalshiGamePropsBoard } from './gameHub/GameHubKalshiProps.jsx'
import { BoxScoreCard, OddsTable, PlayList, PlayerStats, PostList } from './gameHub/GameHubPanes.jsx'

/**
 * Game destination opened from the in-post score pill.
 * X-style hero, Posts (Top/Latest), Stats, Plays, Players, Fantasy, Chat.
 */
export default function LoungeGameHubModal({
  supabaseClient,
  hydratePosts,
  onOpenPost,
  loungeReadOnly = false,
  /** Landscape Lounge right pane: fill parent, no portal. */
  embedded = false,
}) {
  const sports = useLoungeSportsFeed()
  const game = sports?.hubGame
  const [tab, setTab] = useState('posts')
  const [postsSort, setPostsSort] = useState('top')
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
  const [postsNonce, setPostsNonce] = useState(0)
  const [detail, setDetail] = useState({ odds: [], plays: [], stats: [], live: null, splits: null })
  const [fantasy, setFantasy] = useState({
    players: [],
    props: [],
    season: null,
    week: null,
    sources: [],
  })
  const [fantasyLoading, setFantasyLoading] = useState(false)
  const [fantasyErr, setFantasyErr] = useState('')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [chatErr, setChatErr] = useState('')

  const sameSportGames = useMemo(
    () => loungeSportsHubGames(sports?.games || [], game?.sport_key),
    [game?.sport_key, sports?.games],
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
      setDetail({ odds: [], plays: [], stats: [], live: null, splits: null })
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
          splits: data.splits && typeof data.splits === 'object' ? data.splits : null,
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
  }, [game, supabaseClient])

  useEffect(() => {
    if (!game || !supabaseClient) return undefined
    let cancelled = false
    setFantasyLoading(true)
    setFantasyErr('')
    void loungeNflGameFantasy(supabaseClient, {
      eventId: game.id,
      awayAbbrev: game.away?.abbrev,
      homeAbbrev: game.home?.abbrev,
    })
      .then((data) => {
        if (cancelled) return
        if (data?.error) {
          setFantasyErr(String(data.error))
          setFantasy({ players: [], props: [], season: null, week: null, sources: [] })
          return
        }
        setFantasy({
          players: Array.isArray(data.players) ? data.players : [],
          props: Array.isArray(data.props) ? data.props : [],
          season: data.season ?? null,
          week: data.week ?? null,
          sources: Array.isArray(data.sources) ? data.sources : [],
        })
      })
      .catch((err) => {
        if (cancelled) return
        setFantasyErr(err?.message || 'Fantasy request failed.')
      })
      .finally(() => {
        if (!cancelled) setFantasyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [game, supabaseClient])

  const wantsPosts = tab === 'posts' || tab === 'chat'
  const postSort = postsSort === 'top' ? LOUNGE_SEARCH_SORT.ENGAGEMENT : LOUNGE_SEARCH_SORT.RECENT

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
      sort: tab === 'chat' ? LOUNGE_SEARCH_SORT.RECENT : postSort,
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
  }, [game, hydratePosts, postSort, postsNonce, searchQuery, supabaseClient, tab, wantsPosts])

  useEffect(() => {
    // Pregame → Fantasy; live → Chat; post → Posts
    if (!game?.id) return
    if (game.status === 'in') setTab('chat')
    else if (game.status === 'pre') setTab('fantasy')
    else setTab('posts')
    setPostsSort('top')
    setDraft('')
    setChatErr('')
    setDetail({ odds: [], plays: [], stats: [], live: null })
    setFantasy({ players: [], props: [], season: null, week: null, sources: [] })
    // Reset chrome when switching games only (status is read for default tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: game.id gate
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
          sportsGame: { suppress: false, eventId: game.id, eventIds: [game.id] },
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
    { id: 'posts', label: 'Posts' },
    { id: 'stats', label: 'Stats' },
    { id: 'plays', label: 'Plays' },
    { id: 'players', label: 'Players' },
    { id: 'fantasy', label: 'Fantasy' },
    { id: 'chat', label: 'Chat' },
  ]

  const hubTopBar = (
    <div
      {...(embedded ? { 'data-lounge-align-feed-title': '' } : {})}
      className={
        embedded
          ? `flex items-center gap-2 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`
          : 'flex items-center gap-2 px-2 pt-[max(0.5rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-1'
      }
    >
      <button
        type="button"
        onClick={() => sports.closeHub?.()}
        data-lounge-game-glass-chip
        className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`}
        aria-label="Back"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div data-lounge-game-pills-scroll className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pr-3">
          {sameSportGames.map((g) => {
            const active = g.id === game.id
            return (
              <button
                key={g.id}
                type="button"
                data-lounge-game-glass-chip={active ? 'active' : 'idle'}
                onClick={() => sports.openHub?.(g)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold touch-manipulation ${
                  active
                    ? 'border-white/55 bg-white/35 text-white shadow-sm'
                    : 'border-white/20 bg-white/10 text-white/80'
                }`}
              >
                {g.away?.abbrev} {g.status === 'pre' ? '@' : g.away?.score ?? ''} {g.home?.abbrev}{' '}
                {g.status === 'pre' ? '' : g.home?.score ?? ''} ·{' '}
                {g.status === 'post' ? 'F' : g.status === 'in' ? 'Live' : g.status_label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  const hubRoot = (
    <div
      data-lounge-game-hub
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-zinc-950 text-white'
          : 'fixed inset-0 flex flex-col bg-zinc-950 text-white'
      }
      style={embedded ? undefined : { zIndex: Z_APP_MODAL }}
    >
      <GameHubHero
        game={game}
        live={live}
        lastPlay={lastPlay}
        topBar={hubTopBar}
        splits={detail.splits}
      />

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
            {fantasyLoading && !(fantasy.props || []).length ? (
              <div className="py-4 text-center text-sm text-zinc-500">Loading Kalshi markets…</div>
            ) : (
              <KalshiGamePropsBoard props={fantasy.props} game={game} live={live} />
            )}
            <BoxScoreCard game={game} />
            <PlayerStats game={game} stats={detail.stats} />
          </div>
        ) : tab === 'plays' ? (
          <div className="py-2">
            <PlayList game={game} plays={detail.plays} />
          </div>
        ) : tab === 'players' ? (
          <GameHubPlayersPane
            players={fantasy.players}
            props={fantasy.props}
            loading={fantasyLoading}
            error={fantasyErr}
          />
        ) : tab === 'fantasy' ? (
          <GameHubFantasyPane
            players={fantasy.players}
            loading={fantasyLoading}
            error={fantasyErr}
            gameStatus={game.status}
            game={game}
            live={live}
          />
        ) : (
          <div className="py-2">
            {tab === 'posts' ? (
              <div className="mb-2 flex gap-1 rounded-full bg-zinc-900 p-0.5 w-fit">
                {[
                  { id: 'top', label: 'Top' },
                  { id: 'latest', label: 'Latest' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPostsSort(opt.id)}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                      postsSort === opt.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
            <PostList
              posts={posts}
              postsLoading={postsLoading}
              postsErr={postsErr}
              emptyLabel="No Lounge posts on this game yet."
              onOpenPost={onOpenPost}
              closeHub={sports.closeHub}
            />
          </div>
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
    </div>
  )

  if (embedded) return hubRoot
  return createPortal(hubRoot, document.body)
}
