import { useCallback, useEffect, useMemo, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_POKER_BANKROLL_SESSION_LIMIT } from '../billing/freemiumToolLimits.js'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import {
  fmtPoker$,
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
  POKER_GAME_VARIANTS,
  POKER_LIMIT_TYPES,
  POKER_TABLE_SIZES,
  pokerSessionMetaLine,
  pokerSessionStakesLabel,
} from './pokerSessionLabels.js'

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
    game_variant: 'nlh',
    limit_type: 'no_limit',
    table_size: 'full_ring',
    small_blind: '',
    big_blind: '',
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
 * Simple by default; Advanced expands pro fields.
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
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [typeFilter, setTypeFilter] = useState('all') // all | cash | tournament
  const [venueFilter, setVenueFilter] = useState('all') // all | live | online

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

  const loadSessions = useCallback(async () => {
    if (!supabaseClient || !userId) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: qErr } = await supabaseClient
        .from('poker_bankroll_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('start_at', { ascending: false })
        .limit(500)
      if (qErr) throw qErr
      setSessions(data || [])
    } catch (e) {
      setError(e?.message || 'Could not load poker sessions.')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (typeFilter !== 'all' && s.session_type !== typeFilter) return false
      if (venueFilter !== 'all' && s.venue_kind !== venueFilter) return false
      return true
    })
  }, [sessions, typeFilter, venueFilter])

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

  function openCreate() {
    if (!canCreatePokerBankrollSession) {
      onRequireSubscribeForPokerBankroll?.()
      return
    }
    setEditingId(null)
    setForm(emptyForm())
    setShowAdvanced(false)
    setError('')
    setSheetOpen(true)
    triggerTapHapticLight()
  }

  function openEdit(session) {
    const start = new Date(session.start_at)
    const hrs = pokerSessionDurationHours(session)
    setEditingId(session.id)
    setForm({
      session_type: session.session_type || 'cash',
      venue_kind: session.venue_kind || 'live',
      venue_name: session.venue_name || '',
      date: localYmd(start),
      start_time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      duration_hours: formatDurationHoursField(hrs || 0),
      buy_in: session.buy_in != null ? String(session.buy_in) : '',
      cash_out: session.cash_out != null ? String(session.cash_out) : '',
      game_variant: session.game_variant || 'nlh',
      limit_type: session.limit_type || 'no_limit',
      table_size: session.table_size || 'full_ring',
      small_blind: session.small_blind != null ? String(session.small_blind) : '',
      big_blind: session.big_blind != null ? String(session.big_blind) : '',
      tournament_name: session.tournament_name || '',
      field_size: session.field_size != null ? String(session.field_size) : '',
      start_stack: session.start_stack != null ? String(session.start_stack) : '',
      finish_place: session.finish_place != null ? String(session.finish_place) : '',
      bounty_winnings: session.bounty_winnings != null ? String(session.bounty_winnings) : '',
      reentries: session.reentries != null ? String(session.reentries) : '',
      notes: session.notes || '',
    })
    const hasAdvanced = Boolean(
      session.game_variant ||
        session.small_blind != null ||
        session.big_blind != null ||
        session.tournament_name ||
        session.field_size != null ||
        session.finish_place != null ||
        session.bounty_winnings != null ||
        session.notes,
    )
    setShowAdvanced(hasAdvanced)
    setError('')
    setSheetOpen(true)
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
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
      game_variant: form.game_variant || null,
      limit_type: showAdvanced ? form.limit_type || null : null,
      table_size: showAdvanced ? form.table_size || null : null,
      small_blind:
        showAdvanced && form.session_type === 'cash' && form.small_blind !== ''
          ? parseFloat(form.small_blind)
          : null,
      big_blind:
        showAdvanced && form.session_type === 'cash' && form.big_blind !== ''
          ? parseFloat(form.big_blind)
          : null,
      tournament_name:
        form.session_type === 'tournament' ? form.tournament_name.trim() || null : null,
      field_size:
        showAdvanced && form.session_type === 'tournament' && form.field_size !== ''
          ? parseInt(form.field_size, 10)
          : null,
      start_stack:
        showAdvanced && form.session_type === 'tournament' && form.start_stack !== ''
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

    // Always keep blinds on cash when user typed them even if advanced collapsed after edit
    if (form.session_type === 'cash') {
      if (form.small_blind !== '') payload.small_blind = parseFloat(form.small_blind)
      if (form.big_blind !== '') payload.big_blind = parseFloat(form.big_blind)
    }

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
      } else {
        if (!canCreatePokerBankrollSession) {
          onRequireSubscribeForPokerBankroll?.()
          return
        }
        const { error: iErr } = await supabaseClient.from('poker_bankroll_sessions').insert(payload)
        if (iErr) throw iErr
        onPokerBankrollSessionCreated?.()
      }
      setSheetOpen(false)
      triggerTapHapticLight()
      await loadSessions()
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
      setSheetOpen(false)
      await loadSessions()
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

        {error && !sheetOpen ? (
          <p className="mb-3 text-center text-sm text-rose-400">{error}</p>
        ) : null}

        {loading ? (
          <p className="py-16 text-center text-sm text-zinc-500">Loading sessions…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-10 text-center">
            <p className="text-white font-semibold">No poker sessions yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Log a cash game or tournament in under a minute.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white touch-manipulation active:bg-emerald-500"
            >
              Log session
            </button>
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

      {/* FAB */}
      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-[40] flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl font-light text-white shadow-lg shadow-black/40 touch-manipulation active:scale-95"
        aria-label="Log poker session"
      >
        +
      </button>

      {sheetOpen ? (
        <div
          className={APP_MODAL_OVERLAY_CLASS}
          data-poker-bankroll-sheet
          onClick={() => !saving && setSheetOpen(false)}
        >
          <div
            className={`${APP_MODAL_SHEET_PANEL_CLASS} max-h-[92dvh] overflow-y-auto overscroll-y-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold text-white">
                {editingId ? 'Edit session' : 'Log session'}
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-400 touch-manipulation"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Simple path */}
            <Segmented
              label="Type"
              value={form.session_type}
              onChange={(v) => setField('session_type', v)}
              options={[
                { id: 'cash', label: 'Cash' },
                { id: 'tournament', label: 'Tourney' },
              ]}
            />
            <Segmented
              label="Where"
              value={form.venue_kind}
              onChange={(v) => setField('venue_kind', v)}
              options={[
                { id: 'live', label: 'Live' },
                { id: 'online', label: 'Online' },
              ]}
            />

            <FieldLabel>
              {form.venue_kind === 'online' ? 'Site' : 'Casino / venue'}
            </FieldLabel>
            {form.venue_kind === 'live' ? (
              <CasinoAutocomplete
                value={form.venue_name}
                onChange={(v) => setField('venue_name', v)}
                supabaseClient={supabaseClient}
                placeholder="Wynn, Aria…"
                className="mb-3"
              />
            ) : (
              <input
                type="text"
                value={form.venue_name}
                onChange={(e) => setField('venue_name', e.target.value)}
                placeholder="PokerStars, ClubWPT…"
                className="mb-3 w-full min-h-12 rounded-2xl bg-zinc-800 px-4 font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full min-h-12 rounded-2xl bg-zinc-800 px-3 font-semibold text-white outline-none"
                />
              </div>
              <div>
                <FieldLabel>Start time</FieldLabel>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setField('start_time', e.target.value)}
                  className="w-full min-h-12 rounded-2xl bg-zinc-800 px-3 font-semibold text-white outline-none"
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
                className="min-h-12 flex-1 rounded-2xl bg-zinc-800 px-4 text-center font-semibold text-white outline-none"
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

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>
                  {form.session_type === 'tournament' ? 'Buy-in' : 'Bring-in'}
                </FieldLabel>
                <MoneyInput value={form.buy_in} onChange={(v) => setField('buy_in', v)} />
              </div>
              <div>
                <FieldLabel>Cash out</FieldLabel>
                <MoneyInput
                  value={form.cash_out}
                  onChange={(v) => setField('cash_out', v)}
                  colorize
                />
              </div>
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
                  Blinds, game, place, bounties, notes
                </span>
              </span>
              <span className="text-zinc-400">{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced ? (
              <div className="mb-3 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>Game</FieldLabel>
                    <Select
                      value={form.game_variant}
                      onChange={(v) => setField('game_variant', v)}
                      options={POKER_GAME_VARIANTS}
                    />
                  </div>
                  <div>
                    <FieldLabel>Limit</FieldLabel>
                    <Select
                      value={form.limit_type}
                      onChange={(v) => setField('limit_type', v)}
                      options={POKER_LIMIT_TYPES}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Table size</FieldLabel>
                  <Select
                    value={form.table_size}
                    onChange={(v) => setField('table_size', v)}
                    options={POKER_TABLE_SIZES}
                  />
                </div>

                {form.session_type === 'cash' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Small blind</FieldLabel>
                      <MoneyInput
                        value={form.small_blind}
                        onChange={(v) => setField('small_blind', v)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Big blind</FieldLabel>
                      <MoneyInput
                        value={form.big_blind}
                        onChange={(v) => setField('big_blind', v)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <FieldLabel>Tournament name</FieldLabel>
                      <input
                        type="text"
                        value={form.tournament_name}
                        onChange={(e) => setField('tournament_name', e.target.value)}
                        placeholder="Daily $200, WSOP…"
                        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 font-semibold text-white outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Field size</FieldLabel>
                        <NumInput
                          value={form.field_size}
                          onChange={(v) => setField('field_size', v)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Finish place</FieldLabel>
                        <NumInput
                          value={form.finish_place}
                          onChange={(v) => setField('finish_place', v)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Start stack</FieldLabel>
                        <NumInput
                          value={form.start_stack}
                          onChange={(v) => setField('start_stack', v)}
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
                )}

                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm text-white outline-none"
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
      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-3 font-semibold text-white outline-none"
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
      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 font-semibold text-white outline-none"
    />
  )
}

function MoneyInput({ value, onChange, colorize = false }) {
  const numVal = parseFloat(value)
  const hasValue = value !== '' && value !== '-'
  const textColor =
    colorize && hasValue ? (numVal >= 0 ? 'text-emerald-300' : 'text-red-300') : 'text-white'
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-zinc-400">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className={`w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 pr-4 font-semibold outline-none focus:ring-2 focus:ring-emerald-500/40 ${
          hasValue ? textColor : 'text-white'
        }`}
      />
    </div>
  )
}
