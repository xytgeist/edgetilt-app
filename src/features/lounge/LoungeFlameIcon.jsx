/** Poker chip + heart like icon - simplified for ~22px (no rim micro-hearts). */
import {
  formatCompactStatCount,
  fullStatCountTitle,
  loungeInteractionStatCountCellClass,
  loungeInteractionStatGridClass,
} from '../../utils/formatCompactStatCount.js'

const CHIP_RED = '#fd262d'

const HEART =
  'M12 17.15C9.35 14.85 7.85 13.35 7.85 11.2c0-1.55 1.15-2.65 2.55-2.65.75 0 1.45.35 2.05.95.6-.6 1.3-.95 2.05-.95 1.4 0 2.55 1.1 2.55 2.65 0 2.15-1.5 3.65-4.15 5.95z'

/** Shared nudge so liked / unliked icons align in the same slot. */
const HEART_NUDGE_X = -0.45
const HEART_NUDGE_Y = -0.4

/**
 * Icon + count. Default `grid`: fixed icon track + `6ch` count track (no chip shift at 0 → 1).
 * `trailing-fixed` / `leading-fixed`: flex row for **gutter** rows where the **icon** must stay
 * pinned to the outer edge of its half-column; count sits in a reserved `6ch` cell beside it.
 *
 * @param {'grid' | 'leading-fixed' | 'trailing-fixed'} [props.clusterLayout='grid']
 */
export function LoungeLikeStatContent({
  iconClassName = 'h-[22px] w-[22px]',
  countClassName = '',
  liked = false,
  readOnly = false,
  likeCount,
  iconPx = 22,
  clusterLayout = 'grid',
}) {
  const showCount = Number.isFinite(likeCount) && likeCount > 0
  const countLabel = showCount ? formatCompactStatCount(likeCount) : null
  const countTitle = showCount ? fullStatCountTitle(likeCount) : undefined
  const clusterMinW = `calc(${iconPx}px + 0.375rem + 6ch)`

  if (clusterLayout === 'leading-fixed') {
    return (
      <span
        className="inline-flex shrink-0 flex-row items-center justify-start gap-x-1.5 self-center"
        style={{ minWidth: clusterMinW }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: iconPx, height: iconPx }}
        >
          <LoungeFlameIcon className={iconClassName} liked={liked} readOnly={readOnly} />
        </span>
        <span
          className={`${loungeInteractionStatCountCellClass} min-w-[6ch] shrink-0 text-left ${countClassName}`}
          title={countTitle}
          aria-hidden={!showCount}
        >
          {countLabel}
        </span>
      </span>
    )
  }

  if (clusterLayout === 'trailing-fixed') {
    return (
      <span
        className="inline-flex shrink-0 flex-row items-center justify-end gap-x-1.5 self-center"
        style={{ minWidth: clusterMinW }}
      >
        <span
          className={`${loungeInteractionStatCountCellClass} min-w-[6ch] shrink-0 text-right ${countClassName}`}
          title={countTitle}
          aria-hidden={!showCount}
        >
          {countLabel}
        </span>
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: iconPx, height: iconPx }}
        >
          <LoungeFlameIcon className={iconClassName} liked={liked} readOnly={readOnly} />
        </span>
      </span>
    )
  }

  return (
    <span
      className={loungeInteractionStatGridClass}
      style={{
        /** Match comment/repost/bookmark: fixed icon track + `6ch` count track (no row jump at 0 → 1). */
        gridTemplateColumns: `${iconPx}px 6ch`,
      }}
    >
      <span className="flex w-full items-center justify-center">
        <LoungeFlameIcon className={iconClassName} liked={liked} readOnly={readOnly} />
      </span>
      <span
        className={`${loungeInteractionStatCountCellClass} ${countClassName}`}
        title={countTitle}
        aria-hidden={!showCount}
      >
        {countLabel}
      </span>
    </span>
  )
}

export default function LoungeFlameIcon({ className = 'h-[22px] w-[22px]', liked = false, readOnly = false }) {
  const lit = liked && !readOnly
  /** Idle chip: one dashed ring + heart outline at full `currentColor` so it matches other ~1.35px outline glyphs (no stacked low-opacity rings). */
  const idleStrokeOpacity = readOnly ? 0.35 : 1
  const faceOpacity = readOnly ? 0.2 : 0.95

  /** Outer dashed rim stroke edge ≈ 9.25 + 0.8 - align red outline flush with that perimeter */
  const outerRedR = 9.79
  const outerRedStroke = 0.52

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      {lit ? (
        <circle
          cx="12"
          cy="12"
          r={outerRedR}
          fill="none"
          stroke={CHIP_RED}
          strokeWidth={outerRedStroke}
          strokeOpacity={readOnly ? 0.35 : 1}
        />
      ) : null}
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth={lit ? 1.6 : 1.35}
        strokeDasharray="2.85 2.15"
        fill="none"
        strokeOpacity={lit ? 1 : idleStrokeOpacity}
      />
      {lit ? (
        <>
          <circle cx="12" cy="12" r="8.35" fill="#fafafa" fillOpacity={faceOpacity} />
          <circle
            cx="12"
            cy="12"
            r="7.05"
            fill="none"
            stroke="#f2f2f2"
            strokeWidth="1"
            strokeOpacity={readOnly ? 0.25 : 0.95}
          />
          <circle
            cx="12"
            cy="12"
            r="7.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeOpacity={readOnly ? 0.3 : 0.68}
          />
        </>
      ) : null}
      {/* Heart after face + inset rings so the tip isn’t covered by those strokes */}
      <g transform={`translate(${HEART_NUDGE_X}, ${HEART_NUDGE_Y})`}>
        <path
          d={HEART}
          fill={lit ? CHIP_RED : 'none'}
          stroke={lit ? '#c0151c' : 'currentColor'}
          strokeWidth={lit ? 0.38 : 1.05}
          strokeLinejoin="round"
          fillOpacity={readOnly ? 0.25 : lit ? 1 : 0}
          strokeOpacity={lit ? (readOnly ? 0.35 : 1) : idleStrokeOpacity}
        />
      </g>
    </svg>
  )
}
