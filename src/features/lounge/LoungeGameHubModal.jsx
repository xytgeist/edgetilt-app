import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Share, Volume2, VolumeX } from 'lucide-react'
import {
  loungeCfbGamePlayers,
  loungeNflGameFantasy,
  loungeSportsGameDetail,
} from '../../utils/loungeSportsApi.js'
import { shareViaBestAvailable } from '../../utils/edgeNative.js'
import { formatLoungeSearchError, loungeSearch, LOUNGE_SEARCH_SORT } from './loungeSearchApi.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { loungeSportsHubGames } from './loungeSportsSlateWindow.js'
import { loungeSportsGameShareUrl } from './loungeSportsHubNav.js'
import LoungeGameHubPillChip from './LoungeGameHubPillChip.jsx'
import { useLoungeSlowTicker } from './useLoungeSlowTicker.js'
import {
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { usePhoneLandscapeNotTablet } from '../../utils/edgeiOSComposerPortraitLock.js'
import GameHubHero from './gameHub/GameHubHero.jsx'
import {
  isGameHubWhistleMuted,
  playGameHubWhistle,
  setGameHubWhistleMuted,
} from './gameHub/gameHubWhistle.js'
import GameHubPlayersPane from './gameHub/GameHubPlayersPane.jsx'
import GameHubFantasyPane from './gameHub/GameHubFantasyPane.jsx'
import GameHubChatPane from './gameHub/GameHubChatPane.jsx'
import { GAME_CHAT_MAX_CHARS } from './gameHub/gameHubChatApi.js'
import { useGameHubChat } from './gameHub/useGameHubChat.js'
import { KalshiGamePropsBoard } from './gameHub/GameHubKalshiProps.jsx'
import { BoxScoreCard, OddsTable, PlayList, PlayerStats, PostList } from './gameHub/GameHubPanes.jsx'
import {
  liveClockLabel,
  mergeFieldRoster,
  resolvePlayStartSpot,
  scoreText,
  sortPlaysNewestFirst,
  withFreshestLiveClock,
} from './gameHub/gameHubFormatters.js'

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
  const phoneLandscape = usePhoneLandscapeNotTablet()
  const [tab, setTab] = useState('posts')
  const [postsSort, setPostsSort] = useState('top')
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
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
  const [whistleMuted, setWhistleMuted] = useState(isGameHubWhistleMuted)
  const toggleWhistleMuted = () => {
    const next = !whistleMuted
    setWhistleMuted(next)
    setGameHubWhistleMuted(next)
    // Unmuting is a tap … sample the whistle (also unlocks iOS audio for the next real one).
    if (!next) playGameHubWhistle({ force: true })
  }
  const chat = useGameHubChat(supabaseClient, game?.id ? String(game.id) : '')

  const sameSportGames = useMemo(
    () => loungeSportsHubGames(sports?.games || [], game?.sport_key),
    [game?.sport_key, sports?.games],
  )

  const isCfbGame = String(game?.sport_key || '').includes('ncaaf')
  const showFantasyTab = Boolean(game) && !isCfbGame
  const fieldPlayers = useMemo(
    () => mergeFieldRoster(fantasy.players, detail.rosters, game),
    [fantasy.players, detail.rosters, game],
  )

  const searchQuery = useMemo(() => {
    if (!game) return ''
    const mascot = (side) => String(side?.mascot || side?.name || '').trim()
    return `${mascot(game.away)} ${mascot(game.home)}`.trim().slice(0, 80)
  }, [game])

  const baseLive = detail.live || game?.live || null
  const live = useMemo(() => withFreshestLiveClock(baseLive, game, detail.plays), [baseLive, game, detail.plays])
  const newestFeedPlay = sortPlaysNewestFirst(detail.plays)[0]
  const lastPlay = String(live?.last_play || newestFeedPlay?.description || '').trim()
  const fieldPlayText = String(fieldReplay.text || lastPlay).trim()
  // Prefer the PBP row's team over live.possession … live often already flipped
  // to the next play by the time last_play text lands.
  const feedRowForFieldPlay = (() => {
    const needle = fieldPlayText
    if (!needle) return null
    const rows = Array.isArray(detail.plays) ? detail.plays : []
    // Newest match … identical play text can repeat in a game.
    return rows.findLast((p) => String(p?.description || '').trim() === needle) || null
  })()
  const feedTeamForFieldPlay = (() => {
    if (fieldReplay.team === 'home' || fieldReplay.team === 'away') return fieldReplay.team
    const hit = feedRowForFieldPlay
    if (hit?.team === 'home' || hit?.team === 'away') return hit.team
    return null
  })()
  const fieldPlayStartSpot =
    Number(fieldReplay.nonce) > 0 && fieldReplay.text
      ? fieldReplay.startSpot || null
      : resolvePlayStartSpot(detail.plays, { text: fieldPlayText })
  const lastPlayMeta = {
    period: live?.period ?? newestFeedPlay?.period ?? null,
    clock: live?.clock || newestFeedPlay?.clock || '',
    possession: feedTeamForFieldPlay || live?.possession || newestFeedPlay?.team || null,
  }

  useEffect(() => {
    // New live last-play from the feed … don't wipe an in-flight user replay of
    // that same play (poll object churn used to cancel the TD celebrate RAF).
    const next = String(live?.last_play || '').trim()
    setFieldReplay((prev) => {
      if (Number(prev.nonce) <= 0) return { text: '', team: null, nonce: 0 }
      if (next && prev.text && next !== prev.text) {
        return { text: '', team: null, nonce: 0 }
      }
      return prev
    })
  }, [live?.last_play])

  function replayPlayOnField(play) {
    const text = String(play?.description || '').trim()
    if (!text) return
    const team = play?.team === 'home' || play?.team === 'away' ? play.team : null
    setFieldReplay((prev) => ({
      text,
      team,
      startSpot: resolvePlayStartSpot(detail.plays, { play, text }),
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
    const url = loungeSportsGameShareUrl(
      game,
      typeof window !== 'undefined' ? window.location.origin : 'https://edgetilt.com',
    )
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
          teamStats: data.team_stats && typeof data.team_stats === 'object' ? data.team_stats : null,
          playerBox: data.player_box && typeof data.player_box === 'object' ? data.player_box : null,
          rosters: data.rosters && typeof data.rosters === 'object' ? data.rosters : null,
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
            awayName: game.away?.name,
            homeName: game.home?.name,
            commenceTime: game.commence_time,
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

  // Prefetch Lounge posts as soon as the hub opens (not only when Posts is selected).
  // Clearing posts when leaving the tab forced a full reload on every return.
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
  }, [game, hydratePosts, postSort, searchQuery, supabaseClient])

  useEffect(() => {
    // Pregame → Fantasy (NFL) / Posts (CFB); live → Plays; post → Posts
    if (!game?.id) return
    const cfb = String(game.sport_key || '').includes('ncaaf')
    if (game.status === 'in') setTab('plays')
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
  const landscapePillsScrollRef = useRef(null)
  const tickerGames = useMemo(() => {
    if (!sameSportGames.length) return []
    // Duplicate for seamless ticker when the strip overflows.
    return sameSportGames.length > 1 ? [...sameSportGames, ...sameSportGames] : sameSportGames
  }, [sameSportGames])
  // Landscape phone on a football game renders the full-screen gamecast (see below) instead of the tabbed hub.
  const gamecastFull = Boolean(game) && phoneLandscape && String(game.sport_key || '').includes('football')
  // Strip only mounts once a game is open … gate on that so the hook starts with a real element. Portrait
  // top bar and landscape bottom strip are different elements, so each gets its own ticker gated on layout.
  const pillsTickerOn = Boolean(game) && sameSportGames.length > 1
  useLoungeSlowTicker(pillsScrollRef, {
    enabled: pillsTickerOn && !gamecastFull,
    speedPxPerSec: 22,
    loop: pillsTickerOn,
  })
  useLoungeSlowTicker(landscapePillsScrollRef, {
    enabled: pillsTickerOn && gamecastFull,
    speedPxPerSec: 22,
    loop: pillsTickerOn,
    // Pregame matchup board vs field gamecast mount the strip in different trees.
    rebindKey: game?.status === 'pre' ? 'pre' : 'field',
  })

  if (!game || typeof document === 'undefined') return null

  const sendChat = async () => {
    const body = draft.trim()
    if (!body || posting || loungeReadOnly) return
    setPosting(true)
    setChatErr('')
    try {
      await chat.send(body)
      setDraft('')
    } catch (err) {
      setChatErr(err?.message || 'Could not send.')
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

  const pillsRow = (
    <div className="flex gap-2 px-1">
      {tickerGames.map((g, idx) => (
        <LoungeGameHubPillChip
          key={`${String(g.id)}-${idx}`}
          game={g}
          active={g.id === game.id}
          onClick={() => sports.openHub?.(g)}
        />
      ))}
    </div>
  )

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
        {pillsRow}
      </div>
      <button
        type="button"
        onClick={toggleWhistleMuted}
        data-lounge-game-glass-chip
        data-lounge-hub-whistle-toggle={whistleMuted ? 'muted' : 'on'}
        className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`}
        aria-label={whistleMuted ? 'Unmute game sounds' : 'Mute game sounds'}
        aria-pressed={whistleMuted}
      >
        {whistleMuted ? (
          <VolumeX className="h-5 w-5 opacity-70" strokeWidth={2.25} />
        ) : (
          <Volume2 className="h-5 w-5" strokeWidth={2.25} />
        )}
      </button>
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
        replayTeam={feedTeamForFieldPlay}
        playStartSpot={fieldPlayStartSpot}
        topBar={hubTopBar}
        splits={detail.splits}
        players={fieldPlayers}
        plays={detail.plays}
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
        {tab === 'chat' ? (
          <div className="py-2">
            <GameHubChatPane
              messages={chat.messages}
              loading={chat.loading}
              error={chat.error}
              viewerId={chat.viewerId}
              readOnly={loungeReadOnly}
              onDelete={(id) => {
                void chat.remove(id).catch((err) => setChatErr(err?.message || 'Could not delete.'))
              }}
            />
          </div>
        ) : null}
        <div hidden={tab !== 'posts'} className="py-2">
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
              maxLength={GAME_CHAT_MAX_CHARS}
              placeholder="Chat about the game"
              className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={posting || !draft.trim()}
              className="shrink-0 rounded-full bg-zinc-100 px-3 py-2 text-[13px] font-semibold text-zinc-950 disabled:opacity-40"
            >
              {posting ? '…' : 'Send'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )

  // Landscape phone on a football game: full-screen gamecast (live / final: scoreboard, field, stat rails;
  // pregame: matchup board) instead of the tabbed hub. Replaces the tabbed root rather than stacking on it
  // so the field anims only run once.
  if (gamecastFull) {
    const chipClass = `inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`
    return createPortal(
      <div
        data-lounge-game-hub
        data-lounge-gamecast-full
        className="fixed inset-0 flex flex-col bg-zinc-950 text-white"
        style={{ zIndex: Z_APP_MODAL }}
      >
        <GameHubHero
          fullscreen
          sideSlots={{
            left: (
              <button
                type="button"
                onClick={() => sports.closeHub?.()}
                data-lounge-game-glass-chip
                className={chipClass}
                aria-label="Back"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            ),
            right: (
              <button
                type="button"
                onClick={toggleWhistleMuted}
                data-lounge-game-glass-chip
                data-lounge-hub-whistle-toggle={whistleMuted ? 'muted' : 'on'}
                className={chipClass}
                aria-label={whistleMuted ? 'Unmute game sounds' : 'Mute game sounds'}
                aria-pressed={whistleMuted}
              >
                {whistleMuted ? (
                  <VolumeX className="h-5 w-5 opacity-70" strokeWidth={2.25} />
                ) : (
                  <Volume2 className="h-5 w-5" strokeWidth={2.25} />
                )}
              </button>
            ),
          }}
          bottomBar={
            sameSportGames.length > 1 ? (
              <div
                data-lounge-game-pills-scroll
                data-lounge-gamecast-pills
                ref={landscapePillsScrollRef}
                className="overflow-x-auto px-2"
              >
                {pillsRow}
              </div>
            ) : null
          }
          game={game}
          live={live}
          lastPlay={fieldPlayText}
          playReplayNonce={fieldReplay.nonce}
          replayTeam={feedTeamForFieldPlay}
          playStartSpot={fieldPlayStartSpot}
          splits={detail.splits}
          players={fieldPlayers}
          plays={detail.plays}
          teamStats={detail.teamStats}
          odds={detail.odds}
          marketProps={fantasy.props}
          playerBox={detail.playerBox}
        />
      </div>,
      document.body,
    )
  }

  if (embedded) return hubRoot
  return createPortal(hubRoot, document.body)
}
