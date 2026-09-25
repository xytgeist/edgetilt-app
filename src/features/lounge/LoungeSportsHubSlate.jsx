import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import {
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import { LOUNGE_SPORTS_HUB_FILTER_ALL, LOUNGE_SPORTS_HUB_FILTER_NFL } from './loungeSportsHubNav.js'
import { loungeSportsSlateGames } from './loungeSportsSlateWindow.js'

const SPORTS_HUB_LEAGUES = [
  { id: 'nfl', label: 'NFL', icon: '🏈', ready: true },
  { id: 'nba', label: 'NBA', icon: '🏀', ready: false },
  { id: 'mlb', label: 'MLB', icon: '⚾', ready: false },
  { id: 'nhl', label: 'NHL', icon: '🏒', ready: false },
  { id: 'pga', label: 'PGA', icon: '⛳', ready: false },
  { id: 'mls', label: 'MLS', icon: '⚽', ready: false },
]

function isNflHubFilter(filter) {
  return filter === LOUNGE_SPORTS_HUB_FILTER_NFL || String(filter || '').includes('nfl')
}

function SportsHubLeagueButtons({ onOpenNfl }) {
  return (
    <div
      data-lounge-sports-hub-leagues
      className="grid grid-cols-3 gap-2 px-1 pb-4 pt-1"
    >
      {SPORTS_HUB_LEAGUES.map((league) => {
        const soon = !league.ready
        return (
          <button
            key={league.id}
            type="button"
            disabled={soon}
            data-sports-hub-league={soon ? 'soon' : 'ready'}
            onClick={soon ? undefined : onOpenNfl}
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
  )
}

function sportSectionLabel(sportKey) {
  const sk = String(sportKey || '').toLowerCase()
  if (sk.includes('nfl')) return 'NFL'
  if (sk.includes('ncaaf') || sk.includes('cfb')) return 'CFB'
  if (sk.includes('nba')) return 'NBA'
  if (sk.includes('ncaab')) return 'CBB'
  if (sk.includes('mlb')) return 'MLB'
  if (sk.includes('nhl')) return 'NHL'
  if (sk.includes('mma') || sk.includes('ufc')) return 'MMA'
  if (sk.includes('soccer')) return 'Soccer'
  return String(sportKey || 'Sports').replace(/_/g, ' ')
}

/**
 * Sports Hub / NFL Hub slate: list of score pills; tap opens the per-game hub.
 */
export default function LoungeSportsHubSlate({ embedded = false }) {
  const sports = useLoungeSportsFeed()
  const filter = sports?.slateFilter
  const open = Boolean(filter)

  const games = useMemo(
    () => loungeSportsSlateGames(sports?.games || [], filter || LOUNGE_SPORTS_HUB_FILTER_ALL),
    [filter, sports?.games],
  )

  const nflHub = isNflHubFilter(filter)

  const sections = useMemo(() => {
    if (nflHub) {
      return [{ key: 'nfl', label: 'NFL', games }]
    }
    const bySport = new Map()
    for (const game of games) {
      const key = String(game?.sport_key || 'other')
      if (!bySport.has(key)) bySport.set(key, [])
      bySport.get(key).push(game)
    }
    return [...bySport.entries()].map(([key, list]) => ({
      key,
      label: sportSectionLabel(key),
      games: list,
    }))
  }, [filter, games, nflHub])

  if (!open || typeof document === 'undefined') return null

  const title = nflHub ? 'NFL Hub' : 'Sports Hub'

  const root = (
    <div
      data-lounge-sports-hub-slate
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-zinc-950 text-white'
          : 'fixed inset-0 flex flex-col bg-zinc-950 text-white'
      }
      style={embedded ? undefined : { zIndex: Z_APP_MODAL - 1 }}
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
          onClick={() => sports.closeSlate?.()}
          className={`inline-flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} items-center justify-center rounded-full touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-zinc-800`}
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-tight">{title}</div>
          <div className="truncate text-[12px] text-zinc-500">
            {games.length ? `${games.length} game${games.length === 1 ? '' : 's'}` : 'Loading slate…'}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
        {nflHub ? null : (
          <SportsHubLeagueButtons
            onOpenNfl={() => sports.openSlate?.(LOUNGE_SPORTS_HUB_FILTER_NFL)}
          />
        )}
        {!games.length ? (
          <div className="px-2 py-16 text-center text-sm text-zinc-500">
            No games on this slate right now. Pull to refresh from Lounge, or check back closer to kickoff.
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
                <ul className="space-y-2">
                  {section.games.map((game) => (
                    <li key={game.id}>
                      <LoungeGameScorePill game={game} className="mt-0" />
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
