import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, ChevronLeft, ClipboardList, Loader2 } from 'lucide-react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import LoungeGolfTournamentCard from './LoungeGolfTournamentCard.jsx'
import {
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import {
  LOUNGE_SPORTS_HUB_FILTER_ALL,
  LOUNGE_SPORTS_HUB_FILTER_CFB,
  LOUNGE_SPORTS_HUB_FILTER_MLB,
  LOUNGE_SPORTS_HUB_FILTER_MLS,
  LOUNGE_SPORTS_HUB_FILTER_NBA,
  LOUNGE_SPORTS_HUB_FILTER_NHL,
  LOUNGE_SPORTS_HUB_FILTER_NFL,
  LOUNGE_SPORTS_HUB_FILTER_PGA,
} from './loungeSportsHubNav.js'
import { isPgaGame, loungeSportsSlateGames } from './loungeSportsSlateWindow.js'
import { probeLogoWashTreatment, resolveNflPillWashes } from './loungeSportsMatch.js'
import { usePhoneLandscapeNotTablet } from '../../utils/edgeiOSComposerPortraitLock.js'
import { openSportsBetTracker, openSportsBetTools } from '../sports-bet-tracker/sportsBetNav.js'

/** Never hold a league hub behind the loader longer than this (slow CDN / missing art). */
const LEAGUE_HUB_ASSET_CAP_MS = 6000

function preloadImage(src) {
  if (!src || typeof Image === 'undefined') return Promise.resolve()
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  return img.decode().catch(() => {})
}

/** Logos (+ light variants) decoded and wash treatments probed for every pill on the slate. */
function preloadSlatePillAssets(games) {
  const jobs = []
  for (const game of games) {
    if (isPgaGame(game)) {
      const leaders = game?.golf?.show_leaders && Array.isArray(game.golf.leaders)
        ? game.golf.leaders
        : []
      for (const row of leaders) {
        if (row?.headshot) jobs.push(preloadImage(row.headshot))
        if (row?.flag) jobs.push(preloadImage(row.flag))
      }
      continue
    }
    const { homeWash, awayWash } = resolveNflPillWashes(game?.home, game?.away)
    for (const [side, wash] of [
      [game?.away, awayWash],
      [game?.home, homeWash],
    ]) {
      if (side?.logo) {
        jobs.push(preloadImage(side.logo))
        jobs.push(probeLogoWashTreatment(side.logo, wash))
      }
      if (side?.logoLight) jobs.push(preloadImage(side.logoLight))
    }
  }
  if (typeof document !== 'undefined' && document.fonts?.ready) jobs.push(document.fonts.ready)
  return Promise.allSettled(jobs)
}

const SPORTS_HUB_LEAGUES = [
  { id: 'nfl', label: 'NFL', icon: '🏈', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_NFL },
  { id: 'cfb', label: 'CFB', icon: '🏟️', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_CFB },
  { id: 'nba', label: 'NBA', icon: '🏀', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_NBA },
  { id: 'mlb', label: 'MLB', icon: '⚾', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_MLB },
  { id: 'nhl', label: 'NHL', icon: '🏒', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_NHL },
  { id: 'pga', label: 'Golf', icon: '⛳', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_PGA },
  { id: 'mls', label: 'MLS', icon: '⚽', ready: true, filter: LOUNGE_SPORTS_HUB_FILTER_MLS },
]

function isNflHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_NFL || (f.includes('nfl') && !f.includes('ncaaf'))
}

function isCfbHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_CFB || f.includes('ncaaf') || f === 'cfb'
}

function isNhlHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_NHL || f.includes('icehockey_nhl') || f === 'nhl'
}

function isNbaHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_NBA || f.includes('basketball_nba') || f === 'nba'
}

function isMlbHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_MLB || f.includes('baseball_mlb') || f === 'mlb'
}

function isMlsHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_MLS || f.includes('soccer_usa_mls') || f === 'mls'
}

function isPgaHubFilter(filter) {
  const f = String(filter || '')
  return f === LOUNGE_SPORTS_HUB_FILTER_PGA || f.startsWith('golf_') || f === 'pga' || f === 'golf'
}

