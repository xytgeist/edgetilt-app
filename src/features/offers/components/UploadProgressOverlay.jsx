export default function UploadProgressOverlay({ show, message, onCancel }) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-blue-500/40 bg-zinc-950/95 p-5 shadow-2xl shadow-black/60">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-blue-200 text-xs font-semibold uppercase tracking-wide">Bulk import in progress</span>
        </div>
        <div className="text-white text-base font-semibold leading-relaxed">{message}</div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 w-full rounded-2xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 touch-manipulation transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
