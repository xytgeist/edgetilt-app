import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { syncDealCommit } from './pokerStableApi.js'
import { pokerStableCommitSummaryLine } from './pokerStableActivity.js'

/**
 * Full list of pending stake commits needing sync.
 */
export default function PokerStableAttentionSheet({
  supabaseClient,
  commits = [],
  saving = false,
  onSavingChange,
  onClose,
  onSynced,
  onOpenDeal,
  onError,
}) {
  async function onCommit(commitId) {
    if (!supabaseClient || !commitId) return
    onSavingChange?.(true)
    onError?.('')
    try {
      const { error } = await syncDealCommit(supabaseClient, commitId)
      if (error) throw error
      triggerTapHapticLight()
      await onSynced?.()
    } catch (e) {
      onError?.(e?.message || 'Could not sync.')
    } finally {
      onSavingChange?.(false)
    }
  }

  return (
    <div className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`} onClick={onClose}>
      <div
        data-poker-stable-attention-sheet
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Needs your attention</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400"
          >
            Close
          </button>
        </div>

        {commits.length === 0 ? (
          <p className="text-sm text-zinc-400">You&apos;re synced up.</p>
        ) : (
          <div className="space-y-3">
            {commits.map((row) => (
              <div
                key={row.commit_id}
                className="rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-3"
              >
                <p className="text-sm leading-relaxed text-zinc-200">
                  {pokerStableCommitSummaryLine(row)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onCommit(row.commit_id)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Commit to my books
                  </button>
                  {row.deal_id ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenDeal?.(row.deal_id)
                        onClose?.()
                      }}
                      className="rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-200"
                    >
                      Deal
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
