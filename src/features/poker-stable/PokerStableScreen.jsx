import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BarnIcon from '../../components/BarnIcon.jsx'
import PokerSurfaceBootLoading from '../../components/PokerSurfaceBootLoading.jsx'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import {
  clearStableCommitDeepLinkParams,
  clearStableWithdrawnDeepLinkParams,
} from '../../utils/loungeActivityInAppNavigate.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$, pokerPlTone } from '../poker-bankroll/pokerBankrollMath.js'
import PokerStakeArchiveDetailModal from '../poker-bankroll/PokerStakeArchiveDetailModal.jsx'
import {
  buildStakeFormSeedFromDeclinedDeal,
  PokerStableBackerDealSheet,
} from './PokerStableCreateDealSheet.jsx'
import PokerStableProposeAfterDeclineModal from './PokerStableProposeAfterDeclineModal.jsx'
import PokerStableAttentionSheet from './PokerStableAttentionSheet.jsx'
import PokerStableClosedHorseSheet from './PokerStableClosedHorseSheet.jsx'
import PokerStableDealDetailSheet from './PokerStableDealDetailSheet.jsx'
import PokerStableDealTermsSheet from './PokerStableDealTermsSheet.jsx'
import PokerStableHorseCarousel from './PokerStableHorseCarousel.jsx'
import PokerStablePortfolioDetailSheet from './PokerStablePortfolioDetailSheet.jsx'
import PokerStablePortfolioHero from './PokerStablePortfolioHero.jsx'
import PokerStableBackerSliceOfferOnboardingModal from './PokerStableBackerSliceOfferOnboardingModal.jsx'
import {
  clearPokerStableBackerOnboarding,
  readPokerStableBackerOnboardingDealId,
  readPokerStableBackerOnboardingSliceId,
} from './pokerStableBackerOnboarding.js'
import {
  backerStableDealDisplayLabel,
  backerStableShowsClosedCarouselCard,
  computeBackerPortfolioPerformanceMetrics,
  enrichBankrollByDealFromSessions,
  partitionBackerDeals,
} from './pokerStableBackerMath.js'
import { computeDealRollSparkSeries } from './pokerStableDealSessionStats.js'
import { stableHorseToneScopeDeals } from './pokerStableHorseTone.js'
import {
  archivedStakeBackerEconomicsBreakdown,
  archivedStakePlayerSessionProfit,
} from './pokerStableDealHistory.js'
import {
  acceptSliceAsStaker,
  archiveBackerStableDeal,
  deleteDeclinedStakeDeal,
  hideBackerStableDeal,
  declineSliceAsStaker,
  dealIdsForAcceptedBackerVisibility,
  isMissingStableTableError,
  isStableOfferRefreshError,
  isStableOfferWithdrawnError,
  isViewerBackingDeal,
  depositBackerBankroll,
  loadBackerBankroll,
  loadBackerBankrollAdjustments,
  withdrawBackerBankroll,
  loadDealBankrollProfiles,
  loadDealCounterpartyProfiles,
  loadDealReductions,
  loadDealSessionsForStable,
  loadDealSessionStats,
  loadDealSettlements,
  loadDealSlices,
  loadDealTopups,
  loadMyStableDeals,
  loadPendingCommits,
  nudgeBackerSliceAcceptance,
  revokeHorseDeal,
  sliceDisplayName,
} from './pokerStableApi.js'
import { notifyPokerOfferAttentionChanged } from './pokerPendingOfferAttention.js'
import { dealTypeLabel } from './pokerStableMath.js'
import {
  archivedStakeOutcomeBadgeClass,
  archivedStakeOutcomeLabel,
  dealStakeeDisplayName,
  pendingSettleCommitsForDeal,
  stakeeSkipsBackerCommitSync,
  stakeInitiatorCanReplaceDeclinedDeal,
} from './pokerStableTerms.js'

/**
 * Stable Manager — staker tracks horses via per-deal On Stake bankrolls.
 * Bones: request / accept / list + synced roll/P/L. Apply SQL on test first.
 */
