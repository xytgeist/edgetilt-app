import { Check, ChevronRight } from 'lucide-react'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import { nflPillWash } from './loungeSportsMatch.js'

export function formatLoungeSportsSpread(point) {
  if (point == null || !Number.isFinite(Number(point))) return null
  const n = Number(point)
  if (n === 0) return 'PK'
  const abs = Math.abs(n)
  const body = Number.isInteger(abs) ? String(abs) : String(abs)
  return n > 0 ? `+${body}` : `-${body}`
}

/** Home ATS result: (home score - away score) + home spread. >0 home covers, <0 away covers. */
export function loungeSportsSpreadCover(game) {
  if (!game || game.status === 'pre') return { home: false, away: false, push: false }
  const homeScore = Number(game.home?.score)
  const awayScore = Number(game.away?.score)
  let homeSpread = Number(game.home?.spread)
  const awaySpread = Number(game.away?.spread)
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return { home: false, away: false, push: false }
  }
  if (!Number.isFinite(homeSpread)) {
    if (!Number.isFinite(awaySpread)) return { home: false, away: false, push: false }
    homeSpread = -awaySpread
  }
  const margin = homeScore - awayScore + homeSpread
  if (margin > 0) return { home: true, away: false, push: false }
  if (margin < 0) return { home: false, away: true, push: false }
  return { home: false, away: false, push: true }
}

function scoreLabel(side, status) {
  if (status === 'pre') return formatLoungeSportsSpread(side?.spread) || '—'
  if (side?.score == null) return '—'
  return String(side.score)
}

function TeamMark({ side, dimmed, covered }) {
  const src = side?.logo
  const letter = String(side?.abbrev || side?.mascot || '?').slice(0, 1)
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center sm:h-11 sm:w-11">
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] ${dimmed ? 'opacity-55' : ''}`}
          loading="lazy"
          decoding="async"
          onError={(ev) => {
            ev.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span className="text-[13px] font-bold text-white/80">{letter}</span>
      )}
      {covered ? (
        <span
          data-lounge-game-pill-cover
          className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
          title="Covered"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      ) : null}
    </span>
  )
}

function ScoreStack({ side, status, align, dimmed }) {
  const pre = status === 'pre'
  const primary = scoreLabel(side, status)
  const spreadUnder = pre ? null : formatLoungeSportsSpread(side?.spread)
  return (
    <span className={`flex min-w-0 flex-col ${align === 'end' ? 'ml-auto items-end' : 'items-start'}`}>
      <span
        className={`text-[26px] font-bold leading-none tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${
          dimmed ? 'text-white/55' : 'text-white'
        }`}
      >
        {primary}
      </span>
      {spreadUnder ? (
        <span className="mt-1 text-[11px] font-semibold leading-none tabular-nums tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {spreadUnder}
        </span>
      ) : null}
    </span>
  )
}

/**
 * In-post score pill (X sports chip). Tap opens the Edge game hub.
 * Pass `game` to skip caption matching (composer preview).
 */
export default function LoungeGameScorePill({
  post,
  game: gameProp = null,
  className = '',
  dismissible = false,
  onDismiss,
  interactive = true,
}) {
  const sports = useLoungeSportsFeed()
  const game = gameProp || sports?.matchPost?.(post)
  if (!game) return null

  const homeWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.home.score > game.away.score
  const awayWon = game.status === 'post' && game.home?.score != null && game.away?.score != null && game.away.score > game.home.score
  const live = game.status === 'in'
  const cover = loungeSportsSpreadCover(game)
  const awayColor = nflPillWash(game.away?.color, game.away?.color2)
  const homeColor = nflPillWash(game.home?.color, game.home?.color2)
  const Tag = interactive ? 'button' : 'div'
  const awaySpread = formatLoungeSportsSpread(game.away?.spread)
  const homeSpread = formatLoungeSportsSpread(game.home?.spread)
  const coverNote = cover.home
    ? `${game.home?.abbrev} covered`
    : cover.away
      ? `${game.away?.abbrev} covered`
      : cover.push
        ? 'push'
        : ''
  const label = `${game.away?.abbrev} ${scoreLabel(game.away, game.status)}${awaySpread && game.status !== 'pre' ? ` ${awaySpread}` : ''} ${game.home?.abbrev} ${scoreLabel(game.home, game.status)}${homeSpread && game.status !== 'pre' ? ` ${homeSpread}` : ''} ${game.status_label}${coverNote ? ` ${coverNote}` : ''}`

  return (
    <div className={`relative ${className}`.trim()} data-lounge-composer-game-pill={dismissible ? '' : undefined}>
      <Tag
        type={interactive ? 'button' : undefined}
        data-lounge-game-pill
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation()
                sports.openHub?.(game)
              }
            : undefined
        }
        style={{ '--pill-away': awayColor, '--pill-home': homeColor }}
        className={`${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} relative mt-2 min-h-[5.625rem] w-full overflow-hidden rounded-2xl text-left text-white touch-manipulation [-webkit-tap-highlight-color:transparent] ${interactive ? 'active:opacity-90' : ''}`.trim()}
        aria-label={label}
      >
        <span data-lounge-game-pill-field aria-hidden="true" />
        <span data-lounge-game-pill-away aria-hidden="true" />
        <span data-lounge-game-pill-home aria-hidden="true" />
        <span data-lounge-game-pill-seam aria-hidden="true" />
        <span className="relative z-[3] flex min-h-[5.625rem] items-center gap-2 px-3 py-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <TeamMark side={game.away} dimmed={game.status === 'post' && !awayWon} covered={cover.away} />
            <ScoreStack
              side={game.away}
              status={game.status}
              align="end"
              dimmed={game.status === 'post' && !awayWon && !live}
            />
          </span>
          <span className="flex w-[4.75rem] shrink-0 flex-col items-center px-1">
            {live ? <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" /> : null}
            <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              {game.status_label}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <ScoreStack
              side={game.home}
              status={game.status}
              align="start"
              dimmed={game.status === 'post' && !homeWon && !live}
            />
            <span className="ml-auto">
              <TeamMark side={game.home} dimmed={game.status === 'post' && !homeWon} covered={cover.home} />
            </span>
          </span>
          {interactive ? (
            <ChevronRight className="h-5 w-5 shrink-0 text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" strokeWidth={2.25} />
          ) : null}
        </span>
      </Tag>
      {dismissible ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDismiss?.()
          }}
          className="absolute left-2 top-2 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800/95 text-[13px] font-bold leading-none text-zinc-200 shadow-md hover:bg-zinc-700 active:bg-zinc-600 [-webkit-tap-highlight-color:transparent]"
          aria-label="Remove game pill"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
