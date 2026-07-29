import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Trophy } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_POKER_BANKROLL_SESSION_LIMIT } from '../billing/freemiumToolLimits.js'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fetchNearbyCasinos } from '../../utils/nearbyCasinos.js'
import PokerBankrollChartsTab from './PokerBankrollChartsTab.jsx'
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
} from './pokerCurrencies.js'
import {
  isMissingStableTableError,
  loadDealBankrollProfiles,
  loadMyStableDeals,
} from '../poker-stable/pokerStableApi.js'
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
  lastOnlineSiteFromSessions,
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

/** Match CasinoAutocomplete / Location field text styling. */
const POKER_FIELD_CLASS =
  'w-full h-12 min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40'

/** Shared poker sheet chrome (content-sized unless tall class is added). */
const POKER_SHEET_PANEL_CLASS = `${APP_MODAL_SHEET_PANEL_CLASS} !max-h-[min(96dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.75rem))] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`

/** Extra height for cash Start / Log / Edit (Game + Currency pickers need room). */
const POKER_SHEET_PANEL_TALL_CLASS =
  'min-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)-1.25rem))]'

/** @param {object} form */
function pokerSessionSheetNeedsTall(form) {
  return form?.session_type === 'cash'
}

/** Online multi-tabling count for DB write; live always 1. */
function tablesCountForPayload(form) {
  if (form.venue_kind !== 'online') return 1
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
  /** @type {null | 'session' | 'bankroll' | 'start' | 'end' | 'rebuy' | 'import'} */
  const [sheet, setSheet] = useState(null)
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
  const dealProfile = isOnStake ? dealProfiles[bankrollScope] ?? null : null

  const overallBankroll = isOnStake
    ? dealProfile != null
      ? Number(dealProfile.overall_bankroll)
      : null
    : profile
      ? Number(profile.overall_bankroll)
      : null
  const hasBankrollProfile = isOnStake ? dealProfile != null : profile != null

  const scopedSessions = useMemo(() => {
    if (!isOnStake) return sessions.filter((s) => s.deal_id == null)
    return sessions.filter((s) => s.deal_id === bankrollScope)
  }, [sessions, isOnStake, bankrollScope])

  const activeSession = useMemo(
    () => scopedSessions.find((s) => s.status === 'active') ?? null,
    [scopedSessions],
  )
  const completedSessions = useMemo(
    () => scopedSessions.filter((s) => s.status !== 'active'),
    [scopedSessions],
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
          (d) => d.stakee_user_id === userId && d.status === 'active',
        )
        setStakeeDeals(mine)
        const { byDeal, error: rollErr } = await loadDealBankrollProfiles(
          supabaseClient,
          mine.map((d) => d.id),
        )
        if (rollErr && !isMissingStableTableError(rollErr)) {
          console.warn('[poker-bankroll] deal rolls load failed', rollErr.message)
        }
        setDealProfiles(byDeal)
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

  const fetchNearby = useCallback(async (onNearest) => {
    await fetchNearbyCasinos(supabaseClient, {
      cacheRef: casinoCoordCacheRef,
      userId,
      onLoading: setGpsLoading,
      onNearby: setNearbyCasinos,
      onNearest,
    })
  }, [supabaseClient, userId])

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
        throw new Error('Pick an On Stake deal first.')
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
      const wl = pokerSessionWinLoss(s)
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
  }, [filtered])

  /** Running bankroll after each completed session (inferred start = current − lifetime profit). */
  const bankrollSparkSeries = useMemo(() => {
    const ordered = [...completedSessions]
      .map((s) => ({
        at: s.end_at || s.start_at || null,
        wl: pokerSessionWinLoss(s),
      }))
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
  }, [completedSessions, overallBankroll])

  function openSetBankroll() {
    if (isOnStake) {
      setBankrollInput(dealProfile != null ? String(dealProfile.overall_bankroll) : '')
    } else {
      setBankrollInput(profile != null ? String(profile.overall_bankroll) : '')
    }
    setError('')
    setSheet('bankroll')
    triggerTapHapticLight()
  }

  async function saveBankroll() {
    const val = parseFloat(bankrollInput)
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

  function openStartSession() {
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
    if (activeSession) {
      setError('You already have a session in progress.')
      return
    }
    setNearbyCasinos([])
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
    void fetchNearby((name) => setForm((f) => (f.venue_kind === 'live' && !f.venue_name ? { ...f, venue_name: name } : f)))
  }

  function openLogPast() {
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
    setEditingId(null)
    setEditingPrevWl(0)
    setNearbyCasinos([])
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
    void fetchNearby((name) => setForm((f) => (f.venue_kind === 'live' && !f.venue_name ? { ...f, venue_name: name } : f)))
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
    const add = parseFloat(rebuyAmount)
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
    const buyIn = parseFloat(form.buy_in)
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
        ? parseFloat(form.rebuy_amount)
        : 0
    const addonAmt =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseFloat(form.addon_amount)
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
    if (isOnStake && !hasBankrollProfile) {
      setError('Set your On Stake starting bankroll first.')
      return
    }
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
          ? parseFloat(form.small_blind)
          : null,
      big_blind:
        form.session_type === 'cash' && form.big_blind !== '' ? parseFloat(form.big_blind) : null,
      third_blind:
        form.session_type === 'cash' && form.third_blind !== ''
          ? parseFloat(form.third_blind)
          : null,
      ante: form.session_type === 'cash' && form.ante !== '' ? parseFloat(form.ante) : null,
      tournament_name:
        form.session_type === 'tournament' ? form.tournament_name.trim() || null : null,
      field_size:
        form.session_type === 'tournament' && form.field_size !== ''
          ? parseInt(form.field_size, 10)
          : null,
      start_stack:
        form.session_type === 'tournament' && form.start_stack !== ''
          ? parseFloat(form.start_stack)
          : null,
      finish_place: null,
      bounty_winnings: null,
      reentries: null,
      notes: null,
    }
    setSaving(true)
    setError('')
    try {
      const { error: iErr } = await supabaseClient.from('poker_bankroll_sessions').insert(payload)
      if (iErr) throw iErr
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
    const cashOut = parseFloat(endCashOut)
    if (!Number.isFinite(cashOut) || cashOut < 0) {
      setError('Enter cash out (what you walked with).')
      return
    }
    const bounties =
      activeSession.session_type === 'tournament' && endBounties !== ''
        ? parseFloat(endBounties) || 0
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
              ? parseFloat(endBounties)
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
      buy_in: session.buy_in != null ? String(session.buy_in) : '',
      rebuy_amount: session.rebuy_amount != null ? String(session.rebuy_amount) : '',
      addon_amount: session.addon_amount != null ? String(session.addon_amount) : '',
      cash_out: session.cash_out != null ? String(session.cash_out) : '',
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
      small_blind: session.small_blind != null ? String(session.small_blind) : '',
      big_blind: session.big_blind != null ? String(session.big_blind) : '',
      third_blind: session.third_blind != null ? String(session.third_blind) : '',
      ante: session.ante != null ? String(session.ante) : '',
      tournament_name: session.tournament_name || '',
      field_size: session.field_size != null ? String(session.field_size) : '',
      start_stack: session.start_stack != null ? String(session.start_stack) : '',
      finish_place: session.finish_place != null ? String(session.finish_place) : '',
      bounty_winnings: session.bounty_winnings != null ? String(session.bounty_winnings) : '',
      reentries: session.reentries != null ? String(session.reentries) : '',
      notes: session.notes || '',
    })
    setError('')
    setSheet('session')
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
      let next = { ...prev, [key]: value }
      if (key === 'session_type' && value !== prev.session_type) {
        next.game_variant = coercePokerGameForSessionType(value, prev.game_variant)
        if (value === 'cash') {
          next = formWithDefaultCashGame(
            {
              ...next,
              game_variant: 'custom',
              live_game_name_pick: 'holdem',
              game_custom_name: "Hold'em",
            },
            cashGamePresets,
          )
        } else {
          next.cash_game_pick = POKER_CASH_NEW_GAME_ID
          if (next.game_variant !== 'custom') next.game_custom_name = ''
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
        if (value === 'live') {
          next.venue_name = ''
          void fetchNearby((name) => {
            setForm((f) =>
              f.venue_kind === 'live' && !String(f.venue_name || '').trim()
                ? { ...f, venue_name: name }
                : f,
            )
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
          const last = lastOnlineSiteFromSessions(completedSessions)
          if (last) {
            next.venue_name = last.venue_name
            next.online_site_pick = last.online_site_pick
          } else {
            next.venue_name = ''
            next.online_site_pick = ''
          }
        }
        if (next.session_type === 'cash') {
          const venuePresets = buildCashGamePresetsFromSessions(scopedSessions, value)
          next = formWithDefaultCashGame(next, venuePresets)
        }
      }
      if (key === 'online_site_pick') {
        next.online_site_pick = value || ''
        next.venue_name = value ? pokerOnlineSiteLabelFromId(value) : ''
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

  async function saveSession() {
    if (!supabaseClient || !userId) return
    const buyIn = parseFloat(form.buy_in)
    const cashOut = parseFloat(form.cash_out)
    if (!Number.isFinite(buyIn) || buyIn < 0) {
      setError('Enter a valid buy-in / bring-in amount.')
      return
    }
    const rebuyAmt =
      form.session_type === 'tournament' && form.rebuy_amount !== ''
        ? parseFloat(form.rebuy_amount)
        : 0
    const addonAmt =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseFloat(form.addon_amount)
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
    if (!Number.isFinite(cashOut)) {
      setError('Enter cash out (what you walked with).')
      return
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
    if (durationHrs <= 0) {
      setError('Enter hours played.')
      return
    }
    const startAt = localDateTimeToIso(form.date, form.start_time)
    const endAt = new Date(new Date(startAt).getTime() + durationHrs * 3_600_000).toISOString()

    if (isOnStake && !hasBankrollProfile && !editingId) {
      setError('Set your On Stake starting bankroll first.')
      return
    }
    const payload = {
      user_id: userId,
      deal_id: editingId
        ? undefined
        : scopeDealIdForWrite(),
      venue_name: form.venue_name.trim() || null,
      venue_kind: form.venue_kind,
      currency: normalizePokerCurrency(form.currency),
      session_type: form.session_type,
      status: 'completed',
      start_at: startAt,
      end_at: endAt,
      buy_in: buyIn,
      rebuy_amount: form.session_type === 'tournament' ? rebuyAmt || 0 : 0,
      addon_amount: form.session_type === 'tournament' ? addonAmt || 0 : 0,
      cash_out: cashOut,
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
          ? parseFloat(form.small_blind)
          : null,
      big_blind:
        form.session_type === 'cash' && form.big_blind !== ''
          ? parseFloat(form.big_blind)
          : null,
      third_blind:
        form.session_type === 'cash' && form.third_blind !== ''
          ? parseFloat(form.third_blind)
          : null,
      ante: form.session_type === 'cash' && form.ante !== '' ? parseFloat(form.ante) : null,
      tournament_name:
        form.session_type === 'tournament' ? form.tournament_name.trim() || null : null,
      field_size:
        form.session_type === 'tournament' && form.field_size !== ''
          ? parseInt(form.field_size, 10)
          : null,
      start_stack:
        form.session_type === 'tournament' && form.start_stack !== ''
          ? parseFloat(form.start_stack)
          : null,
      finish_place:
        form.session_type === 'tournament' && form.finish_place !== ''
          ? parseInt(form.finish_place, 10)
          : null,
      bounty_winnings:
        form.session_type === 'tournament' && form.bounty_winnings !== ''
          ? parseFloat(form.bounty_winnings)
          : null,
      reentries:
        form.session_type === 'tournament' && form.reentries !== ''
          ? parseInt(form.reentries, 10)
          : null,
      notes: form.notes.trim() || null,
    }
    if (payload.deal_id === undefined) delete payload.deal_id

    const newWl = pokerSessionWinLoss({
      buy_in: buyIn,
      rebuy_amount: payload.rebuy_amount,
      addon_amount: payload.addon_amount,
      cash_out: cashOut,
      bounty_winnings:
        form.session_type === 'tournament' && form.bounty_winnings !== ''
          ? parseFloat(form.bounty_winnings) || 0
          : 0,
    })

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const { error: uErr } = await supabaseClient
          .from('poker_bankroll_sessions')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', userId)
        if (uErr) throw uErr
        await applyBankrollDelta(newWl - editingPrevWl)
      } else {
        if (!canCreatePokerBankrollSession) {
          onRequireSubscribeForPokerBankroll?.()
          return
        }
        const { error: iErr } = await supabaseClient.from('poker_bankroll_sessions').insert(payload)
        if (iErr) throw iErr
        await applyBankrollDelta(newWl)
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

  const previewWl = (() => {
    const buyIn = parseFloat(form.buy_in)
    const cashOut = parseFloat(form.cash_out)
    const bounties = parseFloat(form.bounty_winnings) || 0
    if (!Number.isFinite(buyIn) || !Number.isFinite(cashOut)) return null
    const rebuy =
      form.session_type === 'tournament' && form.rebuy_amount !== ''
        ? parseFloat(form.rebuy_amount) || 0
        : 0
    const addon =
      form.session_type === 'tournament' && form.addon_amount !== ''
        ? parseFloat(form.addon_amount) || 0
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

        {/* Personal ↔ On Stake (per-deal) — same screen, different data */}
        {stakeeDeals.length > 0 ? (
          <div className="mb-4">
            <div className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setBankrollScope('personal')}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold tracking-wide touch-manipulation transition-colors ${
                  !isOnStake
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 active:text-zinc-300'
                }`}
              >
                Personal
              </button>
              <button
                type="button"
                onClick={() => {
                  const first = stakeeDeals[0]
                  if (first) setBankrollScope(first.id)
                }}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold tracking-wide touch-manipulation transition-colors ${
                  isOnStake
                    ? 'bg-amber-600 text-white shadow-inner shadow-amber-900/40'
                    : 'text-zinc-500 active:text-zinc-300'
                }`}
              >
                On Stake
              </button>
            </div>
            {isOnStake && stakeeDeals.length > 1 ? (
              <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                {stakeeDeals.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setBankrollScope(d.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold touch-manipulation ${
                      bankrollScope === d.id
                        ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {d.label || 'Deal'}
                  </button>
                ))}
              </div>
            ) : null}
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
            {/* Bankroll hero — personal (zinc) vs On Stake (amber, hard to miss) */}
            <div
              data-elevated-card={isOnStake ? 'accent' : 'surface'}
              className={
                isOnStake
                  ? 'mb-4 rounded-3xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-950 via-amber-900/80 to-zinc-950 p-6 shadow-[0_0_40px_-12px_rgba(251,191,36,0.55)]'
                  : 'mb-4 rounded-3xl border border-zinc-700/40 bg-gradient-to-br from-zinc-900 to-zinc-800 p-6'
              }
            >
              {isOnStake ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-950">
                    On stake
                  </span>
                  <span className="truncate text-xs font-semibold text-amber-200/90">
                    {activeDeal?.label || 'Stake deal'}
                  </span>
                </div>
              ) : null}
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isOnStake ? 'text-amber-200/70' : 'text-zinc-400'
                  }`}
                >
                  {isOnStake ? 'On Stake bankroll' : 'Poker bankroll'}
                </div>
                {hasBankrollProfile ? (
                  <button
                    type="button"
                    onClick={openSetBankroll}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold touch-manipulation ${
                      isOnStake
                        ? 'bg-amber-500/25 text-amber-100 active:bg-amber-500/40'
                        : 'bg-zinc-700/60 text-zinc-300 active:bg-zinc-600'
                    }`}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              {loading ? (
                <div className="h-12 w-48 animate-pulse rounded-xl bg-zinc-700/40" />
              ) : hasBankrollProfile ? (
                <>
                  <div
                    className={`text-5xl font-black tracking-tight ${
                      isOnStake ? 'text-amber-50' : 'text-white'
                    }`}
                  >
                    {fmtPoker$(overallBankroll)}
                  </div>
                  {bankrollSparkSeries.length >= 2 ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('trend')}
                      className="mt-3 block w-full touch-manipulation active:opacity-80"
                      aria-label="Open Trend chart"
                    >
                      <BankrollSparkline
                        series={bankrollSparkSeries}
                        className="h-10 w-full"
                        upClass={isOnStake ? 'text-amber-400' : 'text-emerald-400'}
                        downClass={isOnStake ? 'text-amber-500' : 'text-rose-400'}
                      />
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={openSetBankroll}
                  className={`mt-1 text-sm font-semibold touch-manipulation ${
                    isOnStake ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                >
                  {isOnStake
                    ? '+ Set On Stake starting bankroll'
                    : '+ Set your starting bankroll'}
                </button>
              )}
              {hasBankrollProfile && !loading ? (
                <div
                  className={`mt-5 grid grid-cols-4 gap-2 border-t pt-4 ${
                    isOnStake ? 'border-amber-400/25' : 'border-zinc-700/40'
                  }`}
                >
                  <BankrollStat
                    label="Profit"
                    value={fmtPoker$(stats.profit)}
                    tone={stats.profit >= 0 ? 'good' : 'bad'}
                  />
                  <BankrollStat
                    label="Hourly"
                    value={stats.hourly == null ? '-' : fmtPoker$(stats.hourly)}
                    tone={stats.hourly == null ? 'neutral' : stats.hourly >= 0 ? 'good' : 'bad'}
                  />
                  <BankrollStat label="Hours" value={stats.hours.toFixed(1)} />
                  <BankrollStat
                    label="Win rate"
                    value={stats.winRate == null ? '-' : `${stats.winRate}%`}
                  />
                </div>
              ) : null}
            </div>

            {activeSession ? (
              <div
                data-session-card
                data-elevated-card="accent"
                className="mb-4 rounded-3xl border border-emerald-500/30 bg-emerald-950/60 p-5"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                    Session in progress
                  </span>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold leading-tight text-white">
                      {pokerSessionStakesLabel(activeSession)}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-zinc-400">
                      {pokerSessionMetaLine(activeSession)}
                    </div>
                    <div className="mt-0.5 text-sm text-zinc-400">
                      {pokerSessionInForLine(activeSession)}
                    </div>
                    <div className="mt-2 text-3xl font-black tabular-nums text-emerald-200">
                      {fmtPokerDuration(elapsed)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openRebuy('rebuy')}
                      className="rounded-2xl border border-emerald-400/40 bg-emerald-950/80 px-4 py-2.5 text-sm font-bold text-emerald-200 touch-manipulation active:bg-emerald-900"
                    >
                      {activeSession.session_type === 'tournament' ? 'Re-enter' : 'Re-buy'}
                    </button>
                    {activeSession.session_type === 'tournament' ? (
                      <button
                        type="button"
                        onClick={() => openRebuy('addon')}
                        className="rounded-2xl border border-emerald-400/40 bg-emerald-950/80 px-4 py-2.5 text-sm font-bold text-emerald-200 touch-manipulation active:bg-emerald-900"
                      >
                        Add-on
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={openEndSession}
                      className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-600"
                    >
                      End Session
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              !loading &&
              hasBankrollProfile && (
                <div className="mb-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={openStartSession}
                    data-start-session-btn
                    data-start-session-locked={!canCreatePokerBankrollSession ? 'true' : undefined}
                    className={`w-full rounded-3xl bg-emerald-600 py-4 text-base font-bold text-white touch-manipulation active:bg-emerald-500 ${
                      !canCreatePokerBankrollSession ? 'cursor-not-allowed opacity-45' : ''
                    }`}
                  >
                    + Start Session
                  </button>
                  <button
                    type="button"
                    onClick={openLogPast}
                    data-log-past-session-btn
                    data-log-past-session-locked={!canCreatePokerBankrollSession ? 'true' : undefined}
                    className={`w-full rounded-2xl py-3 text-sm font-semibold text-zinc-400 touch-manipulation active:text-zinc-200 ${
                      !canCreatePokerBankrollSession ? 'cursor-not-allowed opacity-45' : ''
                    }`}
                  >
                    Log previous session(s)
                  </button>
                </div>
              )
            )}

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
                  {hasBankrollProfile
                    ? isOnStake
                      ? 'Start or log an On Stake session for this deal.'
                      : 'Start a live session, or log one from earlier.'
                    : isOnStake
                      ? 'Set your On Stake bankroll to get started.'
                      : 'Set your poker bankroll to get started.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((session) => {
                  const wl = pokerSessionWinLoss(session)
                  const hourly = pokerSessionHourly(session)
                  const bbh = pokerSessionBbPerHour(session)
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
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
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
              initialBankroll={hasBankrollProfile ? overallBankroll : null}
            />
          )
        ) : null}
        </div>
      </ScrollLinkedEdgeTitleBarShell>

      {sheet === 'bankroll' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setSheet(null)}
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
                    ? 'Edit On Stake bankroll'
                    : 'On Stake starting bankroll'
                  : hasBankrollProfile
                    ? 'Edit poker bankroll'
                    : 'Starting bankroll'}
              </div>
              <button
                type="button"
                onClick={() => setSheet(null)}
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
          onClick={() => !saving && setSheet(null)}
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
                onClick={() => setSheet(null)}
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

            <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
              <div className="min-w-0">
                <FieldLabel>Date</FieldLabel>
                <DateWheelPicker
                  value={form.date}
                  onChange={(v) => setField('date', v)}
                  showYear
                />
              </div>
              <div className="min-w-0">
                <FieldLabel>Start time</FieldLabel>
                <TimeWheelPicker
                  value={form.start_time}
                  onChange={(v) => setField('start_time', v)}
                />
              </div>
            </div>

            <FieldLabel>Hours played</FieldLabel>
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                className="h-12 w-12 rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
                onClick={() =>
                  setField(
                    'duration_hours',
                    formatDurationHoursField(parseDurationHoursField(form.duration_hours) - 0.25),
                  )
                }
              >
                −
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={form.duration_hours}
                onChange={(e) => setField('duration_hours', e.target.value)}
                className={`${POKER_FIELD_CLASS} flex-1 text-center`}
              />
              <button
                type="button"
                className="h-12 w-12 rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
                onClick={() =>
                  setField(
                    'duration_hours',
                    formatDurationHoursField(parseDurationHoursField(form.duration_hours) + 0.25),
                  )
                }
              >
                +
              </button>
            </div>

            <div className="mb-3">
              <FieldLabel>Cash out</FieldLabel>
              <MoneyInput
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
              <div className="mb-3 space-y-3">
                <div>
                  <FieldLabel>Tournament name</FieldLabel>
                  <input
                    type="text"
                    value={form.tournament_name}
                    onChange={(e) => setField('tournament_name', e.target.value)}
                    placeholder="Daily $200, WSOP…"
                    className={POKER_FIELD_CLASS}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>Finish place</FieldLabel>
                    <NumInput
                      value={form.finish_place}
                      onChange={(v) => setField('finish_place', v)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Re-entries</FieldLabel>
                    <NumInput
                      value={form.reentries}
                      onChange={(v) => setField('reentries', v)}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Bounty winnings</FieldLabel>
                  <MoneyInput
                    value={form.bounty_winnings}
                    onChange={(v) => setField('bounty_winnings', v)}
                    colorize
                  />
                </div>
              </div>
            ) : null}

            <div className="mb-3">
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={3}
                className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                placeholder="Table notes, tilt, etc."
              />
            </div>

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
          onClose={() => setSheet(null)}
          onImported={() => void loadData()}
        />
      ) : null}

      {sheet === 'start' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setSheet(null)}
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
                onClick={() => setSheet(null)}
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

            {error ? <p className="mb-3 text-center text-sm text-rose-400">{error}</p> : null}

            <button
              type="button"
              disabled={saving}
              onClick={() => void startLiveSession()}
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </div>
      ) : null}

      {sheet === 'rebuy' && activeSession ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setSheet(null)}
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
                onClick={() => setSheet(null)}
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
            <FieldLabel>
              {rebuyKind === 'addon'
                ? 'Add-on amount'
                : activeSession.session_type === 'tournament'
                  ? 'Re-entry amount'
                  : 'Re-buy amount'}
            </FieldLabel>
            <div className="mb-4">
              <MoneyInput value={rebuyAmount} onChange={setRebuyAmount} />
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
          onClick={() => !saving && setSheet(null)}
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
                onClick={() => setSheet(null)}
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

            <FieldLabel>Cash out</FieldLabel>
            <div className="mb-3">
              <MoneyInput value={endCashOut} onChange={setEndCashOut} colorize />
            </div>

            {activeSession.session_type === 'tournament' ? (
              <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
                <div className="min-w-0">
                  <FieldLabel>Finish place</FieldLabel>
                  <NumInput value={endFinishPlace} onChange={setEndFinishPlace} />
                </div>
                <div className="min-w-0">
                  <FieldLabel>Bounties</FieldLabel>
                  <MoneyInput value={endBounties} onChange={setEndBounties} colorize />
                </div>
              </div>
            ) : null}

            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="Optional"
            />

            {(() => {
              const cashOut = parseFloat(endCashOut)
              if (!Number.isFinite(cashOut)) return null
              const bounties =
                activeSession.session_type === 'tournament' && endBounties !== ''
                  ? parseFloat(endBounties) || 0
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

  return (
    <>
      <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
        <div className="min-w-0">
          <FieldLabel>Type</FieldLabel>
          <Select
            value={form.session_type}
            onChange={(v) => setField('session_type', v)}
            options={[
              { id: 'cash', label: 'Cash' },
              { id: 'tournament', label: 'Tournament' },
            ]}
          />
        </div>
        <div className="min-w-0">
          <FieldLabel>Table size</FieldLabel>
          <Select
            value={form.table_size}
            onChange={(v) => setField('table_size', v)}
            options={POKER_TABLE_SIZES}
          />
        </div>
      </div>

      <Segmented
        label="Where"
        value={form.venue_kind}
        onChange={(v) => setField('venue_kind', v)}
        options={[
          { id: 'live', label: 'Live' },
          { id: 'online', label: 'Online' },
          { id: 'club', label: 'Club' },
        ]}
      />

      {form.venue_kind === 'online' ? (
        <>
          <FieldLabel>Site</FieldLabel>
          <div className="mb-3">
            <MenuSelect
              value={form.online_site_pick || ''}
              onChange={(id) => setField('online_site_pick', id)}
              options={pokerOnlineSiteSelectOptions()}
            />
          </div>
        </>
      ) : form.venue_kind === 'club' ? (
        <>
          <FieldLabel>Club</FieldLabel>
          <div className="mb-3">
            <MenuSelect
              value={form.club_app_pick || ''}
              onChange={(id) => setField('club_app_pick', id)}
              options={pokerClubAppSelectOptions()}
            />
          </div>
        </>
      ) : (
        <>
          <FieldLabel>Location</FieldLabel>
          <CasinoAutocomplete
            value={form.venue_name}
            onChange={(v) => setField('venue_name', v)}
            supabaseClient={supabaseClient}
            nearbyCasinos={nearbyCasinos}
            customVenues={customVenues}
            onSaveCustomVenue={onSaveCustomVenue}
            gpsLoading={gpsLoading}
            placeholder="Wynn, Aria, home game…"
            className="mb-3"
          />
        </>
      )}

      {isCash ? (
        <>
          <GameCurrencyTablesRow
            isOnline={form.venue_kind === 'online'}
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
              />
            }
          />
          {showCashDetails ? (
            <>
              <FieldLabel>Limit</FieldLabel>
              <div className="mb-3">
                <Select
                  value={form.limit_type}
                  onChange={(v) => setField('limit_type', v)}
                  options={POKER_LIMIT_TYPES}
                />
              </div>
              <FieldLabel>Game name</FieldLabel>
              <div className="mb-3">
                <Select
                  value={form.live_game_name_pick || 'holdem'}
                  onChange={(v) => setField('live_game_name_pick', v)}
                  options={POKER_LIVE_CASH_GAME_NAMES}
                />
              </div>
              {form.live_game_name_pick === POKER_LIVE_CASH_GAME_CUSTOM_ID ? (
                <div className="mb-3">
                  <input
                    type="text"
                    value={form.game_custom_name}
                    onChange={(e) => setField('game_custom_name', e.target.value)}
                    placeholder="Enter game name…"
                    className={POKER_FIELD_CLASS}
                  />
                </div>
              ) : null}
              <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
                <div className="min-w-0">
                  <FieldLabel>Small blind</FieldLabel>
                  <MoneyInput
                    value={form.small_blind}
                    onChange={(v) => setField('small_blind', v)}
                  />
                </div>
                <div className="min-w-0">
                  <FieldLabel>Big blind</FieldLabel>
                  <MoneyInput value={form.big_blind} onChange={(v) => setField('big_blind', v)} />
                </div>
              </div>
              <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
                <div className="min-w-0">
                  <FieldLabel>3rd blind</FieldLabel>
                  <MoneyInput
                    value={form.third_blind}
                    onChange={(v) => setField('third_blind', v)}
                  />
                </div>
                <div className="min-w-0">
                  <FieldLabel>Ante</FieldLabel>
                  <MoneyInput value={form.ante} onChange={(v) => setField('ante', v)} />
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <GameCurrencyTablesRow
            isOnline={form.venue_kind === 'online'}
            tablesCount={form.tables_count}
            onTablesCountChange={(v) => setField('tables_count', v)}
            currency={form.currency}
            onCurrencyChange={(v) => setField('currency', v)}
            game={
              <Select
                value={form.game_variant}
                onChange={(v) => setField('game_variant', v)}
                options={pokerGameOptionsForSessionType('tournament')}
              />
            }
          />
          {isCustomGame ? (
            <>
              <FieldLabel>Limit</FieldLabel>
              <div className="mb-3">
                <Select
                  value={form.limit_type}
                  onChange={(v) => setField('limit_type', v)}
                  options={POKER_LIMIT_TYPES}
                />
              </div>
              <FieldLabel>Game</FieldLabel>
              <div className="mb-3">
                <input
                  type="text"
                  value={form.game_custom_name}
                  onChange={(e) => setField('game_custom_name', e.target.value)}
                  placeholder="e.g. Dealers Choice, Stud…"
                  className={POKER_FIELD_CLASS}
                />
              </div>
            </>
          ) : null}
          <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0">
              <FieldLabel>Players</FieldLabel>
              <NumInput value={form.field_size} onChange={(v) => setField('field_size', v)} />
            </div>
            <div className="min-w-0">
              <FieldLabel>Start stack</FieldLabel>
              <NumInput value={form.start_stack} onChange={(v) => setField('start_stack', v)} />
            </div>
          </div>
        </>
      )}

      <FieldLabel>Buy-in</FieldLabel>
      <div className="mb-3">
        <MoneyInput value={form.buy_in} onChange={(v) => setField('buy_in', v)} />
      </div>
      {form.session_type === 'tournament' ? (
        <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
          <div className="min-w-0">
            <FieldLabel>Re-buy</FieldLabel>
            <MoneyInput value={form.rebuy_amount} onChange={(v) => setField('rebuy_amount', v)} />
          </div>
          <div className="min-w-0">
            <FieldLabel>Add-on</FieldLabel>
            <MoneyInput value={form.addon_amount} onChange={(v) => setField('addon_amount', v)} />
          </div>
        </div>
      ) : null}
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

function Segmented({ label, value, onChange, options }) {
  return (
    <div className="mb-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-1 rounded-2xl bg-zinc-800 p-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold touch-manipulation ${
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

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${POKER_FIELD_CLASS} box-border appearance-none py-0 leading-[3rem]`}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/** Game + Currency on one row; online also shows Tables below. */
function GameCurrencyTablesRow({
  isOnline,
  game,
  currency,
  onCurrencyChange,
  tablesCount,
  onTablesCountChange,
}) {
  const tables = (
    <div className="flex h-12 items-center gap-1">
      <button
        type="button"
        className="flex h-12 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
        onClick={() => {
          const n = Math.max(1, (parseInt(tablesCount, 10) || 1) - 1)
          onTablesCountChange(String(n))
        }}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={tablesCount}
        onChange={(e) => onTablesCountChange(e.target.value)}
        className={`min-w-0 flex-1 text-center ${POKER_FIELD_CLASS}`}
        aria-label="Number of tables"
      />
      <button
        type="button"
        className="flex h-12 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-xl text-zinc-300 touch-manipulation"
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
      <div className="mb-3 grid min-w-0 grid-cols-2 gap-2">
        <div className="min-w-0">
          <FieldLabel>Game</FieldLabel>
          {game}
        </div>
        <div className="min-w-0">
          <FieldLabel>Currency</FieldLabel>
          <PokerFieldMenu
            value={normalizePokerCurrency(currency)}
            onChange={onCurrencyChange}
            options={POKER_CURRENCIES}
            ariaLabel="Currency"
            placeholder="USD ($)"
          />
        </div>
      </div>
      {isOnline ? (
        <div className="mb-3 min-w-0">
          <FieldLabel>Tables</FieldLabel>
          {tables}
        </div>
      ) : null}
    </>
  )
}

/** Long option lists (online sites): custom menu always opens scrolled to the top. */
function MenuSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const listRef = useRef(null)
  const selected = options.find((o) => o.id === value)
  const label = selected?.label || options[0]?.label || 'Select…'

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
        className={`${POKER_FIELD_CLASS} flex items-center justify-between text-left`}
      >
        <span className={`truncate font-semibold text-sm ${value ? 'text-white' : 'text-zinc-500'}`}>
          {label}
        </span>
        <span
          className={`ml-2 shrink-0 text-xs text-zinc-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
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

function NumInput({ value, onChange }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
      className={POKER_FIELD_CLASS}
    />
  )
}

function MoneyInput({ value, onChange, colorize = false }) {
  const numVal = parseFloat(value)
  const hasValue = value !== '' && value !== '-'
  const textClass =
    colorize && hasValue
      ? numVal >= 0
        ? 'text-emerald-300'
        : 'text-red-300'
      : 'text-white'
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className={`w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 pr-4 outline-none focus:ring-2 focus:ring-cyan-500/40 ${textClass}`}
      />
    </div>
  )
}
