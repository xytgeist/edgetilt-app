import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import {
  loungeCfbGamePlayers,
  loungeGameNews,
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
import { useCoarseLandscape } from '../../utils/edgeiOSComposerPortraitLock.js'
import GameHubHero from './gameHub/GameHubHero.jsx'
import GameHubMoreMenu from './gameHub/GameHubMoreMenu.jsx'
import { setLegalBooksOn, setLegalBooksState, useLegalBooks } from './gameHub/gameHubLegalBooks.js'
import {
  isGameHubWhistleMuted,
  playGameHubWhistle,
  setGameHubWhistleMuted,
} from './gameHub/gameHubWhistle.js'
import GameHubPlayersPane from './gameHub/GameHubPlayersPane.jsx'
import GameHubFantasyPane from './gameHub/GameHubFantasyPane.jsx'
import GameHubChatPane from './gameHub/GameHubChatPane.jsx'
import GameHubNewsPane from './gameHub/GameHubNewsPane.jsx'
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
import { readGameHubCache, writeGameHubCache } from './gameHub/gameHubCache.js'
import { requestSportsBetLog } from '../sports-bet-tracker/sportsBetNav.js'
import { SportsBetLogGameProvider } from '../sports-bet-tracker/sportsBetLogContext.jsx'

const EMPTY_DETAIL = { odds: [], plays: [], stats: [], live: null, splits: null }

/** Both sides filled … only then is it safe to ask the server to stop resending rosters. */
function hasRosterRows(rosters) {
  return Boolean(
    rosters
      && Array.isArray(rosters.home) && rosters.home.length
      && Array.isArray(rosters.away) && rosters.away.length,
  )
}
const EMPTY_FANTASY = { players: [], props: [], season: null, week: null, sources: [] }
const EMPTY_POSTS = { top: null, latest: null }

/**
 * Game destination opened from the in-post score pill.
 * X-style hero, News, Stats, Plays (live/final only), Players, Fantasy, Posts (Top/Latest), Chat.
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
  const coarseLandscape = useCoarseLandscape()
  const [tab, setTab] = useState('news')
  const [news, setNews] = useState(null)
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsErr, setNewsErr] = useState('')
  const [postsSort, setPostsSort] = useState('top')
  const [postsBySort, setPostsBySort] = useState(EMPTY_POSTS)
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsErr, setPostsErr] = useState('')
  const [detail, setDetail] = useState(EMPTY_DETAIL)
  const [fantasy, setFantasy] = useState(EMPTY_FANTASY)
  const [fantasyLoading, setFantasyLoading] = useState(false)
  const [fantasyErr, setFantasyErr] = useState('')
  const fantasyWantedRef = useRef(true)
  const fantasyRefreshRef = useRef(null)
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
  const legalBooks = useLegalBooks()
  const chat = useGameHubChat(supabaseClient, game?.id ? String(game.id) : '')
  const tabPagerRef = useRef(null)
  const tabPaneRefs = useRef({})
  const tabBarRef = useRef(null)
  const tabScrollSyncLock = useRef(0)
  const tabSettleRef = useRef(0)

  const sameSportGames = useMemo(
    () => loungeSportsHubGames(sports?.games || [], game?.sport_key),
    [game?.sport_key, sports?.games],
  )

  const sportKey = String(game?.sport_key || '')
  const isFootballGame = sportKey.includes('americanfootball')
  const isCfbGame = sportKey.includes('ncaaf')
  // Fantasy is NFL-only … do not show an empty Fantasy tab for CFB / NHL / NBA / MLB.
  const showFantasyTab = Boolean(game) && sportKey.includes('americanfootball_nfl') && !isCfbGame
  const showNewsTab = Boolean(game) && isFootballGame
  // Players needs football roster Edges … hide until NHL/NBA/MLB have their own.
  const showPlayersTab = Boolean(game) && isFootballGame
  const showPlaysTab = Boolean(game) && game.status !== 'pre'
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

  function logBetFromHub() {
    if (!game) return
    sports.closeSlate?.()
    requestSportsBetLog({
      event_id: game.id,
      sport_key: game.sport_key,
      sport_label: game.sport_label,
      home_team: game.home?.name || game.home?.mascot,
      away_team: game.away?.name || game.away?.mascot,
      commence_time: game.commence_time,
      market: 'spread',
      side: 'home',
      line: game.home?.spread ?? '',
      odds: '-110',
      source: 'game_hub',
    })
  }

  const detailGameId = game?.id || null
  const detailGameLive = game?.status === 'in'
  useEffect(() => {
    if (!detailGameId || !supabaseClient) {
      setDetail(EMPTY_DETAIL)
      return undefined
    }
    const cachedDetail = readGameHubCache(detailGameId)?.detail
    setDetail(cachedDetail || EMPTY_DETAIL)
    let cancelled = false
    let inflight = false
    let knownRosters = hasRosterRows(cachedDetail?.rosters) ? cachedDetail.rosters : null
    const load = () => {
      if (inflight) return
      inflight = true
      void loungeSportsGameDetail(supabaseClient, detailGameId, { omitRosters: Boolean(knownRosters) }).then((data) => {
        inflight = false
        if (cancelled || data?.error) return
        const freshRosters = data.rosters && typeof data.rosters === 'object' ? data.rosters : null
        if (hasRosterRows(freshRosters)) knownRosters = freshRosters
        const next = {
          odds: Array.isArray(data.odds) ? data.odds : [],
          plays: Array.isArray(data.plays) ? data.plays : [],
          stats: Array.isArray(data.stats) ? data.stats : [],
          live: data.game?.live || data.live || null,
          splits: data.splits && typeof data.splits === 'object' ? data.splits : null,
          teamStats: data.team_stats && typeof data.team_stats === 'object' ? data.team_stats : null,
          playerBox: data.player_box && typeof data.player_box === 'object' ? data.player_box : null,
          rosters: knownRosters || freshRosters,
        }
        writeGameHubCache(detailGameId, { detail: next })
        setDetail(next)
      }, () => {
        inflight = false
      })
    }
    load()
    // Live: ~6s behind ESPN at worst (server shares a 4s per-game cache across viewers). Paused while hidden.
    const ms = detailGameLive ? 6_000 : 120_000
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      load()
    }, ms)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [detailGameId, detailGameLive, supabaseClient])

  useEffect(() => {
    if (!game || !supabaseClient) return undefined
    const sk = String(game.sport_key || '')
    const football = sk.includes('americanfootball')
    if (!football) {
      setFantasy(EMPTY_FANTASY)
      setFantasyLoading(false)
      setFantasyErr('')
      fantasyRefreshRef.current = null
      return undefined
    }
    const cfb = sk.includes('ncaaf')
    const gameId = game.id
    const cachedFantasy = readGameHubCache(gameId)?.fantasy
    setFantasy(cachedFantasy || EMPTY_FANTASY)
    let cancelled = false
    let haveRoster = Boolean(cachedFantasy)

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
            // Quiet polls keep the last good roster; iOS aborts in-flight fetches on background.
            if (showLoading) {
              setFantasyErr(String(data.error))
              setFantasy({ players: [], props: [], season: null, week: null, sources: [] })
            }
            return
          }
          setFantasyErr('')
          haveRoster = true
          const next = {
            players: Array.isArray(data.players) ? data.players : [],
            props: Array.isArray(data.props) ? data.props : [],
            season: data.season ?? null,
            week: data.week ?? null,
            sources: Array.isArray(data.sources) ? data.sources : [],
          }
          writeGameHubCache(gameId, { fantasy: next })
          setFantasy(next)
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

    if (cachedFantasy) {
      setFantasyLoading(false)
      setFantasyErr('')
    }
    loadRoster({ showLoading: !cachedFantasy })
    // NFL fantasy quiet-poll while live and on a surface that shows it; CFB roster is static for the week.
    const pollMs = !cfb && game.status === 'in' ? 45_000 : 0
    const id = pollMs
      ? window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return
          if (!fantasyWantedRef.current) return
          loadRoster({ showLoading: false })
        }, pollMs)
      : 0
    fantasyRefreshRef.current = pollMs ? () => loadRoster({ showLoading: false }) : null
    const onVisible = () => {
      if (document.hidden) return
      if (!haveRoster || (pollMs && fantasyWantedRef.current)) loadRoster({ showLoading: false })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (id) window.clearInterval(id)
      fantasyRefreshRef.current = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [game?.id, game?.status, game?.sport_key, game?.away?.abbrev, game?.home?.abbrev, supabaseClient])

  const newsGameId = showNewsTab ? game?.id || null : null
  useEffect(() => {
    if (!newsGameId || !supabaseClient || !game) {
      setNews(null)
      setNewsErr('')
      setNewsLoading(false)
      return undefined
    }
    const cachedNews = readGameHubCache(newsGameId)?.news
    setNews(cachedNews || null)
    setNewsErr('')
    let cancelled = false
    const load = ({ showLoading }) => {
      if (showLoading) setNewsLoading(true)
      void loungeGameNews(supabaseClient, game)
        .then((data) => {
          if (cancelled) return
          if (data?.error) {
            if (showLoading) setNewsErr(String(data.error))
            return
          }
          setNewsErr('')
          writeGameHubCache(newsGameId, { news: data.news })
          setNews(data.news)
        })
        .finally(() => {
          if (!cancelled && showLoading) setNewsLoading(false)
        })
    }
    load({ showLoading: !cachedNews })
    // Server caches ~5 min; injuries and notes move on practice-report cadence, not per play.
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      load({ showLoading: false })
    }, 5 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // Game object churns on every board poll … id + status is the real identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsGameId, game?.status, supabaseClient])

  // Prefetch both Top and Latest as soon as the hub opens so neither the tab nor the sort toggle reloads.
  // Keyed on game id (not the game object, which churns on every board poll).
  const postsGameId = game?.id || null
  useEffect(() => {
    if (!postsGameId || !supabaseClient || searchQuery.length < 2) {
      setPostsBySort(EMPTY_POSTS)
      setPostsErr('')
      setPostsLoading(false)
      return undefined
    }
    const cachedPosts = readGameHubCache(postsGameId)?.posts
    setPostsBySort(cachedPosts || EMPTY_POSTS)
    setPostsLoading(!cachedPosts)
    setPostsErr('')
    let cancelled = false
    const fetchSort = (sort) =>
      loungeSearch(supabaseClient, searchQuery, {
        sort,
        postsLimit: 16,
        profilesLimit: 0,
        commentsLimit: 0,
      }).then(async (result) => {
        const raw = Array.isArray(result.posts) ? result.posts : []
        return hydratePosts ? hydratePosts(raw) : raw
      })
    void Promise.all([fetchSort(LOUNGE_SEARCH_SORT.ENGAGEMENT), fetchSort(LOUNGE_SEARCH_SORT.RECENT)])
      .then(([top, latest]) => {
        if (cancelled) return
        const next = { top, latest }
        writeGameHubCache(postsGameId, { posts: next })
        setPostsBySort(next)
      })
      .catch((err) => {
        if (cancelled || cachedPosts) return
        setPostsBySort(EMPTY_POSTS)
        setPostsErr(formatLoungeSearchError(err))
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postsGameId, hydratePosts, searchQuery, supabaseClient])
  const posts = postsBySort[postsSort === 'top' ? 'top' : 'latest'] || []

  useEffect(() => {
    // Live → Plays; pregame + final → News (football) / Posts
    if (!game?.id) return
    const football = String(game.sport_key || '').includes('americanfootball')
    if (game.status === 'in') setTab('plays')
    else setTab(football ? 'news' : 'posts')
    setPostsSort('top')
    setDraft('')
    setChatErr('')
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
  // Landscape phone or iPad on a football game renders the full-screen gamecast instead of the tabbed hub.
  const gamecastFull = Boolean(game) && coarseLandscape && String(game.sport_key || '').includes('football')
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

  // Live fantasy points + Kalshi props only show on Players / Fantasy / Stats and the full-screen prop rails.
  const fantasyWanted = gamecastFull || tab === 'players' || tab === 'fantasy' || tab === 'stats'
  useEffect(() => {
    const was = fantasyWantedRef.current
    fantasyWantedRef.current = fantasyWanted
    if (fantasyWanted && !was) fantasyRefreshRef.current?.()
  }, [fantasyWanted])

  const tabs = [
    ...(showNewsTab ? [{ id: 'news', label: 'News' }] : []),
    { id: 'stats', label: 'Stats' },
    ...(showPlaysTab ? [{ id: 'plays', label: 'Plays' }] : []),
    ...(showPlayersTab ? [{ id: 'players', label: 'Players' }] : []),
    ...(showFantasyTab ? [{ id: 'fantasy', label: 'Fantasy' }] : []),
    { id: 'posts', label: 'Posts' },
    { id: 'chat', label: 'Chat' },
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  const tabIdsKey = tabs.map((t) => t.id).join(',')

  const scrollTabPagerTo = useCallback((id, behavior = 'smooth') => {
    const pager = tabPagerRef.current
    const pane = tabPaneRefs.current[id]
    if (!pager || !pane) return
    const left = pane.offsetLeft
    if (Math.abs(pager.scrollLeft - left) < 2) return
    tabScrollSyncLock.current = Date.now()
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    pager.scrollTo({ left, behavior: reduce ? 'instant' : behavior })
  }, [])

  useLayoutEffect(() => {
    const pager = tabPagerRef.current
    const w = pager?.clientWidth || 0
    if (w >= 8) {
      const nearest = Math.round(pager.scrollLeft / w)
      const want = tabs.findIndex((t) => t.id === activeTab)
      if (want >= 0 && nearest === want) return
    }
    scrollTabPagerTo(activeTab, 'instant')
  }, [activeTab, tabIdsKey, game?.id, scrollTabPagerTo])

  useEffect(() => {
    const btn = tabBarRef.current?.querySelector(`[data-lounge-game-hub-tab="${activeTab}"]`)
    btn?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTab])

  useEffect(() => () => window.clearTimeout(tabSettleRef.current), [])

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

  const onTabPagerScroll = () => {
    const pager = tabPagerRef.current
    if (!pager) return
    if (Date.now() - tabScrollSyncLock.current < 80) return
    window.clearTimeout(tabSettleRef.current)
    tabSettleRef.current = window.setTimeout(() => {
      const w = pager.clientWidth
      if (w < 8) return
      const i = Math.max(0, Math.min(tabs.length - 1, Math.round(pager.scrollLeft / w)))
      const id = tabs[i]?.id
      if (id && id !== tab) setTab(id)
    }, 60)
  }

  const renderHubTabPane = (id) => {
    if (id === 'news') {
      return <GameHubNewsPane news={news} loading={newsLoading} error={newsErr} game={game} />
    }
    if (id === 'stats') {
      return (
        <div className="space-y-3 py-3">
          <OddsTable game={game} books={detail.odds} legalState={legalBooks.legalState} />
          {fantasyLoading && !(fantasy.props || []).length ? (
            <div className="py-4 text-center text-sm text-zinc-500">Loading Kalshi markets…</div>
          ) : (
            <KalshiGamePropsBoard props={fantasy.props} game={game} live={live} />
          )}
          <BoxScoreCard game={game} />
          <PlayerStats game={game} stats={detail.stats} />
        </div>
      )
    }
    if (id === 'plays') {
      return (
        <div className="py-2">
          <PlayList
            game={game}
            plays={detail.plays}
            lastPlayText={lastPlay}
            lastPlayMeta={lastPlayMeta}
            activePlayText={fieldPlayText}
            onSelectPlay={replayPlayOnField}
          />
        </div>
      )
    }
    if (id === 'players') {
      return (
        <GameHubPlayersPane
          players={fantasy.players}
          props={fantasy.props}
          loading={fantasyLoading}
          error={fantasyErr}
          game={game}
          live={live}
          playerBox={detail.playerBox}
        />
      )
    }
    if (id === 'fantasy') {
      return (
        <GameHubFantasyPane
          players={fantasy.players}
          loading={fantasyLoading}
          error={fantasyErr}
          gameStatus={game.status}
          game={game}
          live={live}
        />
      )
    }
    if (id === 'chat') {
      return (
        <div className="py-2">
          <GameHubChatPane
            messages={chat.messages}
            loading={chat.loading}
            error={chat.error}
            viewerId={chat.viewerId}
            readOnly={loungeReadOnly}
            onDelete={(cid) => {
              void chat.remove(cid).catch((err) => setChatErr(err?.message || 'Could not delete.'))
            }}
          />
        </div>
      )
    }
    if (id === 'posts') {
      return (
        <div className="py-2">
          <div className="mb-2 flex w-fit gap-1 rounded-full bg-zinc-900 p-0.5">
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
          <PostList
            posts={posts}
            postsLoading={postsLoading}
            postsErr={postsErr}
            emptyLabel="No Lounge posts on this game yet."
            onOpenPost={onOpenPost}
            closeHub={sports.closeHub}
          />
        </div>
      )
    }
    return null
  }

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
      <GameHubMoreMenu
        chipClassName={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`}
        muted={whistleMuted}
        onToggleMuted={toggleWhistleMuted}
        legalBooks={legalBooks}
        onToggleLegalBooks={() => setLegalBooksOn(!legalBooks.on)}
        onPickLegalState={setLegalBooksState}
        onShare={shareHubGame}
        onLogBet={logBetFromHub}
      />
    </div>
  )

  const hubRoot = (
    <SportsBetLogGameProvider
      game={game}
      supabaseClient={supabaseClient}
      onBeforeLog={() => sports.closeSlate?.()}
    >
    <div
      data-lounge-game-hub
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col overflow-hidden overscroll-none bg-zinc-950 text-white'
          : 'fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-zinc-950 text-white'
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
        odds={detail.odds}
      />

      <div
        ref={tabBarRef}
        className="flex shrink-0 gap-5 overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none border-b border-zinc-800 px-4 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            data-lounge-game-hub-tab={item.id}
            onClick={() => {
              setTab(item.id)
              scrollTabPagerTo(item.id)
            }}
            className={`-mb-px shrink-0 border-b-2 pb-2.5 pt-1 text-[15px] font-semibold touch-manipulation ${
              activeTab === item.id ? 'border-white text-white' : 'border-transparent text-zinc-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        ref={tabPagerRef}
        data-lounge-game-hub-tab-pager
        className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain overscroll-y-none no-scrollbar [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onTabPagerScroll}
      >
        {tabs.map((item) => (
          <div
            key={item.id}
            ref={(el) => {
              if (el) tabPaneRefs.current[item.id] = el
              else delete tabPaneRefs.current[item.id]
            }}
            data-lounge-game-hub-tab-pane={item.id}
            className="h-full min-h-0 w-full min-w-full shrink-0 snap-start overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] [-webkit-overflow-scrolling:touch]"
          >
            {renderHubTabPane(item.id)}
          </div>
        ))}
      </div>

      {activeTab === 'chat' && !loungeReadOnly ? (
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
    </SportsBetLogGameProvider>
  )

  // Landscape phone or iPad on a football game: full-screen gamecast (live / final: scoreboard, field, stat rails;
  // pregame: matchup board) instead of the tabbed hub. Replaces the tabbed root rather than stacking on it
  // so the field anims only run once.
  if (gamecastFull) {
    const chipClass = `inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25`
    return createPortal(
      <SportsBetLogGameProvider
      game={game}
      supabaseClient={supabaseClient}
      onBeforeLog={() => sports.closeSlate?.()}
    >
      <div
        data-lounge-game-hub
        data-lounge-gamecast-full
        className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-zinc-950 text-white"
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
              <GameHubMoreMenu
                chipClassName={chipClass}
                muted={whistleMuted}
                onToggleMuted={toggleWhistleMuted}
                legalBooks={legalBooks}
                onToggleLegalBooks={() => setLegalBooksOn(!legalBooks.on)}
                onPickLegalState={setLegalBooksState}
                onShare={shareHubGame}
                onLogBet={logBetFromHub}
              />
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
      </div>
      </SportsBetLogGameProvider>,
      document.body,
    )
  }

  if (embedded) return hubRoot
  return createPortal(hubRoot, document.body)
}
