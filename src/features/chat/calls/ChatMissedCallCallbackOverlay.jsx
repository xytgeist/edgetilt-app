import { createPortal } from 'react-dom'

/**
 * Prompt after opening a missed-call notification: open DM + offer callback.
 * @param {{
 *   open: boolean,
 *   title: string,
 *   isVideo?: boolean,
 *   busy?: boolean,
 *   onCallBack: () => void,
 *   onDismiss: () => void,
 * }} props
 */
export default function ChatMissedCallCallbackOverlay({
  open,
  title,
  isVideo = false,
  busy = false,
  onCallBack,
  onDismiss,
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-zinc-950/95 px-6 text-center"
      data-chat-feature
      role="dialog"
      aria-modal="true"
      aria-label="Missed call"
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-amber-400/90">
        Missed {isVideo ? 'video' : 'voice'} call
      </p>
      <h2 className="mt-3 max-w-sm text-[28px] font-black tracking-tight text-zinc-50">{title}</h2>
      <p className="mt-2 text-[15px] text-zinc-400">Call them back?</p>
      <div className="mt-12 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCallBack}
          className="min-h-12 rounded-2xl bg-emerald-500 px-4 text-[16px] font-bold text-zinc-950 touch-manipulation active:opacity-80 disabled:opacity-50"
        >
          Call back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation active:opacity-80 disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>,
    document.body,
  )
}
