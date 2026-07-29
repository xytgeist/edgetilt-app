import { useEffect, useMemo, useRef, useState } from 'react'
import {
  POKER_CASH_NEW_GAME_ID,
  buildCashGamePickerRows,
  normalizeCashGameSearchQuery,
} from './pokerSessionLabels.js'

const TRIGGER_CLASS =
  'relative w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

/**
 * Searchable cash Game picker: New game… + Your games + Defaults.
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
  const [searchQuery, setSearchQuery] = useState('')
  const wrapperRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const { rows, matchCount } = useMemo(
    () => buildCashGamePickerRows(presets, searchQuery, orphan),
    [presets, searchQuery, orphan],
  )

  const triggerLabel = useMemo(() => {
    if (value === POKER_CASH_NEW_GAME_ID) return 'New game…'
    const fromPreset = (presets || []).find((p) => p.id === value)
    if (fromPreset?.label) return fromPreset.label
    if (orphan?.id === value && orphan.label) return orphan.label
    return 'Select game…'
  }, [value, presets, orphan])

  const queryNorm = normalizeCashGameSearchQuery(searchQuery)

  useEffect(() => {
    if (!open) return undefined
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    if (listRef.current) listRef.current.scrollTop = 0
    function onOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  const closePicker = () => {
    setOpen(false)
    setSearchQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative" data-poker-cash-game-picker>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={TRIGGER_CLASS}
      >
        <span className="block truncate pr-1 text-sm font-semibold">{triggerLabel}</span>
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
          role="dialog"
          aria-label={`${ariaLabel} picker`}
        >
          <div className="border-b border-zinc-700/60 p-2">
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 2/5, PLO…"
              enterKeyHint="search"
              autoComplete="off"
              className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-cyan-500/40"
            />
            <div className="mt-1.5 px-1 text-[10px] font-medium text-zinc-500">
              {queryNorm
                ? matchCount === 0
                  ? 'No games match'
                  : `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                : `${matchCount} game${matchCount === 1 ? '' : 's'}`}
            </div>
          </div>
          {rows.length > 0 ? (
            <div ref={listRef} className="max-h-52 overflow-y-auto overscroll-contain" role="listbox">
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
                      closePicker()
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
          ) : (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">No games match that search.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
