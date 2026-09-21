import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import {
  loungeSportsGamesShareTeam,
  matchLoungePostToSportsGamesDetailed,
} from './loungeSportsMatch.js'
import {
  bindLoungeFeedCarouselMeasure,
  loungeFeedCarouselMeasureLayout,
} from './loungeFeedImageAttachment.js'
import { useLoungeFeedCarouselAxisLock } from './useLoungeFeedCarouselAxisLock.js'

const EMPTY_GAMES = []

/**
 * Live game-pill suggest under the composer. Cards stay off until the author
 * taps “include”. New caption matches append until the cap; a specific matchup
 * replaces an earlier one-team card that shares a team.
 * Value is written to `valueRef` for submit (`eventIds` only).
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = Array.isArray(sports?.games) ? sports.games : EMPTY_GAMES
  const [includedIds, setIncludedIds] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const stagedRef = useRef([])
  const includeSwapsRef = useRef([])
  const carouselScrollRef = useRef(null)
  const [carouselViewport, setCarouselViewport] = useState(() =>
    loungeFeedCarouselMeasureLayout(null, false),
  )

  const captionTrim = String(caption || '').trim()
  const captionEmpty = !captionTrim && !pinnedGame

  const matchedDetailed = useMemo(() => {
    if (pinnedGame) return [{ game: pinnedGame, specific: true }]
    return matchLoungePostToSportsGamesDetailed(caption, games, LOUNGE_SPORTS_GAME_PIN_MAX)
  }, [caption, games, pinnedGame])

  const matched = useMemo(() => matchedDetailed.map((row) => row.game), [matchedDetailed])
  const matchedKey = matchedDetailed.map((row) => `${row.game?.id}:${row.specific ? 1 : 0}`).join('|')
  const dismissedKey = [...dismissedIds].sort().join('|')

  const byId = useMemo(() => {
    const map = new Map(games.map((g) => [String(g.id), g]))
    if (pinnedGame?.id) map.set(String(pinnedGame.id), pinnedGame)
    for (const g of matched) {
      if (g?.id) map.set(String(g.id), g)
    }
    return map
  }, [games, matched, pinnedGame])

  const stagedIds = useMemo(() => {
    if (captionEmpty) {
      stagedRef.current = []
      includeSwapsRef.current = []
      return []
    }
    let next = stagedRef.current.filter((id) => !dismissedIds.has(id))
    const swaps = []

    for (const row of matchedDetailed) {
      const game = row.game
      const id = String(game?.id || '')
      if (!id || dismissedIds.has(id) || next.includes(id)) continue

      if (row.specific) {
        for (let i = next.length - 1; i >= 0; i -= 1) {
          const oldId = next[i]
          const oldGame = byId.get(oldId)
          if (!oldGame || oldId === id) continue
          if (!loungeSportsGamesShareTeam(oldGame, game)) continue
          next.splice(i, 1)
          swaps.push([oldId, id])
        }
      }

      if (next.length >= LOUNGE_SPORTS_GAME_PIN_MAX) break
      next.push(id)
    }

    stagedRef.current = next
    includeSwapsRef.current = swaps
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionEmpty, matchedKey, dismissedKey, matchedDetailed, dismissedIds, byId])

  useEffect(() => {
    const swaps = includeSwapsRef.current
    if (!swaps.length) return
    includeSwapsRef.current = []
    setIncludedIds((prev) => {
      let next = prev
      for (const [oldId, newId] of swaps) {
        if (!next.includes(oldId)) continue
        next = next.filter((x) => x !== oldId)
        if (!next.includes(newId) && next.length < LOUNGE_SPORTS_GAME_PIN_MAX) {
          next = [...next, newId]
        }
      }
      return next === prev ? prev : next
    })
  }, [stagedIds])

  useEffect(() => {
    if (!captionEmpty) return
    setIncludedIds((prev) => (prev.length ? [] : prev))
    setDismissedIds((prev) => (prev.size ? new Set() : prev))
  }, [captionEmpty])

  const visible = stagedIds.map((id) => byId.get(id)).filter(Boolean)
  const multi = visible.length > 1

  useLoungeFeedCarouselAxisLock(carouselScrollRef, multi)

  useLayoutEffect(() => {
    if (!multi) return undefined
    const el = carouselScrollRef.current
    if (!el) return undefined
    const reset = () => {
      el.scrollLeft = 0
      try {
        el.scrollTo({ left: 0, behavior: 'instant' })
      } catch {
        // ignore
      }
    }
    reset()
    const id0 = requestAnimationFrame(reset)
    const id1 = requestAnimationFrame(reset)
    return () => {
      cancelAnimationFrame(id0)
      cancelAnimationFrame(id1)
    }
  }, [visible.length, multi])

  useLayoutEffect(() => {
    if (!multi) return undefined
    // Full composer column width + peek. Do not apply the landscape 20rem phone cap.
    return bindLoungeFeedCarouselMeasure(carouselScrollRef.current, false, (next) => {
      setCarouselViewport((prev) =>
        prev.contentWidthPx === next.contentWidthPx &&
        prev.firstSlideMaxWidthPx === next.firstSlideMaxWidthPx &&
        prev.maxRowPx === next.maxRowPx
          ? prev
          : next,
      )
    }, { pairOnIpadLandscape: false, phoneSlideCap: false })
  }, [multi, visible.length])

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

  const slideWidthStyle =
    multi && carouselViewport.firstSlideMaxWidthPx
      ? {
          width: carouselViewport.firstSlideMaxWidthPx,
          minWidth: carouselViewport.firstSlideMaxWidthPx,
          maxWidth: carouselViewport.firstSlideMaxWidthPx,
        }
      : undefined

  return (
    <div className={`w-full min-w-0 ${className}`.trim()} data-lounge-composer-game-strip="">
      <div
        ref={carouselScrollRef}
        className={
          multi
            ? 'w-full max-w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'w-full'
        }
        {...(multi ? { 'data-lounge-feed-horizontal-scroll': true } : null)}
        role={multi ? 'region' : undefined}
        aria-label={multi ? 'Game score suggestions' : undefined}
      >
        <div className={multi ? 'flex w-full min-w-full flex-nowrap items-stretch gap-2' : 'w-full'}>
          {visible.map((game) => {
            const id = String(game.id)
            const isIncluded = includedIds.includes(id)
            return (
              <div
                key={id}
                className={multi ? 'relative shrink-0 snap-start' : 'relative w-full max-w-full shrink-0'}
                style={slideWidthStyle}
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
