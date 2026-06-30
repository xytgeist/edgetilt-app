import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  loungePostCategoryPillChipClass,
  loungePostCategoryPillOptionsForPicker,
  normalizeLoungePostCategoryPills,
  normalizeLoungeProfileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'
import {
  bumpLoungeCategoryPillUsage,
  readLoungeCategoryPillUsageCounts,
} from './loungeStorage.js'

const DEFAULT_MAX_PILLS = 3

/** Toggle chips for compose / quote / post edit (0–3 optional) or profile interests (uncapped). */
export default function LoungePostCategoryPillPicker({
  value,
  onChange,
  disabled = false,
  maxPills = DEFAULT_MAX_PILLS,
  hint = 'Optional - helps interested members find your post.',
  /** When true, show one row (most-used first) with a caret to expand the rest. */
  collapsibleSingleRow = true,
  /** When true, list all pills A–Z by label (e.g. complete-your-profile gate). */
  sortAlphabetically = false,
  className = '',
}) {
  const uncapped = maxPills == null
  const optionCount = loungePostCategoryPillOptionsForPicker().length
  const cap = uncapped ? optionCount : Math.max(0, Number(maxPills) || DEFAULT_MAX_PILLS)
  const selected = uncapped
    ? normalizeLoungeProfileCategoryPills(value)
    : normalizeLoungePostCategoryPills(value)
  const atMax = selected.length >= cap

  const [usageCounts, setUsageCounts] = useState(() => readLoungeCategoryPillUsageCounts())
  const [expanded, setExpanded] = useState(false)
  const [rowHeightPx, setRowHeightPx] = useState(null)
  const [hasHiddenRows, setHasHiddenRows] = useState(false)
  const clipRef = useRef(null)
  const rowRef = useRef(null)

  const sortedOptions = useMemo(() => {
    const opts = loungePostCategoryPillOptionsForPicker(selected, usageCounts)
    if (!sortAlphabetically) return opts
    return [...opts].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [selected, usageCounts, sortAlphabetically])

  const measureRows = useCallback(() => {
    const row = rowRef.current
    const clip = clipRef.current
    if (!row) return
    const firstChip = row.querySelector('[data-lounge-category-slug]')
    if (firstChip instanceof HTMLElement) {
      setRowHeightPx(firstChip.offsetHeight)
    }
    if (clip && !expanded && collapsibleSingleRow) {
      setHasHiddenRows(row.scrollHeight > clip.clientHeight + 1)
    } else if (collapsibleSingleRow) {
      const chips = [...row.querySelectorAll('[data-lounge-category-slug]')]
      if (chips.length <= 1) {
        setHasHiddenRows(false)
        return
      }
      const top = chips[0].offsetTop
      setHasHiddenRows(chips.some((c) => c.offsetTop > top + 1))
    }
  }, [collapsibleSingleRow, expanded])

  useLayoutEffect(() => {
    measureRows()
    if (typeof window === 'undefined' || !('ResizeObserver' in window)) return undefined
    const row = rowRef.current
    if (!row) return undefined
    const ro = new window.ResizeObserver(() => measureRows())
    ro.observe(row)
    return () => ro.disconnect()
  }, [measureRows, sortedOptions.length, selected.join(','), expanded])

  const toggle = (slug) => {
    if (disabled || typeof onChange !== 'function') return
    const cur = uncapped ? normalizeLoungeProfileCategoryPills(selected) : normalizeLoungePostCategoryPills(selected)
    const idx = cur.indexOf(slug)
    if (idx >= 0) {
      onChange(cur.filter((s) => s !== slug))
      return
    }
    if (atMax) return
    bumpLoungeCategoryPillUsage([slug])
    setUsageCounts(readLoungeCategoryPillUsageCounts())
    onChange([...cur, slug])
  }

  const showExpandToggle = collapsibleSingleRow && (hasHiddenRows || expanded)

  return (
    <div className={`mt-2 ${className}`.trim()}>
      {hint ? (
        <p className="mb-1.5 text-[11px] leading-snug text-zinc-500">{hint}</p>
      ) : null}
      <div className="relative min-w-0">
        <div
          ref={clipRef}
          className="overflow-hidden"
          style={
            collapsibleSingleRow && !expanded && rowHeightPx
              ? { maxHeight: rowHeightPx }
              : undefined
          }
        >
          <div
            ref={rowRef}
            className={`lounge-pill-row flex flex-wrap gap-1.5 ${showExpandToggle ? 'pr-7' : ''}`}
            data-lounge-category-picker=""
          >
            {sortedOptions.map(({ slug, label }) => {
              const on = selected.includes(slug)
              const chipDisabled = disabled || (!on && atMax)
              return (
                <button
                  key={slug}
                  type="button"
                  data-lounge-category-slug={slug}
                  disabled={chipDisabled}
                  aria-pressed={on}
                  onClick={() => toggle(slug)}
                  className={`lounge-category-pill inline-flex max-w-full touch-manipulation items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-tight transition-colors [-webkit-tap-highlight-color:transparent] ${
                    on
                      ? loungePostCategoryPillChipClass(slug, 'selected')
                      : chipDisabled
                        ? 'cursor-not-allowed border-zinc-700/60 bg-zinc-900/40 text-zinc-600 opacity-60'
                        : loungePostCategoryPillChipClass(slug, 'idle')
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {showExpandToggle ? (
          <button
            type="button"
            disabled={disabled}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show fewer tribes' : 'Show all tribes'}
            title={expanded ? 'Show fewer tribes' : 'Show all tribes'}
            onClick={() => setExpanded((v) => !v)}
            className="absolute right-0 top-0 flex touch-manipulation items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
            style={{
              width: rowHeightPx ?? 24,
              height: rowHeightPx ?? 24,
            }}
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
              <path
                d="M5 8l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}
