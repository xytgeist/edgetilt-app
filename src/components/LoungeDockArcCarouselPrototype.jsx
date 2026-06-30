import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX,
  LOUNGE_DOCK_CAROUSEL_RADIUS_PX,
  LOUNGE_DOCK_FAB_SIZE_PX,
  loungeDockCarouselSnapRotation,
  loungeDockFabCornerPosition,
  loungeDockFabDefaultPosition,
  loungeDockFabClampToBounds,
  loungeDockFabMoveBounds,
  loungeDockFabPctFromPosition,
  loungeDockFabPositionFromPct,
  loungeDockLShapeOffsets,
  loungeDockFabCollisionBottomInsetPx,
  loungeDockLayoutViewportSize,
  LOUNGE_FAB_OBSTACLE_SELECTOR,
  loungeDockCompactPipFabVisualCenter,
  loungeDockCompactPipHomeOffset,
  loungeDockCornerLCompactHomeOffset,
  loungeDockWheelCompactHomeOffset,
  loungeDockWheelLayout,
  readLoungeDockFabPrefs,
  readLoungeDockMenuLayoutIntroCompleted,
  writeLoungeDockFabPrefs,
  writeLoungeDockMenuLayout,
  writeLoungeDockMenuLayoutIntroCompleted,
} from '../utils/loungeDockFabPosition.js'
import LoungeDockMenuLayoutIntroOverlay from './LoungeDockMenuLayoutIntroOverlay.jsx'
import {
  LOUNGE_DOCK_FAB_CENTER_GLOW,
  LOUNGE_DOCK_BORDER_FILTER_ON,
  LOUNGE_DOCK_FAB_GLOW_ENABLED,
  loungeDockFabCenterShadowClass,
  loungeDockItemGlowForDisplay,
  NEON_BLUE_ITEM_GLOW_IDLE,
  NEON_BLUE_ITEM_GLOW_PAGE_ACTIVE,
} from '../utils/loungeDockFabGlow.js'
import {
  Z_LOUNGE_DOCK_ABOVE_DETAIL_PROFILE,
  Z_LOUNGE_DOCK_ABOVE_SLIDE_PANEL,
  Z_LOUNGE_DOCK_VIEWPORT,
} from '../constants/appZIndex.js'

const HOME_ITEM_ID = 'home'
/** Compact FAB + home chip (search/notifications/settings/chat panels, or any non-feed screen). */
const PANEL_CHROME_PANELS = new Set(['search', 'notifications', 'chat', 'settings', 'awayFromFeed'])

const ITEM_ICON_PX = Math.round((23 * LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX) / 40)
const DRAG_THRESHOLD_PX = 8
const SPIN_WHEEL_SENSITIVITY = 0.0045
/** Below this rotation delta (rad), pointer-up on an icon counts as a tap. */
const SPIN_TAP_SLOP_RAD = 0.04
/** Brief block on feed/panel under the wheel so synthesized clicks cannot pass through after tap. */
const POINTER_GUARD_MS = 400
/** After reposition, release often synthesizes a click on whatever is under the finger. */
const REPOSITION_POINTER_GUARD_MS = 1000
/** Hold on the menu button to unlock position, then drag; release to lock at the new spot. */
const FAB_REPOSITION_LONG_PRESS_MS = 450
/** Backdrop: past this movement = pan/scroll (close menu, release capture); below = tap (close only, block click-through). */
const BACKDROP_PAN_THRESHOLD_PX = 12
/** Scroll-hide: below this `reveal` the FAB is treated as gone (no idle dim). */
const FAB_REVEAL_VISIBLE = 0.12
/** After this idle window the FAB shrinks to {@link FAB_COMPACT_VISUAL_PX} and snaps to the bottom corner on its side. */
const FAB_COMPACT_PIP_MS = 5_000
const FAB_COMPACT_VISUAL_PX = 30
/** Visible FAB dims to half opacity after this long without interaction. */
const FAB_IDLE_DIM_MS = 10_000
const FAB_IDLE_DIM_OPACITY = 0.5
const FAB_LONG_PRESS_RING_COUNT = 4
/** ms per phase: ring2 in → ring3 in → ring4 in → rings 2–4 out (loops; ring1 stays). */
const FAB_LONG_PRESS_RING_SEGMENT_MS = 280
/** Home chip: compact panel chrome ↔ wheel / L menu slot. */
const LOUNGE_DOCK_HOME_MORPH_MS = 440
const LOUNGE_DOCK_HOME_MORPH_EASING = 'cubic-bezier(0.33, 1, 0.45, 1)'
/** FAB host left/top/transform when flying from compact pip (must match inline style on fab host). */
const LOUNGE_DOCK_FAB_PIP_FLIGHT_MS = 300
/** Reveal orbit items halfway through that fly-in so they overlap the second half. */
const LOUNGE_DOCK_FAB_PIP_WHEEL_REVEAL_MS = LOUNGE_DOCK_FAB_PIP_FLIGHT_MS / 2
/** Circle 1 → 4: heaviest stroke innermost, thinnest outermost (user example 4→1). */
const FAB_LONG_PRESS_RING_STROKES_PX = [3.5, 2.65, 1.75, 1]
/** Ring 1 sits just outside the FAB; each next ring is one fixed step further out. */
const FAB_LONG_PRESS_RING_INSET_PX = 3
const FAB_LONG_PRESS_RING_GAP_PX = 7

function fabLongPressRingScale(ringIndex, fabSizePx) {
  const radius =
    fabSizePx / 2 + FAB_LONG_PRESS_RING_INSET_PX + ringIndex * FAB_LONG_PRESS_RING_GAP_PX
  return (radius * 2) / fabSizePx
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function hiddenFabLongPressRing() {
  return { visible: false, opacity: 0, scale: 1, strokePx: 1 }
}

function fabLongPressRingAt(fabSizePx, ringIndex, opacity, visible = true) {
  return {
    visible,
    opacity,
    scale: fabLongPressRingScale(ringIndex, fabSizePx),
    strokePx: FAB_LONG_PRESS_RING_STROKES_PX[ringIndex],
  }
}

/** Fixed concentric rings; 2–4 appear in order at their radius, fade, loop until release. */
function fabLongPressRingStatesFromElapsed(elapsedMs, fabSizePx) {
  const ring1 = fabLongPressRingAt(fabSizePx, 0, 0.92)
  const outer = [1, 2, 3].map(() => hiddenFabLongPressRing())

  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  ) {
    return [ring1, ...outer]
  }

  const seg = FAB_LONG_PRESS_RING_SEGMENT_MS

  if (elapsedMs < seg) {
    const intro = clamp(elapsedMs / (seg * 0.45), 0, 1)
    return [fabLongPressRingAt(fabSizePx, 0, lerp(0.25, 0.92, intro)), ...outer]
  }

  const loopT = elapsedMs - seg
  const cycleLen = seg * 4
  const t = loopT % cycleLen
  const phase = Math.min(3, Math.floor(t / seg))
  const local = clamp((t % seg) / seg, 0, 1)

  if (phase === 0) {
    outer[0] = fabLongPressRingAt(fabSizePx, 1, lerp(0.2, 0.9, local))
  } else if (phase === 1) {
    outer[0] = fabLongPressRingAt(fabSizePx, 1, 0.9)
    outer[1] = fabLongPressRingAt(fabSizePx, 2, lerp(0.2, 0.9, local))
  } else if (phase === 2) {
    outer[0] = fabLongPressRingAt(fabSizePx, 1, 0.9)
    outer[1] = fabLongPressRingAt(fabSizePx, 2, 0.9)
    outer[2] = fabLongPressRingAt(fabSizePx, 3, lerp(0.2, 0.9, local))
  } else {
    const out = 1 - local
    outer[0] = fabLongPressRingAt(fabSizePx, 1, 0.9 * out, out > 0.04)
    outer[1] = fabLongPressRingAt(fabSizePx, 2, 0.9 * out, out > 0.04)
    outer[2] = fabLongPressRingAt(fabSizePx, 3, 0.9 * out, out > 0.04)
  }

  return [ring1, ...outer]
}

/** Glow scaled by ring index (inner = stronger) and current opacity. */
function fabLongPressRingGlow(ringIndex, opacity, isLight) {
  const o = clamp(opacity, 0, 1)
  const tier = [1, 0.82, 0.64, 0.48][ringIndex] ?? 0.48
  const a = o * tier
  if (isLight) {
    return [
      `0 0 ${6 + ringIndex}px rgba(59, 130, 246, ${0.55 * a})`,
      `0 0 ${12 + ringIndex * 2}px rgba(59, 130, 246, ${0.35 * a})`,
      `0 0 ${20 + ringIndex * 3}px rgba(59, 130, 246, ${0.22 * a})`,
    ].join(', ')
  }
  return [
    `0 0 ${6 + ringIndex}px rgba(6, 206, 252, ${0.65 * a})`,
    `0 0 ${12 + ringIndex * 2}px rgba(6, 206, 252, ${0.42 * a})`,
    `0 0 ${20 + ringIndex * 3}px rgba(148, 243, 253, ${0.28 * a})`,
  ].join(', ')
}

