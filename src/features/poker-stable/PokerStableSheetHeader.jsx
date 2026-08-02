/**
 * Stable sheet title + sticky upper-right close (button only ... no title bar chrome).
 */
export default function PokerStableSheetHeader({
  title,
  subtitle = null,
  onClose,
  disabled = false,
  children = null,
}) {
  return (
    <>
      <div className="pointer-events-none sticky top-0 z-30 -mt-5 flex h-0 justify-end pt-5">
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          data-poker-stable-sheet-close
          className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation active:bg-zinc-700 disabled:opacity-50"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="mb-4 pr-10">
        {children ?? (
          <>
            <h3 className="text-lg font-bold leading-snug text-white">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
          </>
        )}
      </div>
    </>
  )
}
