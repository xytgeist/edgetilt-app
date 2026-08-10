import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BarnIcon from '../../components/BarnIcon.jsx'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import { clearStableCommitDeepLinkParams } from '../../utils/loungeActivityInAppNavigate.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$, pokerPlTone } from '../poker-bankroll/pokerBankrollMath.js'
import PokerStakeArchiveDetailModal from '../poker-bankroll/PokerStakeArchiveDetailModal.jsx'
import { PokerStableBackerDealSheet, PokerStablePlayerDealSheet } from './PokerStableCreateDealSheet.jsx'
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
  archivedStakeBackerSessionShareTotal,
} from './pokerStableDealHistory.js'
import {
  acceptSliceAsStaker,
  archiveBackerStableDeal,
  hideBackerStableDeal,
  declineProposedDealTerms,
  declineSliceAsStaker,
  dealIdsForAcceptedBackerVisibility,
  isMissingStableTableError,
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
  stakerAcceptCounterTerms,
  stakerDeclineCounterTerms,
} from './pokerStableApi.js'
import { notifyPokerOfferAttentionChanged } from './pokerPendingOfferAttention.js'
import { dealTypeLabel } from './pokerStableMath.js'
import {
  archivedStakeOutcomeBadgeClass,
  archivedStakeOutcomeLabel,
  dealStakeeDisplayName,
  dealLeadBackerDisplayName,
  stakeeSkipsBackerCommitSync,
} from './pokerStableTerms.js'
function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'pending') return 'Pending'
  if (status === 'settled') return 'Settled'
  if (status === 'declined') return 'Declined'
  if (status === 'revoked') return 'Revoked'
  return status || 'Unknown'
}

