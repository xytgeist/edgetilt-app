import { golferInitials } from './loungeGolfFormat.js'
import { useHeadshotSrc } from '../../utils/playerHeadshot.js'

/**
 * Headshot + country flag for golf cards, pills, and the tournament board.
 */
export default function LoungeGolferMark({ player, compact = false }) {
  const shot = useHeadshotSrc(player?.headshot, 192)
  const flag = String(player?.flag || '').trim()
  const country = String(player?.country || '').trim()
  const letter = golferInitials(player?.name || player?.short_name)

  return (
    <span data-lounge-golfer-mark={compact ? 'compact' : 'card'}>
      {!shot.failed ? (
        <span data-lounge-golf-card-dot>
          <img src={shot.src} alt="" decoding="async" onError={shot.onError} />
        </span>
      ) : (
        <span data-lounge-golf-card-dot>{letter}</span>
      )}
      {flag ? (
        <img data-lounge-golf-flag src={flag} alt={country || ''} title={country} decoding="async" />
      ) : null}
    </span>
  )
}
