/**
 * Foreground Lounge activity alert - shown instead of an OS push when the app tab is focused.
 */
export default function LoungeActivityInAppToast({ toast, onDismiss, onOpen }) {
  if (!toast?.body) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-[120] w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2"
      style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <div className="flex w-full items-start gap-2 rounded-xl border border-cyan-500/50 bg-zinc-950/95 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => onOpen?.(toast)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-1 py-1 text-left touch-manipulation active:scale-[0.99]"
        >
          <img
            src={toast.icon || '/android-icon-192x192.png'}
            alt=""
            className="mt-0.5 h-9 w-9 shrink-0 rounded-lg bg-zinc-900 object-cover"
            width={36}
            height={36}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-snug text-cyan-100">
              {toast.title || 'Edge Lounge'}
            </span>
            <span className="mt-0.5 block text-[14px] font-medium leading-snug text-zinc-100">
              {toast.body}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss?.()}
          className="shrink-0 rounded-lg px-2 py-1 text-[18px] leading-none text-zinc-400 touch-manipulation hover:bg-zinc-800/80 hover:text-zinc-200"
        >
          ×
        </button>
      </div>
    </div>
  )
}
