import {
  formatCompactStatCount,
  fullStatCountTitle,
  loungeInteractionStatCountCellClass,
} from '../../utils/formatCompactStatCount.js'
import LoungeFeedStatSlot from './LoungeFeedStatSlot.jsx'

/**
 * One flex child for **`justify-content: space-between`** on four primary glyphs: **track width =
 * icon slot only**. Counts render `absolute left-full` so they do not affect inter-icon gap math
 * ((L − Σwᵢ) / (n − 1) for n icons).
 * @param {'center' | 'start'} [props.railAlign='center'] - `start`: left-align the glyph box in the rail; use on the **post detail header** interaction row (`SocialFeed.jsx`) so the comment count clears the caption edge. Feed cards and `LoungePostInteractionBar` stay **`center`**.
 */
export function LoungeInteractionGlyphRail({
  railRef,
  extraAfterStat,
  slotPx,
  glyphPx,
  railMinH,
  readOnly,
  title,
  onReadOnlyClick,
  onClick,
  statClass,
  glyph,
  countClass,
  countValue,
  railAlign = 'center',
  pillOverlay = false,
}) {
  const showCount = typeof countValue === 'number' && Number.isFinite(countValue) && countValue > 0
  const outerJustify = railAlign === 'start' ? 'justify-start' : 'justify-center'
  const statClassMerged =
    railAlign === 'start' ? `${statClass} w-full min-w-0 justify-start`.trim() : statClass

  if (pillOverlay) {
    const countEl =
      showCount ? (
        <span
          className={`shrink-0 tabular-nums leading-none ${countClass}`}
          title={fullStatCountTitle(countValue)}
        >
          {formatCompactStatCount(countValue)}
        </span>
      ) : null
    return (
      <div
        ref={railRef}
        className={`relative flex shrink-0 flex-none items-center self-center overflow-visible ${outerJustify}`}
        style={{ minHeight: railMinH }}
      >
        <LoungeFeedStatSlot
          readOnly={readOnly}
          title={title}
          onReadOnlyClick={onReadOnlyClick}
          onClick={onClick}
          className={statClassMerged}
        >
          <span className="inline-flex items-center gap-1.5">
            {glyph}
            {countEl}
          </span>
        </LoungeFeedStatSlot>
        {extraAfterStat}
      </div>
    )
  }

  const innerSpanClass =
    railAlign === 'start' ? 'relative ml-0 block overflow-visible' : 'relative mx-auto block overflow-visible'
  return (
    <div
      ref={railRef}
      className={`relative flex shrink-0 flex-none items-center ${outerJustify} self-center overflow-visible`}
      style={{ width: slotPx, minWidth: slotPx, minHeight: railMinH }}
    >
      <LoungeFeedStatSlot
        readOnly={readOnly}
        title={title}
        onReadOnlyClick={onReadOnlyClick}
        onClick={onClick}
        className={statClassMerged}
      >
        <span className={innerSpanClass} style={{ width: slotPx, height: glyphPx }}>
          <span
            className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center justify-center"
            style={{ width: slotPx, height: glyphPx }}
          >
            {glyph}
          </span>
          {showCount ? (
            <span
              className={`${loungeInteractionStatCountCellClass} absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-left tabular-nums leading-none ${countClass}`}
              title={fullStatCountTitle(countValue)}
            >
              {formatCompactStatCount(countValue)}
            </span>
          ) : null}
        </span>
      </LoungeFeedStatSlot>
      {extraAfterStat}
    </div>
  )
}
