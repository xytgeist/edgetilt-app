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
    window.addEventListener('resize', updatePanelPos)
    window.addEventListener('scroll', updatePanelPos, true)
    return () => {
      window.removeEventListener('resize', updatePanelPos)
      window.removeEventListener('scroll', updatePanelPos, true)
    }
  }, [open, updatePanelPos, rows.length])

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
            }}
          >
            <div
              ref={listRef}
              className="h-full overflow-y-auto overscroll-contain"
              style={{ maxHeight: panelPos.maxHeight }}
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
