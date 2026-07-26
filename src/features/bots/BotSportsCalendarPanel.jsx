import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchSportsBettingCalendarAll,
  saveSportsBettingCalendarRow,
} from './botPortalApi.js'

const COVERAGE_TIERS = [
  { id: '', label: 'Auto (from sport key)' },
  { id: '1', label: 'Tier 1 · Heavy' },
  { id: '2', label: 'Tier 2 · Medium' },
  { id: '3', label: 'Tier 3 · Opportunistic' },
]

const TIER_LABELS = {
  1: 'T1',
  2: 'T2',
  3: 'T3',
}

const CALENDAR_KINDS = [
  { id: 'season', label: 'Season' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'marquee', label: 'Marquee' },
]

const STATUS_STYLES = {
  active: 'bg-emerald-950/60 text-emerald-200 ring-emerald-500/35',
  upcoming: 'bg-cyan-950/50 text-cyan-100 ring-cyan-500/30',
  past: 'bg-zinc-800/80 text-zinc-400 ring-zinc-600/40',
  disabled: 'bg-amber-950/40 text-amber-200/80 ring-amber-500/25',
}

function emptyDraft() {
  return {
    id: '',
    slug: '',
    label_short: '',
    title: '',
    odds_sport_keys: 'baseball_mlb',
    kind: 'season',
    start_date: '',
    end_date: '',
    priority: 50,
    coverage_tier: '',
    caption_prefix: '',
    enabled: true,
  }
}

function rowToDraft(row) {
  const keys = Array.isArray(row?.odds_sport_keys) ? row.odds_sport_keys.join(', ') : ''
  return {
    id: row?.id || '',
    slug: row?.slug || '',
    label_short: row?.label_short || '',
    title: row?.title || '',
    odds_sport_keys: keys,
    kind: row?.kind || 'season',
    start_date: row?.start_date || '',
    end_date: row?.end_date || '',
    priority: row?.priority ?? 50,
    coverage_tier: row?.coverage_tier != null ? String(row.coverage_tier) : '',
    caption_prefix: row?.caption_prefix || '',
    enabled: row?.enabled !== false,
  }
}

function draftToPayload(draft) {
  const keys = String(draft.odds_sport_keys || '')
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
  const payload = {
    slug: String(draft.slug || '').trim().toLowerCase(),
    label_short: String(draft.label_short || '').trim(),
    title: String(draft.title || '').trim(),
    odds_sport_keys: keys,
    kind: draft.kind || 'season',
    start_date: draft.start_date,
    end_date: draft.end_date,
    priority: Number(draft.priority) || 50,
    caption_prefix: String(draft.caption_prefix || '').trim() || null,
    enabled: draft.enabled !== false,
  }
  if (draft.coverage_tier) payload.coverage_tier = Number(draft.coverage_tier)
  if (draft.id) payload.id = draft.id
  return payload
}

function formatDateRange(start, end) {
  if (!start || !end) return '—'
  return `${start} → ${end}`
}

