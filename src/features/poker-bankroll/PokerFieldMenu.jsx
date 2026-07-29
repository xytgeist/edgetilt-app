import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'

/** Match PokerBankrollTracker `POKER_FIELD_CLASS` (same weight/size as Select / Location). */
const TRIGGER_CLASS =
  'relative box-border w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

const GAP_PX = 6
const MAX_PANEL_HEIGHT_PX = 256
const BACKDROP_Z = Z_APP_ALERT - 1

const IS_IOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

function preferSheetPicker() {
  if (typeof window === 'undefined') return false
  if (IS_IOS) return true
  return window.matchMedia?.('(pointer: coarse)')?.matches === true
}

/**
 * Freeze the session sheet / overlay so iOS cannot rubber-band or Reachability-yank it
 * while a field menu is open.
 * @returns {() => void} restore
 */
function lockPokerSheetBehind(triggerEl) {
  const sheet =
    triggerEl instanceof Element
      ? triggerEl.closest('[data-poker-bankroll-sheet]')
      : null
  const overlay = sheet?.parentElement instanceof HTMLElement ? sheet.parentElement : null
  const targets = [sheet, overlay].filter((el) => el instanceof HTMLElement)
  const prev = targets.map((el) => ({
    el,
    overflow: el.style.overflow,
    touchAction: el.style.touchAction,
    overscrollBehavior: el.style.overscrollBehavior,
  }))
  for (const el of targets) {
    el.style.overflow = 'hidden'
    el.style.touchAction = 'none'
    el.style.overscrollBehavior = 'none'
  }
  const prevBody = {
    overflow: document.body.style.overflow,
    overscrollBehavior: document.body.style.overscrollBehavior,
    touchAction: document.body.style.touchAction,
  }
  const prevHtml = {
    overscrollBehavior: document.documentElement.style.overscrollBehavior,
  }
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehavior = 'none'
  document.body.style.touchAction = 'none'
  document.documentElement.style.overscrollBehavior = 'none'

  return () => {
    for (const p of prev) {
      p.el.style.overflow = p.overflow
      p.el.style.touchAction = p.touchAction
      p.el.style.overscrollBehavior = p.overscrollBehavior
    }
    document.body.style.overflow = prevBody.overflow
    document.body.style.overscrollBehavior = prevBody.overscrollBehavior
    document.body.style.touchAction = prevBody.touchAction
    document.documentElement.style.overscrollBehavior = prevHtml.overscrollBehavior
  }
}

/**
 * Non-passive edge lock on a scrollable list node (attach to the element, not document).
 * Stops iOS from chaining pull-down at top into Reachability / sheet bounce.
 * @param {HTMLElement | null} list
 * @returns {() => void}
 */
function attachListEdgeScrollLock(list) {
  if (!list) return () => {}
  let startY = null

  function onTouchStart(e) {
    startY = e.touches[0]?.clientY ?? null
  }
  function onTouchMove(e) {
    if (startY == null || !e.touches[0]) return
    const y = e.touches[0].clientY
    const deltaY = y - startY
    const { scrollTop, scrollHeight, clientHeight } = list
    const atTop = scrollTop <= 0
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      e.preventDefault()
    }
  }
  function onTouchEnd() {
    startY = null
  }

  list.addEventListener('touchstart', onTouchStart, { passive: true })
  list.addEventListener('touchmove', onTouchMove, { passive: false })
  list.addEventListener('touchend', onTouchEnd, { passive: true })
  list.addEventListener('touchcancel', onTouchEnd, { passive: true })
  return () => {
    list.removeEventListener('touchstart', onTouchStart)
    list.removeEventListener('touchmove', onTouchMove)
    list.removeEventListener('touchend', onTouchEnd)
    list.removeEventListener('touchcancel', onTouchEnd)
  }
}

/**
 * Non-passive absorb on backdrop (element-level; Safari often ignores document listeners).
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
function attachBackdropTouchLock(el) {
  if (!el) return () => {}
  function onTouchMove(e) {
    e.preventDefault()
  }
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  return () => {
    el.removeEventListener('touchmove', onTouchMove)
  }
}

/**
 * Custom field menu for Game / Currency.
 * Desktop: anchored popover. iOS / coarse pointer: bottom sheet (avoids Reachability yank).
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(id: string) => void} props.onChange
 * @param {Array<{ id: string, label: string }>} [props.options]
 * @param {Array<{ type: 'label'|'option', id?: string, label: string }>} [props.rows]
 * @param {string} [props.ariaLabel]
 * @param {string} [props.placeholder]
 */
