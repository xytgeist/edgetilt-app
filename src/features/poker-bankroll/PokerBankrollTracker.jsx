import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { DollarSign, FileText, Info, Trophy } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import BankrollSparkline from '../../components/BankrollSparkline.jsx'
import { formatMoneyInputValue, parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { recordAppSessionRecorded } from '../../utils/appSectionVisitTracking.js'
import { fetchNearbyCasinos } from '../../utils/nearbyCasinos.js'
import PokerBankrollChartsTab from './PokerBankrollChartsTab.jsx'
import PokerBankrollHeroCarousel, {
  POKER_BANKROLL_HERO_SHELL,
  stakeHeroTheme,
  stakeHeroThemeIndexForDeal,
} from './PokerBankrollHeroCarousel.jsx'
import PokerBankrollImportSheet from './PokerBankrollImportSheet.jsx'
import PokerBankrollOverview from './PokerBankrollOverview.jsx'
import PokerBankrollTrendTab from './PokerBankrollTrendTab.jsx'
import PokerCashGamePicker from './PokerCashGamePicker.jsx'
import PokerFieldMenu from './PokerFieldMenu.jsx'
import PokerLocationsTab from './PokerLocationsTab.jsx'
import PokerSessionDetailSheet from './PokerSessionDetailSheet.jsx'
import PokerStakeArchiveDetailModal from './PokerStakeArchiveDetailModal.jsx'
import { tryAutoLinkGuestStakeeOffers } from './pokerGuestStakeeAutoLink.js'
import PokerStakeOfferOnboardingModal from './PokerStakeOfferOnboardingModal.jsx'
import PokerStakeeClosedStakeSheet from './PokerStakeeClosedStakeSheet.jsx'
import PokerBankrollCarouselCoachModal from './PokerBankrollCarouselCoachModal.jsx'
import {
  clearPokerStakeOnboardingDeal,
  readPokerStakeCarouselCoachAck,
  readPokerStakeOnboardingDeal,
  stashPokerStakeOnboardingDeal,
  writePokerStakeCarouselCoachAck,
} from './pokerStakeeOnboarding.js'
import {
  POKER_SHEET_PANEL_CLASS,
  POKER_SHEET_PANEL_TALL_CLASS,
} from './pokerBankrollTrackerSheet.js'
import {
  POKER_CURRENCIES,
  normalizePokerCurrency,
  resolveCurrencyFromGeolocation,
  currencyFromNearbyCasinoName,
  currencyFromOnlineSiteId,
} from './pokerCurrencies.js'
import { computeDealMakeup, dealTypeLabel } from '../poker-stable/pokerStableMath.js'
import {
  archivedStakeOutcomeBadgeClass,
  archivedStakeOutcomeLabel,
  dealIsInMakeup,
  dealLeadBackerDisplayName,
  pendingBackerAcceptanceSlices,
  dealHasAcceptedBackerSlice,
  stakeHeroBadgeLabel,
  stakeHeroBadgeVariant,
  stakeGoesLivePendingCopy,
  stakeBackingCapitalSplit,
  stakeeBankrollShowsClosedCarouselCard,
  stakeeBankrollTermsOpensManageSheet,
  stakeeDisplayDealRoll,
  stakeePendingSettleCommitForDeal,
  stakeeSkipsBackerCommitSync,
  sliceCounterpartyDisplayName,
} from '../poker-stable/pokerStableTerms.js'
import {
  acceptProposedDealTerms,
  archiveStakeeBankrollDeal,
  cancelStakeDeal,
  closeBackingDeal,
  declineProposedDealTerms,
  deleteStakeSessionWithAudit,
  isBackerInitiatedBackingDeal,
  loadLedgerEntries,
  isMissingStableTableError,
  loadDealBankrollProfiles,
  loadDealCounterpartyProfiles,
  loadDealSettlements,
  loadDealSlices,
  loadDealTopups,
  loadDealReductions,
  loadMyStableDeals,
  loadPendingCommits,
  nudgeBackerSliceAcceptance,
  notifyStableSessionComplete,
  periodicSettleBackingDeal,
  reassignGuestSliceToUser,
  stakeeAcceptBackerOffer,
  stakeeDeclineBackerOffer,
} from '../poker-stable/pokerStableApi.js'
import { PokerStablePlayerDealSheet } from '../poker-stable/PokerStableCreateDealSheet.jsx'
import PokerStableDealDetailSheet from '../poker-stable/PokerStableDealDetailSheet.jsx'
import PokerStableDealTermsSheet from '../poker-stable/PokerStableDealTermsSheet.jsx'
import PokerStableCommitSyncModal from '../poker-stable/PokerStableCommitSyncModal.jsx'
import PokerStableSettleNeedsAttnBanner from '../poker-stable/PokerStableSettleNeedsAttnBanner.jsx'
import PokerStakeeClosedStakeHeroBanner from './PokerStakeeClosedStakeHeroBanner.jsx'
import {
  archivedStakePersonalBankrollNet,
  buildPersonalSettlementHistoryEvents,
  buildStakeDealHistoryEvents,
} from '../poker-stable/pokerStableDealHistory.js'
import {
  playerSelfOwnedActionPct,
  stakeDealIsLiveForStakee,
  stakeDealPlayerSideAccepted,
} from '../poker-stable/pokerStableMath.js'
import {
  fmtPoker$,
  fmtPokerDuration,
  pokerPlTone,
  formatDurationHoursField,
  localDateTimeToIso,
  localYmd,
  parseDurationHoursField,
  pokerSessionBbPerHour,
  pokerSessionDurationHours,
  pokerSessionHourly,
  pokerSessionTotalCost,
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import {
  readStoredPokerBankrollScope,
  resolvePokerBankrollScopeToRestore,
  writeStoredPokerBankrollScope,
} from './pokerBankrollScopeStorage.js'
import {
  POKER_CASH_NEW_GAME_ID,
  POKER_LIMIT_TYPES,
  POKER_LIVE_CASH_GAME_CUSTOM_ID,
  POKER_LIVE_CASH_GAME_NAMES,
  POKER_TABLE_SIZES,
  applyCashGamePreset,
  buildCashGamePresetsFromSessions,
  cashGameLabelFromSession,
  cashGamePresetIdFromName,
  coercePokerGameForSessionType,
  formWithDefaultCashGame,
  parseCashGameLabel,
  pokerGameOptionsForSessionType,
  pokerGamePickFromStored,
  pokerGameVariantToStored,
  resolveCashGameLabelForSave,
  lastClubAppFromSessions,
  resolveOnlineSitePickFromSessions,
  lastTournamentGameFromSessions,
  pokerClubAppLabelFromId,
  pokerClubAppSelectOptions,
  pokerClubAppSelectValue,
  pokerLiveCashGameNameLabelFromId,
  pokerLiveCashGameNameSelectValue,
  pokerOnlineSiteLabelFromId,
  pokerOnlineSiteSelectOptions,
  pokerOnlineSiteSelectValue,
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'
import {
  isPersonalHistorySession,
  isPersonalMetricSession,
  playerStakeSessionValue,
  resolveSessionMetricWinLoss,
  sessionPlayerShareInMakeup,
} from './pokerSessionAttribution.js'
import PokerTournamentSwapsSection from './PokerTournamentSwapsSection.jsx'
import {
  applySoftTournamentEventToForm,
  isSoftTournamentEventPick,
  loadNearbySoftTournamentEvents,
  POKER_TOURNAMENT_MANUAL_PICK_ID,
  softTournamentPickerOptions,
} from './pokerTournamentNearbyEvents.js'
import {
  acceptCounterpartySessionBind,
  cancelTournamentSwap,
  counterpartySessionNeedsSwapEventRelink,
  ensureSessionTournamentEventLink,
  findCounterpartyBindCandidates,
  formatTournamentEventLabel,
  isMissingTournamentSwapTableError,
  loadMyTournamentSwaps,
  loadSwapCounterpartyProfiles,
  markSwapPaid,
  notifyTournamentSwap,
  notifyTournamentSwapResults,
  persistDraftSwapsForSession,
  swapIsMarkedPaid,
  swapOtherPartyLabel,
  swapViewerRole,
  syncCounterpartyResultsForSession,
  syncCreatorResultsForSession,
  sessionSwapEventMismatch,
} from './pokerTournamentSwapApi.js'
import { eventDisplayNamesDiffer } from './pokerTournamentEventKeys.js'
import {
  formatSwapIouLine,
  formatSwapSettledParenAmount,
  formatSwapWaitingStatus,
  sessionSwapSettlementDelta,
  swapViewerSettlementDelta,
} from './pokerTournamentSwapMath.js'

/** Match CasinoAutocomplete / Location field text styling. */
const POKER_FIELD_CLASS =
  'w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40'

/** Control chrome when the label lives inside the field (denser session sheets). */
const POKER_INFIELD_WRAP =
  'relative flex min-h-[3.35rem] flex-col justify-center rounded-2xl bg-zinc-800 px-3.5 py-1.5'
const POKER_INFIELD_LABEL =
  'text-[9px] font-semibold uppercase tracking-wide leading-none text-zinc-500'
const POKER_INFIELD_CONTROL =
  'w-full min-h-0 rounded-none border-0 bg-transparent px-0 text-sm font-semibold text-white outline-none focus:ring-0'

/** @param {object} form */
function pokerSessionSheetNeedsTall(form) {
  return form?.session_type === 'cash'
}

/** Online cash multi-tabling for DB write; live / club / tournament always 1. */
function tablesCountForPayload(form) {
  if (form.venue_kind !== 'online' || form.session_type !== 'cash') return 1
  const n = parseInt(form.tables_count, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 24)
}

function emptyForm() {
  const now = new Date()
  return {
    session_type: 'cash',
    venue_kind: 'live',
    venue_name: '',
    online_site_pick: '',
    club_app_pick: '',
    currency: 'USD',
    date: localYmd(now),
    start_time: `${String(now.getHours()).padStart(2, '0')}:00`,
    duration_hours: '4',
    buy_in: '',
    rebuy_amount: '',
    addon_amount: '',
    cash_out: '',
    cash_game_pick: POKER_CASH_NEW_GAME_ID,
    game_variant: 'custom',
    live_game_name_pick: 'holdem',
    game_custom_name: "Hold'em",
    limit_type: 'no_limit',
    table_size: 'full_ring',
    tables_count: '1',
    small_blind: '',
    big_blind: '',
    third_blind: '',
    ante: '',
    tournament_name: '',
    tournament_event_pick: '',
    field_size: '',
    start_stack: '',
    finish_place: '',
    bounty_winnings: '',
    reentries: '',
    notes: '',
  }
}

/** Prefill Start Session / Log past from personal defaults or active stake deal. */
function defaultNewSessionForm(activeDeal, scopedSessions, completedSessions) {
  const base = emptyForm()
  const venueKind = activeDeal?.venue_kind || 'live'

  if (activeDeal?.deal_type === 'tournament_package') {
    const lastTourneyGame = lastTournamentGameFromSessions(scopedSessions)
    const next = {
      ...base,
      session_type: 'tournament',
      venue_kind: venueKind,
      game_variant: lastTourneyGame.game_variant,
      game_custom_name: lastTourneyGame.game_custom_name,
      tournament_event_pick: '',
    }
    if (venueKind === 'club') {
      const last = lastClubAppFromSessions(completedSessions)
      if (last) {
        next.venue_name = last.venue_name
        next.club_app_pick = last.club_app_pick
      }
    } else if (venueKind === 'online') {
      const site = resolveOnlineSitePickFromSessions(completedSessions)
      next.venue_name = site.venue_name
      next.online_site_pick = site.online_site_pick
      const siteCurrency = currencyFromOnlineSiteId(site.online_site_pick)
      if (siteCurrency) next.currency = normalizePokerCurrency(siteCurrency)
    }
    return next
  }

  return formWithDefaultCashGame(
    { ...base, venue_kind: venueKind },
    buildCashGamePresetsFromSessions(scopedSessions, venueKind),
  )
}

function stakeOfferStatusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'pending') return 'Pending'
  if (status === 'settled') return 'Settled'
  if (status === 'declined') return 'Declined'
  if (status === 'revoked') return 'Revoked'
  return status || 'Unknown'
}

function stakeOfferStatusTone(status) {
  if (status === 'active') return 'bg-amber-500/20 text-amber-300'
  if (status === 'pending') return 'bg-amber-500/15 text-amber-200/90'
  if (status === 'declined') return 'bg-zinc-700/60 text-zinc-400'
  return 'bg-rose-500/20 text-rose-300'
}

/**
 * Poker Bankroll Manager — separate from slots Bankroll.
 * Core start fields: type, table size, location, game (+ stake/tourney details).
 */
export default function PokerBankrollTracker({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  /** Deep link: open session details sheet for this id (swap result notify). */
  openSessionId = null,
  onOpenSessionConsumed = null,
  /** Deep link: switch to On Stake for this deal (Stable → Bankroll). */
  openStableDealId = null,
  onOpenStableDealConsumed = null,
  /** Guest stakee first-run onboarding from claim / email confirm. */
  stakeOnboardingDealId = null,
  onStakeOnboardingConsumed = null,
}) {
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  /** All sessions for this user (personal + deal-scoped). */
  const [sessions, setSessions] = useState([])
  /** Active, pending, revoked, and closed-but-unarchived deals — carousel cards. */
  const [stakeeDeals, setStakeeDeals] = useState([])
  /** All stakee deals including settled (attribution + merged history badges). */
  const [stakeeDealsById, setStakeeDealsById] = useState(/** @type {Record<string, object>} */ ({}))
  /** @type {Record<string, object[]>} */
  const [slicesByDeal, setSlicesByDeal] = useState({})
  /** @type {Record<string, object>} */
  const [stableProfilesById, setStableProfilesById] = useState({})
  const [termsDealId, setTermsDealId] = useState(/** @type {string | null} */ (null))
  const [ledgerDealId, setLedgerDealId] = useState(/** @type {string | null} */ (null))
  const [editTermsDealId, setEditTermsDealId] = useState(/** @type {string | null} */ (null))
  const [editTermsIntent, setEditTermsIntent] = useState(
    /** @type {'stakee_update' | 'stakee_counter'} */ ('stakee_update'),
  )
  /** @type {Record<string, { deal_id: string, overall_bankroll: number }>} */
  const [dealProfiles, setDealProfiles] = useState({})
  /** @type {Record<string, object[]>} */
  const [dealTopupsByDeal, setDealTopupsByDeal] = useState({})
  const [dealReductionsByDeal, setDealReductionsByDeal] = useState({})
  /** @type {Record<string, object[]>} */
  const [dealSettlementsByDeal, setDealSettlementsByDeal] = useState({})
  /** @type {Record<string, object[]>} */
  const [dealLedgerByDeal, setDealLedgerByDeal] = useState({})
  /** Unsynced counterparty stake commits (settle review for backer-initiated stakes). */
  const [pendingStakeCommits, setPendingStakeCommits] = useState(/** @type {object[]} */ ([]))
  const [commitSyncId, setCommitSyncId] = useState(/** @type {string | null} */ (null))
  /** @type {'personal' | string} personal or deal id */
  const [bankrollScope, setBankrollScope] = useState('personal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** Brief success copy after + Stake create (pending or active). */
  const [stakeNotice, setStakeNotice] = useState('')
  const [nudgingSliceId, setNudgingSliceId] = useState(/** @type {string | null} */ (null))
  /** @type {null | 'session' | 'sessionDetail' | 'bankroll' | 'start' | 'end' | 'rebuy' | 'import' | 'swaps' | 'createStake'} */
  const [sheet, setSheet] = useState(null)
  /** Read-only session detail before edit. */
  const [detailSessionId, setDetailSessionId] = useState(null)
  const [stableSaving, setStableSaving] = useState(false)
  /** After + Stake, scroll carousel to this deal id once reload completes. */
  const pendingCarouselDealIdRef = useRef(null)
  /** True after first localStorage hero restore for this mount/user (gates persist + carousel sync). */
  const [scopeHydrated, setScopeHydrated] = useState(false)
  /** True after the first authenticated loadData finishes (deals/sessions ready for restore). */
  const [initialBankrollLoadDone, setInitialBankrollLoadDone] = useState(false)
  /** Delay carousel scroll→scope sync until after restore scroll settles. */
  const [scopeCarouselSyncReady, setScopeCarouselSyncReady] = useState(false)
  /** While set, skip writing until React applies this restored scope (avoids clobbering with default personal). */
  const pendingRestoreScopeRef = useRef(/** @type {string | null} */ (null))
  const stakeNoticeTimerRef = useRef(0)
  const [stakeOfferOnboardingOpen, setStakeOfferOnboardingOpen] = useState(false)
  const [carouselCoachOpen, setCarouselCoachOpen] = useState(false)
  const [carouselCoachMode, setCarouselCoachMode] = useState(
    /** @type {'accepted' | 'declined' | 'counter' | null} */ (null),
  )
  const stakeOfferOnboardingOpenedRef = useRef(false)
  const stakeOnboardingCounterPendingRef = useRef(false)
  const [carouselCoachDealId, setCarouselCoachDealId] = useState(/** @type {string | null} */ (null))
  /** @type {object[]} */
  const [draftSwaps, setDraftSwaps] = useState([])
  /**
   * Incoming swap Accept with no matching session yet → Start Session prefill,
   * then bind on submit (counterparty path; not a new creator draft).
   * @type {object | null}
   */
  const [incomingAcceptSwap, setIncomingAcceptSwap] = useState(null)
  /** @type {null | { swap: object, candidates: object[] }} */
  const [incomingBindPicker, setIncomingBindPicker] = useState(null)
  /** @type {object[]} */
  const [tournamentSwaps, setTournamentSwaps] = useState([])
  /** Inline Mark settled on completed session cards. */
  const [sessionCardSwapBusyId, setSessionCardSwapBusyId] = useState(null)
  /** @type {Record<string, object>} */
  const [swapProfilesById, setSwapProfilesById] = useState({})
  /** Soft events for incoming / listed swaps keyed by tournament_event_id. */
  const [swapEventsById, setSwapEventsById] = useState({})
  const [rebuyAmount, setRebuyAmount] = useState('')
  /** @type {'rebuy' | 'addon'} */
  const [rebuyKind, setRebuyKind] = useState('rebuy')
  const [editingId, setEditingId] = useState(null)
  const [editingPrevWl, setEditingPrevWl] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [bankrollInput, setBankrollInput] = useState('')
  const [endCashOut, setEndCashOut] = useState('')
  const [endNotes, setEndNotes] = useState('')
  const [endBounties, setEndBounties] = useState('')
  const [endFinishPlace, setEndFinishPlace] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [typeFilter, setTypeFilter] = useState('all') // all | cash | tournament
  const [venueFilter, setVenueFilter] = useState('all') // all | live | online | club
  const [nearbyCasinos, setNearbyCasinos] = useState([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [customVenues, setCustomVenues] = useState([])
  const casinoCoordCacheRef = useRef(null)
  /** Tracks auto-default currency so geo resolve can overwrite until the user picks. */
  const currencyAutoDefaultRef = useRef('USD')
  /** @type {'overview' | 'details' | 'locations' | 'charts' | 'trend' | 'archive'} */
  const [activeTab, setActiveTab] = useState('overview')
  const [bankrollInfoOpen, setBankrollInfoOpen] = useState(false)
  const [archiveDetailDealId, setArchiveDetailDealId] = useState(/** @type {string | null} */ (null))

  const isOnStake = bankrollScope !== 'personal'
  const activeDeal = useMemo(
    () =>
      isOnStake
        ? stakeeDeals.find((d) => d.id === bankrollScope) ??
          stakeeDealsById[bankrollScope] ??
          null
        : null,
    [isOnStake, stakeeDeals, stakeeDealsById, bankrollScope],
  )
  const stakeScopePending = activeDeal?.status === 'pending'
  const stakeScopeRevoked = activeDeal?.status === 'revoked'
  const stakeScopeClosedUnarchived =
    isOnStake && stakeeBankrollShowsClosedCarouselCard(activeDeal)
  const activeDealSlices = slicesByDeal[bankrollScope] || []
  const stakeScopeLive =
    isOnStake && stakeDealIsLiveForStakee(activeDeal, activeDealSlices)
  const pendingBackerOffer =
    isOnStake &&
    activeDeal?.status === 'pending' &&
    isBackerInitiatedBackingDeal(activeDeal) &&
    !activeDeal?.staker_terms_ack_required &&
    !activeDeal?.stakee_terms_ack_required
  const waitingBackerCounterResponse =
    isOnStake && activeDeal?.status === 'pending' && Boolean(activeDeal?.staker_terms_ack_required)
  /** Pending-play: log on stake after player accepted terms; still block backer-offer until player accepts. */
  const stakeScopeSessionBlocked =
    stakeScopeRevoked ||
    stakeScopeClosedUnarchived ||
    waitingBackerCounterResponse ||
    (isOnStake && activeDeal && !stakeDealPlayerSideAccepted(activeDeal))
  const termsDealForSheet = useMemo(() => {
    if (!termsDealId) return null
    return (
      stakeeDeals.find((d) => d.id === termsDealId) ?? stakeeDealsById[termsDealId] ?? null
    )
  }, [termsDealId, stakeeDeals, stakeeDealsById])
  const ledgerDealForSheet = useMemo(() => {
    if (!ledgerDealId) return null
    return (
      stakeeDeals.find((d) => d.id === ledgerDealId) ?? stakeeDealsById[ledgerDealId] ?? null
    )
  }, [ledgerDealId, stakeeDeals, stakeeDealsById])
  const dealProfile = isOnStake ? dealProfiles[bankrollScope] ?? null : null

  const scopedSessions = useMemo(() => {
    if (!isOnStake) {
      return sessions.filter((s) => isPersonalHistorySession(s, stakeeDealsById))
    }
    return sessions.filter((s) => s.deal_id === bankrollScope)
  }, [sessions, isOnStake, bankrollScope, stakeeDealsById])

  const personalMetricSessions = useMemo(
    () => sessions.filter((s) => isPersonalMetricSession(s, stakeeDealsById, slicesByDeal)),
    [sessions, stakeeDealsById, slicesByDeal],
  )

  const metricSessions = useMemo(
    () => (isOnStake ? scopedSessions : personalMetricSessions),
    [isOnStake, scopedSessions, personalMetricSessions],
  )

  const metricContext = useMemo(
    () => ({
      stakeScope: isOnStake,
      dealsById: stakeeDealsById,
      slicesByDeal,
    }),
    [isOnStake, stakeeDealsById, slicesByDeal],
  )

  const hasAnyStakeDeals = useMemo(
    () => Object.keys(stakeeDealsById).length > 0,
    [stakeeDealsById],
  )

  const archivedStakeeDeals = useMemo(() => {
    return Object.values(stakeeDealsById)
      .filter(
        (d) =>
          d.stakee_user_id === userId &&
          d.stakee_bankroll_archived_at &&
          (d.status === 'settled' ||
            d.status === 'closed' ||
            d.status === 'declined' ||
            d.status === 'revoked'),
      )
      .sort(
        (a, b) =>
          new Date(b.stakee_bankroll_archived_at || b.settled_at || b.updated_at || b.created_at).getTime() -
          new Date(a.stakee_bankroll_archived_at || a.settled_at || a.updated_at || a.created_at).getTime(),
      )
  }, [stakeeDealsById, userId])

  /** Missing profile rows count as starting roll + logged session P/L until accept bootstraps the profile. */
  const stakeScopeSessionProfit = useMemo(() => {
    if (!isOnStake || dealProfile != null) return 0
    let profit = 0
    for (const s of scopedSessions) {
      if (s.status !== 'completed') continue
      const base = pokerSessionWinLoss(s)
      if (base == null) continue
      profit += base
    }
    return profit
  }, [isOnStake, dealProfile, scopedSessions])

  const activePendingSettleCommit = useMemo(
    () =>
      isOnStake && activeDeal
        ? stakeePendingSettleCommitForDeal(pendingStakeCommits, activeDeal.id)
        : null,
    [isOnStake, activeDeal, pendingStakeCommits],
  )

  const overallBankroll = isOnStake
    ? stakeeDisplayDealRoll({
        deal: activeDeal,
        userId,
        dealProfile: dealProfile ?? null,
        pendingSettleCommit: activePendingSettleCommit,
        settlements: dealSettlementsByDeal[activeDeal?.id] || [],
        startingRollFallback:
          (Number(activeDeal?.starting_roll ?? activeDeal?.baseline_bankroll) || 0) +
          (dealProfile == null && !activePendingSettleCommit ? stakeScopeSessionProfit : 0),
      })
    : profile != null
      ? Number(profile.overall_bankroll) || 0
      : 0
  const hasBankrollProfile = isOnStake ? dealProfile != null : profile != null

  const activeSession = useMemo(
    () => scopedSessions.find((s) => s.status === 'active') ?? null,
    [scopedSessions],
  )
  /** Editing the live in-progress session (not a completed log). */
  const editingActiveSession = Boolean(editingId && activeSession?.id === editingId)
  const completedSessions = useMemo(
    () => scopedSessions.filter((s) => s.status !== 'active'),
    [scopedSessions],
  )
  const activeSessionSwaps = useMemo(
    () =>
      tournamentSwaps.filter(
        (s) =>
          s.status !== 'cancelled' &&
          (s.creator_session_id === activeSession?.id ||
            s.counterparty_session_id === activeSession?.id),
      ),
    [tournamentSwaps, activeSession?.id],
  )
  const editingSessionSwaps = useMemo(
    () =>
      editingId
        ? tournamentSwaps.filter(
            (s) =>
              s.status !== 'cancelled' &&
              (s.creator_session_id === editingId || s.counterparty_session_id === editingId),
          )
        : [],
    [tournamentSwaps, editingId],
  )
  /** Max % of net the player can swap after stable backing sold action. */
  const swapSelfOwnedPct = useMemo(
    () => playerSelfOwnedActionPct(stakeeDeals, slicesByDeal),
    [stakeeDeals, slicesByDeal],
  )
  /** Session id → non-cancelled swaps linked as creator or counterparty. */
  const swapsBySessionId = useMemo(() => {
    /** @type {Record<string, object[]>} */
    const map = {}
    for (const swap of tournamentSwaps) {
      if (!swap || swap.status === 'cancelled') continue
      for (const sid of [swap.creator_session_id, swap.counterparty_session_id]) {
        if (!sid) continue
        if (!map[sid]) map[sid] = []
        if (!map[sid].some((s) => s.id === swap.id)) map[sid].push(swap)
      }
    }
    return map
  }, [tournamentSwaps])
  const detailSession = useMemo(
    () => (detailSessionId ? sessions.find((s) => s.id === detailSessionId) ?? null : null),
    [sessions, detailSessionId],
  )
  const detailSessionSwaps = useMemo(
    () => (detailSession ? swapsBySessionId[detailSession.id] || [] : []),
    [detailSession, swapsBySessionId],
  )
  const detailStakeLabel = useMemo(() => {
    if (!detailSession?.deal_id) return ''
    const deal = stakeeDealsById[detailSession.deal_id]
    return String(deal?.label || '').trim() || 'Stake'
  }, [detailSession, stakeeDealsById])
  const detailDeal = useMemo(() => {
    if (!detailSession?.deal_id) return null
    return stakeeDealsById[detailSession.deal_id] ?? null
  }, [detailSession, stakeeDealsById])
  const detailSlices = useMemo(() => {
    if (!detailSession?.deal_id) return []
    return slicesByDeal[detailSession.deal_id] || []
  }, [detailSession, slicesByDeal])
  const pendingCounterpartySwaps = useMemo(
    () =>
      tournamentSwaps.filter(
        (s) =>
          s.counterparty_user_id === userId &&
          s.status === 'active' &&
          !s.counterparty_session_accepted_at,
      ),
    [tournamentSwaps, userId],
  )
  /** Game dropdown: user-added for this Where first, then venue defaults. */
  const cashGamePresets = useMemo(
    () => buildCashGamePresetsFromSessions(scopedSessions, form.venue_kind),
    [scopedSessions, form.venue_kind],
  )

  useEffect(() => {
    setScopeHydrated(false)
    setScopeCarouselSyncReady(false)
    setInitialBankrollLoadDone(false)
    pendingRestoreScopeRef.current = null
    setBankrollScope('personal')
  }, [userId])

  useEffect(() => {
    if (!scopeHydrated) return
    if (bankrollScope === 'personal') return
    if (!initialBankrollLoadDone) return
    const onCarousel = stakeeDeals.some((d) => d.id === bankrollScope)
    const knownDeal = Boolean(stakeeDealsById[bankrollScope])
    // Only drop to personal when the deal is truly gone (not a transient empty carousel).
    if (!onCarousel && !knownDeal) {
      setBankrollScope('personal')
    }
  }, [bankrollScope, stakeeDeals, stakeeDealsById, scopeHydrated, initialBankrollLoadDone])

  useEffect(() => {
    // Wait for authenticated loadData ... !loading alone is true too early when userId is still null.
    if (scopeHydrated || !userId || !initialBankrollLoadDone) return
    if (openStableDealId) {
      if (!stakeeDeals.some((d) => d.id === openStableDealId)) return
      pendingRestoreScopeRef.current = openStableDealId
      setBankrollScope(openStableDealId)
      setScopeHydrated(true)
      return
    }
    const pendingCarouselId = pendingCarouselDealIdRef.current
    if (pendingCarouselId) {
      if (!stakeeDeals.some((d) => d.id === pendingCarouselId)) return
      pendingRestoreScopeRef.current = pendingCarouselId
      setBankrollScope(pendingCarouselId)
      pendingCarouselDealIdRef.current = null
      setScopeHydrated(true)
      return
    }
    const next = resolvePokerBankrollScopeToRestore(userId, stakeeDeals, sessions)
    if (next !== bankrollScope) {
      pendingRestoreScopeRef.current = next
      setBankrollScope(next)
    } else {
      pendingRestoreScopeRef.current = null
    }
    setScopeHydrated(true)
  }, [
    userId,
    initialBankrollLoadDone,
    stakeeDeals,
    sessions,
    openStableDealId,
    scopeHydrated,
    bankrollScope,
  ])

  useEffect(() => {
    if (!userId || !scopeHydrated) return
    if (pendingRestoreScopeRef.current) {
      if (bankrollScope !== pendingRestoreScopeRef.current) return
      pendingRestoreScopeRef.current = null
    }
    writeStoredPokerBankrollScope(userId, bankrollScope)
  }, [userId, bankrollScope, scopeHydrated])

  /** Flush last card on unmount so leaving the tool cannot lose an in-memory selection. */
  useEffect(() => {
    return () => {
      if (!userId || !scopeHydrated) return
      const scope =
        pendingRestoreScopeRef.current && pendingRestoreScopeRef.current !== bankrollScope
          ? pendingRestoreScopeRef.current
          : bankrollScope
      writeStoredPokerBankrollScope(userId, scope)
    }
  }, [userId, scopeHydrated, bankrollScope])

  useEffect(() => {
    if (!scopeHydrated) {
      setScopeCarouselSyncReady(false)
      return undefined
    }
    const t = window.setTimeout(() => setScopeCarouselSyncReady(true), 300)
    return () => window.clearTimeout(t)
  }, [scopeHydrated, bankrollScope])

  useEffect(() => {
    if (!openStableDealId) return
    const deal = stakeeDeals.find(
      (d) =>
        d.id === openStableDealId && (d.status === 'active' || d.status === 'pending'),
    )
    if (!deal) return
    pendingRestoreScopeRef.current = openStableDealId
    setScopeHydrated(true)
    setBankrollScope(openStableDealId)
    if (
      deal.status === 'pending' &&
      isBackerInitiatedBackingDeal(deal) &&
      !deal.staker_terms_ack_required &&
      !deal.stakee_terms_ack_required
    ) {
      stashPokerStakeOnboardingDeal(openStableDealId)
      setStakeOfferOnboardingOpen(true)
      stakeOfferOnboardingOpenedRef.current = true
    }
    onOpenStableDealConsumed?.()
  }, [openStableDealId, stakeeDeals, onOpenStableDealConsumed])

  const activeStakeOnboardingDealId = stakeOnboardingDealId || readPokerStakeOnboardingDeal()
  const onboardingDeal = useMemo(() => {
    if (!activeStakeOnboardingDealId) return null
    return (
      stakeeDeals.find((d) => d.id === activeStakeOnboardingDealId) ??
      stakeeDealsById[activeStakeOnboardingDealId] ??
      null
    )
  }, [activeStakeOnboardingDealId, stakeeDeals, stakeeDealsById])
  useEffect(() => {
    if (!scopeHydrated || loading || !userId || openStableDealId || activeStakeOnboardingDealId) {
      return
    }
    // Respect last-selected card; only auto-jump when nothing was remembered.
    if (readStoredPokerBankrollScope(userId) !== 'personal') return
    const pendingOffer = stakeeDeals.find(
      (d) =>
        d.status === 'pending' &&
        isBackerInitiatedBackingDeal(d) &&
        !d.staker_terms_ack_required &&
        !d.stakee_terms_ack_required,
    )
    if (pendingOffer && bankrollScope === 'personal') {
      setBankrollScope(pendingOffer.id)
    }
  }, [
    scopeHydrated,
    loading,
    userId,
    stakeeDeals,
    openStableDealId,
    bankrollScope,
    activeStakeOnboardingDealId,
  ])

  useEffect(() => {
    if (loading || !userId || !activeStakeOnboardingDealId || stakeOfferOnboardingOpenedRef.current) {
      return
    }
    const deal =
      stakeeDeals.find((d) => d.id === activeStakeOnboardingDealId) ??
      stakeeDealsById[activeStakeOnboardingDealId]
    if (!deal || deal.status !== 'pending' || !isBackerInitiatedBackingDeal(deal)) return
    if (deal.staker_terms_ack_required || deal.stakee_terms_ack_required) return
    stakeOfferOnboardingOpenedRef.current = true
    pendingRestoreScopeRef.current = activeStakeOnboardingDealId
    setScopeHydrated(true)
    setBankrollScope(activeStakeOnboardingDealId)
    setStakeOfferOnboardingOpen(true)
  }, [loading, userId, activeStakeOnboardingDealId, stakeeDeals, stakeeDealsById])

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

  const loadData = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent)
    if (!supabaseClient || !userId) {
      setSessions([])
      setProfile(null)
      setStakeeDeals([])
      setStakeeDealsById({})
      setDealProfiles({})
      setCustomVenues([])
      setInitialBankrollLoadDone(false)
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError('')
    let markRestoreReady = true
    try {
      if (!silent) {
        const linked = await tryAutoLinkGuestStakeeOffers(supabaseClient)
        if (linked) {
          // Link path returns before deals load; another loadData will follow. Do not
          // hydrate/restore against an empty carousel (that rewrote stake → personal).
          markRestoreReady = false
          return
        }
      }

      const [sessRes, profRes, customRes, dealsRes] = await Promise.all([
        supabaseClient
          .from('poker_bankroll_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('start_at', { ascending: false })
          .limit(500),
        supabaseClient
          .from('poker_bankroll_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        supabaseClient
          .from('poker_custom_venues')
          .select('id, name')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        loadMyStableDeals(supabaseClient, userId),
      ])
      if (sessRes.error) throw sessRes.error
      if (profRes.error) throw profRes.error
      setSessions(sessRes.data || [])
      setProfile(profRes.data || null)
      if (customRes.error) {
        console.warn('[poker-bankroll] custom venues load failed', customRes.error.message)
        setCustomVenues([])
      } else {
        setCustomVenues(customRes.data || [])
      }

      if (dealsRes.error) {
        if (!isMissingStableTableError(dealsRes.error)) {
          console.warn('[poker-bankroll] stable deals load failed', dealsRes.error.message)
        }
        setStakeeDeals([])
        setStakeeDealsById({})
        setDealProfiles({})
        setSlicesByDeal({})
        setStableProfilesById({})
        setDealTopupsByDeal({})
        setDealSettlementsByDeal({})
        setDealLedgerByDeal({})
        setPendingStakeCommits([])
      } else {
        const mine = (dealsRes.deals || []).filter((d) => d.stakee_user_id === userId)
        const carouselDeals = mine.filter((d) => {
          if (d.status === 'active' || d.status === 'pending' || d.status === 'revoked') return true
          if (
            (d.status === 'settled' || d.status === 'closed' || d.status === 'declined') &&
            !d.stakee_bankroll_archived_at
          ) {
            return true
          }
          return false
        })
        setStakeeDeals(carouselDeals)
        /** @type {Record<string, object>} */
        const dealsById = {}
        for (const d of mine) dealsById[d.id] = d
        setStakeeDealsById(dealsById)
        const dealIds = mine.map((d) => d.id)
        if (dealIds.length) {
          const { byDeal: sliceMap, error: sliceErr } = await loadDealSlices(
            supabaseClient,
            dealIds,
          )
          if (sliceErr && !isMissingStableTableError(sliceErr)) {
            console.warn('[poker-bankroll] deal slices load failed', sliceErr.message)
          }
          setSlicesByDeal(sliceMap || {})
          const { byId, error: profErr } = await loadDealCounterpartyProfiles(
            supabaseClient,
            mine,
            userId,
            sliceMap || {},
          )
          if (profErr && !isMissingStableTableError(profErr)) {
            console.warn('[poker-bankroll] stable profiles load failed', profErr.message)
          }
          setStableProfilesById(byId)
        } else {
          setSlicesByDeal({})
          setStableProfilesById({})
          setDealTopupsByDeal({})
          setDealSettlementsByDeal({})
          setDealLedgerByDeal({})
        }
        const { byDeal, error: rollErr } = await loadDealBankrollProfiles(
          supabaseClient,
          carouselDeals
            .filter((d) => d.status === 'active' || d.status === 'pending')
            .map((d) => d.id),
        )
        if (rollErr && !isMissingStableTableError(rollErr)) {
          console.warn('[poker-bankroll] deal rolls load failed', rollErr.message)
        }
        setDealProfiles(byDeal)

        const topupsByDeal = {}
        const reductionsByDeal = {}
        const settlementsByDeal = {}
        const ledgerByDeal = {}
        await Promise.all(
          dealIds.map(async (dealId) => {
            const [
              { topups, error: topErr },
              { reductions, error: redErr },
              { settlements, error: stErr },
              { entries, error: ledErr },
            ] = await Promise.all([
              loadDealTopups(supabaseClient, dealId),
              loadDealReductions(supabaseClient, dealId),
              loadDealSettlements(supabaseClient, dealId),
              loadLedgerEntries(supabaseClient, dealId),
            ])
            if (topErr && !isMissingStableTableError(topErr)) {
              console.warn('[poker-bankroll] deal topups load failed', topErr.message)
            }
            if (redErr && !isMissingStableTableError(redErr)) {
              console.warn('[poker-bankroll] deal reductions load failed', redErr.message)
            }
            if (stErr && !isMissingStableTableError(stErr)) {
              console.warn('[poker-bankroll] deal settlements load failed', stErr.message)
            }
            if (ledErr && !isMissingStableTableError(ledErr)) {
              console.warn('[poker-bankroll] deal ledger load failed', ledErr.message)
            }
            topupsByDeal[dealId] = topups || []
            reductionsByDeal[dealId] = reductions || []
            settlementsByDeal[dealId] = settlements || []
            ledgerByDeal[dealId] = entries || []
          }),
        )
        setDealTopupsByDeal(topupsByDeal)
        setDealReductionsByDeal(reductionsByDeal)
        setDealSettlementsByDeal(settlementsByDeal)
        setDealLedgerByDeal(ledgerByDeal)

        const { commits: pendingCommits, error: pcErr } = await loadPendingCommits(supabaseClient)
        if (pcErr && !isMissingStableTableError(pcErr)) {
          console.warn('[poker-bankroll] pending commits load failed', pcErr.message)
        }
        setPendingStakeCommits(
          (pendingCommits || []).filter((row) => {
            const deal = dealsById[row.deal_id]
            return deal && !stakeeSkipsBackerCommitSync(deal, userId, row)
          }),
        )
      }

      const swapsRes = await loadMyTournamentSwaps(supabaseClient, userId)
      if (swapsRes.error) {
        if (!isMissingTournamentSwapTableError(swapsRes.error)) {
          console.warn('[poker-bankroll] swaps load failed', swapsRes.error.message)
        }
        setTournamentSwaps([])
        setSwapProfilesById({})
        setSwapEventsById({})
      } else {
        setTournamentSwaps(swapsRes.swaps || [])
        const ids = []
        const eventIds = []
        for (const s of swapsRes.swaps || []) {
          if (s.creator_user_id) ids.push(s.creator_user_id)
          if (s.counterparty_user_id) ids.push(s.counterparty_user_id)
          if (s.tournament_event_id) eventIds.push(s.tournament_event_id)
        }
        const { byId, error: pErr } = await loadSwapCounterpartyProfiles(supabaseClient, ids)
        if (pErr) console.warn('[poker-bankroll] swap profiles failed', pErr.message)
        setSwapProfilesById(byId)

        const uniqueEventIds = [...new Set(eventIds)]
        if (uniqueEventIds.length === 0) {
          setSwapEventsById({})
        } else {
          const { data: evRows, error: evErr } = await supabaseClient
            .from('poker_tournament_events')
            .select('id, fingerprint_key, display_name, venue_name, event_date, buy_in, game_variant, currency')
            .in('id', uniqueEventIds)
          if (evErr) {
            console.warn('[poker-bankroll] swap events failed', evErr.message)
            setSwapEventsById({})
          } else {
            const byEv = {}
            for (const ev of evRows || []) {
              if (ev?.id) byEv[ev.id] = ev
            }
            setSwapEventsById(byEv)
          }
        }
      }
    } catch (e) {
      setError(e?.message || 'Could not load poker bankroll.')
      setSessions([])
    } finally {
      if (markRestoreReady) setInitialBankrollLoadDone(true)
      if (!silent) setLoading(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const onReload = () => {
      void loadData({ silent: true })
    }
    window.addEventListener('lounge-push-opened', onReload)
    return () => window.removeEventListener('lounge-push-opened', onReload)
  }, [loadData])

  /** Reload stake carousel when tab/window refocuses (backer accept while app backgrounded). */
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined
    const refresh = () => void loadData({ silent: true })
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [loadData])

  /** While any open stake card is pending or active, poll for backer accept/revoke without leaving Bankroll. */
  const hasLiveStakeCarousel = stakeeDeals.some(
    (d) => d.status === 'pending' || d.status === 'active',
  )
  useEffect(() => {
    if (!supabaseClient || !userId || !hasLiveStakeCarousel) return undefined
    const id = window.setInterval(() => {
      void loadData({ silent: true })
    }, 8000)
    return () => window.clearInterval(id)
  }, [supabaseClient, userId, hasLiveStakeCarousel, loadData])

  /** Live stake status changes when a backer accepts or revokes (Realtime). */
  useEffect(() => {
    if (!supabaseClient || !userId) return undefined
    const refresh = () => void loadData({ silent: true })
    const channel = supabaseClient
      .channel(`poker-stable-deals-stakee-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'poker_stable_deals',
          filter: `stakee_user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe()
    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [supabaseClient, userId, loadData])

  /** Keep swap cards in sync when the other party marks cash settled. */
  useEffect(() => {
    if (!supabaseClient || !userId) return undefined
    const channel = supabaseClient
      .channel(`poker-tournament-swaps-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poker_tournament_swaps' },
        (payload) => {
          const row = payload.new || payload.old
          if (!row?.id) return
          if (
            row.creator_user_id !== userId &&
            row.counterparty_user_id !== userId
          ) {
            return
          }
          setTournamentSwaps((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((s) => s.id !== row.id)
            }
            const nextRow = payload.new
            if (!nextRow) return prev
            const idx = prev.findIndex((s) => s.id === nextRow.id)
            if (idx < 0) return [nextRow, ...prev]
            const copy = prev.slice()
            copy[idx] = { ...copy[idx], ...nextRow }
            return copy
          })
        },
      )
      .subscribe()
    return () => {
      void supabaseClient.removeChannel(channel)
    }
  }, [supabaseClient, userId])

  /** Swap-result notify deep link: open the viewer's linked session sheet. */
  useEffect(() => {
    if (!openSessionId || loading) return
    const session = sessions.find((s) => String(s.id) === String(openSessionId))
    if (!session) {
      onOpenSessionConsumed?.()
      return
    }
    openSessionDetail(session)
    onOpenSessionConsumed?.()
    // openSessionDetail is a stable-enough local opener; intentionally omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link one-shot
  }, [openSessionId, loading, sessions, onOpenSessionConsumed])

  const fetchNearby = useCallback(async (onNearest) => {
    await fetchNearbyCasinos(supabaseClient, {
      cacheRef: casinoCoordCacheRef,
      userId,
      onLoading: setGpsLoading,
      onNearby: setNearbyCasinos,
      onNearest,
    })
  }, [supabaseClient, userId])

  /** Auto-fill nearest live room from GPS and align currency with casino country. */
  function patchLiveVenueFromGps(prevForm, venueName) {
    if (prevForm.venue_kind !== 'live' || String(prevForm.venue_name || '').trim()) {
      return prevForm
    }
    const casinos = casinoCoordCacheRef.current || nearbyCasinos
    const venueCurrency = currencyFromNearbyCasinoName(venueName, casinos)
    return {
      ...prevForm,
      venue_name: venueName,
      ...(venueCurrency ? { currency: normalizePokerCurrency(venueCurrency) } : {}),
    }
  }

  async function saveCustomVenue(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed || !supabaseClient || !userId) return
    const { data, error: err } = await supabaseClient
      .from('poker_custom_venues')
      .upsert(
        { user_id: userId, name: trimmed },
        { onConflict: 'user_id,name' },
      )
      .select('id, name')
      .single()
    if (err) throw err
    setCustomVenues((prev) => {
      const next = prev.filter((v) => v.id !== data.id && v.name.toLowerCase() !== trimmed.toLowerCase())
      return [data, ...next]
    })
    setForm((f) => ({ ...f, venue_name: data.name }))
  }

  async function upsertBankroll(nextAmount) {
    if (isOnStake) {
      if (!bankrollScope || bankrollScope === 'personal') {
        throw new Error('Pick a stake deal first.')
      }
      const { data, error: err } = await supabaseClient
        .from('poker_deal_bankroll_profiles')
        .upsert(
          { deal_id: bankrollScope, overall_bankroll: nextAmount },
          { onConflict: 'deal_id' },
        )
        .select()
        .single()
      if (err) throw err
      setDealProfiles((prev) => ({ ...prev, [bankrollScope]: data }))
      return data
    }
    const { data, error: err } = await supabaseClient
      .from('poker_bankroll_profiles')
      .upsert({ user_id: userId, overall_bankroll: nextAmount }, { onConflict: 'user_id' })
      .select()
      .single()
    if (err) throw err
    setProfile(data)
    return data
  }

  async function applyBankrollDelta(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) return
    if (isOnStake && stakeScopeSessionBlocked) return
    const current = isOnStake
      ? dealProfile
        ? Number(dealProfile.overall_bankroll)
        : 0
      : profile
        ? Number(profile.overall_bankroll)
        : 0
    await upsertBankroll(current + delta)
  }

  function scopeDealIdForWrite() {
    return isOnStake ? bankrollScope : null
  }

  useEffect(() => {
    if (!activeSession) {
      setElapsed(0)
      return undefined
    }
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(activeSession.start_at).getTime()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [activeSession])

  const metricCompleted = useMemo(
    () => metricSessions.filter((s) => s.status !== 'active'),
    [metricSessions],
  )

  const filtered = useMemo(() => {
    return completedSessions.filter((s) => {
      if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
      if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
      return true
    })
  }, [completedSessions, typeFilter, venueFilter])

  const metricFiltered = useMemo(() => {
    return metricCompleted.filter((s) => {
      if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
      if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
      return true
    })
  }, [metricCompleted, typeFilter, venueFilter])

  const stakeHistoryEvents = useMemo(() => {
    if (!isOnStake || !activeDeal) return []
    return buildStakeDealHistoryEvents({
      deal: activeDeal,
      slices: slicesByDeal[bankrollScope] || [],
      profilesById: stableProfilesById,
      topups: dealTopupsByDeal[bankrollScope] || [],
      reductions: dealReductionsByDeal[bankrollScope] || [],
      settlements: dealSettlementsByDeal[bankrollScope] || [],
      ledgerEntries: dealLedgerByDeal[bankrollScope] || [],
      viewerUserId: userId,
    })
  }, [
    isOnStake,
    activeDeal,
    bankrollScope,
    slicesByDeal,
    stableProfilesById,
    dealTopupsByDeal,
    dealReductionsByDeal,
    dealSettlementsByDeal,
    dealLedgerByDeal,
    userId,
  ])

  const personalSettlementEvents = useMemo(() => {
    if (isOnStake) return []
    return buildPersonalSettlementHistoryEvents({
      dealsById: stakeeDealsById,
      settlementsByDeal: dealSettlementsByDeal,
      slicesByDeal,
    })
  }, [isOnStake, stakeeDealsById, dealSettlementsByDeal, slicesByDeal])

  const historyFeed = useMemo(() => {
    const sessionItems = filtered.map((session) => ({
      kind: 'session',
      id: session.id,
      at: session.end_at || session.start_at,
      session,
    }))
    const historyEvents = isOnStake ? stakeHistoryEvents : personalSettlementEvents
    if (!historyEvents.length) {
      return sessionItems.sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      )
    }
    const eventItems = historyEvents.map((event) => ({
      kind: 'event',
      id: event.id,
      at: event.at,
      event,
    }))
    return [...sessionItems, ...eventItems].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
  }, [filtered, isOnStake, stakeHistoryEvents, personalSettlementEvents])

  /** Bankroll-card stats follow All/Cash/Tourney + Any/Live/Online filters. */
  const stats = useMemo(() => {
    let profit = 0
    let hours = 0
    let wins = 0
    let counted = 0
    for (const s of metricFiltered) {
      const wl = resolveSessionMetricWinLoss(s, tournamentSwaps, userId, metricContext)
      if (wl == null) continue
      counted += 1
      profit += wl
      hours += pokerSessionDurationHours(s)
      if (wl > 0) wins += 1
    }
    return {
      profit,
      hours,
      hourly: hours >= 0.02 ? profit / hours : null,
      winRate: counted > 0 ? Math.round((wins / counted) * 100) : null,
      count: counted,
    }
  }, [metricFiltered, metricContext, tournamentSwaps, userId])

  /** Running bankroll after each filtered session (inferred start = current − filtered profit). */
  const bankrollSparkSeries = useMemo(() => {
    const ordered = [...metricFiltered]
      .map((s) => ({
        at: s.end_at || s.start_at || null,
        wl: resolveSessionMetricWinLoss(s, tournamentSwaps, userId, metricContext),
      }))
      .filter((x) => x.wl != null && x.at)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    if (ordered.length === 0) return []
    if (isOnStake && overallBankroll != null) {
      let run = Number(overallBankroll) - ordered.reduce((sum, x) => sum + x.wl, 0)
      const points = [run]
      for (const x of ordered) {
        run += x.wl
        points.push(run)
      }
      return points
    }
    let run = 0
    const points = [run]
    for (const x of ordered) {
      run += x.wl
      points.push(run)
    }
    return points
  }, [metricFiltered, isOnStake, overallBankroll, metricContext, tournamentSwaps, userId])

  const bankrollSlides = useMemo(() => {
    const slides = [{ id: 'personal', deal: null }]
    for (const d of stakeeDeals) slides.push({ id: d.id, deal: d })
    return slides
  }, [stakeeDeals])

  const heroByScope = useMemo(() => {
    /** @param {'personal' | string} scopeId */
    function buildScopeHero(scopeId) {
      const onStake = scopeId !== 'personal'
      const scopeSessions = onStake
        ? sessions.filter((s) => s.deal_id === scopeId)
        : sessions.filter((s) => isPersonalMetricSession(s, stakeeDealsById, slicesByDeal))
      const scopeCompleted = scopeSessions.filter((s) => s.status !== 'active')
      const scopeFiltered = scopeCompleted.filter((s) => {
        if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
        if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
        return true
      })
      const scopeMetricContext = {
        stakeScope: onStake,
        dealsById: stakeeDealsById,
        slicesByDeal,
      }
      let profit = 0
      let hours = 0
      let wins = 0
      let counted = 0
      for (const s of scopeFiltered) {
        const wl = resolveSessionMetricWinLoss(s, tournamentSwaps, userId, scopeMetricContext)
        if (wl == null) continue
        counted += 1
        profit += wl
        hours += pokerSessionDurationHours(s)
        if (wl > 0) wins += 1
      }
      const scopeStats = {
        profit,
        hours,
        hourly: hours >= 0.02 ? profit / hours : null,
        winRate: counted > 0 ? Math.round((wins / counted) * 100) : null,
        count: counted,
      }
      const scopeDeal = onStake ? stakeeDeals.find((d) => d.id === scopeId) ?? null : null
      const pendingSettle = stakeePendingSettleCommitForDeal(pendingStakeCommits, scopeId)
      let scopeRoll = onStake
        ? stakeeDisplayDealRoll({
            deal: scopeDeal,
            userId,
            dealProfile: dealProfiles[scopeId] ?? null,
            pendingSettleCommit: pendingSettle,
            settlements: dealSettlementsByDeal[scopeId] || [],
            startingRollFallback: Number(scopeDeal?.starting_roll ?? scopeDeal?.baseline_bankroll) || 0,
          })
        : profile != null
          ? Number(profile.overall_bankroll) || 0
          : 0
      if (onStake && dealProfiles[scopeId] == null && !pendingSettle) {
        scopeRoll += scopeStats.profit
      }
      const ordered = [...scopeFiltered]
        .map((s) => ({
          at: s.end_at || s.start_at || null,
          wl: resolveSessionMetricWinLoss(s, tournamentSwaps, userId, scopeMetricContext),
        }))
        .filter((x) => x.wl != null && x.at)
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      let spark = []
      if (ordered.length > 0) {
        if (onStake && scopeRoll != null) {
          let run = Number(scopeRoll) - ordered.reduce((sum, x) => sum + x.wl, 0)
          const points = [run]
          for (const x of ordered) {
            run += x.wl
            points.push(run)
          }
          spark = points
        } else {
          let run = 0
          const points = [run]
          for (const x of ordered) {
            run += x.wl
            points.push(run)
          }
          spark = points
        }
      }
      return {
        stats: scopeStats,
        spark,
        overallBankroll: scopeRoll,
        deal: scopeDeal,
        pendingSettleCommit: pendingSettle,
      }
    }
    /** @type {Record<string, ReturnType<typeof buildScopeHero>>} */
    const map = { personal: buildScopeHero('personal') }
    for (const d of stakeeDeals) map[d.id] = buildScopeHero(d.id)
    return map
  }, [
    sessions,
    stakeeDeals,
    stakeeDealsById,
    dealProfiles,
    dealSettlementsByDeal,
    pendingStakeCommits,
    profile,
    typeFilter,
    venueFilter,
    tournamentSwaps,
    userId,
  ])

  function selectBankrollScope(scopeId) {
    const next = scopeId === 'personal' ? 'personal' : String(scopeId || '').trim()
    if (!next) return
    if (next !== bankrollScope) {
      pendingRestoreScopeRef.current = next
      setBankrollScope(next)
    } else {
      pendingRestoreScopeRef.current = null
    }
    if (userId && scopeHydrated) writeStoredPokerBankrollScope(userId, next)
  }

  /** After + Stake create while already mounted, jump carousel once the deal lands. */
  useEffect(() => {
    const pendingId = pendingCarouselDealIdRef.current
    if (!pendingId || !scopeHydrated) return
    if (!stakeeDeals.some((d) => d.id === pendingId)) return
    pendingCarouselDealIdRef.current = null
    selectBankrollScope(pendingId)
    // selectBankrollScope closes over bankrollScope/userId; stakeeDeals is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: apply pending id once when deals update
  }, [stakeeDeals, scopeHydrated])

  function showStakeNotice(message) {
    setStakeNotice(message)
    if (stakeNoticeTimerRef.current) window.clearTimeout(stakeNoticeTimerRef.current)
    stakeNoticeTimerRef.current = window.setTimeout(() => {
      stakeNoticeTimerRef.current = 0
      setStakeNotice('')
    }, 6500)
  }

  async function onNudgePendingBacker(dealId, sliceId) {
    if (!supabaseClient || !dealId || !sliceId || nudgingSliceId) return
    setError('')
    setNudgingSliceId(sliceId)
    try {
      const { error: nudgeErr } = await nudgeBackerSliceAcceptance(supabaseClient, dealId, sliceId)
      if (nudgeErr) throw nudgeErr
      triggerTapHapticLight()
      showStakeNotice('Reminder sent.')
    } catch (e) {
      setError(e?.message || 'Could not send reminder.')
    } finally {
      setNudgingSliceId(null)
    }
  }

  function openStakeOfferReview(dealId) {
    const id = String(dealId || '').trim()
    if (!id) return
    selectBankrollScope(id)
    setScopeHydrated(true)
    stashPokerStakeOnboardingDeal(id)
    setStakeOfferOnboardingOpen(true)
    stakeOfferOnboardingOpenedRef.current = true
    triggerTapHapticLight()
  }

  async function onAcceptBackerOffer(dealId) {
    if (!supabaseClient || !dealId) return
    setStableSaving(true)
    setError('')
    try {
      const { error } = await stakeeAcceptBackerOffer(supabaseClient, dealId)
      if (error) throw error
      showStakeNotice('Stake accepted ... your backing bankroll is live.')
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not accept stake.')
    } finally {
      setStableSaving(false)
    }
  }

  async function onDeclineBackerOffer(dealId) {
    if (!supabaseClient || !dealId) return
    const deal = stakeeDealsById[dealId]
    const label = deal?.label?.trim() || 'this stake'
    if (!window.confirm(`Decline ${label}? This kills the stake for everyone.`)) return
    setStableSaving(true)
    setError('')
    try {
      const { error } = await stakeeDeclineBackerOffer(supabaseClient, dealId)
      if (error) throw error
      if (bankrollScope === dealId) setBankrollScope('personal')
      showStakeNotice('Stake declined.')
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not decline stake.')
    } finally {
      setStableSaving(false)
    }
  }

  async function runPeriodicSettle(dealId, rakebackTotal, stakeReductionTotal = 0) {
    setStableSaving(true)
    setError('')
    try {
      const { error, immediate } = await periodicSettleBackingDeal(supabaseClient, {
        dealId,
        rakebackTotal,
        stakeReductionTotal,
      })
      if (error) throw error
      showStakeNotice(
        immediate
          ? stakeReductionTotal > 0
            ? 'Periodic settle complete ... roll reset and stake reduced.'
            : 'Periodic settle complete ... roll reset to baseline.'
          : 'Settlement proposed ... waiting for backer confirmation.',
      )
      if (immediate) {
        flushSync(() => {
          setTermsDealId(null)
          setLedgerDealId(null)
        })
      }
      await loadData()
    } catch (e) {
      setError(e?.message || 'Settle failed.')
    } finally {
      setStableSaving(false)
    }
  }

  async function runCloseStake(dealId, rakebackTotal) {
    setStableSaving(true)
    setError('')
    try {
      const { error, immediate } = await closeBackingDeal(supabaseClient, {
        dealId,
        rakebackTotal,
      })
      if (error) throw error
      showStakeNotice(
        immediate
          ? 'Stake closed ... sessions are on your personal timeline now.'
          : 'Close settlement proposed ... waiting for confirmation.',
      )
      if (immediate) {
        flushSync(() => {
          setTermsDealId(null)
          setLedgerDealId(null)
          if (bankrollScope === dealId) setBankrollScope('personal')
        })
      }
      await loadData()
    } catch (e) {
      setError(e?.message || 'Close failed.')
    } finally {
      setStableSaving(false)
    }
  }

  function finishStakeOnboardingFlow(mode, dealId) {
    setCarouselCoachDealId(dealId || null)
    clearPokerStakeOnboardingDeal()
    onStakeOnboardingConsumed?.()
    if (userId && readPokerStakeCarouselCoachAck(userId)) {
      if (mode === 'accepted' && dealId) setBankrollScope(dealId)
      setCarouselCoachDealId(null)
      return
    }
    setCarouselCoachMode(mode)
    setCarouselCoachOpen(true)
  }

  function dismissStakeCarouselCoach() {
    if (userId) writePokerStakeCarouselCoachAck(userId)
    const mode = carouselCoachMode
    const dealId = carouselCoachDealId
    setCarouselCoachOpen(false)
    setCarouselCoachMode(null)
    setCarouselCoachDealId(null)
    if (mode === 'accepted' && dealId) setBankrollScope(dealId)
    else setBankrollScope('personal')
  }

  async function handleStakeOnboardingAccept(dealId) {
    if (!supabaseClient || !dealId) return
    setStableSaving(true)
    setError('')
    try {
      const { error } = await stakeeAcceptBackerOffer(supabaseClient, dealId)
      if (error) throw error
      setStakeOfferOnboardingOpen(false)
      triggerTapHapticLight()
      await loadData()
      finishStakeOnboardingFlow('accepted', dealId)
    } catch (e) {
      setError(e?.message || 'Could not accept stake.')
    } finally {
      setStableSaving(false)
    }
  }

  async function handleStakeOnboardingDecline(dealId) {
    if (!supabaseClient || !dealId) return
    setStableSaving(true)
    setError('')
    try {
      const { error } = await stakeeDeclineBackerOffer(supabaseClient, dealId)
      if (error) throw error
      setStakeOfferOnboardingOpen(false)
      if (bankrollScope === dealId) setBankrollScope('personal')
      await loadData()
      finishStakeOnboardingFlow('declined', dealId)
    } catch (e) {
      setError(e?.message || 'Could not decline stake.')
    } finally {
      setStableSaving(false)
    }
  }

  function handleStakeOnboardingOfferNewTerms(dealId) {
    setStakeOfferOnboardingOpen(false)
    stakeOnboardingCounterPendingRef.current = true
    setEditTermsIntent('stakee_counter')
    setEditTermsDealId(dealId)
    triggerTapHapticLight()
  }

  function openClosedStakeReview(dealId) {
    if (!dealId) return
    const pending = stakeePendingSettleCommitForDeal(pendingStakeCommits, dealId)
    if (pending) {
      setTermsDealId(null)
      setCommitSyncId(String(pending.commit_id))
      triggerTapHapticLight()
      return
    }
    setCommitSyncId(null)
    setTermsDealId(dealId)
    triggerTapHapticLight()
  }

  /** Active stakes → Manage sheet; pending/proposal/closed → Stake terms sheet. */
  function openStakeTermsFromHero(dealId) {
    const id = String(dealId || '').trim()
    if (!id) return
    setError('')
    const deal = stakeeDeals.find((d) => d.id === id) ?? stakeeDealsById[id] ?? null
    const hasProposal = Boolean(deal?.stakee_terms_ack_required && deal?.pending_terms_json)
    if (stakeeBankrollTermsOpensManageSheet(deal, { userId, hasProposal })) {
      setTermsDealId(null)
      setLedgerDealId(id)
    } else {
      setLedgerDealId(null)
      setTermsDealId(id)
    }
    triggerTapHapticLight()
  }

  async function handleArchiveStakeeBankrollDeal(dealId) {
    if (!supabaseClient || !dealId) return
    const pending = stakeePendingSettleCommitForDeal(pendingStakeCommits, dealId)
    if (pending) {
      setTermsDealId(null)
      setCommitSyncId(String(pending.commit_id))
      setError('Commit the close settlement to your personal bankroll before archiving.')
      return
    }
    setStableSaving(true)
    setError('')
    try {
      const { error } = await archiveStakeeBankrollDeal(supabaseClient, dealId)
      if (error) throw error
      if (bankrollScope === dealId) setBankrollScope('personal')
      setTermsDealId(null)
      showStakeNotice('Stake archived.')
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not archive stake.')
    } finally {
      setStableSaving(false)
    }
  }

  useEffect(() => {
    if (!termsDealId || !termsDealForSheet) return
    if (!stakeeBankrollShowsClosedCarouselCard(termsDealForSheet)) return
    const pending = stakeePendingSettleCommitForDeal(pendingStakeCommits, termsDealId)
    if (!pending) return
    setTermsDealId(null)
    setCommitSyncId(String(pending.commit_id))
  }, [termsDealId, termsDealForSheet, pendingStakeCommits])

  useEffect(() => {
    if (!ledgerDealId) return
    const deal = stakeeDealsById[ledgerDealId]
    if (
      deal &&
      (deal.status === 'settled' ||
        deal.status === 'closed' ||
        deal.status === 'declined' ||
        isBackerInitiatedBackingDeal(deal))
    ) {
      setLedgerDealId(null)
    }
  }, [ledgerDealId, stakeeDealsById])

  useEffect(
    () => () => {
      if (stakeNoticeTimerRef.current) window.clearTimeout(stakeNoticeTimerRef.current)
    },
    [],
  )

  function openSetBankroll(scopeId = bankrollScope) {
    const onStake = scopeId !== 'personal'
    if (scopeId !== bankrollScope) selectBankrollScope(scopeId)
    if (onStake) {
      const deal = stakeeDeals.find((d) => d.id === scopeId)
      if (deal?.status === 'pending') {
        setError('Bankroll unlocks when backers accept this stake.')
        return
      }
      if (deal?.status === 'revoked') {
        setError('This stake was revoked. Re-offer backers or close it from stake terms.')
        return
      }
      const dp = dealProfiles[scopeId]
      setBankrollInput(dp != null ? formatMoneyInputValue(String(dp.overall_bankroll)) : '')
    } else {
      setBankrollInput(profile != null ? formatMoneyInputValue(String(profile.overall_bankroll)) : '')
    }
    setError('')
    setSheet('bankroll')
    triggerTapHapticLight()
  }

  async function saveBankroll() {
    const val = parseMoneyInputNumber(bankrollInput)
    if (!Number.isFinite(val) || val < 0) {
      setError('Enter a valid bankroll amount.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await upsertBankroll(val)
      setSheet(null)
      triggerTapHapticLight()
    } catch (e) {
      setError(e?.message || 'Could not save bankroll.')
    } finally {
      setSaving(false)
    }
  }

  function applyGeoCurrencyDefault() {
    currencyAutoDefaultRef.current = 'USD'
    void resolveCurrencyFromGeolocation(userId).then((code) => {
      const next = normalizePokerCurrency(code)
      setForm((f) => {
        if (normalizePokerCurrency(f.currency) !== currencyAutoDefaultRef.current) return f
        currencyAutoDefaultRef.current = next
        return { ...f, currency: next }
      })
    })
  }

  /**
   * Soft-link event + persist draft swaps + notify guests/Edge counterparties.
   * @param {object} sessionRow
   * @param {object[]} drafts
   */
  function promptSameTournamentEventConfirm(existing) {
    const existingLabel = String(existing.display_name || existing.venue_name || 'this event').trim()
    return window.confirm(
      `Looks like you're in "${existingLabel}" (same venue/date/buy-in/game). Same event?\n\nOK = same event · Cancel = different event`,
    )
  }

  async function linkTournamentEventForSession(sessionRow) {
    if (!supabaseClient || !userId || !sessionRow?.id) return sessionRow
    const { session, error } = await ensureSessionTournamentEventLink(
      supabaseClient,
      userId,
      sessionRow,
      { onNeedsConfirm: promptSameTournamentEventConfirm },
    )
    if (error) {
      console.warn('[poker-bankroll] event link failed', error.message)
    }
    return session
  }

  /**
   * Before ending a tourney with swaps, warn when session facts don't match the swap event.
   * @param {object} session
   * @param {object[]} swaps
   */
  function confirmEndSessionSwapEventAlignment(session, swaps) {
    for (const swap of swaps || []) {
      const swapEvent = swap?.tournament_event_id
        ? swapEventsById[swap.tournament_event_id] || null
        : null
      const mismatch = sessionSwapEventMismatch(session, swap, swapEvent)
      if (!mismatch) continue
      const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
      const ok = window.confirm(
        `Your swap with ${other} is for ${mismatch.swapLabel}. Your session doesn't match that tournament (venue, date, buy-in, or game).\n\nOK = end session anyway · Cancel = go back and fix`,
      )
      if (!ok) return false
    }
    return true
  }

  async function attachDraftSwapsToSession(sessionRow, drafts) {
    if (!supabaseClient || !userId || !sessionRow?.id) return
    if (sessionRow.session_type !== 'tournament' || !drafts?.length) return

    const linked = await linkTournamentEventForSession(sessionRow)
    const tournamentEventId = linked.tournament_event_id || null

    const { swaps, error: swapErr } = await persistDraftSwapsForSession(
      supabaseClient,
      userId,
      linked.id,
      drafts,
      tournamentEventId,
      linked,
    )
    if (swapErr) {
      if (!isMissingTournamentSwapTableError(swapErr)) {
        setError(swapErr.message || 'Could not save swaps.')
      }
      return
    }
    for (const swap of swaps || []) {
      const { error: nErr } = await notifyTournamentSwap(supabaseClient, swap.id)
      if (nErr) console.warn('[poker-bankroll] swap notify failed', nErr.message)
    }
    const sentLocalIds = new Set(drafts.map((d) => d.localId).filter(Boolean))
    setDraftSwaps((prev) =>
      sentLocalIds.size ? prev.filter((d) => !sentLocalIds.has(d.localId)) : [],
    )
  }

  /** Persist one (or more) draft offers onto an existing tournament session. */
  async function sendDraftSwapsForSession(sessionRow, drafts) {
    if (!sessionRow || !drafts?.length) return
    setSaving(true)
    setError('')
    try {
      await attachDraftSwapsToSession(sessionRow, drafts)
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not send swap.')
    } finally {
      setSaving(false)
    }
  }

  function openStartSession() {
    if (isOnStake && stakeScopeSessionBlocked) {
      setError(
        stakeScopeRevoked
          ? 'This stake was revoked. Re-offer backers or close it from stake terms.'
          : stakeScopeClosedUnarchived
            ? 'This stake is closed. Archive it from your stake card when you are done reviewing.'
            : pendingBackerOffer
              ? 'Accept the backing offer before logging sessions on this stake.'
              : stakeGoesLivePendingCopy(
                  activeDeal,
                  slicesByDeal[activeDeal?.id] || [],
                  stableProfilesById,
                ),
      )
      return
    }
    if (activeSession) {
      setError('You already have a session in progress.')
      return
    }
    if (userId) writeStoredPokerBankrollScope(userId, bankrollScope)
    setNearbyCasinos([])
    setDraftSwaps([])
    setIncomingAcceptSwap(null)
    const nextForm = defaultNewSessionForm(activeDeal, scopedSessions, completedSessions)
    setForm(nextForm)
    setError('')
    setSheet('start')
    triggerTapHapticLight()
    applyGeoCurrencyDefault()
    if (nextForm.venue_kind === 'live') {
      void fetchNearby((name) => setForm((f) => patchLiveVenueFromGps(f, name)))
    }
  }

  /** Start Session prefilled from an incoming soft-event swap (no matching session yet). */
  function openStartForIncomingSwap(swap) {
    if (activeSession) {
      setError('You already have a session in progress.')
      return
    }
    const event = swap?.tournament_event_id
      ? swapEventsById[swap.tournament_event_id] || null
      : null
    const lastTourneyGame = lastTournamentGameFromSessions(scopedSessions)
    let nextForm = {
      ...emptyForm(),
      session_type: 'tournament',
      game_variant: lastTourneyGame.game_variant,
      game_custom_name: lastTourneyGame.game_custom_name,
      tournament_event_pick: '',
    }
    if (event) {
      nextForm = applySoftTournamentEventToForm(nextForm, event, {
        normalizeCurrency: normalizePokerCurrency,
        pokerGamePickFromStored,
        pokerOnlineSiteSelectValue,
        pokerOnlineSiteLabelFromId,
        pokerClubAppSelectValue,
        pokerClubAppLabelFromId,
      })
    } else {
      nextForm.tournament_event_pick = POKER_TOURNAMENT_MANUAL_PICK_ID
    }
    setNearbyCasinos([])
    setDraftSwaps([])
    setIncomingAcceptSwap(swap)
    setForm(nextForm)
    setError('')
    setSheet('start')
    triggerTapHapticLight()
    if (nextForm.venue_kind === 'live') {
      void fetchNearby((name) => {
        setForm((f) => patchLiveVenueFromGps(f, name))
      })
    }
  }

  function openLogPast() {
    if (isOnStake && stakeScopeSessionBlocked) {
      setError(
        stakeScopeRevoked
          ? 'This stake was revoked. Re-offer backers or close it from stake terms.'
          : stakeScopeClosedUnarchived
            ? 'This stake is closed. Archive it from your stake card when you are done reviewing.'
            : pendingBackerOffer
              ? 'Accept the backing offer before logging sessions on this stake.'
              : stakeGoesLivePendingCopy(
                  activeDeal,
                  slicesByDeal[activeDeal?.id] || [],
                  stableProfilesById,
                ),
      )
      return
    }
    setEditingId(null)
    setEditingPrevWl(0)
    setNearbyCasinos([])
    setDraftSwaps([])
    const nextForm = defaultNewSessionForm(activeDeal, scopedSessions, completedSessions)
    setForm(nextForm)
    setError('')
    setSheet('session')
    triggerTapHapticLight()
    applyGeoCurrencyDefault()
    if (nextForm.venue_kind === 'live') {
      void fetchNearby((name) => setForm((f) => patchLiveVenueFromGps(f, name)))
    }
  }

  function openEndSession() {
    setEndCashOut('')
    setEndNotes('')
    setEndBounties('')
    setEndFinishPlace('')
    setError('')
    setSheet('end')
    triggerTapHapticLight()
  }

  function openActiveSwaps() {
    if (!activeSession || activeSession.session_type !== 'tournament') return
    setDraftSwaps([])
    setError('')
    setSheet('swaps')
    triggerTapHapticLight()
  }

  async function markSessionCardSwapSettled(swap) {
    if (!supabaseClient || !swap?.id) return
    const role = swapViewerRole(swap, userId) || 'creator'
    setSessionCardSwapBusyId(swap.id)
    setError('')
    try {
      const { error } = await markSwapPaid(supabaseClient, swap.id, role, true)
      if (error) throw error
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not mark settled.')
    } finally {
      setSessionCardSwapBusyId(null)
    }
  }

  /** Counterparty declines an incoming offer (cancels the swap). */
  async function declineIncomingSwap(swap) {
    if (!supabaseClient || !swap?.id) return
    const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
    const ok = window.confirm(`Decline swap with ${other}? This cancels the deal.`)
    if (!ok) return
    setSaving(true)
    setError('')
    try {
      const { error } = await cancelTournamentSwap(supabaseClient, swap.id)
      if (error) throw error
      setIncomingAcceptSwap(null)
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not decline swap.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Incoming Accept:
   * - Matching session already started/logged → bind swap onto it.
   * - Otherwise → open Start Session prefilled (event + swap), bind on submit.
   */
  function swapEventForIncomingSwap(swap) {
    if (!swap?.tournament_event_id) return null
    return swapEventsById[swap.tournament_event_id] || null
  }

  function confirmIncomingBindSession(swap, session) {
    const swapEvent = swapEventForIncomingSwap(swap)
    if (
      swapEvent &&
      counterpartySessionNeedsSwapEventRelink(session, swap) &&
      session.tournament_event_id
    ) {
      const ok = window.confirm(
        'Your session and this swap use different event links, but venue, date, buy-in, and game match. Attach this swap to that session?\n\nOK = same tournament · Cancel = stop',
      )
      if (!ok) return false
    }
    if (swapEvent && eventDisplayNamesDiffer(session.tournament_name, swapEvent.display_name)) {
      const sessionLabel = String(session.tournament_name || 'Untitled').trim()
      const swapLabel = String(swapEvent.display_name || swapEvent.venue_name || 'this event').trim()
      const ok = window.confirm(
        `Your session "${sessionLabel}" and the swap event "${swapLabel}" have different names but the same venue/date/buy-in/game. Same tournament?\n\nOK = same event · Cancel = stop`,
      )
      if (!ok) return false
    }
    return true
  }

  async function bindIncomingSwapToSession(swap, session) {
    if (!supabaseClient || !userId || !swap?.id || !session?.id) return
    if (!confirmIncomingBindSession(swap, session)) return
    setSaving(true)
    setError('')
    setIncomingBindPicker(null)
    try {
      const swapEvent = swapEventForIncomingSwap(swap)
      const { error } = await acceptCounterpartySessionBind(
        supabaseClient,
        swap.id,
        session.id,
        session,
        { swapEvent, swapEventId: swap.tournament_event_id },
      )
      if (error) throw error
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not attach swap.')
    } finally {
      setSaving(false)
    }
  }

  async function acceptIncomingSwap(swap) {
    if (!supabaseClient || !userId || !swap?.id) return
    const swapEvent = swapEventForIncomingSwap(swap)
    const candidates = findCounterpartyBindCandidates(swap, scopedSessions, swapEvent)
    if (candidates.length > 1) {
      setIncomingBindPicker({ swap, candidates })
      return
    }
    if (candidates.length === 1) {
      await bindIncomingSwapToSession(swap, candidates[0])
      return
    }
    if (activeSession) {
      const eventLabel = formatTournamentEventLabel(swapEventsById[swap.tournament_event_id])
      setError(
        `Your active session doesn't match ${eventLabel}. End it (or switch) before accepting this swap.`,
      )
      return
    }
    openStartForIncomingSwap(swap)
  }

  function openRebuy(kind = 'rebuy') {
    if (!activeSession) return
    setRebuyKind(kind === 'addon' ? 'addon' : 'rebuy')
    setRebuyAmount('')
    setError('')
    setSheet('rebuy')
    triggerTapHapticLight()
  }

  async function saveRebuy() {
    if (!supabaseClient || !userId || !activeSession) return
    const add = parseMoneyInputNumber(rebuyAmount)
    const isAddon = rebuyKind === 'addon'
    const isTourney = activeSession.session_type === 'tournament'
    if (!Number.isFinite(add) || add <= 0) {
      setError(
        isAddon
          ? 'Enter a valid add-on amount.'
          : isTourney
            ? 'Enter a valid re-entry amount.'
            : 'Enter a valid re-buy amount.',
      )
      return
    }
    /** @type {Record<string, number>} */
    let patch
    if (isTourney && isAddon) {
      patch = { addon_amount: (Number(activeSession.addon_amount) || 0) + add }
    } else if (isTourney) {
      patch = {
        rebuy_amount: (Number(activeSession.rebuy_amount) || 0) + add,
        reentries: (Number(activeSession.reentries) || 0) + 1,
      }
    } else {
      // Cash: keep folding re-buys into buy_in (bring-in total).
      patch = {
        buy_in: (Number(activeSession.buy_in) || 0) + add,
        reentries: (Number(activeSession.reentries) || 0) + 1,
      }
    }
    setSaving(true)
    setError('')
    try {
      const { error: uErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .update(patch)
        .eq('id', activeSession.id)
        .eq('user_id', userId)
        .eq('status', 'active')
      if (uErr) throw uErr
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || (isAddon ? 'Could not add add-on.' : 'Could not add re-buy.'))
    } finally {
      setSaving(false)
    }
  }

  async function startLiveSession() {
    if (!supabaseClient || !userId) return
    if (activeSession) {
      setError('You already have a session in progress.')
      return
    }
    const buyIn = parseMoneyInputNumber(form.buy_in)
    if (!Number.isFinite(buyIn) || buyIn < 0) {
      setError(
        form.session_type === 'tournament'
          ? 'Enter a valid buy-in.'
          : 'Enter a valid bring-in amount.',
      )
      return
    }
    const rebuyAmt =
      form.session_type === 'tournament' && form.rebuy_amount !== ''
        ? parseMoneyInputNumber(form.rebuy_amount)
        : 0
    const addonAmt =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseMoneyInputNumber(form.addon_amount)
        : 0
    if (form.session_type === 'tournament') {
      if (form.rebuy_amount !== '' && (!Number.isFinite(rebuyAmt) || rebuyAmt < 0)) {
        setError('Enter a valid re-buy amount.')
        return
      }
      if (form.addon_amount !== '' && (!Number.isFinite(addonAmt) || addonAmt < 0)) {
        setError('Enter a valid add-on amount.')
        return
      }
    }
    let cashGameLabel = null
    if (form.session_type === 'cash') {
      cashGameLabel = resolveCashGameLabelForSave(form, cashGamePresets)
      if (!cashGameLabel) {
        setError('Enter small and big blinds (e.g. 2/5 NLH).')
        return
      }
    } else if (form.game_variant === 'custom' && !String(form.game_custom_name || '').trim()) {
      setError('Enter a name for your custom game.')
      return
    }
    const now = new Date()
    const payload = {
      user_id: userId,
      deal_id: scopeDealIdForWrite(),
      venue_name: form.venue_name.trim() || null,
      venue_kind: form.venue_kind,
      currency: normalizePokerCurrency(form.currency),
      session_type: form.session_type,
      status: 'active',
      start_at: now.toISOString(),
      end_at: null,
      buy_in: buyIn,
      rebuy_amount: form.session_type === 'tournament' ? rebuyAmt || 0 : 0,
      addon_amount: form.session_type === 'tournament' ? addonAmt || 0 : 0,
      cash_out: null,
      game_variant: pokerGameVariantToStored(
        form.session_type,
        form.game_variant,
        form.session_type === 'cash' ? cashGameLabel : form.game_custom_name,
      ),
      limit_type:
        form.session_type === 'cash' || form.game_variant === 'custom'
          ? form.limit_type || null
          : null,
      table_size: form.table_size || null,
      tables_count: tablesCountForPayload(form),
      small_blind:
        form.session_type === 'cash' && form.small_blind !== ''
          ? parseMoneyInputNumber(form.small_blind)
          : null,
      big_blind:
        form.session_type === 'cash' && form.big_blind !== '' ? parseMoneyInputNumber(form.big_blind) : null,
      third_blind:
        form.session_type === 'cash' && form.third_blind !== ''
          ? parseMoneyInputNumber(form.third_blind)
          : null,
      ante: form.session_type === 'cash' && form.ante !== '' ? parseMoneyInputNumber(form.ante) : null,
      tournament_name:
        form.session_type === 'tournament' ? form.tournament_name.trim() || null : null,
      tournament_event_id:
        form.session_type === 'tournament' && isSoftTournamentEventPick(form.tournament_event_pick)
          ? form.tournament_event_pick
          : null,
      field_size:
        form.session_type === 'tournament' && form.field_size !== ''
          ? parseInt(form.field_size, 10)
          : null,
      start_stack:
        form.session_type === 'tournament' && form.start_stack !== ''
          ? parseMoneyInputNumber(form.start_stack)
          : null,
      finish_place: null,
      bounty_winnings: null,
      reentries: null,
      notes: null,
    }
    setSaving(true)
    setError('')
    try {
      const { data: created, error: iErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .insert(payload)
        .select('*')
        .single()
      if (iErr) throw iErr
      let sessionRow = created
      if (payload.session_type === 'tournament') {
        sessionRow = await linkTournamentEventForSession(created)
      }
      if (payload.session_type === 'tournament' && incomingAcceptSwap?.id) {
        const swapEvent = swapEventForIncomingSwap(incomingAcceptSwap)
        const { error: bindErr } = await acceptCounterpartySessionBind(
          supabaseClient,
          incomingAcceptSwap.id,
          sessionRow.id,
          sessionRow,
          { swapEvent, swapEventId: incomingAcceptSwap.tournament_event_id },
        )
        if (bindErr) throw bindErr
      }
      if (payload.session_type === 'tournament' && draftSwaps.length > 0) {
        await attachDraftSwapsToSession(sessionRow, draftSwaps)
      }
      if (userId) {
        writeStoredPokerBankrollScope(
          userId,
          payload.deal_id ? String(payload.deal_id) : 'personal',
        )
      }
      setIncomingAcceptSwap(null)
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not start session.')
    } finally {
      setSaving(false)
    }
  }

  /** Fire-and-forget guest backer email/SMS when a stake session completes. */
  async function notifyGuestBackersOnSessionComplete(sessionId, dealId) {
    if (!supabaseClient || !sessionId || !dealId) return
    const { error } = await notifyStableSessionComplete(supabaseClient, dealId, sessionId)
    if (error) {
      console.warn('[poker-bankroll] guest session notify failed', error.message)
    }
  }

  async function endLiveSession() {
    if (!supabaseClient || !userId || !activeSession) return
    const cashOut = parseMoneyInputNumber(endCashOut)
    if (!Number.isFinite(cashOut) || cashOut < 0) {
      setError('Enter cash out (what you walked with).')
      return
    }
    const bounties =
      activeSession.session_type === 'tournament' && endBounties !== ''
        ? parseMoneyInputNumber(endBounties) || 0
        : 0
    const wl = cashOut + bounties - pokerSessionTotalCost(activeSession)
    if (
      activeSession.session_type === 'tournament' &&
      activeSessionSwaps.length > 0 &&
      !confirmEndSessionSwapEventAlignment(activeSession, activeSessionSwaps)
    ) {
      return
    }
    setSaving(true)
    setError('')
    try {
      let sessionRow = activeSession
      if (activeSession.session_type === 'tournament') {
        sessionRow = await linkTournamentEventForSession(activeSession)
      }
      const { error: uErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .update({
          status: 'completed',
          end_at: new Date().toISOString(),
          cash_out: cashOut,
          bounty_winnings:
            activeSession.session_type === 'tournament' && endBounties !== ''
              ? parseMoneyInputNumber(endBounties)
              : null,
          finish_place:
            activeSession.session_type === 'tournament' && endFinishPlace !== ''
              ? parseInt(endFinishPlace, 10)
              : null,
          notes: endNotes.trim() || null,
        })
        .eq('id', activeSession.id)
        .eq('user_id', userId)
      if (uErr) throw uErr
      await applyBankrollDelta(wl)
      if (activeSession.session_type === 'tournament') {
        const ended = {
          ...sessionRow,
          status: 'completed',
          cash_out: cashOut,
          bounty_winnings:
            activeSession.session_type === 'tournament' && endBounties !== ''
              ? parseMoneyInputNumber(endBounties)
              : null,
        }
        const syncA = await syncCreatorResultsForSession(
          supabaseClient,
          activeSession.id,
          ended,
        )
        if (syncA.error && !isMissingTournamentSwapTableError(syncA.error)) {
          console.warn('[poker-bankroll] swap creator sync failed', syncA.error.message)
        }
        const syncB = await syncCounterpartyResultsForSession(
          supabaseClient,
          activeSession.id,
          ended,
        )
        if (syncB.error && !isMissingTournamentSwapTableError(syncB.error)) {
          console.warn('[poker-bankroll] swap counterparty sync failed', syncB.error.message)
        }
        await notifyTournamentSwapResults(supabaseClient, [
          ...(syncA.swapIds || []),
          ...(syncB.swapIds || []),
        ])
      }
      if (activeSession.deal_id) {
        await notifyGuestBackersOnSessionComplete(activeSession.id, activeSession.deal_id)
      }
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not end session.')
    } finally {
      setSaving(false)
    }
  }

  function openSessionDetail(session) {
    if (!session?.id) return
    setDetailSessionId(session.id)
    setError('')
    setSheet('sessionDetail')
    triggerTapHapticLight()
  }

  function openEdit(session) {
    const start = new Date(session.start_at)
    const hrs = pokerSessionDurationHours(session)
    const prevWl = pokerSessionWinLoss(session)
    const sessionType = session.session_type || 'cash'
    const gamePick = pokerGamePickFromStored(session.game_variant, sessionType)
    const gameVariant = coercePokerGameForSessionType(sessionType, gamePick.game_variant)
    const cashLabel =
      sessionType === 'cash' ? cashGameLabelFromSession(session) || gamePick.game_custom_name : ''
    const cashParsed = cashLabel ? parseCashGameLabel(cashLabel) : null
    const cashLivePick =
      cashParsed?.live_game_name_pick ||
      pokerLiveCashGameNameSelectValue(gamePick.game_custom_name)
    setEditingId(session.id)
    setEditingPrevWl(prevWl == null ? 0 : prevWl)
    setForm({
      session_type: sessionType,
      venue_kind: session.venue_kind || 'live',
      venue_name: session.venue_name || '',
      online_site_pick:
        (session.venue_kind || 'live') === 'online'
          ? pokerOnlineSiteSelectValue(session.venue_name || '')
          : '',
      club_app_pick:
        session.venue_kind === 'club' ? pokerClubAppSelectValue(session.venue_name || '') : '',
      currency: normalizePokerCurrency(session.currency),
      date: localYmd(start),
      start_time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      duration_hours: formatDurationHoursField(hrs || 0),
      buy_in: session.buy_in != null ? formatMoneyInputValue(String(session.buy_in)) : '',
      rebuy_amount: session.rebuy_amount != null ? formatMoneyInputValue(String(session.rebuy_amount)) : '',
      addon_amount: session.addon_amount != null ? formatMoneyInputValue(String(session.addon_amount)) : '',
      cash_out: session.cash_out != null ? formatMoneyInputValue(String(session.cash_out)) : '',
      cash_game_pick:
        sessionType === 'cash' && cashLabel
          ? cashGamePresetIdFromName(cashLabel)
          : POKER_CASH_NEW_GAME_ID,
      game_variant: gameVariant,
      live_game_name_pick: cashLivePick,
      game_custom_name:
        cashLivePick === POKER_LIVE_CASH_GAME_CUSTOM_ID
          ? cashParsed?.family || gamePick.game_custom_name
          : pokerLiveCashGameNameLabelFromId(cashLivePick) || gamePick.game_custom_name,
      limit_type: session.limit_type || 'no_limit',
      table_size: session.table_size || 'full_ring',
      tables_count:
        session.tables_count != null ? String(session.tables_count) : '1',
      small_blind: session.small_blind != null ? formatMoneyInputValue(String(session.small_blind)) : '',
      big_blind: session.big_blind != null ? formatMoneyInputValue(String(session.big_blind)) : '',
      third_blind: session.third_blind != null ? formatMoneyInputValue(String(session.third_blind)) : '',
      ante: session.ante != null ? formatMoneyInputValue(String(session.ante)) : '',
      tournament_name: session.tournament_name || '',
      tournament_event_pick:
        session.tournament_event_id || POKER_TOURNAMENT_MANUAL_PICK_ID,
      field_size: session.field_size != null ? String(session.field_size) : '',
      start_stack: session.start_stack != null ? formatMoneyInputValue(String(session.start_stack)) : '',
      finish_place: session.finish_place != null ? String(session.finish_place) : '',
      bounty_winnings: session.bounty_winnings != null ? formatMoneyInputValue(String(session.bounty_winnings)) : '',
      reentries: session.reentries != null ? String(session.reentries) : '',
      notes: session.notes || '',
    })
    setDraftSwaps([])
    setError('')
    setSheet('session')
    triggerTapHapticLight()
    if ((session.venue_kind || 'live') === 'live') {
      void fetchNearby(null)
    }
  }

  function setField(key, value) {
    setForm((prev) => {
      if (key === 'cash_game_pick') {
        if (value === POKER_CASH_NEW_GAME_ID) return applyCashGamePreset(prev, null)
        const preset = cashGamePresets.find((p) => p.id === value)
        return preset ? applyCashGamePreset(prev, preset) : applyCashGamePreset(prev, null)
      }
      if (key === 'soft_tournament_event') {
        const next = applySoftTournamentEventToForm(prev, value, {
          normalizeCurrency: normalizePokerCurrency,
          pokerGamePickFromStored,
          pokerOnlineSiteSelectValue,
          pokerOnlineSiteLabelFromId,
          pokerClubAppSelectValue,
          pokerClubAppLabelFromId,
        }, { preserveVenueContext: true })
        if (next.venue_kind === 'live' && prev.venue_kind !== 'live') {
          void fetchNearby((name) => {
            setForm((f) => patchLiveVenueFromGps(f, name))
          })
        }
        return next
      }
      let next = { ...prev, [key]: value }
      if (key === 'session_type' && value !== prev.session_type) {
        if (value === 'cash') {
          next = formWithDefaultCashGame(
            {
              ...next,
              game_variant: 'custom',
              live_game_name_pick: 'holdem',
              game_custom_name: "Hold'em",
              tournament_event_pick: '',
            },
            cashGamePresets,
          )
        } else {
          // Cash uses game_variant=custom; that id also means "New game…" in tourney.
          // Prefer the user's last tournament game, else NLH.
          next.cash_game_pick = POKER_CASH_NEW_GAME_ID
          const lastTourneyGame = lastTournamentGameFromSessions(scopedSessions)
          next.game_variant = lastTourneyGame.game_variant
          next.game_custom_name = lastTourneyGame.game_custom_name
          next.tournament_event_pick = ''
        }
      }
      if (key === 'live_game_name_pick') {
        next.live_game_name_pick = value || 'holdem'
        if (value === POKER_LIVE_CASH_GAME_CUSTOM_ID) {
          next.game_custom_name = ''
        } else {
          next.game_custom_name = pokerLiveCashGameNameLabelFromId(value)
        }
      }
      if (key === 'venue_kind' && value !== prev.venue_kind) {
        next.online_site_pick = ''
        next.club_app_pick = ''
        if (prev.session_type === 'tournament') {
          next.tournament_event_pick = ''
          next.tournament_name = ''
        }
        if (value === 'live') {
          next.venue_name = ''
          void fetchNearby((name) => {
            setForm((f) => patchLiveVenueFromGps(f, name))
          })
        } else if (value === 'club') {
          setNearbyCasinos([])
          const last = lastClubAppFromSessions(completedSessions)
          if (last) {
            next.venue_name = last.venue_name
            next.club_app_pick = last.club_app_pick
          } else {
            next.venue_name = ''
            next.club_app_pick = ''
          }
        } else if (value === 'online') {
          const n = parseInt(next.tables_count, 10)
          if (!Number.isFinite(n) || n < 1) next.tables_count = '1'
          const site = resolveOnlineSitePickFromSessions(completedSessions)
          next.venue_name = site.venue_name
          next.online_site_pick = site.online_site_pick
          const siteCurrency = currencyFromOnlineSiteId(site.online_site_pick)
          if (siteCurrency) next.currency = normalizePokerCurrency(siteCurrency)
        }
        if (next.session_type === 'cash') {
          const venuePresets = buildCashGamePresetsFromSessions(scopedSessions, value)
          next = formWithDefaultCashGame(next, venuePresets)
        }
      }
      if (key === 'online_site_pick') {
        next.online_site_pick = value || ''
        next.venue_name = value ? pokerOnlineSiteLabelFromId(value) : ''
        const siteCurrency = currencyFromOnlineSiteId(value)
        if (siteCurrency) next.currency = normalizePokerCurrency(siteCurrency)
        if (prev.session_type === 'tournament') {
          next.tournament_event_pick = ''
          next.tournament_name = ''
        }
      }
      if (key === 'venue_name' && prev.venue_kind === 'live') {
        const venueCurrency = currencyFromNearbyCasinoName(value, nearbyCasinos)
        if (venueCurrency) next.currency = normalizePokerCurrency(venueCurrency)
      }
      if (key === 'club_app_pick') {
        next.club_app_pick = value || ''
        next.venue_name = value ? pokerClubAppLabelFromId(value) : ''
      }
      if (key === 'currency') {
        next.currency = normalizePokerCurrency(value)
      }
      return next
    })
  }

  /** Close any sheet without leaving form-validation errors on Overview. */
  function dismissSheet() {
    setError('')
    setIncomingAcceptSwap(null)
    setIncomingBindPicker(null)
    setDetailSessionId(null)
    setSheet(null)
  }

  async function saveSession() {
    if (!supabaseClient || !userId) return
    const buyIn = parseMoneyInputNumber(form.buy_in)
    const cashOut = parseMoneyInputNumber(form.cash_out)
    if (!Number.isFinite(buyIn) || buyIn < 0) {
      setError('Enter a valid buy-in / bring-in amount.')
      return
    }
    const rebuyAmt =
      form.session_type === 'tournament' && form.rebuy_amount !== ''
        ? parseMoneyInputNumber(form.rebuy_amount)
        : 0
    const addonAmt =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseMoneyInputNumber(form.addon_amount)
        : 0
    if (form.session_type === 'tournament') {
      if (form.rebuy_amount !== '' && (!Number.isFinite(rebuyAmt) || rebuyAmt < 0)) {
        setError('Enter a valid re-buy amount.')
        return
      }
      if (form.addon_amount !== '' && (!Number.isFinite(addonAmt) || addonAmt < 0)) {
        setError('Enter a valid add-on amount.')
        return
      }
    }
    // Active in-progress edit: no cash-out / hours yet (End Session handles that).
    if (!editingActiveSession) {
      if (!Number.isFinite(cashOut)) {
        setError('Enter cash out (what you walked with).')
        return
      }
    }
    let cashGameLabel = null
    if (form.session_type === 'cash') {
      cashGameLabel = resolveCashGameLabelForSave(form, cashGamePresets)
      if (!cashGameLabel) {
        setError('Enter small and big blinds (e.g. 2/5 NLH).')
        return
      }
    } else if (form.game_variant === 'custom' && !String(form.game_custom_name || '').trim()) {
      setError('Enter a name for your custom game.')
      return
    }
    const durationHrs = parseDurationHoursField(form.duration_hours)
    if (!editingActiveSession && durationHrs <= 0) {
      setError('Enter hours played.')
      return
    }
    const startAt = localDateTimeToIso(form.date, form.start_time)
    const endAt = editingActiveSession
      ? null
      : new Date(new Date(startAt).getTime() + durationHrs * 3_600_000).toISOString()

    const payload = {
      user_id: userId,
      deal_id: editingId
        ? undefined
        : scopeDealIdForWrite(),
      venue_name: form.venue_name.trim() || null,
      venue_kind: form.venue_kind,
      currency: normalizePokerCurrency(form.currency),
      session_type: form.session_type,
      status: editingActiveSession ? 'active' : 'completed',
      start_at: startAt,
      end_at: endAt,
      buy_in: buyIn,
      rebuy_amount: form.session_type === 'tournament' ? rebuyAmt || 0 : 0,
      addon_amount: form.session_type === 'tournament' ? addonAmt || 0 : 0,
      cash_out: editingActiveSession ? null : cashOut,
      game_variant: pokerGameVariantToStored(
        form.session_type,
        form.game_variant,
        form.session_type === 'cash' ? cashGameLabel : form.game_custom_name,
      ),
      limit_type:
        form.session_type === 'cash' || form.game_variant === 'custom'
          ? form.limit_type || null
          : null,
      table_size: form.table_size || null,
      tables_count: tablesCountForPayload(form),
      small_blind:
        form.session_type === 'cash' && form.small_blind !== ''
          ? parseMoneyInputNumber(form.small_blind)
          : null,
      big_blind:
        form.session_type === 'cash' && form.big_blind !== ''
          ? parseMoneyInputNumber(form.big_blind)
          : null,
      third_blind:
        form.session_type === 'cash' && form.third_blind !== ''
          ? parseMoneyInputNumber(form.third_blind)
          : null,
      ante: form.session_type === 'cash' && form.ante !== '' ? parseMoneyInputNumber(form.ante) : null,
      tournament_name:
        form.session_type === 'tournament' ? form.tournament_name.trim() || null : null,
      tournament_event_id:
        form.session_type === 'tournament' && isSoftTournamentEventPick(form.tournament_event_pick)
          ? form.tournament_event_pick
          : null,
      field_size:
        form.session_type === 'tournament' && form.field_size !== ''
          ? parseInt(form.field_size, 10)
          : null,
      start_stack:
        form.session_type === 'tournament' && form.start_stack !== ''
          ? parseMoneyInputNumber(form.start_stack)
          : null,
      finish_place: editingActiveSession
        ? null
        : form.session_type === 'tournament' && form.finish_place !== ''
          ? parseInt(form.finish_place, 10)
          : null,
      bounty_winnings: editingActiveSession
        ? null
        : form.session_type === 'tournament' && form.bounty_winnings !== ''
          ? parseMoneyInputNumber(form.bounty_winnings)
          : null,
      reentries:
        form.session_type === 'tournament' && form.reentries !== ''
          ? parseInt(form.reentries, 10)
          : null,
      notes: form.notes.trim() || null,
    }
    if (payload.deal_id === undefined) delete payload.deal_id
    // Edit without a soft pick: don't wipe an existing link by sending null.
    if (editingId && !isSoftTournamentEventPick(form.tournament_event_pick)) {
      delete payload.tournament_event_id
    }

    const baseEditingSession = editingId ? sessions.find((s) => s.id === editingId) : null
    if (
      editingId &&
      !editingActiveSession &&
      payload.session_type === 'tournament' &&
      editingSessionSwaps.length > 0 &&
      baseEditingSession
    ) {
      const previewSession = {
        ...baseEditingSession,
        ...payload,
        start_at: startAt,
        end_at: endAt,
      }
      if (!confirmEndSessionSwapEventAlignment(previewSession, editingSessionSwaps)) {
        return
      }
    }

    const newWl = editingActiveSession
      ? null
      : pokerSessionWinLoss({
          buy_in: buyIn,
          rebuy_amount: payload.rebuy_amount,
          addon_amount: payload.addon_amount,
          cash_out: cashOut,
          bounty_winnings:
            form.session_type === 'tournament' && form.bounty_winnings !== ''
              ? parseMoneyInputNumber(form.bounty_winnings) || 0
              : 0,
        })

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const { data: updated, error: uErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', userId)
          .select('*')
          .single()
        if (uErr) throw uErr
        let sessionRow = updated
        if (payload.session_type === 'tournament') {
          sessionRow = await linkTournamentEventForSession(updated)
        }
        if (!editingActiveSession && newWl != null) {
          await applyBankrollDelta(newWl - editingPrevWl)
        }
        if (payload.session_type === 'tournament') {
          if (draftSwaps.length > 0) {
            await attachDraftSwapsToSession(sessionRow, draftSwaps)
          }
          if (!editingActiveSession) {
            const syncA = await syncCreatorResultsForSession(
              supabaseClient,
              editingId,
              sessionRow,
            )
            if (syncA.error && !isMissingTournamentSwapTableError(syncA.error)) {
              console.warn('[poker-bankroll] swap creator sync failed', syncA.error.message)
            }
            const syncB = await syncCounterpartyResultsForSession(
              supabaseClient,
              editingId,
              sessionRow,
            )
            if (syncB.error && !isMissingTournamentSwapTableError(syncB.error)) {
              console.warn('[poker-bankroll] swap counterparty sync failed', syncB.error.message)
            }
            await notifyTournamentSwapResults(supabaseClient, [
              ...(syncA.swapIds || []),
              ...(syncB.swapIds || []),
            ])
          }
        }
      } else {
        const { data: created, error: iErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .insert(payload)
          .select('*')
          .single()
        if (iErr) throw iErr
        let sessionRow = created
        if (payload.session_type === 'tournament') {
          sessionRow = await linkTournamentEventForSession(created)
        }
        await applyBankrollDelta(newWl)
        if (created.deal_id) {
          await notifyGuestBackersOnSessionComplete(created.id, created.deal_id)
        }
        if (payload.session_type === 'tournament' && draftSwaps.length > 0) {
          await attachDraftSwapsToSession(sessionRow, draftSwaps)
        }
        void recordAppSessionRecorded(supabaseClient, 'poker-bankroll', payload.session_type)
      }
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSession() {
    if (!editingId || !supabaseClient || !userId) return
    if (!window.confirm('Delete this poker session?')) return
    setSaving(true)
    try {
      const editingRow = sessions.find((s) => s.id === editingId)
      const stakeDealId = editingRow?.deal_id || (isOnStake ? bankrollScope : null)
      if (stakeDealId) {
        // RPC writes audit + refreshes deal roll from remaining sessions.
        const { error: dErr } = await deleteStakeSessionWithAudit(supabaseClient, editingId)
        if (dErr) throw dErr
      } else {
        const { error: dErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .delete()
          .eq('id', editingId)
          .eq('user_id', userId)
        if (dErr) throw dErr
        await applyBankrollDelta(-editingPrevWl)
      }
      setSheet(null)
      await loadData()
    } catch (e) {
      setError(e?.message || 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  /** Discard an in-progress session from End Session (no bankroll delta yet). */
  async function deleteActiveSession() {
    if (!activeSession || !supabaseClient || !userId) return
    if (!window.confirm('Delete this session? It will not be saved to your history.')) return
    setSaving(true)
    setError('')
    try {
      const { error: dErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .delete()
        .eq('id', activeSession.id)
        .eq('user_id', userId)
      if (dErr) throw dErr
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  /** Wipe every session in the current Personal / On Stake scope and reverse P/L. */
  async function purgeAllSessions() {
    if (!supabaseClient || !userId || scopedSessions.length === 0 || saving) return
    const scopeLabel = isOnStake ? 'On Stake' : 'personal'
    const n = scopedSessions.length
    if (
      !window.confirm(
        `Delete all ${n} ${scopeLabel} poker session${n === 1 ? '' : 's'}? Your bankroll will be adjusted by the reversed session P/L. This cannot be undone.`,
      )
    ) {
      return
    }
    setSaving(true)
    setError('')
    try {
      let totalWl = 0
      for (const s of scopedSessions) {
        const wl = pokerSessionWinLoss(s)
        if (wl != null) totalWl += wl
      }
      let q = supabaseClient
        .from('poker_bankroll_sessions')
        .delete()
        .eq('user_id', userId)
      q = isOnStake ? q.eq('deal_id', bankrollScope) : q.is('deal_id', null)
      const { error: dErr } = await q
      if (dErr) throw dErr
      await applyBankrollDelta(-totalWl)
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Purge failed.')
    } finally {
      setSaving(false)
    }
  }

  const previewWl = (() => {
    const buyIn = parseMoneyInputNumber(form.buy_in)
    const cashOut = parseMoneyInputNumber(form.cash_out)
    const bounties = parseMoneyInputNumber(form.bounty_winnings) || 0
    if (!Number.isFinite(buyIn) || !Number.isFinite(cashOut)) return null
    const rebuy =
      form.session_type === 'tournament' && form.rebuy_amount !== ''
        ? parseMoneyInputNumber(form.rebuy_amount) || 0
        : 0
    const addon =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseMoneyInputNumber(form.addon_amount) || 0
        : 0
    return cashOut + bounties - (buyIn + rebuy + addon)
  })()

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div data-poker-bankroll>

        {/* Pills: OVERVIEW · DETAILS · TREND · LOCATIONS · CHARTS */}
        <div className="mb-5 -mx-3 flex gap-1 overflow-x-auto px-3 no-scrollbar">
          {[
            { id: 'overview', label: 'OVERVIEW' },
            { id: 'details', label: 'DETAILS' },
            { id: 'trend', label: 'TREND' },
            { id: 'locations', label: 'LOCATIONS' },
            { id: 'charts', label: 'CHARTS' },
            { id: 'archive', label: 'ARCHIVE' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold tracking-wide touch-manipulation transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && !sheet ? (
          <p className="mb-3 text-center text-sm text-rose-400">{error}</p>
        ) : null}

        {stakeNotice && activeTab === 'overview' ? (
          <div
            data-poker-stake-notice
            className="mb-3 rounded-2xl border border-cyan-500/40 bg-cyan-950/50 px-4 py-3 text-center text-sm text-cyan-100"
          >
            {stakeNotice}
          </div>
        ) : null}

        {activeDeal?.stakee_terms_ack_required && activeTab === 'overview' && isOnStake ? (
          <div
            data-poker-stake-notice
            className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-center text-sm text-amber-100"
          >
            A backer proposed new stake terms.{' '}
            <button
              type="button"
              onClick={() => setTermsDealId(bankrollScope)}
              className="font-semibold text-amber-200 underline touch-manipulation"
            >
              Review terms
            </button>
          </div>
        ) : null}

        {waitingBackerCounterResponse && activeTab === 'overview' && isOnStake ? (
          <div
            data-poker-stake-notice
            className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-center text-sm text-amber-100"
          >
            Waiting for {dealLeadBackerDisplayName(activeDeal, stableProfilesById)} to respond to
            your counter-proposal.
          </div>
        ) : null}

        {pendingBackerOffer && activeTab === 'overview' && !stakeOfferOnboardingOpen && !carouselCoachOpen ? (
          <div
            data-poker-stable-invite-card
            data-elevated-card="surface"
            className="mb-3 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-zinc-900/80 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold text-white">
                  {dealLeadBackerDisplayName(activeDeal, stableProfilesById)}
                </div>
                <div className="mt-0.5 text-sm text-zinc-400">
                  wants to stake you
                  {activeDeal.label ? ` · ${activeDeal.label}` : ''}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${stakeOfferStatusTone(activeDeal.status)}`}
              >
                {stakeOfferStatusLabel(activeDeal.status)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openStakeOfferReview(activeDeal.id)}
                className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation"
              >
                Terms
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={stableSaving}
                onClick={() => void onAcceptBackerOffer(activeDeal.id)}
                className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={stableSaving}
                onClick={() => void onDeclineBackerOffer(activeDeal.id)}
                className="flex-1 rounded-2xl bg-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 touch-manipulation active:bg-zinc-600 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}

        {waitingBackerCounterResponse && activeTab === 'overview' ? (
          <div
            data-poker-stake-notice
            className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-center text-sm text-amber-100"
          >
            Counter-proposal sent ... waiting for{' '}
            {dealLeadBackerDisplayName(activeDeal, stableProfilesById)} to respond in Stable.
          </div>
        ) : null}

        {activeTab === 'details' ? (
          loading ? (
            <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
          ) : (
            <PokerBankrollOverview sessions={completedSessions} />
          )
        ) : null}

        {activeTab === 'overview' ? (
          <>
            <PokerBankrollHeroCarousel
              slides={bankrollSlides}
              activeId={bankrollScope}
              onActiveIdChange={selectBankrollScope}
              activeSyncEnabled={scopeHydrated && scopeCarouselSyncReady}
              renderSlide={(slide, slideIndex) => {
                const scopeId = slide.id
                const onStake = scopeId !== 'personal'
                const hero = heroByScope[scopeId] || heroByScope.personal
                const theme = onStake
                  ? stakeHeroTheme(stakeHeroThemeIndexForDeal(scopeId, stakeeDeals))
                  : null
                const dealSlices = slicesByDeal[scopeId] || []
                const pendingBackerSlices =
                  onStake && hero.deal && !isBackerInitiatedBackingDeal(hero.deal)
                    ? pendingBackerAcceptanceSlices(hero.deal, dealSlices)
                    : []
                const hasAcceptedBackerSlice =
                  onStake && hero.deal
                    ? dealHasAcceptedBackerSlice(hero.deal, dealSlices)
                    : false
                const heroDealSlices = slicesByDeal[scopeId] || []
                const heroStakeLive = hero.deal
                  ? stakeDealIsLiveForStakee(hero.deal, heroDealSlices)
                  : false
                const heroClosedUnarchived =
                  onStake && hero.deal && stakeeBankrollShowsClosedCarouselCard(hero.deal)
                const stakeHeroMessage =
                  heroClosedUnarchived
                    ? null
                    : onStake && hero.deal?.status === 'revoked'
                      ? 'revoked'
                      : onStake && hero.deal && !heroStakeLive
                        ? isBackerInitiatedBackingDeal(hero.deal)
                          ? 'pendingBackerOffer'
                          : 'pendingStake'
                        : pendingBackerSlices.length > 0
                          ? 'pendingBackers'
                          : null
                const stakeHeroSlotExpands =
                  Boolean(stakeHeroMessage) ||
                  Boolean(hero.pendingSettleCommit) ||
                  heroClosedUnarchived
                return (
                  <div
                    data-poker-bankroll-hero-card
                    data-elevated-card={onStake ? 'accent' : 'surface'}
                    data-stake-hero-tone={onStake ? theme.tone : undefined}
                    className={
                      onStake
                        ? theme.card
                        : `${POKER_BANKROLL_HERO_SHELL} border-zinc-700/40 bg-gradient-to-br from-zinc-900 to-zinc-800`
                    }
                  >
                    <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <div
                          data-poker-bankroll-hero-title
                          className={`min-w-0 truncate ${
                            onStake ? theme.title : 'text-zinc-100'
                          }`}
                        >
                          {onStake
                            ? hero.deal?.label?.trim() || 'Cash backing'
                            : 'Poker bankroll'}
                        </div>
                        {!onStake && hasAnyStakeDeals ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBankrollInfoOpen(true)
                              triggerTapHapticLight()
                            }}
                            className="shrink-0 text-zinc-500 touch-manipulation active:text-zinc-300"
                            aria-label="About poker bankroll"
                            data-poker-bankroll-info-btn
                          >
                            <Info className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                          </button>
                        ) : null}
                        {onStake ? (
                          <span
                            data-poker-stake-hero-badge={stakeHeroBadgeVariant(
                              hero.deal,
                              dealSlices,
                            )}
                            className={`shrink-0 rounded-md border border-transparent px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                              stakeHeroBadgeVariant(hero.deal, dealSlices) === 'active'
                                ? theme.badge
                                : ''
                            }`}
                          >
                            {stakeHeroBadgeLabel(hero.deal, dealSlices)}
                          </span>
                        ) : null}
                      </div>
                        {onStake ? (
                        <button
                          type="button"
                          onClick={() => openStakeTermsFromHero(scopeId)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 touch-manipulation active:opacity-80"
                          aria-label="Manage stake"
                          data-poker-hero-terms-icon
                        >
                          <FileText className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden />
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setStakeNotice('')
                              setSheet('createStake')
                              triggerTapHapticLight()
                            }}
                            className="rounded-xl bg-zinc-700/60 px-3 py-1.5 text-xs font-semibold text-cyan-400 touch-manipulation active:bg-zinc-600"
                            data-poker-hero-stake-btn
                          >
                            + Stake
                          </button>
                          <button
                            type="button"
                            onClick={() => openSetBankroll(scopeId)}
                            className="rounded-xl bg-zinc-700/60 px-3 py-1.5 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-600"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                    {loading ? (
                      <>
                        <div className="min-h-12 w-48 animate-pulse rounded-xl bg-zinc-700/40" />
                        <div
                          className={`mt-3 w-full ${stakeHeroMessage ? 'min-h-10' : 'h-10'}`}
                          aria-hidden
                        >
                          <div className="h-full min-h-10 animate-pulse rounded-xl bg-zinc-700/25" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className={`flex min-h-12 flex-wrap items-end gap-x-3 gap-y-1 text-5xl font-black leading-none tracking-tight ${
                            onStake ? theme.amount : 'text-white'
                          }`}
                        >
                          <span>{fmtPoker$(hero.overallBankroll)}</span>
                          {onStake &&
                          hero.deal &&
                          dealIsInMakeup(hero.deal, dealProfiles[scopeId] ?? null) ? (
                            <span
                              data-poker-stake-makeup
                              className="pb-1 text-sm font-semibold tabular-nums text-rose-400/95"
                            >
                              Make-up:{' '}
                              {fmtPoker$(
                                computeDealMakeup({
                                  baseline_bankroll: hero.deal.baseline_bankroll,
                                  roll: hero.overallBankroll,
                                }),
                              )}
                            </span>
                          ) : null}
                        </div>
                        {onStake && hero.deal && !heroStakeLive
                          ? (() => {
                              const split = stakeBackingCapitalSplit(hero.deal, dealSlices)
                              if (split.total <= 0) return null
                              return (
                                <p
                                  data-poker-stake-backing-split
                                  className="mt-1.5 text-left text-[11px] font-semibold tabular-nums text-zinc-400"
                                >
                                  Backing{' '}
                                  <span className="text-emerald-400/90">
                                    {fmtPoker$(split.accepted)} accepted
                                  </span>
                                  {split.pending > 0 ? (
                                    <>
                                      {' · '}
                                      <span className="text-amber-200/80">
                                        {fmtPoker$(split.pending)} pending
                                      </span>
                                    </>
                                  ) : null}
                                </p>
                              )
                            })()
                          : onStake && hero.deal && heroStakeLive
                            ? (() => {
                                const split = stakeBackingCapitalSplit(hero.deal, dealSlices)
                                if (split.pending <= 0) return null
                                return (
                                  <p
                                    data-poker-stake-backing-split
                                    className="mt-1.5 text-left text-[11px] font-semibold tabular-nums text-zinc-400"
                                  >
                                    Backing{' '}
                                    <span className="text-emerald-400/90">
                                      {fmtPoker$(split.accepted)} accepted
                                    </span>
                                    {' · '}
                                    <span className="text-amber-200/80">
                                      {fmtPoker$(split.pending)} pending
                                    </span>
                                  </p>
                                )
                              })()
                            : null}
                        <div
                          className={`mt-3 w-full ${stakeHeroSlotExpands ? '' : 'h-10'}`}
                          data-poker-stake-hero-message-slot={
                            stakeHeroMessage ||
                            (hero.pendingSettleCommit
                              ? 'pendingSettle'
                              : heroClosedUnarchived
                                ? 'closedUnarchived'
                                : undefined)
                          }
                        >
                          {stakeHeroMessage === 'revoked' ? (
                            <p
                              data-poker-stake-revoked-notice
                              className="text-left text-xs leading-snug text-rose-200/90"
                            >
                              A backer revoked this stake. Re-offer backers or close it from terms.{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  setError('')
                                  setTermsDealId(scopeId)
                                  triggerTapHapticLight()
                                }}
                                className="font-semibold text-rose-100 underline touch-manipulation"
                              >
                                Manage stake
                              </button>
                            </p>
                          ) : stakeHeroMessage === 'pendingStake' ? (
                            <p
                              data-poker-stake-pending
                              className="text-left text-xs leading-snug text-amber-200/85"
                            >
                              {stakeGoesLivePendingCopy(
                                hero.deal,
                                dealSlices,
                                stableProfilesById,
                              )}
                            </p>
                          ) : stakeHeroMessage === 'pendingBackerOffer' ? (
                            <p
                              data-poker-stake-pending-offer
                              className="text-left text-xs leading-snug text-amber-200/85"
                            >
                              {stakeGoesLivePendingCopy(
                                hero.deal,
                                dealSlices,
                                stableProfilesById,
                              )}
                            </p>
                          ) : stakeHeroMessage === 'pendingBackers' ? (
                            <div
                              data-poker-stake-pending-backers
                              className="space-y-2 text-left"
                            >
                              {!hasAcceptedBackerSlice ? (
                                <p className="text-xs leading-snug text-amber-200/85">
                                  {stakeGoesLivePendingCopy(
                                    hero.deal,
                                    dealSlices,
                                    stableProfilesById,
                                  )}
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {pendingBackerSlices.map((slice) => {
                                    const backerName = sliceCounterpartyDisplayName(
                                      slice,
                                      stableProfilesById,
                                    )
                                    const nudging = nudgingSliceId === slice.id
                                    return (
                                      <li
                                        key={slice.id}
                                        className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-amber-950/20 px-2.5 py-2"
                                      >
                                        <span className="min-w-0 text-xs leading-snug text-amber-100/90">
                                          Pending acceptance by {backerName}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={Boolean(nudgingSliceId) || saving}
                                          onClick={() =>
                                            void onNudgePendingBacker(scopeId, slice.id)
                                          }
                                          className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 touch-manipulation active:bg-amber-500/30 disabled:opacity-50"
                                        >
                                          {nudging ? 'Sending…' : 'Nudge'}
                                        </button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                          ) : hero.pendingSettleCommit ? (
                            <PokerStableSettleNeedsAttnBanner
                              counterpartyName={dealLeadBackerDisplayName(
                                hero.deal,
                                stableProfilesById,
                              )}
                              onReview={() =>
                                setCommitSyncId(String(hero.pendingSettleCommit.commit_id))
                              }
                            />
                          ) : heroClosedUnarchived ? (
                            <PokerStakeeClosedStakeHeroBanner
                              deal={hero.deal}
                              profilesById={stableProfilesById}
                              saving={stableSaving}
                              onArchive={() => void handleArchiveStakeeBankrollDeal(hero.deal.id)}
                              onReview={() => openClosedStakeReview(scopeId)}
                            />
                          ) : hero.spark.length >= 2 ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (scopeId !== bankrollScope) selectBankrollScope(scopeId)
                                setActiveTab('trend')
                              }}
                              className="block h-full w-full touch-manipulation active:opacity-80"
                              aria-label="Open Trend chart"
                            >
                              <BankrollSparkline
                                series={hero.spark}
                                className="h-full w-full"
                                upClass="text-emerald-400"
                                downClass="text-rose-400"
                              />
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                    {!loading ? (
                      <div
                        className={`mt-4 grid grid-cols-4 gap-2 border-t pt-3 ${
                          onStake ? theme.borderStat : 'border-zinc-700/40'
                        }`}
                      >
                        <BankrollStat
                          label="Profit"
                          value={fmtPoker$(hero.stats.profit)}
                          tone={hero.stats.profit >= 0 ? 'good' : 'bad'}
                        />
                        <BankrollStat
                          label="Hourly"
                          value={hero.stats.hourly == null ? '-' : fmtPoker$(hero.stats.hourly)}
                          tone={
                            hero.stats.hourly == null
                              ? 'neutral'
                              : hero.stats.hourly >= 0
                                ? 'good'
                                : 'bad'
                          }
                        />
                        <BankrollStat label="Hours" value={hero.stats.hours.toFixed(1)} />
                        <BankrollStat
                          label="Win rate"
                          value={hero.stats.winRate == null ? '-' : `${hero.stats.winRate}%`}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />

            {activeSession ? (
              <div
                data-session-card
                data-poker-live-session-card
                data-elevated-card="accent"
                role="button"
                tabIndex={0}
                onClick={() => openSessionDetail(activeSession)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openSessionDetail(activeSession)
                  }
                }}
                className="mb-4 cursor-pointer rounded-3xl border border-emerald-500/30 bg-emerald-950/60 p-5 touch-manipulation active:bg-emerald-950/80"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                    Session in progress
                  </span>
                </div>
                <div className="min-w-0 text-lg font-bold leading-tight text-white">
                  {pokerSessionStakesLabel(activeSession)}
                </div>
                {(() => {
                  const elapsedLabel = fmtPokerDuration(elapsed)
                  const elapsedChars = elapsedLabel.replace(/\s/g, '').length
                  // Match title (text-lg); only step down for long labels so it clears Swap.
                  const timerTextClass =
                    elapsedChars <= 6 ? 'text-lg' : elapsedChars <= 8 ? 'text-base' : 'text-sm'
                  const chip =
                    'box-border h-9 w-[5.5rem] rounded-xl text-xs font-bold touch-manipulation'
                  const stopCardClick = (e) => e.stopPropagation()
                  const isCash = activeSession.session_type === 'cash'

                  if (isCash) {
                    return (
                      <div className="relative mt-2 min-h-[5rem]">
                        <div className="min-w-0 pr-[6.25rem]">
                          <div className="truncate text-sm text-zinc-400">
                            {pokerSessionMetaLine(activeSession)}
                          </div>
                          <div className="mt-0.5 truncate text-sm text-zinc-400">
                            {pokerSessionInForLine(activeSession)}
                          </div>
                        </div>
                        <div
                          className={`absolute bottom-0 left-0 max-w-[calc(100%-6rem)] overflow-hidden font-black tabular-nums whitespace-nowrap text-emerald-200 ${timerTextClass}`}
                        >
                          {elapsedLabel}
                        </div>
                        <div
                          className="absolute bottom-0 right-0"
                          onClick={stopCardClick}
                          onKeyDown={stopCardClick}
                        >
                          <button
                            type="button"
                            onClick={openEndSession}
                            data-poker-session-end-btn
                            className={`${chip} border border-emerald-500 bg-emerald-500 text-white active:bg-emerald-600`}
                          >
                            End Session
                          </button>
                        </div>
                        <div
                          className="absolute right-0 top-0"
                          onClick={stopCardClick}
                          onKeyDown={stopCardClick}
                        >
                          <button
                            type="button"
                            onClick={() => openRebuy('rebuy')}
                            className={`${chip} border border-emerald-400/40 bg-emerald-950/80 text-emerald-200 active:bg-emerald-900`}
                          >
                            Re-buy
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="relative mt-2 min-h-[5rem]">
                      <div className="min-w-0 pr-[6.25rem]">
                        <div className="truncate text-sm text-zinc-400">
                          {pokerSessionMetaLine(activeSession)}
                        </div>
                        <div className="mt-0.5 truncate text-sm text-zinc-400">
                          {pokerSessionInForLine(activeSession)}
                        </div>
                      </div>
                      <div
                        className={`absolute bottom-0 left-0 max-w-[calc(100%-12rem)] overflow-hidden font-black tabular-nums whitespace-nowrap text-emerald-200 ${timerTextClass}`}
                      >
                        {elapsedLabel}
                      </div>
                      <div
                        className="absolute right-0 top-0 grid grid-cols-2 gap-1.5"
                        onClick={stopCardClick}
                        onKeyDown={stopCardClick}
                      >
                        <button
                          type="button"
                          onClick={() => openRebuy('rebuy')}
                          className={`${chip} col-start-2 border border-emerald-400/40 bg-emerald-950/80 text-emerald-200 active:bg-emerald-900`}
                        >
                          Re-enter
                        </button>
                        <button
                          type="button"
                          onClick={openActiveSwaps}
                          data-poker-session-swap-btn
                          className={`${chip} border border-cyan-400/40 bg-cyan-950/50 text-cyan-100 active:bg-cyan-900/60`}
                        >
                          Swap{activeSessionSwaps.length ? ` (${activeSessionSwaps.length})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={openEndSession}
                          data-poker-session-end-btn
                          className={`${chip} border border-emerald-500 bg-emerald-500 text-white active:bg-emerald-600`}
                        >
                          End Session
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              !loading && (
                <div className="mb-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={openStartSession}
                    data-start-session-btn
                    data-start-session-locked={
                      (isOnStake && stakeScopeSessionBlocked)
                        ? 'true'
                        : undefined
                    }
                    className={`w-full rounded-3xl bg-emerald-600 py-4 text-base font-bold text-white touch-manipulation active:bg-emerald-500 ${
                      (isOnStake && stakeScopeSessionBlocked)
                        ? 'cursor-not-allowed opacity-45'
                        : ''
                    }`}
                  >
                    + Start Session
                  </button>
                  <button
                    type="button"
                    onClick={openLogPast}
                    data-log-past-session-btn
                    data-log-past-session-locked={
                      (isOnStake && stakeScopeSessionBlocked)
                        ? 'true'
                        : undefined
                    }
                    className={`w-full rounded-2xl py-3 text-sm font-semibold text-zinc-400 touch-manipulation active:text-zinc-200 ${
                      (isOnStake && stakeScopeSessionBlocked)
                        ? 'cursor-not-allowed opacity-45'
                        : ''
                    }`}
                  >
                    Log previous session(s)
                  </button>
                </div>
              )
            )}

            {pendingCounterpartySwaps.length > 0 ? (
              <div
                data-elevated-card="surface"
                data-poker-incoming-swaps
                className="mb-4 rounded-3xl border border-cyan-500/30 bg-cyan-950/40 p-4"
              >
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-300">
                  Incoming swaps
                </div>
                <p className="mb-3 text-[11px] text-zinc-400">
                  Accept attaches to a matching session (same venue, date, buy-in, and game, including
                  manual entry), or opens Start with the swap ready.
                </p>
                <ul className="space-y-2">
                  {pendingCounterpartySwaps.map((swap) => {
                    const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
                    const eventLabel = formatTournamentEventLabel(
                      swapEventsById[swap.tournament_event_id],
                    )
                    const swapEvent = swapEventForIncomingSwap(swap)
                    const canBind =
                      findCounterpartyBindCandidates(swap, scopedSessions, swapEvent).length >= 1
                    return (
                      <li
                        key={swap.id}
                        className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-900/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{other}</div>
                          <div className="truncate text-[11px] text-cyan-200/90">{eventLabel}</div>
                          <div className="text-[11px] text-zinc-400">
                            {swap.pct_creator_gives}% ↔ {swap.pct_counterparty_gives}%
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void acceptIncomingSwap(swap)}
                            title={
                              canBind
                                ? 'Attach this swap to your matching session'
                                : 'Start this tournament with the swap pre-filled'
                            }
                            className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-black text-white touch-manipulation shadow-sm disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void declineIncomingSwap(swap)}
                            className="rounded-xl border border-zinc-600/80 px-3 py-1.5 text-xs font-semibold text-zinc-400 touch-manipulation active:text-rose-300 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {completedSessions.length > 0 ? (
              <div className="mb-3 flex w-full flex-nowrap items-center gap-1">
                <div className="flex min-w-0 flex-[3] gap-1" role="group" aria-label="Session type">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'cash', label: 'Cash' },
                    { id: 'tournament', label: 'Tourney' },
                  ].map((opt) => (
                    <FilterChip
                      key={opt.id}
                      active={typeFilter === opt.id}
                      onClick={() => setTypeFilter(opt.id)}
                      label={opt.label}
                    />
                  ))}
                </div>
                <span className="mx-0.5 h-4 w-px shrink-0 self-center bg-zinc-800" aria-hidden />
                <div className="flex min-w-0 flex-[4] gap-1" role="group" aria-label="Venue">
                  {[
                    { id: 'all', label: 'Any' },
                    { id: 'live', label: 'Live' },
                    { id: 'online', label: 'Online' },
                    { id: 'club', label: 'Club' },
                  ].map((opt) => (
                    <FilterChip
                      key={`v-${opt.id}`}
                      active={venueFilter === opt.id}
                      onClick={() => setVenueFilter(opt.id)}
                      label={opt.label}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {loading ? (
              <p className="py-16 text-center text-sm text-zinc-500">Loading sessions…</p>
            ) : historyFeed.length === 0 ? (
              <div
                data-elevated-card="surface"
                className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
              >
                <p className="text-white font-semibold">No poker sessions yet</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {isOnStake
                    ? stakeScopeRevoked
                      ? 'This stake was revoked. Manage it from stake terms.'
                      : stakeScopePending
                        ? 'Start or log stake sessions now ... accepted backers see them in Stable right away.'
                        : 'Start or log a stake session for this deal.'
                    : 'Start a live session, or log one from earlier.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {historyFeed.map((item) => {
                  if (item.kind === 'event') {
                    const eventDate = new Date(item.at).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                    return (
                      <li key={item.id} className="py-1.5 text-center">
                        <p
                          data-poker-stake-history-line
                          data-poker-stake-history-kind={item.event.kind}
                          className="text-sm italic leading-snug"
                        >
                          {item.event.text}
                          <span className="not-italic opacity-70"> · {eventDate}</span>
                        </p>
                      </li>
                    )
                  }

                  const session = item.session
                  const baseWl = pokerSessionWinLoss(session)
                  const sessionDeal = session.deal_id
                    ? stakeeDealsById[session.deal_id] ?? null
                    : null
                  const isMergedStakeSession =
                    !isOnStake && sessionDeal?.status === 'settled'
                  const sessionDealSlices = session.deal_id
                    ? slicesByDeal[session.deal_id] || []
                    : []
                  const sessionDealSessions = session.deal_id
                    ? scopedSessions.filter((s) => s.deal_id === session.deal_id)
                    : []
                  const playerShareInMakeup =
                    sessionDeal &&
                    sessionPlayerShareInMakeup(sessionDeal, session, sessionDealSessions)
                  const playerShare =
                    (isOnStake || isMergedStakeSession) &&
                    sessionDeal &&
                    !playerShareInMakeup
                      ? playerStakeSessionValue(
                          session,
                          sessionDeal,
                          sessionDealSlices,
                          sessionDealSessions,
                        )
                      : null
                  const wl = resolveSessionMetricWinLoss(
                    session,
                    tournamentSwaps,
                    userId,
                    {
                      stakeScope: isOnStake,
                      dealsById: stakeeDealsById,
                      slicesByDeal,
                    },
                  )
                  const displayWl =
                    isOnStake || isMergedStakeSession ? baseWl : wl
                  const hrs = pokerSessionDurationHours(session)
                  const hourly = displayWl != null && hrs >= 0.02 ? displayWl / hrs : null
                  const bbh = pokerSessionBbPerHour(session)
                  const sessionSwaps = swapsBySessionId[session.id] || []
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => openSessionDetail(session)}
                        data-elevated-card="surface"
                        className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3 text-left touch-manipulation active:bg-zinc-800/80"
                      >
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            session.session_type === 'tournament'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                          aria-hidden
                        >
                          {session.session_type === 'tournament' ? (
                            <Trophy className="h-4 w-4" strokeWidth={2.25} />
                          ) : (
                            <DollarSign className="h-4 w-4" strokeWidth={2.25} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5">
                            <span className="truncate font-semibold text-white">
                              {isMergedStakeSession ? (
                                <>
                                  {sessionDeal?.label?.trim() || 'Stake'}
                                  <span className="mx-1 text-zinc-600">·</span>
                                </>
                              ) : null}
                              {pokerSessionStakesLabel(session)}
                            </span>
                            <span
                              className={`shrink-0 text-right font-bold tabular-nums ${
                                displayWl == null
                                  ? 'text-zinc-500'
                                  : displayWl >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                              }`}
                            >
                              {displayWl == null ? '-' : fmtPoker$(displayWl)}
                            </span>
                            <span className="min-w-0 truncate text-[12px] text-zinc-500">
                              {pokerSessionMetaLine(session)}
                            </span>
                            {isOnStake && playerShare != null ? (
                              <span
                                data-poker-session-player-share
                                className="shrink-0 whitespace-nowrap text-right text-[10px] font-medium tabular-nums text-zinc-500"
                              >
                                Your share{' '}
                                <span
                                  className={
                                    playerShare >= 0
                                      ? 'text-emerald-400/85'
                                      : 'text-rose-400/85'
                                  }
                                >
                                  {fmtPoker$(playerShare)}
                                </span>
                              </span>
                            ) : isMergedStakeSession && playerShare != null ? (
                              <span
                                data-poker-session-player-share
                                className="shrink-0 whitespace-nowrap text-right text-[10px] font-medium tabular-nums text-zinc-500"
                              >
                                Your share{' '}
                                <span
                                  className={
                                    playerShare >= 0
                                      ? 'text-emerald-400/85'
                                      : 'text-rose-400/85'
                                  }
                                >
                                  {fmtPoker$(playerShare)}
                                </span>
                              </span>
                            ) : null}
                          </div>
                          <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
                            {new Date(session.start_at).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {hourly != null ? ` · ${fmtPoker$(hourly)}/h` : ''}
                            {bbh != null ? ` · ${bbh.toFixed(1)} BB/h` : ''}
                          </span>
                          {sessionSwaps.length > 0 ? (
                            <>
                              <span
                                data-poker-session-swap-line="waiting"
                                className="mt-1.5 block text-[11px] font-medium text-cyan-300/90"
                              >
                                Swaps
                              </span>
                              {sessionSwaps.map((swap) => {
                                const role = swapViewerRole(swap, userId) || 'creator'
                                const other = swapOtherPartyLabel(
                                  swap,
                                  swapProfilesById,
                                  userId,
                                )
                                const paid = swapIsMarkedPaid(swap)
                                const signed = swapViewerSettlementDelta(swap, role)
                                const waitingLine =
                                  swap.status === 'settled'
                                    ? formatSwapIouLine(
                                        swap.settlement_amount,
                                        role,
                                        other,
                                        fmtPoker$,
                                      )
                                    : formatSwapWaitingStatus(swap, role, other)
                                const showSettledAmt = paid && swap.status === 'settled'
                                const canMarkSettled =
                                  swap.status === 'settled' &&
                                  !paid &&
                                  Math.abs(Number(swap.settlement_amount) || 0) >= 0.005
                                const amtTone =
                                  signed < -0.005 ? 'loss' : signed > 0.005 ? 'gain' : 'flat'
                                return (
                                  <div
                                    key={swap.id}
                                    className="mt-0.5 flex items-center gap-3 -ml-12"
                                  >
                                    <div className="flex w-9 shrink-0 justify-center">
                                      {canMarkSettled ? (
                                        <button
                                          type="button"
                                          disabled={sessionCardSwapBusyId === swap.id}
                                          data-poker-session-swap-settle-btn
                                          aria-label="Mark settled"
                                          title="Mark settled"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void markSessionCardSwapSettled(swap)
                                          }}
                                          className="box-border h-3.5 w-9 max-w-9 rounded bg-emerald-500 px-0 text-center text-[7px] font-bold leading-none text-white touch-manipulation active:bg-emerald-600 disabled:opacity-50"
                                        >
                                          {sessionCardSwapBusyId === swap.id
                                            ? '…'
                                            : 'Settle'}
                                        </button>
                                      ) : null}
                                    </div>
                                    <span
                                      data-poker-session-swap-line={paid ? 'settled' : 'waiting'}
                                      className="min-w-0 flex-1 truncate text-[11px] text-cyan-300/90"
                                    >
                                      {other}
                                      {swap.pct_creator_gives != null &&
                                      swap.pct_counterparty_gives != null
                                        ? ` · ${swap.pct_creator_gives}%↔${swap.pct_counterparty_gives}%`
                                        : ''}
                                      {showSettledAmt ? (
                                        <>
                                          {' · Settled '}
                                          <span
                                            data-poker-session-swap-amt={amtTone}
                                            className={
                                              amtTone === 'loss'
                                                ? 'text-rose-400'
                                                : amtTone === 'gain'
                                                  ? 'text-emerald-400'
                                                  : 'text-inherit'
                                            }
                                          >
                                            {formatSwapSettledParenAmount(signed, fmtPoker$)}
                                          </span>
                                        </>
                                      ) : waitingLine ? (
                                        ` · ${waitingLine}`
                                      ) : null}
                                    </span>
                                  </div>
                                )
                              })}
                            </>
                          ) : null}
                          {isMergedStakeSession ? (
                            <div className="mt-1.5 flex justify-end">
                              <span
                                data-poker-session-stake-badge
                                className="inline-flex rounded-md bg-zinc-700/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-300"
                              >
                                On stake
                              </span>
                            </div>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {scopedSessions.length > 0 ? (
              <div className="mt-6 pb-2 text-center">
                <button
                  type="button"
                  onClick={() => void purgeAllSessions()}
                  disabled={saving}
                  className="text-sm font-medium text-zinc-500 touch-manipulation active:text-rose-400 disabled:opacity-40"
                >
                  Purge all sessions
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'archive' ? (
          loading ? (
            <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
          ) : archivedStakeeDeals.length === 0 ? (
            <div
              data-elevated-card="surface"
              className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
            >
              <p className="text-white font-semibold">No archived stakes yet</p>
              <p className="mt-1 text-sm text-zinc-500">
                When you close a stake, it moves here with full session and event history.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {archivedStakeeDeals.map((deal) => {
                const slices = slicesByDeal[deal.id] || []
                const backerNames = slices
                  .filter((slice) => slice.status !== 'declined')
                  .map((slice) => sliceCounterpartyDisplayName(slice, stableProfilesById))
                  .filter(Boolean)
                const sessionCount = sessions.filter(
                  (s) => s.deal_id === deal.id && s.status !== 'active',
                ).length
                const closedAt = deal.settled_at || deal.updated_at || deal.created_at
                const label = deal.label?.trim() || dealTypeLabel(deal.deal_type)
                const personalNet = archivedStakePersonalBankrollNet({
                  deal,
                  slices,
                  settlements: dealSettlementsByDeal[deal.id] || [],
                })
                const outcomeLabel = archivedStakeOutcomeLabel(deal, slices)
                return (
                  <li key={deal.id}>
                    <button
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
                        <span className="min-w-0 truncate font-semibold text-white">{label}</span>
                        <span
                          data-poker-stake-archive-outcome={outcomeLabel.toLowerCase()}
                          className={archivedStakeOutcomeBadgeClass(outcomeLabel)}
                        >
                          {outcomeLabel}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {dealTypeLabel(deal.deal_type)}
                        {closedAt
                          ? ` · ${new Date(closedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}`
                          : null}
                      </p>
                      {backerNames.length ? (
                        <p className="text-xs text-zinc-400">
                          {backerNames.join(', ')}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-zinc-500">
                        {sessionCount} session{sessionCount === 1 ? '' : 's'} · baseline{' '}
                        {fmtPoker$(deal.baseline_bankroll)}
                      </p>
                      <p
                        data-poker-pl-tone={pokerPlTone(personalNet)}
                        className="text-[11px] font-semibold tabular-nums"
                      >
                        Personal bankroll {fmtPoker$(personalNet)}
                        {(() => {
                          const settleRows = dealSettlementsByDeal[deal.id] || []
                          if (settleRows.length <= 1) return null
                          return ` · ${settleRows.length} settles`
                        })()}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}

        {activeTab === 'locations' ? (
          <PokerLocationsTab
            sessions={completedSessions}
            loading={loading}
            onOpenSession={openSessionDetail}
          />
        ) : null}

        {activeTab === 'charts' ? (
          loading ? (
            <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
          ) : (
            <PokerBankrollChartsTab sessions={completedSessions} />
          )
        ) : null}

        {activeTab === 'trend' ? (
          loading ? (
            <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
          ) : (
            <PokerBankrollTrendTab
              sessions={metricCompleted}
              initialBankroll={overallBankroll}
              metricContext={metricContext}
              tournamentSwaps={tournamentSwaps}
              userId={userId}
            />
          )
        ) : null}
        </div>
      </ScrollLinkedEdgeTitleBarShell>

      {stakeOfferOnboardingOpen && onboardingDeal && !termsDealId ? (
        <PokerStakeOfferOnboardingModal
          deal={onboardingDeal}
          slices={slicesByDeal[onboardingDeal.id] || []}
          stableProfilesById={stableProfilesById}
          saving={stableSaving}
          onAccept={() => void handleStakeOnboardingAccept(onboardingDeal.id)}
          onDecline={() => void handleStakeOnboardingDecline(onboardingDeal.id)}
          onOfferNewTerms={() => handleStakeOnboardingOfferNewTerms(onboardingDeal.id)}
        />
      ) : null}

      {commitSyncId && supabaseClient && userId ? (
        <PokerStableCommitSyncModal
          supabaseClient={supabaseClient}
          userId={userId}
          commitId={commitSyncId}
          onClose={() => setCommitSyncId(null)}
          onSynced={() => {
            void (async () => {
              await loadData({ silent: true })
              setCommitSyncId(null)
            })()
          }}
          onError={setError}
        />
      ) : null}

      {carouselCoachOpen && carouselCoachMode ? (
        <PokerBankrollCarouselCoachModal
          mode={carouselCoachMode}
          dealLabel={
            stakeeDeals.find((d) => d.id === carouselCoachDealId)?.label?.trim() ||
            stakeeDealsById[carouselCoachDealId]?.label?.trim() ||
            'your stake'
          }
          backerName={
            dealLeadBackerDisplayName(
              stakeeDeals.find((d) => d.id === carouselCoachDealId) ??
                stakeeDealsById[carouselCoachDealId] ??
                null,
              stableProfilesById,
            ) || 'Your backer'
          }
          onDismiss={dismissStakeCarouselCoach}
        />
      ) : null}

      {archiveDetailDealId ? (
        <PokerStakeArchiveDetailModal
          deal={stakeeDealsById[archiveDetailDealId] ?? null}
          slices={slicesByDeal[archiveDetailDealId] || []}
          profilesById={stableProfilesById}
          topups={dealTopupsByDeal[archiveDetailDealId] || []}
          reductions={dealReductionsByDeal[archiveDetailDealId] || []}
          settlements={dealSettlementsByDeal[archiveDetailDealId] || []}
          sessions={sessions.filter((s) => s.deal_id === archiveDetailDealId)}
          onClose={() => setArchiveDetailDealId(null)}
        />
      ) : null}

      {termsDealId &&
      termsDealForSheet &&
      stakeeBankrollShowsClosedCarouselCard(termsDealForSheet) &&
      !stakeePendingSettleCommitForDeal(pendingStakeCommits, termsDealId) ? (
        <PokerStakeeClosedStakeSheet
          deal={termsDealForSheet}
          slices={slicesByDeal[termsDealId] || []}
          profilesById={stableProfilesById}
          saving={stableSaving}
          onClose={() => setTermsDealId(null)}
          onArchive={() => void handleArchiveStakeeBankrollDeal(termsDealId)}
        />
      ) : termsDealId && supabaseClient && userId ? (
        <PokerStableDealTermsSheet
          deal={termsDealForSheet}
          slices={slicesByDeal[termsDealId] || []}
          proposedPayload={
            stakeeDeals.find((d) => d.id === termsDealId)?.pending_terms_json ?? null
          }
          profilesById={stableProfilesById}
          userId={userId}
          supabaseClient={supabaseClient}
          saving={stableSaving}
          onClose={() => {
            const reopenOffer =
              stakeOfferOnboardingOpenedRef.current &&
              termsDealId &&
              (stakeeDeals.find((d) => d.id === termsDealId)?.status === 'pending' ||
                stakeeDealsById[termsDealId]?.status === 'pending')
            setTermsDealId(null)
            if (reopenOffer) setStakeOfferOnboardingOpen(true)
          }}
          onError={setError}
          onEdit={() => {
            setTermsDealId(null)
            setEditTermsIntent('stakee_update')
            setEditTermsDealId(termsDealId)
          }}
          onReassignGuest={async ({ sliceId, stakerUserId }) => {
            setStableSaving(true)
            setError('')
            try {
              const { error } = await reassignGuestSliceToUser(supabaseClient, {
                sliceId,
                stakerUserId,
              })
              if (error) throw error
              showStakeNotice('Guest backer linked ... they can accept their slice in Stable.')
              await loadData()
            } catch (e) {
              setError(e?.message || 'Could not assign guest backer.')
            } finally {
              setStableSaving(false)
            }
          }}
          onCancelStake={async () => {
            const deal = stakeeDeals.find((d) => d.id === termsDealId)
            const label = deal?.label?.trim() || 'this stake'
            if (
              !window.confirm(
                `Delete ${label}? This removes the stake and any sessions logged on it before backers accept. This cannot be undone.`,
              )
            ) {
              return
            }
            setStableSaving(true)
            setError('')
            try {
              const { error, notifyWarning } = await cancelStakeDeal(
                supabaseClient,
                termsDealId,
                userId,
              )
              if (error) throw error
              if (bankrollScope === termsDealId) setBankrollScope('personal')
              setTermsDealId(null)
              showStakeNotice(
                notifyWarning
                  ? `Stake deleted. ${notifyWarning}`
                  : 'Stake deleted.',
              )
              await loadData()
            } catch (e) {
              setError(e?.message || 'Could not delete stake.')
            } finally {
              setStableSaving(false)
            }
          }}
          dealRoll={dealProfiles[termsDealId] ?? null}
          pendingCommits={pendingStakeCommits}
          onPeriodicSettle={(rakebackTotal, stakeReductionTotal) =>
            runPeriodicSettle(termsDealId, rakebackTotal, stakeReductionTotal)
          }
          onCloseStake={(rakebackTotal) => runCloseStake(termsDealId, rakebackTotal)}
          onOpenLedger={() => {
            const dealId = termsDealId
            setTermsDealId(null)
            if (dealId) setLedgerDealId(dealId)
          }}
          onAcceptProposal={async () => {
            setStableSaving(true)
            setError('')
            try {
              const { error } = await acceptProposedDealTerms(
                supabaseClient,
                termsDealId,
                userId,
              )
              if (error) throw error
              showStakeNotice('Proposed terms accepted.')
              setTermsDealId(null)
              await loadData()
            } catch (e) {
              setError(e?.message || 'Could not accept proposed terms.')
            } finally {
              setStableSaving(false)
            }
          }}
          onDeclineProposal={async () => {
            setStableSaving(true)
            setError('')
            try {
              const { error } = await declineProposedDealTerms(supabaseClient, termsDealId)
              if (error) throw error
              showStakeNotice('Proposal declined. Your terms are unchanged.')
              setTermsDealId(null)
              await loadData()
            } catch (e) {
              setError(e?.message || 'Could not decline proposal.')
            } finally {
              setStableSaving(false)
            }
          }}
        />
      ) : null}

      {ledgerDealId &&
      ledgerDealForSheet &&
      supabaseClient &&
      userId &&
      !stakeeBankrollShowsClosedCarouselCard(ledgerDealForSheet) ? (
        <PokerStableDealDetailSheet
          variant="manageOnly"
          supabaseClient={supabaseClient}
          userId={userId}
          deal={ledgerDealForSheet}
          slices={slicesByDeal[ledgerDealId] || []}
          roll={dealProfiles[ledgerDealId] ?? null}
          profilesById={stableProfilesById}
          sessions={sessions.filter((s) => s.deal_id === ledgerDealId)}
          topups={dealTopupsByDeal[ledgerDealId] || []}
          reductions={dealReductionsByDeal[ledgerDealId] || []}
          settlements={dealSettlementsByDeal[ledgerDealId] || []}
          saving={stableSaving}
          onSavingChange={setStableSaving}
          onClose={() => setLedgerDealId(null)}
          onRefresh={loadData}
          onError={setError}
        />
      ) : null}

      {editTermsDealId && supabaseClient && userId ? (
        <PokerStablePlayerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={stableSaving}
          onSavingChange={setStableSaving}
          editDeal={
            stakeeDeals.find((d) => d.id === editTermsDealId) ??
            stakeeDealsById[editTermsDealId] ??
            null
          }
          editSlices={slicesByDeal[editTermsDealId] || []}
          editProfilesById={stableProfilesById}
          termsIntent={editTermsIntent}
          onClose={() => {
            if (stakeOnboardingCounterPendingRef.current) {
              stakeOnboardingCounterPendingRef.current = false
              setStakeOfferOnboardingOpen(true)
            }
            setEditTermsDealId(null)
            setEditTermsIntent('stakee_update')
          }}
          onUpdated={(deal, meta) => {
            const warn = meta?.guestNotifyWarning
            const wasRevoked = stakeeDealsById[editTermsDealId]?.status === 'revoked'
            const wasCounter = editTermsIntent === 'stakee_counter'
            showStakeNotice(
              warn
                ? wasCounter
                  ? `Counter-proposal sent. ${warn}`
                  : wasRevoked
                    ? `Stake re-offered. ${warn}`
                    : `Stake terms updated. ${warn}`
                : wasCounter
                  ? 'Counter-proposal sent ... waiting for the backer in Stable.'
                  : wasRevoked
                    ? 'Stake re-offered ... waiting on backers.'
                    : 'Stake terms updated.',
            )
            setEditTermsDealId(null)
            setEditTermsIntent('stakee_update')
            if (stakeOnboardingCounterPendingRef.current && wasCounter) {
              stakeOnboardingCounterPendingRef.current = false
              finishStakeOnboardingFlow('counter', deal?.id || editTermsDealId)
            }
            void loadData()
          }}
        />
      ) : null}

      {incomingBindPicker?.swap && incomingBindPicker.candidates?.length > 1 ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setIncomingBindPicker(null)}
        >
          <div
            data-poker-incoming-bind-picker
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-w-[100vw] min-w-0 overflow-x-hidden overscroll-x-none touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">Attach swap to session</div>
              <button
                type="button"
                onClick={() => setIncomingBindPicker(null)}
                disabled={saving}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation disabled:opacity-50"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-500">
              More than one session matches this swap (venue, date, buy-in, game). Pick the one you
              played.
            </p>
            <ul className="space-y-2">
              {incomingBindPicker.candidates.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void bindIncomingSwapToSession(incomingBindPicker.swap, session)
                    }
                    className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-900/70 px-3 py-2.5 text-left touch-manipulation active:border-cyan-500/50 disabled:opacity-50"
                  >
                    <div className="truncate text-sm font-semibold text-white">
                      {pokerSessionMetaLine(session)}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {new Date(session.start_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {session.status === 'active' ? ' · In progress' : ' · Completed'}
                      {session.tournament_name
                        ? ` · ${String(session.tournament_name).trim()}`
                        : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {error ? <p className="mt-3 text-center text-sm text-rose-400">{error}</p> : null}
          </div>
        </div>
      ) : null}

      {sheet === 'createStake' && supabaseClient && userId ? (
        <PokerStablePlayerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={stableSaving}
          onSavingChange={setStableSaving}
          onClose={() => setSheet(null)}
          onCreated={(deal, meta) => {
            if (deal?.id) {
              pendingCarouselDealIdRef.current = deal.id
              const warn = meta?.guestNotifyWarning
              if (deal.status === 'pending') {
                showStakeNotice(
                  warn
                    ? `Stake request sent. ${warn}`
                    : 'Stake request sent. Backers will see invites in Stable ... you can log stake sessions now; they sync when backers accept.',
                )
              } else {
                showStakeNotice(
                  warn
                    ? `Stake created. ${warn}`
                    : 'Stake created. Swipe to your stake bankroll card to get started.',
                )
              }
            }
            void loadData()
          }}
        />
      ) : null}

      {sheet === 'sessionDetail' && detailSession ? (
        <PokerSessionDetailSheet
          session={detailSession}
          isActive={detailSession.status === 'active'}
          elapsedSeconds={detailSession.id === activeSession?.id ? elapsed : 0}
          stakeLabel={detailStakeLabel}
          deal={detailDeal}
          slices={detailSlices}
          stableProfilesById={stableProfilesById}
          userId={userId}
          supabaseClient={supabaseClient}
          sessionSwaps={detailSessionSwaps}
          swapProfilesById={swapProfilesById}
          maxSwapGivePct={swapSelfOwnedPct}
          sessionCardSwapBusyId={sessionCardSwapBusyId}
          stakeSessions={
            detailDeal?.id
              ? scopedSessions.filter((s) => s.deal_id === detailDeal.id)
              : []
          }
          onClose={dismissSheet}
          onEdit={() => {
            openEdit(detailSession)
            setDetailSessionId(null)
          }}
          onSavedSwapsMutated={() => void loadData()}
          onMarkSwapSettled={(swap) => void markSessionCardSwapSettled(swap)}
          onEndSession={() => {
            setDetailSessionId(null)
            openEndSession()
          }}
          onOpenSwaps={() => {
            setDetailSessionId(null)
            openActiveSwaps()
          }}
          onRebuy={() => {
            setDetailSessionId(null)
            openRebuy('rebuy')
          }}
        />
      ) : null}

      {sheet === 'bankroll' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-w-[100vw] min-w-0 overflow-x-hidden overscroll-x-none touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">
                {isOnStake
                  ? hasBankrollProfile
                    ? 'Edit stake bankroll'
                    : 'Stake starting bankroll'
                  : hasBankrollProfile
                    ? 'Edit poker bankroll'
                    : 'Starting bankroll'}
              </div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-500">
              Your poker roll only. Separate from Slots Bankroll. Session wins and losses update this
              automatically.
            </p>
            <FieldLabel>Amount</FieldLabel>
            <MoneyInput value={bankrollInput} onChange={setBankrollInput} />
            {error ? <p className="mt-3 text-center text-sm text-rose-400">{error}</p> : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveBankroll()}
              className="mt-4 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save bankroll'}
            </button>
          </div>
        </div>
      ) : null}

      {sheet === 'session' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={`${POKER_SHEET_PANEL_CLASS} ${
              pokerSessionSheetNeedsTall(form) ? POKER_SHEET_PANEL_TALL_CLASS : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">
                {editingId ? 'Edit session' : 'Log previous session'}
              </div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <PokerSessionCoreFields
              form={form}
              setField={setField}
              supabaseClient={supabaseClient}
              nearbyCasinos={nearbyCasinos}
              customVenues={customVenues}
              onSaveCustomVenue={saveCustomVenue}
              gpsLoading={gpsLoading}
              cashGamePresets={cashGamePresets}
              showCashDetails={Boolean(editingId) || form.cash_game_pick === POKER_CASH_NEW_GAME_ID}
            />

            <PokerTournamentSwapsSection
              supabaseClient={supabaseClient}
              userId={userId}
              enabled={form.session_type === 'tournament' && !editingActiveSession}
              maxSwapGivePct={swapSelfOwnedPct}
              showOwnershipSummary={false}
              draftSwaps={draftSwaps}
              onDraftSwapsChange={setDraftSwaps}
              savedSwaps={editingSessionSwaps}
              profilesById={swapProfilesById}
              onSavedSwapsMutated={() => void loadData()}
              onSendDraft={
                editingId
                  ? (draft) => {
                      const sessionRow =
                        scopedSessions.find((s) => s.id === editingId) || null
                      if (!sessionRow) {
                        setError('Session not found ... save the session first.')
                        return
                      }
                      void sendDraftSwapsForSession(sessionRow, [draft])
                    }
                  : undefined
              }
              sendingDrafts={saving}
            />

            <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
              <DateWheelPicker
                value={form.date}
                onChange={(v) => setField('date', v)}
                showYear
                insetLabel="Date"
              />
              <TimeWheelPicker
                value={form.start_time}
                onChange={(v) => setField('start_time', v)}
                insetLabel="Start time"
              />
            </div>

            {!editingActiveSession ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-[3.35rem] w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
                    onClick={() =>
                      setField(
                        'duration_hours',
                        formatDurationHoursField(
                          parseDurationHoursField(form.duration_hours) - 0.25,
                        ),
                      )
                    }
                  >
                    −
                  </button>
                  <InField label="Hours" className="min-w-0 flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.duration_hours}
                      onChange={(e) => setField('duration_hours', e.target.value)}
                      className={`${POKER_INFIELD_CONTROL} text-center`}
                      aria-label="Hours played"
                    />
                  </InField>
                  <button
                    type="button"
                    className="flex h-[3.35rem] w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
                    onClick={() =>
                      setField(
                        'duration_hours',
                        formatDurationHoursField(
                          parseDurationHoursField(form.duration_hours) + 0.25,
                        ),
                      )
                    }
                  >
                    +
                  </button>
                </div>

                <div className="mb-3">
                  <MoneyInput
                    label="Cash out"
                    value={form.cash_out}
                    onChange={(v) => setField('cash_out', v)}
                    colorize
                  />
                </div>

                {previewWl != null ? (
                  <p
                    className={`mb-3 text-center text-sm font-semibold tabular-nums ${
                      previewWl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Session P/L {fmtPoker$(previewWl)}
                  </p>
                ) : null}

                {form.session_type === 'tournament' ? (
                  <div className="mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <NumInput
                        label="Finish place"
                        value={form.finish_place}
                        onChange={(v) => setField('finish_place', v)}
                      />
                      <NumInput
                        label="Re-entries"
                        value={form.reentries}
                        onChange={(v) => setField('reentries', v)}
                      />
                    </div>
                    <MoneyInput
                      label="Bounty winnings"
                      value={form.bounty_winnings}
                      onChange={(v) => setField('bounty_winnings', v)}
                      colorize
                    />
                  </div>
                ) : null}
              </>
            ) : form.session_type === 'tournament' ? (
              <div className="mb-3">
                <NumInput
                  label="Re-entries"
                  value={form.reentries}
                  onChange={(v) => setField('reentries', v)}
                />
              </div>
            ) : null}

            <InField label="Notes" className="mb-3 !min-h-0">
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={2}
                className="w-full resize-none bg-transparent px-0 py-0.5 text-sm text-white outline-none placeholder:text-zinc-500"
                placeholder="Table notes, tilt, etc."
              />
            </InField>

            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}

            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSession()}
              className="mb-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save session'}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void deleteSession()}
                className="w-full rounded-2xl border border-rose-500/40 py-3 text-sm font-semibold text-rose-300 touch-manipulation disabled:opacity-50"
              >
                Delete session
              </button>
            ) : (
              <>
                <div className="mb-1 mt-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs text-zinc-600">have multiple sessions?</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSheet('import')
                    triggerTapHapticLight()
                  }}
                  className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-zinc-500 touch-manipulation active:text-zinc-300"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                  </svg>
                  Import from CSV
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {sheet === 'import' ? (
        <PokerBankrollImportSheet
          supabaseClient={supabaseClient}
          userId={userId}
          dealId={scopeDealIdForWrite()}
          completedSessions={completedSessions}
          onClose={dismissSheet}
          onImported={() => void loadData()}
        />
      ) : null}

      {sheet === 'start' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={`${POKER_SHEET_PANEL_CLASS} ${
              pokerSessionSheetNeedsTall(form) ? POKER_SHEET_PANEL_TALL_CLASS : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">Start Session</div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <PokerSessionCoreFields
              form={form}
              setField={setField}
              supabaseClient={supabaseClient}
              nearbyCasinos={nearbyCasinos}
              customVenues={customVenues}
              onSaveCustomVenue={saveCustomVenue}
              gpsLoading={gpsLoading}
              cashGamePresets={cashGamePresets}
              showCashDetails={form.cash_game_pick === POKER_CASH_NEW_GAME_ID}
            />

            <PokerTournamentSwapsSection
              supabaseClient={supabaseClient}
              userId={userId}
              enabled={form.session_type === 'tournament'}
              maxSwapGivePct={swapSelfOwnedPct}
              draftSwaps={draftSwaps}
              onDraftSwapsChange={setDraftSwaps}
              savedSwaps={[]}
              profilesById={swapProfilesById}
              incomingAcceptSwap={incomingAcceptSwap}
              onDeclineIncomingAccept={
                incomingAcceptSwap
                  ? () => void declineIncomingSwap(incomingAcceptSwap)
                  : undefined
              }
              decliningIncoming={saving}
            />

            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}

            <button
              type="button"
              disabled={saving}
              onClick={() => void startLiveSession()}
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving
                ? 'Starting…'
                : incomingAcceptSwap
                  ? 'Start & accept swap'
                  : 'Start Session'}
            </button>
          </div>
        </div>
      ) : null}

      {sheet === 'swaps' && activeSession ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={POKER_SHEET_PANEL_CLASS}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">Tournament swaps</div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <PokerTournamentSwapsSection
              supabaseClient={supabaseClient}
              userId={userId}
              enabled
              maxSwapGivePct={swapSelfOwnedPct}
              showOwnershipSummary
              draftSwaps={draftSwaps}
              onDraftSwapsChange={setDraftSwaps}
              savedSwaps={activeSessionSwaps}
              profilesById={swapProfilesById}
              onSavedSwapsMutated={() => void loadData()}
              compact
              onSendDraft={(draft) => {
                if (!activeSession) return
                void sendDraftSwapsForSession(activeSession, [draft])
              }}
              sendingDrafts={saving}
            />
            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}
            {draftSwaps.length > 1 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (!activeSession) return
                  void sendDraftSwapsForSession(activeSession, draftSwaps)
                }}
                className="mt-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation disabled:opacity-50"
              >
                {saving ? 'Sending…' : 'Send all swaps'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismissSheet}
              className="mt-2 w-full rounded-2xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-300 touch-manipulation"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {sheet === 'rebuy' && activeSession ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={POKER_SHEET_PANEL_CLASS}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">
                {rebuyKind === 'addon'
                  ? 'Add-on'
                  : activeSession.session_type === 'tournament'
                    ? 'Re-enter'
                    : 'Re-buy'}
              </div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-400">
              Adds to your total in for this session. Currently in for{' '}
              <span className="font-semibold text-zinc-200">
                {fmtPoker$(pokerSessionTotalCost(activeSession))}
              </span>
              .
            </p>
            <div className="mb-4">
              <MoneyInput
                label={
                  rebuyKind === 'addon'
                    ? 'Add-on amount'
                    : activeSession.session_type === 'tournament'
                      ? 'Re-entry amount'
                      : 'Re-buy amount'
                }
                value={rebuyAmount}
                onChange={setRebuyAmount}
              />
            </div>
            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveRebuy()}
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving
                ? 'Saving…'
                : rebuyKind === 'addon'
                  ? 'Add add-on'
                  : activeSession.session_type === 'tournament'
                    ? 'Add re-entry'
                    : 'Add re-buy'}
            </button>
          </div>
        </div>
      ) : null}

      {sheet === 'end' && activeSession ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && dismissSheet()}
        >
          <div
            data-poker-bankroll-sheet
            className={POKER_SHEET_PANEL_CLASS}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">End Session</div>
              <button
                type="button"
                onClick={dismissSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-zinc-700/40 bg-zinc-800/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {pokerSessionStakesLabel(activeSession)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">
                    {pokerSessionInForLine(activeSession)}
                  </div>
                </div>
                <div className="shrink-0 text-lg font-black tabular-nums text-emerald-300">
                  {fmtPokerDuration(elapsed)}
                </div>
              </div>
            </div>

            <div className="mb-3">
              <MoneyInput label="Cash out" value={endCashOut} onChange={setEndCashOut} colorize />
            </div>

            {activeSession.session_type === 'tournament' ? (
              <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
                <NumInput label="Finish place" value={endFinishPlace} onChange={setEndFinishPlace} />
                <MoneyInput
                  label="Bounties"
                  value={endBounties}
                  onChange={setEndBounties}
                  colorize
                />
              </div>
            ) : null}

            <InField label="Notes" className="mb-3 !min-h-0">
              <textarea
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                rows={2}
                className="w-full resize-none bg-transparent px-0 py-0.5 text-sm text-white outline-none placeholder:text-zinc-500"
                placeholder="Optional"
              />
            </InField>

            {(() => {
              const cashOut = parseMoneyInputNumber(endCashOut)
              if (!Number.isFinite(cashOut)) return null
              const bounties =
                activeSession.session_type === 'tournament' && endBounties !== ''
                  ? parseMoneyInputNumber(endBounties) || 0
                  : 0
              const wl = cashOut + bounties - pokerSessionTotalCost(activeSession)
              return (
                <p
                  className={`mb-3 text-center text-sm font-semibold tabular-nums ${
                    wl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  Session P/L {fmtPoker$(wl)}
                </p>
              )
            })()}

            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}

            <button
              type="button"
              disabled={saving}
              onClick={() => void endLiveSession()}
              className="mb-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Ending…' : 'End Session'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void deleteActiveSession()}
              className="w-full rounded-2xl border border-rose-500/40 py-3 text-sm font-semibold text-rose-300 touch-manipulation disabled:opacity-50"
            >
              Delete session
            </button>
          </div>
        </div>
      ) : null}

      {bankrollInfoOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
          onClick={() => setBankrollInfoOpen(false)}
        >
          <div
            data-poker-bankroll-info-modal
            className="w-full max-w-md rounded-3xl border border-zinc-700/50 bg-zinc-900 px-5 pb-6 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold leading-tight text-white">Poker bankroll</h3>
              <button
                type="button"
                onClick={() => setBankrollInfoOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400 touch-manipulation active:bg-zinc-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-zinc-400">
              Includes your share of on-stake sessions; bankroll updates when you settle with
              backers.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}

function BankrollStat({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white'
  return (
    <div className="min-w-0 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-bold tabular-nums sm:text-base ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}

/** Fluid one-line filter pill... shares row width so Overview never wraps. */
function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-poker-filter-chip={active ? 'on' : 'off'}
      className={`min-w-0 flex-1 truncate rounded-full px-1 py-1 text-center text-[10px] font-semibold touch-manipulation sm:px-2 sm:text-[11px] ${
        active ? 'bg-zinc-700 text-white' : 'bg-zinc-800/60 text-zinc-500 active:bg-zinc-700'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Shared Start / Log core.
 * Cash: Game dropdown = saved games + New game… (details only for New game…).
 * Tournament: Game presets (NLH / PLO / …) + Players / Start stack.
 */
function PokerSessionCoreFields({
  form,
  setField,
  supabaseClient,
  nearbyCasinos,
  customVenues,
  onSaveCustomVenue,
  gpsLoading,
  cashGamePresets = [],
  showCashDetails = true,
}) {
  const isCash = form.session_type === 'cash'
  const isCustomGame = form.game_variant === 'custom'
  const [softEvents, setSoftEvents] = useState([])
  const [softEventsReady, setSoftEventsReady] = useState(false)
  const softEventsReqRef = useRef(0)
  const cashGameOrphan = (() => {
    const pick = form.cash_game_pick
    if (
      pick &&
      pick !== POKER_CASH_NEW_GAME_ID &&
      !(cashGamePresets || []).some((p) => p.id === pick) &&
      form.game_custom_name
    ) {
      return { id: pick, label: form.game_custom_name }
    }
    return null
  })()

  const showSoftTournamentPicker =
    !isCash && (form.venue_kind === 'live' || form.venue_kind === 'online')

  useEffect(() => {
    if (!showSoftTournamentPicker || !supabaseClient) {
      setSoftEvents([])
      setSoftEventsReady(true)
      return undefined
    }
    setSoftEvents([])
    setSoftEventsReady(false)
    const reqId = ++softEventsReqRef.current
    void loadNearbySoftTournamentEvents(supabaseClient, {
      venueKind: form.venue_kind,
      nearbyCasinos,
      onlineSitePick: form.online_site_pick,
    }).then(({ events, error }) => {
      if (reqId !== softEventsReqRef.current) return
      if (error) {
        console.warn('[poker-bankroll] soft tournament load failed', error.message)
        setSoftEvents([])
      } else {
        setSoftEvents(events || [])
      }
      setSoftEventsReady(true)
    })
    return () => {
      softEventsReqRef.current += 1
    }
  }, [showSoftTournamentPicker, supabaseClient, form.venue_kind, form.online_site_pick, nearbyCasinos])

  const softTournamentOptions = useMemo(() => {
    const opts = softTournamentPickerOptions(softEvents)
    const pick = form.tournament_event_pick
    if (
      isSoftTournamentEventPick(pick) &&
      !softEvents.some((e) => String(e.id) === String(pick))
    ) {
      opts.splice(1, 0, {
        id: String(pick),
        label: String(form.tournament_name || '').trim() || 'Linked tournament',
      })
    }
    return opts
  }, [softEvents, form.tournament_event_pick, form.tournament_name])

  function onPickSoftTournament(id) {
    if (!id || id === POKER_TOURNAMENT_MANUAL_PICK_ID) {
      setField('tournament_event_pick', id || POKER_TOURNAMENT_MANUAL_PICK_ID)
      return
    }
    const event = softEvents.find((e) => String(e.id) === String(id))
    if (event) {
      setField('soft_tournament_event', event)
      return
    }
    setField('tournament_event_pick', id)
  }

  return (
    <>
      <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
        <Select
          label="Type"
          value={form.session_type}
          onChange={(v) => setField('session_type', v)}
          options={[
            { id: 'cash', label: 'Cash' },
            { id: 'tournament', label: 'Tournament' },
          ]}
        />
        <Select
          label="Table size"
          value={form.table_size}
          onChange={(v) => setField('table_size', v)}
          options={POKER_TABLE_SIZES}
        />
      </div>

      <Segmented
        value={form.venue_kind}
        onChange={(v) => setField('venue_kind', v)}
        options={[
          { id: 'live', label: 'Live' },
          { id: 'online', label: 'Online' },
          { id: 'club', label: 'Club' },
        ]}
      />

      {!isCash ? <SectionLabel>Event</SectionLabel> : null}
      <div className="mb-2 space-y-2">
        {form.venue_kind === 'online' ? (
          <MenuSelect
            label="Site"
            value={form.online_site_pick || ''}
            onChange={(id) => setField('online_site_pick', id)}
            options={pokerOnlineSiteSelectOptions()}
          />
        ) : null}

        {showSoftTournamentPicker ? (
          <div>
            <PokerFieldMenu
              value={form.tournament_event_pick || ''}
              onChange={onPickSoftTournament}
              options={softTournamentOptions}
              ariaLabel="Tournament"
              placeholder="Select tournament…"
              insetLabel="Tournament"
            />
            {softEventsReady && softEvents.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                {form.venue_kind === 'online' && !form.online_site_pick
                  ? 'Select a site to see upcoming tournaments … Enter manually'
                  : 'No buy-in tournaments nearby in the next 24 hours … Enter manually'}
              </p>
            ) : null}
          </div>
        ) : null}

        {form.venue_kind === 'club' ? (
          <MenuSelect
            label="Club"
            value={form.club_app_pick || ''}
            onChange={(id) => setField('club_app_pick', id)}
            options={pokerClubAppSelectOptions()}
          />
        ) : form.venue_kind === 'live' ? (
          <CasinoAutocomplete
            value={form.venue_name}
            onChange={(v) => setField('venue_name', v)}
            supabaseClient={supabaseClient}
            nearbyCasinos={nearbyCasinos}
            customVenues={customVenues}
            onSaveCustomVenue={onSaveCustomVenue}
            gpsLoading={gpsLoading}
            placeholder="Wynn, Aria, home game…"
            insetLabel="Location"
          />
        ) : null}
      </div>

      {isCash ? (
        <>
          <GameCurrencyTablesRow
            showTables={form.venue_kind === 'online'}
            tablesCount={form.tables_count}
            onTablesCountChange={(v) => setField('tables_count', v)}
            currency={form.currency}
            onCurrencyChange={(v) => setField('currency', v)}
            game={
              <PokerCashGamePicker
                value={form.cash_game_pick || POKER_CASH_NEW_GAME_ID}
                onChange={(v) => setField('cash_game_pick', v)}
                presets={cashGamePresets}
                orphan={cashGameOrphan}
                insetLabel="Game"
              />
            }
          />
          {showCashDetails ? (
            <>
              <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
                <Select
                  label="Limit"
                  value={form.limit_type}
                  onChange={(v) => setField('limit_type', v)}
                  options={POKER_LIMIT_TYPES}
                />
                <Select
                  label="Game name"
                  value={form.live_game_name_pick || 'holdem'}
                  onChange={(v) => setField('live_game_name_pick', v)}
                  options={POKER_LIVE_CASH_GAME_NAMES}
                />
              </div>
              {form.live_game_name_pick === POKER_LIVE_CASH_GAME_CUSTOM_ID ? (
                <InField label="Custom name" className="mb-2">
                  <input
                    type="text"
                    value={form.game_custom_name}
                    onChange={(e) => setField('game_custom_name', e.target.value)}
                    placeholder="Enter game name…"
                    className={POKER_INFIELD_CONTROL}
                  />
                </InField>
              ) : null}
              <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
                <MoneyInput
                  label="Small blind"
                  value={form.small_blind}
                  onChange={(v) => setField('small_blind', v)}
                />
                <MoneyInput
                  label="Big blind"
                  value={form.big_blind}
                  onChange={(v) => setField('big_blind', v)}
                />
              </div>
              <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
                <MoneyInput
                  label="3rd blind"
                  value={form.third_blind}
                  onChange={(v) => setField('third_blind', v)}
                />
                <MoneyInput label="Ante" value={form.ante} onChange={(v) => setField('ante', v)} />
              </div>
            </>
          ) : null}
          <div className="mb-3">
            <MoneyInput label="Buy-in" value={form.buy_in} onChange={(v) => setField('buy_in', v)} />
          </div>
        </>
      ) : (
        <>
          <GameCurrencyTablesRow
            tablesCount={form.tables_count}
            onTablesCountChange={(v) => setField('tables_count', v)}
            currency={form.currency}
            onCurrencyChange={(v) => setField('currency', v)}
            game={
              <Select
                label="Game"
                value={form.game_variant}
                onChange={(v) => setField('game_variant', v)}
                options={pokerGameOptionsForSessionType('tournament')}
              />
            }
          />
          {isCustomGame ? (
            <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
              <Select
                label="Limit"
                value={form.limit_type}
                onChange={(v) => setField('limit_type', v)}
                options={POKER_LIMIT_TYPES}
              />
              <InField label="Game name">
                <input
                  type="text"
                  value={form.game_custom_name}
                  onChange={(e) => setField('game_custom_name', e.target.value)}
                  placeholder="Dealers Choice…"
                  className={POKER_INFIELD_CONTROL}
                />
              </InField>
            </div>
          ) : null}
          {!showSoftTournamentPicker ||
          !isSoftTournamentEventPick(form.tournament_event_pick) ? (
            <InField label="Tournament name" className="mb-2">
              <input
                type="text"
                value={form.tournament_name}
                onChange={(e) => setField('tournament_name', e.target.value)}
                placeholder={
                  form.venue_kind === 'online'
                    ? 'Sunday Million, daily…'
                    : form.venue_kind === 'club'
                      ? 'Club tournament name…'
                      : 'WSOP Event #96…'
                }
                className={POKER_INFIELD_CONTROL}
              />
            </InField>
          ) : null}
          <div className="mb-2">
            <MoneyInput label="Buy-in" value={form.buy_in} onChange={(v) => setField('buy_in', v)} />
          </div>
          <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
            <NumInput
              label="Players"
              value={form.field_size}
              onChange={(v) => setField('field_size', v)}
            />
            <NumInput
              label="Start stack"
              value={form.start_stack}
              onChange={(v) => setField('start_stack', v)}
            />
          </div>
          <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
            <MoneyInput
              label="Re-buy"
              value={form.rebuy_amount}
              onChange={(v) => setField('rebuy_amount', v)}
            />
            <MoneyInput
              label="Add-on"
              value={form.addon_amount}
              onChange={(v) => setField('addon_amount', v)}
            />
          </div>
        </>
      )}
    </>
  )
}

/** Live / end-sheet “In for …” line including re-buys and add-ons. */
function pokerSessionInForLine(session) {
  const total = pokerSessionTotalCost(session)
  const bits = [`In for ${fmtPoker$(total)}`]
  const reentries = Number(session.reentries) || 0
  const rebuy = Number(session.rebuy_amount) || 0
  const addon = Number(session.addon_amount) || 0
  if (reentries > 0) {
    bits.push(`${reentries} re-buy${reentries === 1 ? '' : 's'}`)
  } else if (rebuy > 0) {
    bits.push(`re-buys ${fmtPoker$(rebuy)}`)
  }
  if (addon > 0) bits.push(`add-ons ${fmtPoker$(addon)}`)
  return bits.join(' · ')
}

function FieldLabel({ children }) {
  return <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{children}</div>
}

function SectionLabel({ children }) {
  return (
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </div>
  )
}

function InField({ label, className = '', children }) {
  return (
    <div className={`${POKER_INFIELD_WRAP} ${className}`} data-poker-in-field="">
      <div className={POKER_INFIELD_LABEL}>{label}</div>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  )
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div className="mb-2">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <div className="flex gap-1 rounded-2xl bg-zinc-800 p-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold touch-manipulation ${
              value === opt.id ? 'bg-emerald-600 text-white' : 'text-zinc-400 active:bg-zinc-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Select({ value, onChange, options, label }) {
  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label || undefined}
      className={
        label
          ? `${POKER_INFIELD_CONTROL} appearance-none`
          : `${POKER_FIELD_CLASS} box-border appearance-none py-0 leading-[3rem]`
      }
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  )
  if (!label) return select
  return <InField label={label}>{select}</InField>
}

/** Game + Currency on one row; online cash also shows Tables below. */
function GameCurrencyTablesRow({
  showTables = false,
  game,
  currency,
  onCurrencyChange,
  tablesCount,
  onTablesCountChange,
}) {
  const tables = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="flex h-[3.35rem] w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
        onClick={() => {
          const n = Math.max(1, (parseInt(tablesCount, 10) || 1) - 1)
          onTablesCountChange(String(n))
        }}
      >
        −
      </button>
      <InField label="Tables" className="min-w-0 flex-1">
        <input
          type="text"
          inputMode="numeric"
          value={tablesCount}
          onChange={(e) => onTablesCountChange(e.target.value)}
          className={`${POKER_INFIELD_CONTROL} text-center`}
          aria-label="Number of tables"
        />
      </InField>
      <button
        type="button"
        className="flex h-[3.35rem] w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
        onClick={() => {
          const n = Math.min(24, (parseInt(tablesCount, 10) || 1) + 1)
          onTablesCountChange(String(n))
        }}
      >
        +
      </button>
    </div>
  )

  return (
    <>
      <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
        <div className="min-w-0">{game}</div>
        <div className="min-w-0">
          <PokerFieldMenu
            value={normalizePokerCurrency(currency)}
            onChange={onCurrencyChange}
            options={POKER_CURRENCIES}
            ariaLabel="Currency"
            placeholder="USD ($)"
            insetLabel="Currency"
          />
        </div>
      </div>
      {showTables ? <div className="mb-2 min-w-0">{tables}</div> : null}
    </>
  )
}

/** Long option lists (online sites): custom menu always opens scrolled to the top. */
function MenuSelect({ value, onChange, options, label: fieldLabel = '' }) {
  const [open, setOpen] = useState(false)
  const listRef = useRef(null)
  const selected = options.find((o) => o.id === value)
  const display = selected?.label || options[0]?.label || 'Select…'
  const hasInset = Boolean(fieldLabel)

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = 0
  }, [open])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={fieldLabel || 'Select'}
        className={
          hasInset
            ? 'relative flex w-full min-h-[3.35rem] flex-col justify-center rounded-2xl bg-zinc-800 px-3.5 py-1.5 pr-9 text-left outline-none focus:ring-2 focus:ring-cyan-500/40'
            : `${POKER_FIELD_CLASS} flex items-center justify-between text-left`
        }
      >
        {hasInset ? (
          <>
            <span className={POKER_INFIELD_LABEL}>{fieldLabel}</span>
            <span
              className={`mt-0.5 truncate text-sm font-semibold ${value ? 'text-white' : 'text-zinc-500'}`}
            >
              {display}
            </span>
            <span
              className={`pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500 transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </>
        ) : (
          <>
            <span className={`truncate text-sm font-semibold ${value ? 'text-white' : 'text-zinc-500'}`}>
              {display}
            </span>
            <span
              className={`ml-2 shrink-0 text-xs text-zinc-500 transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </>
        )}
      </button>
      {open ? (
        <div
          ref={listRef}
          className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-2xl bg-zinc-800 py-1"
        >
          {options.map((opt) => {
            const active = opt.id === value
            return (
              <button
                key={opt.id || 'empty'}
                type="button"
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-4 py-2.5 text-left text-sm touch-manipulation ${
                  active
                    ? 'bg-emerald-600/25 font-semibold text-emerald-200'
                    : 'text-zinc-200 active:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function NumInput({ value, onChange, label }) {
  const input = (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
      aria-label={label || undefined}
      className={label ? POKER_INFIELD_CONTROL : POKER_FIELD_CLASS}
    />
  )
  if (!label) return input
  return <InField label={label}>{input}</InField>
}

function MoneyInput({ value, onChange, colorize = false, label }) {
  const numVal = parseMoneyInputNumber(value)
  const hasValue = value !== '' && value !== '-'
  const textClass =
    colorize && hasValue
      ? numVal >= 0
        ? 'text-emerald-300'
        : 'text-red-300'
      : 'text-white'
  if (label) {
    return (
      <InField label={label}>
        <div className="relative">
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(formatMoneyInputValue(e.target.value))}
            aria-label={label}
            className={`w-full bg-transparent pl-4 outline-none ${textClass} text-sm font-semibold`}
          />
        </div>
      </InField>
    )
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(formatMoneyInputValue(e.target.value))}
        className={`w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 pr-4 outline-none focus:ring-2 focus:ring-cyan-500/40 ${textClass}`}
      />
    </div>
  )
}
