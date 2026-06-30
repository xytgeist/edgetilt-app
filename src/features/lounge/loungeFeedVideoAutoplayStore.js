import { reportLoungeVideoDebugEvent } from './loungeFeedVideoDebugRegistry.js'
import { readLoungeFeedVideoDebugEnabled } from '../../utils/loungeFeedVideoDebugPref.js'

/** @param {string | null | undefined} id */
function shortCoordId(id) {
  if (!id) return '-'
  const s = String(id)
  return s.length <= 8 ? s : s.slice(0, 8)
}

/** @param {string} detail */
function reportCoordDebug(detail) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  reportLoungeVideoDebugEvent(null, 'coord', detail)
}

/** Option A: fraction of tile visible inside the scroll root (intersectionRatio). */
export const LOUNGE_VIDEO_SOUND_ON_RATIO = 0.6
export const LOUNGE_VIDEO_SOUND_OFF_RATIO = 0.4
/** Strong handoff (fallback): outgoing ≥20% clipped, incoming ≥95% visible. */
export const LOUNGE_VIDEO_STRONG_OUT_MAX = 0.8
export const LOUNGE_VIDEO_STRONG_IN_MIN = 0.95
/** Contested handoff (fallback): outgoing ≥50% clipped, incoming ≥50% visible. */
export const LOUNGE_VIDEO_CONTEST_OUT_MAX = 0.5
export const LOUNGE_VIDEO_CONTEST_IN_MIN = 0.5
/** Primary handoff: challenger tile midpoint vs scroll-column centerline (see pickCenterCrossTakeover). */
/** Incumbent mostly clipped - release active immediately (don't wait for ratio === 0). */
export const LOUNGE_VIDEO_ACTIVE_RELEASE_RATIO = 0.12
/** Incumbent sliding off - promote center / scroll-leading visible tile at first pixel. */
export const LOUNGE_VIDEO_ACTIVE_SCROLL_CONTEST_MAX = 0.38
/** #fuckflingers - shrink ring while scrolling; handoff + active play still run. */
export const LOUNGE_VIDEO_FLINGER_IDLE_MS = 120
/** Only tiles near the scroll port participate in active/ring (mounted feed keeps every Stream row). */
export const LOUNGE_VIDEO_COORDINATOR_VIEWPORT_MARGIN_RATIO = 1.5
/** Recompute while idle so deep-feed stalls self-heal without opening hero. */
export const LOUNGE_VIDEO_COORDINATOR_IDLE_WATCHDOG_MS = 1200
/** Min center distance advantage before idle handoff (reduces active flip-flop). */
export const LOUNGE_VIDEO_IDLE_HANDOFF_CENTER_GAP_PX = 24
/** Ignore tiny ratio deltas on ring tiles - cuts scroll-time React churn. */
export const LOUNGE_VIDEO_RATIO_EMIT_EPSILON = 0.022
/** Max inline `<video>` nodes: `{prev, active, next}` ring + two feed-order lookahead shells. */
export const LOUNGE_VIDEO_DOM_BUDGET_MAX = 5
/** Periodic soft reset (hero-exit style) to release iOS media pressure deep in feed. */
export const LOUNGE_VIDEO_SOFT_RESET_HANDOFF_EVERY = 5

const EMPTY_RING = Object.freeze([])
const EMPTY_DOM_BUDGET = Object.freeze([])
const EMPTY_RATIOS = Object.freeze({})

/** @type {import('./loungeFeedVideoAutoplayStore.js').LoungeFeedAutoplaySnapshot} */
const INITIAL_SNAPSHOT = Object.freeze({
  activeId: null,
  prefetchPrevId: null,
  prefetchNextId: null,
  ringIds: EMPTY_RING,
  domBudgetIds: EMPTY_DOM_BUDGET,
  softResetEpoch: 0,
  flingerMode: false,
  heroLocked: false,
  heroClientId: null,
  coordinatorSuspended: false,
  tileRatios: EMPTY_RATIOS,
})

