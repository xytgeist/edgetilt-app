import { useCallback, useEffect, useMemo, useState } from 'react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { loadDealCommit, loadDealSlices, loadSettlementBundle, syncDealCommit } from './pokerStableApi.js'
import { pokerStableCommitEventLabel, pokerStableCommitSummaryLine } from './pokerStableActivity.js'
import { STABLE_BACKER_BANKROLL_PHRASE, stableCommitSyncHint } from './pokerStableBooksCopy.js'
import {
  settlementBackerCredit,
  viewerBackingSlice,
} from './pokerStableDealHistory.js'
import { stableNum } from './pokerStableMath.js'
import { stakeeSkipsBackerCommitSync } from './pokerStableTerms.js'

/**
 * Global sync modal for counterparty-recorded Stable commits (from Alerts / push / stake card).
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
  const [settlement, setSettlement] = useState(null)
  const [playerPersonalCredit, setPlayerPersonalCredit] = useState(null)
  const [backerBackingCredit, setBackerBackingCredit] = useState(null)

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
          .select('id, label, deal_type, stakee_user_id, staker_user_id, status, baseline_bankroll')
          .eq('id', commitRow.deal_id)
          .maybeSingle(),
        supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('user_id', commitRow.recorded_by_user_id)
          .maybeSingle(),
      ])

      const isSettleCommit =
        commitRow.event_kind === 'periodic_settle' || commitRow.event_kind === 'close_settle'

      let nextSettlement = null
      let nextPlayerCredit = null
      let nextBackerCredit = null

      if (isSettleCommit && commitRow.ref_id) {
        const [{ settlement: st, lines, calc, error: stErr }, { byDeal, error: slErr }] =
          await Promise.all([
            loadSettlementBundle(supabaseClient, commitRow.ref_id),
            loadDealSlices(supabaseClient, [commitRow.deal_id]),
          ])
        if (stErr) throw stErr
        if (slErr) throw slErr
        nextSettlement = st
        nextPlayerCredit = calc ? stableNum(calc.player_net) : null
        const dealSlices = byDeal[commitRow.deal_id] || []
        if (dealRow && dealRow.stakee_user_id !== userId) {
          const slice = viewerBackingSlice(dealSlices, userId)
          const line = slice ? (lines || []).find((row) => row.slice_id === slice.id) || null : null
          if (slice) {
            nextBackerCredit = settlementBackerCredit(st, dealRow, slice, line)
          }
        }
      }

      setCommit(commitRow)
      setDeal(dealRow || null)
      setActorProfile(actor || null)
      setSettlement(nextSettlement)
      setPlayerPersonalCredit(nextPlayerCredit)
      setBackerBackingCredit(nextBackerCredit)
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
  const skipStakeeSync = stakeeSkipsBackerCommitSync(deal, userId, commit)
  const isSettleCommit =
    commit?.event_kind === 'periodic_settle' || commit?.event_kind === 'close_settle'
  const isCloseSettle = commit?.event_kind === 'close_settle'
  const showPlayerSettleCredit =
    isStakee && isSettleCommit && settlement && playerPersonalCredit != null
  const showBackerSettleCredit =
    !isStakee && isSettleCommit && settlement && backerBackingCredit != null
  const showSettleCredit = showPlayerSettleCredit || showBackerSettleCredit

  useEffect(() => {
    if (!loading && skipStakeeSync) {
      onClose?.()
    }
  }, [loading, skipStakeeSync, onClose])

  async function onSync() {
    if (!commit || alreadyMine) return
    setSaving(true)
    onError?.('')
    try {
      const { error, status } = await syncDealCommit(supabaseClient, commit.id)
      if (error) throw error
      triggerTapHapticLight()
      onSynced?.({ status, dealId: commit.deal_id, isStakee })
      onClose?.()
    } catch (e) {
      onError?.(e?.message || 'Could not sync commit.')
    } finally {
      setSaving(false)
    }
  }

  const title = isCloseSettle
    ? 'Close settlement'
    : isSettleCommit
      ? 'Periodic settlement'
      : 'Sync stake update'
  const intro =
    isSettleCommit && !alreadyMine
      ? `${actorLabel} logged a ${isCloseSettle ? 'close' : 'periodic'} settlement on ${deal?.label?.trim() || 'this stake'}. Review the details, then commit to update your books.`
      : `${actorLabel} recorded ${pokerStableCommitEventLabel(commit?.event_kind)} on ${deal?.label?.trim() || 'this stake'}.`

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-x-hidden bg-black/60 p-4 backdrop-blur-sm"
      style={{ zIndex: Z_APP_MODAL }}
      onClick={onClose}
    >
      <div
        data-poker-stable-commit-sync-modal
        className="relative z-10 w-full max-w-lg max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-2rem))] overflow-y-auto rounded-3xl border border-zinc-700/50 bg-zinc-900 px-5 py-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation"
          >
            Cancel
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : !commit ? (
          <p className="text-sm text-rose-300">Commit not found.</p>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-zinc-300">{intro}</p>

            {showSettleCredit ? (
              <>
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                  Roll {fmtPoker$(settlement.roll_at_settle)} · Baseline{' '}
                  {fmtPoker$(settlement.baseline_at_settle)} at settlement
                </p>
                {showPlayerSettleCredit ? (
                  <div
                    data-poker-stable-settle-player-credit
                    className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-4 text-center"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">
                      Personal bankroll on commit
                    </div>
                    <div
                      className={`mt-1 text-3xl font-black tabular-nums ${
                        playerPersonalCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {playerPersonalCredit >= 0 ? '+' : ''}
                      {fmtPoker$(playerPersonalCredit)}
                    </div>
                  </div>
                ) : null}
                {showBackerSettleCredit ? (
                  <div
                    data-poker-stable-settle-backer-credit
                    className="mb-4 rounded-2xl border border-cyan-500/25 bg-cyan-950/30 p-4 text-center"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">
                      {STABLE_BACKER_BANKROLL_PHRASE} on commit
                    </div>
                    <div
                      className={`mt-1 text-3xl font-black tabular-nums ${
                        backerBackingCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {backerBackingCredit >= 0 ? '+' : ''}
                      {fmtPoker$(backerBackingCredit)}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      Same amount posts to Realized P/L.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mb-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                {pokerStableCommitSummaryLine(commit)}
              </p>
            )}

            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              {stableCommitSyncHint(isStakee, isSettleCommit)}
              {isStakee && isSettleCommit
                ? ' Until you commit, your stake card keeps the pre-settlement numbers.'
                : ''}
            </p>
            {alreadyMine ? (
              <p className="text-center text-sm text-emerald-400">You recorded this update.</p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={onClose}
                  className="flex-1 rounded-2xl border border-zinc-600 bg-zinc-800 py-3 text-base font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSync()}
                  className="flex-1 rounded-2xl bg-emerald-600 py-3 text-base font-bold text-white touch-manipulation disabled:opacity-50"
                >
                  {saving ? 'Committing…' : 'Commit'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
