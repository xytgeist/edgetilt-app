/**
 * Top row for slot tool screens: centered overlay and/or trailing actions.
 *
 * Shortcut pins live on the Slots hub cards (not per-tool screens).
 *
 * @param {{
 *   center?: React.ReactNode,
 *   trailing?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export default function SlotsToolPageHeader({
  center = null,
  trailing = null,
  className = '',
}) {
  if (!trailing && !center) return null

  if (center) {
    return (
      <div
        className={`relative mb-3 flex min-h-10 w-full items-center ${className}`}
        data-slots-tool-top-bar
      >
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-1">
          <div className="pointer-events-auto min-w-0 max-w-[min(20rem,calc(100%-8.5rem))]">
            {center}
          </div>
        </div>
        {trailing ? (
          <div className="relative z-10 ml-auto flex shrink-0 items-center">
            {trailing}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`mb-3 flex w-full items-center gap-2 ${className}`}
      data-slots-tool-top-bar
    >
      {trailing ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