/**
 * @typedef {Object} LoungeFeedAutoplaySnapshot
 * @property {string | null} activeId - sole inline `play()` target (when not hero/flinger/suspended).
 * @property {string | null} prefetchPrevId - feed-order predecessor in `{prev, active, next}` ring.
 * @property {string | null} prefetchNextId - feed-order successor in ring.
 * @property {readonly string[]} ringIds - up to three client ids allowed HLS attach (paused warm outside active).
 * @property {readonly string[]} domBudgetIds - up to five client ids that mount an inline `<video>` (ring + lookahead).
 * @property {number} softResetEpoch - bumps on periodic handoff reset (tiles reattach HLS).
 * @property {boolean} flingerMode - fast scroll: shrink prefetch ring; active still plays.
 * @property {boolean} heroLocked - hero flyout owns resources; ring collapses to hero tile only.
 * @property {string | null} heroClientId
 * @property {boolean} coordinatorSuspended - overlay/detail: freeze feed coordinator.
 * @property {Readonly<Record<string, number>>} tileRatios - clientId → Option A visible fraction.
 */

function tileVisibleRatio(el, rootEl) {
  if (!el || !rootEl) return 0
  const tileRect = el.getBoundingClientRect()
  const rootRect = rootEl.getBoundingClientRect()
  if (tileRect.width < 2 || tileRect.height < 2) return 0
  const overlapTop = Math.max(tileRect.top, rootRect.top)
  const overlapBottom = Math.min(tileRect.bottom, rootRect.bottom)
  const overlapLeft = Math.max(tileRect.left, rootRect.left)
  const overlapRight = Math.min(tileRect.right, rootRect.right)
  if (overlapBottom <= overlapTop || overlapRight <= overlapLeft) return 0
  const overlapArea = (overlapBottom - overlapTop) * (overlapRight - overlapLeft)
  const tileArea = tileRect.width * tileRect.height
  if (tileArea < 1) return 0
  return overlapArea / tileArea
}

/**
 * Scroll-surface coordinator: visibility-band autoplay, `{prev, active, next}` HLS ring,
 * centerline handoff (primary) + clip thresholds (fallback), hero-first resource lock.
 */
