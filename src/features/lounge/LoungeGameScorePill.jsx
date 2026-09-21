import { ChevronRight } from 'lucide-react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'

function TeamMark({ side, dimmed }) {
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-200">
      {side?.logo ? (
        <img
          src={side.logo}
          alt=""
          className={`h-full w-full object-contain ${dimmed ? 'opacity-55' : ''}`}
          loading="lazy"
          decoding="async"
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

function scoreLabel(side, status) {
  if (status === 'pre' || side?.score == null) return '—'
  return String(side.score)
}

/**
 * In-post score pill (X sports chip). Tap opens the Edge game hub.
 */
export default function LoungeGameScorePill({ post, className = '' }) {
  const sports = useLoungeSportsFeed()
  const game = sports?.matchPost?.(post)
  if (!game) return null

  const homeWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.home.score > game.away.score
  const awayWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.away.score > game.home.score
  const live = game.status === 'in'

  return (
    <button
      type="button"
      data-lounge-game-pill
      onClick={(e) => {
        e.stopPropagation()
        sports.openHub?.(game)
      }}
      className={`${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${className} mt-2 flex items-center gap-2 rounded-xl bg-zinc-800/90 px-2.5 py-2 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] active:opacity-80`.trim()}
      aria-label={`${game.away?.abbrev} ${scoreLabel(game.away, game.status)} ${game.home?.abbrev} ${scoreLabel(game.home, game.status)} ${game.status_label}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <TeamMark side={game.away} dimmed={game.status === 'post' && !awayWon} />
        <span className={`truncate text-[13px] font-semibold ${awayWon || live || game.status === 'pre' ? 'text-zinc-100' : 'text-zinc-500'}`}>
          {game.away?.abbrev}
        </span>
        <span className={`tabular-nums text-[13px] font-bold ${awayWon || live || game.status === 'pre' ? 'text-white' : 'text-zinc-500'}`}>
          {scoreLabel(game.away, game.status)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center px-1">
        {live ? (
          <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
        ) : null}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{game.status_label}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className={`tabular-nums text-[13px] font-bold ${homeWon || live || game.status === 'pre' ? 'text-white' : 'text-zinc-500'}`}>
          {scoreLabel(game.home, game.status)}
        </span>
        <span className={`truncate text-[13px] font-semibold ${homeWon || live || game.status === 'pre' ? 'text-zinc-100' : 'text-zinc-500'}`}>
          {game.home?.abbrev}
        </span>
        <TeamMark side={game.home} dimmed={game.status === 'post' && !homeWon} />
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2.25} />
    </button>
  )
}
