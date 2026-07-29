import { useEffect, useMemo, useRef, useState } from 'react'
import { POKER_CASH_NEW_GAME_ID, buildCashGamePickerRows } from './pokerSessionLabels.js'

/** Match PokerBankrollTracker `POKER_FIELD_CLASS` (same weight/size as Select / Location). */
const TRIGGER_CLASS =
  'relative box-border w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

/**
 * Sectioned cash Game menu: New game… + Your games + Defaults.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(id: string) => void} props.onChange
 * @param {Array<{ id: string, label: string, isDefault?: boolean }>} props.presets
 * @param {{ id: string, label: string } | null} [props.orphan]
 * @param {string} [props.ariaLabel]
 */
export default function PokerCashGamePicker({
  value,
  onChange,
  presets = [],
  orphan = null,
  ariaLabel = 'Game',
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const listRef = useRef(null)

  const { rows } = useMemo(() => buildCashGamePickerRows(presets, orphan), [presets, orphan])

  const triggerLabel = useMemo(() => {
    if (value === POKER_CASH_NEW_GAME_ID) return 'New game…'
    const fromPreset = (presets || []).find((p) => p.id === value)
    if (fromPreset?.label) return fromPreset.label
    if (orphan?.id === value && orphan.label) return orphan.label
    return 'Select game…'
  }, [value, presets, orphan])

  useEffect(() => {
    if (!open) return undefined
    if (listRef.current) listRef.current.scrollTop = 0
    function onOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative" data-poker-cash-game-picker>
      <button
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
      {open ? (
        <div
          className="mt-2 overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-800 shadow-xl"
          role="listbox"
          aria-label={ariaLabel}
        >
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain">
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
                  key={row.id}
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
        </div>
      ) : null}
    </div>
  )
}
