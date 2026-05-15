import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LOUNGE_DOCK_FAB_SIZE_PX,
  loungeDockCarouselSnapRotation,
  loungeDockFabDefaultPosition,
  loungeDockFabMoveBounds,
  loungeDockFabPctFromPosition,
  loungeDockFabPositionFromPct,
  loungeDockViewportSize,
  loungeDockWheelLayout,
  readLoungeDockFabPrefs,
  writeLoungeDockFabPrefs,
} from '../utils/loungeDockFabPosition.js'

const HOME_ITEM_ID = 'home'
const PANEL_CHROME_PANELS = new Set(['search', 'notifications', 'chat'])

const ITEM_CIRCLE_PX = 40
const ITEM_ICON_PX = 23
const DRAG_THRESHOLD_PX = 8
const SPIN_WHEEL_SENSITIVITY = 0.0045
/** Below this rotation delta (rad), pointer-up on an icon counts as a tap. */
const SPIN_TAP_SLOP_RAD = 0.04
/** Brief block on feed/panel under the wheel so synthesized clicks cannot pass through after tap. */
const POINTER_GUARD_MS = 400

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function angleFromPointer(fabCenterX, fabCenterY, clientX, clientY) {
  return Math.atan2(-(clientX - fabCenterX), -(clientY - fabCenterY))
}

function IconLock({ locked }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
      {locked ? (
        <>
          <path
            fill="currentColor"
            d="M8 10V8a4 4 0 018 0v2h1.5a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 017 18.5v-7A1.5 1.5 0 018.5 10H8z"
          />
          <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M9 10V8a3 3 0 016 0v2" />
        </>
      ) : (
        <path
          fill="currentColor"
          d="M8 11V8a4 4 0 0 1 8 0v3h1.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 17.5v-6A1.5 1.5 0 0 1 8.5 11H8z"
        />
      )}
    </svg>
  )
}

/**
 * Experimental Lounge nav: draggable FAB + full spin wheel (home anchors left/right of FAB) (prototype only).
 */