function statusTone(status) {
  if (status === 'active') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'pending') return 'bg-zinc-700/60 text-zinc-300'
  if (status === 'declined') return 'bg-zinc-700/60 text-zinc-400'
  return 'bg-rose-500/20 text-rose-300'
}

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
  backerSliceOnboardingDealId = null,
  backerSliceOnboardingSliceId = null,
  onBackerSliceOnboardingConsumed = null,
  /** @type {(dealId: string) => void} */
  onOpenPokerBankroll = null,
  /** First breadcrumb arrival: pulse pending Accept/Decline offer cards. */
  highlightPendingOffer = false,
  onHighlightPendingOfferConsumed = null,
}) {
  const [userId, setUserId] = useState(null)
  const [deals, setDeals] = useState([])
  const [profilesById, setProfilesById] = useState(/** @type {Record<string, object>} */ ({}))
  const [bankrollByDeal, setBankrollByDeal] = useState(/** @type {Record<string, object>} */ ({}))
  const [statsByDeal, setStatsByDeal] = useState(
    /** @type {Record<string, { sessions: number, profit: number }>} */ ({}),
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nudgingSliceId, setNudgingSliceId] = useState(null)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [slicesByDeal, setSlicesByDeal] = useState(/** @type {Record<string, object[]>} */ ({}))
  const [sheet, setSheet] = useState(/** @type {null | 'request'} */ (null))
  const [detailDealId, setDetailDealId] = useState(/** @type {string | null} */ (null))
  const [termsDealId, setTermsDealId] = useState(/** @type {string | null} */ (null))
  const [editTermsDealId, setEditTermsDealId] = useState(/** @type {string | null} */ (null))
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
  const [locationsDealId, setLocationsDealId] = useState(/** @type {string | null} */ (null))
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

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!supabaseClient || !userId) {
      setDeals([])
      setLoading(false)
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
          return
        }
        throw dErr
      }
      setSchemaMissing(false)
      setDeals(rows)
      const dealIds = rows.map((d) => d.id)
      const { byDeal: sliceMap, error: slErr } = await loadDealSlices(supabaseClient, dealIds)
      if (slErr && !isMissingStableTableError(slErr)) console.warn('[poker-stable] slices', slErr.message)
      setSlicesByDeal(sliceMap || {})

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
      setError(e?.message || 'Could not load Stable.')
      setDeals([])
    } finally {
      if (!silent) setLoading(false)
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

  const activeBackerOnboardingDealId =
    backerSliceOnboardingDealId || readPokerStableBackerOnboardingDealId()
  const activeBackerOnboardingSliceId =
    backerSliceOnboardingSliceId || readPokerStableBackerOnboardingSliceId()

  useEffect(() => {
    if (!openStableDealId || loading || !userId) return
    if (activeBackerOnboardingDealId && activeBackerOnboardingSliceId) {
      onOpenStableDealConsumed?.()
      return
    }
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
      void load({ silent: true })
      onOpenStableDealConsumed?.()
      return
    }
    setDetailDealId(openStableDealId)
    void load({ silent: true })
    onOpenStableDealConsumed?.()
  }, [
    openStableDealId,
    loading,
    userId,
    slicesByDeal,
    pendingCommits,
    onOpenStableDealConsumed,
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
    if (deal.stakee_terms_ack_required) return null
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
    closeBackerSliceOnboarding()
  }

  function onEditTermsBackerSliceOnboarding() {
    const dealId = backerOnboardingSliceRow?.deal?.id
    if (!dealId) return
    setBackerSliceOnboardingOpen(false)
    setEditTermsDealId(dealId)
    triggerTapHapticLight()
  }

  useEffect(() => {
    if (!detailDealId || !userId) return
    const deal = deals.find((d) => d.id === detailDealId)
    if (deal && !isViewerBackingDeal(deal, userId, slicesByDeal)) {
      setDetailDealId(null)
    }
  }, [detailDealId, deals, userId, slicesByDeal])

  const counterProposals = useMemo(
    () =>
      deals.filter(
        (d) =>
          d.staker_user_id === userId &&
          d.status === 'pending' &&
          d.staker_terms_ack_required,
      ),
    [deals, userId],
  )
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
    ],
  )

  async function onAcceptCounter(dealId) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await stakerAcceptCounterTerms(supabaseClient, dealId)
      if (err) throw err
      triggerTapHapticLight()
      notifyPokerOfferAttentionChanged()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not accept counter-proposal.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeclineCounter(dealId) {
    if (!supabaseClient) return
    const deal = deals.find((d) => d.id === dealId)
    const label = deal?.label?.trim() || 'this stake'
    if (!window.confirm(`Decline the counter-proposal on ${label}? This kills the stake for everyone.`)) {
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await stakerDeclineCounterTerms(supabaseClient, dealId)
      if (err) throw err
      notifyPokerOfferAttentionChanged()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not decline counter-proposal.')
    } finally {
      setSaving(false)
    }
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
      setError(e?.message || 'Could not accept slice.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeclineSlice(sliceId) {
    if (!supabaseClient || !userId) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await declineSliceAsStaker(supabaseClient, sliceId, userId)
      if (err) throw err
      notifyPokerOfferAttentionChanged()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not decline slice.')
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
    setEditTermsDealId(null)
  }

  async function onArchiveHorse(dealId) {
    if (!supabaseClient || !userId) return
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

        {!schemaMissing && userId ? (
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
                setSheet('request')
              }}
            />
          </>
        ) : null}

        {!schemaMissing && userId ? (
          <>
        {counterProposals.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Counter-proposals
            </h2>
            <div className={`space-y-2 ${highlightPendingOffer ? 'relative z-[1] pt-2' : ''}`}>
              {counterProposals.map((deal) => (
                <div
                  key={deal.id}
                  data-poker-stable-invite-card
                  data-poker-offer-attention-pulse={highlightPendingOffer ? '1' : undefined}
                  data-elevated-card="surface"
                  className="rounded-2xl border border-zinc-700/40 bg-gradient-to-br from-zinc-900 to-zinc-800 p-4"
                >
                  <div className="font-bold text-white">
                    {dealStakeeDisplayName(deal, profilesById)} proposed new terms
                    {deal.label ? ` · ${deal.label}` : ''}
                  </div>
                  <p className="mt-2 text-xs text-amber-200/90">
                    Accept to apply their terms. The player still must accept before the stake goes
                    live.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTermsDealId(deal.id)}
                      className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
                    >
                      Review terms
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onAcceptCounter(deal.id)}
                      className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                    >
                      Accept counter
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onDeclineCounter(deal.id)}
                      className="flex-1 rounded-2xl bg-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Active horses
          </h2>
          {/* pt keeps first-arrival pulse glow above the card from sitting under the label */}
          <div className={highlightPendingOffer ? 'relative z-[1] pt-2' : undefined}>
          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
          ) : activeDeals.length === 0 ? (
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
              saving={saving}
              onNudgePendingBacker={onNudgePendingBacker}
              nudgingSliceId={nudgingSliceId}
              nudgeDisabled={saving}
              pendingCommits={pendingCommits}
              horseSparkByDeal={horseSparkByDeal}
              onArchiveHorse={onArchiveHorse}
              onOpenClosedHorseReview={openClosedHorseReview}
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
                })
                const sessionShareTotal = archivedStakeBackerSessionShareTotal({
                  deal,
                  slices,
                  sessions: stableSessions,
                  viewerUserId: userId,
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
                      data-poker-pl-tone={pokerPlTone(sessionShareTotal)}
                      className="text-[11px] font-semibold tabular-nums"
                    >
                      {playerName} performance {fmtPoker$(sessionShareTotal)}
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
          locationsDealId={locationsDealId}
          onSelectLocationsDealId={setLocationsDealId}
        />
      ) : null}

      {sheet === 'request' && supabaseClient && userId ? (
        <PokerStableBackerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={saving}
          onSavingChange={setSaving}
          backingBankrollBalance={portfolioMetrics.liquidBankroll ?? 0}
          stableDeals={deals}
          stableSlicesByDeal={slicesByDeal}
          onClose={() => setSheet(null)}
          onCreated={() => void load()}
        />
      ) : null}

      {termsDealId && supabaseClient && userId ? (
        <PokerStableDealTermsSheet
          deal={deals.find((d) => d.id === termsDealId) ?? null}
          slices={slicesByDeal[termsDealId] || []}
          proposedPayload={deals.find((d) => d.id === termsDealId)?.pending_terms_json ?? null}
          profilesById={profilesById}
          userId={userId}
          saving={saving}
          onClose={() => setTermsDealId(null)}
          onEdit={() => {
            setTermsDealId(null)
            setEditTermsDealId(termsDealId)
          }}
          onDeclineProposal={async () => {
            setSaving(true)
            try {
              const { error } = await declineProposedDealTerms(supabaseClient, termsDealId)
              if (error) throw error
              setTermsDealId(null)
              await load()
            } catch (e) {
              setError(e?.message || 'Could not decline proposal.')
            } finally {
              setSaving(false)
            }
          }}
        />
      ) : null}

      {editTermsDealId && supabaseClient && userId ? (
        <PokerStablePlayerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={saving}
          onSavingChange={setSaving}
          editDeal={deals.find((d) => d.id === editTermsDealId) ?? null}
          editSlices={slicesByDeal[editTermsDealId] || []}
          editProfilesById={profilesById}
          termsIntent="backer_propose"
          onClose={() => setEditTermsDealId(null)}
          onUpdated={() => {
            setEditTermsDealId(null)
            void load()
          }}
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
          onEditTerms={onEditTermsBackerSliceOnboarding}
        />
      ) : null}
    </>
  )
}
