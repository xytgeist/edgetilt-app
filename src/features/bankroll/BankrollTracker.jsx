import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_BANKROLL_SESSION_LIMIT } from '../billing/freemiumToolLimits.js'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import BankrollTrendTab from './BankrollTrendTab.jsx'
import BankrollChartsTab from './BankrollChartsTab.jsx'
import BankrollLocationsTab from './BankrollLocationsTab.jsx'
import BankrollImportSheet from './BankrollImportSheet.jsx'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null || isNaN(n)) return '-'
  const abs = Math.abs(n)
  const str = abs >= 10000
    ? '$' + Math.round(abs).toLocaleString()
    : abs >= 100
    ? '$' + abs.toFixed(0)
    : '$' + abs.toFixed(2)
  return n < 0 ? '-' + str : str
}

function fmtDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function sessionDurationHours(session) {
  const start = new Date(session.start_at)
  const end = session.end_at ? new Date(session.end_at) : new Date()
  return Math.max(0, (end - start) / 3_600_000)
}

function sessionWinLoss(session) {
  if (session.end_amount == null) return null
  return Number(session.end_amount) - Number(session.start_amount)
}

function hourlyRate(session) {
  const wl = sessionWinLoss(session)
  if (wl == null) return null
  const hrs = sessionDurationHours(session)
  return hrs >= 0.02 ? wl / hrs : null
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Haversine distance (miles) ────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtMiles(mi) {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

/** YYYY-MM-DD in the device timezone (not UTC - avoid toISOString().slice(0,10)). */
function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Combine local date + HH:MM into an ISO instant for Supabase timestamptz. */
function localDateTimeToIso(dateYmd, timeHm) {
  if (!dateYmd || !timeHm) return new Date().toISOString()
  const [y, m, day] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  if ([y, m, day, hh, mm].some(n => Number.isNaN(n))) return new Date().toISOString()
  return new Date(y, m - 1, day, hh, mm).toISOString()
}

function isoToLocalYmd(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : localYmd(d)
}

function isoToLocalHm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function BankrollTracker({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  canCreateBankrollSession = true,
  bankrollSessionsRemaining = null,
  freemiumUsageLoading = false,
  onRequireSubscribeForBankroll = null,
  onBankrollSessionCreated = null,
}) {
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sessions, setSessions] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'locations' | 'charts' | 'trend'
  const [gameTypeFilter, setGameTypeFilter] = useState('all') // 'all' | 'slots' | 'tables'
  const [sheet, setSheet] = useState(null)
  const [editingSession, setEditingSession] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // GPS nearby state
  const [nearbyCasinos, setNearbyCasinos] = useState([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const casinoCoordCacheRef = useRef(null)

  // Sheet form state
  const [bankrollInput, setBankrollInput] = useState('')
  const [startCasino, setStartCasino] = useState('')
  const [startGameType, setStartGameType] = useState('slots')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [startAmount, setStartAmount] = useState('')
  const [endAmount, setEndAmount] = useState('')
  const [rebuyAmount, setRebuyAmount] = useState('')
  const [editStartAmount, setEditStartAmount] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [editFields, setEditFields] = useState({})
  const [pastFields, setPastFields] = useState({})

  // Bulk-select / delete state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const deleteConfirmTimerRef = useRef(null)

  // Session history filter state
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false)
  const [historyGameFilter, setHistoryGameFilter] = useState('all')
  const [historyResultFilter, setHistoryResultFilter] = useState('all')
  const [historyCasinoFilter, setHistoryCasinoFilter] = useState([])
  const [casinoPickerOpen, setCasinoPickerOpen] = useState(false)

  const activeSession = sessions.find(s => s.status === 'active') ?? null
  const completedSessions = sessions.filter(s => s.status === 'completed')
  const tabSessions = gameTypeFilter === 'all'
    ? completedSessions
    : completedSessions.filter(s => (s.game_type || 'slots') === gameTypeFilter)
  const overallBankroll = profile ? Number(profile.overall_bankroll) : null

  const uniqueCasinos = useMemo(() => {
    const counts = {}
    for (const s of completedSessions) {
      const name = (s.casino_name || '').trim()
      if (name) counts[name] = (counts[name] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
  }, [completedSessions])

  const filteredHistory = useMemo(() => completedSessions.filter(s => {
    if (historyGameFilter !== 'all' && (s.game_type || 'slots') !== historyGameFilter) return false
    const wl = sessionWinLoss(s)
    if (historyResultFilter === 'wins' && (wl == null || wl <= 0)) return false
    if (historyResultFilter === 'losses' && (wl == null || wl >= 0)) return false
    if (historyCasinoFilter.length > 0 && !historyCasinoFilter.includes((s.casino_name || '').trim())) return false
    return true
  }), [completedSessions, historyGameFilter, historyResultFilter, historyCasinoFilter])

  const historyActiveFilters =
    (historyGameFilter !== 'all' ? 1 : 0) +
    (historyResultFilter !== 'all' ? 1 : 0) +
    (historyCasinoFilter.length > 0 ? 1 : 0)

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!supabaseClient) return
    try {
      const { data: { user } } = await supabaseClient.auth.getUser()
      if (user) setUserId(user.id)
      const [profileRes, sessionsRes, adjRes] = await Promise.all([
        supabaseClient.from('bankroll_profiles').select('*').maybeSingle(),
        supabaseClient
          .from('bankroll_sessions')
          .select('*')
          .order('start_at', { ascending: false })
          .limit(500),
        supabaseClient
          .from('bankroll_adjustments')
          .select('*')
          .order('occurred_at', { ascending: true })
      ])
      if (profileRes.data) setProfile(profileRes.data)
      if (sessionsRes.data) setSessions(sessionsRes.data)
      if (adjRes.data) setAdjustments(adjRes.data)
    } catch (e) {
      console.error('BankrollTracker load error:', e)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => { loadData() }, [loadData])

  // ── Live elapsed timer for active session ─────────────────────────────────

  useEffect(() => {
    if (!activeSession) { setElapsed(0); return }
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(activeSession.start_at)) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeSession])

  // ── Aggregate stats ───────────────────────────────────────────────────────

  const allTimeWinLoss = completedSessions.reduce((sum, s) => {
    const wl = sessionWinLoss(s)
    return wl != null ? sum + wl : sum
  }, 0)

  const sessionsWithHourly = completedSessions.filter(s => hourlyRate(s) != null)
  const avgHourly = sessionsWithHourly.length
    ? sessionsWithHourly.reduce((sum, s) => sum + hourlyRate(s), 0) / sessionsWithHourly.length
    : null

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveBankroll = async () => {
    const val = parseFloat(bankrollInput)
    if (isNaN(val) || val < 0) { setError('Enter a valid amount.'); return }
    setSaving(true); setError('')
    try {
      const oldVal = profile ? Number(profile.overall_bankroll) : 0
      const delta = val - oldVal
      const { data, error: err } = await supabaseClient
        .from('bankroll_profiles')
        .upsert({ user_id: userId, overall_bankroll: val }, { onConflict: 'user_id' })
        .select().single()
      if (err) throw err
      // Log adjustment delta if this is an edit (not initial set) and amount changed
      if (profile && Math.abs(delta) > 0.001) {
        const { data: adjData } = await supabaseClient
          .from('bankroll_adjustments')
          .insert({ user_id: userId, amount: delta, note: 'Manual adjustment' })
          .select().single()
        if (adjData) setAdjustments(prev => [...prev, adjData])
      }
      setProfile(data)
      setSheet(null)
    } catch (e) {
      setError(e.message || 'Could not save bankroll.')
    } finally {
      setSaving(false)
    }
  }

  const startSession = async () => {
    const amt = parseFloat(startAmount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid starting amount.'); return }
    if (activeSession) { setError('You already have a session in progress.'); return }
    if (!canCreateBankrollSession) {
      onRequireSubscribeForBankroll?.()
      return
    }
    setSaving(true); setError('')
    try {
      const startAt = localDateTimeToIso(startDate, startTime)
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .insert({ user_id: userId, casino_name: startCasino.trim() || null, start_amount: amt, start_at: startAt, status: 'active', game_type: startGameType })
        .select().single()
      if (err) throw err
      setSessions(prev => [data, ...prev])
      setSheet(null); setStartCasino(''); setStartAmount(''); setStartGameType('slots')
      onBankrollSessionCreated?.()
    } catch (e) {
      setError(e.message || 'Could not start session.')
    } finally {
      setSaving(false)
    }
  }

  const endSession = async () => {
    const amt = parseFloat(endAmount)
    if (isNaN(amt) || amt < 0) { setError('Enter a valid ending amount.'); return }
    if (!activeSession) return
    setSaving(true); setError('')
    try {
      const endAt = new Date().toISOString()
      const winLoss = amt - Number(activeSession.start_amount)
      const { data: updatedSession, error: sessErr } = await supabaseClient
        .from('bankroll_sessions')
        .update({ end_amount: amt, end_at: endAt, status: 'completed', notes: sessionNotes.trim() || null })
        .eq('id', activeSession.id)
        .select().single()
      if (sessErr) throw sessErr

      const newBankroll = (overallBankroll ?? 0) + winLoss
      const { data: updatedProfile, error: profErr } = await supabaseClient
        .from('bankroll_profiles')
        .upsert({ user_id: userId, overall_bankroll: newBankroll }, { onConflict: 'user_id' })
        .select().single()
      if (profErr) throw profErr

      setSessions(prev => prev.map(s => s.id === activeSession.id ? updatedSession : s))
      setProfile(updatedProfile)
      setSheet(null); setEndAmount(''); setSessionNotes('')
    } catch (e) {
      setError(e.message || 'Could not end session.')
    } finally {
      setSaving(false)
    }
  }

  const saveEditSession = async () => {
    if (!editingSession) return
    const startAmt = parseFloat(editFields.start_amount)
    const endAmt = editFields.end_amount !== '' ? parseFloat(editFields.end_amount) : null
    if (isNaN(startAmt) || startAmt < 0) { setError('Enter a valid start amount.'); return }
    if (!editFields.start_date || !editFields.start_time) {
      setError('Select session start date and time.')
      return
    }
    const startAt = localDateTimeToIso(editFields.start_date, editFields.start_time)
    const startMs = new Date(startAt).getTime()
    const needsEnd = editingSession.status === 'completed'
    let endAt = null
    if (needsEnd) {
      if (!editFields.end_date || !editFields.end_time) {
        setError('Select session end date and time.')
        return
      }
      endAt = localDateTimeToIso(editFields.end_date, editFields.end_time)
      if (new Date(endAt).getTime() < startMs) {
        setError('End time must be after start time.')
        return
      }
    }
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .update({
          casino_name: (editFields.casino_name || '').trim() || null,
          start_at: startAt,
          end_at: endAt,
          start_amount: startAmt,
          end_amount: endAmt != null && !isNaN(endAmt) ? endAmt : null,
          notes: (editFields.notes || '').trim() || null,
          game_type: editFields.game_type || 'slots'
        })
        .eq('id', editingSession.id)
        .select().single()
      if (err) throw err
      setSessions(prev => prev.map(s => s.id === editingSession.id ? data : s))
      setSheet(null); setEditingSession(null)
    } catch (e) {
      setError(e.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  const deleteSession = async (sessionId) => {
    try {
      await supabaseClient.from('bankroll_sessions').delete().eq('id', sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      setSheet(null); setEditingSession(null)
    } catch (e) {
      setError(e.message || 'Could not delete session.')
    }
  }

  // ── Sheet openers ─────────────────────────────────────────────────────────

  const saveLogPast = async () => {
    if (!pastFields.date) { setError('Select a date.'); return }
    if (!pastFields.start_time) { setError('Select a start time.'); return }
    if (!canCreateBankrollSession) {
      onRequireSubscribeForBankroll?.()
      return
    }
    const durationHrs = parseFloat(pastFields.duration_hours)
    if (isNaN(durationHrs) || durationHrs <= 0) { setError('Enter a session duration in hours.'); return }
    const rawStart = parseFloat(pastFields.start_amount)
    const rawEnd = parseFloat(pastFields.end_amount)
    const rawWL = parseFloat(pastFields.win_loss)
    let finalStart, finalEnd
    if (!isNaN(rawStart) && !isNaN(rawEnd)) {
      finalStart = rawStart; finalEnd = rawEnd
    } else if (!isNaN(rawWL)) {
      finalStart = !isNaN(rawStart) ? rawStart : 0
      finalEnd = finalStart + rawWL
    } else {
      setError('Enter start + end amounts, or a win/loss amount.'); return
    }
    setSaving(true); setError('')
    try {
      const startAt = localDateTimeToIso(pastFields.date, pastFields.start_time)
      const endAt = new Date(new Date(startAt).getTime() + durationHrs * 3_600_000).toISOString()
      const startAmt = finalStart; const endAmt = finalEnd
      const winLoss = endAmt - startAmt
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .insert({
          user_id: userId,
          casino_name: (pastFields.casino_name || '').trim() || null,
          start_at: startAt,
          end_at: endAt,
          start_amount: startAmt,
          end_amount: endAmt,
          status: 'completed',
          notes: (pastFields.notes || '').trim() || null,
          game_type: pastFields.game_type || 'slots'
        })
        .select().single()
      if (err) throw err

      const newBankroll = (overallBankroll ?? 0) + winLoss
      const { data: updatedProfile, error: profErr } = await supabaseClient
        .from('bankroll_profiles')
        .upsert({ user_id: userId, overall_bankroll: newBankroll }, { onConflict: 'user_id' })
        .select().single()
      if (profErr) throw profErr

      setSessions(prev => [data, ...prev].sort((a, b) => new Date(b.start_at) - new Date(a.start_at)))
      setProfile(updatedProfile)
      setSheet(null)
      onBankrollSessionCreated?.()
    } catch (e) {
      setError(e.message || 'Could not save session.')
    } finally {
      setSaving(false)
    }
  }

  // ── GPS nearby ────────────────────────────────────────────────────────────

  const fetchNearby = useCallback(async (onNearest) => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    try {
      // Fetch casino coords once and cache in ref
      if (!casinoCoordCacheRef.current) {
        const { data } = await supabaseClient
          .from('casinos')
          .select('id, name, city, state, country, lat, lng')
          .not('lat', 'is', null)
          .not('lng', 'is', null)
        casinoCoordCacheRef.current = data ?? []
      }
      const casinos = casinoCoordCacheRef.current
      if (!casinos.length) return

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords
          const withDist = casinos.map(c => ({
            ...c,
            distanceMi: haversine(latitude, longitude, c.lat, c.lng),
          })).sort((a, b) => a.distanceMi - b.distanceMi)

          const top5 = withDist.slice(0, 20)
          setNearbyCasinos(top5)
          if (top5.length > 0) onNearest(top5[0].name)
          setGpsLoading(false)
        },
        () => setGpsLoading(false),
        { timeout: 8000, maximumAge: 60000 }
      )
    } catch {
      setGpsLoading(false)
    }
  }, [supabaseClient])

  const openLogPast = () => {
    if (!canCreateBankrollSession) {
      onRequireSubscribeForBankroll?.()
      return
    }
    const today = localYmd()
    setNearbyCasinos([])
    setPastFields({ casino_name: '', date: today, start_time: '', duration_hours: '4', start_amount: '', end_amount: '', win_loss: '', notes: '', game_type: 'slots' })
    setError(''); setSheet('logPast')
    fetchNearby(name => setPastFields(p => ({ ...p, casino_name: name })))
  }

  const openSetBankroll = () => {
    setBankrollInput(profile ? String(profile.overall_bankroll) : '')
    setError(''); setSheet('setBankroll')
  }
  const openStartSession = () => {
    if (!canCreateBankrollSession) {
      onRequireSubscribeForBankroll?.()
      return
    }
    const now = new Date()
    const today = localYmd(now)
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    setNearbyCasinos([])
    setStartCasino(''); setStartDate(today); setStartTime(`${hh}:${mm}`); setStartAmount(''); setError(''); setSheet('startSession')
    fetchNearby(name => setStartCasino(name))
  }
  const openEndSession = () => {
    setEndAmount(''); setSessionNotes(''); setError(''); setSheet('endSession')
  }
  const openRebuy = () => {
    setRebuyAmount(''); setError(''); setSheet('rebuy')
  }
  const openEditStartAmount = () => {
    setEditStartAmount(activeSession ? String(activeSession.start_amount) : ''); setError(''); setSheet('editStartAmount')
  }

  const saveRebuy = async () => {
    const amt = parseFloat(rebuyAmount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid rebuy amount.'); return }
    setSaving(true); setError('')
    try {
      const newStart = Number(activeSession.start_amount) + amt
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .update({ start_amount: newStart })
        .eq('id', activeSession.id)
        .select().single()
      if (err) throw err
      setSessions(prev => prev.map(s => s.id === data.id ? data : s))
      setSheet(null)
    } catch (e) {
      setError(e.message || 'Could not save rebuy.')
    } finally {
      setSaving(false)
    }
  }

  const saveEditStartAmount = async () => {
    const amt = parseFloat(editStartAmount)
    if (isNaN(amt) || amt < 0) { setError('Enter a valid amount.'); return }
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .update({ start_amount: amt })
        .eq('id', activeSession.id)
        .select().single()
      if (err) throw err
      setSessions(prev => prev.map(s => s.id === data.id ? data : s))
      setSheet(null)
    } catch (e) {
      setError(e.message || 'Could not update amount.')
    } finally {
      setSaving(false)
    }
  }

  const openEditSession = (session) => {
    setEditingSession(session)
    setEditFields({
      casino_name: session.casino_name || '',
      start_date: isoToLocalYmd(session.start_at),
      start_time: isoToLocalHm(session.start_at),
      end_date: isoToLocalYmd(session.end_at) || isoToLocalYmd(session.start_at),
      end_time: isoToLocalHm(session.end_at) || isoToLocalHm(session.start_at),
      start_amount: String(session.start_amount),
      end_amount: session.end_amount != null ? String(session.end_amount) : '',
      notes: session.notes || '',
      game_type: session.game_type || 'slots'
    })
    setError(''); setSheet('editSession')
  }
  const closeSheet = () => { setSheet(null); setError('') }

  // ── Bulk select / delete ──────────────────────────────────────────────────

  function enterSelectMode() {
    setSelectMode(true)
    setSelectedIds(new Set())
    setDeleteConfirm(false)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setDeleteConfirm(false)
    clearTimeout(deleteConfirmTimerRef.current)
  }

  function toggleSelectSession(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === completedSessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(completedSessions.map(s => s.id)))
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      clearTimeout(deleteConfirmTimerRef.current)
      deleteConfirmTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3500)
      return
    }
    // Second tap - confirmed
    clearTimeout(deleteConfirmTimerRef.current)
    setSaving(true)
    const ids = [...selectedIds]
    // Supabase .in() handles up to ~500 ids comfortably; batch just in case
    const BATCH = 200
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const { error: delErr } = await supabaseClient
          .from('bankroll_sessions')
          .delete()
          .in('id', ids.slice(i, i + BATCH))
        if (delErr) throw delErr
      }
      exitSelectMode()
      await loadData()
    } catch (e) {
      setError(e.message || 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  // ── End-session preview ───────────────────────────────────────────────────

  const endAmtParsed = parseFloat(endAmount)
  const endPreviewWL = !isNaN(endAmtParsed) && activeSession
    ? endAmtParsed - Number(activeSession.start_amount)
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  const TAB_ITEMS = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'locations', label: 'LOCATIONS' },
    { id: 'charts', label: 'CHARTS' },
    { id: 'trend', label: 'TREND' },
  ]

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >

        <SlotsToolPageHeader quickLinkDestinationId="bankroll" />

        <FreemiumUsageCounter
          remaining={bankrollSessionsRemaining}
          limit={FREE_BANKROLL_SESSION_LIMIT}
          itemLabelPlural="sessions"
          loading={freemiumUsageLoading}
        />

        {/* Tab navigation */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar mb-5 -mx-3 px-3">
          {TAB_ITEMS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wide touch-manipulation transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Game type filter - shown on analytics tabs */}
        {activeTab !== 'overview' && completedSessions.length > 0 && (
          <div className="flex gap-1.5 mb-4">
            {[
              { id: 'all', label: 'All' },
              { id: 'slots', label: '🎰 Slots' },
              { id: 'tables', label: '🃏 Tables' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setGameTypeFilter(opt.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold touch-manipulation transition-colors ${
                  gameTypeFilter === opt.id
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800/60 text-zinc-500 active:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Non-overview tabs ── */}
        {activeTab === 'trend' && (
          <BankrollTrendTab sessions={tabSessions} adjustments={adjustments} initialBankroll={profile?.overall_bankroll ?? null} />
        )}
        {activeTab === 'charts' && (
          <BankrollChartsTab sessions={tabSessions} />
        )}
        {activeTab === 'locations' && (
          <BankrollLocationsTab sessions={tabSessions} />
        )}

        {/* ── Overview tab ── */}
        {activeTab === 'overview' && <>

        {/* Overall bankroll card */}
        <div data-bankroll-card className="rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700/40 p-5 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-1">Overall Bankroll</div>
              {loading ? (
                <div className="h-10 w-40 rounded-xl bg-zinc-700/40 animate-pulse" />
              ) : overallBankroll != null ? (
                <div className="text-4xl font-black text-white tracking-tight">{fmt$(overallBankroll)}</div>
              ) : (
                <button
                  onClick={openSetBankroll}
                  className="text-cyan-400 text-sm font-semibold mt-1 touch-manipulation"
                >
                  + Set your bankroll to get started
                </button>
              )}
            </div>
            {overallBankroll != null && (
              <button
                onClick={openSetBankroll}
                className="ml-4 shrink-0 rounded-xl bg-zinc-700/60 px-3 py-1.5 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-600"
              >
                Edit
              </button>
            )}
          </div>

          {/* All-time stats row */}
          {completedSessions.length > 0 && (
            <div className="mt-4 flex gap-5 border-t border-zinc-700/40 pt-4">
              <div>
                <div className="text-zinc-500 text-[10px] uppercase tracking-wide">All-time P/L</div>
                <div className={`text-sm font-bold mt-0.5 ${allTimeWinLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {allTimeWinLoss >= 0 ? '+' : ''}{fmt$(allTimeWinLoss)}
                </div>
              </div>
              <div>
                <div className="text-zinc-500 text-[10px] uppercase tracking-wide">Sessions</div>
                <div className="text-sm font-bold text-white mt-0.5">{completedSessions.length}</div>
              </div>
              {avgHourly != null && (
                <div>
                  <div className="text-zinc-500 text-[10px] uppercase tracking-wide">Avg/hr</div>
                  <div className={`text-sm font-bold mt-0.5 ${avgHourly >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {avgHourly >= 0 ? '+' : ''}{fmt$(avgHourly)}/hr
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active session card */}
        {activeSession ? (
          <div data-session-card className="rounded-3xl bg-emerald-950/60 border border-emerald-500/30 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold uppercase tracking-wide">Session in progress</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                {activeSession.casino_name && (
                  <div className="text-white font-bold text-lg leading-tight truncate">{activeSession.casino_name}</div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-zinc-400 text-sm">Started with {fmt$(activeSession.start_amount)}</span>
                  <button
                    onClick={openEditStartAmount}
                    className="text-zinc-500 hover:text-zinc-300 touch-manipulation active:text-white leading-none"
                    title="Edit starting amount"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.583 1.707a.25.25 0 0 0 .316.316l1.708-.583a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.475ZM3.75 11A.75.75 0 0 0 3 11.75v.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
                    </svg>
                  </button>
                </div>
                <div className="text-emerald-200 text-3xl font-black mt-2 tabular-nums">{fmtDuration(elapsed)}</div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={openRebuy}
                  className="rounded-2xl border border-emerald-500/60 px-4 py-2 text-sm font-bold text-emerald-300 touch-manipulation active:bg-emerald-900/40"
                >
                  Rebuy
                </button>
                <button
                  onClick={openEndSession}
                  className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-600"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        ) : (
          !loading && overallBankroll != null && (
            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={openStartSession}
                data-start-session-btn
                data-start-session-locked={!canCreateBankrollSession ? 'true' : undefined}
                className={`w-full rounded-3xl bg-cyan-600 py-4 text-white font-bold text-base touch-manipulation active:bg-cyan-700 ${
                  !canCreateBankrollSession ? 'opacity-45 cursor-not-allowed' : ''
                }`}
              >
                + Start Session
              </button>
              <button
                onClick={openLogPast}
                data-log-past-session-btn
                data-log-past-session-locked={!canCreateBankrollSession ? 'true' : undefined}
                className={`w-full rounded-2xl py-3 text-zinc-400 text-sm font-semibold touch-manipulation active:text-zinc-200 ${
                  !canCreateBankrollSession ? 'opacity-45 cursor-not-allowed' : ''
                }`}
              >
                Log previous session(s)
              </button>
            </div>
          )
        )}

        {/* Session history */}
        {completedSessions.length > 0 && (
          <div>
            {/* Header row */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Session History</div>
              <div className="flex items-center gap-3">
                {/* Filter toggle */}
                <button
                  onClick={() => setHistoryFilterOpen(v => !v)}
                  className="relative touch-manipulation"
                  aria-label="Filter sessions"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`w-4 h-4 transition-colors ${historyFilterOpen || historyActiveFilters > 0 ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.756a3 3 0 0 1-.879 2.122L10 9.5v4.572a.75.75 0 0 1-1.148.637l-2.5-1.667A.75.75 0 0 1 6 12.25V9.5L2.879 6.378A3 3 0 0 1 2 4.256V3.5Z" />
                  </svg>
                  {historyActiveFilters > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                      {historyActiveFilters}
                    </span>
                  )}
                </button>
                {/* Select / Cancel */}
                {!selectMode ? (
                  <button
                    onClick={enterSelectMode}
                    className="text-zinc-500 text-xs font-semibold touch-manipulation active:text-zinc-300"
                  >
                    Select
                  </button>
                ) : (
                  <button
                    onClick={exitSelectMode}
                    className="text-zinc-400 text-xs font-semibold touch-manipulation active:text-zinc-200"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Inline filter panel */}
            {historyFilterOpen && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-3 mb-3 space-y-2.5">
                {/* Game type row */}
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs w-14 shrink-0">Game</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[['all','All'],['slots','Slots'],['tables','Tables']].map(([v,label]) => (
                      <button
                        key={v}
                        onClick={() => setHistoryGameFilter(v)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold touch-manipulation transition-colors ${
                          historyGameFilter === v
                            ? 'bg-cyan-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Result row */}
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs w-14 shrink-0">Result</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[['all','All'],['wins','Wins'],['losses','Losses']].map(([v,label]) => (
                      <button
                        key={v}
                        onClick={() => setHistoryResultFilter(v)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold touch-manipulation transition-colors ${
                          historyResultFilter === v
                            ? 'bg-cyan-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Casino picker */}
                {uniqueCasinos.length > 0 && (
                  <div>
                    <button
                      onClick={() => setCasinoPickerOpen(v => !v)}
                      className="flex items-center gap-2 w-full touch-manipulation"
                    >
                      <span className="text-zinc-500 text-xs w-14 shrink-0">Casino</span>
                      <span className={`flex-1 text-left text-xs font-semibold ${historyCasinoFilter.length > 0 ? 'text-cyan-400' : 'text-zinc-500'}`}>
                        {historyCasinoFilter.length === 0
                          ? 'Any'
                          : historyCasinoFilter.length === 1
                          ? historyCasinoFilter[0]
                          : `${historyCasinoFilter.length} casinos`}
                      </span>
                      <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${casinoPickerOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {casinoPickerOpen && (
                      <div className="mt-2 max-h-44 overflow-y-auto rounded-xl bg-zinc-800/60 divide-y divide-zinc-700/40">
                        {/* "Any" - clears all selections */}
                        <button
                          onClick={() => setHistoryCasinoFilter([])}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 touch-manipulation active:bg-zinc-700/40"
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${
                            historyCasinoFilter.length === 0 ? 'bg-cyan-500 border-cyan-500' : 'border-zinc-600'
                          }`}>
                            {historyCasinoFilter.length === 0 && (
                              <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                                <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs text-zinc-300 font-medium">Any</span>
                        </button>
                        {uniqueCasinos.map(([name, count]) => {
                          const checked = historyCasinoFilter.includes(name)
                          return (
                            <button
                              key={name}
                              onClick={() => setHistoryCasinoFilter(prev =>
                                checked ? prev.filter(n => n !== name) : [...prev, name]
                              )}
                              className="flex items-center gap-2.5 w-full px-3 py-2.5 touch-manipulation active:bg-zinc-700/40"
                            >
                              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${
                                checked ? 'bg-cyan-500 border-cyan-500' : 'border-zinc-600'
                              }`}>
                                {checked && (
                                  <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                                    <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1 text-left text-xs text-zinc-300 font-medium truncate">{name}</span>
                              <span className="text-zinc-600 text-[10px] shrink-0">{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Clear all filters */}
                {historyActiveFilters > 0 && (
                  <button
                    onClick={() => { setHistoryGameFilter('all'); setHistoryResultFilter('all'); setHistoryCasinoFilter([]); setCasinoPickerOpen(false) }}
                    className="text-zinc-500 text-xs touch-manipulation active:text-zinc-300"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* Result count when filtering */}
            {historyActiveFilters > 0 && (
              <div className="text-zinc-600 text-xs px-1 mb-2">
                {filteredHistory.length} of {completedSessions.length} sessions
              </div>
            )}
            <div className="space-y-2">
              {filteredHistory.length === 0 && (
                <div className="text-center text-zinc-600 text-sm py-8">No sessions match the current filters.</div>
              )}
              {filteredHistory.map(session => {
                const wl = sessionWinLoss(session)
                const hr = hourlyRate(session)
                const durSecs = Math.round(sessionDurationHours(session) * 3600)
                const isSelected = selectedIds.has(session.id)
                return (
                  <button
                    key={session.id}
                    onClick={() => selectMode ? toggleSelectSession(session.id) : openEditSession(session)}
                    data-session-row
                    className={`w-full text-left rounded-2xl border p-4 touch-manipulation transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-700/60 active:bg-cyan-950/60'
                        : 'bg-zinc-900 border-zinc-800/60 active:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {selectMode && (
                        <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-zinc-600'
                        }`}>
                          {isSelected && (
                            <svg viewBox="0 0 10 10" fill="none" className="w-3 h-3">
                              <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-white font-semibold text-sm truncate min-w-0">
                                {session.casino_name || 'Session'}
                              </span>
                              <span className="text-zinc-600 text-xs shrink-0">{fmtDate(session.start_at)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-zinc-500 text-xs">{fmtDuration(durSecs)}</span>
                              {hr != null && (
                                <span className={`text-xs font-semibold ${hr >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {hr >= 0 ? '+' : ''}{fmt$(hr)}/hr
                                </span>
                              )}
                            </div>
                          </div>
                          {wl != null && (
                            <div className={`shrink-0 font-black text-xl tabular-nums ${wl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                              {wl >= 0 ? '+' : ''}{fmt$(wl)}
                            </div>
                          )}
                        </div>
                        {session.notes && (
                          <div className="text-zinc-500 text-xs mt-2 line-clamp-1">{session.notes}</div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!loading && completedSessions.length === 0 && !activeSession && overallBankroll != null && (
          <div className="text-center text-zinc-600 text-sm mt-12">No sessions yet - start one above.</div>
        )}

        </>}

      </ScrollLinkedEdgeTitleBarShell>

      {/* ── Bottom sheets ─────────────────────────────────────── */}

      {sheet && sheet !== 'import' && (
        <div
          className={APP_MODAL_OVERLAY_CLASS}
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
        >
          <div data-bankroll-sheet className={APP_MODAL_SHEET_PANEL_CLASS}>

            {/* Set / update bankroll */}
            {sheet === 'setBankroll' && (
              <>
                <SheetHeader title={profile ? 'Update Bankroll' : 'Set Your Bankroll'} onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-5 leading-relaxed">
                  Your total gambling bankroll. This updates automatically each time you end a session.
                </p>
                <label className="block text-zinc-400 text-xs mb-1.5">Bankroll amount</label>
                <div className="mb-5">
                  <MoneyInput
                    value={bankrollInput}
                    onChange={setBankrollInput}
                    placeholder="10000"
                    autoFocus
                    inputClassName="min-h-14 text-xl font-bold"
                  />
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={saveBankroll}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}

            {/* Start session */}
            {sheet === 'startSession' && (
              <>
                <SheetHeader title="Start Session" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / Location</label>
                    <CasinoAutocomplete
                      value={startCasino}
                      onChange={setStartCasino}
                      supabaseClient={supabaseClient}
                      nearbyCasinos={nearbyCasinos}
                      gpsLoading={gpsLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Game type</label>
                    <GameTypeToggle value={startGameType} onChange={setStartGameType} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Date</label>
                      <DateWheelPicker
                        value={startDate}
                        onChange={setStartDate}
                        showYear
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start time</label>
                      <TimeWheelPicker
                        value={startTime}
                        onChange={setStartTime}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Session starting amount</label>
                    <MoneyInput
                      value={startAmount}
                      onChange={setStartAmount}
                      placeholder="How much are you taking today?"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={startSession}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Starting…' : 'Start Session'}
                </button>
              </>
            )}

            {/* End session */}
            {sheet === 'endSession' && activeSession && (
              <>
                <SheetHeader title="End Session" onClose={closeSheet} />
                <div className="rounded-2xl bg-zinc-800/60 border border-zinc-700/40 p-4 mb-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-white font-semibold text-sm">
                        {activeSession.casino_name || 'Session'}
                      </div>
                      <div className="text-zinc-400 text-xs mt-0.5">Started with {fmt$(activeSession.start_amount)}</div>
                    </div>
                    <div className="text-emerald-300 font-black text-lg tabular-nums">{fmtDuration(elapsed)}</div>
                  </div>
                </div>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Final session amount</label>
                    <MoneyInput
                      value={endAmount}
                      onChange={setEndAmount}
                      placeholder="How much are you walking away with?"
                      autoFocus
                    />
                  </div>
                  {endPreviewWL != null && (
                    <div data-wl-preview={endPreviewWL >= 0 ? 'win' : 'loss'} className={`rounded-2xl px-4 py-3 flex items-center justify-between ${endPreviewWL >= 0 ? 'bg-emerald-950/70 border border-emerald-800/40' : 'bg-red-950/70 border border-red-900/40'}`}>
                      <div>
                        <div className={`text-sm font-bold ${endPreviewWL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {endPreviewWL >= 0 ? '+' : ''}{fmt$(endPreviewWL)} this session
                        </div>
                        {overallBankroll != null && (
                          <div className="text-zinc-400 text-xs mt-0.5">
                            Bankroll → {fmt$(overallBankroll + endPreviewWL)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Notes (optional)</label>
                    <textarea
                      value={sessionNotes}
                      onChange={e => setSessionNotes(e.target.value)}
                      placeholder="Machine mix, promo used, notable hits…"
                      className="w-full min-h-20 rounded-2xl bg-zinc-800 px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={endSession}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-emerald-600 text-white font-bold touch-manipulation active:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'End Session'}
                </button>
              </>
            )}

            {/* Log past session */}
            {/* Rebuy */}
            {sheet === 'rebuy' && activeSession && (
              <>
                <SheetHeader title="Rebuy" onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                  How much are you adding to your session bankroll?
                </p>
                <div className="mb-5">
                  <label className="block text-zinc-400 text-xs mb-1.5">Rebuy amount</label>
                  <MoneyInput
                    value={rebuyAmount}
                    onChange={setRebuyAmount}
                    placeholder="e.g. 200"
                    autoFocus
                    inputClassName="min-h-14 text-xl font-bold"
                  />
                  {rebuyAmount && !isNaN(parseFloat(rebuyAmount)) && (
                    <p className="text-zinc-400 text-xs mt-2">
                      New total: {fmt$(Number(activeSession.start_amount) + parseFloat(rebuyAmount))}
                    </p>
                  )}
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={saveRebuy}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-emerald-600 text-white font-bold touch-manipulation active:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Add to Session'}
                </button>
              </>
            )}

            {/* Edit start amount */}
            {sheet === 'editStartAmount' && activeSession && (
              <>
                <SheetHeader title="Edit Starting Amount" onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                  Correct the amount you started this session with.
                </p>
                <div className="mb-5">
                  <label className="block text-zinc-400 text-xs mb-1.5">Starting amount</label>
                  <MoneyInput
                    value={editStartAmount}
                    onChange={setEditStartAmount}
                    placeholder="0"
                    autoFocus
                    inputClassName="min-h-14 text-xl font-bold"
                  />
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={saveEditStartAmount}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}

            {sheet === 'logPast' && (
              <>
                <SheetHeader title="Log Previous Session(s)" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / Location</label>
                    <CasinoAutocomplete
                      value={pastFields.casino_name}
                      onChange={v => setPastFields(p => ({ ...p, casino_name: v }))}
                      supabaseClient={supabaseClient}
                      nearbyCasinos={nearbyCasinos}
                      gpsLoading={gpsLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Game type</label>
                    <GameTypeToggle value={pastFields.game_type || 'slots'} onChange={v => setPastFields(p => ({ ...p, game_type: v }))} />
                  </div>
                  {/* Row 1: Date · Start time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Date</label>
                      <DateWheelPicker
                        value={pastFields.date}
                        onChange={v => setPastFields(p => ({ ...p, date: v }))}
                        showYear
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start time</label>
                      <TimeWheelPicker
                        value={pastFields.start_time}
                        onChange={v => setPastFields(p => ({ ...p, start_time: v }))}
                      />
                    </div>
                  </div>
                  {/* Duration */}
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Hours played</label>
                    <div className="flex items-center rounded-2xl bg-zinc-800 overflow-hidden min-h-12">
                      <button
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => {
                          const v = Math.max(0, Math.round((parseFloat(pastFields.duration_hours || 0) - 0.1) * 10) / 10)
                          setPastFields(p => ({ ...p, duration_hours: String(v) }))
                        }}
                        className="px-4 h-full text-zinc-400 text-lg font-bold touch-manipulation active:text-white active:bg-zinc-700 select-none"
                      >−</button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pastFields.duration_hours}
                        onChange={e => setPastFields(p => ({ ...p, duration_hours: e.target.value }))}
                        className="flex-1 min-w-0 bg-transparent text-white text-sm text-center outline-none"
                      />
                      <button
                        type="button"
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => {
                          const v = Math.round((parseFloat(pastFields.duration_hours || 0) + 0.1) * 10) / 10
                          setPastFields(p => ({ ...p, duration_hours: String(v) }))
                        }}
                        className="px-4 h-full text-zinc-400 text-lg font-bold touch-manipulation active:text-white active:bg-zinc-700 select-none"
                      >+</button>
                    </div>
                  </div>
                  {/* Row 2: Start amount · End amount · Win/Loss */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Buy-in</label>
                      <MoneyInput
                        value={pastFields.start_amount}
                        onChange={val => {
                          const s = parseFloat(val)
                          const e = parseFloat(pastFields.end_amount)
                          const wl = !isNaN(s) && !isNaN(e) ? String((e - s).toFixed(2)) : pastFields.win_loss
                          setPastFields(p => ({ ...p, start_amount: val, win_loss: wl }))
                        }}
                        placeholder="0"
                        tight
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Cash-out</label>
                      <MoneyInput
                        value={pastFields.end_amount}
                        onChange={val => {
                          const s = parseFloat(pastFields.start_amount)
                          const e = parseFloat(val)
                          const wl = !isNaN(s) && !isNaN(e) ? String((e - s).toFixed(2)) : pastFields.win_loss
                          setPastFields(p => ({ ...p, end_amount: val, win_loss: wl }))
                        }}
                        placeholder="0"
                        tight
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Win / Loss</label>
                      <MoneyInput
                        value={pastFields.win_loss}
                        onChange={val => {
                          const wl = parseFloat(val)
                          const s = parseFloat(pastFields.start_amount)
                          const end = !isNaN(wl) && !isNaN(s) ? String((s + wl).toFixed(2)) : pastFields.end_amount
                          setPastFields(p => ({ ...p, win_loss: val, end_amount: end }))
                        }}
                        placeholder="0"
                        allowNegative
                        colorize
                        tight
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Notes (optional)</label>
                    <textarea
                      value={pastFields.notes}
                      onChange={e => setPastFields(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Machine mix, promo used, notable hits…"
                      className="w-full min-h-20 rounded-2xl bg-zinc-800 px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  onClick={saveLogPast}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Session'}
                </button>

                <div className="flex items-center gap-3 mt-5 mb-1">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-zinc-600 text-xs">have multiple sessions?</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
                <button
                  onClick={() => setSheet('import')}
                  className="w-full py-3 text-zinc-500 text-sm font-semibold touch-manipulation active:text-zinc-300 flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                  </svg>
                  Import from CSV
                </button>
              </>
            )}

            {/* Edit session */}
            {sheet === 'editSession' && editingSession && (
              <>
                <SheetHeader title="Edit Session" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / Location</label>
                    <CasinoAutocomplete
                      value={editFields.casino_name}
                      onChange={v => setEditFields(p => ({ ...p, casino_name: v }))}
                      supabaseClient={supabaseClient}
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Game type</label>
                    <GameTypeToggle value={editFields.game_type || 'slots'} onChange={v => setEditFields(p => ({ ...p, game_type: v }))} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Start</label>
                    <div className="grid grid-cols-2 gap-2">
                      <DateWheelPicker
                        value={editFields.start_date}
                        onChange={v => setEditFields(p => ({ ...p, start_date: v }))}
                        showYear
                      />
                      <TimeWheelPicker
                        value={editFields.start_time}
                        onChange={v => setEditFields(p => ({ ...p, start_time: v }))}
                      />
                    </div>
                  </div>
                  {editingSession.status === 'completed' && (
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">End</label>
                      <div className="grid grid-cols-2 gap-2">
                        <DateWheelPicker
                          value={editFields.end_date}
                          onChange={v => setEditFields(p => ({ ...p, end_date: v }))}
                          showYear
                        />
                        <TimeWheelPicker
                          value={editFields.end_time}
                          onChange={v => setEditFields(p => ({ ...p, end_time: v }))}
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start amount</label>
                      <MoneyInput
                        value={editFields.start_amount}
                        onChange={val => setEditFields(p => ({ ...p, start_amount: val }))}
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">End amount</label>
                      <MoneyInput
                        value={editFields.end_amount}
                        onChange={val => setEditFields(p => ({ ...p, end_amount: val }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Notes</label>
                    <textarea
                      value={editFields.notes}
                      onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))}
                      className="w-full min-h-20 rounded-2xl bg-zinc-800 px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => deleteSession(editingSession.id)}
                    className="rounded-2xl border border-zinc-700 px-4 min-h-12 text-zinc-400 text-sm font-semibold touch-manipulation active:bg-zinc-800"
                  >
                    Delete
                  </button>
                  <button
                    onClick={saveEditSession}
                    disabled={saving}
                    className="flex-1 min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {sheet === 'import' && (
        <BankrollImportSheet
          supabaseClient={supabaseClient}
          userId={userId}
          completedSessions={completedSessions}
          onClose={closeSheet}
          onImported={loadData}
        />
      )}

      {/* ── Bulk-select action bar ─────────────────────────────────────── */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-[50] bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="shrink-0 text-zinc-400 text-sm font-semibold touch-manipulation active:text-zinc-200"
            >
              {selectedIds.size === completedSessions.length ? 'Deselect All' : 'Select All'}
            </button>
            <div className="flex-1 text-center text-zinc-500 text-sm">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'None selected'}
            </div>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0 || saving}
              className={`shrink-0 min-w-[90px] px-4 py-2 rounded-2xl text-sm font-bold touch-manipulation transition-colors disabled:opacity-30 ${
                deleteConfirm
                  ? 'bg-red-600 text-white active:bg-red-700'
                  : 'text-red-500 active:text-red-300'
              }`}
            >
              {saving ? 'Deleting…' : deleteConfirm ? 'Confirm?' : `Delete ${selectedIds.size > 0 ? selectedIds.size : ''}`}
            </button>
          </div>
        </div>
      )}
    </>
  )
}


function MoneyInput({
  value, onChange, placeholder = '0',
  tight = false, inputClassName = '',
  allowNegative = false, colorize = false,
  autoFocus,
}) {
  const numVal = parseFloat(value)
  const hasValue = value !== '' && value !== '-'
  const textColor = colorize && hasValue
    ? numVal >= 0 ? 'text-emerald-300' : 'text-red-300'
    : 'text-white'

  return (
    <div className="relative">
      <span className={`absolute top-1/2 -translate-y-1/2 text-zinc-400 font-semibold pointer-events-none ${tight ? 'left-3 text-sm' : 'left-4'}`}>$</span>
      <input
        type="text"
        inputMode={allowNegative ? 'text' : 'decimal'}
        value={value}
        onChange={e => {
          const raw = e.target.value
          if (allowNegative) {
            // Allow minus only at start, strip other non-numeric chars
            const cleaned = raw.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '')
            onChange(cleaned)
          } else {
            onChange(raw)
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full min-h-12 rounded-2xl bg-zinc-800 ${tight ? 'pl-6 pr-1 text-sm' : 'pl-8 pr-4'} outline-none focus:ring-2 focus:ring-cyan-500/40 font-semibold ${hasValue ? textColor : ''} ${inputClassName}`}
      />
    </div>
  )
}

function GameTypeToggle({ value, onChange }) {
  return (
    <div className="flex rounded-2xl bg-zinc-800 p-1 gap-1">
      {['slots', 'tables'].map(type => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold touch-manipulation transition-colors capitalize ${
            value === type
              ? 'bg-cyan-600 text-white'
              : 'text-zinc-400 active:bg-zinc-700'
          }`}
        >
          {type === 'slots' ? '🎰 Slots' : '🃏 Tables'}
        </button>
      ))}
    </div>
  )
}

function SheetHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="text-white font-bold text-lg">{title}</div>
      <button
        onClick={onClose}
        className="rounded-full w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm touch-manipulation active:bg-zinc-700"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  )
}
