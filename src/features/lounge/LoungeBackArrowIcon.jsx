/**
 * Geometry-stable back chevron for frosted circle buttons.
 * Text `←` uses platform font metrics … Android Chrome often looks vertically off-center.
 */
export default function LoungeBackArrowIcon({
  className = 'h-5 w-5 shrink-0',
  strokeWidth = 2.5,
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-lounge-back-arrow=""
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
