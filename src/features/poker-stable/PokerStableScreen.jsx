import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$, pokerPlTone } from '../poker-bankroll/pokerBankrollMath.js'
import PokerStakeArchiveDetailModal from '../poker-bankroll/PokerStakeArchiveDetailModal.jsx'
import { PokerStableBackerDealSheet, PokerStablePlayerDealSheet } from './PokerStableCreateDealSheet.jsx'
import PokerStableAttentionSheet from './PokerStableAttentionSheet.jsx'
import PokerStableDealDetailSheet from './PokerStableDealDetailSheet.jsx'
import PokerStableDealTermsSheet from './PokerStableDealTermsSheet.jsx'
import PokerStableHorseCarousel from './PokerStableHorseCarousel.jsx'
import PokerStableLocationsTab from './PokerStableLocationsTab.jsx'
import PokerStablePortfolioHero from './PokerStablePortfolioHero.jsx'
import PokerStableTrendTab from './PokerStableTrendTab.jsx'
import {
  computeBackerPortfolioPerformanceMetrics,
  computeBackerPortfolioTrendChart,
  partitionBackerDeals,
} from './pokerStableBackerMath.js'
import {
  archivedStakeBackerEconomicsBreakdown,
  archivedStakeBackerSessionShareTotal,
} from './pokerStableDealHistory.js'
import {
  acceptHorseDeal,
  acceptSliceAsStaker,
  declineHorseDeal,
  declineProposedDealTerms,
  declineSliceAsStaker,
  isMissingStableTableError,
  isViewerBackingDeal,
  loadBackerBankroll,
  loadBackerBankrollAdjustments,
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
  revokeHorseDeal,
  depositBackerBankroll,
  withdrawBackerBankroll,
  sliceDisplayName,
  stakerAcceptCounterTerms,
  stakerDeclineCounterTerms,
} from './pokerStableApi.js'
import { dealTypeLabel } from './pokerStableMath.js'
import {
  archivedStakeOutcomeBadgeClass,
  archivedStakeOutcomeLabel,
  dealStakeeDisplayName,
  dealLeadBackerDisplayName,
} from './pokerStableTerms.js'

const STABLE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'locations', label: 'Locations' },
]

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'pending') return 'Pending'
  if (status === 'settled') return 'Settled'
  if (status === 'declined') return 'Declined'
  if (status === 'revoked') return 'Revoked'
  return status || 'Unknown'
}