export default function LoungeDockArcCarouselPrototype({
  items = [],
  defaultOpen = false,
  reveal = 1,
  /** When set (search / notifications / chat), FAB + home stay visible; tap FAB to expand full menu. */
  panelChrome = null,
  /** True while the wheel is open or briefly after a wheel icon tap (blocks feed/panel hits). */
  onPointerBlockChange,
}) {
  const panelCompactChrome = panelChrome != null && PANEL_CHROME_PANELS.has(panelChrome)
  const [open, setOpen] = useState(defaultOpen)
  const [locked, setLocked] = useState(false)
  const [fabPos, setFabPos] = useState(null)
  const [viewport, setViewport] = useState(() => loungeDockViewportSize())
  const [carouselRotation, setCarouselRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)

  const fabHostRef = useRef(null)
  const fabDragRef = useRef(null)
  const spinRef = useRef(null)
  const spinMovedRef = useRef(false)
  const fabPosRef = useRef(null)
  const lockedRef = useRef(false)
  const openRef = useRef(false)
  const carouselRotationRef = useRef(0)
  const pointerGuardRef = useRef(false)
  const pointerGuardTimerRef = useRef(0)
  const spinEnabledRef = useRef(false)

  const syncViewport = useCallback(() => {
    const next = loungeDockViewportSize()
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
    const bounds = loungeDockFabMoveBounds(width, height)
    const saved = readLoungeDockFabPrefs()
    const pos = saved
      ? loungeDockFabPositionFromPct(saved.xPct, saved.yPct, bounds)
      : loungeDockFabDefaultPosition(width, height)
    setFabPos(pos)
    setLocked(saved?.locked ?? false)
  }, [viewport.width, viewport.height])

  useEffect(() => {
    fabPosRef.current = fabPos
  }, [fabPos])

  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  useEffect(() => {
    openRef.current = open
  }, [open])

  const syncPointerBlock = useCallback(() => {
    onPointerBlockChange?.(Boolean(openRef.current || pointerGuardRef.current))
  }, [onPointerBlockChange])

  useEffect(() => {
    syncPointerBlock()
  }, [open, syncPointerBlock])

  useEffect(
    () => () => {
      if (pointerGuardTimerRef.current) window.clearTimeout(pointerGuardTimerRef.current)
    },
    [],
  )

  const armPointerGuard = useCallback(() => {
    pointerGuardRef.current = true
    syncPointerBlock()
    if (pointerGuardTimerRef.current) window.clearTimeout(pointerGuardTimerRef.current)
    pointerGuardTimerRef.current = window.setTimeout(() => {
      pointerGuardTimerRef.current = 0
      pointerGuardRef.current = false
      syncPointerBlock()
    }, POINTER_GUARD_MS)
  }, [syncPointerBlock])

  useEffect(() => {
    carouselRotationRef.current = carouselRotation
  }, [carouselRotation])

  const fabCenterX = fabPos ? fabPos.left + LOUNGE_DOCK_FAB_SIZE_PX / 2 : null
  const fabCenterY = fabPos ? fabPos.top + LOUNGE_DOCK_FAB_SIZE_PX / 2 : null

  /** Home is always wheel index 0 so anchor angle lands on the home icon. */
  const wheelItems = useMemo(() => {
    const home = items.find((item) => item.id === HOME_ITEM_ID)
    const rest = items.filter((item) => item.id !== HOME_ITEM_ID)
    return home ? [home, ...rest] : items
  }, [items])

  const wheelLayout = useMemo(() => {
    if (fabCenterX == null || fabCenterY == null || wheelItems.length === 0) {
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
    const itemRadius = ITEM_CIRCLE_PX / 2
    return loungeDockWheelLayout(
      fabCenterX,
      fabCenterY,
      wheelItems.length,
      carouselRotation,
      viewport,
      itemRadius,
    )
  }, [fabCenterX, fabCenterY, wheelItems.length, carouselRotation, viewport.width, viewport.height])

  const spinEnabled = open && wheelLayout.spinEnabled

  const spinHitRadiusPx =
    wheelLayout.radius > 0
      ? wheelLayout.radius + ITEM_CIRCLE_PX + LOUNGE_DOCK_FAB_SIZE_PX / 2
      : 120

  const persistFabPrefs = useCallback(
    (pos, isLocked) => {
      if (!pos) return
      const bounds = loungeDockFabMoveBounds(viewport.width, viewport.height)
      const pct = loungeDockFabPctFromPosition(pos.left, pos.top, bounds)
      writeLoungeDockFabPrefs({ ...pct, locked: isLocked })
    },
    [viewport.width, viewport.height],
  )

  const snapCarouselToPicker = useCallback(
    (rotation) => {
      if (fabCenterX == null || fabCenterY == null || wheelItems.length === 0) return rotation
      const itemRadius = ITEM_CIRCLE_PX / 2
      const layout = loungeDockWheelLayout(
        fabCenterX,
        fabCenterY,
        wheelItems.length,
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
    [wheelItems.length, viewport.width, viewport.height, fabCenterX, fabCenterY],
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
    if (reveal > 0.12) return
    setOpen(false)
  }, [reveal])

  const fabVisible = reveal > 0.12
  const fabOpacity = clamp(reveal, 0, 1)

  const clampFabPos = useCallback(
    (left, top) => {
      const bounds = loungeDockFabMoveBounds(viewport.width, viewport.height)
      return {
        left: Math.min(bounds.maxLeft, Math.max(bounds.minLeft, left)),
        top: Math.min(bounds.maxTop, Math.max(bounds.minTop, top)),
      }
    },
    [viewport.width, viewport.height],
  )

  const onFabPointerDown = useCallback((e) => {
    if (e.button !== 0) return
    fabDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: fabPosRef.current?.left ?? 0,
      originTop: fabPosRef.current?.top ?? 0,
      dragging: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onFabPointerMove = useCallback(
    (e) => {
      const drag = fabDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (!drag.dragging) {
        if (lockedRef.current || openRef.current) return
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        drag.dragging = true
      }

      const next = clampFabPos(drag.originLeft + dx, drag.originTop + dy)
      fabPosRef.current = next
      setFabPos(next)
    },
    [clampFabPos],
  )

  const onFabPointerUp = useCallback(
    (e) => {
      const drag = fabDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      fabDragRef.current = null

      if (drag.dragging) {
        persistFabPrefs(fabPosRef.current, lockedRef.current)
        return
      }

      if (!fabVisible) return
      if (openRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        return
      }
      resetWheelToHomeAnchor()
      setOpen(true)
    },
    [persistFabPrefs, fabVisible, resetWheelToHomeAnchor],
  )

  const onFabPointerCancel = useCallback((e) => {
    const drag = fabDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.dragging) persistFabPrefs(fabPosRef.current, lockedRef.current)
    fabDragRef.current = null
  }, [persistFabPrefs])

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

  const toggleLock = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setLocked((prev) => {
        const next = !prev
        lockedRef.current = next
        persistFabPrefs(fabPosRef.current, next)
        return next
      })
    },
    [persistFabPrefs],
  )

  const selectItem = useCallback(
    (item) => {
      if (item.disabled) return
      armPointerGuard()
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          item.onSelect?.()
          setOpen(false)
        })
      })
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
    (item, offScreen, e) => {
      e.preventDefault()
      e.stopPropagation()
      const moved = spinMovedRef.current
      onSpinPointerEnd(e.pointerId)
      if (!moved && !item.disabled && !offScreen) selectItem(item)
    },
    [onSpinPointerEnd, selectItem],
  )

  const blockPointerDefault = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  /** Panel screens: home chip beside FAB (menu collapsed) — tap only, no spin. */
  const onCompactItemTap = useCallback(
    (item, e) => {
      blockPointerDefault(e)
      if (!item.disabled) selectItem(item)
    },
    [blockPointerDefault, selectItem],
  )

  const visibleWheelItems = useMemo(() => {
    if (!menuExpanded && panelCompactChrome && wheelItems.length > 0) {
      return wheelItems.slice(0, 1)
    }
    if (menuExpanded) return wheelItems
    return []
  }, [menuExpanded, panelCompactChrome, wheelItems])

  if (items.length === 0 || !fabPos || fabCenterX == null || fabCenterY == null) return null

  const pickerOffset =
    menuExpanded && spinEnabled
      ? (wheelLayout.offsets[wheelLayout.focusedIndex] ?? { x: 0, y: 0 })
      : { x: 0, y: 0 }

  const renderMenuItem = (item, offset, { isFocused = false, offScreen = false } = {}) => {
    const wheelOpen = menuExpanded
    const compactChip = panelCompactChrome && !menuExpanded
    const wheelTapOnly = wheelOpen && !spinEnabled
    const wheelSpin = wheelOpen && spinEnabled
    /** Panel chrome: home chip fades with scroll-linked `reveal` like the FAB. */
    const fadesWithReveal = compactChip
    return (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled}
      aria-label={item.label}
      title={offScreen ? `${item.label} (spin wheel to reach)` : item.label}
      onPointerDown={
        wheelSpin ? onItemPointerDown : wheelTapOnly || compactChip ? blockPointerDefault : undefined
      }
      onPointerMove={wheelSpin ? onSpinPointerMove : undefined}
      onPointerUp={
        wheelSpin
          ? (e) => onItemPointerEnd(item, offScreen, e)
          : wheelTapOnly || compactChip
            ? (e) => onCompactItemTap(item, e)
            : undefined
      }
      onPointerCancel={
        wheelSpin
          ? (e) => onItemPointerEnd(item, offScreen, e)
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
      className={`pointer-events-auto fixed z-[10] flex min-h-[44px] min-w-[44px] -translate-x-1/2 -translate-y-1/2 items-center justify-center select-none ${
        wheelSpin ? 'touch-none' : 'touch-manipulation'
      } ${
        wheelSpin
          ? offScreen
            ? 'cursor-grab opacity-30'
            : 'cursor-grab opacity-100'
          : 'cursor-pointer opacity-100'
      } ${spinning ? 'cursor-grabbing' : ''} disabled:cursor-not-allowed ${
        item.active ? 'text-cyan-300' : 'text-zinc-100'
      } ${
        spinning
          ? ''
          : fadesWithReveal
            ? 'transition-[left,top,opacity] duration-300 ease-out'
            : 'transition-[left,top,opacity] duration-200 ease-out'
      }`}
      style={{
        left: fabCenterX + offset.x,
        top: fabCenterY + offset.y,
        zIndex: isFocused ? 42 : 30,
        opacity: fadesWithReveal ? fabOpacity : 1,
        pointerEvents: fadesWithReveal && !fabVisible ? 'none' : undefined,
      }}
    >
      <span
        className={`flex items-center justify-center rounded-full border shadow-lg backdrop-blur-sm ${
          isFocused || item.active
            ? 'border-cyan-400/70 bg-zinc-900/95 shadow-cyan-500/20 ring-2 ring-cyan-400/40'
            : 'border-zinc-700/90 bg-zinc-950/90'
        }`}
        style={{ width: ITEM_CIRCLE_PX, height: ITEM_CIRCLE_PX }}
      >
        <span
          className="flex items-center justify-center [&_svg]:h-full [&_svg]:w-full"
          style={{ width: ITEM_ICON_PX, height: ITEM_ICON_PX }}
        >
          {item.icon}
        </span>
      </span>
    </button>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {menuExpanded && fabVisible ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[5] bg-black/35 backdrop-blur-[2px] [-webkit-tap-highlight-color:transparent]"
          aria-label="Close menu"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault()
            setOpen(false)
          }}
        />
      ) : null}

      {menuExpanded && fabVisible && spinEnabled ? (
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
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-dashed border-cyan-500/40"
            style={{
              width: wheelLayout.radius * 2,
              height: wheelLayout.radius * 2,
              transform: 'translate(-50%, -50%)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 rounded-full border-2 border-cyan-400/80 bg-cyan-400/20 shadow-[0_0_10px_rgba(34,211,238,0.45)]"
            style={{
              transform: `translate(calc(-50% + ${pickerOffset.x}px), calc(-50% + ${pickerOffset.y}px))`,
            }}
            aria-hidden
          />
        </div>
      ) : null}

      {visibleWheelItems.map((item) => {
        const i = wheelItems.indexOf(item)
        const offset = wheelLayout.offsets[i] ?? { x: 0, y: 0, onScreen: true }
        const isFocused = menuExpanded && spinEnabled && i === wheelLayout.focusedIndex
        const offScreen = menuExpanded && spinEnabled && !offset.onScreen
        return renderMenuItem(item, offset, { isFocused, offScreen })
      })}

      <div
        ref={fabHostRef}
        className="pointer-events-none fixed z-[25] overflow-visible transition-opacity duration-300 ease-out will-change-[opacity]"
        style={{
          left: fabPos.left,
          top: fabPos.top,
          width: LOUNGE_DOCK_FAB_SIZE_PX,
          height: LOUNGE_DOCK_FAB_SIZE_PX,
          opacity: fabOpacity,
        }}
      >
        <button
          type="button"
          aria-label={
            locked
              ? menuExpanded
                ? 'Close lounge menu'
                : 'Open lounge menu (position locked)'
              : menuExpanded
                ? 'Close lounge menu'
                : panelCompactChrome
                  ? 'Open lounge menu'
                  : 'Open lounge menu (drag to reposition)'
          }
          aria-expanded={menuExpanded}
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerCancel}
          className={`pointer-events-auto absolute inset-0 rounded-full border shadow-xl backdrop-blur-md transition-[border-color,box-shadow,colors] duration-300 ease-out [-webkit-tap-highlight-color:transparent] ${
            open
              ? 'border-cyan-400/80 bg-zinc-900/95 text-cyan-300 shadow-cyan-500/25'
              : locked
                ? 'border-zinc-600/90 bg-zinc-950/95 text-zinc-200'
                : 'border-dashed border-zinc-500/80 bg-zinc-950/95 text-zinc-200'
          }`}
          style={{
            touchAction: locked || open ? 'manipulation' : 'none',
            pointerEvents: fabVisible ? 'auto' : 'none',
          }}
        >
          <span
            className={`block text-xl font-light leading-none transition-transform duration-300 ${
              open ? 'rotate-45' : ''
            }`}
          >
            +
          </span>
        </button>

        <button
          type="button"
          onClick={toggleLock}
          aria-label={locked ? 'Unlock menu button position' : 'Lock menu button position'}
          title={locked ? 'Unlock position' : 'Lock position'}
          className={`pointer-events-auto absolute -left-0.5 -top-0.5 z-50 flex h-5 w-5 items-center justify-center rounded-full border shadow-md transition-colors [-webkit-tap-highlight-color:transparent] ${
            locked
              ? 'border-cyan-500/60 bg-zinc-900 text-cyan-300'
              : 'border-zinc-600 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          style={{ pointerEvents: fabVisible ? 'auto' : 'none' }}
        >
          <IconLock locked={locked} />
        </button>
      </div>
    </div>
  )
}
