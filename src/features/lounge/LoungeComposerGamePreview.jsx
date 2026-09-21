import { useEffect, useMemo, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import { matchLoungePostToSportsGames } from './loungeSportsMatch.js'
import {
  LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS,
  LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS,
} from './loungeFeedAvatar.js'

/**
 * Live game-pill suggest under the composer. Cards stay off until the author
 * taps “include”. Value is written to `valueRef` for submit (`eventIds` only).
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = sports?.games || []
  const [includedIds, setIncludedIds] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())

  const suggested = useMemo(() => {
    if (pinnedGame) return [pinnedGame]
    return matchLoungePostToSportsGames(caption, games, LOUNGE_SPORTS_GAME_PIN_MAX)
  }, [caption, games, pinnedGame])

  const suggestedKey = suggested.map((g) => String(g.id)).join('|')

  useEffect(() => {
    setIncludedIds((prev) => prev.filter((id) => suggested.some((g) => String(g.id) === id)))
    setDismissedIds((prev) => {
      const next = new Set()
      for (const id of prev) {
        if (suggested.some((g) => String(g.id) === id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [suggestedKey, suggested])

  const pending = suggested.filter((g) => {
    const id = String(g.id)
    return !includedIds.includes(id) && !dismissedIds.has(id)
  })
  const included = suggested.filter((g) => includedIds.includes(String(g.id)))
  const visible = [...included, ...pending].slice(0, LOUNGE_SPORTS_GAME_PIN_MAX)
  const multi = visible.length > 1
  const slideClass = multi ? LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS : LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS

  useEffect(() => {
    if (!valueRef) return
    if (!includedIds.length) {
      valueRef.current = { suppress: false, eventId: '', eventIds: [] }
      return
    }
    valueRef.current = {
      suppress: false,
      eventId: includedIds[0] || '',
      eventIds: includedIds.slice(0, LOUNGE_SPORTS_GAME_PIN_MAX),
    }
  }, [includedIds, valueRef])

  if (!visible.length) return null

  return (
    <div className={className} data-lounge-composer-game-strip="">
      <div
        className={
          multi
            ? 'overflow-x-auto overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : undefined
        }
      >
        <div className={multi ? 'flex w-full min-w-full gap-2' : undefined}>
          {visible.map((game) => {
            const id = String(game.id)
            const isIncluded = includedIds.includes(id)
            return (
              <div
                key={id}
                className={
                  multi
                    ? `relative ${slideClass} shrink-0 snap-start`
                    : 'relative w-full max-w-full shrink-0'
                }
              >
                <LoungeGameScorePill
                  game={game}
                  className="mt-0"
                  dismissible
                  interactive={false}
                  pendingInclude={!isIncluded}
                  onInclude={() => {
                    setIncludedIds((prev) => {
                      if (prev.includes(id) || prev.length >= LOUNGE_SPORTS_GAME_PIN_MAX) return prev
                      return [...prev, id]
                    })
                  }}
                  onDismiss={() => {
                    if (isIncluded) {
                      setIncludedIds((prev) => prev.filter((x) => x !== id))
                      return
                    }
                    setDismissedIds((prev) => new Set(prev).add(id))
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {includedIds.length >= LOUNGE_SPORTS_GAME_PIN_MAX ? (
        <p className="mt-1 text-[11px] text-zinc-500">Max {LOUNGE_SPORTS_GAME_PIN_MAX} game cards per post.</p>
      ) : null}
    </div>
  )
}
