import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import {
  loadDealSlices,
  loadSettlementBundle,
  syncDealCommit,
  viewerNeedsDealCommitSync,
} from './pokerStableApi.js'
import { pokerStableCommitEventLabel, pokerStableCommitSummaryLine } from './pokerStableActivity.js'
import { stableCommitSyncHint } from './pokerStableBooksCopy.js'
import {
  settlementBackerCredit,
  viewerBackingSlice,
} from './pokerStableDealHistory.js'
import { roundMoney, stableNum } from './pokerStableMath.js'
import {
  attachSlicesToSettleLines,
  settlePayPhrases,
  settleReductionShareRows,
  settleResetBullet,
} from './pokerStableSettleReviewCopy.js'
import {
  dealStakeeDisplayName,
  formatPokerStableCommitDate,
  stakeeSkipsBackerCommitSync,
} from './pokerStableTerms.js'

/**
 * Commit sync body (settle credit + Commit). Used inline on deal Overview and inside the global modal.
 * @param {'inline' | 'modal'} [variant]
 */
export default function PokerStableCommitSyncPanel({
  supabaseClient,
  userId,
  commitId,
  variant = 'inline',
  /** 1-based index when shown in a settle Commit queue */
  queueIndex = null,
  queueTotal = null,
  settleDateLabel = '',
  saving: savingProp = false,
  onSavingChange,
  onClose,
  onSynced,
  onError,
}) {
  const [loading, setLoading] = useState(true)
  const [savingLocal, setSavingLocal] = useState(false)
  /** After Commit … hide immediately so parent refresh cannot flash a reload of this panel. */
  const [dismissed, setDismissed] = useState(false)
  const [commit, setCommit] = useState(null)
  const [deal, setDeal] = useState(null)
  const [actorProfile, setActorProfile] = useState(null)
  const [settlement, setSettlement] = useState(null)
  const [settlementLines, setSettlementLines] = useState([])
  const [slices, setSlices] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [playerPersonalCredit, setPlayerPersonalCredit] = useState(null)
  const [backerBackingCredit, setBackerBackingCredit] = useState(null)

  const saving = savingProp || savingLocal
  const setSaving = onSavingChange || setSavingLocal

  const loadBundle = useCallback(async () => {
    if (!supabaseClient || !commitId || !userId) return
    setLoading(true)
    onError?.('')
    try {
      const {
        needsSync,
        commit: pendingCommit,
        error: pendingErr,
      } = await viewerNeedsDealCommitSync(supabaseClient, commitId, userId)
      if (pendingErr) throw pendingErr
      if (!needsSync) {
        // Already committed (or viewer recorded it) … dismiss Commit UI; keep deal focus.
        setDismissed(true)
        onSynced?.({ status: 'already_synced', dealId: pendingCommit?.deal_id || null })
        if (variant === 'modal') onClose?.()
        return
      }

      const commitRow = pendingCommit
      if (!commitRow) throw new Error('Stake commit not found.')

      const [{ data: dealRow }, { data: actor }] = await Promise.all([
        supabaseClient
          .from('poker_stable_deals')
          .select(
            'id, label, deal_type, stakee_user_id, stakee_guest_label, staker_user_id, status, baseline_bankroll',
          )
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
      let nextLines = []
      let nextSlices = []
      let nextProfiles = {}
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
        nextLines = lines || []
        nextSlices = byDeal[commitRow.deal_id] || []
        nextPlayerCredit = calc ? stableNum(calc.player_net) : null
        if (dealRow && dealRow.stakee_user_id !== userId) {
          const slice = viewerBackingSlice(nextSlices, userId)
          const line = slice
            ? nextLines.find((row) => row.slice_id === slice.id) || null
            : null
          if (slice) {
            nextBackerCredit = settlementBackerCredit(st, dealRow, slice, line)
          }
        }

        const profileIds = [
          dealRow?.stakee_user_id,
          ...nextSlices.map((s) => s.staker_user_id),
        ].filter(Boolean)
        const uniqueIds = [...new Set(profileIds)]
        if (uniqueIds.length) {
          const { data: profiles, error: pErr } = await supabaseClient
            .from('profiles')
            .select('user_id, handle, display_name, avatar_url')
            .in('user_id', uniqueIds)
          if (pErr) throw pErr
          nextProfiles = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
        }
      }

      setCommit(commitRow)
      setDeal(dealRow || null)
      setActorProfile(actor || null)
      setSettlement(nextSettlement)
      setSettlementLines(nextLines)
      setSlices(nextSlices)
      setProfilesById(nextProfiles)
      setPlayerPersonalCredit(nextPlayerCredit)
      setBackerBackingCredit(nextBackerCredit)
    } catch (e) {
      onError?.(e?.message || 'Could not load stake commit.')
    } finally {
      setLoading(false)
    }
    // onSynced/onClose are parent dismiss callbacks; omit from deps to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [supabaseClient, commitId, userId, onError, variant])

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

  const settleDetail = useMemo(() => {
    if (!showSettleCredit || !settlement) {
      return { payPhrases: [], resetBullet: '', reductionRows: [] }
    }
    const lines = attachSlicesToSettleLines(settlementLines, slices)
    const playerName = dealStakeeDisplayName(deal, profilesById) || 'Player'
    const reductionAmount = roundMoney(settlement.stake_reduction_total || 0)
    return {
      payPhrases: settlePayPhrases({
        isStakee: Boolean(isStakee),
        lines,
        userId,
        playerName,
        profilesById,
      }),
      resetBullet: settleResetBullet({
        baseline: stableNum(settlement.baseline_at_settle),
        reductionAmount,
        isClose: isCloseSettle,
      }),
      reductionRows: settleReductionShareRows({
        isStakee: Boolean(isStakee),
        slices,
        reductionAmount,
        userId,
        profilesById,
      }),
    }
  }, [
    showSettleCredit,
    settlement,
    settlementLines,
    slices,
    deal,
    profilesById,
    isStakee,
    userId,
    isCloseSettle,
  ])

  useEffect(() => {
    if (!loading && skipStakeeSync && variant === 'modal') {
      onClose?.()
    }
  }, [loading, skipStakeeSync, variant, onClose])

  async function onSync() {
    if (!commit || alreadyMine) return
    setSaving(true)
    onError?.('')
    try {
      const { error, status } = await syncDealCommit(supabaseClient, commit.id)
      if (error) throw error
      triggerTapHapticLight()
      setDismissed(true)
      onSynced?.({
        status,
        dealId: commit.deal_id,
        isStakee,
        isSettleCommit,
      })
      if (variant === 'modal') onClose?.()
      // Skip loadBundle after Commit … parent refresh removes the panel; reloading here flashes.
    } catch (e) {
      onError?.(e?.message || 'Could not sync commit.')
    } finally {
      setSaving(false)
    }
  }

  if (dismissed) return null

  if (loading) {
    return (
      <div
        data-poker-stable-commit-sync-modal={variant === 'inline' ? 'inline' : undefined}
        className={
          variant === 'inline'
            ? 'rounded-2xl border border-zinc-700/40 bg-zinc-900/70 p-4 shadow-none'
            : ''
        }
      >
        <p className="text-sm text-zinc-400">Loading settlement…</p>
      </div>
    )
  }

  if (!commit || skipStakeeSync) return null

  const title = isCloseSettle
    ? 'Close settlement'
    : isSettleCommit
      ? 'Periodic settlement'
      : 'Sync stake update'
  const queueLabel =
    queueIndex != null && queueTotal != null && queueTotal > 1
      ? `${queueIndex} of ${queueTotal}`
      : ''
  const dateBit = settleDateLabel || formatPokerStableCommitDate(commit?.created_at)
  const titleLine = [queueLabel, title, dateBit].filter(Boolean).join(' · ')
  const intro =
    isSettleCommit && !alreadyMine
      ? `${actorLabel} logged a ${isCloseSettle ? 'close' : 'periodic'} settlement on ${deal?.label?.trim() || 'this stake'}${
          dateBit ? ` (${dateBit})` : ''
        }. Review the details, then commit to update your books.`
      : `${actorLabel} recorded ${pokerStableCommitEventLabel(commit?.event_kind)} on ${deal?.label?.trim() || 'this stake'}.`

  const inlineShell =
    variant === 'inline'
      ? 'mb-4 rounded-2xl border border-zinc-700/40 bg-zinc-900/70 p-4 shadow-none'
      : ''

  const heroCredit = showPlayerSettleCredit ? playerPersonalCredit : backerBackingCredit
  const heroLabel = showPlayerSettleCredit
    ? 'Credit to personal bankroll'
    : 'Credit to personal backing bankroll'
  const plWord = heroCredit >= 0 ? 'Profit' : 'Loss'
  const plWordLower = heroCredit >= 0 ? 'profit' : 'loss'
  const hasReduction = settleDetail.reductionRows.length > 0
  const settleFootnote = showPlayerSettleCredit
    ? hasReduction
      ? `${plWord} credited to personal bankroll. Stake reduction returns capital to backers.`
      : `${plWord} credited to personal bankroll.`
    : hasReduction
      ? `${plWord} posts to Realized P/L. Stake reduction and ${plWordLower} credited to personal backing bankroll.`
      : `${plWord} posts to Realized P/L and is credited to personal backing bankroll.`

  return (
    <div data-poker-stable-commit-sync-modal={variant === 'inline' ? 'inline' : undefined} className={inlineShell}>
      {variant === 'inline' ? (
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{titleLine}</p>
      ) : null}

      <p className="mb-3 text-sm leading-relaxed text-zinc-300">{intro}</p>

      {showSettleCredit ? (
        <>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            Roll {fmtPoker$(settlement.roll_at_settle)} · Baseline{' '}
            {fmtPoker$(settlement.baseline_at_settle)} at settlement
          </p>
          <div
            data-poker-stable-settle-player-credit={showPlayerSettleCredit ? '' : undefined}
            data-poker-stable-settle-backer-credit={showBackerSettleCredit ? '' : undefined}
            className={
              showBackerSettleCredit
                ? 'mb-4 rounded-2xl border-2 border-emerald-400/50 bg-emerald-950/45 px-4 py-5 text-center shadow-none'
                : 'mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-4 text-center'
            }
          >
            <div
              className={
                showBackerSettleCredit
                  ? 'text-[11px] font-bold uppercase tracking-wide text-emerald-200/90'
                  : 'text-[10px] font-bold uppercase tracking-wide text-emerald-300/80'
              }
            >
              {heroLabel}
            </div>
            <div
              className={`mt-2 font-black tabular-nums tracking-tight ${
                showBackerSettleCredit ? 'text-4xl sm:text-5xl' : 'text-3xl'
              } ${heroCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {heroCredit >= 0 ? '+' : ''}
              {fmtPoker$(heroCredit)}
            </div>
            <ul
              className="mt-3 list-disc space-y-1 pl-5 text-left text-xs leading-relaxed text-zinc-400"
              data-poker-stable-settle-commit-pay-line
            >
              {settleDetail.payPhrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
              {settleDetail.resetBullet ? <li>{settleDetail.resetBullet}</li> : null}
            </ul>
            {settleDetail.reductionRows.length ? (
              <div
                className="mt-3 rounded-xl border border-emerald-500/20 bg-zinc-950/30 px-3 py-2 text-left text-xs text-zinc-400"
                data-poker-stable-settle-commit-reduction-shares
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200/80">
                  Stake reduction
                </div>
                {settleDetail.reductionRows.map((row) => (
                  <div key={row.key} className="flex justify-between gap-2 py-0.5">
                    <span>{row.label}</span>
                    <span className="font-semibold tabular-nums text-emerald-100">
                      +{fmtPoker$(row.share)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {showSettleCredit ? (
              <p
                className={`mt-2.5 text-xs font-medium leading-relaxed ${
                  showBackerSettleCredit ? 'text-emerald-100/70' : 'text-emerald-200/75'
                }`}
              >
                {settleFootnote}
              </p>
            ) : null}
          </div>
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
      ) : variant === 'modal' ? (
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
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSync()}
          className="w-full rounded-2xl bg-emerald-600 py-3 text-base font-bold text-white touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Committing…' : 'Commit'}
        </button>
      )}
    </div>
  )
}
