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
  size = 'md',
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
    if (clip && collapsibleSingleRow && !expanded) {
      setHasHiddenRows(row.scrollWidth > clip.clientWidth + 1)
      return
    }
    if (collapsibleSingleRow) {
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
    const clip = clipRef.current
    if (!row) return undefined
    const ro = new window.ResizeObserver(() => measureRows())
    ro.observe(row)
    if (clip) ro.observe(clip)
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
  const collapsedSingleRow = collapsibleSingleRow && !expanded
  const caretSize = rowHeightPx ?? 24

  const expandToggleButton = showExpandToggle ? (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={expanded}
      aria-label={expanded ? 'Show fewer tribes' : 'Show all tribes'}
      title={expanded ? 'Show fewer tribes' : 'Show all tribes'}
      onClick={() => setExpanded((v) => !v)}
      className="lounge-category-pill-expand pointer-events-auto flex shrink-0 touch-manipulation items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
      style={{
        width: caretSize,
        height: caretSize,
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
  ) : null

  const isLg = size === 'lg'

  return (
    <div className={`mt-2 ${className}`.trim()} data-lounge-composer-category="">
      {hint ? (
        <p className={`mb-1.5 leading-snug text-zinc-500 ${isLg ? 'text-[13px]' : 'text-[11px]'}`}>{hint}</p>
      ) : null}
      <div className="relative min-w-0">
        <div
          ref={clipRef}
          className={
            collapsedSingleRow
              ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
              : 'overflow-hidden'
          }
          style={
            collapsedSingleRow && rowHeightPx
              ? { maxHeight: rowHeightPx }
              : undefined
          }
        >
          <div
            ref={rowRef}
            className={`lounge-pill-row flex ${isLg ? 'gap-2' : 'gap-1.5'} ${
              collapsedSingleRow ? 'w-max min-w-full flex-nowrap' : 'flex-wrap'
            } ${collapsedSingleRow && showExpandToggle ? 'pr-8' : ''}`}
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
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => toggle(slug)}
                  className={`lounge-category-pill inline-flex max-w-full shrink-0 touch-manipulation items-center truncate rounded-full border leading-none tracking-tight transition-colors [-webkit-tap-highlight-color:transparent] ${
                    isLg ? 'px-3 py-1 text-[13px] font-semibold' : 'px-2 py-0.5 text-[10px] font-semibold'
                  } ${
                    on
                      ? loungePostCategoryPillChipClass(slug, 'selected')
                      : chipDisabled
                        ? 'cursor-not-allowed border-zinc-700 bg-zinc-800 text-zinc-500'
                        : loungePostCategoryPillChipClass(slug, 'idle')
                  }`}
                >
                  {label}
                </button>
              )
            })}
            {/* Expanded: caret sits in-flow so no full-height side shade. */}
            {!collapsedSingleRow && expandToggleButton ? (
              <span className="inline-flex shrink-0 self-center">{expandToggleButton}</span>
            ) : null}
          </div>
        </div>
        {/* Collapsed: single-row fade + caret only (never stretches over wrap). */}
        {collapsedSingleRow && showExpandToggle ? (
          <div
            className="pointer-events-none absolute top-0 right-0 z-10 flex items-center"
            style={{ height: caretSize }}
          >
            <div
              className="lounge-category-pill-fade h-full w-6"
              aria-hidden
            />
            {expandToggleButton}
          </div>
        ) : null}
      </div>
    </div>
  )
}
