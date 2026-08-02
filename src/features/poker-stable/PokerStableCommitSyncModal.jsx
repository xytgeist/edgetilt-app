import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { loadDealCommit, syncDealCommit } from './pokerStableApi.js'
import { pokerStableCommitEventLabel, pokerStableCommitSummaryLine } from './pokerStableActivity.js'
import { stableCommitSyncHint } from './pokerStableBooksCopy.js'

/**
 * Global sync modal for counterparty-recorded Stable commits (from Alerts / push).
 */
export default function PokerStableCommitSyncModal({
  supabaseClient,
  userId,
  commitId,
  onClose,
  onSynced,
  onError,
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [commit, setCommit] = useState(null)
  const [deal, setDeal] = useState(null)
  const [actorProfile, setActorProfile] = useState(null)

  const loadBundle = useCallback(async () => {
    if (!supabaseClient || !commitId || !userId) return
    setLoading(true)
    onError?.('')
    try {
      const { commit: commitRow, error: cErr } = await loadDealCommit(supabaseClient, commitId)
      if (cErr) throw cErr
      if (!commitRow) throw new Error('Stake commit not found.')

      const [{ data: dealRow }, { data: actor }] = await Promise.all([
        supabaseClient
          .from('poker_stable_deals')
          .select('id, label, deal_type, stakee_user_id, status, baseline_bankroll')
          .eq('id', commitRow.deal_id)
          .maybeSingle(),
        supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('user_id', commitRow.recorded_by_user_id)
          .maybeSingle(),
      ])

      setCommit(commitRow)
      setDeal(dealRow || null)
      setActorProfile(actor || null)
    } catch (e) {
      onError?.(e?.message || 'Could not load stake commit.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, commitId, userId, onError])

  useEffect(() => {
    void loadBundle()
  }, [loadBundle])

  const actorLabel = useMemo(() => {
    const name = String(actorProfile?.display_name || '').trim()
    if (name) return name
    const handle = String(actorProfile?.handle || '').trim()
    if (handle) return `@${handle}`
    return 'Counterparty'
  }, [actorProfile])

  const alreadyMine = commit?.recorded_by_user_id === userId
  const isStakee = deal?.stakee_user_id === userId
  const isSettleCommit =
    commit?.event_kind === 'periodic_settle' || commit?.event_kind === 'close_settle'

  async function onSync() {
    if (!commit || alreadyMine) return
    setSaving(true)
    onError?.('')
    try {
      const { error, status } = await syncDealCommit(supabaseClient, commit.id)
      if (error) throw error
      triggerTapHapticLight()
      onSynced?.({ status, dealId: commit.deal_id })
      onClose?.()
    } catch (e) {
      onError?.(e?.message || 'Could not sync commit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
      onClick={onClose}
    >
      <div
        data-poker-stable-commit-sync-modal
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Sync stake update</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : !commit ? (
          <p className="text-sm text-rose-300">Commit not found.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-300">
              <span className="font-semibold text-white">{actorLabel}</span> recorded{' '}
              <span className="font-semibold text-cyan-200">
                {pokerStableCommitEventLabel(commit.event_kind)}
              </span>{' '}
              on{' '}
              <span className="font-semibold text-white">
                {deal?.label?.trim() || 'this stake'}
              </span>
              .
            </p>
            <p className="mb-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-xs leading-relaxed text-zinc-400">
              {pokerStableCommitSummaryLine(commit)}
            </p>
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              {stableCommitSyncHint(isStakee, isSettleCommit)} If you skip it, your books stay out of
              sync until you commit later from the stake card.
            </p>
            {alreadyMine ? (
              <p className="text-center text-sm text-emerald-400">You recorded this update.</p>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onSync()}
                className="w-full rounded-2xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Syncing…' : 'Commit to my books'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
