import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Share } from 'lucide-react'
import {
  loungeCfbGamePlayers,
  loungeNflGameFantasy,
  loungeSportsGameDetail,
} from '../../utils/loungeSportsApi.js'
import { shareViaBestAvailable } from '../../utils/edgeNative.js'
import { formatLoungeSearchError, loungeSearch, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { executeLoungeCommunityPostSubmission } from './loungePostSubmitJob.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { loungeSportsHubGames } from './loungeSportsSlateWindow.js'
import LoungeGameHubPillChip from './LoungeGameHubPillChip.jsx'
import { useLoungeSlowTicker } from './useLoungeSlowTicker.js'
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
import { liveClockLabel, scoreText, sortPlaysNewestFirst } from './gameHub/gameHubFormatters.js'

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
  /** User-picked PBP row for field replay … { text, team, nonce }. */
  const [fieldReplay, setFieldReplay] = useState({ text: '', team: null, nonce: 0 })

  const sameSportGames = useMemo(
    () => loungeSportsHubGames(sports?.games || [], game?.sport_key),
    [game?.sport_key, sports?.games],
  )

  const isCfbGame = String(game?.sport_key || '').includes('ncaaf')
  const showFantasyTab = Boolean(game) && !isCfbGame

  const searchQuery = useMemo(() => {
    if (!game) return ''
    const mascot = (side) => String(side?.mascot || side?.name || '').trim()
    return `${mascot(game.away)} ${mascot(game.home)}`.trim().slice(0, 80)
  }, [game])

  const live = detail.live || game?.live || null
  const newestFeedPlay = sortPlaysNewestFirst(detail.plays)[0]
  const lastPlay = String(live?.last_play || newestFeedPlay?.description || '').trim()
  const fieldPlayText = String(fieldReplay.text || lastPlay).trim()
  const lastPlayMeta = {
    period: live?.period ?? newestFeedPlay?.period ?? null,
    clock: live?.clock || newestFeedPlay?.clock || '',
    possession: live?.possession || newestFeedPlay?.team || null,
  }

  useEffect(() => {
    // New live last-play from the feed … drop any manual replay override.
    setFieldReplay({ text: '', team: null, nonce: 0 })
  }, [live?.last_play])

  function replayPlayOnField(play) {
    const text = String(play?.description || '').trim()
    if (!text) return
    const team = play?.team === 'home' || play?.team === 'away' ? play.team : null
    setFieldReplay((prev) => ({
      text,
      team,
      nonce: (Number(prev.nonce) || 0) + 1,
    }))
    // Bring the field back into view if the plays list is scrolled deep.
    try {
      document
        .querySelector('[data-lounge-game-hub] [data-lounge-game-field]')
        ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    } catch {
      /* ignore */
    }
  }

  async function shareHubGame() {
    if (!game) return
    const away = String(game.away?.abbrev || game.away?.mascot || 'AWAY').trim()
    const home = String(game.home?.abbrev || game.home?.mascot || 'HOME').trim()
    const clock = liveClockLabel(game, live)
    const title = `${away} @ ${home}`
    const text =
      game.status === 'pre'
        ? `${title} · ${clock}`
        : `${away} ${scoreText(game.away, game.status)} @ ${home} ${scoreText(game.home, game.status)} · ${clock}`
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?tab=home`
        : 'https://edgetilt.com/?tab=home'
    await shareViaBestAvailable({ url, title, text })
  }

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
    const cfb = String(game.sport_key || '').includes('ncaaf')
    let cancelled = false

    const loadRoster = ({ showLoading }) => {
      if (showLoading) {
        setFantasyLoading(true)
        setFantasyErr('')
      }
      const req = cfb
        ? loungeCfbGamePlayers(supabaseClient, {
            eventId: game.id,
            awayAbbrev: game.away?.abbrev,
            homeAbbrev: game.home?.abbrev,
          })
        : loungeNflGameFantasy(supabaseClient, {
            eventId: game.id,
            awayAbbrev: game.away?.abbrev,
            homeAbbrev: game.home?.abbrev,
          })
      void req
        .then((data) => {
          if (cancelled) return
          if (data?.error) {
            setFantasyErr(String(data.error))
            if (showLoading) {
              setFantasy({ players: [], props: [], season: null, week: null, sources: [] })
            }
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
          if (showLoading) {
            setFantasyErr(err?.message || (cfb ? 'Roster request failed.' : 'Fantasy request failed.'))
          }
        })
        .finally(() => {
          if (!cancelled && showLoading) setFantasyLoading(false)
        })
    }

    loadRoster({ showLoading: true })
    // NFL fantasy quiet-poll while live; CFB roster is static for the week.
    const pollMs = !cfb && game.status === 'in' ? 45_000 : 0
    const id = pollMs ? window.setInterval(() => loadRoster({ showLoading: false }), pollMs) : 0
    return () => {
      cancelled = true
      if (id) window.clearInterval(id)
    }
  }, [game?.id, game?.status, game?.sport_key, game?.away?.abbrev, game?.home?.abbrev, supabaseClient])

  // Prefetch Lounge posts as soon as the hub opens (not only when Posts/Chat is selected).
  // Clearing posts when leaving those tabs forced a full reload on every return.
  const postSort = postsSort === 'top' ? LOUNGE_SEARCH_SORT.ENGAGEMENT : LOUNGE_SEARCH_SORT.RECENT
  useEffect(() => {
    if (!game || !supabaseClient || searchQuery.length < 2) {
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
  }, [game, hydratePosts, postSort, postsNonce, searchQuery, supabaseClient, tab])

  useEffect(() => {
    // Pregame → Fantasy (NFL) / Posts (CFB); live → Chat; post → Posts
    if (!game?.id) return
    const cfb = String(game.sport_key || '').includes('ncaaf')
    if (game.status === 'in') setTab('chat')
    else if (game.status === 'pre') setTab(cfb ? 'posts' : 'fantasy')
    else setTab('posts')
    setPostsSort('top')
    setDraft('')
    setChatErr('')
    setDetail({ odds: [], plays: [], stats: [], live: null, splits: null })
    setFantasy({ players: [], props: [], season: null, week: null, sources: [] })
    setPosts([])
    setFieldReplay({ text: '', team: null, nonce: 0 })
    // Reset chrome when switching games only (status is read for default tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: game.id gate
  }, [game?.id])

  const pillsScrollRef = useRef(null)
  const tickerGames = useMemo(() => {
    if (!sameSportGames.length) return []
    // Duplicate for seamless ticker when the strip overflows.
    return sameSportGames.length > 1 ? [...sameSportGames, ...sameSportGames] : sameSportGames
  }, [sameSportGames])
  useLoungeSlowTicker(pillsScrollRef, {
    enabled: sameSportGames.length > 1,
    speedPxPerSec: 22,
    loop: sameSportGames.length > 1,
  })

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
    ...(showFantasyTab ? [{ id: 'fantasy', label: 'Fantasy' }] : []),
    { id: 'chat', label: 'Chat' },
  ]

  const hubTopBar = (
    <div
      {...(embedded ? { 'data-lounge-align-feed-title': '' } : {})}
      className={
        embedded
          ? `flex items-center gap-2 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`
          : 'flex items-center gap-2 px-2 pt-[max(0.5rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] pb-0.5'
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
      <div data-lounge-game-pills-scroll ref={pillsScrollRef} className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex gap-2 px-1">
          {tickerGames.map((g, idx) => {
            const active = g.id === game.id
            return (
              <LoungeGameHubPillChip
                key={`${String(g.id)}-${idx}`}
                game={g}
                active={active}
                onClick={() => sports.openHub?.(g)}
              />
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void shareHubGame()}
        data-lounge-game-glass-chip
        className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`}
        aria-label="Share game"
      >
        <Share className="h-5 w-5" strokeWidth={2.25} />
      </button>
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
        lastPlay={fieldPlayText}
        playReplayNonce={fieldReplay.nonce}
        replayTeam={fieldReplay.team}
        topBar={hubTopBar}
        splits={detail.splits}
        players={fantasy.players}
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
        {/* Keep every pane mounted so tab switches stay instant (data is already prefetched). */}
        <div hidden={tab !== 'stats'} className="space-y-3 py-3">
          <OddsTable game={game} books={detail.odds} />
          {fantasyLoading && !(fantasy.props || []).length ? (
            <div className="py-4 text-center text-sm text-zinc-500">Loading Kalshi markets…</div>
          ) : (
            <KalshiGamePropsBoard props={fantasy.props} game={game} live={live} />
          )}
          <BoxScoreCard game={game} />
          <PlayerStats game={game} stats={detail.stats} />
        </div>
        <div hidden={tab !== 'plays'} className="py-2">
          <PlayList
            game={game}
            plays={detail.plays}
            lastPlayText={lastPlay}
            lastPlayMeta={lastPlayMeta}
            activePlayText={fieldPlayText}
            onSelectPlay={replayPlayOnField}
          />
        </div>
        <div hidden={tab !== 'players'}>
          <GameHubPlayersPane
            players={fantasy.players}
            props={fantasy.props}
            loading={fantasyLoading}
            error={fantasyErr}
            game={game}
          />
        </div>
        {showFantasyTab ? (
          <div hidden={tab !== 'fantasy'}>
            <GameHubFantasyPane
              players={fantasy.players}
              loading={fantasyLoading}
              error={fantasyErr}
              gameStatus={game.status}
              game={game}
              live={live}
            />
          </div>
        ) : null}
        <div hidden={tab !== 'posts' && tab !== 'chat'} className="py-2">
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
