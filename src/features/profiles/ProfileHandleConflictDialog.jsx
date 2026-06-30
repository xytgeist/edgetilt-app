import { createPortal } from 'react-dom'

/**
 * Handle taken / reserved - offer a suggested alternative before save.
 */
export default function ProfileHandleConflictDialog({
  open,
  busy = false,
  requestedHandle,
  reason,
  suggestedHandle,
  onCancel,
  onUseSuggested,
}) {
  if (!open || typeof document === 'undefined') return null

  const handleLabel = requestedHandle ? `@${requestedHandle}` : '@handle'
  const suggestedLabel = suggestedHandle ? `@${suggestedHandle}` : null
  const title = reason === 'reserved' ? 'Handle reserved' : 'Handle unavailable'
  const body =
    reason === 'reserved'
      ? `${handleLabel} is reserved on Edge and cannot be used.`
      : `${handleLabel} is already taken by another account.`

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="profile-handle-conflict-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default touch-manipulation"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (busy) return
          onCancel?.()
        }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
        <h2 id="profile-handle-conflict-title" className="text-[16px] font-bold text-white">
          {title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">{body}</p>
        {suggestedLabel ? (
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
            Try{' '}
            <span className="font-semibold text-cyan-200">{suggestedLabel}</span> instead?
          </p>
        ) : (
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">
            Pick a different handle and try again.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel?.()}
            className="min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-50 sm:w-auto"
          >
            Edit handle
          </button>
          {suggestedLabel ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUseSuggested?.(suggestedHandle)}
              className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
            >
              Use {suggestedLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
