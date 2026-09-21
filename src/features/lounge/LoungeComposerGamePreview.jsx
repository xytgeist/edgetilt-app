import { useEffect, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { matchLoungePostToSportsGame } from './loungeSportsMatch.js'

/**
 * Live game-pill preview under the composer caption. Value is written to `valueRef`
 * so submit can persist the pinned event or a suppress flag.
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = sports?.games || []
  const [dismissedId, setDismissedId] = useState('')
  const suggested = pinnedGame || matchLoungePostToSportsGame(caption, games)
  const suggestedId = String(suggested?.id || '')
  const hidden = Boolean(suggestedId) && dismissedId === suggestedId

  useEffect(() => {
    if (!valueRef) return
    if (hidden) {
      valueRef.current = { suppress: true, eventId: '' }
      return
    }
    valueRef.current = { suppress: false, eventId: suggestedId }
  }, [hidden, suggestedId, valueRef])

  if (!suggested || hidden) return null

  return (
    <LoungeGameScorePill
      game={suggested}
      className={className}
      dismissible
      interactive={false}
      onDismiss={() => {
        setDismissedId(suggestedId)
        if (valueRef) valueRef.current = { suppress: true, eventId: '' }
      }}
    />
  )
}
