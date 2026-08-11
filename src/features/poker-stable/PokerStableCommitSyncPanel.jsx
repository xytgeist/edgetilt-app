import { useCallback, useEffect, useMemo, useState } from 'react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import {
  archiveBackerStableDeal,
  archiveStakeeBankrollDeal,
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
import {
  backerSliceMarkupApplied,
  dealTournamentBuyins,
  dealUnusedMarkupTotal,
} from './pokerStableBackerMath.js'
import { roundMoney, stableNum, tournamentPlayerCloseEconomics } from './pokerStableMath.js'
import {
  attachSlicesToSettleLines,
  backerCloseStakePl,
  settlePayPhrases,
  settleReductionShareRows,
  settleResetBullet,
} from './pokerStableSettleReviewCopy.js'
import {
  dealStakeeDisplayName,
  formatPokerStableCommitDate,
  stakeeSkipsBackerCommitSync,
} from './pokerStableTerms.js'

function formatTermsPctDisplay(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/** One-line original stake terms for tournament close Commit footnote. */
function tournamentCloseTermsFootnote(deal, slice) {
  const actionPct = formatTermsPctDisplay(slice?.action_pct ?? slice?.actionPct)
  const packageAmt = fmtPoker$(
    stableNum(deal?.baseline_bankroll ?? deal?.baselineBankroll),
  )
  const pricingMode = slice?.pricing_mode || slice?.pricingMode || 'profit_split'
  const rate = slice?.markup_rate ?? slice?.markupRate ?? deal?.markup_rate ?? deal?.markupRate
  if (pricingMode === 'markup' && Number(rate) > 0) {
    return `Original terms: ${actionPct}% of ${packageAmt} @ ${formatTermsPctDisplay(rate)}× markup.`
  }
  const playerPct = Number(slice?.player_profit_pct ?? slice?.playerProfitPct)
  const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
  if (Number.isFinite(playerPct) && Number.isFinite(backerPct)) {
    return `Original terms: ${actionPct}% of ${packageAmt} @ ${formatTermsPctDisplay(playerPct)}/${formatTermsPctDisplay(backerPct)} player/backer split.`
  }
  return `Original terms: ${actionPct}% of ${packageAmt} tournament package.`
}

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
  /** Fires whenever this panel's loading gate flips (parent can hold Overview until ready). */
  onLoadingChange = null,
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
  const [dealBuyins, setDealBuyins] = useState(0)

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
            'id, label, deal_type, stakee_user_id, stakee_guest_label, staker_user_id, status, baseline_bankroll, markup_rate',
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
      let nextBuyins = 0

      if (isSettleCommit && commitRow.ref_id) {
        const [
          { settlement: st, lines, calc, error: stErr },
          { byDeal, error: slErr },
          sessionsRes,
        ] = await Promise.all([
          loadSettlementBundle(supabaseClient, commitRow.ref_id),
          loadDealSlices(supabaseClient, [commitRow.deal_id]),
          dealRow?.deal_type === 'tournament_package'
            ? supabaseClient
                .from('poker_bankroll_sessions')
                .select('buy_in, rebuy_amount, addon_amount')
                .eq('deal_id', commitRow.deal_id)
            : Promise.resolve({ data: [], error: null }),
        ])
        if (stErr) throw stErr
        if (slErr) throw slErr
        if (sessionsRes?.error) throw sessionsRes.error
        nextSettlement = st
        nextLines = lines || []
        nextSlices = byDeal[commitRow.deal_id] || []
        nextBuyins = dealTournamentBuyins(sessionsRes?.data || [])
        if (
          dealRow?.deal_type === 'tournament_package' &&
          commitRow.event_kind === 'close_settle'
        ) {
          nextPlayerCredit = tournamentPlayerCloseEconomics(
            st,
            nextSlices,
            dealRow,
            nextBuyins,
          ).returned
        } else {
          nextPlayerCredit = calc ? stableNum(calc.player_net) : null
        }
        if (dealRow && dealRow.stakee_user_id !== userId) {
          const slice = viewerBackingSlice(nextSlices, userId)
          const line = slice
            ? nextLines.find((row) => row.slice_id === slice.id) || null
            : null
          if (slice) {
            nextBackerCredit = settlementBackerCredit(st, dealRow, slice, line, {
              isClose: commitRow.event_kind === 'close_settle',
            })
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
      setDealBuyins(nextBuyins)
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

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

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

  const isTournamentPackage = deal?.deal_type === 'tournament_package'
  const tournamentCloseBacker = Boolean(
    showBackerSettleCredit && isCloseSettle && isTournamentPackage,
  )
  const tournamentClosePlayer = Boolean(
    showPlayerSettleCredit && isCloseSettle && isTournamentPackage,
  )

  const settleDetail = useMemo(() => {
    if (!showSettleCredit || !settlement) {
      return {
        payPhrases: [],
        resetBullet: '',
        reductionRows: [],
        stakePl: null,
        markupFee: 0,
        overallPerformance: null,
        termsFootnote: '',
      }
    }
    const lines = attachSlicesToSettleLines(settlementLines, slices)
    const playerName = dealStakeeDisplayName(deal, profilesById) || 'Player'
    const reductionAmount = roundMoney(settlement.stake_reduction_total || 0)
    const slice = !isStakee ? viewerBackingSlice(slices, userId) : null
    const line = slice ? lines.find((row) => row.slice?.id === slice.id || row.slice_id === slice.id) : null

    if (tournamentCloseBacker && slice) {
      const stakePl = backerCloseStakePl(settlement, slice, line)
      const feeDeal = {
        ...deal,
        baseline_bankroll: stableNum(settlement.baseline_at_settle ?? deal?.baseline_bankroll),
      }
      const feeSlice = {
        ...slice,
        markup_rate: slice.markup_rate ?? slice.markupRate ?? deal?.markup_rate,
        pricing_mode: slice.pricing_mode || slice.pricingMode || 'profit_split',
      }
      const { applied, unused } = backerSliceMarkupApplied(feeDeal, feeSlice, dealBuyins)
      const markupFee = Math.max(0, applied)
      const overallPerformance = roundMoney(stakePl - markupFee)
      const credit = roundMoney(backerBackingCredit ?? 0)
      const stakePlBit = `${stakePl >= 0 ? '+' : ''}${fmtPoker$(stakePl)} stake P/L`
      const breakdown =
        markupFee > 0.005
          ? `${stakePlBit} − ${fmtPoker$(markupFee)} markup applied`
          : stakePlBit
      const payPhrases = [
        breakdown,
        `${fmtPoker$(credit)} returned to Backing Bankroll`,
      ]
      if (unused > 0.005) {
        payPhrases.push(`${fmtPoker$(unused)} unused markup returned`)
      }
      return {
        payPhrases,
        resetBullet: '',
        reductionRows: [],
        stakePl,
        markupFee,
        overallPerformance,
        termsFootnote: tournamentCloseTermsFootnote(deal, feeSlice),
      }
    }

    if (tournamentClosePlayer) {
      const econ = tournamentPlayerCloseEconomics(settlement, slices, deal, dealBuyins)
      const overallPerformance = econ.overallPl
      const unusedMarkup = dealUnusedMarkupTotal(deal, slices, dealBuyins)
      const payPhrases = [
        econ.contribution > 0.005
          ? `Your package share ${fmtPoker$(econ.contribution)}`
          : 'Your package share $0',
        `${fmtPoker$(econ.returned)} returned to your personal bankroll`,
      ]
      if (econ.appliedMarkup > 0.005) {
        payPhrases.push(`${fmtPoker$(econ.appliedMarkup)} markup earned (kept)`)
      }
      if (unusedMarkup > 0.005) {
        payPhrases.push(
          `${fmtPoker$(unusedMarkup)} unused markup returned to backers`,
        )
      }
      const plFoot =
        econ.appliedMarkup > 0.005
          ? `Overall P/L ${overallPerformance >= 0 ? '+' : ''}${fmtPoker$(overallPerformance)} (stake ${econ.stakePl >= 0 ? '+' : ''}${fmtPoker$(econ.stakePl)} · markup +${fmtPoker$(econ.appliedMarkup)}).`
          : `Overall P/L ${overallPerformance >= 0 ? '+' : ''}${fmtPoker$(overallPerformance)}.`
      return {
        payPhrases,
        resetBullet: '',
        reductionRows: [],
        stakePl: econ.stakePl,
        markupFee: econ.appliedMarkup,
        overallPerformance,
        termsFootnote: plFoot,
      }
    }

    return {
      payPhrases: settlePayPhrases({
        isStakee: Boolean(isStakee),
        lines,
        userId,
        playerName,
        profilesById,
        isClose: isCloseSettle,
        baseline: stableNum(settlement.baseline_at_settle),
        roll: stableNum(settlement.roll_at_settle),
        settlement,
      }),
      resetBullet: isTournamentPackage
        ? ''
        : settleResetBullet({
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
      stakePl: null,
      markupFee: 0,
      overallPerformance: null,
      termsFootnote: '',
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
    tournamentCloseBacker,
    tournamentClosePlayer,
    isTournamentPackage,
    backerBackingCredit,
    dealBuyins,
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
      let archived = false
      if (isCloseSettle && commit.deal_id) {
        const archiveFn = isStakee ? archiveStakeeBankrollDeal : archiveBackerStableDeal
        const { error: archErr } = await archiveFn(supabaseClient, commit.deal_id)
        if (archErr) {
          onError?.(
            archErr.message ||
              'Committed, but could not archive. Use Archive stake when you are ready.',
          )
        } else {
          archived = true
        }
      }
      triggerTapHapticLight()
      setDismissed(true)
      onSynced?.({
        status,
        dealId: commit.deal_id,
        isStakee,
        isSettleCommit,
        isCloseSettle,
        archived,
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
        data-poker-stable-commit-sync-loading
        className={
          variant === 'inline'
            ? 'rounded-2xl border border-zinc-700/40 bg-zinc-900/70 p-4 shadow-none'
            : ''
        }
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-3 w-40 animate-pulse rounded bg-zinc-700/70" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-zinc-800/80" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-800/80" />
        </div>
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-5">
          <div className="h-2.5 w-48 animate-pulse rounded bg-emerald-500/20" />
          <div className="mt-3 h-8 w-28 animate-pulse rounded bg-emerald-500/25" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-4/5 animate-pulse rounded bg-emerald-500/15" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-emerald-500/15" />
          </div>
        </div>
        <div className="mt-4 h-11 w-full animate-pulse rounded-2xl bg-emerald-600/30" />
        <p className="sr-only">Loading settlement</p>
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
      ? `${actorLabel} logged a ${isCloseSettle ? 'closing' : 'periodic'} settlement on ${deal?.label?.trim() || 'this stake'}${
          dateBit ? ` (${dateBit})` : ''
        }. Review the details, then commit to update your books.`
      : `${actorLabel} recorded ${pokerStableCommitEventLabel(commit?.event_kind)} on ${deal?.label?.trim() || 'this stake'}.`

  const inlineShell =
    variant === 'inline'
      ? 'mb-4 rounded-2xl border border-zinc-700/40 bg-zinc-900/70 p-4 shadow-none'
      : ''

  const heroCredit = showPlayerSettleCredit ? playerPersonalCredit : backerBackingCredit
  const tournamentOverall = settleDetail.overallPerformance
  const tournamentCloseParty = tournamentCloseBacker || tournamentClosePlayer
  const cardIsLoss = tournamentCloseParty
    ? Number(tournamentOverall) < -0.005
    : Number(heroCredit) < -0.005
  const heroLabel = tournamentCloseBacker
    ? 'Overall performance'
    : tournamentClosePlayer
      ? 'Overall performance'
      : showPlayerSettleCredit
        ? 'Credit to personal bankroll'
        : 'Credit to personal backing bankroll'
  const heroAmount = tournamentCloseParty
    ? Number(tournamentOverall) || 0
    : Number(heroCredit) || 0
  const plWord = heroAmount >= 0 ? 'Profit' : 'Loss'
  const plWordLower = heroAmount >= 0 ? 'profit' : 'loss'
  const hasReduction = settleDetail.reductionRows.length > 0
  const settleFootnote = tournamentCloseBacker
    ? settleDetail.termsFootnote || 'Original stake terms apply.'
    : tournamentClosePlayer
      ? settleDetail.termsFootnote ||
        'Your unsold package share was funded from personal bankroll (no markup).'
      : showPlayerSettleCredit
        ? hasReduction
          ? `${plWord} credited to personal bankroll. Stake reduction returns capital to backers.`
          : `${plWord} credited to personal bankroll.`
        : isCloseSettle
          ? showBackerSettleCredit
            ? `Credit is your share of the closing roll returned to backing bankroll. Stake P/L (including losses) posts to Realized P/L.`
            : `${plWord} posts to Realized P/L and is credited to personal backing bankroll.`
          : hasReduction
            ? `${plWord} posts to Realized P/L. Stake reduction and ${plWordLower} credited to personal backing bankroll.`
            : `${plWord} posts to Realized P/L and is credited to personal backing bankroll.`

  const settleCardClass = cardIsLoss
    ? 'mb-4 rounded-2xl border-2 border-rose-400/50 bg-rose-950/45 px-4 py-5 text-center shadow-none'
    : 'mb-4 rounded-2xl border-2 border-emerald-400/50 bg-emerald-950/45 px-4 py-5 text-center shadow-none'
  const settleLabelClass = cardIsLoss
    ? 'text-[11px] font-bold uppercase tracking-wide text-rose-200/90'
    : 'text-[11px] font-bold uppercase tracking-wide text-emerald-200/90'
  const settleFootnoteClass = cardIsLoss ? 'text-rose-100/70' : 'text-emerald-100/70'

  return (
    <div data-poker-stable-commit-sync-modal={variant === 'inline' ? 'inline' : undefined} className={inlineShell}>
      {variant === 'inline' ? (
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{titleLine}</p>
      ) : null}

      <p className="mb-3 text-sm leading-relaxed text-zinc-300">{intro}</p>

      {showSettleCredit ? (
        <>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            {isTournamentPackage || tournamentCloseBacker
              ? `Roll ${fmtPoker$(settlement.roll_at_settle)} at settlement`
              : `Roll ${fmtPoker$(settlement.roll_at_settle)} · Baseline ${fmtPoker$(
                  settlement.baseline_at_settle,
                )} at settlement`}
          </p>
          <div
            data-poker-stable-settle-player-credit={showPlayerSettleCredit ? '' : undefined}
            data-poker-stable-settle-backer-credit={showBackerSettleCredit ? '' : undefined}
            data-poker-stable-settle-tone={
              showBackerSettleCredit || showPlayerSettleCredit
                ? cardIsLoss
                  ? 'loss'
                  : 'gain'
                : undefined
            }
            className={
              tournamentCloseParty || showBackerSettleCredit
                ? settleCardClass
                : 'mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-4 text-center'
            }
          >
            <div
              className={
                tournamentCloseParty || showBackerSettleCredit
                  ? settleLabelClass
                  : 'text-[10px] font-bold uppercase tracking-wide text-emerald-300/80'
              }
            >
              {heroLabel}
            </div>
            <div
              className={`mt-2 font-black tabular-nums tracking-tight ${
                tournamentCloseParty || showBackerSettleCredit ? 'text-4xl sm:text-5xl' : 'text-3xl'
              } ${heroAmount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {heroAmount >= 0 ? '+' : ''}
              {fmtPoker$(heroAmount)}
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
                  tournamentCloseParty || showBackerSettleCredit
                    ? settleFootnoteClass
                    : 'text-emerald-200/75'
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
        {stableCommitSyncHint(isStakee, isSettleCommit, isCloseSettle)}
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
            {saving ? 'Committing…' : isCloseSettle ? 'Commit & Archive' : 'Commit'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSync()}
          className="w-full rounded-2xl bg-emerald-600 py-3 text-base font-bold text-white touch-manipulation disabled:opacity-50"
        >
          {saving ? 'Committing…' : isCloseSettle ? 'Commit & Archive' : 'Commit'}
        </button>
      )}
    </div>
  )
}
