/**
 * Sticky title row for scrollable Stable bottom sheets ... close stays reachable while scrolling.
 */
export default function PokerStableSheetHeader({
  title,
  subtitle = null,
  onClose,
  disabled = false,
  children = null,
}) {
  return (
    <div
      data-poker-stable-sheet-header
      className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-start justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/95 px-5 pb-3 pt-5 backdrop-blur-sm"
    >
      <div className="min-w-0 flex-1 pr-1">
        {children ?? (
          <>
            <h3 className="text-lg font-bold leading-snug text-white">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        data-poker-stable-sheet-close
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  )
}
