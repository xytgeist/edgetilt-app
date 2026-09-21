import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import LoungeGameScorePill from './LoungeGameScorePill.jsx'
import { useLoungeSportsFeed } from './LoungeSportsFeedContext.jsx'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import { matchLoungePostToSportsGamesDetailed } from './loungeSportsMatch.js'
import { LOUNGE_FEED_ATTACHMENT_COLUMN_CLASS } from './loungeFeedAvatar.js'
import {
  bindLoungeFeedCarouselMeasure,
  loungeFeedCarouselMeasureLayout,
} from './loungeFeedImageAttachment.js'
import { useLoungeFeedCarouselAxisLock } from './useLoungeFeedCarouselAxisLock.js'

const EMPTY_GAMES = []

/**
 * Live game-pill suggest under the composer. Cards stay off until the author
 * taps “include”. Tokens match after a trailing space or punctuation (“Rams ” / “DAL,”).
 * One card per team/matchup context; a specific matchup replaces the vague card.
 * Multi uses the same full-bleed horizontal carousel as feed post images.
 */
export default function LoungeComposerGamePreview({ caption, className = '', valueRef, pinnedGame = null }) {
  const sports = useLoungeSportsFeed()
  const games = Array.isArray(sports?.games) ? sports.games : EMPTY_GAMES
  const [includedIds, setIncludedIds] = useState([])
  const [dismissedContexts, setDismissedContexts] = useState(() => new Set())
  const carouselScrollRef = useRef(null)
  const [carouselViewport, setCarouselViewport] = useState(() =>
    loungeFeedCarouselMeasureLayout(null, true),
  )

  const captionTrim = String(caption || '').trim()
  const captionEmpty = !captionTrim && !pinnedGame

  const matchedDetailed = useMemo(() => {
    if (pinnedGame) {
      return [{ game: pinnedGame, specific: true, contextKey: `pin:${pinnedGame.id}` }]
    }
    return matchLoungePostToSportsGamesDetailed(caption, games, LOUNGE_SPORTS_GAME_PIN_MAX, {
      committed: true,
    })
  }, [caption, games, pinnedGame])

  const matchedKey = matchedDetailed.map((row) => `${row.contextKey}:${row.game?.id}`).join('|')

  useEffect(() => {
    if (!captionEmpty) return
    setIncludedIds((prev) => (prev.length ? [] : prev))
    setDismissedContexts((prev) => (prev.size ? new Set() : prev))
  }, [captionEmpty])

  // Drop dismissals for contexts that are no longer in the caption.
  useEffect(() => {
    const live = new Set(matchedDetailed.map((row) => row.contextKey))
    setDismissedContexts((prev) => {
      let changed = false
      const next = new Set()
      for (const key of prev) {
        if (live.has(key)) next.add(key)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [matchedKey, matchedDetailed])

  const visibleRows = matchedDetailed.filter((row) => !dismissedContexts.has(row.contextKey))
  const visible = visibleRows.map((row) => row.game)
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
    const liveIds = new Set(visible.map((g) => String(g.id)))
    const pinned = includedIds.filter((id) => liveIds.has(id))
    if (!pinned.length) {
      valueRef.current = { suppress: false, eventId: '', eventIds: [] }
      return
    }
    valueRef.current = {
      suppress: false,
      eventId: pinned[0] || '',
      eventIds: pinned.slice(0, LOUNGE_SPORTS_GAME_PIN_MAX),
    }
  }, [includedIds, valueRef, visible])

  if (!visibleRows.length) return null

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
        {visibleRows.map((row) => {
          const game = row.game
          const id = String(game.id)
          const isIncluded = includedIds.includes(id)
          return (
            <div
              key={row.contextKey}
              className={
                multi
                  ? 'relative shrink-0 overflow-hidden rounded-2xl'
                  : 'relative w-full max-w-full overflow-hidden rounded-2xl'
              }
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
                  setDismissedContexts((prev) => new Set(prev).add(row.contextKey))
                  setIncludedIds((prev) => prev.filter((x) => x !== id))
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
