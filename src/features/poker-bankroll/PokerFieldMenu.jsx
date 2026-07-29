import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'

/** Match PokerBankrollTracker `POKER_FIELD_CLASS` (same weight/size as Select / Location). */
const TRIGGER_CLASS =
  'relative box-border w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

const GAP_PX = 6
const MAX_PANEL_HEIGHT_PX = 256

/**
 * Custom field menu matching the cash Game picker.
 * Panel portals to document.body as a fixed popover (does not expand the form).
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(id: string) => void} props.onChange
 * @param {Array<{ id: string, label: string }>} [props.options] flat options
 * @param {Array<{ type: 'label'|'option', id?: string, label: string }>} [props.rows] sectioned rows (wins over options)
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
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const touchStartYRef = useRef(null)

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
    if (!open) {
      setPanelPos(null)
      return undefined
    }
    updatePanelPos()
    if (listRef.current) listRef.current.scrollTop = 0

    function onViewportChange(e) {
      // Ignore scrolls inside the menu list (avoids jitter + overscroll feedback loops).
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
  }, [open, updatePanelPos, rows.length])

  // Lock sheet / page scroll while open so list overscroll doesn't yank the sheet (iOS Reachability).
  useEffect(() => {
    if (!open) return undefined
    const sheet = triggerRef.current?.closest?.('[data-poker-bankroll-sheet]')
    const prevSheetOverflow = sheet instanceof HTMLElement ? sheet.style.overflow : ''
    const prevBodyOverflow = document.body.style.overflow
    const prevBodyOverscroll = document.body.style.overscrollBehavior
    if (sheet instanceof HTMLElement) sheet.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'

    function onTouchMove(e) {
      const t = e.target
      if (t instanceof Node && panelRef.current?.contains(t)) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      if (sheet instanceof HTMLElement) sheet.style.overflow = prevSheetOverflow
      document.body.style.overflow = prevBodyOverflow
      document.body.style.overscrollBehavior = prevBodyOverscroll
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [open])

  // Block edge overscroll inside the list so iOS doesn't promote it to Reachability / page bounce.
  useEffect(() => {
    if (!open) return undefined
    const list = listRef.current
    if (!list) return undefined

    function onTouchStart(e) {
      touchStartYRef.current = e.touches[0]?.clientY ?? null
    }
    function onTouchMove(e) {
      const startY = touchStartYRef.current
      if (startY == null || !e.touches[0]) return
      const y = e.touches[0].clientY
      const deltaY = y - startY
      const { scrollTop, scrollHeight, clientHeight } = list
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1
      // Finger moving down at top = pull-down overscroll (Reachability / rubber-band).
      if (atTop && deltaY > 0) {
        e.preventDefault()
        return
      }
      if (atBottom && deltaY < 0) {
        e.preventDefault()
      }
    }

    list.addEventListener('touchstart', onTouchStart, { passive: true })
    list.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      list.removeEventListener('touchstart', onTouchStart)
      list.removeEventListener('touchmove', onTouchMove)
    }
  }, [open, panelPos])

  useEffect(() => {
    if (!open) return undefined
    function onOutside(e) {
      const t = e.target
      if (!(t instanceof Node)) return
      if (wrapperRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  const panel =
    open && panelPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            data-poker-field-menu-panel
            className="overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-800 shadow-xl overscroll-none"
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
              WebkitOverflowScrolling: 'auto',
            }}
          >
            <div
              ref={listRef}
              className="h-full overflow-y-auto overscroll-none touch-pan-y"
              style={{
                maxHeight: panelPos.maxHeight,
                overscrollBehavior: 'none',
                WebkitOverflowScrolling: 'auto',
              }}
            >
              {rows.map((row, index) => {
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
                    className={`w-full border-b border-zinc-700/40 px-4 py-3 text-left text-sm font-semibold touch-manipulation last:border-0 ${
                      picked
                        ? 'bg-emerald-600/25 text-emerald-200'
                        : 'text-zinc-200 hover:bg-zinc-700/60 active:bg-zinc-700'
                    }`}
                  >
                    {row.label}
                  </button>
                )
              })}
            </div>
          </div>,
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
      {panel}
    </div>
  )
}