export function createAutoplayStore() {
  /** @type {Map<string, () => HTMLElement | null>} */
  const entries = new Map()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  let scheduled = false
  /** @type {React.RefObject<HTMLElement | null> | null} */
  let rootRef = null
  /** @type {LoungeFeedAutoplaySnapshot} */
  let snapshot = INITIAL_SNAPSHOT

  /** @type {string | null} */
  let activeId = null
  let heroLocked = false
  /** @type {string | null} */
  let heroClientId = null
  let coordinatorSuspended = false
  let flingerMode = false
  let lastScrollTop = 0
  /** @type {1 | -1 | 0} */
  let scrollDirection = 0
  let lastScrollRecomputeMs = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let flingerIdleTimer = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleWatchdogTimer = null
  let handoffCount = 0
  let softResetEpoch = 0

  /** @type {Map<string, () => void>} */
  const soundGestureHandlers = new Map()
  let feedSoundTouchActive = false
  let feedSoundWanted = false
  let lastSoundGestureNotifyMs = 0
  /** @type {{ unmuteInGesture?: () => void, getVideo?: () => HTMLVideoElement | null } | null} */
  let iosSharedStreamController = null

  const emit = () => {
    listeners.forEach((l) => {
      try {
        l()
      } catch {
        // ignore
      }
    })
  }

  const coordinatorWindowMarginPx = (rootEl) => {
    if (!rootEl) return 480
    const rootRect = rootEl.getBoundingClientRect()
    return Math.max(rootRect.height * LOUNGE_VIDEO_COORDINATOR_VIEWPORT_MARGIN_RATIO, 320)
  }

  const isInCoordinatorWindow = (el, rootEl) => {
    if (!el || !rootEl) return false
    const tileRect = el.getBoundingClientRect()
    const rootRect = rootEl.getBoundingClientRect()
    const margin = coordinatorWindowMarginPx(rootEl)
    return tileRect.bottom >= rootRect.top - margin && tileRect.top <= rootRect.bottom + margin
  }

  const buildOrderedIds = (rootEl) => {
    /** @type {{ id: string, top: number, left: number }[]} */
    const rows = []
    for (const [id, getEl] of entries) {
      const el = getEl()
      if (!el || !rootEl) continue
      if (!isInCoordinatorWindow(el, rootEl)) continue
      const rect = el.getBoundingClientRect()
      rows.push({ id, top: rect.top, left: rect.left })
    }
    rows.sort((a, b) => a.top - b.top || a.left - b.left)
    return rows.map((r) => r.id)
  }

  const computeTileMetrics = (rootEl, orderedIds) => {
    /** @type {Record<string, number>} */
    const ratios = {}
    /** @type {Record<string, number>} */
    const centerYs = {}
    const inWindow = new Set(orderedIds)
    for (const [id, getEl] of entries) {
      if (!inWindow.has(id)) {
        ratios[id] = 0
        centerYs[id] = 0
        continue
      }
      const el = getEl()
      if (!el || !rootEl) {
        ratios[id] = 0
        centerYs[id] = 0
        continue
      }
      const rect = el.getBoundingClientRect()
      ratios[id] = tileVisibleRatio(el, rootEl)
      centerYs[id] = (rect.top + rect.bottom) / 2
    }
    return { ratios, centerYs }
  }

  const scrollPortMidY = (rootEl) => {
    if (!rootEl) {
      return typeof window !== 'undefined' ? window.innerHeight / 2 : 400
    }
    const rootRect = rootEl.getBoundingClientRect()
    return rootRect.top + rootRect.height / 2
  }

  /**
   * Primary handoff: next/prev Stream tile midpoint crosses the scroll-column centerline.
   * Scroll down → feed successor with centerY ≤ midY; scroll up → predecessor with centerY ≥ midY.
   */
  const pickCenterCrossTakeover = (incumbent, orderedIds, ratios, centerYs, midY, direction) => {
    const idx = orderedIds.indexOf(incumbent)
    if (idx < 0) return null

    const visible = (id) => (ratios[id] ?? 0) > 0

    if (direction > 0) {
      for (let i = idx + 1; i < orderedIds.length; i += 1) {
        const id = orderedIds[i]
        if (!visible(id)) continue
        if ((centerYs[id] ?? 0) <= midY) return id
      }
      return null
    }

    if (direction < 0) {
      for (let i = idx - 1; i >= 0; i -= 1) {
        const id = orderedIds[i]
        if (!visible(id)) continue
        if ((centerYs[id] ?? 0) >= midY) return id
      }
      return null
    }

    for (let i = idx + 1; i < orderedIds.length; i += 1) {
      const id = orderedIds[i]
      if (!visible(id)) continue
      if ((centerYs[id] ?? 0) <= midY) return id
    }
    for (let i = idx - 1; i >= 0; i -= 1) {
      const id = orderedIds[i]
      if (!visible(id)) continue
      if ((centerYs[id] ?? 0) >= midY) return id
    }
    return null
  }

  /**
   * Fallback handoff when center cross has not fired (clip thresholds).
   * @param {string | null} incumbent
   * @param {readonly string[]} orderedIds
   * @param {Record<string, number>} ratios
   */
  const pickClipTakeover = (incumbent, orderedIds, ratios) => {
    if (!incumbent) return null
    const incRatio = ratios[incumbent] ?? 0
    const idx = orderedIds.indexOf(incumbent)
    if (idx < 0) return null

    /** @type {string[]} */
    const searchOrder = []
    if (scrollDirection >= 0) {
      for (let i = idx + 1; i < orderedIds.length; i += 1) searchOrder.push(orderedIds[i])
      for (let i = idx - 1; i >= 0; i -= 1) searchOrder.push(orderedIds[i])
    } else if (scrollDirection < 0) {
      for (let i = idx - 1; i >= 0; i -= 1) searchOrder.push(orderedIds[i])
      for (let i = idx + 1; i < orderedIds.length; i += 1) searchOrder.push(orderedIds[i])
    } else {
      for (let i = idx + 1; i < orderedIds.length; i += 1) searchOrder.push(orderedIds[i])
      for (let i = idx - 1; i >= 0; i -= 1) searchOrder.push(orderedIds[i])
    }

    /** @type {{ id: string, ratio: number, strong: boolean, contested: boolean }[]} */
    const qualified = []
    for (const id of searchOrder) {
      if (id === incumbent) continue
      const ratio = ratios[id] ?? 0
      const strong = incRatio <= LOUNGE_VIDEO_STRONG_OUT_MAX && ratio >= LOUNGE_VIDEO_STRONG_IN_MIN
      const contested = incRatio <= LOUNGE_VIDEO_CONTEST_OUT_MAX && ratio >= LOUNGE_VIDEO_CONTEST_IN_MIN
      if (strong || contested) qualified.push({ id, ratio, strong, contested })
    }
    if (qualified.length === 0) return null

    qualified.sort((a, b) => {
      if (a.strong !== b.strong) return a.strong ? -1 : 1
      if (b.ratio !== a.ratio) return b.ratio - a.ratio
      return orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)
    })
    return qualified[0].id
  }

  const pickBestVisibleNearCenter = (orderedIds, ratios, centerYs, midY, exceptId = null) => {
    /** @type {string | null} */
    let best = null
    let bestDist = Infinity
    for (const id of orderedIds) {
      if (id === exceptId) continue
      if ((ratios[id] ?? 0) <= 0) continue
      const dist = Math.abs((centerYs[id] ?? 0) - midY)
      if (dist < bestDist) {
        bestDist = dist
        best = id
      }
    }
    return best
  }

  /** First visible Stream tile in feed order ahead of scroll (for flinger HLS warm). */
  const pickLeadingVisibleInFeed = (orderedIds, ratios, fromIdx, direction) => {
    if (fromIdx < 0) return null
    if (direction > 0) {
      for (let i = fromIdx + 1; i < orderedIds.length; i += 1) {
        const id = orderedIds[i]
        if ((ratios[id] ?? 0) > 0) return id
      }
      return null
    }
    if (direction < 0) {
      for (let i = fromIdx - 1; i >= 0; i -= 1) {
        const id = orderedIds[i]
        if ((ratios[id] ?? 0) > 0) return id
      }
      return null
    }
    for (let i = fromIdx + 1; i < orderedIds.length; i += 1) {
      const id = orderedIds[i]
      if ((ratios[id] ?? 0) > 0) return id
    }
    for (let i = fromIdx - 1; i >= 0; i -= 1) {
      const id = orderedIds[i]
      if ((ratios[id] ?? 0) > 0) return id
    }
    return null
  }

  const pickFirstVisible = (orderedIds, ratios) =>
    orderedIds.find((id) => (ratios[id] ?? 0) > 0) ?? null

  /**
   * Up to three ids allowed HLS attach: active + feed-order {prev, next} + visible near center.
   * Feed neighbors stay in ring at ratio 0 so outgoing tiles pause (keep currentTime) instead of HLS teardown.
   */
  const buildRingIds = (orderedIds, ratios, centerYs, midY, active, maxCount) => {
    if (!active) return []
    /** @type {Set<string>} */
    const pickSet = new Set([active])

    const idx = orderedIds.indexOf(active)
    if (idx >= 0) {
      if (idx > 0) pickSet.add(orderedIds[idx - 1])
      if (idx < orderedIds.length - 1) pickSet.add(orderedIds[idx + 1])
    }

    if (pickSet.size < maxCount) {
      const visible = orderedIds.filter((id) => (ratios[id] ?? 0) > 0)
      const byNearCenter = visible
        .map((id) => ({
          id,
          dist: Math.abs((centerYs[id] ?? 0) - midY),
          idx: orderedIds.indexOf(id),
        }))
        .sort((a, b) => a.dist - b.dist || a.idx - b.idx)

      for (const row of byNearCenter) {
        if (pickSet.size >= maxCount) break
        pickSet.add(row.id)
      }
    }

    return orderedIds.filter((id) => pickSet.has(id))
  }

  /** Ring (≤3) + feed-order neighbors (≤5 total) mount `<video>` without extra HLS beyond ring. */
  const buildDomBudgetIds = (orderedIds, ringIds, active, direction, maxCount = LOUNGE_VIDEO_DOM_BUDGET_MAX) => {
    /** @type {Set<string>} */
    const pick = new Set(ringIds.filter(Boolean))
    if (pick.size >= maxCount || !active) {
      return orderedIds.filter((id) => pick.has(id))
    }
    const idx = orderedIds.indexOf(active)
    if (idx < 0) return orderedIds.filter((id) => pick.has(id))

    const tryAdd = (i) => {
      if (pick.size >= maxCount) return
      const id = orderedIds[i]
      if (id) pick.add(id)
    }

    if (direction > 0) {
      for (let i = idx + 1; i < orderedIds.length && pick.size < maxCount; i += 1) tryAdd(i)
      for (let i = idx - 1; i >= 0 && pick.size < maxCount; i -= 1) tryAdd(i)
    } else if (direction < 0) {
      for (let i = idx - 1; i >= 0 && pick.size < maxCount; i -= 1) tryAdd(i)
      for (let i = idx + 1; i < orderedIds.length && pick.size < maxCount; i += 1) tryAdd(i)
    } else {
      for (let i = idx + 1; i < orderedIds.length && pick.size < maxCount; i += 1) tryAdd(i)
      for (let i = idx - 1; i >= 0 && pick.size < maxCount; i -= 1) tryAdd(i)
    }
    return orderedIds.filter((id) => pick.has(id))
  }

  const resolveActiveId = (orderedIds, ratios, centerYs, midY, incumbent, { flinger }) => {
    const bestCenter = pickBestVisibleNearCenter(orderedIds, ratios, centerYs, midY)
    const pickVisibleFallback = () => bestCenter ?? pickFirstVisible(orderedIds, ratios)

    let next = incumbent
    if (next && !orderedIds.includes(next)) next = null

    if (!next) return pickVisibleFallback()

    const incRatio = ratios[next] ?? 0
    if (incRatio <= 0) return pickVisibleFallback()
    if (incRatio <= LOUNGE_VIDEO_ACTIVE_RELEASE_RATIO) return pickVisibleFallback()

    if (!bestCenter || bestCenter === next) return next

    const incIdx = orderedIds.indexOf(next)
    const bestIdx = orderedIds.indexOf(bestCenter)
    const incDist = Math.abs((centerYs[next] ?? 0) - midY)
    const bestDist = Math.abs((centerYs[bestCenter] ?? 0) - midY)

    const centerTakeover = pickCenterCrossTakeover(next, orderedIds, ratios, centerYs, midY, scrollDirection)
    const clipTakeover = centerTakeover ? null : pickClipTakeover(next, orderedIds, ratios)
    const thresholdTakeover = centerTakeover ?? clipTakeover
    if (thresholdTakeover) return thresholdTakeover

    if (flinger || scrollDirection !== 0) {
      const lead = pickLeadingVisibleInFeed(orderedIds, ratios, incIdx, scrollDirection)
      if (lead && lead !== next && (ratios[lead] ?? 0) > 0) return lead
      if (incRatio <= LOUNGE_VIDEO_ACTIVE_SCROLL_CONTEST_MAX && incIdx >= 0 && bestIdx >= 0) {
        const scrollingToNext = scrollDirection > 0 && bestIdx > incIdx
        const scrollingToPrev = scrollDirection < 0 && bestIdx < incIdx
        if (scrollingToNext || scrollingToPrev) return bestCenter
      }
      if (bestDist + 12 < incDist) return bestCenter
      return next
    }

    if ((ratios[bestCenter] ?? 0) > incRatio) return bestCenter
    return bestDist + LOUNGE_VIDEO_IDLE_HANDOFF_CENTER_GAP_PX < incDist ? bestCenter : next
  }

  const needsIdleWatchdog = (orderedIds, ratios, active) => {
    if (!orderedIds.length) return false
    if (!active) return orderedIds.some((id) => (ratios[id] ?? 0) > 0)
    if ((ratios[active] ?? 0) > 0) return false
    return orderedIds.some((id) => (ratios[id] ?? 0) > 0)
  }

  const armIdleWatchdog = (orderedIds, ratios, active) => {
    if (!needsIdleWatchdog(orderedIds, ratios, active)) {
      if (idleWatchdogTimer) {
        window.clearTimeout(idleWatchdogTimer)
        idleWatchdogTimer = null
      }
      return
    }
    if (idleWatchdogTimer) window.clearTimeout(idleWatchdogTimer)
    idleWatchdogTimer = window.setTimeout(() => {
      idleWatchdogTimer = null
      schedule()
    }, LOUNGE_VIDEO_COORDINATOR_IDLE_WATCHDOG_MS)
  }

  const publish = (orderedIds, ratios, centerYs, rootEl) => {
    const midY = scrollPortMidY(rootEl)
    if (activeId && !orderedIds.includes(activeId)) activeId = null
    if (activeId && (ratios[activeId] ?? 0) <= LOUNGE_VIDEO_ACTIVE_RELEASE_RATIO) activeId = null
    let nextActive = activeId
    let prefetchPrevId = null
    let prefetchNextId = null
    /** @type {string[]} */
    let ringIds = []
    /** @type {string[]} */
    let domBudgetIds = []

    if (heroLocked && heroClientId) {
      ringIds = [heroClientId]
      domBudgetIds = [heroClientId]
      prefetchPrevId = null
      prefetchNextId = null
    } else if (!coordinatorSuspended) {
      nextActive = resolveActiveId(orderedIds, ratios, centerYs, midY, nextActive, { flinger: flingerMode })

      if (nextActive) {
        const idx = orderedIds.indexOf(nextActive)
        if (idx >= 0) {
          prefetchPrevId = idx > 0 ? orderedIds[idx - 1] : null
          prefetchNextId = idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null
          /** Always {prev,active,next} ring (≤3 HLS) - flinger only affects handoff timing, not ring size. */
          ringIds = buildRingIds(orderedIds, ratios, centerYs, midY, nextActive, 3)
        }
      }
      domBudgetIds = buildDomBudgetIds(orderedIds, ringIds, nextActive, scrollDirection)
    } else if (coordinatorSuspended) {
      ringIds = nextActive ? [nextActive] : []
      domBudgetIds = nextActive ? [nextActive] : []
      if (nextActive) {
        const idx = orderedIds.indexOf(nextActive)
        if (idx >= 0) {
          prefetchPrevId = idx > 0 ? orderedIds[idx - 1] : null
          prefetchNextId = idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null
        }
      }
    }

    const prevActiveId = activeId
    activeId = nextActive

    const prevRingKey = snapshot.ringIds.join(',')
    const nextRingKey = ringIds.join(',')
    const prevDomKey = snapshot.domBudgetIds.join(',')
    const nextDomKey = domBudgetIds.join(',')

    if (prevActiveId !== nextActive) {
      const prevR = prevActiveId ? (ratios[prevActiveId] ?? 0).toFixed(2) : '-'
      const nextR = nextActive ? (ratios[nextActive] ?? 0).toFixed(2) : '-'
      reportCoordDebug(
        `active ${shortCoordId(prevActiveId)}→${shortCoordId(nextActive)} r=${prevR}→${nextR} fl=${flingerMode ? 1 : 0}`,
      )
    } else if (prevRingKey !== nextRingKey) {
      reportCoordDebug(
        `ring [${ringIds.map(shortCoordId).join(',')}] active=${shortCoordId(nextActive)}`,
      )
    } else if (prevDomKey !== nextDomKey) {
      reportCoordDebug(
        `dom [${domBudgetIds.map(shortCoordId).join(',')}] active=${shortCoordId(nextActive)}`,
      )
    }

    const warmRingHandoff =
      prevActiveId &&
      nextActive &&
      prevActiveId !== nextActive &&
      snapshot.ringIds.includes(prevActiveId) &&
      snapshot.ringIds.includes(nextActive)

    if (
      prevActiveId &&
      nextActive &&
      prevActiveId !== nextActive &&
      !heroLocked &&
      !coordinatorSuspended
    ) {
      if (warmRingHandoff) {
        reportCoordDebug(
          `softReset skipped warm ${shortCoordId(prevActiveId)}→${shortCoordId(nextActive)}`,
        )
      } else {
        handoffCount += 1
        if (handoffCount % LOUNGE_VIDEO_SOFT_RESET_HANDOFF_EVERY === 0) {
          softResetEpoch += 1
          const resetEpoch = softResetEpoch
          reportCoordDebug(`softReset epoch=${resetEpoch} handoff#=${handoffCount} → clear active`)
          queueMicrotask(() => {
            if (heroLocked || coordinatorSuspended) return
            activeId = null
            reportCoordDebug(`softReset epoch=${resetEpoch} active cleared`)
            schedule()
          })
        }
      }
    }

    if (prevActiveId && prevActiveId !== nextActive) {
      try {
        const prevGetEl = entries.get(prevActiveId)
        const prevEl = prevGetEl?.()
        const video = prevEl?.querySelector?.('video')
        if (video) {
          video.pause()
          video.muted = true
        }
      } catch {
        // ignore
      }
    }

    const nextSnapshot = Object.freeze({
      activeId: nextActive,
      prefetchPrevId,
      prefetchNextId,
      ringIds: Object.freeze(ringIds),
      domBudgetIds: Object.freeze(domBudgetIds),
      softResetEpoch,
      flingerMode,
      heroLocked,
      heroClientId,
      coordinatorSuspended,
      tileRatios: Object.freeze({ ...ratios }),
    })

    const structuralChange =
      nextSnapshot.activeId !== snapshot.activeId ||
      nextSnapshot.prefetchPrevId !== snapshot.prefetchPrevId ||
      nextSnapshot.prefetchNextId !== snapshot.prefetchNextId ||
      nextSnapshot.flingerMode !== snapshot.flingerMode ||
      nextSnapshot.heroLocked !== snapshot.heroLocked ||
      nextSnapshot.heroClientId !== snapshot.heroClientId ||
      nextSnapshot.coordinatorSuspended !== snapshot.coordinatorSuspended ||
      nextSnapshot.softResetEpoch !== snapshot.softResetEpoch ||
      nextSnapshot.ringIds.length !== snapshot.ringIds.length ||
      nextSnapshot.ringIds.some((id, i) => id !== snapshot.ringIds[i]) ||
      nextSnapshot.domBudgetIds.length !== snapshot.domBudgetIds.length ||
      nextSnapshot.domBudgetIds.some((id, i) => id !== snapshot.domBudgetIds[i])

    const ratioIds = new Set([...Object.keys(snapshot.tileRatios), ...Object.keys(ratios)])
    const ratioEmitIds = new Set(
      [
        nextActive,
        snapshot.activeId,
        ...ringIds,
        ...snapshot.ringIds,
        ...domBudgetIds,
        ...snapshot.domBudgetIds,
      ].filter(Boolean),
    )
    let ratiosChanged = false
    let soundBandCrossed = false
    const activeForSound = nextActive ?? snapshot.activeId
    for (const id of ratioIds) {
      if (!ratioEmitIds.has(id)) continue
      const prev = snapshot.tileRatios[id] ?? 0
      const next = ratios[id] ?? 0
      if (Math.abs(prev - next) > LOUNGE_VIDEO_RATIO_EMIT_EPSILON) ratiosChanged = true
      if (id === activeForSound) {
        const wasOn = prev >= LOUNGE_VIDEO_SOUND_ON_RATIO
        const wasOff = prev <= LOUNGE_VIDEO_SOUND_OFF_RATIO
        const nowOn = next >= LOUNGE_VIDEO_SOUND_ON_RATIO
        const nowOff = next <= LOUNGE_VIDEO_SOUND_OFF_RATIO
        if (wasOn !== nowOn || wasOff !== nowOff) soundBandCrossed = true
      }
    }

    if (structuralChange || ratiosChanged || soundBandCrossed) {
      snapshot = nextSnapshot
      emit()
    }

    if (
      feedSoundWanted &&
      feedSoundTouchActive &&
      nextActive &&
      prevActiveId !== nextActive
    ) {
      notifySoundGesture()
    }
  }

  const recompute = () => {
    scheduled = false
    const rootEl = rootRef?.current ?? null
    const orderedIds = buildOrderedIds(rootEl)
    const { ratios, centerYs } = computeTileMetrics(rootEl, orderedIds)
    publish(orderedIds, ratios, centerYs, rootEl)
    armIdleWatchdog(orderedIds, ratios, activeId)
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(recompute)
  }

  /** Scroll tick: always recompute handoff; flinger only shrinks prefetch ring. */
  const markScroll = () => {
    const rootEl = rootRef?.current
    if (rootEl) {
      const st = rootEl.scrollTop
      if (st > lastScrollTop) scrollDirection = 1
      else if (st < lastScrollTop) scrollDirection = -1
      lastScrollTop = st
    }
    if (!heroLocked && !coordinatorSuspended) {
      flingerMode = true
      if (flingerIdleTimer) window.clearTimeout(flingerIdleTimer)
      flingerIdleTimer = window.setTimeout(() => {
        flingerIdleTimer = null
        flingerMode = false
        lastScrollRecomputeMs = 0
        schedule()
      }, LOUNGE_VIDEO_FLINGER_IDLE_MS)
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (flingerMode && now - lastScrollRecomputeMs < 50) {
      if (feedSoundWanted && feedSoundTouchActive && activeId) {
        notifySoundGesture()
      }
      return
    }
    lastScrollRecomputeMs = now
    if (feedSoundWanted && feedSoundTouchActive && activeId) {
      notifySoundGesture()
    }
    schedule()
  }

  const notifySoundGesture = () => {
    if (iosSharedStreamController?.unmuteInGesture) {
      try {
        iosSharedStreamController.unmuteInGesture()
      } catch {
        // ignore
      }
      return
    }
    if (!activeId) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastSoundGestureNotifyMs < 90) return
    lastSoundGestureNotifyMs = now
    const fn = soundGestureHandlers.get(activeId)
    if (typeof fn !== 'function') return
    try {
      fn()
    } catch {
      // ignore
    }
  }

  return {
    /** @param {React.RefObject<HTMLElement | null> | null} ref */
    setScrollRootRef(ref) {
      rootRef = ref
    },
    /** @returns {() => void} */
    register(id, getEl) {
      entries.set(id, getEl)
      queueMicrotask(schedule)
      return () => {
        entries.delete(id)
        if (activeId === id) activeId = null
        if (heroClientId === id && heroLocked) {
          heroLocked = false
          heroClientId = null
        }
        queueMicrotask(schedule)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return snapshot
    },
    getDebugInfo() {
      return {
        registeredEntryCount: entries.size,
        registeredIds: [...entries.keys()],
      }
    },
    schedule,
    markScroll,
    /** Promote a tile to active (tap for sound / hero intent). */
    forceActive(id) {
      if (!id || activeId === id) return
      activeId = id
      schedule()
    },
    /** Hero flyout: collapse ring to hero tile only - max one decoder for flyout perf. */
    enterHeroLock(id) {
      if (!id) return
      heroLocked = true
      heroClientId = id
      flingerMode = false
      if (flingerIdleTimer) {
        window.clearTimeout(flingerIdleTimer)
        flingerIdleTimer = null
      }
      schedule()
    },
    exitHeroLock() {
      if (!heroLocked && !heroClientId) return
      heroLocked = false
      heroClientId = null
      activeId = null
      flingerMode = false
      if (flingerIdleTimer) {
        window.clearTimeout(flingerIdleTimer)
        flingerIdleTimer = null
      }
      schedule()
    },
    /** Active tile has HLS but stayed paused - clear incumbent so handoff can pick a fresh winner. */
    releaseStalledActive(id) {
      if (!id || activeId !== id) return
      activeId = null
      schedule()
    },
    /** Post detail / overlay: freeze handoff and shrink ring (feed stays mounted). */
    setCoordinatorSuspended(suspended) {
      const next = Boolean(suspended)
      if (coordinatorSuspended === next) return
      coordinatorSuspended = next
      schedule()
    },
    /** Active tile registers gesture-scoped unmute (iOS feed-wide sound handoffs). */
    registerSoundGesture(id, fn) {
      if (!id || typeof fn !== 'function') return () => {}
      soundGestureHandlers.set(id, fn)
      return () => {
        soundGestureHandlers.delete(id)
      }
    },
    /** Provider sets while finger is on the scroll column (handoff mid-scroll = still in gesture). */
    setFeedSoundTouchActive(active) {
      feedSoundTouchActive = Boolean(active)
    },
    isFeedSoundTouchActive() {
      return feedSoundTouchActive
    },
    /** Feed-wide Tap for sound enabled - gate scroll/gesture unmute notifies. */
    setFeedSoundWanted(wanted) {
      feedSoundWanted = Boolean(wanted)
    },
    /** Scroll-root touch - invoke active tile unmute inside user-gesture stack. */
    notifySoundGesture,
    /** iOS shared inline player - Tap for sound targets one persistent `<video>`. */
    registerIosSharedStreamController(controller) {
      iosSharedStreamController = controller
      return () => {
        if (iosSharedStreamController === controller) iosSharedStreamController = null
      }
    },
    getIosSharedStreamController() {
      return iosSharedStreamController
    },
  }
}