/** Today's calendar date in America/Los_Angeles (YYYY-MM-DD). */
function ptTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatQueryDateLabel(dateIso) {
  if (!dateIso) return 'selected day'
  const dt = new Date(`${dateIso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return dateIso
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function rowActiveOnDate(row, dateIso) {
  if (!dateIso || !row?.start_date || !row?.end_date) return false
  return dateIso >= row.start_date && dateIso <= row.end_date
}

function rowStatusOnDate(row, dateIso) {
  if (!row?.enabled) return 'disabled'
  if (!rowActiveOnDate(row, dateIso)) {
    if (dateIso < row.start_date) return 'upcoming'
    return 'past'
  }
  return 'active'
}

function CalendarEditorModal({ open, draft, setDraft, onClose, onSave, busy }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 bg-black/70">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-white font-bold text-sm mb-3">
          {draft.id ? 'Edit calendar event' : 'Add calendar event'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              type="text"
              value={draft.slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
              placeholder="mlb-2026"
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Short label</div>
            <input
              type="text"
              value={draft.label_short}
              onChange={(e) => setDraft((d) => ({ ...d, label_short: e.target.value }))}
              placeholder="MLB"
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Kind</div>
            <select
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            >
              {CALENDAR_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Title</div>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="MLB Regular Season 2026"
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Odds API sport keys</div>
            <input
              type="text"
              value={draft.odds_sport_keys}
              onChange={(e) => setDraft((d) => ({ ...d, odds_sport_keys: e.target.value }))}
              placeholder="baseball_mlb, basketball_nba"
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none"
            />
            <div className="text-zinc-600 text-[10px] mt-1">Comma-separated. First key powers manual Fetch odds.</div>
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Start date</div>
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">End date</div>
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Priority (0–100)</div>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.priority}
              onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm tabular-nums focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Coverage tier</div>
            <select
              value={draft.coverage_tier}
              onChange={(e) => setDraft((d) => ({ ...d, coverage_tier: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            >
              {COVERAGE_TIERS.map((t) => (
                <option key={t.id || 'auto'} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Caption prefix</div>
            <input
              type="text"
              value={draft.caption_prefix}
              onChange={(e) => setDraft((d) => ({ ...d, caption_prefix: e.target.value }))}
              placeholder="MLB"
              className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2 mt-1">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
              className="rounded border-zinc-600"
            />
            <span className="text-zinc-300 text-sm">Enabled on calendar</span>
          </label>
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-xl bg-zinc-800 px-4 text-zinc-200 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void onSave()}
            className="min-h-9 rounded-xl bg-cyan-800 px-4 text-white text-xs font-bold disabled:opacity-50"
          >
            {busy === 'calendar-save' ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BotSportsCalendarPanel({
  supabaseClient,
  setToast,
  busy,
  setBusy,
  onCalendarUpdated,
}) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState('on_date')
  const [queryDate, setQueryDate] = useState(() => ptTodayIso())
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState(emptyDraft())

  const loadCalendar = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await fetchSportsBettingCalendarAll(supabaseClient)
    setLoading(false)
    if (error) {
      setLoadError(error.message || 'Could not load calendar.')
      setRows([])
      return
    }
    setRows(Array.isArray(data) ? data : [])
  }, [supabaseClient])

  useEffect(() => {
    if (!expanded) return undefined
    void loadCalendar()
    return undefined
  }, [expanded, loadCalendar])

  const filteredRows = useMemo(() => {
    if (filter === 'on_date') {
      return rows
        .filter((r) => rowActiveOnDate(r, queryDate))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || String(a.label_short).localeCompare(String(b.label_short)))
    }
    if (filter === 'upcoming') {
      return rows
        .filter((r) => r.enabled && String(r.start_date) > queryDate)
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    }
    return rows
  }, [rows, filter, queryDate])

  const onDateCount = useMemo(
    () => rows.filter((r) => r.enabled && rowActiveOnDate(r, queryDate)).length,
    [rows, queryDate],
  )

  const activeTodayCount = useMemo(() => rows.filter((r) => r.active_today).length, [rows])
  const ptToday = ptTodayIso()
  const queryIsToday = queryDate === ptToday

  const openNew = () => {
    setEditorDraft(emptyDraft())
    setEditorOpen(true)
  }

  const openEdit = (row) => {
    setEditorDraft(rowToDraft(row))
    setEditorOpen(true)
  }

  const saveEditor = async () => {
    const payload = draftToPayload(editorDraft)
    if (!payload.slug || !payload.label_short || !payload.title || !payload.start_date || !payload.end_date) {
      setToast('Slug, labels, dates, and sport keys are required.')
      return
    }
    setBusy('calendar-save')
    const { data, error } = await saveSportsBettingCalendarRow(supabaseClient, payload)
    setBusy('')
    if (error) {
      setToast(error.message || 'Could not save calendar row.')
      return
    }
    setEditorOpen(false)
    setToast(data?.row?.slug ? `Saved ${data.row.slug}` : 'Calendar updated.')
    await loadCalendar()
    onCalendarUpdated?.()
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-700/60 bg-zinc-950/40 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Sports betting calendar
          </div>
          <div className="text-zinc-500 text-[10px] mt-0.5">
            PT dates · {onDateCount} on slate {queryIsToday ? 'today' : `on ${formatQueryDateLabel(queryDate)}`}
            {queryIsToday ? '' : ` · ${activeTodayCount} active today`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold"
          >
            {expanded ? 'Hide calendar' : 'View calendar'}
          </button>
          {expanded ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadCalendar()}
                className="min-h-8 rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold disabled:opacity-50"
              >
                {loading ? '…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={openNew}
                className="min-h-8 rounded-lg bg-cyan-900/80 px-3 text-cyan-100 text-[11px] font-semibold"
              >
                Add event
              </button>
            </>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-3">
          {loadError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs">
              {loadError}
              <div className="text-amber-200/70 text-[10px] mt-1">
                Apply migration <span className="font-mono">20260704320000</span> on this Supabase project.
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="block min-w-[10rem]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Query date (PT)
              </div>
              <input
                type="date"
                value={queryDate}
                onChange={(e) => {
                  const next = e.target.value
                  if (next) {
                    setQueryDate(next)
                    setFilter('on_date')
                  }
                }}
                className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setQueryDate(ptTodayIso())
                setFilter('on_date')
              }}
              className="min-h-[38px] rounded-lg bg-zinc-800 px-3 text-zinc-200 text-[11px] font-semibold"
            >
              Today
            </button>
            <div className="text-zinc-600 text-[10px] pb-1">
              Boost priority and captions for special events. Scott always scans tier 1–4 sports when Odds API has lines.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { id: 'on_date', label: 'On selected date' },
              { id: 'all', label: 'All entries' },
              { id: 'upcoming', label: 'Upcoming from date' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-7 rounded-lg px-2.5 text-[10px] font-semibold ring-1 ${
                  filter === tab.id
                    ? 'bg-cyan-950/50 text-cyan-100 ring-cyan-500/35'
                    : 'bg-zinc-900 text-zinc-400 ring-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!loading && !filteredRows.length ? (
            <div className="text-zinc-500 text-xs py-4 text-center">
              {filter === 'on_date'
                ? `No sporting events on the calendar for ${formatQueryDateLabel(queryDate)}.`
                : 'No calendar rows match this filter.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredRows.map((row) => {
                const statusOnDate = rowStatusOnDate(row, queryDate)
                const onSlate = row.enabled && rowActiveOnDate(row, queryDate)
                return (
                <div
                  key={row.id || row.slug}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 px-3 py-2.5 flex flex-wrap items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white text-sm font-semibold">{row.label_short}</span>
                      {row.coverage_tier ? (
                        <span className="text-cyan-300/90 text-[9px] font-bold uppercase tracking-wide">
                          {TIER_LABELS[row.coverage_tier] || `T${row.coverage_tier}`}
                        </span>
                      ) : null}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${STATUS_STYLES[filter === 'on_date' ? statusOnDate : row.status] || STATUS_STYLES.past}`}>
                        {filter === 'on_date' && onSlate
                          ? queryIsToday ? 'Today' : 'On date'
                          : row.status === 'active' && row.active_today
                            ? 'Today'
                            : (filter === 'on_date' ? statusOnDate : row.status)}
                      </span>
                      {onSlate && filter === 'on_date' ? (
                        <span className="text-emerald-400/90 text-[10px] font-semibold">On slate</span>
                      ) : null}
                      {!row.enabled && filter === 'on_date' ? (
                        <span className="text-amber-300/80 text-[10px] font-semibold">Disabled</span>
                      ) : null}
                    </div>
                    <div className="text-zinc-400 text-xs mt-0.5 truncate">{row.title}</div>
                    <div className="text-zinc-600 text-[10px] mt-1 font-mono truncate">
                      {formatDateRange(row.start_date, row.end_date)}
                      {' · '}
                      {Array.isArray(row.odds_sport_keys) ? row.odds_sport_keys.join(', ') : ''}
                      {' · p'}
                      {row.priority}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="min-h-7 rounded-lg bg-zinc-800 px-2.5 text-zinc-200 text-[10px] font-semibold shrink-0"
                  >
                    Edit
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      <CalendarEditorModal
        open={editorOpen}
        draft={editorDraft}
        setDraft={setEditorDraft}
        onClose={() => setEditorOpen(false)}
        onSave={saveEditor}
        busy={busy}
      />
    </div>
  )
}
