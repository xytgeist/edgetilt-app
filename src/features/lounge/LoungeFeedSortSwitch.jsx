import { useEffect, useRef, useState } from 'react'
import { LOUNGE_FEED_SORT, writeLoungeFeedSort } from '../../utils/loungeFeedSortPref.js'

const OPTIONS = [
  { value: LOUNGE_FEED_SORT.LATEST, label: 'Latest' },
  { value: LOUNGE_FEED_SORT.POPULAR, label: 'Popular' },
]

function labelForValue(value) {
  return OPTIONS.find((o) => o.value === value)?.label || 'Latest'
}

/**
 * Minimal home feed sort: `Latest ▾` (compact menu, matches post-detail comment sort).
 */
export default function LoungeFeedSortSwitch({
  value = LOUNGE_FEED_SORT.LATEST,
  onChange,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const currentLabel = labelForValue(value)

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Feed sort"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 rounded-md py-0.5 pr-0.5 text-[13px] font-medium leading-tight text-zinc-500 touch-manipulation hover:text-zinc-300 disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
      >
        <span>{currentLabel}</span>
        <svg className="h-3.5 w-3.5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-0.5 min-w-[7.5rem] rounded-lg border border-zinc-700/90 bg-zinc-900 py-0.5 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                className={`block w-full px-2.5 py-1 text-left text-[13px] font-medium touch-manipulation hover:bg-zinc-800 ${
                  opt.value === value ? 'text-zinc-100' : 'text-zinc-400'
                }`}
                onClick={() => {
                  if (opt.value === value) {
                    setOpen(false)
                    return
                  }
                  writeLoungeFeedSort(opt.value)
                  onChange?.(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