export default function PokerStableScreen({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  openStableDealId = null,
  onOpenStableDealConsumed = null,
  /** Alert tap for rewritten withdrawn invite (no deal id left on the activity row). */
  showWithdrawnOfferNotice = false,
  onWithdrawnOfferNoticeConsumed = null,
  backerSliceOnboardingDealId = null,
  backerSliceOnboardingSliceId = null,
  onBackerSliceOnboardingConsumed = null,
  /** @type {(dealId: string) => void} */
  onOpenPokerBankroll = null,
  /** First breadcrumb arrival: pulse pending Accept/Decline offer cards. */
  highlightPendingOffer = false,
  onHighlightPendingOfferConsumed = null,
  /** @type {(peerUserId: string) => void} */
  onOpenChatWithUser = null,
  /** @type {(roomId: string) => void} */
  onOpenChatRoom = null,
}) {
  const [userId, setUserId] = useState(null)
  const [deals, setDeals] = useState([])
  const [profilesById, setProfilesById] = useState(/** @type {Record<string, object>} */ ({}))
  const [bankrollByDeal, setBankrollByDeal] = useState(/** @type {Record<string, object>} */ ({}))
  const [statsByDeal, setStatsByDeal] = useState(
    /** @type {Record<string, { sessions: number, profit: number }>} */ ({}),
  )
  const [loading, setLoading] = useState(true)
  /** First successful paint gate … avoids $0 portfolio flash before deals/bankroll load. */
  const [initialStableLoadDone, setInitialStableLoadDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nudgingSliceId, setNudgingSliceId] = useState(null)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [slicesByDeal, setSlicesByDeal] = useState(/** @type {Record<string, object[]>} */ ({}))
  const [sheet, setSheet] = useState(/** @type {null | 'request'} */ (null))
  const [createStakeSeed, setCreateStakeSeed] = useState(/** @type {object | null} */ (null))
  /** @type {{ seed: object, counterpartLabel: string, declinedDealId?: string } | null} */
  const [proposeAfterDecline, setProposeAfterDecline] = useState(null)
  const [detailDealId, setDetailDealId] = useState(/** @type {string | null} */ (null))
  const [termsDealId, setTermsDealId] = useState(/** @type {string | null} */ (null))
  const [portfolioDetailOpen, setPortfolioDetailOpen] = useState(false)
  const [backerProfile, setBackerProfile] = useState(
    /** @type {{ bankroll_balance: number, realized_backing_pl: number, has_profile: boolean } | null} */ (null),
  )
  const [pendingCommits, setPendingCommits] = useState(/** @type {object[]} */ ([]))
  const [stableSessions, setStableSessions] = useState(/** @type {object[]} */ ([]))
  const [backerAdjustments, setBackerAdjustments] = useState(/** @type {object[]} */ ([]))
  const [attentionOpen, setAttentionOpen] = useState(false)
  const [backerSliceOnboardingOpen, setBackerSliceOnboardingOpen] = useState(false)
  const backerSliceOnboardingOpenedRef = useRef(false)
  const [dealSettlementsByDeal, setDealSettlementsByDeal] = useState(
    /** @type {Record<string, object[]>} */ ({}),
  )
  const [dealTopupsByDeal, setDealTopupsByDeal] = useState(/** @type {Record<string, object[]>} */ ({}))
  const [dealReductionsByDeal, setDealReductionsByDeal] = useState(
    /** @type {Record<string, object[]>} */ ({}),
  )
  const [archiveDetailDealId, setArchiveDetailDealId] = useState(/** @type {string | null} */ (null))
  const [closedHorseReviewDealId, setClosedHorseReviewDealId] = useState(
    /** @type {string | null} */ (null),
  )
  /** Deep-link focus for pending slice invite / nudge (carousel, not Overview sheet). */
  const [focusHorseDealId, setFocusHorseDealId] = useState(/** @type {string | null} */ (null))
  /** Alert/push landed on a deal that no longer exists (player withdrew pending offer). */
  const [withdrawnOfferNotice, setWithdrawnOfferNotice] = useState('')

  useEffect(() => {
    if (!supabaseClient) return undefined
    let cancelled = false
    void supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabaseClient])

  const load = useCallback(async ({ silent = false, light = false } = {}) => {
    if (!supabaseClient || !userId) {
      setDeals([])
      setSlicesByDeal({})
      setLoading(false)
      setInitialStableLoadDone(false)
      return
    }
    if (!silent) setLoading(true)
    setError('')
    try {
      const { deals: rows, error: dErr } = await loadMyStableDeals(supabaseClient, userId)
      if (dErr) {
        if (isMissingStableTableError(dErr)) {
          setSchemaMissing(true)
          setDeals([])
          setSlicesByDeal({})
          return
        }
        // Keep last good horses … a soft deal-probe blip must not blank Stable.
        setError(dErr.message || 'Could not load Stable.')
        return
      }
      setSchemaMissing(false)
      const dealIds = rows.map((d) => d.id)
      const { byDeal: sliceMap, error: slErr } = await loadDealSlices(supabaseClient, dealIds)
      if (slErr && !isMissingStableTableError(slErr)) {
        console.warn('[poker-stable] slices', slErr.message)
        // Deals without slices get partitioned out for player-initiated invites.
        // Keep prior slice map so a failed refresh cannot hide a live pending offer.
        setDeals(rows)
        setError(slErr.message || 'Could not refresh stake slices.')
        if (light) return
        return
      }
      setDeals(rows)
      setSlicesByDeal(sliceMap || {})

      // Pending-invite poll: deals+slices only (drop ghost card). Full history refetch cooks phones.
      if (light) return

      const { byId, error: pErr } = await loadDealCounterpartyProfiles(
        supabaseClient,
        rows,
        userId,
        sliceMap || {},
      )
      if (pErr) console.warn('[poker-stable] profiles', pErr.message)
      setProfilesById(byId)

      const statsDealIds = dealIdsForAcceptedBackerVisibility(rows, sliceMap || {}, userId)
      const [{ byDeal: rolls }, { byDeal: stats }, backerRes, commitsRes, sessionsRes, adjRes] =
        await Promise.all([
          loadDealBankrollProfiles(supabaseClient, statsDealIds),
          loadDealSessionStats(supabaseClient, statsDealIds),
          loadBackerBankroll(supabaseClient),
          loadPendingCommits(supabaseClient),
          // Sessions only after THIS backer accepts (not all syndicate invitees).
          loadDealSessionsForStable(supabaseClient, statsDealIds),
          loadBackerBankrollAdjustments(supabaseClient),
        ])
      setBankrollByDeal(rolls)
      setStatsByDeal(stats)
      if (backerRes.error && !isMissingStableTableError(backerRes.error)) {
        console.warn('[poker-stable] backer bankroll', backerRes.error.message)
      }
      setBackerProfile(backerRes.profile)
      if (commitsRes.error && !isMissingStableTableError(commitsRes.error)) {
        console.warn('[poker-stable] pending commits', commitsRes.error.message)
      }
      setPendingCommits(
        (commitsRes.commits || []).filter((row) => {
          const deal = rows.find((d) => d.id === row.deal_id)
          return !stakeeSkipsBackerCommitSync(deal, userId, row)
        }),
      )
      if (sessionsRes.error) console.warn('[poker-stable] sessions', sessionsRes.error.message)
      setStableSessions(sessionsRes.sessions || [])
      if (adjRes.error && !isMissingStableTableError(adjRes.error)) {
        console.warn('[poker-stable] backer adjustments', adjRes.error.message)
      }
      setBackerAdjustments(adjRes.adjustments || [])

      // History ledger is for archive sheets … skip on silent refresh (keep last snapshot).
      if (silent) return

      const historyIds = rows
        .filter(
          (d) =>
            isViewerBackingDeal(d, userId, sliceMap || {}) &&
            ['settled', 'closed', 'revoked', 'declined'].includes(d.status),
        )
        .map((d) => d.id)
      const topupsByDeal = {}
      const reductionsByDeal = {}
      const settlementsByDeal = {}
      await Promise.all(
        historyIds.map(async (dealId) => {
          const [
            { topups, error: topErr },
            { reductions, error: redErr },
            { settlements, error: stErr },
          ] = await Promise.all([
            loadDealTopups(supabaseClient, dealId),
            loadDealReductions(supabaseClient, dealId),
            loadDealSettlements(supabaseClient, dealId),
          ])
          if (topErr && !isMissingStableTableError(topErr)) {
            console.warn('[poker-stable] deal topups load failed', topErr.message)
          }
          if (redErr && !isMissingStableTableError(redErr)) {
            console.warn('[poker-stable] deal reductions load failed', redErr.message)
          }
          if (stErr && !isMissingStableTableError(stErr)) {
            console.warn('[poker-stable] deal settlements load failed', stErr.message)
          }
          topupsByDeal[dealId] = topups || []
          reductionsByDeal[dealId] = reductions || []
          settlementsByDeal[dealId] = settlements || []
        }),
      )
      setDealTopupsByDeal(topupsByDeal)
      setDealReductionsByDeal(reductionsByDeal)
      setDealSettlementsByDeal(settlementsByDeal)
    } catch (e) {
      // Do not setDeals([]) … a throw after a good deals/slices paint was blanking horses.
      setError(e?.message || 'Could not load Stable.')
    } finally {
      if (!silent) setLoading(false)
      setInitialStableLoadDone(true)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void load()
  }, [load])

  /** Notification / Alerts tap while already on Stable … refresh horse cards without full-screen reload. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onReload = () => {
      void load({ silent: true })
    }
    window.addEventListener('lounge-push-opened', onReload)
    window.addEventListener('lounge-activity-navigate', onReload)
    return () => {
      window.removeEventListener('lounge-push-opened', onReload)
      window.removeEventListener('lounge-activity-navigate', onReload)
    }
  }, [load])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  /**
   * Live refresh while Stable has open horses (pending/active), matching Bankroll:
   * Realtime on deals/slices/commits + 8s poll so counterparty close/settle updates
   * the horse card without leaving the screen.
   */
  const hasOpenStableHorses = useMemo(() => {
    if (!userId) return false
    return (deals || []).some((d) => d.status === 'pending' || d.status === 'active')
  }, [deals, userId])

  useEffect(() => {
    if (!supabaseClient || !userId || !hasOpenStableHorses) return undefined
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 8000)
    return () => window.clearInterval(id)
  }, [supabaseClient, userId, hasOpenStableHorses, load])

  useEffect(() => {
    if (!supabaseClient || !userId) return undefined
    const refresh = () => void load({ silent: true })
    const channel = supabaseClient
      .channel(`poker-stable-live-backer-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'poker_stable_deals',
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'poker_stable_deal_slices',
          filter: `staker_user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'poker_stable_deal_commits',
        },
        refresh,
      )
      .subscribe()
    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [supabaseClient, userId, load])

  const activeBackerOnboardingDealId =
    backerSliceOnboardingDealId || readPokerStableBackerOnboardingDealId()
  const activeBackerOnboardingSliceId =
    backerSliceOnboardingSliceId || readPokerStableBackerOnboardingSliceId()

  const onWithdrawnOfferNoticeConsumedRef = useRef(onWithdrawnOfferNoticeConsumed)
  onWithdrawnOfferNoticeConsumedRef.current = onWithdrawnOfferNoticeConsumed
  const onOpenStableDealConsumedRef = useRef(onOpenStableDealConsumed)
  onOpenStableDealConsumedRef.current = onOpenStableDealConsumed
  // Only from tapping a poker_stable_offer_withdrawn Alert/push (stableWithdrawn=1).
  // Do not infer withdrawal from a missing stableDeal … that bleeds onto new-invite opens.
  useEffect(() => {
    if (!showWithdrawnOfferNotice) return
    setWithdrawnOfferNotice('This stake offer was withdrawn.')
    setDetailDealId(null)
    setFocusHorseDealId(null)
    clearStableWithdrawnDeepLinkParams({ clearStableDeal: true })
    onWithdrawnOfferNoticeConsumedRef.current?.()
  }, [showWithdrawnOfferNotice])

  useEffect(() => {
    if (!openStableDealId || loading || !userId) return
    if (activeBackerOnboardingDealId && activeBackerOnboardingSliceId) {
      onOpenStableDealConsumedRef.current?.()
      return
    }
    const dealStillVisible = deals.some((d) => d.id === openStableDealId)
    if (!dealStillVisible) {
      // Keep deep link if load failed; otherwise drop a stale/missing deal id quietly.
      // Withdrawn copy is reserved for explicit stableWithdrawn=1 (or accept/decline on a gone card).
      if (error || schemaMissing) return
      setDetailDealId(null)
      setFocusHorseDealId(null)
      clearStableWithdrawnDeepLinkParams({ clearStableDeal: true })
      onOpenStableDealConsumedRef.current?.()
      return
    }
    // Live deal focus … clear any leftover withdrawn banner from an earlier Alert tap.
    setWithdrawnOfferNotice('')
    const dealSlices = slicesByDeal[openStableDealId] || []
    const myPendingInvite = dealSlices.some(
      (s) => s.staker_user_id === userId && s.status === 'pending',
    )
    let commitDeepLinkId = ''
    try {
      const params = new URLSearchParams(window.location.search || '')
      commitDeepLinkId = (
        params.get('stableCommit') ||
        params.get('stableSettlement') ||
        ''
      ).trim()
    } catch {
      commitDeepLinkId = ''
    }
    const commitStillPending = Boolean(
      commitDeepLinkId &&
        pendingCommits.some(
          (row) =>
            String(row.commit_id || row.id || '') === commitDeepLinkId &&
            String(row.deal_id || '') === String(openStableDealId),
        ),
    )
    // Slice invite / session complete / horse accepted: focus card + refresh (no detail sheet).
    // Settle/commit deep links open Overview only while Commit is still pending for the viewer.
    if (myPendingInvite || !commitDeepLinkId || !commitStillPending) {
      if (commitDeepLinkId && !commitStillPending) clearStableCommitDeepLinkParams()
      // Focus horse card only … detail-sheet tab state lives in PokerStableDealDetailSheet.
      setDetailDealId(null)
      setFocusHorseDealId(openStableDealId)
      clearStableWithdrawnDeepLinkParams({ clearStableDeal: true })
      void load({ silent: true })
      onOpenStableDealConsumedRef.current?.()
      return
    }
    setDetailDealId(openStableDealId)
    clearStableWithdrawnDeepLinkParams({ clearStableDeal: true })
    void load({ silent: true })
    onOpenStableDealConsumedRef.current?.()
  }, [
    openStableDealId,
    loading,
    userId,
    deals,
    error,
    schemaMissing,
    slicesByDeal,
    pendingCommits,
    activeBackerOnboardingDealId,
    activeBackerOnboardingSliceId,
    load,
  ])

  const backerOnboardingSliceRow = useMemo(() => {
    if (!activeBackerOnboardingDealId || !activeBackerOnboardingSliceId || !userId) return null
    const deal = deals.find((d) => d.id === activeBackerOnboardingDealId)
    const slice = (slicesByDeal[activeBackerOnboardingDealId] || []).find(
      (s) => s.id === activeBackerOnboardingSliceId,
    )
    if (!deal || !slice) return null
    if (slice.staker_user_id !== userId || slice.status !== 'pending') return null
    return { deal, slice }
  }, [
    activeBackerOnboardingDealId,
    activeBackerOnboardingSliceId,
    deals,
    slicesByDeal,
    userId,
  ])

  useEffect(() => {
    if (loading || !userId || !backerOnboardingSliceRow || backerSliceOnboardingOpenedRef.current) {
      return
    }
    backerSliceOnboardingOpenedRef.current = true
    setBackerSliceOnboardingOpen(true)
  }, [loading, userId, backerOnboardingSliceRow])

  function closeBackerSliceOnboarding() {
    setBackerSliceOnboardingOpen(false)
    clearPokerStableBackerOnboarding()
    onBackerSliceOnboardingConsumed?.()
  }

  async function onAcceptBackerSliceOnboarding() {
    const sliceId = backerOnboardingSliceRow?.slice?.id
    if (!sliceId) return
    await onAcceptSlice(sliceId)
    closeBackerSliceOnboarding()
  }

  async function onDeclineBackerSliceOnboarding() {
    const sliceId = backerOnboardingSliceRow?.slice?.id
    if (!sliceId) return
    await onDeclineSlice(sliceId)
  }

  useEffect(() => {
    if (!detailDealId || !userId) return
    const deal = deals.find((d) => d.id === detailDealId)
    if (deal && !isViewerBackingDeal(deal, userId, slicesByDeal)) {
      setDetailDealId(null)
    }
  }, [detailDealId, deals, userId, slicesByDeal])

  const detailDeal = useMemo(
    () => deals.find((d) => d.id === detailDealId) || null,
    [deals, detailDealId],
  )

  const { activeDeals, historyDeals } = useMemo(
    () => partitionBackerDeals(deals, slicesByDeal, userId),
    [deals, slicesByDeal, userId],
  )

  useEffect(() => {
    if (!highlightPendingOffer || loading || !userId) return undefined
    const inviteDeal = activeDeals.find((deal) => {
      const slices = slicesByDeal[deal.id] || []
      return slices.some(
        (s) => s.status === 'pending' && s.staker_user_id === userId && deal.staker_user_id !== userId,
      )
    })
    if (inviteDeal?.id) setFocusHorseDealId(inviteDeal.id)
    const clearTimer = window.setTimeout(() => {
      onHighlightPendingOfferConsumed?.()
    }, 4200)
    return () => window.clearTimeout(clearTimer)
  }, [
    highlightPendingOffer,
    loading,
    userId,
    activeDeals,
    slicesByDeal,
    onHighlightPendingOfferConsumed,
  ])

  const pendingPortfolioCommits = useMemo(
    () =>
      pendingCommits.filter(
        (row) => row.event_kind !== 'periodic_settle' && row.event_kind !== 'close_settle',
      ),
    [pendingCommits],
  )

  const horseDeals = useMemo(
    () => [...activeDeals, ...historyDeals],
    [activeDeals, historyDeals],
  )

  /** Include archived/hidden so horse highlight colors never reshuffle. */
  const horseToneDeals = useMemo(
    () => stableHorseToneScopeDeals(deals, slicesByDeal, userId),
    [deals, slicesByDeal, userId],
  )

  const bankrollByDealWithSessions = useMemo(
    () => enrichBankrollByDealFromSessions(deals, bankrollByDeal, stableSessions),
    [deals, bankrollByDeal, stableSessions],
  )

  /** Per-horse roll path (this deal's sessions only) … not portfolio-padded trend series. */
  const horseSparkByDeal = useMemo(() => {
    const out = {}
    for (const deal of activeDeals) {
      const dealSessions = stableSessions.filter((s) => s.deal_id === deal.id)
      const roll = bankrollByDealWithSessions[deal.id]?.overall_bankroll
      out[deal.id] = computeDealRollSparkSeries(
        dealSessions,
        roll != null && Number.isFinite(Number(roll)) ? Number(roll) : null,
      )
    }
    return out
  }, [activeDeals, stableSessions, bankrollByDealWithSessions])

  const portfolioMetrics = useMemo(
    () =>
      computeBackerPortfolioPerformanceMetrics({
        deals,
        slicesByDeal,
        userId,
        bankrollByDeal: bankrollByDealWithSessions,
        storedBankrollBalance: backerProfile?.bankroll_balance ?? 0,
        realizedPl: backerProfile?.realized_backing_pl ?? 0,
        horseDeals,
        sessions: stableSessions,
        adjustments: backerAdjustments,
        pendingCommits,
        settlementsByDeal: dealSettlementsByDeal,
      }),
    [
      deals,
      slicesByDeal,
      userId,
      bankrollByDealWithSessions,
      backerProfile,
      horseDeals,
      stableSessions,
      backerAdjustments,
      pendingCommits,
      dealSettlementsByDeal,
    ],
  )

  function playerLabelForSlice(sliceId) {
    for (const [dealId, slices] of Object.entries(slicesByDeal || {})) {
      if (!(slices || []).some((s) => s.id === sliceId)) continue
      const deal = deals.find((d) => d.id === dealId)
      return dealStakeeDisplayName(deal, profilesById) || 'The player'
    }
    return 'The player'
  }

  async function handleGoneSliceOffer(sliceId) {
    const who = playerLabelForSlice(sliceId)
    setError('')
    setWithdrawnOfferNotice(`${who} deleted this stake offer.`)
    notifyPokerOfferAttentionChanged()
    await load({ silent: true })
  }

  async function onAcceptSlice(sliceId) {
    if (!supabaseClient || !userId) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await acceptSliceAsStaker(supabaseClient, sliceId, userId)
      if (err) throw err
      triggerTapHapticLight()
      notifyPokerOfferAttentionChanged()
      await load()
    } catch (e) {
      if (isStableOfferRefreshError(e)) {
        setWithdrawnOfferNotice('')
        await load({ silent: true })
      } else if (isStableOfferWithdrawnError(e)) {
        await handleGoneSliceOffer(sliceId)
      } else {
        setError(e?.message || 'Could not accept slice.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function onDeclineSlice(sliceId) {
    if (!supabaseClient || !userId) return
    const dealId =
      Object.keys(slicesByDeal).find((id) =>
        (slicesByDeal[id] || []).some((s) => s.id === sliceId),
      ) || null
    const deal = dealId ? deals.find((d) => d.id === dealId) : null
    const slices = dealId ? slicesByDeal[dealId] || [] : []
    const seed = buildStakeFormSeedFromDeclinedDeal({
      mode: 'backer',
      deal,
      slices,
      profilesById,
      viewerUserId: userId,
    })
    const counterpartLabel = dealStakeeDisplayName(deal, profilesById) || 'the player'

    setSaving(true)
    setError('')
    try {
      const { error: err } = await declineSliceAsStaker(supabaseClient, sliceId, userId)
      if (err) throw err
      closeBackerSliceOnboarding()
      // If the whole offer died, archive so the decliner never sees Archive/Review.
      if (dealId) {
        try {
          await archiveBackerStableDeal(supabaseClient, dealId)
        } catch {
          /* player-initiated declined cards are filtered out of the carousel */
        }
      }
      notifyPokerOfferAttentionChanged()
      await load()
      if (seed) {
        setProposeAfterDecline({
          seed,
          counterpartLabel,
          declinedDealId: dealId || undefined,
        })
      }
    } catch (e) {
      if (isStableOfferRefreshError(e)) {
        setWithdrawnOfferNotice('')
        await load({ silent: true })
      } else if (isStableOfferWithdrawnError(e)) {
        await handleGoneSliceOffer(sliceId)
      } else {
        setError(e?.message || 'Could not decline slice.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function onRevoke(dealId) {
    if (!supabaseClient || !userId) return
    if (!window.confirm('Revoke this deal? The horse keeps their logged stake sessions.')) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await revokeHorseDeal(supabaseClient, dealId, userId)
      if (err) throw err
      await load()
    } catch (e) {
      setError(e?.message || 'Could not revoke.')
    } finally {
      setSaving(false)
    }
  }

  function openClosedHorseReview(dealId) {
    if (!dealId) return
    // Review opens the full deal sheet (overview / history). Archive lives there.
    setClosedHorseReviewDealId(null)
    openDealDetail(dealId)
  }

  function dismissStableDealModals() {
    setDetailDealId(null)
    setClosedHorseReviewDealId(null)
    setArchiveDetailDealId(null)
    setTermsDealId(null)
  }

  async function onArchiveHorse(dealId) {
    if (!supabaseClient || !userId) return
    const pendingSettle = pendingSettleCommitsForDeal(pendingCommits, dealId)[0]
    if (pendingSettle) {
      setDetailDealId(dealId)
      setError('Commit the settlement to your books before archiving this stake.')
      return
    }
    setSaving(true)
    setError('')
    const archivedAt = new Date().toISOString()
    try {
      const { error: err } = await archiveBackerStableDeal(supabaseClient, dealId)
      if (err) throw err
      setSlicesByDeal((prev) => {
        const rows = prev[dealId] || []
        if (!rows.length) return prev
        return {
          ...prev,
          [dealId]: rows.map((slice) =>
            slice.staker_user_id === userId
              ? { ...slice, stable_archived_at: archivedAt }
              : slice,
          ),
        }
      })
      dismissStableDealModals()
      triggerTapHapticLight()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not archive stake.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteDeclinedHorse(dealId, { openNewProposal = false } = {}) {
    if (!supabaseClient || !userId || !dealId) return
    const deal = deals.find((d) => d.id === dealId)
    if (!stakeInitiatorCanReplaceDeclinedDeal(deal, userId)) {
      setError('Only the stake initiator can delete this declined offer.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await deleteDeclinedStakeDeal(supabaseClient, dealId)
      if (err) throw err
      dismissStableDealModals()
      triggerTapHapticLight()
      await load()
      if (openNewProposal) {
        setSheet('request')
      }
    } catch (e) {
      setError(e?.message || 'Could not delete declined stake.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteClosedHorse(dealId) {
    if (!supabaseClient || !userId || !dealId) return
    const deal = deals.find((d) => d.id === dealId)
    const label = deal?.label?.trim() || 'this stake'
    if (
      !window.confirm(
        `Delete ${label}? This removes it from your Stable Closed stakes. Your books and the player's history stay intact.`,
      )
    ) {
      return
    }
    setSaving(true)
    setError('')
    const hiddenAt = new Date().toISOString()
    try {
      const { error: err } = await hideBackerStableDeal(supabaseClient, dealId)
      if (err) throw err
      setSlicesByDeal((prev) => {
        const rows = prev[dealId] || []
        if (!rows.length) return prev
        return {
          ...prev,
          [dealId]: rows.map((slice) =>
            slice.staker_user_id === userId
              ? {
                  ...slice,
                  stable_archived_at: slice.stable_archived_at || hiddenAt,
                  stable_hidden_at: hiddenAt,
                }
              : slice,
          ),
        }
      })
      dismissStableDealModals()
      triggerTapHapticLight()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not delete stake.')
    } finally {
      setSaving(false)
    }
  }

  async function onNudgePendingBacker(dealId, sliceId) {
    if (!supabaseClient || !dealId || !sliceId || nudgingSliceId) return
    setError('')
    setNudgingSliceId(sliceId)
    try {
      const { error: nudgeErr } = await nudgeBackerSliceAcceptance(supabaseClient, dealId, sliceId)
      if (nudgeErr) throw nudgeErr
      triggerTapHapticLight()
    } catch (e) {
      setError(e?.message || 'Could not send reminder.')
    } finally {
      setNudgingSliceId(null)
    }
  }

  function partyLabel(deal, role) {
    if (role === 'staker') {
      return dealStakeeDisplayName(deal, profilesById)
    }
    const slices = slicesByDeal[deal.id] || []
    if (slices.length === 1) return sliceDisplayName(slices[0], profilesById)
    if (slices.length > 1) return `${slices.length} backers`
    const otherId = deal.staker_user_id
    const p = profilesById[otherId]
    if (p?.handle) return `@${p.handle}`
    if (p?.display_name) return p.display_name
    return 'Edge user'
  }

  function openDealDetail(dealId) {
    setError('')
    setDetailDealId(dealId)
    triggerTapHapticLight()
  }

  async function onDepositBackerBankroll(amount) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { profile, error: depErr } = await depositBackerBankroll(supabaseClient, amount)
      if (depErr) throw depErr
      if (profile) {
        setBackerProfile((prev) => ({
          bankroll_balance: profile.bankroll_balance,
          realized_backing_pl: prev?.realized_backing_pl ?? 0,
          has_profile: true,
        }))
      }
      const { adjustments, error: adjErr } = await loadBackerBankrollAdjustments(supabaseClient)
      if (!adjErr) setBackerAdjustments(adjustments || [])
      triggerTapHapticLight()
    } catch (e) {
      setError(e?.message || 'Could not add to backing bankroll.')
    } finally {
      setSaving(false)
    }
  }

  async function onWithdrawBackerBankroll(amount) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { profile, error: wErr } = await withdrawBackerBankroll(supabaseClient, amount)
      if (wErr) throw wErr
      if (profile) {
        setBackerProfile((prev) => ({
          bankroll_balance: profile.bankroll_balance,
          realized_backing_pl: prev?.realized_backing_pl ?? 0,
          has_profile: true,
        }))
      }
      const { adjustments, error: adjErr } = await loadBackerBankrollAdjustments(supabaseClient)
      if (!adjErr) setBackerAdjustments(adjustments || [])
      triggerTapHapticLight()
    } catch (e) {
      setError(e?.message || 'Could not remove from backing bankroll.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div data-poker-stable>
        {schemaMissing ? (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            Stable tables are not on this database yet. Apply{' '}
            <span className="font-mono text-[12px]">20260730000000</span> then{' '}
            <span className="font-mono text-[12px]">20260801000000</span> on test, then refresh.
          </div>
        ) : null}

        {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}

        {withdrawnOfferNotice ? (
          <div
            role="status"
            className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
          >
            <p className="min-w-0 flex-1 text-center sm:text-left">{withdrawnOfferNotice}</p>
            <button
              type="button"
              onClick={() => {
                setWithdrawnOfferNotice('')
                clearStableWithdrawnDeepLinkParams({ clearStableDeal: true })
              }}
              className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-amber-200/90 touch-manipulation hover:bg-amber-900/40"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {!schemaMissing && userId && !initialStableLoadDone ? (
          <>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Stable Manager
            </h2>
            <PokerSurfaceBootLoading label="Loading Stable…" />
          </>
        ) : null}

        {!schemaMissing && userId && initialStableLoadDone ? (
          <>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Stable Manager
            </h2>
            <PokerStablePortfolioHero
              metrics={portfolioMetrics}
              pendingCommitCount={pendingPortfolioCommits.length}
              onOpenDetail={() => setPortfolioDetailOpen(true)}
              onNeedsAttention={() => setAttentionOpen(true)}
              onCreateStake={() => {
                setError('')
                setCreateStakeSeed(null)
                setSheet('request')
              }}
            />
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Active horses
          </h2>
          {/* pt keeps first-arrival pulse glow above the card from sitting under the label */}
          <div className={highlightPendingOffer ? 'relative z-[1] pt-2' : undefined}>
          {activeDeals.length === 0 ? (
            <div
              data-elevated-card="surface"
              className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-5 py-10 text-center"
            >
              <BarnIcon className="mx-auto mb-3 text-[#b4533c]" size={28} strokeWidth={1.5} />
              <p className="text-sm font-semibold text-zinc-300">No horses yet</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                Request an Edge player by handle with your slice terms. When they accept, their
                stake bankroll syncs here… separate from their personal roll.
              </p>
            </div>
          ) : (
            <PokerStableHorseCarousel
              deals={activeDeals}
              labelDeals={horseDeals}
              toneDeals={horseToneDeals}
              slicesByDeal={slicesByDeal}
              bankrollByDeal={bankrollByDealWithSessions}
              statsByDeal={statsByDeal}
              profilesById={profilesById}
              userId={userId}
              partyLabel={partyLabel}
              focusDealId={focusHorseDealId}
              onFocusDealIdChange={setFocusHorseDealId}
              onOpenDeal={openDealDetail}
              onRevoke={onRevoke}
              onAcceptSlice={onAcceptSlice}
              onDeclineSlice={onDeclineSlice}
              onOpenTerms={setTermsDealId}
              onOpenChatWithUser={onOpenChatWithUser}
              onOpenChatRoom={onOpenChatRoom}
              supabaseClient={supabaseClient}
              saving={saving}
              onNudgePendingBacker={onNudgePendingBacker}
              nudgingSliceId={nudgingSliceId}
              nudgeDisabled={saving}
              pendingCommits={pendingCommits}
              horseSparkByDeal={horseSparkByDeal}
              onArchiveHorse={onArchiveHorse}
              onOpenClosedHorseReview={openClosedHorseReview}
              onDeleteDeclinedHorse={onDeleteDeclinedHorse}
              onNewProposalHorse={(dealId) =>
                void onDeleteDeclinedHorse(dealId, { openNewProposal: true })
              }
              highlightPendingInvite={highlightPendingOffer}
            />
          )}
          </div>
        </section>

        {historyDeals.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Closed stakes
            </h2>
            <div className="space-y-3">
              {historyDeals.map((deal) => {
                const slices = slicesByDeal[deal.id] || []
                const sessionCount = stableSessions.filter(
                  (s) => s.deal_id === deal.id && s.status !== 'active',
                ).length
                const closedAt = deal.settled_at || deal.updated_at || deal.created_at
                const label = backerStableDealDisplayLabel(deal, horseDeals)
                const playerName = partyLabel(deal, 'staker')
                const { total: realizedBackingNet } = archivedStakeBackerEconomicsBreakdown({
                  deal,
                  slices,
                  settlements: dealSettlementsByDeal[deal.id] || [],
                  viewerUserId: userId,
                  sessions: stableSessions,
                })
                const playerSessionProfit = archivedStakePlayerSessionProfit({
                  deal,
                  sessions: stableSessions,
                })
                const outcomeLabel = archivedStakeOutcomeLabel(deal, slices)
                const settleRows = dealSettlementsByDeal[deal.id] || []
                return (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => {
                      setArchiveDetailDealId(deal.id)
                      triggerTapHapticLight()
                    }}
                    data-poker-stake-archive-card
                    data-elevated-card="surface"
                    className="flex w-full flex-col gap-1 rounded-3xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-4 text-left touch-manipulation active:bg-zinc-800/80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold text-white">{playerName}</span>
                      <span
                        data-poker-stake-archive-outcome={outcomeLabel.toLowerCase()}
                        className={archivedStakeOutcomeBadgeClass(outcomeLabel)}
                      >
                        {outcomeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {label !== playerName ? `${label} · ` : ''}
                      {dealTypeLabel(deal.deal_type)}
                      {closedAt
                        ? ` · ${new Date(closedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}`
                        : null}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {sessionCount} session{sessionCount === 1 ? '' : 's'} · baseline{' '}
                      {fmtPoker$(deal.baseline_bankroll)}
                    </p>
                    <p
                      data-poker-pl-tone={pokerPlTone(playerSessionProfit)}
                      className="text-[11px] font-semibold tabular-nums"
                    >
                      {playerName} performance {fmtPoker$(playerSessionProfit)}
                    </p>
                    <p
                      data-poker-pl-tone={pokerPlTone(realizedBackingNet)}
                      className="text-[11px] font-semibold tabular-nums"
                    >
                      Realized backing {fmtPoker$(realizedBackingNet)}
                      {settleRows.length <= 1 ? null : ` · ${settleRows.length} settles`}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
          </>
        ) : null}
        </div>
      </ScrollLinkedEdgeTitleBarShell>

      {portfolioDetailOpen ? (
        <PokerStablePortfolioDetailSheet
          open={portfolioDetailOpen}
          onClose={() => setPortfolioDetailOpen(false)}
          metrics={portfolioMetrics}
          hasProfile={Boolean(backerProfile?.has_profile)}
          saving={saving}
          onDeposit={onDepositBackerBankroll}
          onWithdraw={onWithdrawBackerBankroll}
          horseDeals={horseDeals}
          sessions={stableSessions}
          slicesByDeal={slicesByDeal}
          profilesById={profilesById}
          userId={userId}
          adjustments={backerAdjustments}
        />
      ) : null}

      {proposeAfterDecline ? (
        <PokerStableProposeAfterDeclineModal
          counterpartLabel={proposeAfterDecline.counterpartLabel}
          onCancel={() => setProposeAfterDecline(null)}
          onPropose={() => {
            void (async () => {
              const seed = proposeAfterDecline.seed
              const declinedId =
                proposeAfterDecline.declinedDealId || seed?.replaceDeclinedDealId || null
              setProposeAfterDecline(null)
              // Drop the declined card for the initiator before opening a fresh form.
              if (supabaseClient && declinedId) {
                const { error: delErr } = await deleteDeclinedStakeDeal(
                  supabaseClient,
                  declinedId,
                )
                if (!delErr) await load()
              }
              setCreateStakeSeed(seed)
              setSheet('request')
            })()
          }}
        />
      ) : null}

      {sheet === 'request' && supabaseClient && userId ? (
        <PokerStableBackerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={saving}
          onSavingChange={setSaving}
          seedForm={createStakeSeed}
          backingBankrollBalance={portfolioMetrics.liquidBankroll ?? 0}
          stableDeals={deals}
          stableSlicesByDeal={slicesByDeal}
          onClose={() => {
            setSheet(null)
            setCreateStakeSeed(null)
          }}
          onCreated={() => {
            setCreateStakeSeed(null)
            void load()
          }}
        />
      ) : null}

      {termsDealId && supabaseClient && userId ? (
        <PokerStableDealTermsSheet
          deal={deals.find((d) => d.id === termsDealId) ?? null}
          slices={slicesByDeal[termsDealId] || []}
          profilesById={profilesById}
          userId={userId}
          saving={saving}
          onClose={() => setTermsDealId(null)}
        />
      ) : null}

      {closedHorseReviewDealId ? (
        <PokerStableClosedHorseSheet
          deal={deals.find((d) => d.id === closedHorseReviewDealId) ?? null}
          profilesById={profilesById}
          saving={saving}
          onClose={() => setClosedHorseReviewDealId(null)}
          onArchive={() => void onArchiveHorse(closedHorseReviewDealId)}
          onDelete={() => void onDeleteClosedHorse(closedHorseReviewDealId)}
        />
      ) : null}

      {archiveDetailDealId && userId ? (
        <PokerStakeArchiveDetailModal
          deal={deals.find((d) => d.id === archiveDetailDealId) ?? null}
          slices={slicesByDeal[archiveDetailDealId] || []}
          profilesById={profilesById}
          topups={dealTopupsByDeal[archiveDetailDealId] || []}
          reductions={dealReductionsByDeal[archiveDetailDealId] || []}
          settlements={dealSettlementsByDeal[archiveDetailDealId] || []}
          sessions={stableSessions.filter((s) => s.deal_id === archiveDetailDealId)}
          perspective="backer"
          viewerUserId={userId}
          onClose={() => setArchiveDetailDealId(null)}
          onDelete={() => void onDeleteClosedHorse(archiveDetailDealId)}
          deleteBusy={saving}
        />
      ) : null}

      {detailDeal &&
      supabaseClient &&
      userId &&
      isViewerBackingDeal(detailDeal, userId, slicesByDeal) ? (
        <PokerStableDealDetailSheet
          supabaseClient={supabaseClient}
          userId={userId}
          deal={detailDeal}
          slices={slicesByDeal[detailDeal.id] || []}
          roll={bankrollByDealWithSessions[detailDeal.id]}
          profilesById={profilesById}
          sessions={stableSessions}
          topups={dealTopupsByDeal[detailDeal.id] || []}
          reductions={dealReductionsByDeal[detailDeal.id] || []}
          settlements={dealSettlementsByDeal[detailDeal.id] || []}
          pendingCommits={pendingCommits.filter((row) => row.deal_id === detailDeal.id)}
          saving={saving}
          onSavingChange={setSaving}
          onClose={() => setDetailDealId(null)}
          onRefresh={load}
          onError={setError}
          onOpenPokerBankroll={onOpenPokerBankroll}
          onArchive={
            backerStableShowsClosedCarouselCard(
              detailDeal,
              slicesByDeal[detailDeal.id] || [],
              userId,
            )
              ? () => void onArchiveHorse(detailDeal.id)
              : null
          }
        />
      ) : null}

      {attentionOpen && supabaseClient ? (
        <PokerStableAttentionSheet
          supabaseClient={supabaseClient}
          commits={pendingPortfolioCommits}
          saving={saving}
          onSavingChange={setSaving}
          onClose={() => setAttentionOpen(false)}
          onSynced={load}
          onOpenDeal={openDealDetail}
          onError={setError}
        />
      ) : null}

      {backerSliceOnboardingOpen && backerOnboardingSliceRow ? (
        <PokerStableBackerSliceOfferOnboardingModal
          deal={backerOnboardingSliceRow.deal}
          slice={backerOnboardingSliceRow.slice}
          profilesById={profilesById}
          saving={saving}
          onAccept={() => void onAcceptBackerSliceOnboarding()}
          onDecline={() => void onDeclineBackerSliceOnboarding()}
        />
      ) : null}
    </>
  )
}
