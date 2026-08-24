import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import PokerStableCommitSyncPanel from './PokerStableCommitSyncPanel.jsx'

/**
 * Global sync modal for counterparty-recorded Stable commits (Alerts / push deep links).
 */
export default function PokerStableCommitSyncModal({
  supabaseClient,
  userId,
  commitId,
  onClose,
  onSynced,
  onError,
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-x-hidden bg-black/60 p-4 backdrop-blur-sm"
      style={{ zIndex: Z_APP_MODAL }}
      onClick={onClose}
    >
      <div
        data-poker-stable-commit-sync-modal
        className="relative z-10 w-full max-w-lg max-h-[min(90dvh,calc(100dvh-max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px))-2rem))] overflow-y-auto rounded-3xl border border-zinc-700/50 bg-zinc-900 px-5 py-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Settlement</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        <PokerStableCommitSyncPanel
          variant="modal"
          supabaseClient={supabaseClient}
          userId={userId}
          commitId={commitId}
          onClose={onClose}
          onSynced={onSynced}
          onError={onError}
        />
      </div>
    </div>
  )
}
