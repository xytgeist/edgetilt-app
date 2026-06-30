import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildLogPlayGamePickerSections,
  normalizeGameSearchQuery,
  playLogTemplateDisplayLabel,
  PLAY_LOG_ANALYZE_ALL_PLAYS_ID,
  PLAY_LOG_ANALYZE_ALL_PLAYS_LABEL,
} from './playLogMetrics.js'

const TRIGGER_CLASS =
  'relative w-full min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

const PANEL_CLASS =
  'absolute z-50 mt-1.5 w-full rounded-2xl bg-zinc-800 border border-zinc-700/60 shadow-xl overflow-hidden'

const LIST_CLASS = 'max-h-52 overflow-y-auto overscroll-contain'

/**
 * Searchable game picker for Log Play / Analyze (Recent → Custom → A–Z + filter by name/slug).
 *
 * @param {object} props
 * @param {string} props.value - selected template id
 * @param {(id: string) => void} props.onChange
 * @param {import('./playLogMetrics.js').PlayLogTemplate[]} props.templates
 * @param {import('./playLogMetrics.js').PlayLogEntry[]} props.entries
 * @param {string} [props.ariaLabel]
 * @param {string} [props.placeholder]
 * @param {boolean} [props.includeAllPlaysOption]
 */
export default function LogPlayGamePicker({
  value,
  onChange,
  templates = [],
  entries = [],
  ariaLabel = 'Game',
  placeholder = 'Select game',
  includeAllPlaysOption = false,
}) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const wrapperRef = useRef(null)
  const searchRef = useRef(null)

  const selected = useMemo(
    () => (templates || []).find(t => String(t.id) === String(value)),
    [templates, value],
  )

  const triggerLabel = useMemo(() => {
    if (includeAllPlaysOption && String(value) === PLAY_LOG_ANALYZE_ALL_PLAYS_ID) {
      return PLAY_LOG_ANALYZE_ALL_PLAYS_LABEL
    }
    return selected ? playLogTemplateDisplayLabel(selected, templates) : placeholder
  }, [includeAllPlaysOption, value, selected, placeholder, templates])

  const { options, matchCount } = useMemo(
    () => buildLogPlayGamePickerSections(templates, entries, searchQuery, { includeAllPlaysOption }),
    [templates, entries, searchQuery, includeAllPlaysOption],
  )

  const selectableOptions = useMemo(() => options.filter(o => o?.type !== 'label'), [options])
  const queryNorm = normalizeGameSearchQuery(searchQuery)

  useEffect(() => {
    if (!open) return undefined
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
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
    <div ref={wrapperRef} className="relative" data-play-log-game-picker>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={!includeAllPlaysOption && selectableOptions.length === 0 && !open}
        onClick={() => setOpen(o => !o)}
        className={`${TRIGGER_CLASS} disabled:opacity-50`}
      >
        <span className="block truncate pr-1">{triggerLabel}</span>
        <span
          aria-hidden
          className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className={PANEL_CLASS} role="dialog" aria-label={`${ariaLabel} picker`}>
          <div className="border-b border-zinc-700/60 p-2">
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search games…"
              enterKeyHint="search"
              autoComplete="off"
              className="w-full rounded-xl bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
            <div className="mt-1.5 px-1 text-[10px] font-medium text-zinc-500">
              {queryNorm
                ? matchCount === 0
                  ? 'No games match'
                  : `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                : `${matchCount} game${matchCount === 1 ? '' : 's'} A–Z`}
            </div>
          </div>
          {options.length > 0 ? (
            <div className={LIST_CLASS} role="listbox">
              {options.map((opt, index) => {
                if (opt?.type === 'label') {
                  return (
                    <div
                      key={`label:${opt.label}:${index}`}
                      className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-700/40 bg-zinc-800/95 sticky top-0"
                      role="presentation"
                    >
                      {opt.label}
                    </div>
                  )
                }
                const picked = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={picked}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      onChange(opt.value)
                      closePicker()
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-semibold touch-manipulation border-b border-zinc-700/40 last:border-0 ${
                      picked
                        ? 'bg-zinc-700/40 text-white'
                        : 'text-zinc-200 hover:bg-zinc-700/60 active:bg-zinc-700'
                    }`}
                  >
                    {opt.label}
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
