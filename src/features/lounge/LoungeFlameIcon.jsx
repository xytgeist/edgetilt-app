/** Poker chip + heart like icon — simplified for ~20px (no rim micro-hearts). */
const CHIP_RED = '#ff3824'

const HEART =
  'M12 17.15C9.35 14.85 7.85 13.35 7.85 11.2c0-1.55 1.15-2.65 2.55-2.65.75 0 1.45.35 2.05.95.6-.6 1.3-.95 2.05-.95 1.4 0 2.55 1.1 2.55 2.65 0 2.15-1.5 3.65-4.15 5.95z'

/** Shared nudge so liked / unliked icons align in the same slot. */
const HEART_NUDGE_X = -0.45
const HEART_NUDGE_Y = -0.4

/**
 * Icon + count with fixed grid columns so the chip does not shift when the count changes.
 */
export function LoungeLikeStatContent({
  iconClassName = 'h-5 w-5',
  countClassName = '',
  liked = false,
  readOnly = false,
  likeCount,
  iconPx = 20,
}) {
  const countCol = iconPx >= 22 ? '0.875rem' : '0.8125rem'
  return (
    <span
      className="inline-grid items-center gap-x-1.5"
      style={{ gridTemplateColumns: `${iconPx}px ${countCol}` }}
    >
      <span className="flex items-center justify-center">
        <LoungeFlameIcon className={iconClassName} liked={liked} readOnly={readOnly} />
      </span>
      <span className={`tabular-nums leading-none ${countClassName}`}>
        {Number.isFinite(likeCount) ? likeCount : ''}
      </span>
    </span>
  )
}

export default function LoungeFlameIcon({ className = 'h-5 w-5', liked = false, readOnly = false }) {
  const lit = liked && !readOnly
  const rimOpacity = readOnly ? 0.35 : lit ? 1 : 0.5
  const faceOpacity = readOnly ? 0.2 : 0.95

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      {lit ? (
        <circle
          cx="12"
          cy="12"
          r="9.55"
          fill="none"
          stroke={CHIP_RED}
          strokeWidth="0.65"
          strokeOpacity={readOnly ? 0.35 : 1}
        />
      ) : null}
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="2.85 2.15"
        fill="none"
        strokeOpacity={rimOpacity}
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
      ) : (
        <circle
          cx="12"
          cy="12"
          r="7.1"
          stroke="currentColor"
          strokeWidth="0.75"
          strokeOpacity={readOnly ? 0.35 : 0.45}
          fill="none"
        />
      )}
      <g transform={`translate(${HEART_NUDGE_X}, ${HEART_NUDGE_Y})`}>
        {lit ? (
          <path
            d={HEART}
            fill="#fafafa"
            stroke="#fafafa"
            strokeWidth="1.55"
            strokeLinejoin="round"
            fillOpacity={readOnly ? 0.25 : 1}
          />
        ) : null}
        <path
          d={HEART}
          fill={lit ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          fillOpacity={readOnly ? 0.25 : lit ? 1 : 0}
        />
      </g>
    </svg>
  )
}