function statusTone(status) {
  if (status === 'active') return 'bg-amber-500/20 text-amber-300'
  if (status === 'pending') return 'bg-amber-500/15 text-amber-200/90'
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
  /** @type {(dealId: string) => void} */
  onOpenPokerBankroll = null,
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
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [slicesByDeal, setSlicesByDeal] = useState(/** @type {Record<string, object[]>} */ ({}))
  const [sheet, setSheet] = useState(/** @type {null | 'request'} */ (null))
  const [detailDealId, setDetailDealId] = useState(/** @type {string | null} */ (null))
  const [termsDealId, setTermsDealId] = useState(/** @type {string | null} */ (null))
  const [editTermsDealId, setEditTermsDealId] = useState(/** @type {string | null} */ (null))
  const [activeTab, setActiveTab] = useState('overview')
  const [backerProfile, setBackerProfile] = useState(
    /** @type {{ bankroll_balance: number, realized_backing_pl: number, has_profile: boolean } | null} */ (null),
  )
  const [pendingCommits, setPendingCommits] = useState(/** @type {object[]} */ ([]))
  const [stableSessions, setStableSessions] = useState(/** @type {object[]} */ ([]))
  const [backerAdjustments, setBackerAdjustments] = useState(/** @type {object[]} */ ([]))
  const [attentionOpen, setAttentionOpen] = useState(false)
  const [locationsDealId, setLocationsDealId] = useState(/** @type {string | null} */ (null))
  const [dealSettlementsByDeal, setDealSettlementsByDeal] = useState(
    /** @type {Record<string, object[]>} */ ({}),
  )
  const [dealTopupsByDeal, setDealTopupsByDeal] = useState(/** @type {Record<string, object[]>} */ ({}))
  const [dealReductionsByDeal, setDealReductionsByDeal] = useState(
    /** @type {Record<string, object[]>} */ ({}),
  )
  const [archiveDetailDealId, setArchiveDetailDealId] = useState(/** @type {string | null} */ (null))

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

  const load = useCallback(async () => {
    if (!supabaseClient || !userId) {
      setDeals([])
      setLoading(false)
      return
    }
    setLoading(true)
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

      const activeIds = rows.filter((d) => d.status === 'active').map((d) => d.id)
      const backingIds = rows
        .filter((d) => isViewerBackingDeal(d, userId, sliceMap || {}))
        .map((d) => d.id)
      const [{ byDeal: rolls }, { byDeal: stats }, backerRes, commitsRes, sessionsRes, adjRes] =
        await Promise.all([
          loadDealBankrollProfiles(supabaseClient, activeIds),
          loadDealSessionStats(supabaseClient, activeIds),
          loadBackerBankroll(supabaseClient),
          loadPendingCommits(supabaseClient),
          loadDealSessionsForStable(supabaseClient, backingIds),
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
      setPendingCommits(commitsRes.commits || [])
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
            (d.status === 'settled' || d.status === 'revoked'),
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
      setLoading(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  useEffect(() => {
    if (!openStableDealId || loading) return
    setDetailDealId(openStableDealId)
    onOpenStableDealConsumed?.()
  }, [openStableDealId, loading, onOpenStableDealConsumed])

  const incoming = useMemo(
    () =>
      deals.filter(
        (d) =>
          d.stakee_user_id === userId &&
          d.status === 'pending' &&
          d.staker_user_id != null &&
          !d.staker_terms_ack_required,
      ),
    [deals, userId],
  )
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
  const incomingSlices = useMemo(() => {
    /** @type {Array<{ deal: object, slice: object }>} */
    const rows = []
    for (const d of deals) {
      if (d.stakee_user_id === userId) continue
      // Backer Create Stake: lead staker already committed their slice at create.
      if (d.staker_user_id === userId) continue
      for (const s of slicesByDeal[d.id] || []) {
        if (s.staker_user_id === userId && s.status === 'pending') rows.push({ deal: d, slice: s })
      }
    }
    return rows
  }, [deals, userId, slicesByDeal])
  const detailDeal = useMemo(
    () => deals.find((d) => d.id === detailDealId) || null,
    [deals, detailDealId],
  )

  const { activeDeals, historyDeals } = useMemo(
    () => partitionBackerDeals(deals, slicesByDeal, userId),
    [deals, slicesByDeal, userId],
  )

  const horseDeals = useMemo(
    () => [...activeDeals, ...historyDeals],
    [activeDeals, historyDeals],
  )

  const portfolioMetrics = useMemo(
    () =>
      computeBackerPortfolioPerformanceMetrics({
        deals,
        slicesByDeal,
        userId,
        bankrollByDeal,
        liquidBankroll: backerProfile?.bankroll_balance ?? 0,
        realizedPl: backerProfile?.realized_backing_pl ?? 0,
        horseDeals,
        sessions: stableSessions,
        adjustments: backerAdjustments,
      }),
    [
      deals,
      slicesByDeal,
      userId,
      bankrollByDeal,
      backerProfile,
      horseDeals,
      stableSessions,
      backerAdjustments,
    ],
  )

  const portfolioSpark = useMemo(
    () =>
      computeBackerPortfolioTrendChart({
        horseDeals,
        sessions: stableSessions,
        slicesByDeal,
        userId,
      }).portfolio,
    [horseDeals, stableSessions, slicesByDeal, userId],
  )

  async function onDepositBackerBankroll(amount) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { profile, error: err } = await depositBackerBankroll(supabaseClient, amount)
      if (err) throw err
      setBackerProfile((prev) => ({
        bankroll_balance: profile?.bankroll_balance ?? amount,
        realized_backing_pl: prev?.realized_backing_pl ?? 0,
        has_profile: true,
      }))
      triggerTapHapticLight()
      void load()
    } catch (e) {
      setError(e?.message || 'Could not adjust bankroll.')
    } finally {
      setSaving(false)
    }
  }

  async function onWithdrawBackerBankroll(amount) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { profile, error: err } = await withdrawBackerBankroll(supabaseClient, amount)
      if (err) throw err
      setBackerProfile((prev) => ({
        bankroll_balance: profile?.bankroll_balance ?? 0,
        realized_backing_pl: prev?.realized_backing_pl ?? 0,
        has_profile: true,
      }))
      triggerTapHapticLight()
      void load()
    } catch (e) {
      setError(e?.message || 'Could not adjust bankroll.')
    } finally {
      setSaving(false)
    }
  }

  async function onAccept(dealId) {
    if (!supabaseClient || !userId) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await acceptHorseDeal(supabaseClient, dealId, userId)
      if (err) throw err
      triggerTapHapticLight()
      await load()
    } catch (e) {
      setError(e?.message || 'Could not accept.')
    } finally {
      setSaving(false)
    }
  }

  async function onDecline(dealId) {
    if (!supabaseClient || !userId) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await declineHorseDeal(supabaseClient, dealId, userId)
      if (err) throw err
      await load()
    } catch (e) {
      setError(e?.message || 'Could not decline.')
    } finally {
      setSaving(false)
    }
  }

  async function onAcceptCounter(dealId) {
    if (!supabaseClient) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await stakerAcceptCounterTerms(supabaseClient, dealId)
      if (err) throw err
      triggerTapHapticLight()
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

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div data-poker-stable>
        <SlotsToolPageHeader
          center={
            <div className="text-center">
              <div className="text-lg font-black tracking-tight text-white">Stable</div>
              <div className="text-[11px] text-zinc-500">Back horses · sync stake rolls</div>
            </div>
          }
        />

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
            <PokerStablePortfolioHero
              metrics={portfolioMetrics}
              hasProfile={Boolean(backerProfile?.has_profile)}
              saving={saving}
              onDeposit={onDepositBackerBankroll}
              onWithdraw={onWithdrawBackerBankroll}
              pendingCommitCount={pendingCommits.length}
              onNeedsAttention={() => setAttentionOpen(true)}
              sparkSeries={portfolioSpark}
              onOpenTrend={() => {
                setActiveTab('trend')
                triggerTapHapticLight()
              }}
            />

            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setSheet('request')
                  triggerTapHapticLight()
                }}
                className="w-full rounded-3xl bg-amber-600 py-4 text-sm font-bold text-white touch-manipulation active:bg-amber-500"
                data-poker-stable-primary-btn
              >
                Create Stake
              </button>
            </div>

            <div
              data-poker-stable-tabs
              className="mb-4 flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1"
            >
              {STABLE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    triggerTapHapticLight()
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wide touch-manipulation ${
                    activeTab === tab.id
                      ? 'bg-amber-600 text-white'
                      : 'text-zinc-400 active:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {activeTab === 'overview' ? (
          <>
        {incomingSlices.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Backing invites
            </h2>
            <div className="space-y-2">
              {incomingSlices.map(({ deal, slice }) => (
                <div
                  key={slice.id}
                  data-poker-stable-invite-card
                  data-elevated-card="surface"
                  className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-zinc-900/80 p-4"
                >
                  <div className="font-bold text-white">
                    {dealStakeeDisplayName(deal, profilesById)} invited you · {slice.action_pct}% ·{' '}
                    {deal.label || dealTypeLabel(deal.deal_type)}
                  </div>
                  {deal.stakee_terms_ack_required ? (
                    <p className="mt-2 text-xs text-amber-200/90">
                      Waiting for the player to accept revised terms before you can accept your slice.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTermsDealId(deal.id)}
                      className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
                    >
                      Terms
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTermsDealId(null)
                        setEditTermsDealId(deal.id)
                      }}
                      className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
                    >
                      Edit terms
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving || deal.stakee_terms_ack_required}
                      onClick={() => void onAcceptSlice(slice.id)}
                      className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
                    >
                      Accept slice
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onDeclineSlice(slice.id)}
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

        {counterProposals.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Counter-proposals
            </h2>
            <div className="space-y-2">
              {counterProposals.map((deal) => (
                <div
                  key={deal.id}
                  data-poker-stable-invite-card
                  data-elevated-card="surface"
                  className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-zinc-900/80 p-4"
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

        {incoming.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              Incoming requests
            </h2>
            <div className="space-y-2">
              {incoming.map((deal) => (
                <div
                  key={deal.id}
                  data-poker-stable-invite-card
                  data-elevated-card="surface"
                  className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-zinc-900/80 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">
                        {dealLeadBackerDisplayName(deal, profilesById)}
                      </div>
                      <div className="mt-0.5 text-sm text-zinc-400">
                        wants to stake you
                        {deal.label ? ` · ${deal.label}` : ''}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(deal.status)}`}
                    >
                      {statusLabel(deal.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTermsDealId(deal.id)}
                      className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
                    >
                      Terms
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onAccept(deal.id)}
                      className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onDecline(deal.id)}
                      className="flex-1 rounded-2xl bg-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation active:bg-zinc-600 disabled:opacity-50"
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
          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
          ) : activeDeals.length === 0 ? (
            <div
              data-elevated-card="surface"
              className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-5 py-10 text-center"
            >
              <Users className="mx-auto mb-3 text-zinc-600" size={28} strokeWidth={1.5} />
              <p className="text-sm font-semibold text-zinc-300">No horses yet</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                Request an Edge player by handle with your slice terms. When they accept, their
                stake bankroll syncs here… separate from their personal roll.
              </p>
            </div>
          ) : (
            <PokerStableHorseCarousel
              deals={activeDeals}
              slicesByDeal={slicesByDeal}
              bankrollByDeal={bankrollByDeal}
              statsByDeal={statsByDeal}
              profilesById={profilesById}
              userId={userId}
              partyLabel={partyLabel}
              onOpenDeal={openDealDetail}
              onRevoke={onRevoke}
            />
          )}
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
                const label = deal.label?.trim() || dealTypeLabel(deal.deal_type)
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

        {activeTab === 'trend' && userId ? (
          <PokerStableTrendTab
            horseDeals={horseDeals}
            sessions={stableSessions}
            slicesByDeal={slicesByDeal}
            profilesById={profilesById}
            userId={userId}
          />
        ) : null}

        {activeTab === 'locations' && userId ? (
          <PokerStableLocationsTab
            sessions={stableSessions}
            horseDeals={horseDeals}
            slicesByDeal={slicesByDeal}
            profilesById={profilesById}
            userId={userId}
            selectedDealId={locationsDealId}
            onSelectDealId={setLocationsDealId}
          />
        ) : null}
        </div>
      </ScrollLinkedEdgeTitleBarShell>

      {sheet === 'request' && supabaseClient && userId ? (
        <PokerStableBackerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={saving}
          onSavingChange={setSaving}
          backingBankrollBalance={backerProfile?.bankroll_balance ?? 0}
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
        />
      ) : null}

      {detailDeal && supabaseClient && userId ? (
        <PokerStableDealDetailSheet
          supabaseClient={supabaseClient}
          userId={userId}
          deal={detailDeal}
          slices={slicesByDeal[detailDeal.id] || []}
          roll={bankrollByDeal[detailDeal.id]}
          profilesById={profilesById}
          saving={saving}
          onSavingChange={setSaving}
          onClose={() => setDetailDealId(null)}
          onRefresh={load}
          onError={setError}
          onOpenPokerBankroll={onOpenPokerBankroll}
        />
      ) : null}

      {attentionOpen && supabaseClient ? (
        <PokerStableAttentionSheet
          supabaseClient={supabaseClient}
          commits={pendingCommits}
          saving={saving}
          onSavingChange={setSaving}
          onClose={() => setAttentionOpen(false)}
          onSynced={load}
          onOpenDeal={openDealDetail}
          onError={setError}
        />
      ) : null}
    </>
  )
}
