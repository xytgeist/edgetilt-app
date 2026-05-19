/** Match `LAZY_ATTACH_ROOT_MARGIN` in `LoungePostStreamVideo.jsx` (expanded intersection for prefetch). */
const SCROLL_ROOT_PAD_TOP = 180
const SCROLL_ROOT_PAD_BOTTOM = 240
/** Ignore sliver tiles (e.g. previous page peeking at top) so load-more rows can win mid-scroll. */
const MIN_CANDIDATE_VISIBLE_PX = 48

const EMPTY_STAGE_IDS = Object.freeze([])

/** @type {{ winnerId: string | null, stageIds: readonly string[] }} */
const INITIAL_SNAPSHOT = Object.freeze({ winnerId: null, stageIds: EMPTY_STAGE_IDS })

function candidateVisiblePx(rect, rootTop, rootBottom, vh) {
  const visTop = Math.max(rect.top, rootTop, 0)
  const visBottom = Math.min(rect.bottom, rootBottom, vh)
  return Math.max(0, visBottom - visTop)
}

/**
 * External store for mid-scroll Stream winner (no React state inside recompute).
 * Scroll root is wired later via `setScrollRootRef` so the factory needs no ref during React render.
 *
 * Perf: one HLS attach on the winner only — no multi-tile staging band (was up to 24 paused decoders).
 */
export function createAutoplayStore() {
  /** @type {Map<string, () => HTMLElement | null>} */
  const entries = new Map()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  let scheduled = false
  /** @type {React.RefObject<HTMLElement | null> | null} */
  let rootRef = null
  /** @type {{ winnerId: string | null, stageIds: readonly string[] }} */
  let snapshot = INITIAL_SNAPSHOT

  const emit = () => {
    listeners.forEach((l) => {
      try {
        l()
      } catch {
        // ignore
      }
    })
  }

  const recompute = () => {
    scheduled = false
    const rootEl = rootRef?.current ?? null
    const rootRect = rootEl ? rootEl.getBoundingClientRect() : null
    const midY = rootRect ? rootRect.top + rootRect.height / 2 : typeof window !== 'undefined' ? window.innerHeight / 2 : 400
    const rootTop = rootRect?.top ?? 0
    const rootBottom = rootRect ? rootRect.bottom : typeof window !== 'undefined' ? window.innerHeight : 800
    const vh = typeof window !== 'undefined' ? window.innerHeight : rootBottom

    /** @type {{ id: string, centerY: number, top: number, bottom: number, visiblePx: number }[]} */
    const candidates = []

    for (const [id, getEl] of entries) {
      const el = getEl()
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue

      const intersectsRootLoose =
        rect.bottom > rootTop - SCROLL_ROOT_PAD_TOP && rect.top < rootBottom + SCROLL_ROOT_PAD_BOTTOM
      const intersectsRootStrict = rect.bottom > rootTop && rect.top < rootBottom
      const intersectsViewport = rect.bottom > 0 && rect.top < vh
      if (!intersectsViewport || (!intersectsRootLoose && !intersectsRootStrict)) continue
      const visiblePx = candidateVisiblePx(rect, rootTop, rootBottom, vh)
      if (visiblePx < MIN_CANDIDATE_VISIBLE_PX) continue
      const centerY = (rect.top + rect.bottom) / 2
      candidates.push({ id, centerY, top: rect.top, bottom: rect.bottom, visiblePx })
    }

    /** @type {string | null} */
    let nextWinner = null
    if (candidates.length === 0) {
      /** Last resort: registered tiles with layout but strict root missed (e.g. first paint timing). */
      for (const [id, getEl] of entries) {
        const el = getEl()
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) continue
        if (rect.bottom <= 0 || rect.top >= vh) continue
        const visiblePx = candidateVisiblePx(rect, rootTop, rootBottom, vh)
        if (visiblePx < MIN_CANDIDATE_VISIBLE_PX) continue
        const centerY = (rect.top + rect.bottom) / 2
        candidates.push({ id, centerY, top: rect.top, bottom: rect.bottom, visiblePx })
      }
    }

    if (candidates.length === 0) {
      nextWinner = null
    } else if (candidates.length === 1) {
      nextWinner = candidates[0].id
    } else {
      const containing = candidates.filter((c) => c.top <= midY && c.bottom >= midY)
      if (containing.length === 1) {
        nextWinner = containing[0].id
      } else if (containing.length > 1) {
        nextWinner = containing.reduce((a, b) => (a.top <= b.top ? a : b)).id
      } else {
        const above = candidates.filter((c) => c.centerY < midY)
        if (above.length > 0) {
          nextWinner = above.reduce((a, b) => (a.centerY >= b.centerY ? a : b)).id
        } else {
          nextWinner = candidates.reduce((a, b) => (a.centerY <= b.centerY ? a : b)).id
        }
      }
    }

    const candidateIds = new Set(candidates.map((c) => c.id))

    /** Adjacent tiles with similar visibility: keep incumbent to avoid dual-play handoff glitches. */
    if (
      snapshot.winnerId &&
      nextWinner &&
      nextWinner !== snapshot.winnerId &&
      candidateIds.has(snapshot.winnerId)
    ) {
      const prevC = candidates.find((c) => c.id === snapshot.winnerId)
      const nextC = candidates.find((c) => c.id === nextWinner)
      if (prevC && nextC) {
        const minVis = Math.min(prevC.visiblePx, nextC.visiblePx)
        if (minVis > 0 && Math.abs(prevC.visiblePx - nextC.visiblePx) / minVis < 0.2) {
          nextWinner = snapshot.winnerId
        }
      }
    }

    const prevWinnerStale = Boolean(snapshot.winnerId && !candidateIds.has(snapshot.winnerId))
    const winnerChanged = nextWinner !== snapshot.winnerId

    if (winnerChanged || prevWinnerStale) {
      snapshot = Object.freeze({
        winnerId: nextWinner,
        stageIds: EMPTY_STAGE_IDS,
      })
      emit()
    }
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(recompute)
  }

  return {
    /** @param {React.RefObject<HTMLElement | null> | null} ref */
    setScrollRootRef(ref) {
      rootRef = ref
    },
    /** @returns {() => void} */
    register(id, getEl) {
      entries.set(id, getEl)
      queueMicrotask(() => {
        schedule()
      })
      return () => {
        entries.delete(id)
        queueMicrotask(() => {
          schedule()
        })
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return snapshot
    },
    schedule,
    /** User tapped a specific tile for sound or hero — take winner immediately (skip hysteresis). */
    forceWinner(id) {
      if (!id || snapshot.winnerId === id) return
      snapshot = Object.freeze({
        winnerId: id,
        stageIds: EMPTY_STAGE_IDS,
      })
      emit()
    },
  }
}