export default function PokerFieldMenu({
  value,
  onChange,
  options = [],
  rows: rowsProp = null,
  ariaLabel = 'Select',
  placeholder = 'Select…',
}) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState(null)
  const [useSheet, setUseSheet] = useState(() => preferSheetPicker())
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const backdropRef = useRef(null)

  const rows = useMemo(() => {
    if (Array.isArray(rowsProp) && rowsProp.length) return rowsProp
    return (options || []).map((opt) => ({
      type: 'option',
      id: opt.id,
      label: opt.label,
    }))
  }, [rowsProp, options])

  const triggerLabel = useMemo(() => {
    const hit = rows.find((r) => r.type === 'option' && r.id === value)
    return hit?.label || placeholder
  }, [rows, value, placeholder])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)')
    const sync = () => setUseSheet(preferSheetPicker())
    sync()
    mq?.addEventListener?.('change', sync)
    return () => mq?.removeEventListener?.('change', sync)
  }, [])

  const updatePanelPos = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - GAP_PX
    const spaceAbove = r.top - GAP_PX
    const preferAbove = spaceBelow < 160 && spaceAbove > spaceBelow
    const available = preferAbove ? spaceAbove : spaceBelow
    const maxHeight = Math.max(120, Math.min(MAX_PANEL_HEIGHT_PX, available))
    setPanelPos({
      left: r.left,
      width: r.width,
      maxHeight,
      ...(preferAbove
        ? { bottom: window.innerHeight - r.top + GAP_PX, top: 'auto' }
        : { top: r.bottom + GAP_PX, bottom: 'auto' }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open || useSheet) {
      if (!open) setPanelPos(null)
      return undefined
    }
    updatePanelPos()
    if (listRef.current) listRef.current.scrollTop = 0

    function onViewportChange(e) {
      const t = e?.target
      if (t instanceof Node && panelRef.current?.contains(t)) return
      updatePanelPos()
    }

    window.addEventListener('resize', updatePanelPos)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', updatePanelPos)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, useSheet, updatePanelPos, rows.length])

  useLayoutEffect(() => {
    if (!open) return undefined
    // After portal commit so backdrop/list refs exist.
    const restoreSheet = lockPokerSheetBehind(triggerRef.current)
    const restoreBackdrop = attachBackdropTouchLock(backdropRef.current)
    const restoreList = attachListEdgeScrollLock(listRef.current)
    if (listRef.current) listRef.current.scrollTop = 0
    return () => {
      restoreList()
      restoreBackdrop()
      restoreSheet()
    }
  }, [open, useSheet, panelPos])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onOutside(e) {
      const t = e.target
      if (!(t instanceof Node)) return
      if (wrapperRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('[data-poker-field-menu-backdrop]')) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [open])

  const optionButtons = rows.map((row, index) => {
    if (row.type === 'label') {
      return (
        <div
          key={`label:${row.label}:${index}`}
          className="sticky top-0 border-b border-zinc-700/40 bg-zinc-800/95 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
          role="presentation"
        >
          {row.label}
        </div>
      )
    }
    const picked = row.id === value
    return (
      <button
        key={row.id || `opt:${index}`}
        type="button"
        role="option"
        aria-selected={picked}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onChange(row.id)
          setOpen(false)
        }}
        className={`w-full border-b border-zinc-700/40 px-4 py-3.5 text-left text-sm font-semibold touch-manipulation last:border-0 ${
          picked
            ? 'bg-emerald-600/25 text-emerald-200'
            : 'text-zinc-200 active:bg-zinc-700'
        }`}
      >
        {row.label}
      </button>
    )
  })

  const menuPortal =
    open && typeof document !== 'undefined'
      ? createPortal(
          useSheet ? (
            <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: Z_APP_ALERT }}>
              <div
                ref={backdropRef}
                data-poker-field-menu-backdrop
                aria-hidden
                className="absolute inset-0 bg-black/50"
                style={{ touchAction: 'none' }}
                onClick={close}
              />
              <div
                ref={panelRef}
                data-poker-field-menu-panel
                data-poker-field-menu-sheet
                className="relative flex max-h-[min(55dvh,420px)] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-700/60 bg-zinc-800 shadow-xl"
                role="listbox"
                aria-label={ariaLabel}
                style={{ overscrollBehavior: 'none' }}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-700/50 px-4 py-3">
                  <div className="text-sm font-bold text-white">{ariaLabel}</div>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full bg-zinc-700/80 px-3 py-1 text-xs font-semibold text-zinc-200 touch-manipulation"
                  >
                    Done
                  </button>
                </div>
                <div
                  ref={listRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-none"
                  style={{
                    overscrollBehavior: 'none',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                  }}
                >
                  {optionButtons}
                </div>
              </div>
            </div>
          ) : panelPos ? (
            <>
              <div
                ref={backdropRef}
                data-poker-field-menu-backdrop
                aria-hidden
                className="fixed inset-0"
                style={{ zIndex: BACKDROP_Z, touchAction: 'none' }}
                onClick={close}
              />
              <div
                ref={panelRef}
                data-poker-field-menu-panel
                className="overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-800 shadow-xl"
                role="listbox"
                aria-label={ariaLabel}
                style={{
                  position: 'fixed',
                  zIndex: Z_APP_ALERT,
                  left: panelPos.left,
                  width: panelPos.width,
                  top: panelPos.top,
                  bottom: panelPos.bottom,
                  maxHeight: panelPos.maxHeight,
                  overscrollBehavior: 'none',
                }}
              >
                <div
                  ref={listRef}
                  className="h-full overflow-y-auto overscroll-none"
                  style={{
                    maxHeight: panelPos.maxHeight,
                    overscrollBehavior: 'none',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                  }}
                >
                  {optionButtons}
                </div>
              </div>
            </>
          ) : null,
          document.body,
        )
      : null

  return (
    <div ref={wrapperRef} className="relative" data-poker-field-menu>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={TRIGGER_CLASS}
      >
        <span className="block truncate pr-1 leading-[3rem]">{triggerLabel}</span>
        <span
          aria-hidden
          className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {menuPortal}
    </div>
  )
}
