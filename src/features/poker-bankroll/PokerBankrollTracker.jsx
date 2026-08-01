import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Trophy } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_POKER_BANKROLL_SESSION_LIMIT } from '../billing/freemiumToolLimits.js'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { formatMoneyInputValue, parseMoneyInputNumber } from '../../utils/moneyInputFormat.js'
import { recordAppSessionRecorded } from '../../utils/appSectionVisitTracking.js'
import { fetchNearbyCasinos } from '../../utils/nearbyCasinos.js'
import PokerBankrollChartsTab from './PokerBankrollChartsTab.jsx'
import PokerBankrollHeroCarousel, { stakeHeroTheme } from './PokerBankrollHeroCarousel.jsx'
import PokerBankrollImportSheet from './PokerBankrollImportSheet.jsx'
import PokerBankrollOverview from './PokerBankrollOverview.jsx'
import PokerBankrollTrendTab from './PokerBankrollTrendTab.jsx'
import PokerCashGamePicker from './PokerCashGamePicker.jsx'
import PokerFieldMenu from './PokerFieldMenu.jsx'
import PokerLocationsTab from './PokerLocationsTab.jsx'
import {
  POKER_CURRENCIES,
  normalizePokerCurrency,
  resolveCurrencyFromGeolocation,
  currencyFromNearbyCasinoName,
  currencyFromOnlineSiteId,
} from './pokerCurrencies.js'
import {
  isMissingStableTableError,
  loadDealBankrollProfiles,
  loadMyStableDeals,
} from '../poker-stable/pokerStableApi.js'
import { PokerStablePlayerDealSheet } from '../poker-stable/PokerStableCreateDealSheet.jsx'
import {
  fmtPoker$,
  fmtPokerDuration,
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
  findCounterpartyBindSession,
  formatTournamentEventLabel,
  ensureTournamentEvent,
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
} from './pokerTournamentSwapApi.js'
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

/** Shared poker sheet chrome (content-sized unless tall class is added). */
const POKER_SHEET_PANEL_CLASS = `${APP_MODAL_SHEET_PANEL_CLASS} !max-h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`

/** Extra height for cash Start / Log / Edit (Game + Currency pickers need room). */
const POKER_SHEET_PANEL_TALL_CLASS =
  'min-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-1.25rem))]'

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

/**
 * Poker Bankroll Manager — separate from slots Bankroll.
 * Core start fields: type, table size, location, game (+ stake/tourney details).
 */
