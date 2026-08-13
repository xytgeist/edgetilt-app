import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderRichCaption, truncateCaptionForDisplay } from './loungeCaption.jsx'
import { LOUNGE_CAPTION_DISPLAY_MAX, LOUNGE_CAPTION_DISPLAY_MAX_LINES } from '../../utils/loungeCommentLimits.js'
import { useLoungeMarketFeedQuotes } from './LoungeMarketFeedContext.jsx'

/**
 * Rich caption with optional collapse at {@link LOUNGE_CAPTION_DISPLAY_MAX} chars /
 * {@link LOUNGE_CAPTION_DISPLAY_MAX_LINES} lines + inline Show more.
 *
 * Lightbox: pass `collapsedLines` + `expandedMaxLines` for CSS visual-line clamp then a
 * fixed-height scroll box (newline truncate is not enough for wrapped prose).
 *
 * @param {{
 *   text: string,
 *   className?: string,
 *   moreClassName?: string,
 *   displayMax?: number,
 *   displayMaxLines?: number,
 *   collapsedLines?: number,
 *   expandedMaxLines?: number,
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
    const rich = renderRichCaption(source, mergedCaptionOpts)
    if (!rich) return null
    const showMore = cssOverflows && !expanded
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

    return (
      <span className={`min-w-0 max-w-full ${className}`.trim()}>
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
        {showMore ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setExpanded(true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`mt-0.5 block ${moreClassName}`}
          >
            Show more
          </button>
        ) : null}
      </span>
    )
  }

  const showMore = isTruncated && !expanded
  const displayText = showMore ? preview : source
  const rich = renderRichCaption(displayText, mergedCaptionOpts)
  if (!rich) return null

  return (
    <span className={`min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`.trim()}>
      {rich}
      {showMore ? (
        <>
          {'… '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setExpanded(true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`inline ${moreClassName}`}
          >
            Show more
          </button>
        </>
      ) : null}
    </span>
  )
}
