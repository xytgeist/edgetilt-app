import { useEffect, useMemo, useRef, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import { matchLoungePostToSportsGames } from './loungeSportsMatch.js'
import {
  LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS,
  LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS,
} from './loungeFeedAvatar.js'

const EMPTY_GAMES = []

/**
 * Live game-pill suggest under the composer. Cards stay off until the author
 * taps “include”. New caption matches append (do not replace) until the cap.
 * Value is written to `valueRef` for submit (`eventIds` only).
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = Array.isArray(sports?.games) ? sports.games : EMPTY_GAMES
  const [includedIds, setIncludedIds] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const stagedRef = useRef([])

  const captionTrim = String(caption || '').trim()
  const captionEmpty = !captionTrim && !pinnedGame

  const matched = useMemo(() => {
    if (pinnedGame) return [pinnedGame]
    return matchLoungePostToSportsGames(caption, games, LOUNGE_SPORTS_GAME_PIN_MAX)
  }, [caption, games, pinnedGame])

  const matchedKey = matched.map((g) => String(g.id)).join('|')
  const dismissedKey = [...dismissedIds].sort().join('|')

  // Accumulate when caption/matches change (append-only until cap / clear).
  const stagedIds = useMemo(() => {
    if (captionEmpty) {
      stagedRef.current = []
      return []
    }
    const prev = stagedRef.current.filter((id) => !dismissedIds.has(id))
    const next = [...prev]
    for (const game of matched) {
      const id = String(game?.id || '')
      if (!id || dismissedIds.has(id) || next.includes(id)) continue
      if (next.length >= LOUNGE_SPORTS_GAME_PIN_MAX) break
      next.push(id)
    }
    stagedRef.current = next
    return next
    // matchedKey / dismissedKey intentionally drive recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionEmpty, matchedKey, dismissedKey, matched, dismissedIds])

  useEffect(() => {
    if (!captionEmpty) return
    setIncludedIds((prev) => (prev.length ? [] : prev))
    setDismissedIds((prev) => (prev.size ? new Set() : prev))
  }, [captionEmpty])

  const byId = useMemo(() => {
    const map = new Map(games.map((g) => [String(g.id), g]))
    if (pinnedGame?.id) map.set(String(pinnedGame.id), pinnedGame)
    for (const g of matched) {
      if (g?.id) map.set(String(g.id), g)
    }
    return map
  }, [games, matched, pinnedGame])

  const visible = stagedIds.map((id) => byId.get(id)).filter(Boolean)
  const multi = visible.length > 1
  const slideClass = multi ? LOUNGE_COMPOSER_MARKET_MINI_MULTI_CLASS : LOUNGE_COMPOSER_MARKET_MINI_SINGLE_CLASS

  useEffect(() => {
    if (!valueRef) return
    const pinned = includedIds.filter((id) => stagedIds.includes(id) && !dismissedIds.has(id))
    if (!pinned.length) {
      valueRef.current = { suppress: false, eventId: '', eventIds: [] }
      return
    }
    valueRef.current = {
      suppress: false,
      eventId: pinned[0] || '',
      eventIds: pinned.slice(0, LOUNGE_SPORTS_GAME_PIN_MAX),
    }
  }, [dismissedIds, includedIds, stagedIds, valueRef])

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
                    setDismissedIds((prev) => new Set(prev).add(id))
                    setIncludedIds((prev) => prev.filter((x) => x !== id))
                    stagedRef.current = stagedRef.current.filter((x) => x !== id)
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      {visible.length >= LOUNGE_SPORTS_GAME_PIN_MAX ? (
        <p className="mt-1 text-[11px] text-zinc-500">Max {LOUNGE_SPORTS_GAME_PIN_MAX} game cards per post.</p>
      ) : null}
    </div>
  )
}