function SportsHubLeagueButtons({ onOpenLeague, onOpenTracker, onOpenTools }) {
  return (
    <div className="px-1 pb-4 pt-1">
      <div className="mb-3 flex gap-2">
      <button
        type="button"
        data-sports-hub-tracker="home"
        onClick={() => onOpenTracker?.()}
        aria-label="Open Bet Tracker"
        className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-3 rounded-2xl border px-3.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent]"
      >
        <ClipboardList className="h-5 w-5 shrink-0 text-cyan-400" strokeWidth={2.25} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight">Bet Tracker</span>
          <span className="block text-[11px] font-medium text-zinc-500">Units · ROI · CLV</span>
        </span>
      </button>
      <button
        type="button"
        data-sports-hub-tracker="tools"
        onClick={() => onOpenTools?.()}
        aria-label="Open bet tools"
        className="flex min-h-[3.25rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border touch-manipulation [-webkit-tap-highlight-color:transparent]"
      >
        <Calculator className="h-5 w-5 text-cyan-400" strokeWidth={2.25} />
        <span className="text-[11px] font-semibold tracking-tight">Tools</span>
      </button>
      </div>
      <div data-lounge-sports-hub-leagues className="grid grid-cols-3 gap-2">
      {SPORTS_HUB_LEAGUES.map((league) => {
        const soon = !league.ready
        return (
          <button
            key={league.id}
            type="button"
            disabled={soon}
            data-sports-hub-league={soon ? 'soon' : 'ready'}
            onClick={soon ? undefined : () => onOpenLeague?.(league.filter)}
            aria-label={soon ? `${league.label}, coming soon` : `Open ${league.label} Hub`}
            className="flex min-h-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl border touch-manipulation [-webkit-tap-highlight-color:transparent]"
          >
            <span className="text-[1.65rem] leading-none" aria-hidden>
              {league.icon}
            </span>
            <span className="text-[13px] font-semibold tracking-tight">{league.label}</span>
            {soon ? (
              <span className="text-[10px] font-medium uppercase tracking-wide">Coming soon</span>
            ) : null}
          </button>
        )
      })}
      </div>
    </div>
  )
}

function sportSectionLabel(sportKey) {
  const sk = String(sportKey || '').toLowerCase()
  if (sk.includes('nfl') && !sk.includes('ncaaf')) return 'NFL'
  if (sk.includes('ncaaf') || sk.includes('cfb')) return 'CFB'
  if (sk.includes('nba')) return 'NBA'
  if (sk.includes('ncaab')) return 'CBB'
  if (sk.includes('mlb')) return 'MLB'
  if (sk.includes('nhl')) return 'NHL'
  if (sk.includes('soccer_usa_mls') || sk === 'mls') return 'MLS'
  if (sk.startsWith('golf_') || sk === 'pga' || sk === 'golf') return 'Golf'
  if (sk.includes('mma') || sk.includes('ufc')) return 'MMA'
  if (sk.includes('soccer')) return 'Soccer'
  return String(sportKey || 'Sports').replace(/_/g, ' ')
}

/**
 * Sports Hub / NFL Hub / CFB Hub slate: list of score pills; tap opens the per-game hub.
 */
