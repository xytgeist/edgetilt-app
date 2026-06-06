import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getComposerCaretClientRect, isRichComposerElement } from './loungeRichComposerDom.js'
import LoungeMarketSearchResultRow from './LoungeMarketSearchResultRow.jsx'

const GAP_PX = 6
const VIEWPORT_PAD_PX = 10
const MAX_DROPDOWN_PX = 360
const MIN_DROPDOWN_PX = 120
const MIN_DROPDOWN_WIDTH_PX = 300

/** Keep dropdown fully on-screen: cap height to viewport band + scroll list body. */
function measureCashtagDropdownPos(anchorEl, caretFieldEl) {
  const anchor = anchorEl.getBoundingClientRect()
  const caret =
    caretFieldEl && isRichComposerElement(caretFieldEl)
      ? getComposerCaretClientRect(caretFieldEl)
      : null

  const anchorTop = caret ? caret.bottom : anchor.bottom
  const flipTop = caret ? caret.top : anchor.top
  const anchorLeft = caret ? caret.left : anchor.left

  const vv = window.visualViewport
  const vTop = (vv?.offsetTop ?? 0) + VIEWPORT_PAD_PX
  const vBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - VIEWPORT_PAD_PX
  const vWidth = vv?.width ?? window.innerWidth

  const spaceBelow = Math.max(0, vBottom - anchorTop - GAP_PX)
  const spaceAbove = Math.max(0, flipTop - vTop - GAP_PX)
  const maxCap = Math.min(MAX_DROPDOWN_PX, Math.round((vBottom - vTop) * 0.45))

  const openUp = spaceBelow < MIN_DROPDOWN_PX && spaceAbove > spaceBelow
  const maxHeight = Math.max(MIN_DROPDOWN_PX, Math.min(maxCap, openUp ? spaceAbove : spaceBelow))

  let top = openUp ? flipTop - GAP_PX - maxHeight : anchorTop + GAP_PX
  if (top < vTop) top = vTop
  if (top + maxHeight > vBottom) top = Math.max(vTop, vBottom - maxHeight)

  const width = Math.max(MIN_DROPDOWN_WIDTH_PX, Math.min(Math.max(anchor.width, MIN_DROPDOWN_WIDTH_PX), vWidth - VIEWPORT_PAD_PX * 2))
  let left = Math.max(anchor.left, Math.min(anchorLeft, anchor.right - 120))
  left = Math.max(VIEWPORT_PAD_PX, Math.min(left, vWidth - VIEWPORT_PAD_PX - width))

  return { top, left, width, maxHeight }
}

/**
 * Autocomplete dropdown for `$` cashtag market symbol search.
 */
export default function LoungeCashtagDropdown({
  open = false,
  suggestions = [],
  activeIndex = 0,
  loading = false,
  query = '',
  onSelect,
  anchorRef,
  caretFieldRef,
  zIndex = 9999,
}) {
  const ref = useRef(null)
  const listRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current || !ref.current) {
      setPos(null)
      return undefined
    }

    const updatePos = () => {
      if (!anchorRef?.current || !ref.current) return
      setPos(measureCashtagDropdownPos(anchorRef.current, caretFieldRef?.current))
    }

    updatePos()
    const vv = window.visualViewport
    vv?.addEventListener('resize', updatePos)
    vv?.addEventListener('scroll', updatePos)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      vv?.removeEventListener('resize', updatePos)
      vv?.removeEventListener('scroll', updatePos)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open, suggestions.length, loading, activeIndex, anchorRef, caretFieldRef, query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cashtag-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, suggestions.length])

  if (!open) return null

  const showEmptyHint = !loading && !query
  const showNoResults = !loading && query && suggestions.length === 0
  const hasList = suggestions.length > 0

  const content = (
    <div
      ref={ref}
      role="listbox"
      aria-label="Market symbol suggestions"
      style={{
        position: 'fixed',
        zIndex,
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: pos?.width ?? 'auto',
        maxHeight: pos?.maxHeight ?? MAX_DROPDOWN_PX,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="flex flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/98 shadow-2xl backdrop-blur-sm"
    >
      {loading && suggestions.length === 0 ? (
        <div className="shrink-0 px-3 py-2.5 text-[13px] text-zinc-500">Searching…</div>
      ) : null}
      {showEmptyHint ? (
        <div className="shrink-0 px-3 py-2.5 text-[13px] text-zinc-500">Type a ticker or name…</div>
      ) : null}
      {showNoResults ? (
        <div className="shrink-0 px-3 py-2.5 text-[13px] text-zinc-500">No matches.</div>
      ) : null}
      {hasList ? (
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        >
          {suggestions.map((row, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={`${row.asset_class}:${row.symbol}`}
                data-cashtag-idx={i}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect?.(row)
                }}
                className={`w-full px-3 py-2 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                  isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                }`}
              >
                <LoungeMarketSearchResultRow row={row} variant="compact" />
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )

  return createPortal(content, document.body)
}