export default function PokerBankrollTracker({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  canCreatePokerBankrollSession = true,
  pokerBankrollSessionsRemaining = null,
  freemiumUsageLoading = false,
  onRequireSubscribeForPokerBankroll = null,
  onPokerBankrollSessionCreated = null,
  /** Deep link: open session details sheet for this id (swap result notify). */
  openSessionId = null,
  onOpenSessionConsumed = null,
  /** Deep link: switch to On Stake for this deal (Stable → Bankroll). */
  openStableDealId = null,
  onOpenStableDealConsumed = null,
}) {
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  /** All sessions for this user (personal + deal-scoped). */
  const [sessions, setSessions] = useState([])
  /** Active deals where I am the horse (stakee). */
  const [stakeeDeals, setStakeeDeals] = useState([])
  /** @type {Record<string, { deal_id: string, overall_bankroll: number }>} */
  const [dealProfiles, setDealProfiles] = useState({})
  /** @type {'personal' | string} personal or deal id */
  const [bankrollScope, setBankrollScope] = useState('personal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** Brief success copy after + Stake create (pending or active). */
  const [stakeNotice, setStakeNotice] = useState('')
  /** @type {null | 'session' | 'bankroll' | 'start' | 'end' | 'rebuy' | 'import' | 'swaps' | 'createStake'} */
  const [sheet, setSheet] = useState(null)
  const [stableSaving, setStableSaving] = useState(false)
  /** After + Stake, scroll carousel to this deal id once reload completes. */
  const pendingCarouselDealIdRef = useRef(null)
  const stakeNoticeTimerRef = useRef(0)
  /** @type {object[]} */
  const [draftSwaps, setDraftSwaps] = useState([])
  /**
   * Incoming swap Accept with no matching session yet → Start Session prefill,
   * then bind on submit (counterparty path; not a new creator draft).
   * @type {object | null}
   */
  const [incomingAcceptSwap, setIncomingAcceptSwap] = useState(null)
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
  /** @type {'overview' | 'details' | 'locations' | 'charts' | 'trend'} */
  const [activeTab, setActiveTab] = useState('overview')

  const isOnStake = bankrollScope !== 'personal'
  const activeDeal = useMemo(
    () => (isOnStake ? stakeeDeals.find((d) => d.id === bankrollScope) ?? null : null),
    [isOnStake, stakeeDeals, bankrollScope],
  )
  const stakeScopePending = activeDeal?.status === 'pending'
  const dealProfile = isOnStake ? dealProfiles[bankrollScope] ?? null : null

  /** Missing profile rows count as $0 so users can start without a setup step. */
  const overallBankroll = isOnStake
    ? dealProfile != null
      ? Number(dealProfile.overall_bankroll) || 0
      : 0
    : profile != null
      ? Number(profile.overall_bankroll) || 0
      : 0
  const hasBankrollProfile = isOnStake ? dealProfile != null : profile != null

  const scopedSessions = useMemo(() => {
    if (!isOnStake) return sessions.filter((s) => s.deal_id == null)
    return sessions.filter((s) => s.deal_id === bankrollScope)
  }, [sessions, isOnStake, bankrollScope])

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
          s.creator_session_id === activeSession?.id ||
          s.counterparty_session_id === activeSession?.id,
      ),
    [tournamentSwaps, activeSession?.id],
  )
  const editingSessionSwaps = useMemo(
    () =>
      editingId
        ? tournamentSwaps.filter(
            (s) => s.creator_session_id === editingId || s.counterparty_session_id === editingId,
          )
        : [],
    [tournamentSwaps, editingId],
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
    if (bankrollScope !== 'personal' && !stakeeDeals.some((d) => d.id === bankrollScope)) {
      setBankrollScope('personal')
    }
  }, [bankrollScope, stakeeDeals])

  useEffect(() => {
    if (!openStableDealId) return
    const deal = stakeeDeals.find((d) => d.id === openStableDealId && d.status === 'active')
    if (!deal) return
    setBankrollScope(openStableDealId)
    onOpenStableDealConsumed?.()
  }, [openStableDealId, stakeeDeals, onOpenStableDealConsumed])

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

  const loadData = useCallback(async () => {
    if (!supabaseClient || !userId) {
      setSessions([])
      setProfile(null)
      setStakeeDeals([])
      setDealProfiles({})
      setCustomVenues([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
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
        setDealProfiles({})
      } else {
        const mine = (dealsRes.deals || []).filter(
          (d) =>
            d.stakee_user_id === userId && (d.status === 'active' || d.status === 'pending'),
        )
        setStakeeDeals(mine)
        const { byDeal, error: rollErr } = await loadDealBankrollProfiles(
          supabaseClient,
          mine.filter((d) => d.status === 'active').map((d) => d.id),
        )
        if (rollErr && !isMissingStableTableError(rollErr)) {
          console.warn('[poker-bankroll] deal rolls load failed', rollErr.message)
        }
        setDealProfiles(byDeal)
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
            .select('id, display_name, venue_name, event_date, buy_in, game_variant, currency')
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
      setLoading(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
    openEdit(session)
    onOpenSessionConsumed?.()
    // openEdit is a stable-enough local opener; intentionally omit from deps.
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

  const filtered = useMemo(() => {
    return completedSessions.filter((s) => {
      if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
      if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
      return true
    })
  }, [completedSessions, typeFilter, venueFilter])

  /** Bankroll-card stats follow All/Cash/Tourney + Any/Live/Online filters. */
  const stats = useMemo(() => {
    let profit = 0
    let hours = 0
    let wins = 0
    let counted = 0
    for (const s of filtered) {
      const base = pokerSessionWinLoss(s)
      if (base == null) continue
      const wl = base + sessionSwapSettlementDelta(tournamentSwaps, s.id, userId)
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
  }, [filtered, tournamentSwaps, userId])

  /** Running bankroll after each filtered session (inferred start = current − filtered profit). */
  const bankrollSparkSeries = useMemo(() => {
    const ordered = [...filtered]
      .map((s) => {
        const base = pokerSessionWinLoss(s)
        return {
          at: s.end_at || s.start_at || null,
          wl:
            base == null
              ? null
              : base + sessionSwapSettlementDelta(tournamentSwaps, s.id, userId),
        }
      })
      .filter((x) => x.wl != null && x.at)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    if (ordered.length === 0 || overallBankroll == null) return []
    let run = Number(overallBankroll) - ordered.reduce((sum, x) => sum + x.wl, 0)
    const points = [run]
    for (const x of ordered) {
      run += x.wl
      points.push(run)
    }
    return points
  }, [filtered, overallBankroll, tournamentSwaps, userId])

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
        : sessions.filter((s) => s.deal_id == null)
      const scopeCompleted = scopeSessions.filter((s) => s.status !== 'active')
      const scopeFiltered = scopeCompleted.filter((s) => {
        if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
        if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
        return true
      })
      let profit = 0
      let hours = 0
      let wins = 0
      let counted = 0
      for (const s of scopeFiltered) {
        const base = pokerSessionWinLoss(s)
        if (base == null) continue
        const wl = base + sessionSwapSettlementDelta(tournamentSwaps, s.id, userId)
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
      const scopeRoll = onStake
        ? dealProfiles[scopeId] != null
          ? Number(dealProfiles[scopeId].overall_bankroll) || 0
          : scopeDeal?.status === 'pending'
            ? Number(scopeDeal.starting_roll ?? scopeDeal.baseline_bankroll) || 0
            : 0
        : profile != null
          ? Number(profile.overall_bankroll) || 0
          : 0
      const ordered = [...scopeFiltered]
        .map((s) => {
          const base = pokerSessionWinLoss(s)
          return {
            at: s.end_at || s.start_at || null,
            wl:
              base == null
                ? null
                : base + sessionSwapSettlementDelta(tournamentSwaps, s.id, userId),
          }
        })
        .filter((x) => x.wl != null && x.at)
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      let spark = []
      if (ordered.length > 0 && scopeRoll != null) {
        let run = Number(scopeRoll) - ordered.reduce((sum, x) => sum + x.wl, 0)
        const points = [run]
        for (const x of ordered) {
          run += x.wl
          points.push(run)
        }
        spark = points
      }
      return {
        stats: scopeStats,
        spark,
        overallBankroll: scopeRoll,
        deal: scopeDeal,
      }
    }
    /** @type {Record<string, ReturnType<typeof buildScopeHero>>} */
    const map = { personal: buildScopeHero('personal') }
    for (const d of stakeeDeals) map[d.id] = buildScopeHero(d.id)
    return map
  }, [
    sessions,
    stakeeDeals,
    dealProfiles,
    profile,
    typeFilter,
    venueFilter,
    tournamentSwaps,
    userId,
  ])

  useEffect(() => {
    const pendingId = pendingCarouselDealIdRef.current
    if (!pendingId) return
    if (stakeeDeals.some((d) => d.id === pendingId)) {
      setBankrollScope(pendingId)
      pendingCarouselDealIdRef.current = null
    }
  }, [stakeeDeals])

  function showStakeNotice(message) {
    setStakeNotice(message)
    if (stakeNoticeTimerRef.current) window.clearTimeout(stakeNoticeTimerRef.current)
    stakeNoticeTimerRef.current = window.setTimeout(() => {
      stakeNoticeTimerRef.current = 0
      setStakeNotice('')
    }, 6500)
  }

  useEffect(
    () => () => {
      if (stakeNoticeTimerRef.current) window.clearTimeout(stakeNoticeTimerRef.current)
    },
    [],
  )

  function openSetBankroll(scopeId = bankrollScope) {
    const onStake = scopeId !== 'personal'
    if (scopeId !== bankrollScope) setBankrollScope(scopeId)
    if (onStake) {
      const deal = stakeeDeals.find((d) => d.id === scopeId)
      if (deal?.status === 'pending') {
        setError('Bankroll unlocks when backers accept this stake.')
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
  async function attachDraftSwapsToSession(sessionRow, drafts) {
    if (!supabaseClient || !userId || !sessionRow?.id) return
    if (sessionRow.session_type !== 'tournament' || !drafts?.length) return

    let tournamentEventId = sessionRow.tournament_event_id || null
    if (!tournamentEventId) {
      const eventDate = localYmd(new Date(sessionRow.start_at))
      const eventInput = {
        venue_name: sessionRow.venue_name || '',
        event_date: eventDate,
        buy_in: Number(sessionRow.buy_in) || 0,
        game_variant: sessionRow.game_variant || null,
        currency: sessionRow.currency || 'USD',
        display_name: sessionRow.tournament_name || null,
      }
      let eventRes = await ensureTournamentEvent(supabaseClient, userId, eventInput)
      if (eventRes.needsConfirm && eventRes.existing) {
        const same = window.confirm(
          `Looks like you’re in “${eventRes.existing.display_name || eventRes.existing.venue_name}” (same venue/date/buy-in/game). Same event?\n\nOK = same event · Cancel = different event`,
        )
        eventRes = await ensureTournamentEvent(supabaseClient, userId, {
          ...eventInput,
          confirmSameEvent: same,
          forceSibling: !same,
        })
      }
      if (eventRes.error) {
        console.warn('[poker-bankroll] event link failed', eventRes.error.message)
      } else if (eventRes.event?.id) {
        tournamentEventId = eventRes.event.id
        const { error: linkErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .update({ tournament_event_id: tournamentEventId })
          .eq('id', sessionRow.id)
          .eq('user_id', userId)
        if (linkErr) console.warn('[poker-bankroll] session event link failed', linkErr.message)
      }
    }

    const { swaps, error: swapErr } = await persistDraftSwapsForSession(
      supabaseClient,
      userId,
      sessionRow.id,
      drafts,
      tournamentEventId,
      sessionRow,
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
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
    if (stakeScopePending) {
      setError('Waiting for backers to accept before you can start sessions.')
      return
    }
    if (activeSession) {
      setError('You already have a session in progress.')
      return
    }
    setNearbyCasinos([])
    setDraftSwaps([])
    setIncomingAcceptSwap(null)
    setForm(
      formWithDefaultCashGame(
        emptyForm(),
        buildCashGamePresetsFromSessions(scopedSessions, 'live'),
      ),
    )
    setError('')
    setSheet('start')
    triggerTapHapticLight()
    applyGeoCurrencyDefault()
    void fetchNearby((name) => setForm((f) => patchLiveVenueFromGps(f, name)))
  }

  /** Start Session prefilled from an incoming soft-event swap (no matching session yet). */
  function openStartForIncomingSwap(swap) {
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
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
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
    if (stakeScopePending) {
      setError('Waiting for backers to accept before you can log sessions.')
      return
    }
    setEditingId(null)
    setEditingPrevWl(0)
    setNearbyCasinos([])
    setDraftSwaps([])
    setForm(
      formWithDefaultCashGame(
        emptyForm(),
        buildCashGamePresetsFromSessions(scopedSessions, 'live'),
      ),
    )
    setError('')
    setSheet('session')
    triggerTapHapticLight()
    applyGeoCurrencyDefault()
    void fetchNearby((name) => setForm((f) => patchLiveVenueFromGps(f, name)))
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
  async function acceptIncomingSwap(swap) {
    if (!supabaseClient || !userId || !swap?.id) return
    const session = findCounterpartyBindSession(swap, scopedSessions)
    if (session) {
      setSaving(true)
      setError('')
      try {
        const { error } = await acceptCounterpartySessionBind(
          supabaseClient,
          swap.id,
          session.id,
          session,
        )
        if (error) throw error
        await loadData()
      } catch (e) {
        setError(e?.message || 'Could not attach swap.')
      } finally {
        setSaving(false)
      }
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
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
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
      if (payload.session_type === 'tournament' && incomingAcceptSwap?.id) {
        const { error: bindErr } = await acceptCounterpartySessionBind(
          supabaseClient,
          incomingAcceptSwap.id,
          created.id,
          created,
        )
        if (bindErr) throw bindErr
      }
      if (payload.session_type === 'tournament' && draftSwaps.length > 0) {
        await attachDraftSwapsToSession(created, draftSwaps)
      }
      setIncomingAcceptSwap(null)
      onPokerBankrollSessionCreated?.()
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not start session.')
    } finally {
      setSaving(false)
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
    setSaving(true)
    setError('')
    try {
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
          ...activeSession,
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
      setSheet(null)
      triggerTapHapticLight()
      await loadData()
    } catch (e) {
      setError(e?.message || 'Could not end session.')
    } finally {
      setSaving(false)
    }
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
      tournament_event_pick: session.tournament_event_id || '',
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
        if (!editingActiveSession && newWl != null) {
          await applyBankrollDelta(newWl - editingPrevWl)
        }
        if (payload.session_type === 'tournament') {
          if (draftSwaps.length > 0) {
            await attachDraftSwapsToSession(updated, draftSwaps)
          }
          if (!editingActiveSession) {
            const syncA = await syncCreatorResultsForSession(
              supabaseClient,
              editingId,
              updated,
            )
            if (syncA.error && !isMissingTournamentSwapTableError(syncA.error)) {
              console.warn('[poker-bankroll] swap creator sync failed', syncA.error.message)
            }
            const syncB = await syncCounterpartyResultsForSession(
              supabaseClient,
              editingId,
              updated,
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
        if (!canCreatePokerBankrollSession) {
          onRequireSubscribeForPokerBankroll?.()
          return
        }
        const { data: created, error: iErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .insert(payload)
          .select('*')
          .single()
        if (iErr) throw iErr
        await applyBankrollDelta(newWl)
        if (payload.session_type === 'tournament' && draftSwaps.length > 0) {
          await attachDraftSwapsToSession(created, draftSwaps)
        }
        void recordAppSessionRecorded(supabaseClient, 'poker-bankroll', payload.session_type)
        onPokerBankrollSessionCreated?.()
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
      const { error: dErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .delete()
        .eq('id', editingId)
        .eq('user_id', userId)
      if (dErr) throw dErr
      await applyBankrollDelta(-editingPrevWl)
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
        <FreemiumUsageCounter
          remaining={pokerBankrollSessionsRemaining}
          limit={FREE_POKER_BANKROLL_SESSION_LIMIT}
          itemLabelPlural="poker sessions"
          loading={freemiumUsageLoading}
        />

        {/* Pills: OVERVIEW · DETAILS · TREND · LOCATIONS · CHARTS */}
        <div className="mb-5 -mx-3 flex gap-1 overflow-x-auto px-3 no-scrollbar">
          {[
            { id: 'overview', label: 'OVERVIEW' },
            { id: 'details', label: 'DETAILS' },
            { id: 'trend', label: 'TREND' },
            { id: 'locations', label: 'LOCATIONS' },
            { id: 'charts', label: 'CHARTS' },
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
              onActiveIdChange={setBankrollScope}
              renderSlide={(slide, slideIndex) => {
                const scopeId = slide.id
                const onStake = scopeId !== 'personal'
                const hero = heroByScope[scopeId] || heroByScope.personal
                const theme = onStake ? stakeHeroTheme(Math.max(0, slideIndex - 1)) : null
                return (
                  <div
                    data-elevated-card={onStake ? 'accent' : 'surface'}
                    className={
                      onStake
                        ? theme.card
                        : 'rounded-3xl border border-zinc-700/40 bg-gradient-to-br from-zinc-900 to-zinc-800 p-6'
                    }
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${
                            onStake ? theme.label : 'text-zinc-400'
                          }`}
                        >
                          {onStake ? 'Stake bankroll' : 'Poker bankroll'}
                        </div>
                        {onStake ? (
                          <>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                hero.deal?.status === 'pending'
                                  ? 'bg-zinc-500/40 text-zinc-200'
                                  : theme.badge
                              }`}
                            >
                              {hero.deal?.status === 'pending' ? 'Pending' : 'On stake'}
                            </span>
                            {hero.deal?.label ? (
                              <span className={`truncate text-[11px] font-semibold ${theme.badgeText}`}>
                                {hero.deal.label}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!onStake ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setStakeNotice('')
                              setSheet('createStake')
                              triggerTapHapticLight()
                            }}
                            className="rounded-xl bg-cyan-600/90 px-3 py-1.5 text-xs font-bold text-white touch-manipulation active:bg-cyan-500"
                          >
                            + Stake
                          </button>
                        ) : null}
                        {!onStake || hero.deal?.status !== 'pending' ? (
                          <button
                            type="button"
                            onClick={() => openSetBankroll(scopeId)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold touch-manipulation ${
                              onStake
                                ? theme.editBtn
                                : 'bg-zinc-700/60 text-zinc-300 active:bg-zinc-600'
                            }`}
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {loading ? (
                      <div className="h-12 w-48 animate-pulse rounded-xl bg-zinc-700/40" />
                    ) : (
                      <>
                        <div
                          className={`text-5xl font-black tracking-tight ${
                            onStake ? theme.amount : 'text-white'
                          }`}
                        >
                          {fmtPoker$(hero.overallBankroll)}
                        </div>
                        <div className="mt-3 h-10 w-full">
                          {hero.spark.length >= 2 ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (scopeId !== bankrollScope) setBankrollScope(scopeId)
                                setActiveTab('trend')
                              }}
                              className="block h-full w-full touch-manipulation active:opacity-80"
                              aria-label="Open Trend chart"
                            >
                              <BankrollSparkline
                                series={hero.spark}
                                className="h-full w-full"
                                upClass={onStake ? theme.sparkUp : 'text-emerald-400'}
                                downClass={onStake ? theme.sparkDown : 'text-rose-400'}
                              />
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                    {!loading ? (
                      <div
                        className={`mt-5 grid grid-cols-4 gap-2 border-t pt-4 ${
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
                data-elevated-card="accent"
                role="button"
                tabIndex={0}
                onClick={() => openEdit(activeSession)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openEdit(activeSession)
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
                      !canCreatePokerBankrollSession || stakeScopePending ? 'true' : undefined
                    }
                    className={`w-full rounded-3xl bg-emerald-600 py-4 text-base font-bold text-white touch-manipulation active:bg-emerald-500 ${
                      !canCreatePokerBankrollSession || stakeScopePending
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
                      !canCreatePokerBankrollSession || stakeScopePending ? 'true' : undefined
                    }
                    className={`w-full rounded-2xl py-3 text-sm font-semibold text-zinc-400 touch-manipulation active:text-zinc-200 ${
                      !canCreatePokerBankrollSession || stakeScopePending
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
                  Accept attaches to your matching session, or opens Start with the swap ready.
                </p>
                <ul className="space-y-2">
                  {pendingCounterpartySwaps.map((swap) => {
                    const other = swapOtherPartyLabel(swap, swapProfilesById, userId)
                    const eventLabel = formatTournamentEventLabel(
                      swapEventsById[swap.tournament_event_id],
                    )
                    const canBind = Boolean(findCounterpartyBindSession(swap, scopedSessions))
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
            ) : filtered.length === 0 ? (
              <div
                data-elevated-card="surface"
                className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center"
              >
                <p className="text-white font-semibold">No poker sessions yet</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {stakeScopePending
                    ? 'Backers must accept before you can log stake sessions.'
                    : isOnStake
                      ? 'Start or log a stake session for this deal.'
                      : 'Start a live session, or log one from earlier.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((session) => {
                  const baseWl = pokerSessionWinLoss(session)
                  const swapDelta = sessionSwapSettlementDelta(
                    tournamentSwaps,
                    session.id,
                    userId,
                  )
                  const wl = baseWl == null ? null : baseWl + swapDelta
                  const hrs = pokerSessionDurationHours(session)
                  const hourly = wl != null && hrs >= 0.02 ? wl / hrs : null
                  const bbh = pokerSessionBbPerHour(session)
                  const sessionSwaps = swapsBySessionId[session.id] || []
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => openEdit(session)}
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
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-semibold text-white">
                              {pokerSessionStakesLabel(session)}
                            </span>
                            <span
                              className={`shrink-0 font-bold tabular-nums ${
                                wl == null
                                  ? 'text-zinc-500'
                                  : wl >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                              }`}
                            >
                              {wl == null ? '-' : fmtPoker$(wl)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-zinc-500">
                            {pokerSessionMetaLine(session)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-zinc-600">
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

        {activeTab === 'locations' ? (
          <PokerLocationsTab
            sessions={completedSessions}
            loading={loading}
            onEditSession={openEdit}
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
              sessions={completedSessions}
              initialBankroll={overallBankroll}
            />
          )
        ) : null}
        </div>
      </ScrollLinkedEdgeTitleBarShell>

      {sheet === 'createStake' && supabaseClient && userId ? (
        <PokerStablePlayerDealSheet
          supabaseClient={supabaseClient}
          userId={userId}
          saving={stableSaving}
          onSavingChange={setStableSaving}
          onClose={() => setSheet(null)}
          onCreated={(deal) => {
            if (deal?.id) {
              pendingCarouselDealIdRef.current = deal.id
              if (deal.status === 'pending') {
                showStakeNotice(
                  'Stake request sent. Backers will see invites in Stable ... sessions unlock when they accept.',
                )
              } else {
                showStakeNotice('Stake created. Swipe to your stake bankroll card to get started.')
              }
            }
            void loadData()
          }}
          onError={setError}
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
                {editingActiveSession
                  ? 'Session details'
                  : editingId
                    ? 'Edit session'
                    : 'Log previous session'}
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
              enabled={form.session_type === 'tournament'}
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

/** Tiny SVG bankroll trajectory. */
function BankrollSparkline({
  series,
  className = '',
  upClass = 'text-emerald-400',
  downClass = 'text-rose-400',
}) {
  if (!series || series.length < 2) return null
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const padY = 4
  const h = 40
  const w = 100
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w
      const y = padY + (1 - (v - min) / span) * (h - padY * 2)
      return `${x},${y}`
    })
    .join(' ')
  const up = series[series.length - 1] >= series[0]
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`${className} ${up ? upClass : downClass}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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

  // Default to closest catalog row (already distance-sorted) instead of blank "Select tournament…".
  useLayoutEffect(() => {
    if (!showSoftTournamentPicker || !softEventsReady || !softEvents.length) return
    if (form.venue_kind === 'online' && !String(form.online_site_pick || '').trim()) return
    const pick = String(form.tournament_event_pick || '')
    if (pick === POKER_TOURNAMENT_MANUAL_PICK_ID) return
    if (
      isSoftTournamentEventPick(pick) &&
      softEvents.some((e) => String(e.id) === pick)
    ) {
      return
    }
    setField('soft_tournament_event', softEvents[0])
  }, [
    showSoftTournamentPicker,
    softEventsReady,
    softEvents,
    form.tournament_event_pick,
    form.venue_kind,
    form.online_site_pick,
    setField,
  ])

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
