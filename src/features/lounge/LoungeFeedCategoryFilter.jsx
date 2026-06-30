import { useEffect, useRef, useState } from 'react'
import {
  loungePostCategoryPillChipClass,
  loungePostCategoryPillOptions,
} from '../../utils/loungePostCategoryPills.js'
import { writeLoungeFeedCategoryFilter } from '../../utils/loungeFeedCategoryFilterPref.js'

/** Home feed tribe visibility - all on by default; tap to dim/hide posts with that pill. */
export default function LoungeFeedCategoryFilter({
  value = [],
  onChange,
  disabled = false,
  className = '',
}) {
  const excluded = Array.isArray(value) ? value : []
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const filterActive = excluded.length > 0

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const toggleSlug = (slug) => {
    const set = new Set(excluded)
    if (set.has(slug)) set.delete(slug)
    else set.add(slug)
    const next = loungePostCategoryPillOptions()
      .map((o) => o.slug)
      .filter((s) => set.has(s))
    writeLoungeFeedCategoryFilter(next)
    onChange?.(next)
  }

  const showAll = () => {
    writeLoungeFeedCategoryFilter([])
    onChange?.([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Feed tribes"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-[min(36vw,8.5rem)] items-center gap-0.5 rounded-md py-0.5 pr-0.5 text-[13px] font-medium leading-tight text-zinc-500 touch-manipulation hover:text-zinc-300 disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
      >
        <span className="truncate">Tribes</span>
        <svg className="h-3.5 w-3.5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="lounge-pill-row absolute right-0 top-full z-30 mt-0.5 max-h-[min(60vh,18rem)] w-max min-w-[9.5rem] max-w-[min(88vw,11.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-zinc-700/90 bg-zinc-900 py-1 shadow-lg"
        >
          {filterActive ? (
            <button
              type="button"
              className="block w-full border-b border-zinc-800/90 px-2 py-1.5 text-left text-[11px] font-medium text-zinc-400 touch-manipulation hover:bg-zinc-800 hover:text-zinc-200"
              onClick={showAll}
            >
              Show all tribes
            </button>
          ) : null}
          {loungePostCategoryPillOptions().map(({ slug, label }) => {
            const visible = !excluded.includes(slug)
            return (
              <button
                key={slug}
                type="button"
                role="option"
                aria-selected={visible}
                title={label}
                onClick={() => toggleSlug(slug)}
                className="flex w-full min-h-9 items-center px-2 py-1 touch-manipulation hover:bg-zinc-800/80 active:bg-zinc-800/60 [-webkit-tap-highlight-color:transparent]"
              >
                <span
                  className={`inline-flex min-w-0 max-w-full truncate rounded-full border px-2 py-1 text-[11px] font-semibold leading-tight transition-[opacity,filter] duration-150 ${loungePostCategoryPillChipClass(slug, 'display')} ${
                    visible ? 'opacity-100 saturate-100' : 'opacity-35 saturate-[0.35]'
                  }`}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
