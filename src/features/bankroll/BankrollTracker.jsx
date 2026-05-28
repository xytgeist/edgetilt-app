import { useState, useEffect, useCallback } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null || isNaN(n)) return '—'
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

export default function BankrollTracker({ supabaseClient, titleBarNavSlot = null }) {
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState(null) // null | 'setBankroll' | 'startSession' | 'endSession' | 'editSession' | 'logPast'
  const [editingSession, setEditingSession] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Sheet form state
  const [bankrollInput, setBankrollInput] = useState('')
  const [startCasino, setStartCasino] = useState('')
  const [startAmount, setStartAmount] = useState('')
  const [endAmount, setEndAmount] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [editFields, setEditFields] = useState({})
  const [pastFields, setPastFields] = useState({})

  const activeSession = sessions.find(s => s.status === 'active') ?? null
  const completedSessions = sessions.filter(s => s.status === 'completed')
  const overallBankroll = profile ? Number(profile.overall_bankroll) : null

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!supabaseClient) return
    try {
      const { data: { user } } = await supabaseClient.auth.getUser()
      if (user) setUserId(user.id)
      const [profileRes, sessionsRes] = await Promise.all([
        supabaseClient.from('bankroll_profiles').select('*').maybeSingle(),
        supabaseClient
          .from('bankroll_sessions')
          .select('*')
          .order('start_at', { ascending: false })
          .limit(200)
      ])
      if (profileRes.data) setProfile(profileRes.data)
      if (sessionsRes.data) setSessions(sessionsRes.data)
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
      const { data, error: err } = await supabaseClient
        .from('bankroll_profiles')
        .upsert({ user_id: userId, overall_bankroll: val }, { onConflict: 'user_id' })
        .select().single()
      if (err) throw err
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
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .insert({ user_id: userId, casino_name: startCasino.trim() || null, start_amount: amt, start_at: new Date().toISOString(), status: 'active' })
        .select().single()
      if (err) throw err
      setSessions(prev => [data, ...prev])
      setSheet(null); setStartCasino(''); setStartAmount('')
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
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabaseClient
        .from('bankroll_sessions')
        .update({
          casino_name: (editFields.casino_name || '').trim() || null,
          start_amount: startAmt,
          end_amount: endAmt != null && !isNaN(endAmt) ? endAmt : null,
          notes: (editFields.notes || '').trim() || null
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
    const startAmt = parseFloat(pastFields.start_amount)
    const endAmt = parseFloat(pastFields.end_amount)
    if (isNaN(startAmt) || startAmt < 0) { setError('Enter a valid start amount.'); return }
    if (isNaN(endAmt) || endAmt < 0) { setError('Enter a valid end amount.'); return }
    if (!pastFields.date) { setError('Select a date.'); return }
    setSaving(true); setError('')
    try {
      const startAt = new Date(`${pastFields.date}T${pastFields.start_time || '12:00'}:00`).toISOString()
      const durationHrs = parseFloat(pastFields.duration_hours)
      const endAt = !isNaN(durationHrs) && durationHrs > 0
        ? new Date(new Date(startAt).getTime() + durationHrs * 3_600_000).toISOString()
        : null
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
          notes: (pastFields.notes || '').trim() || null
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
    } catch (e) {
      setError(e.message || 'Could not save session.')
    } finally {
      setSaving(false)
    }
  }

  const openLogPast = () => {
    const today = new Date().toISOString().slice(0, 10)
    setPastFields({ casino_name: '', date: today, start_time: '', duration_hours: '', start_amount: '', end_amount: '', notes: '' })
    setError(''); setSheet('logPast')
  }

  const openSetBankroll = () => {
    setBankrollInput(profile ? String(profile.overall_bankroll) : '')
    setError(''); setSheet('setBankroll')
  }
  const openStartSession = () => {
    setStartCasino(''); setStartAmount(''); setError(''); setSheet('startSession')
  }
  const openEndSession = () => {
    setEndAmount(''); setSessionNotes(''); setError(''); setSheet('endSession')
  }
  const openEditSession = (session) => {
    setEditingSession(session)
    setEditFields({
      casino_name: session.casino_name || '',
      start_amount: String(session.start_amount),
      end_amount: session.end_amount != null ? String(session.end_amount) : '',
      notes: session.notes || ''
    })
    setError(''); setSheet('editSession')
  }
  const closeSheet = () => { setSheet(null); setError('') }

  // ── End-session preview ───────────────────────────────────────────────────

  const endAmtParsed = parseFloat(endAmount)
  const endPreviewWL = !isNaN(endAmtParsed) && activeSession
    ? endAmtParsed - Number(activeSession.start_amount)
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >

        {/* Overall bankroll card */}
        <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700/40 p-5 mb-4">
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
          <div className="rounded-3xl bg-emerald-950/60 border border-emerald-500/30 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold uppercase tracking-wide">Session in progress</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                {activeSession.casino_name && (
                  <div className="text-white font-bold text-lg leading-tight truncate">{activeSession.casino_name}</div>
                )}
                <div className="text-zinc-400 text-sm mt-0.5">Started with {fmt$(activeSession.start_amount)}</div>
                <div className="text-emerald-200 text-3xl font-black mt-2 tabular-nums">{fmtDuration(elapsed)}</div>
              </div>
              <button
                onClick={openEndSession}
                className="shrink-0 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white touch-manipulation active:bg-emerald-600"
              >
                End Session
              </button>
            </div>
          </div>
        ) : (
          !loading && overallBankroll != null && (
            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={openStartSession}
                className="w-full rounded-3xl bg-cyan-600 py-4 text-white font-bold text-base touch-manipulation active:bg-cyan-700"
              >
                + Start Session
              </button>
              <button
                onClick={openLogPast}
                className="w-full rounded-2xl py-3 text-zinc-400 text-sm font-semibold touch-manipulation active:text-zinc-200"
              >
                Log a past session
              </button>
            </div>
          )
        )}

        {/* Session history */}
        {completedSessions.length > 0 && (
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-2 px-1">Session History</div>
            <div className="space-y-2">
              {completedSessions.map(session => {
                const wl = sessionWinLoss(session)
                const hr = hourlyRate(session)
                const durSecs = Math.round(sessionDurationHours(session) * 3600)
                return (
                  <button
                    key={session.id}
                    onClick={() => openEditSession(session)}
                    className="w-full text-left rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 touch-manipulation active:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm truncate">
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
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!loading && completedSessions.length === 0 && !activeSession && overallBankroll != null && (
          <div className="text-center text-zinc-600 text-sm mt-12">No sessions yet — start one above.</div>
        )}

      </ScrollLinkedEdgeTitleBarShell>

      {/* ── Bottom sheets ─────────────────────────────────────── */}

      {sheet && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
        >
          <div data-bankroll-sheet className="w-full max-w-lg rounded-t-3xl bg-zinc-900 border-t border-zinc-700/50 px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">

            {/* Set / update bankroll */}
            {sheet === 'setBankroll' && (
              <>
                <SheetHeader title={profile ? 'Update Bankroll' : 'Set Your Bankroll'} onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-5 leading-relaxed">
                  Your total gambling bankroll. This updates automatically each time you end a session.
                </p>
                <label className="block text-zinc-400 text-xs mb-1.5">Bankroll amount</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={bankrollInput}
                  onChange={e => setBankrollInput(e.target.value)}
                  placeholder="e.g. 10000"
                  autoFocus
                  className="w-full min-h-14 rounded-2xl bg-zinc-800 px-4 text-white text-xl font-bold outline-none focus:ring-2 focus:ring-cyan-500/40 mb-5"
                />
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
                    <input
                      type="text"
                      value={startCasino}
                      onChange={e => setStartCasino(e.target.value)}
                      placeholder="e.g. Bellagio"
                      autoFocus
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Session starting amount</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={startAmount}
                      onChange={e => setStartAmount(e.target.value)}
                      placeholder="How much are you taking today?"
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
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
                    <input
                      type="number"
                      inputMode="decimal"
                      value={endAmount}
                      onChange={e => setEndAmount(e.target.value)}
                      placeholder="How much are you walking away with?"
                      autoFocus
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  {endPreviewWL != null && (
                    <div className={`rounded-2xl px-4 py-3 flex items-center justify-between ${endPreviewWL >= 0 ? 'bg-emerald-950/70 border border-emerald-800/40' : 'bg-red-950/70 border border-red-900/40'}`}>
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
            {sheet === 'logPast' && (
              <>
                <SheetHeader title="Log Past Session" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / Location</label>
                    <input
                      type="text"
                      value={pastFields.casino_name}
                      onChange={e => setPastFields(p => ({ ...p, casino_name: e.target.value }))}
                      placeholder="e.g. Bellagio"
                      autoFocus
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Date</label>
                      <input
                        type="date"
                        value={pastFields.date}
                        onChange={e => setPastFields(p => ({ ...p, date: e.target.value }))}
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start time (optional)</label>
                      <TimeWheelPicker
                        value={pastFields.start_time}
                        onChange={v => setPastFields(p => ({ ...p, start_time: v }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Duration in hours (optional — e.g. 2.5)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={pastFields.duration_hours}
                      onChange={e => setPastFields(p => ({ ...p, duration_hours: e.target.value }))}
                      placeholder="e.g. 3"
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start amount</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={pastFields.start_amount}
                        onChange={e => setPastFields(p => ({ ...p, start_amount: e.target.value }))}
                        placeholder="Buy-in"
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">End amount</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={pastFields.end_amount}
                        onChange={e => setPastFields(p => ({ ...p, end_amount: e.target.value }))}
                        placeholder="Cash-out"
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                  </div>
                  {(() => {
                    const s = parseFloat(pastFields.start_amount)
                    const e = parseFloat(pastFields.end_amount)
                    if (isNaN(s) || isNaN(e)) return null
                    const wl = e - s
                    return (
                      <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${wl >= 0 ? 'bg-emerald-950/70 border border-emerald-800/40 text-emerald-300' : 'bg-red-950/70 border border-red-900/40 text-red-300'}`}>
                        {wl >= 0 ? '+' : ''}{fmt$(wl)} this session
                      </div>
                    )
                  })()}
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
              </>
            )}

            {/* Edit session */}
            {sheet === 'editSession' && editingSession && (
              <>
                <SheetHeader title="Edit Session" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / Location</label>
                    <input
                      type="text"
                      value={editFields.casino_name}
                      onChange={e => setEditFields(p => ({ ...p, casino_name: e.target.value }))}
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Start amount</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editFields.start_amount}
                        onChange={e => setEditFields(p => ({ ...p, start_amount: e.target.value }))}
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">End amount</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={editFields.end_amount}
                        onChange={e => setEditFields(p => ({ ...p, end_amount: e.target.value }))}
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
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
    </>
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
