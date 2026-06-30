/**
 * Rounded option picker - same chrome as CasinoAutocomplete (Start Session).
 *
 * Props:
 *   value       - selected option value
 *   onChange    - fn(value: string)
 *   options     - [{ value: string, label: string }] or section labels { type: 'label', label: string }
 *   ariaLabel   - accessibility label for trigger
 *   placeholder - shown when value is empty / unknown
 */
import { useEffect, useRef, useState } from 'react'

const TRIGGER_CLASS =
  'relative w-full min-h-12 rounded-2xl bg-zinc-800 px-4 pr-10 text-left text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation'

const MENU_CLASS =
  'absolute z-50 mt-1.5 w-full rounded-2xl bg-zinc-800 border border-zinc-700/60 shadow-xl overflow-hidden max-h-52 overflow-y-auto'

export default function LogPlayOptionPicker({
  value,
  onChange,
  options = [],
  ariaLabel = 'Select option',
  placeholder = 'Select…',
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const selectableOptions = options.filter(o => o?.type !== 'label')
  const selected = selectableOptions.find(o => o.value === value)
  const display = selected?.label ?? placeholder

  useEffect(() => {
    if (!open) return undefined
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
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={selectableOptions.length === 0}
        onClick={() => setOpen(o => !o)}
        className={`${TRIGGER_CLASS} disabled:opacity-50`}
      >
        <span className="block truncate pr-1">{display}</span>
        <span
          aria-hidden
          className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open && options.length > 0 ? (
        <div className={MENU_CLASS} role="listbox">
          {options.map((opt, index) => {
            if (opt?.type === 'label') {
              return (
                <div
                  key={`label:${opt.label}:${index}`}
                  className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-700/40"
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
                  setOpen(false)
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
      ) : null}
    </div>
  )
}
