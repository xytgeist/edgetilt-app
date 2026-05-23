/**
 * Pull-to-refresh chrome below a pinned header row (feed filters, notifications bar, etc.).
 * Pair with `useLoungePullToRefresh` and pass the same refs.
 */
export default function LoungePullRefreshZone({
  pullRefreshZoneRef,
  pullIndicatorOverlayRef,
  pullIndicatorWrapRef,
  pullArrowRef,
  pullSpinnerRef,
  pullAriaRef,
  pullPostsWrapRef,
  children,
  className = '',
  postsWrapClassName = '',
  /** When true, render a rule under the header row; pull chrome sits below it (notifications). */
  leadingDivider = false,
}) {
  return (
    <div ref={pullRefreshZoneRef} className={`relative ${className}`.trim()}>
      {leadingDivider ? (
        <div className="-mx-3 shrink-0 border-b border-zinc-800/70" aria-hidden />
      ) : null}
      <div className="relative min-h-0">
        <div
          ref={pullIndicatorOverlayRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-end justify-center overflow-hidden text-zinc-400"
          style={{ height: 0, opacity: 0 }}
          aria-live="polite"
        >
          <div
            ref={pullIndicatorWrapRef}
            className="flex h-9 items-center justify-center px-3 pb-1"
            role="status"
            aria-label="Pull down to refresh"
          >
            <svg
              ref={pullArrowRef}
              className="h-4 w-4 transition-transform duration-200 ease-out"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
              <path
                d="M5 7.5l5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              ref={pullSpinnerRef}
              className="hidden h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400"
              aria-hidden
            />
            <span ref={pullAriaRef} className="sr-only">
              Pull down to refresh
            </span>
          </div>
        </div>

        <div
          ref={pullPostsWrapRef}
          className={`relative z-0 will-change-transform ${postsWrapClassName}`.trim()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
