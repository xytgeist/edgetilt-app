import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import { matchLoungePostToSportsGames } from './loungeSportsMatch.js'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import {
  bindLoungeFeedCarouselMeasure,
  loungeFeedCarouselMeasureLayout,
} from './loungeFeedImageAttachment.js'
import { useLoungeFeedCarouselAxisLock } from './useLoungeFeedCarouselAxisLock.js'

const EMPTY_GAMES = []

/**
 * Live game-pill suggest under the composer. Cards stay off until the author
 * taps “include”. Multi uses the same full-bleed horizontal carousel as feed
 * post images (slide across the screen with peek).
 * Value is written to `valueRef` for submit (`eventIds` only).
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = Array.isArray(sports?.games) ? sports.games : EMPTY_GAMES
  const [includedIds, setIncludedIds] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const stagedRef = useRef([])
  const carouselScrollRef = useRef(null)
  const [carouselViewport, setCarouselViewport] = useState(() =>
    loungeFeedCarouselMeasureLayout(null, true),
  )

  const captionTrim = String(caption || '').trim()
  const captionEmpty = !captionTrim && !pinnedGame

  const matched = useMemo(() => {
    if (pinnedGame) return [pinnedGame]
    return matchLoungePostToSportsGames(caption, games, LOUNGE_SPORTS_GAME_PIN_MAX)
  }, [caption, games, pinnedGame])

  const matchedKey = matched.map((g) => String(g.id)).join('|')
  const dismissedKey = [...dismissedIds].sort().join('|')

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
  const carouselFullBleed = multi

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
  }, [visible.length, multi, matchedKey])

  useLayoutEffect(() => {
    if (!multi) return undefined
    return bindLoungeFeedCarouselMeasure(carouselScrollRef.current, true, (next) => {
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

  const carouselTrack = (
    <div
      ref={carouselScrollRef}
      {...(multi ? { 'data-lounge-feed-horizontal-scroll': true } : null)}
      className={
        multi
          ? 'max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [overflow-anchor:none] [touch-action:pan-x_pan-y] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          : 'w-full'
      }
      role={multi ? 'region' : undefined}
      aria-label={multi ? 'Game score suggestions' : undefined}
    >
      <div
        {...(multi ? { 'data-lounge-feed-carousel-track': true } : null)}
        className={multi ? 'flex flex-nowrap items-stretch gap-2' : 'w-full'}
      >
        {visible.map((game) => {
          const id = String(game.id)
          const isIncluded = includedIds.includes(id)
          return (
            <div
              key={id}
              className={multi ? 'relative shrink-0' : 'relative w-full max-w-full'}
              style={slideWidthStyle}
              {...(carouselFullBleed ? { 'data-lounge-feed-carousel-slide': true } : null)}
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
  )

  return (
    <div
      className={`${LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS} ${className}`.trim()}
      data-lounge-composer-game-strip=""
    >
      {carouselFullBleed ? (
        <div data-lounge-feed-carousel-bleed>{carouselTrack}</div>
      ) : (
        carouselTrack
      )}
      {visible.length >= LOUNGE_SPORTS_GAME_PIN_MAX ? (
        <p className="mt-1 text-[11px] text-zinc-500">Max {LOUNGE_SPORTS_GAME_PIN_MAX} game cards per post.</p>
      ) : null}
    </div>
  )
}