function FabLongPressRingIndicator({ rings, sizePx }) {
  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  const ringColor = isLight ? '#3b82f6' : '#06cefc'
  const dropShadowRgb = isLight ? '59, 130, 246' : '6, 206, 252'
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 z-0"
      style={{
        width: sizePx,
        height: sizePx,
        marginLeft: -sizePx / 2,
        marginTop: -sizePx / 2,
      }}
      aria-hidden
    >
      {rings.map((ring, ringIndex) => {
        if (!ring.visible) return null
        return (
          <span
            key={ringIndex}
            className="absolute inset-0 box-border rounded-full"
            style={{
              borderWidth: ring.strokePx,
              borderColor: ringColor,
              borderStyle: 'solid',
              transform: `scale(${ring.scale})`,
              opacity: ring.opacity,
              boxShadow: fabLongPressRingGlow(ringIndex, ring.opacity, isLight),
              filter: `drop-shadow(0 0 ${5 + ringIndex}px rgba(${dropShadowRgb}, ${0.45 * ring.opacity}))`,
            }}
          />
        )
      })}
    </span>
  )
}

function angleFromPointer(fabCenterX, fabCenterY, clientX, clientY) {
  return Math.atan2(-(clientX - fabCenterX), -(clientY - fabCenterY))
}

function clearDocumentTextSelection() {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0) return
  sel.removeAllRanges()
}

function blockPointerEvent(e) {
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation?.()
}

const REPOSITION_CAPTURE_EVENT_TYPES = [
  'click',
  'pointerup',
  'pointerdown',
  'auxclick',
  'touchend',
  'touchstart',
  'mousedown',
  'mouseup',
]

/**
 * Experimental Lounge nav: draggable FAB + full spin wheel (home anchors left/right of FAB) (prototype only).
 */
