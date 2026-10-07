import { useState } from 'react'
import { golferInitials } from './loungeGolfFormat.js'

/**
 * Headshot + country flag for golf cards, pills, and the tournament board.
 */
export default function LoungeGolferMark({ player, compact = false }) {
  const src = String(player?.headshot || '').trim()
  const flag = String(player?.flag || '').trim()
  const country = String(player?.country || '').trim()
  const letter = golferInitials(player?.name || player?.short_name)
  const [failed, setFailed] = useState(false)

  return (
    <span data-lounge-golfer-mark={compact ? 'compact' : 'card'}>
      {src && !failed ? (
        <span data-lounge-golf-card-dot>
          <img src={src} alt="" decoding="async" onError={() => setFailed(true)} />
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
