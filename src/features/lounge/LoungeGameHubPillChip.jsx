import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from './loungeSportsPillPaint.jsx'

function kickoffParts(commenceTime) {
  if (!commenceTime) return { date: '', time: '' }
  const d = new Date(commenceTime)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

/**
 * Mini matchup chip for the game hub top strip … soft team glows + logos.
 *
 * @param {{ game: object, active?: boolean, onClick?: () => void }} props
 */
export default function LoungeGameHubPillChip({ game, active = false, onClick }) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(game)
  const pre = game.status === 'pre'
  const { date, time } = pre ? kickoffParts(game.commence_time) : { date: '', time: '' }
  const awayScore = game.away?.score
  const homeScore = game.home?.score
  const statusLine =
    game.status === 'post' ? 'Final' : game.status === 'in' ? 'Live' : time || game.status_label || ''

  return (
    <button
      type="button"
      data-lounge-hub-game-pill={active ? 'active' : 'idle'}
      onClick={onClick}
      className="relative isolate shrink-0 touch-manipulation overflow-hidden rounded-full border text-left [-webkit-tap-highlight-color:transparent]"
      style={{
        '--pill-away': awayColor,
        '--pill-home': homeColor,
      }}
      aria-current={active ? 'true' : undefined}
      aria-label={`${game.away?.abbrev || 'Away'} at ${game.home?.abbrev || 'Home'}`}
    >
      <span data-lounge-hub-game-pill-away aria-hidden="true" />
      <span data-lounge-hub-game-pill-home aria-hidden="true" />
      <span data-lounge-hub-game-pill-row>
        <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={22} />
        <span data-lounge-hub-game-pill-center>
          {pre ? (
            <>
              <span data-lounge-hub-game-pill-date>{date || '—'}</span>
              <span data-lounge-hub-game-pill-meta>{statusLine || '—'}</span>
            </>
          ) : (
            <>
              <span data-lounge-hub-game-pill-score>
                {awayScore ?? '—'}–{homeScore ?? '—'}
              </span>
              <span data-lounge-hub-game-pill-meta>{statusLine}</span>
            </>
          )}
        </span>
        <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={22} />
      </span>
    </button>
  )
}
