import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import { formatKickoff, stripTimeZoneSuffix } from './gameHub/gameHubFormatters.js'
import { formatGolfToPar, golferInitials } from './loungeGolfFormat.js'

export { formatGolfToPar }

function GolferMark({ leader }) {
  const src = String(leader?.headshot || '').trim()
  const letter = golferInitials(leader?.name || leader?.short_name)
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span data-lounge-pga-pill-mark className="grid place-items-center text-[10px] font-bold text-white/80">
        {letter}
      </span>
    )
  }
  return (
    <span data-lounge-pga-pill-mark>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

/**
 * Tournament chip for PGA … not a home/away score pill.
 */
export default function LoungePgaTournamentPill({
  game,
  className = '',
  dismissible = false,
  onDismiss,
  onInclude,
  pendingInclude = false,
  interactive = true,
  onOpen,
}) {
  if (!game) return null
  const golf = game.golf && typeof game.golf === 'object' ? game.golf : null
  const title = String(golf?.tournament || game.home?.name || game.sport_label || 'Golf').trim()
  const live = game.status === 'in'
  const kickoff = formatKickoff(game.commence_time)
  const statusLine = game.status === 'pre'
    ? kickoff || stripTimeZoneSuffix(game.status_label) || 'Upcoming'
    : stripTimeZoneSuffix(game.status_label) || (live ? 'Live' : 'Final')
  const place = [golf?.venue, golf?.location].filter(Boolean).join(' · ')
  const broadcast = String(golf?.broadcast || game.broadcast || '').trim()
  const meta = [statusLine, place, broadcast].filter(Boolean).join('  ·  ')
  const leaders = golf?.show_leaders && Array.isArray(golf.leaders) ? golf.leaders.slice(0, 3) : []
  const canOpenHub = interactive && !pendingInclude
  const Tag = canOpenHub || pendingInclude ? 'button' : 'div'
  const names = leaders.map((row) => `${row.short_name || row.name} ${formatGolfToPar(row.score)}`).join(', ')
  const label = pendingInclude
    ? `Tap to include ${title}`
    : `${title} ${meta}${names ? ` ${names}` : ''}`

  return (
    <div
      className={`relative ${className}`.trim()}
      data-lounge-composer-game-pill={dismissible || pendingInclude ? '' : undefined}
      data-lounge-game-pill-pending={pendingInclude ? '' : undefined}
    >
      <Tag
        type={canOpenHub || pendingInclude ? 'button' : undefined}
        data-lounge-game-pill
        data-lounge-pga-pill
        onClick={
          pendingInclude
            ? (e) => {
                e.stopPropagation()
                onInclude?.()
              }
            : canOpenHub
              ? (e) => {
                  e.stopPropagation()
                  onOpen?.(game)
                }
              : undefined
        }
        className={`${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} relative min-h-[5.625rem] w-full overflow-hidden rounded-2xl text-left text-white touch-manipulation [-webkit-tap-highlight-color:transparent] ${canOpenHub || pendingInclude ? 'active:opacity-90' : ''}`.trim()}
        data-lounge-game-pill-hub={canOpenHub ? '' : undefined}
        aria-label={label}
      >
        <span data-lounge-pga-pill-wash aria-hidden="true" />
        <span data-lounge-pga-pill-body>
          <span data-lounge-pga-pill-top>
            {live ? <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" /> : null}
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-tight tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
                {title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold leading-snug text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
                {meta}
              </span>
            </span>
          </span>
          {leaders.length ? (
            <ol data-lounge-pga-pill-leaders>
              {leaders.map((row, i) => (
                <li key={row.player_id || `${row.name}-${i}`}>
                  <span data-lounge-pga-pill-pos>{i + 1}</span>
                  <GolferMark leader={row} />
                  <span className="min-w-0 truncate text-[13px] font-semibold leading-none">
                    {row.short_name || row.name}
                  </span>
                  <span className="tabular-nums text-[13px] font-bold leading-none">
                    {formatGolfToPar(row.score)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span data-lounge-pga-pill-fieldnote>
              {game.status === 'pre' ? 'Field set' : 'Leaderboard pending'}
            </span>
          )}
        </span>
        {canOpenHub ? (
          <span data-lounge-game-pill-chevron aria-hidden="true">
            <ChevronRight className="h-5 w-5 text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" strokeWidth={2.25} />
          </span>
        ) : null}
        {pendingInclude ? (
          <span
            data-lounge-game-pill-include-overlay
            className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center bg-black/45 px-10 pt-2"
            aria-hidden="true"
          >
            <span
              data-lounge-game-pill-include-hint
              className="text-center text-[11px] font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
            >
              Tap to include
            </span>
          </span>
        ) : null}
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
          aria-label={pendingInclude ? 'Dismiss game suggestion' : 'Remove game pill'}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