export default function LoungeSportsHubSlate({ embedded = false }) {
  const sports = useLoungeSportsFeed()
  const phoneLandscape = usePhoneLandscapeNotTablet()
  const filter = sports?.slateFilter
  const open = Boolean(filter)

  const games = useMemo(
    () => loungeSportsSlateGames(sports?.games || [], filter || LOUNGE_SPORTS_HUB_FILTER_ALL),
    [filter, sports?.games],
  )

  const nflHub = isNflHubFilter(filter)
  const cfbHub = isCfbHubFilter(filter)
  const nhlHub = isNhlHubFilter(filter)
  const nbaHub = isNbaHubFilter(filter)
  const mlbHub = isMlbHubFilter(filter)
  const mlsHub = isMlsHubFilter(filter)
  const pgaHub = isPgaHubFilter(filter)
  const leagueHub = nflHub || cfbHub || nhlHub || nbaHub || mlbHub || mlsHub || pgaHub
  const boardFetched = Boolean(sports?.boardFetched)

  // Once a league hub is ready it stays ready for that open … live polls must not re-gate.
  const [readyFilter, setReadyFilter] = useState(null)
  const leagueReady = !leagueHub || readyFilter === filter

  useEffect(() => {
    if (!leagueHub || readyFilter === filter) return undefined
    const cap = setTimeout(() => setReadyFilter(filter), LEAGUE_HUB_ASSET_CAP_MS)
    return () => clearTimeout(cap)
  }, [leagueHub, filter, readyFilter])

  useEffect(() => {
    if (!leagueHub || !boardFetched || readyFilter === filter) return undefined
    let alive = true
    void preloadSlatePillAssets(games).then(() => {
      if (alive) setReadyFilter(filter)
    })
    return () => {
      alive = false
    }
    // games intentionally read once per open … score polls must not restart the preload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueHub, boardFetched, filter, readyFilter])

  const sections = useMemo(() => {
    if (nflHub) return [{ key: 'nfl', label: 'NFL', games }]
    if (cfbHub) return [{ key: 'cfb', label: 'CFB', games }]
    if (nhlHub) return [{ key: 'nhl', label: 'NHL', games }]
    if (nbaHub) return [{ key: 'nba', label: 'NBA', games }]
    if (mlbHub) return [{ key: 'mlb', label: 'MLB', games }]
    if (mlsHub) return [{ key: 'mls', label: 'MLS', games }]
    if (pgaHub) return [{ key: 'golf', label: 'Golf', games }]
    const bySport = new Map()
    for (const game of games) {
      const raw = String(game?.sport_key || 'other')
      const key = raw.startsWith('golf_') ? 'golf' : raw
      if (!bySport.has(key)) bySport.set(key, [])
      bySport.get(key).push(game)
    }
    return [...bySport.entries()].map(([key, list]) => ({
      key,
      label: sportSectionLabel(key),
      games: list,
    }))
  }, [cfbHub, filter, games, mlbHub, mlsHub, nbaHub, nflHub, nhlHub, pgaHub])

  if (!open || typeof document === 'undefined') return null

  const openTracker = () => {
    openSportsBetTracker({ hubFilter: filter })
    sports.closeSlate?.()
  }

  const title = nflHub
    ? 'NFL Hub'
    : cfbHub
      ? 'CFB Hub'
      : nhlHub
        ? 'NHL Hub'
        : nbaHub
          ? 'NBA Hub'
          : mlbHub
            ? 'MLB Hub'
            : mlsHub
              ? 'MLS Hub'
              : pgaHub
                ? 'Golf Hub'
                : 'Sports Hub'

  const root = (
    <div
      data-lounge-sports-hub-slate
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-zinc-950 text-white'
          : 'fixed inset-0 flex flex-col bg-zinc-950 text-white'
      }
      style={
        embedded
          ? undefined
          : {
              zIndex: Z_APP_MODAL - 1,
              // Landscape phone: keep the list clear of the notch / Dynamic Island side.
              ...(phoneLandscape
                ? { paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }
                : null),
            }
      }
    >
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
          onClick={() => {
            if (leagueHub) sports.openSlate?.(LOUNGE_SPORTS_HUB_FILTER_ALL)
            else sports.closeSlate?.()
          }}
          className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-zinc-800`}
          aria-label={leagueHub ? 'Back to Sports Hub' : 'Back'}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-tight">{title}</div>
          <div className="truncate text-[12px] text-zinc-500">
            {!leagueReady
              ? 'Loading slate…'
              : games.length
                ? `${games.length} ${pgaHub ? 'tournament' : 'game'}${games.length === 1 ? '' : 's'}`
                : boardFetched
                  ? 'No games'
                  : 'Loading slate…'}
          </div>
        </div>
        {leagueHub ? (
          <button
            type="button"
            data-sports-hub-tracker="chip"
            onClick={openTracker}
            className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-zinc-800`}
            aria-label="Open Bet Tracker"
          >
            <ClipboardList className="h-5 w-5" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
        {leagueHub ? null : (
          <SportsHubLeagueButtons
            onOpenLeague={(next) => sports.openSlate?.(next)}
            onOpenTracker={openTracker}
            onOpenTools={() => {
              openSportsBetTools('1', { hubFilter: filter })
              sports.closeSlate?.()
            }}
          />
        )}
        {!leagueReady ? (
          <div
            data-lounge-sports-hub-loading
            className="flex items-center justify-center py-24 text-zinc-500"
            role="status"
            aria-label={`Loading ${title}`}
          >
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
          </div>
        ) : !games.length ? (
          <div className="px-2 py-16 text-center text-sm text-zinc-500">
            No games on this slate right now. Pull to refresh from Lounge, or check back closer to game time.
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {sections.map((section) => (
              <section key={section.key} className="space-y-2">
                {sections.length > 1 ? (
                  <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                    {section.label}
                  </h2>
                ) : null}
                <ul className={phoneLandscape && !embedded ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
                  {section.games.map((game) => (
                    <li key={game.id}>
                      {isPgaGame(game) ? (
                        <LoungeGolfTournamentCard game={game} onOpen={(next) => sports.openHub?.(next)} />
                      ) : (
                        <LoungeGameScorePill game={game} className="mt-0" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) return root
  return createPortal(root, document.body)
}