export default function LoungeDockArcCarouselPrototype({
  /** Wheel (O) menu item row order (ring + signed step / compact chrome). */
  items = [],
  /** Edge (L) menu item row order (`loungeDockLShapeOffsets`). Omit to reuse `items` for L. */
  cornerLItems = null,
  defaultOpen = false,
  reveal = 1,
  /** When set (search / notifications / chat / settings / awayFromFeed), FAB + home stay visible; tap FAB to expand full menu. */
  panelChrome = null,
  /** True while the wheel is open or briefly after a wheel icon tap (blocks feed/panel hits). */
  onPointerBlockChange,
  /** `'wheel'` = ring (O); `'cornerL'` = bottom-corner L / Г along edges. */
  menuLayout = 'wheel',
  /** Reserve bottom viewport space (e.g. Lounge upload bar) so the FAB does not cover controls. */
  bottomObstacleInsetPx = 0,
  /** Unread in-app notifications - FAB badge clears on menu expand; Alerts item clears on panel visit. */
  notificationsUnreadCount = 0,
  /**
   * When false (Lounge home feed tab only), FAB stays full-size with scroll-reveal + idle dim only.
   * When true (other tabs, away from feed, or search/notifications/settings panels), idle compact pip may apply.
   */
  enableFabCompactPip = true,
  /** Raise above `LoungeDockSlidePanels` (z-99) on search / notifications / settings. */
  stackAboveSlidePanel = false,
  /** Raise above post detail / profile shells (z 98–102) while keeping below detail media lightbox (103+). */
  stackAboveDetailOrProfile = false,
  /**
   * Post / comment detail: after {@link FAB_COMPACT_PIP_MS} idle, Edge L shrinks in place;
   * wheel shrinks and flies to the Edge L corner slot ({@link loungeDockFabCornerPosition} raised).
   */
  fabDetailShellCompact = false,
}) {
  const panelCompactChrome = panelChrome != null && PANEL_CHROME_PANELS.has(panelChrome)
  const isCornerL = menuLayout === 'cornerL'
  const [open, setOpen] = useState(defaultOpen)
  const [fabPos, setFabPos] = useState(null)
  const [repositioning, setRepositioning] = useState(false)
  /** Blocks native text selection while the menu button is held (long-press reposition). */
  const [fabSelectionLock, setFabSelectionLock] = useState(false)
  const [clickShield, setClickShield] = useState(false)
  const [viewport, setViewport] = useState(() => loungeDockLayoutViewportSize())
  const [collisionInsetPx, setCollisionInsetPx] = useState(0)
  const [carouselRotation, setCarouselRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  /** Flash label shown beside the Following button when the filter toggles. */
  const [followingFlash, setFollowingFlash] = useState(/** @type {{ label: string, key: number } | null} */ (null))
  const followingFlashTimerRef = useRef(0)
  /** Last known viewport center of the Following button (updated while menu is open). */
  const followingItemCenterRef = useRef(/** @type {{ x: number, y: number } | null} */ (null))
  /** FAB (+) badge dismissed when menu expands; Alerts icon keeps count until notifications panel opens. */
  const [fabNotifBadgeDismissed, setFabNotifBadgeDismissed] = useState(false)
  const notificationsUnreadPrevRef = useRef(notificationsUnreadCount)

  /** One-time overlay after first menu open: move FAB copy + Wheel/Edge picker. */
  const [menuLayoutIntroOpen, setMenuLayoutIntroOpen] = useState(false)

  const expandMenu = useCallback(() => {
    setFabNotifBadgeDismissed(true)
    setOpen(true)
    if (!readLoungeDockMenuLayoutIntroCompleted()) {
      setMenuLayoutIntroOpen(true)
    }
  }, [])

  const onIntroChooseLayout = useCallback((mode) => {
    writeLoungeDockMenuLayout(mode)
    writeLoungeDockMenuLayoutIntroCompleted()
    setMenuLayoutIntroOpen(false)
  }, [])

  const fabNotifBadgeCount =
    !fabNotifBadgeDismissed && notificationsUnreadCount > 0 ? notificationsUnreadCount : 0

  const fabHostRef = useRef(null)
  const fabDragRef = useRef(null)
  const spinRef = useRef(null)
  const spinMovedRef = useRef(false)
  const fabPosRef = useRef(null)
  const repositioningRef = useRef(false)
  const longPressTimerRef = useRef(0)
  const longPressArmedRef = useRef(false)
  const longPressRafRef = useRef(0)
  const longPressStartedAtRef = useRef(0)
  const [fabLongPressProgress, setFabLongPressProgress] = useState(0)
  const [fabLongPressRingsActive, setFabLongPressRingsActive] = useState(false)
  const [fabLongPressRings, setFabLongPressRings] = useState(() =>
    Array.from({ length: FAB_LONG_PRESS_RING_COUNT }, () => hiddenFabLongPressRing()),
  )
  /** Half-opacity rest state when visible but idle (not scroll-hidden). */
  const [fabIdleDimmed, setFabIdleDimmed] = useState(false)
  /** Shrunk pip at bottom corner (display only - {@link fabPos} prefs unchanged). */
  const [fabCompactPip, setFabCompactPip] = useState(false)
  /**
   * Opening menu from compact pip: one frame at corner + home beside pip, then animate to full layout.
   * @type {[{ cornerPos: { left: number, top: number }, anchor: { x: number, y: number }, alignLeft: boolean } | null]}
   */
  const [fabExpandFromPip, setFabExpandFromPip] = useState(null)
  /** Opening from compact pip: hide orbit items until FAB reaches saved position. */
  const [pipWheelItemsDeferred, setPipWheelItemsDeferred] = useState(false)
  const pipWasCompactRef = useRef(false)
  const fabCompactPipRef = useRef(false)
  /** Brief scale pop when waking from idle dim. */
  const [fabWakePop, setFabWakePop] = useState(false)
  const fabIdleTimerRef = useRef(0)
  const fabCompactTimerRef = useRef(0)
  const fabWakePopTimerRef = useRef(0)
  const fabIdleDimmedRef = useRef(false)
  const openRef = useRef(false)
  const carouselRotationRef = useRef(0)
  const pointerGuardRef = useRef(false)
  const pointerGuardTimerRef = useRef(0)
  const spinEnabledRef = useRef(false)
  const suppressFabClickRef = useRef(false)
  const repositionCaptureCleanupRef = useRef(null)
  const backdropGestureRef = useRef(null)
  const fabDetailShellCompactPrevRef = useRef(false)

  const bottomObstaclePx = Math.max(0, Math.round(Number(bottomObstacleInsetPx) || 0))
  /** Post/comment detail: FAB stays at saved position and stacks over the keyboard - no obstacle push. */
  const fabObstacleCollisionEnabled = !fabDetailShellCompact
  const totalBottomObstaclePx = bottomObstaclePx + (fabObstacleCollisionEnabled ? collisionInsetPx : 0)

  const fabMoveBounds = useMemo(
    () =>
      loungeDockFabMoveBounds(viewport.width, viewport.height, LOUNGE_DOCK_FAB_SIZE_PX, totalBottomObstaclePx),
    [viewport.width, viewport.height, totalBottomObstaclePx],
  )

  const syncViewport = useCallback(() => {
    const next = loungeDockLayoutViewportSize()
    setViewport((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    )
  }, [])

  useEffect(() => {
    syncViewport()
    const vv = window.visualViewport
    window.addEventListener('resize', syncViewport)
    vv?.addEventListener('resize', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      vv?.removeEventListener('resize', syncViewport)
    }
  }, [syncViewport])

  useEffect(() => {
    const { width, height } = viewport
    const bounds = loungeDockFabMoveBounds(width, height, LOUNGE_DOCK_FAB_SIZE_PX, bottomObstaclePx)
    const saved = readLoungeDockFabPrefs()
    const pos = saved
      ? loungeDockFabPositionFromPct(saved.xPct, saved.yPct, bounds)
      : loungeDockFabDefaultPosition(width, height, LOUNGE_DOCK_FAB_SIZE_PX, bottomObstaclePx)
    if (!fabObstacleCollisionEnabled) {
      setFabPos(pos)
      return
    }
    // If the pref-restored position overlaps a visible obstacle (e.g. upload bar still on screen
    // from a prior session or during remount), pre-adjust to the obstacle-aware position so the
    // FAB never flickers down-then-up while the collision effect catches up.
    const tentativeRect = {
      left: pos.left,
      top: pos.top,
      right: pos.left + LOUNGE_DOCK_FAB_SIZE_PX,
      bottom: pos.top + LOUNGE_DOCK_FAB_SIZE_PX,
    }
    const liveObstacleInset = loungeDockFabCollisionBottomInsetPx(tentativeRect, height)
    if (liveObstacleInset > 0.5) {
      const totalInset = bottomObstaclePx + liveObstacleInset
      const adjustedBounds = loungeDockFabMoveBounds(width, height, LOUNGE_DOCK_FAB_SIZE_PX, totalInset)
      setFabPos(
        saved
          ? loungeDockFabPositionFromPct(saved.xPct, saved.yPct, adjustedBounds)
          : loungeDockFabDefaultPosition(width, height, LOUNGE_DOCK_FAB_SIZE_PX, totalInset),
      )
    } else {
      setFabPos(pos)
    }
  }, [viewport.width, viewport.height, bottomObstaclePx, fabObstacleCollisionEnabled])

  const measureCollisionRef = useRef(() => {})

  /** Nudge FAB up when a bottom obstacle (upload bar) appears under it - keeps Cancel tappable. */
  useEffect(() => {
    if (!fabObstacleCollisionEnabled) return
    const cur = fabPosRef.current
    if (!cur) return
    const next = loungeDockFabClampToBounds(cur.left, cur.top, fabMoveBounds)
    if (Math.abs(next.left - cur.left) < 0.5 && Math.abs(next.top - cur.top) < 0.5) return
    fabPosRef.current = next
    setFabPos(next)
    measureCollisionRef.current()
  }, [fabMoveBounds, totalBottomObstaclePx, fabObstacleCollisionEnabled])

  /**
   * Post/comment detail: restore saved FAB prefs when the shell opens so a prior keyboard
   * collision nudge cannot leave a permanently raised position.
   */
  useEffect(() => {
    const entered = fabDetailShellCompact && !fabDetailShellCompactPrevRef.current
    fabDetailShellCompactPrevRef.current = fabDetailShellCompact
    if (!entered) return
    setCollisionInsetPx(0)
    const { width, height } = viewport
    const bounds = loungeDockFabMoveBounds(width, height, LOUNGE_DOCK_FAB_SIZE_PX, bottomObstaclePx)
    const saved = readLoungeDockFabPrefs()
    const pos = saved
      ? loungeDockFabPositionFromPct(saved.xPct, saved.yPct, bounds)
      : loungeDockFabDefaultPosition(width, height, LOUNGE_DOCK_FAB_SIZE_PX, bottomObstaclePx)
    fabPosRef.current = pos
    setFabPos(pos)
  }, [fabDetailShellCompact, viewport.width, viewport.height, bottomObstaclePx])

  /** Push FAB up only when it overlaps marked UI (fixed bars or in-scroll controls) - not on post/comment detail. */
  useEffect(() => {
    if (!fabObstacleCollisionEnabled) {
      setCollisionInsetPx(0)
      measureCollisionRef.current = () => {}
      return undefined
    }

    const measureCollision = () => {
      const cur = fabPosRef.current
      if (!cur) {
        setCollisionInsetPx(0)
        return
      }
      const fabRect = {
        left: cur.left,
        top: cur.top,
        right: cur.left + LOUNGE_DOCK_FAB_SIZE_PX,
        bottom: cur.top + LOUNGE_DOCK_FAB_SIZE_PX,
      }
      const next = loungeDockFabCollisionBottomInsetPx(fabRect, window.innerHeight)
      setCollisionInsetPx((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
    }

    measureCollisionRef.current = measureCollision

    let scrollRaf = 0
    const measureCollisionOnScroll = () => {
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        measureCollision()
      })
    }

    measureCollision()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureCollision) : null
    const observeObstacles = () => {
      if (!ro) return
      ro.disconnect()
      document.querySelectorAll(LOUNGE_FAB_OBSTACLE_SELECTOR).forEach((el) => ro.observe(el))
    }
    observeObstacles()

    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            observeObstacles()
            measureCollision()
          })
        : null
    mo?.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('resize', measureCollision)
    window.addEventListener('scroll', measureCollisionOnScroll, true)
    const vv = window.visualViewport
    vv?.addEventListener('resize', measureCollision)
    vv?.addEventListener('scroll', measureCollisionOnScroll)

    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', measureCollision)
      window.removeEventListener('scroll', measureCollisionOnScroll, true)
      vv?.removeEventListener('resize', measureCollision)
      vv?.removeEventListener('scroll', measureCollisionOnScroll)
    }
  }, [bottomObstaclePx, fabObstacleCollisionEnabled])

  useEffect(() => {
    fabPosRef.current = fabPos
  }, [fabPos])

  useEffect(() => {
    repositioningRef.current = repositioning
  }, [repositioning])

  /** Detect following-filter toggle and show a "Following" / "Everyone" fizzle flash. */
  const followingFilterOnForFlash = useMemo(() => {
    const allItems = [...items, ...(cornerLItems ?? [])]
    return Boolean(allItems.find((it) => it.id === 'following')?.filterOnBorder)
  }, [items, cornerLItems])
  const prevFollowingFilterOnRef = useRef(/** @type {boolean | null} */ (null))
  useEffect(() => {
    const prev = prevFollowingFilterOnRef.current
    prevFollowingFilterOnRef.current = followingFilterOnForFlash
    if (prev === null) return // skip first mount
    if (prev === followingFilterOnForFlash) return
    window.clearTimeout(followingFlashTimerRef.current)
    setFollowingFlash({ label: followingFilterOnForFlash ? 'Only Frens' : 'Discover', key: Date.now() })
    followingFlashTimerRef.current = window.setTimeout(() => {
      followingFlashTimerRef.current = 0
      setFollowingFlash(null)
    }, 1850)
    return () => window.clearTimeout(followingFlashTimerRef.current)
  }, [followingFilterOnForFlash])

  useEffect(() => {
    if (!fabSelectionLock && !repositioning) return undefined

    clearDocumentTextSelection()

    const prevBodyUserSelect = document.body.style.userSelect
    const prevBodyWebkitUserSelect = document.body.style.webkitUserSelect
    const prevHtmlUserSelect = document.documentElement.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    document.documentElement.style.userSelect = 'none'

    const blockSelect = (e) => {
      e.preventDefault()
      clearDocumentTextSelection()
    }
    document.addEventListener('selectstart', blockSelect, true)
    document.addEventListener('dragstart', blockSelect, true)

    return () => {
      document.body.style.userSelect = prevBodyUserSelect
      document.body.style.webkitUserSelect = prevBodyWebkitUserSelect
      document.documentElement.style.userSelect = prevHtmlUserSelect
      document.removeEventListener('selectstart', blockSelect, true)
      document.removeEventListener('dragstart', blockSelect, true)
    }
  }, [fabSelectionLock, repositioning])

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const prev = notificationsUnreadPrevRef.current
    if (notificationsUnreadCount === 0) {
      setFabNotifBadgeDismissed(false)
    } else if (notificationsUnreadCount > prev && !openRef.current) {
      setFabNotifBadgeDismissed(false)
    }
    notificationsUnreadPrevRef.current = notificationsUnreadCount
  }, [notificationsUnreadCount])

  useEffect(() => {
    if (!open) backdropGestureRef.current = null
  }, [open])

  const syncPointerBlock = useCallback(() => {
    onPointerBlockChange?.(Boolean(openRef.current || pointerGuardRef.current))
  }, [onPointerBlockChange])

  useEffect(() => {
    syncPointerBlock()
  }, [open, syncPointerBlock])

  const armPointerGuard = useCallback(
    (durationMs = POINTER_GUARD_MS) => {
      pointerGuardRef.current = true
      setClickShield(true)
      syncPointerBlock()
      if (pointerGuardTimerRef.current) window.clearTimeout(pointerGuardTimerRef.current)
      pointerGuardTimerRef.current = window.setTimeout(() => {
        pointerGuardTimerRef.current = 0
        pointerGuardRef.current = false
        setClickShield(false)
        syncPointerBlock()
      }, durationMs)
    },
    [syncPointerBlock],
  )

  const clearRepositionCapture = useCallback(() => {
    repositionCaptureCleanupRef.current?.()
    repositionCaptureCleanupRef.current = null
  }, [])

  const armRepositionClickGuard = useCallback(() => {
    suppressFabClickRef.current = true
    clearRepositionCapture()

    const blockCapture = (e) => blockPointerEvent(e)
    REPOSITION_CAPTURE_EVENT_TYPES.forEach((type) => {
      document.addEventListener(type, blockCapture, true)
    })

    const suppressTimer = window.setTimeout(() => {
      suppressFabClickRef.current = false
    }, REPOSITION_POINTER_GUARD_MS)

    repositionCaptureCleanupRef.current = () => {
      REPOSITION_CAPTURE_EVENT_TYPES.forEach((type) => {
        document.removeEventListener(type, blockCapture, true)
      })
      window.clearTimeout(suppressTimer)
    }

    window.setTimeout(() => {
      clearRepositionCapture()
    }, REPOSITION_POINTER_GUARD_MS)

    armPointerGuard(REPOSITION_POINTER_GUARD_MS)
  }, [armPointerGuard, clearRepositionCapture])

  useEffect(() => {
    carouselRotationRef.current = carouselRotation
  }, [carouselRotation])

  const fabCenterX = fabPos ? fabPos.left + LOUNGE_DOCK_FAB_SIZE_PX / 2 : null
  const fabCenterY = fabPos ? fabPos.top + LOUNGE_DOCK_FAB_SIZE_PX / 2 : null
  const fabCompactAlignLeft = fabCenterX != null && fabCenterX < viewport.width / 2
  const fabCompactActive = enableFabCompactPip && fabCompactPip

  /** Visual position only - compact pip snaps to corner without mutating saved prefs. */
  const fabRenderPos = useMemo(() => {
    if (!fabPos) return null
    if (!fabCompactActive || open || repositioning) return fabPos
    /** Edge L on detail shell: shrink at the corner slot, no flight. */
    if (fabDetailShellCompact && isCornerL) return fabPos
    return loungeDockFabCornerPosition(
      viewport.width,
      viewport.height,
      LOUNGE_DOCK_FAB_SIZE_PX,
      fabCompactAlignLeft,
      totalBottomObstaclePx,
      fabDetailShellCompact ? { raised: true } : undefined,
    )
  }, [
    fabPos,
    fabCompactActive,
    open,
    repositioning,
    fabDetailShellCompact,
    isCornerL,
    fabCompactAlignLeft,
    viewport.width,
    viewport.height,
    totalBottomObstaclePx,
  ])

  const fabShowCompactScale = (fabCompactActive && !open) || Boolean(fabExpandFromPip)
  const fabHostCompactScale = fabShowCompactScale
    ? FAB_COMPACT_VISUAL_PX / LOUNGE_DOCK_FAB_SIZE_PX
    : 1
  const fabDisplayPos = fabExpandFromPip?.cornerPos ?? fabRenderPos

  /** Dock item anchor - compact pip uses visual center (corner scale origin), not box center. */
  const fabDockAnchor = useMemo(() => {
    if (fabCompactActive && fabRenderPos) {
      return loungeDockCompactPipFabVisualCenter(fabRenderPos, fabCompactAlignLeft)
    }
    if (fabCenterX == null || fabCenterY == null) return null
    return { x: fabCenterX, y: fabCenterY }
  }, [fabCompactActive, fabRenderPos, fabCompactAlignLeft, fabCenterX, fabCenterY])

  /** Ordered list for the active menu layout (wheel vs Edge L can differ). Home stays index 0 after normalization. */
  const dockItems = useMemo(() => {
    const source =
      isCornerL && Array.isArray(cornerLItems) && cornerLItems.length > 0 ? cornerLItems : items
    const home = source.find((item) => item.id === HOME_ITEM_ID)
    const rest = source.filter((item) => item.id !== HOME_ITEM_ID)
    return home ? [home, ...rest] : source
  }, [isCornerL, items, cornerLItems])

  const wheelLayout = useMemo(() => {
    if (fabCenterX == null || fabCenterY == null || dockItems.length === 0) {
      return {
        offsets: [],
        radius: 0,
        pickerAngle: 0,
        focusedIndex: 0,
        step: 0,
        homeAnchorAngle: 0,
        spinEnabled: false,
      }
    }
    const itemRadius = LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX / 2
    const alignLeft = fabCenterX < viewport.width / 2
    if (isCornerL) {
      return {
        offsets: loungeDockLShapeOffsets(dockItems.length, alignLeft),
        radius: LOUNGE_DOCK_CAROUSEL_RADIUS_PX,
        pickerAngle: 0,
        focusedIndex: 0,
        step: 0,
        homeAnchorAngle: 0,
        spinEnabled: false,
      }
    }
    return loungeDockWheelLayout(
      fabCenterX,
      fabCenterY,
      dockItems.length,
      carouselRotation,
      viewport,
      itemRadius,
    )
  }, [
    fabCenterX,
    fabCenterY,
    dockItems.length,
    carouselRotation,
    viewport.width,
    viewport.height,
    isCornerL,
  ])

  const spinEnabled = open && wheelLayout.spinEnabled && !isCornerL

  const spinHitRadiusPx =
    wheelLayout.radius > 0
      ? wheelLayout.radius + LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX + LOUNGE_DOCK_FAB_SIZE_PX / 2
      : 120

  const persistFabPrefs = useCallback(
    (pos) => {
      if (!pos) return
      const pct = loungeDockFabPctFromPosition(pos.left, pos.top, fabMoveBounds)
      writeLoungeDockFabPrefs({ ...pct, locked: true })
    },
    [fabMoveBounds],
  )

  /** When using L layout, snap FAB to bottom corner for the screen half (preferences / resize / mode switch). */
  useEffect(() => {
    if (!isCornerL) return
    const cur = fabPosRef.current
    if (!cur) return
    const cx = cur.left + LOUNGE_DOCK_FAB_SIZE_PX / 2
    const alignLeft = cx < viewport.width / 2
    const pos = loungeDockFabCornerPosition(
      viewport.width,
      viewport.height,
      LOUNGE_DOCK_FAB_SIZE_PX,
      alignLeft,
      bottomObstaclePx,
      { raised: true },
    )
    if (Math.abs(pos.left - cur.left) < 0.5 && Math.abs(pos.top - cur.top) < 0.5) return
    fabPosRef.current = pos
    setFabPos(pos)
    persistFabPrefs(pos)
  }, [isCornerL, viewport.width, viewport.height, bottomObstaclePx, persistFabPrefs])

  const clearFabLongPressProgress = useCallback(() => {
    if (longPressRafRef.current) {
      cancelAnimationFrame(longPressRafRef.current)
      longPressRafRef.current = 0
    }
    setFabLongPressProgress(0)
    setFabLongPressRingsActive(false)
    setFabLongPressRings(
      Array.from({ length: FAB_LONG_PRESS_RING_COUNT }, () => hiddenFabLongPressRing()),
    )
  }, [])

  const startFabLongPressProgress = useCallback(() => {
    if (longPressRafRef.current) {
      cancelAnimationFrame(longPressRafRef.current)
      longPressRafRef.current = 0
    }
    longPressStartedAtRef.current = performance.now()
    setFabLongPressRingsActive(true)
    const tick = () => {
      const holding = longPressArmedRef.current || repositioningRef.current
      if (!holding) {
        longPressRafRef.current = 0
        setFabLongPressProgress(0)
        setFabLongPressRingsActive(false)
        setFabLongPressRings(
          Array.from({ length: FAB_LONG_PRESS_RING_COUNT }, () => hiddenFabLongPressRing()),
        )
        return
      }
      const elapsed = performance.now() - longPressStartedAtRef.current
      setFabLongPressProgress(Math.min(1, elapsed / FAB_REPOSITION_LONG_PRESS_MS))
      setFabLongPressRings(fabLongPressRingStatesFromElapsed(elapsed, LOUNGE_DOCK_FAB_SIZE_PX))
      longPressRafRef.current = requestAnimationFrame(tick)
    }
    longPressRafRef.current = requestAnimationFrame(tick)
  }, [])

  const cancelFabLongPress = useCallback(() => {
    longPressArmedRef.current = false
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = 0
    }
    clearFabLongPressProgress()
  }, [clearFabLongPressProgress])

  const endFabReposition = useCallback(() => {
    cancelFabLongPress()
    repositioningRef.current = false
    setRepositioning(false)
  }, [cancelFabLongPress])

  const clearFabIdleTimer = useCallback(() => {
    if (fabIdleTimerRef.current) {
      window.clearTimeout(fabIdleTimerRef.current)
      fabIdleTimerRef.current = 0
    }
  }, [])

  const clearFabCompactTimer = useCallback(() => {
    if (fabCompactTimerRef.current) {
      window.clearTimeout(fabCompactTimerRef.current)
      fabCompactTimerRef.current = 0
    }
  }, [])

  const armFabIdleTimer = useCallback(() => {
    clearFabIdleTimer()
    fabIdleTimerRef.current = window.setTimeout(() => {
      fabIdleTimerRef.current = 0
      setFabIdleDimmed(true)
    }, FAB_IDLE_DIM_MS)
  }, [clearFabIdleTimer])

  const armFabCompactTimer = useCallback(() => {
    if (!enableFabCompactPip) return
    clearFabCompactTimer()
    fabCompactTimerRef.current = window.setTimeout(() => {
      fabCompactTimerRef.current = 0
      setFabCompactPip(true)
    }, FAB_COMPACT_PIP_MS)
  }, [clearFabCompactTimer, enableFabCompactPip])

  useEffect(() => {
    fabCompactPipRef.current = fabCompactPip
  }, [fabCompactPip])

  /** Post / comment detail: start full-size, then arm the standard 3s compact timer. */
  useEffect(() => {
    if (!fabDetailShellCompact) return undefined
    setFabCompactPip(false)
    clearFabCompactTimer()
    if (!open && !repositioning) {
      armFabCompactTimer()
    }
    return () => clearFabCompactTimer()
  }, [fabDetailShellCompact, open, repositioning, armFabCompactTimer, clearFabCompactTimer])

  useEffect(() => {
    if (fabDetailShellCompact) return
    setFabCompactPip(false)
  }, [fabDetailShellCompact])

  useEffect(() => {
    if (!open) {
      setFabExpandFromPip(null)
      setPipWheelItemsDeferred(false)
    }
  }, [open])

  useEffect(() => {
    if (!pipWheelItemsDeferred || fabExpandFromPip) return undefined
    const t = window.setTimeout(() => {
      setPipWheelItemsDeferred(false)
    }, LOUNGE_DOCK_FAB_PIP_WHEEL_REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [fabExpandFromPip, pipWheelItemsDeferred])

  useEffect(() => {
    if (!fabExpandFromPip) return undefined
    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setFabExpandFromPip(null)
      })
    })
    const t = window.setTimeout(() => {
      if (!cancelled) setFabExpandFromPip(null)
    }, LOUNGE_DOCK_HOME_MORPH_MS + 40)
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
      window.clearTimeout(t)
    }
  }, [fabExpandFromPip])

  const wakeFabFromIdle = useCallback(({ clearCompactPip = true } = {}) => {
    if (clearCompactPip) setFabCompactPip(false)
    if (fabIdleDimmedRef.current) {
      setFabWakePop(true)
      if (fabWakePopTimerRef.current) window.clearTimeout(fabWakePopTimerRef.current)
      fabWakePopTimerRef.current = window.setTimeout(() => {
        fabWakePopTimerRef.current = 0
        setFabWakePop(false)
      }, 320)
    }
    setFabIdleDimmed(false)
    armFabCompactTimer()
    armFabIdleTimer()
  }, [armFabCompactTimer, armFabIdleTimer])

  const fabVisible = reveal > FAB_REVEAL_VISIBLE
  /** Scroll-linked title bar: FAB + home chip fade with `reveal` (feed, panels, away-from-feed). */
  const fabEffectivelyVisible = fabVisible
  const fabScrollOpacity = clamp(reveal, 0, 1)
  const fabDisplayOpacity =
    fabScrollOpacity *
    (fabIdleDimmed && fabVisible && !open && !repositioning ? FAB_IDLE_DIM_OPACITY : 1)

  useEffect(() => {
    fabIdleDimmedRef.current = fabIdleDimmed
  }, [fabIdleDimmed])

  useEffect(() => {
    if (open || repositioning) {
      clearFabIdleTimer()
      clearFabCompactTimer()
      setFabIdleDimmed(false)
      setFabCompactPip(false)
      setFabWakePop(false)
      return undefined
    }
    if (!fabVisible) {
      clearFabIdleTimer()
      clearFabCompactTimer()
      setFabIdleDimmed(false)
      setFabWakePop(false)
      /** Keep armed pip while scroll-hidden so scroll-up restores corner pip without re-idling. */
      if (!enableFabCompactPip || !fabCompactPipRef.current) {
        setFabCompactPip(false)
      }
      return undefined
    }
    /** Scroll / reveal changes count as activity - reset dim and restart idle clocks. */
    setFabIdleDimmed(false)
    if (!fabCompactPipRef.current) {
      setFabCompactPip(false)
      if (enableFabCompactPip) armFabCompactTimer()
    }
    armFabIdleTimer()
    return () => {
      clearFabIdleTimer()
      clearFabCompactTimer()
    }
  }, [
    fabVisible,
    open,
    repositioning,
    reveal,
    enableFabCompactPip,
    armFabIdleTimer,
    armFabCompactTimer,
    clearFabIdleTimer,
    clearFabCompactTimer,
  ])

  useEffect(() => {
    if (enableFabCompactPip) return
    clearFabCompactTimer()
    setFabCompactPip(false)
  }, [enableFabCompactPip, clearFabCompactTimer])

  useEffect(
    () => () => {
      if (pointerGuardTimerRef.current) window.clearTimeout(pointerGuardTimerRef.current)
      clearRepositionCapture()
      cancelFabLongPress()
      clearFabLongPressProgress()
      clearFabIdleTimer()
      clearFabCompactTimer()
      if (fabWakePopTimerRef.current) window.clearTimeout(fabWakePopTimerRef.current)
    },
    [
      cancelFabLongPress,
      clearFabLongPressProgress,
      clearFabIdleTimer,
      clearFabCompactTimer,
      clearRepositionCapture,
    ],
  )

  const snapCarouselToPicker = useCallback(
    (rotation) => {
      if (fabCenterX == null || fabCenterY == null || dockItems.length === 0) return rotation
      const itemRadius = LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX / 2
      const layout = loungeDockWheelLayout(
        fabCenterX,
        fabCenterY,
        dockItems.length,
        rotation,
        viewport,
        itemRadius,
      )
      return loungeDockCarouselSnapRotation(
        layout.focusedIndex,
        layout.step,
        layout.pickerAngle,
        layout.homeAnchorAngle,
      )
    },
    [dockItems.length, viewport.width, viewport.height, fabCenterX, fabCenterY],
  )

  const applyCarouselSnap = useCallback(
    (rotation) => {
      const snapped = snapCarouselToPicker(rotation)
      if (Math.abs(snapped - carouselRotationRef.current) < 1e-6) return
      carouselRotationRef.current = snapped
      setCarouselRotation(snapped)
    },
    [snapCarouselToPicker],
  )

  /** Rotation 0 → home (index 0) sits at left/right anchor from FAB screen half. */
  const resetWheelToHomeAnchor = useCallback(() => {
    carouselRotationRef.current = 0
    setCarouselRotation(0)
  }, [])

  useEffect(() => {
    spinEnabledRef.current = spinEnabled
  }, [spinEnabled])

  useEffect(() => {
    if (!open || spinEnabled) return
    resetWheelToHomeAnchor()
  }, [open, spinEnabled, resetWheelToHomeAnchor])

  useEffect(() => {
    if (!open) resetWheelToHomeAnchor()
  }, [open, resetWheelToHomeAnchor])

  useEffect(() => {
    setOpen(false)
    resetWheelToHomeAnchor()
  }, [panelChrome, resetWheelToHomeAnchor])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (reveal > FAB_REVEAL_VISIBLE) return
    setOpen(false)
  }, [reveal])

  const clampFabPos = useCallback(
    (left, top) => loungeDockFabClampToBounds(left, top, fabMoveBounds),
    [fabMoveBounds],
  )

  /** After long-press reposition, snap FAB to the bottom-left or bottom-right corner for the drop side (half-width). */
  const snapFabToBottomCornerForDropSide = useCallback(() => {
    const cur = fabPosRef.current
    if (!cur) return
    const cx = cur.left + LOUNGE_DOCK_FAB_SIZE_PX / 2
    const alignLeft = cx < viewport.width / 2
    const pos = loungeDockFabCornerPosition(
      viewport.width,
      viewport.height,
      LOUNGE_DOCK_FAB_SIZE_PX,
      alignLeft,
      totalBottomObstaclePx,
      { raised: true },
    )
    fabPosRef.current = pos
    setFabPos(pos)
  }, [viewport.width, viewport.height, totalBottomObstaclePx])

  const onFabPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return
      pipWasCompactRef.current = enableFabCompactPip && fabCompactPipRef.current
      wakeFabFromIdle({ clearCompactPip: false })
      fabDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originLeft: fabPosRef.current?.left ?? 0,
        originTop: fabPosRef.current?.top ?? 0,
        dragging: false,
      }
      cancelFabLongPress()
      longPressArmedRef.current = true
      startFabLongPressProgress()
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = 0
        if (!longPressArmedRef.current) return
        clearDocumentTextSelection()
        setFabExpandFromPip(null)
        setFabCompactPip(false)
        repositioningRef.current = true
        setRepositioning(true)
      }, FAB_REPOSITION_LONG_PRESS_MS)
      setFabSelectionLock(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [cancelFabLongPress, startFabLongPressProgress, wakeFabFromIdle],
  )

  const onFabPointerMove = useCallback(
    (e) => {
      const drag = fabDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (!drag.dragging) {
        if (!repositioningRef.current) {
          if (longPressArmedRef.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
            cancelFabLongPress()
          }
          return
        }
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        drag.dragging = true
        clearDocumentTextSelection()
      }

      if (repositioningRef.current) e.preventDefault()

      const next = clampFabPos(drag.originLeft + dx, drag.originTop + dy)
      fabPosRef.current = next
      setFabPos(next)
    },
    [clampFabPos, cancelFabLongPress],
  )

  const onFabPointerUp = useCallback(
    (e) => {
      const drag = fabDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      fabDragRef.current = null
      setFabSelectionLock(false)
      clearDocumentTextSelection()

      if (drag.dragging && repositioningRef.current) {
        e.preventDefault()
        e.stopPropagation()
        armRepositionClickGuard()
        if (isCornerL) snapFabToBottomCornerForDropSide()
        persistFabPrefs(fabPosRef.current)
        endFabReposition()
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        return
      }

      const wasRepositionGesture = repositioningRef.current
      if (wasRepositionGesture) {
        e.preventDefault()
        e.stopPropagation()
        armRepositionClickGuard()
        endFabReposition()
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        return
      }
      endFabReposition()

      if (!fabEffectivelyVisible) return
      if (openRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        return
      }
      if (isCornerL) {
        const cur = fabPosRef.current
        if (cur) {
          const cx = cur.left + LOUNGE_DOCK_FAB_SIZE_PX / 2
          const alignLeft = cx < viewport.width / 2
          const pos = loungeDockFabCornerPosition(
            viewport.width,
            viewport.height,
            LOUNGE_DOCK_FAB_SIZE_PX,
            alignLeft,
            totalBottomObstaclePx,
            { raised: true },
          )
          fabPosRef.current = pos
          setFabPos(pos)
          persistFabPrefs(pos)
        }
      }
      resetWheelToHomeAnchor()
      if (pipWasCompactRef.current && fabPosRef.current) {
        const cur = fabPosRef.current
        const cx = cur.left + LOUNGE_DOCK_FAB_SIZE_PX / 2
        const alignLeft = cx < viewport.width / 2
        if (fabDetailShellCompact && isCornerL) {
          setFabExpandFromPip({
            cornerPos: cur,
            anchor: loungeDockCompactPipFabVisualCenter(cur, alignLeft),
            alignLeft,
          })
        } else {
          const cornerPos = loungeDockFabCornerPosition(
            viewport.width,
            viewport.height,
            LOUNGE_DOCK_FAB_SIZE_PX,
            alignLeft,
            totalBottomObstaclePx,
            fabDetailShellCompact ? { raised: true } : undefined,
          )
          setFabExpandFromPip({
            cornerPos,
            anchor: loungeDockCompactPipFabVisualCenter(cornerPos, alignLeft),
            alignLeft,
          })
        }
        setPipWheelItemsDeferred(true)
      }
      pipWasCompactRef.current = false
      setFabCompactPip(false)
      expandMenu()
    },
    [
      persistFabPrefs,
      fabEffectivelyVisible,
      resetWheelToHomeAnchor,
      endFabReposition,
      armRepositionClickGuard,
      isCornerL,
      viewport.width,
      viewport.height,
      snapFabToBottomCornerForDropSide,
      totalBottomObstaclePx,
      expandMenu,
      enableFabCompactPip,
      fabDetailShellCompact,
      isCornerL,
    ],
  )

  const onFabPointerCancel = useCallback(
    (e) => {
      const drag = fabDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      setFabSelectionLock(false)
      clearDocumentTextSelection()
      if (drag.dragging && repositioningRef.current) {
        armRepositionClickGuard()
        if (isCornerL) snapFabToBottomCornerForDropSide()
        persistFabPrefs(fabPosRef.current)
      } else if (repositioningRef.current) {
        armRepositionClickGuard()
      }
      endFabReposition()
      fabDragRef.current = null
    },
    [
      persistFabPrefs,
      endFabReposition,
      armRepositionClickGuard,
      snapFabToBottomCornerForDropSide,
      isCornerL,
    ],
  )

  const beginSpinGesture = useCallback(
    (e) => {
      if (
        !openRef.current ||
        !spinEnabledRef.current ||
        fabCenterX == null ||
        fabCenterY == null ||
        e.button !== 0
      )
        return false
      spinMovedRef.current = false
      spinRef.current = {
        pointerId: e.pointerId,
        startPointerAngle: angleFromPointer(fabCenterX, fabCenterY, e.clientX, e.clientY),
        startRotation: carouselRotationRef.current,
      }
      setSpinning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      return true
    },
    [fabCenterX, fabCenterY],
  )

  const onSpinPointerDown = useCallback(
    (e) => {
      e.stopPropagation()
      beginSpinGesture(e)
    },
    [beginSpinGesture],
  )

  const onSpinPointerMove = useCallback(
    (e) => {
      const spin = spinRef.current
      if (!spin || spin.pointerId !== e.pointerId || fabCenterX == null || fabCenterY == null) return
      try {
        e.preventDefault()
      } catch {
        /* passive listener on some hosts */
      }
      const cur = angleFromPointer(fabCenterX, fabCenterY, e.clientX, e.clientY)
      let delta = cur - spin.startPointerAngle
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      if (Math.abs(delta) > SPIN_TAP_SLOP_RAD) spinMovedRef.current = true
      const next = spin.startRotation + delta
      carouselRotationRef.current = next
      setCarouselRotation(next)
    },
    [fabCenterX, fabCenterY],
  )

  const endSpin = useCallback(
    (pointerId) => {
      const spin = spinRef.current
      if (!spin || spin.pointerId !== pointerId) return false
      spinRef.current = null
      setSpinning(false)
      applyCarouselSnap(carouselRotationRef.current)
      return true
    },
    [applyCarouselSnap],
  )

  const onSpinPointerEnd = useCallback(
    (pointerId) => {
      endSpin(pointerId)
    },
    [endSpin],
  )

  const onSpinWheel = useCallback(
    (e) => {
      if (!openRef.current || !spinEnabledRef.current) return
      e.preventDefault()
      e.stopPropagation()
      spinMovedRef.current = true
      const next = carouselRotationRef.current + e.deltaY * SPIN_WHEEL_SENSITIVITY
      carouselRotationRef.current = next
      setCarouselRotation(next)
    },
    [],
  )

  useEffect(() => {
    if (!open || !spinEnabled) return undefined
    const onWheel = (e) => onSpinWheel(e)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [open, spinEnabled, onSpinWheel])

  useEffect(() => {
    if (!spinning || typeof document === 'undefined') return undefined
    const block = (e) => {
      e.preventDefault()
    }
    document.addEventListener('touchmove', block, { passive: false, capture: true })
    return () => document.removeEventListener('touchmove', block, { capture: true })
  }, [spinning])

  useEffect(() => {
    if (!open || !spinEnabled) return undefined
    let wheelSnapTimer = null
    const onWheelEnd = () => {
      if (wheelSnapTimer) clearTimeout(wheelSnapTimer)
      wheelSnapTimer = setTimeout(() => {
        if (openRef.current && spinEnabledRef.current && spinRef.current == null) {
          applyCarouselSnap(carouselRotationRef.current)
        }
      }, 120)
    }
    window.addEventListener('wheel', onWheelEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheelEnd)
      if (wheelSnapTimer) clearTimeout(wheelSnapTimer)
    }
  }, [open, spinEnabled, applyCarouselSnap])

  const selectItem = useCallback(
    (item) => {
      if (item.disabled) return
      /** Close menu first so feed is not `pointer-events: none` during focus (iOS keyboard). */
      flushSync(() => {
        setOpen(false)
      })
      item.onSelect?.()
      armPointerGuard()
    },
    [armPointerGuard],
  )

  const menuExpanded = open

  const onItemPointerDown = useCallback(
    (e) => {
      if (!openRef.current) return
      e.preventDefault()
      e.stopPropagation()
      beginSpinGesture(e)
    },
    [beginSpinGesture],
  )

  const onItemPointerEnd = useCallback(
    (item, e) => {
      e.preventDefault()
      e.stopPropagation()
      const moved = spinMovedRef.current
      onSpinPointerEnd(e.pointerId)
      /** Any visible chip is tappable in spin mode; `offset.onScreen` is layout bookkeeping, not a tap gate. */
      if (!moved && !item.disabled) selectItem(item)
    },
    [onSpinPointerEnd, selectItem],
  )

  const blockPointerDefault = useCallback((e) => {
    blockPointerEvent(e)
  }, [])

  const armBackdropTapClickTrap = useCallback(() => {
    const trap = (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      ev.stopImmediatePropagation?.()
    }
    window.addEventListener('click', trap, { capture: true, once: true })
  }, [])

  const onBackdropPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    backdropGestureRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    }
    try {
      if (e.currentTarget instanceof Element) {
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const onBackdropPointerMove = useCallback((e) => {
    const g = backdropGestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.hypot(dx, dy) < BACKDROP_PAN_THRESHOLD_PX) return
    backdropGestureRef.current = null
    try {
      if (e.currentTarget instanceof Element) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      setOpen(false)
    })
  }, [])

  const onBackdropPointerUp = useCallback(
    (e) => {
      const g = backdropGestureRef.current
      if (!g || g.pointerId !== e.pointerId) return
      backdropGestureRef.current = null
      try {
        if (e.currentTarget instanceof Element) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        /* ignore */
      }
      e.preventDefault()
      e.stopPropagation()
      armBackdropTapClickTrap()
      flushSync(() => {
        setOpen(false)
      })
    },
    [armBackdropTapClickTrap],
  )

  const onBackdropPointerCancel = useCallback((e) => {
    const g = backdropGestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    backdropGestureRef.current = null
    try {
      if (e.currentTarget instanceof Element) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
    flushSync(() => {
      setOpen(false)
    })
  }, [])

  /** Panel screens: home chip beside FAB (menu collapsed) - tap only, no spin. */
  const onCompactItemTap = useCallback(
    (item, e) => {
      blockPointerDefault(e)
      if (!item.disabled) selectItem(item)
    },
    [blockPointerDefault, selectItem],
  )

  const visibleWheelItems = useMemo(() => {
    if (!menuExpanded && panelCompactChrome && dockItems.length > 0) {
      return dockItems.slice(0, 1)
    }
    if (menuExpanded) return dockItems
    return []
  }, [menuExpanded, panelCompactChrome, dockItems])

  if (items.length === 0 || !fabPos || fabCenterX == null || fabCenterY == null) return null

  const fabCompactScaleOriginClass = fabShowCompactScale
    ? (fabExpandFromPip?.alignLeft ?? fabCompactAlignLeft)
      ? 'origin-bottom-left'
      : 'origin-bottom-right'
    : ''

  const dockLayerZIndex = stackAboveDetailOrProfile
    ? Z_LOUNGE_DOCK_ABOVE_DETAIL_PROFILE
    : stackAboveSlidePanel
      ? Z_LOUNGE_DOCK_ABOVE_SLIDE_PANEL
      : Z_LOUNGE_DOCK_VIEWPORT

  const pickerOffset =
    menuExpanded && spinEnabled
      ? (wheelLayout.offsets[wheelLayout.focusedIndex] ?? { x: 0, y: 0 })
      : { x: 0, y: 0 }

  const renderMenuItem = (item, offset, {
    isFocused = false,
    offScreen = false,
    /** Panel chrome: smoother home slide between compact side offset and full menu slot. */
    panelChromeHomeAnim = false,
  } = {}) => {
    const wheelOpen = menuExpanded
    const compactChip = panelCompactChrome && !menuExpanded
    const pipExpandHome = Boolean(fabExpandFromPip && item.id === HOME_ITEM_ID)
    const compactPipChip = (compactChip && fabCompactActive) || pipExpandHome
    const dockCenterX = pipExpandHome
      ? fabExpandFromPip.anchor.x
      : compactPipChip && fabCompactActive
        ? fabDockAnchor.x
        : fabCenterX
    const dockCenterY = pipExpandHome
      ? fabExpandFromPip.anchor.y
      : compactPipChip && fabCompactActive
        ? fabDockAnchor.y
        : fabCenterY
    const wheelTapOnly = wheelOpen && !spinEnabled
    const wheelSpin = wheelOpen && spinEnabled
    const wheelItemDeferred =
      pipWheelItemsDeferred && wheelOpen && item.id !== HOME_ITEM_ID
    /** Panel chrome: home chip fades with scroll-linked `reveal` like the FAB. */
    const fadesWithReveal = compactChip
    const pageActive = Boolean(item.active)
    const glow = loungeDockItemGlowForDisplay(
      pageActive ? NEON_BLUE_ITEM_GLOW_PAGE_ACTIVE : NEON_BLUE_ITEM_GLOW_IDLE,
    )
    const useLitChrome = pageActive || isFocused
    const chromeBorder = pageActive
      ? glow.borderLit
      : item.filterOnBorder
        ? LOUNGE_DOCK_BORDER_FILTER_ON
        : useLitChrome
          ? glow.borderLit
          : glow.borderIdle
    return (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled}
      aria-label={item.label}
      title={item.label}
      onPointerDown={
        wheelSpin ? onItemPointerDown : wheelTapOnly || compactChip ? blockPointerDefault : undefined
      }
      onPointerMove={wheelSpin ? onSpinPointerMove : undefined}
      onPointerUp={
        wheelSpin
          ? (e) => onItemPointerEnd(item, e)
          : wheelTapOnly || compactChip
            ? (e) => onCompactItemTap(item, e)
            : undefined
      }
      onPointerCancel={
        wheelSpin
          ? (e) => onItemPointerEnd(item, e)
          : wheelTapOnly || compactChip
            ? (e) => onCompactItemTap(item, e)
            : undefined
      }
      onClick={
        wheelOpen || compactChip
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
            }
          : undefined
      }
      className={`pointer-events-auto fixed flex select-none ${
        !isCornerL && wheelOpen
          ? 'min-h-[56px] min-w-[56px]'
          : 'min-h-[50px] min-w-[50px]'
      } ${compactPipChip ? '' : '-translate-x-1/2 -translate-y-1/2'} items-center justify-center ${
        wheelSpin ? 'touch-none' : 'touch-manipulation'
      } ${
        wheelSpin
          ? offScreen
            ? 'cursor-grab opacity-30'
            : 'cursor-grab opacity-100'
          : wheelItemDeferred
            ? 'cursor-pointer opacity-0'
            : 'cursor-pointer opacity-100'
      } ${spinning ? 'cursor-grabbing' : ''} disabled:cursor-not-allowed ${glow.textIdle} ${
        spinning
          ? ''
          : fadesWithReveal || wheelItemDeferred
            ? 'transition-[left,top,opacity,transform] duration-300 ease-out'
            : panelChromeHomeAnim || pipExpandHome
              ? ''
              : 'transition-[left,top,opacity] duration-200 ease-out'
      }`}
      ref={item.id === 'following' ? (el) => {
        if (el) followingItemCenterRef.current = { x: fabCenterX + offset.x, y: fabCenterY + offset.y }
      } : undefined}
      style={{
        left: dockCenterX + offset.x,
        top: dockCenterY + offset.y,
        transform: compactPipChip
          ? `translate(-50%, -50%) scale(${fabHostCompactScale})`
          : undefined,
        transition:
          spinning || (!panelChromeHomeAnim && !pipExpandHome)
            ? compactPipChip && !pipExpandHome
              ? 'left 300ms ease-out, top 300ms ease-out, opacity 280ms ease-out, transform 300ms ease-out'
              : undefined
            : `left ${LOUNGE_DOCK_HOME_MORPH_MS}ms ${LOUNGE_DOCK_HOME_MORPH_EASING}, top ${LOUNGE_DOCK_HOME_MORPH_MS}ms ${LOUNGE_DOCK_HOME_MORPH_EASING}, opacity 280ms ease-out, transform ${LOUNGE_DOCK_HOME_MORPH_MS}ms ${LOUNGE_DOCK_HOME_MORPH_EASING}`,
        zIndex: isCornerL
          ? isFocused
            ? 42
            : 30
          : menuExpanded && !compactChip
            ? 55
            : isFocused
              ? 44
              : 34,
        opacity: wheelItemDeferred ? 0 : fadesWithReveal ? fabDisplayOpacity : 1,
        pointerEvents:
          wheelItemDeferred || (fadesWithReveal && !fabEffectivelyVisible) ? 'none' : undefined,
      }}
    >
      <span
        className={`lounge-dock-item-circle relative flex items-center justify-center rounded-full backdrop-blur-sm ${chromeBorder} ${
          useLitChrome
            ? `${glow.bgLit} ${glow.ringLit} ${glow.shadowLit}`
            : `${glow.bgIdle} ${glow.shadowIdle}`
        }`}
        style={{
          width: LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX,
          height: LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX,
          ...(item.filterOnBorder ? { backgroundColor: 'white' } : {}),
        }}
      >
        <span
          className="flex items-center justify-center"
          style={{
            width: Math.round(ITEM_ICON_PX * (item.iconScale ?? 1)),
            height: Math.round(ITEM_ICON_PX * (item.iconScale ?? 1)),
          }}
        >
          {item.icon}
        </span>
        {item.badgeCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fd262d] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-zinc-950"
            aria-hidden
          >
            {item.badgeCount > 99 ? '99+' : item.badgeCount}
          </span>
        ) : null}
      </span>
    </button>
    )
  }

  const dockLayer = (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: dockLayerZIndex }}
    >
      {clickShield ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-auto fixed inset-0 z-[200] cursor-default bg-transparent [-webkit-tap-highlight-color:transparent]"
          style={{ touchAction: 'none' }}
          onPointerDown={blockPointerDefault}
          onPointerUp={blockPointerDefault}
          onClick={blockPointerDefault}
        />
      ) : null}

      {menuExpanded && fabVisible ? (
        <button
          type="button"
          className="lounge-dock-backdrop pointer-events-auto fixed inset-0 z-[5] bg-black/35 backdrop-blur-[2px] [-webkit-tap-highlight-color:transparent]"
          aria-label="Close menu"
          onPointerDown={onBackdropPointerDown}
          onPointerMove={onBackdropPointerMove}
          onPointerUp={onBackdropPointerUp}
          onPointerCancel={onBackdropPointerCancel}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        />
      ) : null}

      {menuExpanded && fabVisible && spinEnabled && !pipWheelItemsDeferred ? (
        <div
          role="presentation"
          aria-hidden
          className={`pointer-events-auto fixed z-[8] touch-none select-none rounded-full ${
            spinning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            left: fabCenterX - spinHitRadiusPx,
            top: fabCenterY - spinHitRadiusPx,
            width: spinHitRadiusPx * 2,
            height: spinHitRadiusPx * 2,
            touchAction: 'none',
          }}
          onPointerDown={onSpinPointerDown}
          onPointerMove={onSpinPointerMove}
          onPointerUp={(e) => onSpinPointerEnd(e.pointerId)}
          onPointerCancel={(e) => onSpinPointerEnd(e.pointerId)}
        >
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-dashed border-lv-blue/55"
            style={{
              width: wheelLayout.radius * 2,
              height: wheelLayout.radius * 2,
              transform: 'translate(-50%, -50%)',
            }}
            aria-hidden
          />
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 rounded-full border-2 border-[#94f3fd] bg-lv-blue/35 ${
              LOUNGE_DOCK_FAB_GLOW_ENABLED
                ? 'shadow-[0_0_8px_rgba(0,245,255,0.32)]'
                : 'shadow-none'
            }`}
            style={{
              transform: `translate(calc(-50% + ${pickerOffset.x}px), calc(-50% + ${pickerOffset.y}px))`,
            }}
            aria-hidden
          />
        </div>
      ) : null}

      <div
        ref={fabHostRef}
        className={`pointer-events-none fixed overflow-visible transition-[opacity,transform] duration-300 ease-out will-change-[opacity,transform] ${
          isCornerL
            ? 'z-[25] transition-[left,top,opacity,transform] duration-300 ease-out'
            : menuExpanded
              ? 'z-20'
              : 'z-[25]'
        } ${
          fabCompactScaleOriginClass
        } ${
          fabCompactActive && !open && !fabExpandFromPip
            ? ''
            : fabIdleDimmed && fabVisible && !open
              ? 'scale-[0.97]'
              : ''
        } ${fabWakePop && !fabCompactActive && !fabExpandFromPip ? 'scale-100' : ''}`}
        style={{
          left: fabDisplayPos?.left ?? 0,
          top: fabDisplayPos?.top ?? 0,
          width: LOUNGE_DOCK_FAB_SIZE_PX,
          height: LOUNGE_DOCK_FAB_SIZE_PX,
          opacity: fabDisplayOpacity,
          transform: fabHostCompactScale < 1 ? `scale(${fabHostCompactScale})` : undefined,
          transition:
            'left 300ms ease-out, top 300ms ease-out, opacity 300ms ease-out, transform 300ms ease-out',
        }}
      >
        {fabLongPressRingsActive && !open ? (
          <FabLongPressRingIndicator rings={fabLongPressRings} sizePx={LOUNGE_DOCK_FAB_SIZE_PX} />
        ) : null}
        <button
          type="button"
          aria-label={
            menuExpanded
              ? 'Close lounge menu'
              : panelCompactChrome
                ? 'Open lounge menu'
                : repositioning
                  ? 'Move menu button'
                  : 'Open lounge menu. Hold to move.'
          }
          aria-expanded={menuExpanded}
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerCancel}
          onClick={(e) => {
            if (suppressFabClickRef.current) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          onContextMenu={(e) => {
            if (repositioning || fabSelectionLock) e.preventDefault()
          }}
          className={`lounge-dock-fab-center pointer-events-auto absolute inset-0 z-[1] select-none rounded-full border-0 transition-[box-shadow,background-color,color,transform] duration-300 ease-out [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] [-webkit-user-select:none] ${loungeDockFabCenterShadowClass(open)} ${
            open
              ? `${LOUNGE_DOCK_FAB_CENTER_GLOW.bgOpen} ${LOUNGE_DOCK_FAB_CENTER_GLOW.text}`
              : `${LOUNGE_DOCK_FAB_CENTER_GLOW.bg} ${LOUNGE_DOCK_FAB_CENTER_GLOW.text}`
          } ${
            fabCompactActive && !open
              ? ''
              : repositioning
                ? 'scale-[1.06]'
                : fabWakePop
                  ? 'scale-[1.05]'
                  : fabIdleDimmed && fabVisible && !open
                    ? 'scale-[0.97]'
                    : ''
          }`}
          style={{
            touchAction: 'none',
            pointerEvents: fabEffectivelyVisible ? 'auto' : 'none',
          }}
        >
          {repositioning ? (
            <span
              className="pointer-events-none absolute -inset-1 rounded-full border-2 border-cyan-300/90 shadow-[0_0_14px_rgba(6,206,252,0.45)]"
              aria-hidden
            />
          ) : null}
          <span
            className={`pointer-events-none relative z-[1] block select-none text-xl font-semibold leading-none text-black transition-transform duration-300 ${
              open ? 'rotate-45' : ''
            }`}
            aria-hidden
          >
            +
          </span>
          {fabNotifBadgeCount > 0 ? (
            <span
              className="pointer-events-none absolute -right-0.5 -top-0.5 z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fd262d] px-1 text-[10px] font-bold leading-none text-white"
              aria-hidden
            >
              {fabNotifBadgeCount > 99 ? '99+' : fabNotifBadgeCount}
            </span>
          ) : null}
        </button>
      </div>

      {visibleWheelItems.map((item) => {
        const i = dockItems.indexOf(item)
        let offset = wheelLayout.offsets[i] ?? { x: 0, y: 0, onScreen: true }
        const compactMenuClosed = panelCompactChrome && !menuExpanded
        if (compactMenuClosed && item.id === HOME_ITEM_ID) {
          if (fabCompactActive) {
            offset = loungeDockCompactPipHomeOffset(fabCompactAlignLeft)
          } else if (isCornerL) {
            offset = loungeDockCornerLCompactHomeOffset()
          } else {
            offset = loungeDockWheelCompactHomeOffset(fabCenterX, viewport.width)
          }
        } else if (fabExpandFromPip && item.id === HOME_ITEM_ID && menuExpanded) {
          offset = loungeDockCompactPipHomeOffset(fabExpandFromPip.alignLeft)
        }
        const isFocused = menuExpanded && spinEnabled && i === wheelLayout.focusedIndex
        const offScreen = menuExpanded && spinEnabled && !offset.onScreen
        const panelChromeHomeAnim =
          (panelCompactChrome && item.id === HOME_ITEM_ID) ||
          (fabExpandFromPip && item.id === HOME_ITEM_ID)
        return renderMenuItem(item, offset, { isFocused, offScreen, panelChromeHomeAnim })
      })}

      {/* Following-filter toggle flash - rendered here so it survives the menu closing before the flash fires */}
      {followingFlash && followingItemCenterRef.current ? (
        <span
          className="pointer-events-none fixed -translate-x-1/2 whitespace-nowrap"
          style={{
            zIndex: dockLayerZIndex + 1,
            left: followingItemCenterRef.current.x,
            top: followingItemCenterRef.current.y - LOUNGE_DOCK_FAB_ITEM_CIRCLE_PX / 2 - 4,
          }}
          aria-hidden
        >
          <span
            key={followingFlash.key}
            className="lounge-filter-flash-fizzle inline-block text-sm font-semibold italic tracking-wide"
          >
            {followingFlash.label === 'Only Frens' ? (
              <>
                <span className="text-white">Only </span>
                <span className="font-bold text-[#06cefc] drop-shadow-[0_0_8px_rgba(6,206,252,0.75)]">Frens</span>
              </>
            ) : (
              <span className="lounge-filter-flash-discover font-bold not-italic tracking-wide">Discover</span>
            )}
          </span>
        </span>
      ) : null}

      {menuLayoutIntroOpen ? (
        <LoungeDockMenuLayoutIntroOverlay
          dockMenuLayout={menuLayout}
          onChooseLayout={onIntroChooseLayout}
        />
      ) : null}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(dockLayer, document.body)
}
