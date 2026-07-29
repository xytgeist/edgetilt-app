import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_POKER_BANKROLL_SESSION_LIMIT } from '../billing/freemiumToolLimits.js'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fetchNearbyCasinos } from '../../utils/nearbyCasinos.js'
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
  pokerSessionWinLoss,
} from './pokerBankrollMath.js'
import {
  POKER_CASH_NEW_GAME_ID,
  POKER_LIMIT_TYPES,
  POKER_TABLE_SIZES,
  applyCashGamePreset,
  buildCashGamePresetsFromSessions,
  cashGamePresetIdFromName,
  cashGameSelectOptions,
  coercePokerGameForSessionType,
  formWithDefaultCashGame,
  pokerGameOptionsForSessionType,
  pokerGamePickFromStored,
  pokerGameVariantToStored,
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'

/** Match CasinoAutocomplete / Location field text styling. */
const POKER_FIELD_CLASS =
  'w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40'

function emptyForm() {
  const now = new Date()
  return {
    session_type: 'cash',
    venue_kind: 'live',
    venue_name: '',
    date: localYmd(now),
    start_time: `${String(now.getHours()).padStart(2, '0')}:00`,
    duration_hours: '4',
    buy_in: '',
    cash_out: '',
    cash_game_pick: POKER_CASH_NEW_GAME_ID,
    game_variant: 'custom',
    game_custom_name: '',
    limit_type: 'no_limit',
    table_size: 'full_ring',
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
 * Advanced holds notes and post-session tourney extras.
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
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** @type {null | 'session' | 'bankroll' | 'start' | 'end'} */
  const [sheet, setSheet] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
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
  const [venueFilter, setVenueFilter] = useState('all') // all | live | online
  const [nearbyCasinos, setNearbyCasinos] = useState([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [customVenues, setCustomVenues] = useState([])
  const casinoCoordCacheRef = useRef(null)

  const overallBankroll = profile ? Number(profile.overall_bankroll) : null
  const hasBankrollProfile = profile != null
  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'active') ?? null,
    [sessions],
  )
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status !== 'active'),
    [sessions],
  )
  /** Prior cash games for the Game dropdown (most recent first). */
  const cashGamePresets = useMemo(
    () => buildCashGamePresetsFromSessions(sessions),
    [sessions],
  )

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
      setCustomVenues([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [sessRes, profRes, customRes] = await Promise.all([
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
    const current = profile ? Number(profile.overall_bankroll) : 0
    await upsertBankroll(current + delta)
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

  function openSetBankroll() {
    setBankrollInput(hasBankrollProfile ? String(profile.overall_bankroll) : '')
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
    setForm(formWithDefaultCashGame(emptyForm(), cashGamePresets))
    setShowAdvanced(false)
    setError('')
    setSheet('start')
    triggerTapHapticLight()
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
    setForm(formWithDefaultCashGame(emptyForm(), cashGamePresets))
    setShowAdvanced(false)
    setError('')
    setSheet('session')
    triggerTapHapticLight()
    void fetchNearby((name) => setForm((f) => (f.venue_kind === 'live' && !f.venue_name ? { ...f, venue_name: name } : f)))
  }

  function openEndSession() {
    setEndCashOut('')
    setEndNotes('')
    setEndBounties('')
    setEndFinishPlace('')
    setShowAdvanced(false)
    setError('')
    setSheet('end')
    triggerTapHapticLight()
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
    if (
      (form.session_type === 'cash' || form.game_variant === 'custom') &&
      !String(form.game_custom_name || '').trim()
    ) {
      setError(
        form.session_type === 'cash'
          ? 'Enter a game name (e.g. 2/5 NLH).'
          : 'Enter a name for your custom game.',
      )
      return
    }
    const now = new Date()
    const payload = {
      user_id: userId,
      venue_name: form.venue_name.trim() || null,
      venue_kind: form.venue_kind,
      session_type: form.session_type,
      status: 'active',
      start_at: now.toISOString(),
      end_at: null,
      buy_in: buyIn,
      cash_out: null,
      game_variant: pokerGameVariantToStored(
        form.session_type,
        form.game_variant,
        form.game_custom_name,
      ),
      limit_type:
        form.session_type === 'cash' || form.game_variant === 'custom'
          ? form.limit_type || null
          : null,
      table_size: form.table_size || null,
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
    const wl = cashOut + bounties - (Number(activeSession.buy_in) || 0)
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
    setEditingId(session.id)
    setEditingPrevWl(prevWl == null ? 0 : prevWl)
    setForm({
      session_type: sessionType,
      venue_kind: session.venue_kind || 'live',
      venue_name: session.venue_name || '',
      date: localYmd(start),
      start_time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      duration_hours: formatDurationHoursField(hrs || 0),
      buy_in: session.buy_in != null ? String(session.buy_in) : '',
      cash_out: session.cash_out != null ? String(session.cash_out) : '',
      cash_game_pick:
        sessionType === 'cash' && gamePick.game_custom_name
          ? cashGamePresetIdFromName(gamePick.game_custom_name)
          : POKER_CASH_NEW_GAME_ID,
      game_variant: gameVariant,
      game_custom_name: gamePick.game_custom_name,
      limit_type: session.limit_type || 'no_limit',
      table_size: session.table_size || 'full_ring',
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
    const hasAdvanced = Boolean(
      session.tournament_name ||
        session.finish_place != null ||
        session.bounty_winnings != null ||
        session.reentries != null ||
        session.notes,
    )
    setShowAdvanced(hasAdvanced)
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
            { ...next, game_variant: 'custom', game_custom_name: '' },
            cashGamePresets,
          )
        } else {
          next.cash_game_pick = POKER_CASH_NEW_GAME_ID
          if (next.game_variant !== 'custom') next.game_custom_name = ''
        }
      }
      if (key === 'venue_kind' && value === 'live' && prev.venue_kind !== 'live') {
        void fetchNearby((name) => {
          setForm((f) => (f.venue_kind === 'live' && !String(f.venue_name || '').trim() ? { ...f, venue_name: name } : f))
        })
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
    if (!Number.isFinite(cashOut)) {
      setError('Enter cash out (what you walked with).')
      return
    }
    if (
      (form.session_type === 'cash' || form.game_variant === 'custom') &&
      !String(form.game_custom_name || '').trim()
    ) {
      setError(
        form.session_type === 'cash'
          ? 'Enter a game name (e.g. 2/5 NLH).'
          : 'Enter a name for your custom game.',
      )
      return
    }
    const durationHrs = parseDurationHoursField(form.duration_hours)
    if (durationHrs <= 0) {
      setError('Enter hours played.')
      return
    }
    const startAt = localDateTimeToIso(form.date, form.start_time)
    const endAt = new Date(new Date(startAt).getTime() + durationHrs * 3_600_000).toISOString()

    const payload = {
      user_id: userId,
      venue_name: form.venue_name.trim() || null,
      venue_kind: form.venue_kind,
      session_type: form.session_type,
      status: 'completed',
      start_at: startAt,
      end_at: endAt,
      buy_in: buyIn,
      cash_out: cashOut,
      game_variant: pokerGameVariantToStored(
        form.session_type,
        form.game_variant,
        form.game_custom_name,
      ),
      limit_type:
        form.session_type === 'cash' || form.game_variant === 'custom'
          ? form.limit_type || null
          : null,
      table_size: form.table_size || null,
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
        showAdvanced && form.session_type === 'tournament' && form.finish_place !== ''
          ? parseInt(form.finish_place, 10)
          : null,
      bounty_winnings:
        showAdvanced && form.session_type === 'tournament' && form.bounty_winnings !== ''
          ? parseFloat(form.bounty_winnings)
          : null,
      reentries:
        showAdvanced && form.session_type === 'tournament' && form.reentries !== ''
          ? parseInt(form.reentries, 10)
          : null,
      notes: showAdvanced ? form.notes.trim() || null : null,
    }

    const newWl =
      cashOut +
      (form.session_type === 'tournament' && form.bounty_winnings !== ''
        ? parseFloat(form.bounty_winnings) || 0
        : 0) -
      buyIn

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

  const previewWl = (() => {
    const buyIn = parseFloat(form.buy_in)
    const cashOut = parseFloat(form.cash_out)
    const bounties = parseFloat(form.bounty_winnings) || 0
    if (!Number.isFinite(buyIn) || !Number.isFinite(cashOut)) return null
    return cashOut + bounties - buyIn
  })()

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <SlotsToolPageHeader
          center={
            <div className="text-center">
              <div className="text-white text-lg font-black tracking-tight">Poker Bankroll</div>
              <div className="text-zinc-500 text-[11px]">Cash · Tourneys · Live · Online</div>
            </div>
          }
        />

        <FreemiumUsageCounter
          remaining={pokerBankrollSessionsRemaining}
          limit={FREE_POKER_BANKROLL_SESSION_LIMIT}
          itemLabelPlural="poker sessions"
          loading={freemiumUsageLoading}
        />

        {/* Overall poker bankroll */}
        <div className="mb-4 rounded-3xl border border-zinc-700/40 bg-gradient-to-br from-zinc-900 to-zinc-800 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Poker bankroll
              </div>
              {loading ? (
                <div className="h-10 w-40 animate-pulse rounded-xl bg-zinc-700/40" />
              ) : hasBankrollProfile ? (
                <div className="text-4xl font-black tracking-tight text-white">
                  {fmtPoker$(overallBankroll)}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openSetBankroll}
                  className="mt-1 text-sm font-semibold text-emerald-400 touch-manipulation"
                >
                  + Set your starting bankroll
                </button>
              )}
            </div>
            {hasBankrollProfile ? (
              <button
                type="button"
                onClick={openSetBankroll}
                className="shrink-0 rounded-xl bg-zinc-700/60 px-3 py-1.5 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-600"
              >
                Edit
              </button>
            ) : null}
          </div>
          {hasBankrollProfile && completedSessions.length > 0 ? (
            <div className="mt-3 border-t border-zinc-700/40 pt-3 text-[12px] text-zinc-500">
              Session P/L below updates this roll automatically.
            </div>
          ) : null}
        </div>

        {/* Active session or Start / Log CTAs */}
        {activeSession ? (
          <div
            data-session-card
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
                  Started with {fmtPoker$(activeSession.buy_in)}
                </div>
                <div className="mt-2 text-3xl font-black tabular-nums text-emerald-200">
                  {fmtPokerDuration(elapsed)}
                </div>
              </div>
              <button
                type="button"
                onClick={openEndSession}
                className="shrink-0 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-600"
              >
                End Session
              </button>
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

        {/* Summary */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Profit"
            value={fmtPoker$(stats.profit)}
            tone={stats.profit >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label="Hourly"
            value={stats.hourly == null ? '-' : fmtPoker$(stats.hourly)}
            tone={stats.hourly == null ? 'neutral' : stats.hourly >= 0 ? 'good' : 'bad'}
          />
          <StatTile label="Hours" value={stats.hours.toFixed(1)} />
          <StatTile
            label="Win rate"
            value={stats.winRate == null ? '-' : `${stats.winRate}%`}
          />
        </div>

        {/* Filters */}
        {completedSessions.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
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
            <span className="mx-1 w-px self-stretch bg-zinc-800" />
            {[
              { id: 'all', label: 'Any' },
              { id: 'live', label: 'Live' },
              { id: 'online', label: 'Online' },
            ].map((opt) => (
              <FilterChip
                key={`v-${opt.id}`}
                active={venueFilter === opt.id}
                onClick={() => setVenueFilter(opt.id)}
                label={opt.label}
              />
            ))}
          </div>
        ) : null}

        {error && !sheet ? (
          <p className="mb-3 text-center text-sm text-rose-400">{error}</p>
        ) : null}

        {loading ? (
          <p className="py-16 text-center text-sm text-zinc-500">Loading sessions…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center">
            <p className="text-white font-semibold">No poker sessions yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              {hasBankrollProfile
                ? 'Start a live session, or log one from earlier.'
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
                    className="flex w-full items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3 text-left touch-manipulation active:bg-zinc-800/80"
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        session.session_type === 'tournament'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                      aria-hidden
                    >
                      {session.session_type === 'tournament' ? 'T' : '$'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-white">
                          {pokerSessionStakesLabel(session)}
                        </span>
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            wl == null ? 'text-zinc-500' : wl >= 0 ? 'text-emerald-400' : 'text-rose-400'
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
                {hasBankrollProfile ? 'Edit poker bankroll' : 'Starting bankroll'}
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
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-h-[92dvh] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
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
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className={`${POKER_FIELD_CLASS} min-w-0 max-w-full`}
                />
              </div>
              <div className="min-w-0">
                <FieldLabel>Start time</FieldLabel>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setField('start_time', e.target.value)}
                  className={`${POKER_FIELD_CLASS} min-w-0 max-w-full`}
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

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mb-3 flex w-full items-center justify-between rounded-2xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-3 text-left touch-manipulation"
            >
              <span>
                <span className="block text-sm font-semibold text-white">Advanced</span>
                <span className="block text-[11px] text-zinc-500">
                  {form.session_type === 'tournament'
                    ? 'Name, finish, bounties, re-entries, notes'
                    : 'Notes'}
                </span>
              </span>
              <span className="text-zinc-400">{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced ? (
              <div className="mb-3 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                {form.session_type === 'tournament' ? (
                  <>
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
                  </>
                ) : null}
                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Table notes, tilt, etc."
                  />
                </div>
              </div>
            ) : null}

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
            ) : null}
          </div>
        </div>
      ) : null}

      {sheet === 'start' ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setSheet(null)}
        >
          <div
            data-poker-bankroll-sheet
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-h-[92dvh] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
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

      {sheet === 'end' && activeSession ? (
        <div
          className={`${APP_MODAL_OVERLAY_CLASS} overflow-x-hidden`}
          onClick={() => !saving && setSheet(null)}
        >
          <div
            data-poker-bankroll-sheet
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-h-[92dvh] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
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
                    Started with {fmtPoker$(activeSession.buy_in)}
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
              const wl = cashOut + bounties - (Number(activeSession.buy_in) || 0)
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
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Ending…' : 'End Session'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function StatTile({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white'
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation ${
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
  const cashGameOptions = (() => {
    const opts = cashGameSelectOptions(cashGamePresets)
    const pick = form.cash_game_pick
    if (
      pick &&
      pick !== POKER_CASH_NEW_GAME_ID &&
      !opts.some((o) => o.id === pick) &&
      form.game_custom_name
    ) {
      return [...opts, { id: pick, label: form.game_custom_name }]
    }
    return opts
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
        ]}
      />

      <FieldLabel>{form.venue_kind === 'online' ? 'Site' : 'Location'}</FieldLabel>
      {form.venue_kind === 'live' ? (
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
      ) : (
        <input
          type="text"
          value={form.venue_name}
          onChange={(e) => setField('venue_name', e.target.value)}
          placeholder="PokerStars, ClubWPT…"
          className={`mb-3 ${POKER_FIELD_CLASS}`}
        />
      )}

      {isCash ? (
        <>
          <FieldLabel>Game</FieldLabel>
          <div className="mb-3">
            <Select
              value={form.cash_game_pick || POKER_CASH_NEW_GAME_ID}
              onChange={(v) => setField('cash_game_pick', v)}
              options={cashGameOptions}
            />
          </div>
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
                <input
                  type="text"
                  value={form.game_custom_name}
                  onChange={(e) => setField('game_custom_name', e.target.value)}
                  placeholder="e.g. 2/5 NLH"
                  className={POKER_FIELD_CLASS}
                />
              </div>
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
          <FieldLabel>Game</FieldLabel>
          <div className="mb-3">
            <Select
              value={form.game_variant}
              onChange={(v) => setField('game_variant', v)}
              options={pokerGameOptionsForSessionType('tournament')}
            />
          </div>
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
    </>
  )
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
      className={POKER_FIELD_CLASS}
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
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
