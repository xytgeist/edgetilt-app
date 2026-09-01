import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { truncateCaptionForDisplay } from './loungeCaption.jsx'
import { renderLoungeMarkdown } from './loungeMarkdown.jsx'
import { LOUNGE_CAPTION_DISPLAY_MAX, LOUNGE_CAPTION_DISPLAY_MAX_LINES } from '../../utils/loungeCommentLimits.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * Rich caption with optional collapse at {@link LOUNGE_CAPTION_DISPLAY_MAX} chars /
 * {@link LOUNGE_CAPTION_DISPLAY_MAX_LINES} lines + trailing `… see more`.
 * Feed does not expand in place … tapping the caption / see more opens post detail (parent handler).
 *
 * Lightbox: pass `collapsedLines` + `expandedMaxLines` (+ `expandOnTap`) for CSS visual-line
 * clamp with ellipsis; tap the caption to expand into a fixed-height scroll box.
 *
 * @param {{
 *   text: string,
 *   className?: string,
 *   moreClassName?: string,
 *   displayMax?: number,
 *   displayMaxLines?: number,
 *   collapsedLines?: number,
 *   expandedMaxLines?: number,
 *   expandOnTap?: boolean,
 *   startExpanded?: boolean,
 *   captionOpts?: object,
 * }} props
 */
export default function LoungeExpandableRichCaption({
  text,
  className = '',
  moreClassName = 'lounge-caption-more touch-manipulation [-webkit-tap-highlight-color:transparent]',
  displayMax = LOUNGE_CAPTION_DISPLAY_MAX,
  displayMaxLines = LOUNGE_CAPTION_DISPLAY_MAX_LINES,
  collapsedLines,
  expandedMaxLines,
  expandOnTap = false,
  startExpanded = false,
  captionOpts = {},
}) {
  const { cashtagQuotesByTicker } = useLoungeMarketFeedQuotes()
  const [expanded, setExpanded] = useState(startExpanded)
  const source = String(text ?? '')
  const clampRef = useRef(/** @type {HTMLSpanElement | null} */ (null))
  const [cssOverflows, setCssOverflows] = useState(false)

  const useCssClamp = Number.isFinite(collapsedLines) && collapsedLines > 0
  const scrollExpanded =
    useCssClamp && Number.isFinite(expandedMaxLines) && expandedMaxLines > 0

  useEffect(() => {
    setExpanded(startExpanded)
  }, [source, startExpanded])

  const { text: preview, isTruncated } = useMemo(
    () => truncateCaptionForDisplay(source, displayMax, displayMaxLines),
    [displayMax, displayMaxLines, source],
  )

  const mergedCaptionOpts = useMemo(
    () => ({
      ...captionOpts,
      cashtagQuotesByTicker: captionOpts.cashtagQuotesByTicker ?? cashtagQuotesByTicker,
    }),
    [captionOpts, cashtagQuotesByTicker],
  )

  useLayoutEffect(() => {
    if (!useCssClamp || expanded) {
      setCssOverflows(false)
      return undefined
    }
    const el = clampRef.current
    if (!el) return undefined
    const check = () => {
      setCssOverflows(el.scrollHeight > el.clientHeight + 1)
    }
    check()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', check)
      return () => window.removeEventListener('resize', check)
    }
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [useCssClamp, expanded, source, collapsedLines, mergedCaptionOpts])

  if (useCssClamp) {
    const rich = renderLoungeMarkdown(source, mergedCaptionOpts)
    if (!rich) return null
    const canTapExpand = expandOnTap && cssOverflows && !expanded
    const clampClass =
      !expanded && collapsedLines === 3
        ? 'line-clamp-3'
        : !expanded && collapsedLines === 2
          ? 'line-clamp-2'
          : !expanded && collapsedLines === 4
            ? 'line-clamp-4'
            : !expanded
              ? 'line-clamp-3'
              : ''
    const bodyClass = [
      'min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
      clampClass,
      canTapExpand ? 'cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]' : '',
      expanded && scrollExpanded
        ? 'block overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    // Match lightbox `leading-snug` (1.375) so N lines is a stable scroll viewport.
    const bodyStyle =
      expanded && scrollExpanded
        ? { maxHeight: `calc(${expandedMaxLines} * 1.375em)` }
        : undefined

    const onActivateExpand = (e) => {
      if (!canTapExpand) return
      if (e.target instanceof Element && e.target.closest('a, button')) return
      e.stopPropagation()
      e.preventDefault()
      setExpanded(true)
    }

    return (
      <span
        className={`min-w-0 max-w-full ${className}`.trim()}
        role={canTapExpand ? 'button' : undefined}
        tabIndex={canTapExpand ? 0 : undefined}
        onClick={onActivateExpand}
        onKeyDown={
          canTapExpand
            ? (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                onActivateExpand(e)
              }
            : undefined
        }
      >
        <span
          ref={clampRef}
          className={bodyClass}
          style={bodyStyle}
          data-lounge-lightbox-no-swipe={expanded && scrollExpanded ? '' : undefined}
          onPointerDown={(e) => {
            if (expanded && scrollExpanded) e.stopPropagation()
          }}
        >
          {rich}
        </span>
      </span>
    )
  }

  // Char/line path stays collapsed in the feed … `… see more` cues that full text is in post detail.
  // Do not expand in place here (no stopPropagation) so parent caption click can open detail.
  // `startExpanded` / lightbox CSS-clamp path above still expand in place.
  const showMoreCue = isTruncated && !expanded
  const displayText = showMoreCue ? preview : source
  const rich = renderLoungeMarkdown(displayText, mergedCaptionOpts)
  if (!rich) return null

  return (
    <span className={`min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`.trim()}>
      {rich}
      {showMoreCue ? (
        <>
          {'… '}
          <span className={`inline ${moreClassName}`}>see more</span>
        </>
      ) : null}
    </span>
  )
}
