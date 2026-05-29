import { QUICK_LINK_BY_ID } from '../features/shell/quickLinkDestinations.js'
import { QUICK_LINK_MAX } from '../features/shell/quickLinkDestinations.js'
import { setQuickLinkEnabled } from '../features/shell/quickLinksStore.js'

/**
 * @param {{
 *   open: boolean,
 *   pendingId: string | null,
 *   activeIds: string[],
 *   onClose: () => void,
 *   onEnabled?: (id: string) => void,
 * }} props
 */
export default function QuickLinkAtCapModal({
  open,
  pendingId,
  activeIds,
  onClose,
  onEnabled,
}) {
  if (!open || !pendingId) return null
  const pending = QUICK_LINK_BY_ID[pendingId]
  const pendingLabel = pending?.label || pendingId

  const toggleOff = (id) => {
    setQuickLinkEnabled(id, false)
    const result = setQuickLinkEnabled(pendingId, true)
    if (result.ok) {
      onEnabled?.(pendingId)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        data-quick-link-modal
        className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700/60 px-5 py-5 shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="quick-link-cap-title"
      >
        <h2 id="quick-link-cap-title" className="text-white font-bold text-lg mb-2">
          Quick link limit
        </h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
          You can pin up to {QUICK_LINK_MAX} tools to the title bar. Turn one off below to add{' '}
          <span className="text-zinc-200 font-semibold">{pendingLabel}</span>.
        </p>
        <div className="space-y-2 mb-4">
          {activeIds.map(id => {
            const dest = QUICK_LINK_BY_ID[id]
            if (!dest) return null
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-800/80 px-4 py-3"
              >
                <span className="text-white text-sm font-semibold">{dest.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked="true"
                  onClick={() => toggleOff(id)}
                  className="relative h-7 w-12 shrink-0 rounded-full bg-cyan-600 touch-manipulation"
                >
                  <span className="absolute top-0.5 left-[22px] h-6 w-6 rounded-full bg-white shadow transition-transform" />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-11 rounded-2xl bg-zinc-800 text-zinc-300 font-semibold touch-manipulation active:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
