import { formatKickoff, stripTimeZoneSuffix } from './gameHub/gameHubFormatters.js'
import { formatGolfDateRange, formatGolfMoney, formatGolfToPar, golferInitials } from './loungeGolfFormat.js'

function GolferDot({ player }) {
  const src = String(player?.headshot || '').trim()
  const letter = golferInitials(player?.name || player?.short_name)
  if (!src) {
    return <span data-lounge-golf-card-dot>{letter}</span>
  }
  return (
    <span data-lounge-golf-card-dot>
      <img src={src} alt="" decoding="async" />
    </span>
  )
}

/**
 * Golf Hub tournament card … ESPN header on the left, top 5 on the right (stacks on phone).
 */
export default function LoungeGolfTournamentCard({ game, onOpen }) {
  if (!game) return null
  const golf = game.golf && typeof game.golf === 'object' ? game.golf : {}
  const title = String(golf.tournament || game.home?.name || 'Golf').trim()
  const dates = formatGolfDateRange(golf.start_date || game.commence_time, golf.end_date)
  const broadcast = String(golf.broadcast || game.broadcast || '').trim()
  const place = [golf.venue, golf.location].filter(Boolean).join(' · ')
  const parYards = [golf.par != null ? `Par ${golf.par}` : '', golf.yards != null ? `${Number(golf.yards).toLocaleString()} yards` : '']
    .filter(Boolean)
    .join(' · ')
  const purse = golf.purse_label || formatGolfMoney(golf.purse)
  const winner = golf.previous_winner ? `Previous winner ${golf.previous_winner}` : ''
  const statusLine = game.status === 'pre'
    ? formatKickoff(game.commence_time) || stripTimeZoneSuffix(game.status_label) || 'Upcoming'
    : stripTimeZoneSuffix(game.status_label) || (game.status === 'in' ? 'Live' : 'Final')
  const leaders = golf.show_leaders && Array.isArray(golf.leaders) ? golf.leaders.slice(0, 5) : []

  return (
    <button
      type="button"
      data-lounge-golf-card
      onClick={() => onOpen?.(game)}
      className="relative w-full overflow-hidden rounded-2xl text-white touch-manipulation text-left [-webkit-tap-highlight-color:transparent] active:opacity-90"
      aria-label={`${title} ${statusLine}`}
    >
      <span data-lounge-golf-card-wash aria-hidden="true" />
      <span data-lounge-golf-card-grid>
        <span data-lounge-golf-card-copy>
          {game.status === 'in' ? <span data-lounge-golf-card-live>Live</span> : null}
          <span data-lounge-golf-card-title>{title}</span>
          <span data-lounge-golf-card-meta>
            {[dates, broadcast].filter(Boolean).join(' · ')}
          </span>
          {place ? <span data-lounge-golf-card-meta>{place}</span> : null}
          {parYards ? <span data-lounge-golf-card-meta>{parYards}</span> : null}
          {[purse, winner].filter(Boolean).length ? (
            <span data-lounge-golf-card-meta>{[purse, winner].filter(Boolean).join(' · ')}</span>
          ) : null}
          <span data-lounge-golf-card-status>{statusLine}</span>
        </span>
        <span data-lounge-golf-card-board>
          {leaders.length ? (
            <ol>
              {leaders.map((row, i) => (
                <li key={row.player_id || `${row.name}-${i}`}>
                  <span data-lounge-golf-card-pos>{row.pos || i + 1}</span>
                  <GolferDot player={row} />
                  <span data-lounge-golf-card-name>{row.short_name || row.name}</span>
                  <span data-lounge-golf-card-score>{formatGolfToPar(row.score)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <span data-lounge-golf-card-empty>
              {game.status === 'pre' ? 'Field set' : 'Leaderboard pending'}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
