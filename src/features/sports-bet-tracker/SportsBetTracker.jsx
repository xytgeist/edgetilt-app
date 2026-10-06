import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ClipboardList, ClipboardPaste, FileSpreadsheet, Pencil, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TitleBarScreenTitle from '../../components/TitleBarScreenTitle.jsx'
import { useIpadAuthStage } from '../auth/AuthModalShell.jsx'
import {
  confirmSportsBet,
  deleteSportsBet,
  insertSportsBet,
  listSportsBets,
  refreshSportsBetClv,
  settleSportsBet,
  updateSportsBet,
} from './sportsBetApi.js'
import {
  currentSportsBankroll,
  formatAmericanOdds,
  formatLine,
  summarizeBets,
} from './sportsBetMath.js'
import {
  consumeSportsBetLogPending,
  isUsefulSportsBetPrefill,
  sportsBetLogOpenEventName,
  sportsBetPrefillFromSearchParams,
} from './sportsBetNav.js'
import { parseSportsBetCsv, parseSportsBetIntake } from './sportsBetParse.js'
import { ocrSportsBetSlipImage } from './sportsBetOcr.js'
import {
  DEFAULT_STAKE_UNITS,
  formatUsd,
  readUnitSizeDollars,
  stakeDollarsFromUnits,
  stakeUnitsFromDollars,
} from './sportsBetStake.js'
import { loadSportsBetSettings, saveSportsBetSettings } from './sportsBetSettings.js'
import { normalizeSportsBetSource, sportsBetSourceLabel } from './sportsBetSources.js'

function emptyDraft(unitSize = readUnitSizeDollars()) {
  const units = String(DEFAULT_STAKE_UNITS)
  return {
    book: '',
    market: 'spread',
    side: 'home',
    line: '',
    odds: '-110',
    stake_units: units,
    stake_dollars: stakeDollarsFromUnits(units, unitSize),
    unit_size_dollars: unitSize,
    selection_label: '',
    notes: '',
    home_team: '',
    away_team: '',
    sport_label: '',
    event_id: '',
    sport_key: '',
    commence_time: '',
    source: 'manual',
  }
}

function draftFromPrefill(prefill, unitSize = readUnitSizeDollars()) {
  if (!prefill || typeof prefill !== 'object') return emptyDraft(unitSize)
  const units =
    prefill.stake_units != null && String(prefill.stake_units) !== ''
      ? String(prefill.stake_units)
      : String(DEFAULT_STAKE_UNITS)
  const dollars =
    prefill.stake_dollars != null && String(prefill.stake_dollars) !== ''
      ? String(prefill.stake_dollars)
      : stakeDollarsFromUnits(units, unitSize)
  return {
    ...emptyDraft(unitSize),
    book: prefill.book != null ? String(prefill.book) : '',
    market: prefill.market || 'spread',
    side: prefill.side || 'home',
    line: prefill.line != null && prefill.line !== '' ? String(prefill.line) : '',
    odds: prefill.odds != null && prefill.odds !== '' ? String(prefill.odds) : '-110',
    stake_units: units,
    stake_dollars: dollars,
    unit_size_dollars: unitSize,
    selection_label: prefill.selection_label ? String(prefill.selection_label) : '',
    notes: prefill.notes ? String(prefill.notes) : '',
    home_team: prefill.home_team ? String(prefill.home_team) : '',
    away_team: prefill.away_team ? String(prefill.away_team) : '',
    sport_label: prefill.sport_label ? String(prefill.sport_label) : '',
    event_id: prefill.event_id ? String(prefill.event_id) : '',
    sport_key: prefill.sport_key ? String(prefill.sport_key) : '',
    commence_time: prefill.commence_time ? String(prefill.commence_time) : '',
    source: normalizeSportsBetSource(prefill.source, 'manual'),
  }
}

function StatChip({ label, value, tone = 'zinc' }) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
        ? 'text-rose-300'
        : tone === 'cyan'
          ? 'text-cyan-300'
          : 'text-white'
  return (
    <div
      data-sports-bet-stat
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-black tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

/**
 * Sports Edge bet tracker … units / ROI / CLV. Manual log + hub prefill.
 */
export default function SportsBetTracker({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarCenterSlot = null,
  titleBarToolCloseVisible = false,
  pendingPrefill = null,
  onPendingPrefillConsumed = null,
}) {
  const ipadShell = useIpadAuthStage()
  const [userId, setUserId] = useState(null)
  const [bets, setBets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [unitSize, setUnitSize] = useState(readUnitSizeDollars)
  const [bankrollStart, setBankrollStart] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState({ unit: '', bankroll: '' })
  const csvInputRef = useRef(null)
  const photoInputRef = useRef(null)

  useEffect(() => {
    if (!supabaseClient) {
      setUserId(null)
      return undefined
    }
    let cancelled = false
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data?.session?.user?.id || null)
    })
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id || null)
    })
    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe?.()
    }
  }, [supabaseClient])

  const load = async () => {
    setLoading(true)
    setError('')
    const { bets: rows, error: listErr } = await listSportsBets(supabaseClient)
    if (listErr) {
      setError(listErr)
      setBets([])
      setLoading(false)
      return
    }
    const { error: clvErr } = await refreshSportsBetClv(supabaseClient)
    if (!clvErr) {
      const again = await listSportsBets(supabaseClient)
      setBets(again.bets || rows)
    } else {
      setBets(rows)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on client identity
  }, [supabaseClient, userId])

  useEffect(() => {
    let cancelled = false
    void loadSportsBetSettings(supabaseClient).then(({ settings }) => {
      if (cancelled || !settings) return
      setUnitSize(settings.unit_size_dollars)
      setBankrollStart(
        settings.bankroll_start == null ? null : Number(settings.bankroll_start),
      )
    })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, userId])

  const openComposer = (prefill) => {
    setEditingId(null)
    setDraft(draftFromPrefill(isUsefulSportsBetPrefill(prefill) ? prefill : null, unitSize))
    setComposerOpen(true)
    setError('')
  }

  const openEdit = (bet) => {
    if (!bet) return
    setEditingId(bet.id)
    setDraft(draftFromPrefill({
      ...bet,
      stake_units: bet.stake_units,
      stake_dollars: bet.stake_dollars,
      source: bet.source || 'manual',
    }, unitSize))
    setComposerOpen(true)
    setError('')
  }

  useEffect(() => {
    if (pendingPrefill && isUsefulSportsBetPrefill(pendingPrefill)) {
      openComposer(pendingPrefill)
      onPendingPrefillConsumed?.()
    } else if (pendingPrefill) {
      onPendingPrefillConsumed?.()
    }
  }, [pendingPrefill, onPendingPrefillConsumed])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const fromStore = consumeSportsBetLogPending()
    if (fromStore) openComposer(fromStore)
    const onOpen = (e) => openComposer(e?.detail || consumeSportsBetLogPending())
    window.addEventListener(sportsBetLogOpenEventName(), onOpen)
    return () => window.removeEventListener(sportsBetLogOpenEventName(), onOpen)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const apply = () => {
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('tab') !== 'sports-bets') return
      const fromUrl = sportsBetPrefillFromSearchParams(params)
      if (fromUrl) openComposer(fromUrl)
    }
    apply()
    window.addEventListener('popstate', apply)
    return () => window.removeEventListener('popstate', apply)
  }, [])

  const summary = summarizeBets(bets)
  const bankrollNow = currentSportsBankroll(bankrollStart, bets, unitSize)
  const visible = bets.filter((b) => {
    if (filter === 'open') return b.status === 'open'
    if (filter === 'settled') return b.status !== 'open'
    return true
  })

  const onSave = async () => {
    if (!userId) {
      setError('Sign in to log bets.')
      return
    }
    setSaving(true)
    setError('')
    const result = editingId
      ? await updateSportsBet(supabaseClient, editingId, draft)
      : await insertSportsBet(supabaseClient, userId, draft)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    const bet = result.bet
    setBets((prev) => (
      editingId
        ? prev.map((row) => (row.id === bet.id ? bet : row))
        : [bet, ...prev]
    ))
    setComposerOpen(false)
    setEditingId(null)
    setDraft(emptyDraft(unitSize))
    void refreshSportsBetClv(supabaseClient).then(() => load())
  }

  const applyIntakeDrafts = async (drafts, { bulk = false } = {}) => {
    const list = Array.isArray(drafts) ? drafts.filter(Boolean) : []
    if (!list.length) {
      setError('Could not read a bet from that. Check odds look like -110 / +150.')
      return
    }
    if (!bulk || list.length === 1) {
      openComposer(list[0])
      return
    }
    if (!userId) {
      setError('Sign in to import bets.')
      return
    }
    setSaving(true)
    setError('')
    const inserted = []
    let lastErr = ''
    for (const row of list) {
      const payload = {
        ...row,
        stake_units: row.stake_units || DEFAULT_STAKE_UNITS,
        unit_size_dollars: row.unit_size_dollars || unitSize,
        stake_dollars: row.stake_dollars || stakeDollarsFromUnits(row.stake_units || DEFAULT_STAKE_UNITS, unitSize),
      }
      const { bet, error: saveErr } = await insertSportsBet(supabaseClient, userId, payload)
      if (saveErr) lastErr = saveErr
      else if (bet) inserted.push(bet)
    }
    setSaving(false)
    if (inserted.length) setBets((prev) => [...inserted, ...prev])
    if (lastErr) setError(`Imported ${inserted.length}/${list.length}. ${lastErr}`)
  }

  const onSettle = async (id, status) => {
    const { bet, error: settleErr } = await settleSportsBet(supabaseClient, id, status)
    if (settleErr) {
      setError(settleErr)
      return
    }
    setBets((prev) => prev.map((b) => (b.id === id ? bet : b)))
  }

  const onDelete = async (id) => {
    const { error: delErr } = await deleteSportsBet(supabaseClient, id)
    if (delErr) {
      setError(delErr)
      return
    }
    setBets((prev) => prev.filter((b) => b.id !== id))
  }

  const onConfirm = async (id) => {
    const { bet, error: confirmErr } = await confirmSportsBet(supabaseClient, id)
    if (confirmErr) {
      setError(confirmErr)
      return
    }
    setBets((prev) => prev.map((b) => (b.id === id ? bet : b)))
  }

  const onSaveSettings = async () => {
    const unit = Number(settingsDraft.unit)
    const displayed = Number(settingsDraft.bankroll)
    if (!Number.isFinite(unit) || unit <= 0) {
      setError('Unit size must be greater than 0.')
      return
    }
    if (!Number.isFinite(displayed)) {
      setError('Enter a bankroll amount.')
      return
    }
    const realized = currentSportsBankroll(0, bets, unitSize) ?? 0
    const start = displayed - realized
    const { settings, error: saveErr } = await saveSportsBetSettings(supabaseClient, userId, {
      unit_size_dollars: unit,
      bankroll_start: start,
    })
    if (!settings) {
      setError(saveErr || 'Could not save settings.')
      return
    }
    setUnitSize(settings.unit_size_dollars)
    setBankrollStart(settings.bankroll_start)
    setSettingsOpen(false)
  }

  const inputClass =
    'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-[15px] text-white outline-none focus:border-cyan-500'

  return (
    <ScrollLinkedEdgeTitleBarShell
      publishScrollReveal
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarToolCloseVisible={titleBarToolCloseVisible}
      titleBarBrand={
        ipadShell ? <TitleBarScreenTitle>Bet Tracker</TitleBarScreenTitle> : null
      }
      contentClassName="px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div data-sports-bet-tracker>
        <div className="mb-5">
          {ipadShell ? null : (
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">
              <ClipboardList className="h-6 w-6 text-cyan-400" strokeWidth={2.25} />
              Bet Tracker
            </h1>
          )}
          <p className={`text-sm text-zinc-400 ${ipadShell ? '' : 'mt-0.5'}`}>
            Hold a hub line to review the form. Tap through to the book to auto-log 1u.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <StatChip
            label="Bankroll"
            value={bankrollNow == null ? 'Set →' : formatUsd(bankrollNow)}
          />
          <StatChip
            label="Unit"
            value={formatUsd(unitSize)}
            tone="cyan"
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip
            label="P&L (u)"
            value={
              summary.profitUnits === 0 && summary.won + summary.lost === 0
                ? '—'
                : `${summary.profitUnits >= 0 ? '+' : ''}${summary.profitUnits.toFixed(2)}`
            }
            tone={summary.profitUnits > 0 ? 'green' : summary.profitUnits < 0 ? 'red' : 'zinc'}
          />
          <StatChip
            label="ROI"
            value={summary.roiPct == null ? '—' : `${summary.roiPct.toFixed(1)}%`}
            tone={summary.roiPct > 0 ? 'green' : summary.roiPct < 0 ? 'red' : 'zinc'}
          />
          <StatChip label="Record" value={summary.recordLabel} />
          <StatChip
            label="CLV beat"
            value={
              summary.clvBeatPct == null
                ? '—'
                : `${summary.clvBeatPct.toFixed(0)}%`
            }
            tone="cyan"
          />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className="flex flex-1 rounded-2xl bg-zinc-900 p-1 gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open' },
              { id: 'settled', label: 'Settled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`flex-1 rounded-xl py-2 text-[13px] font-bold touch-manipulation ${
                  filter === tab.id ? 'bg-cyan-600 text-white' : 'text-zinc-400 active:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSettingsDraft({
                unit: String(unitSize || ''),
                bankroll: bankrollNow == null ? '' : String(Number(bankrollNow.toFixed(2))),
              })
              setSettingsOpen(true)
              setError('')
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700 text-zinc-300 active:bg-zinc-800"
            aria-label="Bankroll and unit size"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700 text-zinc-300 active:bg-zinc-800"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => openComposer(null)}
            className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-cyan-600 px-3.5 text-[13px] font-bold text-white active:bg-cyan-500"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Log
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPasteText('')
              setPasteOpen(true)
              setError('')
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-700 px-3 text-[12px] font-bold text-zinc-200 active:bg-zinc-800"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Paste slip
          </button>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-700 px-3 text-[12px] font-bold text-zinc-200 active:bg-zinc-800"
          >
            <Camera className="h-3.5 w-3.5" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-700 px-3 text-[12px] font-bold text-zinc-200 active:bg-zinc-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void (async () => {
                setError('')
                const { text, error: ocrErr, native } = await ocrSportsBetSlipImage(file)
                if (!native) {
                  setError('Photo OCR is on the iPhone app for now. Paste the slip text instead.')
                  setPasteOpen(true)
                  return
                }
                if (ocrErr) {
                  setError(ocrErr)
                  return
                }
                await applyIntakeDrafts(parseSportsBetIntake(text))
              })()
            }}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void file.text().then((text) => applyIntakeDrafts(parseSportsBetCsv(text), { bulk: true }))
            }}
          />
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {loading && !bets.length ? (
          <p className="text-sm text-zinc-500">Loading bets…</p>
        ) : null}

        {!loading && !visible.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-300">No bets yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Hold a line to review, or tap through to the book to auto-log.
            </p>
          </div>
        ) : null}

        <ul className="space-y-2">
          {visible.map((bet) => {
            const profit = bet.profit_units
            const profitTone =
              profit == null
                ? 'text-zinc-400'
                : profit > 0
                  ? 'text-emerald-300'
                  : profit < 0
                    ? 'text-rose-300'
                    : 'text-zinc-300'
            return (
              <li
                key={bet.id}
                data-sports-bet-card
                className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-white">
                      {bet.selection_label}
                    </div>
                    <div className="mt-0.5 text-[12px] text-zinc-400">
                      {[
                        bet.sport_label || bet.sport_key,
                        bet.book,
                        formatAmericanOdds(bet.odds),
                        `${bet.stake_units}u`,
                        bet.stake_dollars != null ? formatUsd(bet.stake_dollars) : null,
                        sportsBetSourceLabel(bet.source),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {bet.line != null && bet.market !== 'h2h'
                        ? ` · ${formatLine(bet.line, bet.market)}`
                        : ''}
                    </div>
                    {bet.away_team && bet.home_team ? (
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                        {bet.away_team} @ {bet.home_team}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {bet.confirmed === false ? 'unconfirmed' : bet.status}
                    </div>
                    <div className={`text-sm font-black tabular-nums ${profitTone}`}>
                      {profit == null
                        ? '—'
                        : `${profit >= 0 ? '+' : ''}${Number(profit).toFixed(2)}u`}
                    </div>
                    {bet.clv_pts != null ? (
                      <div
                        className={`text-[11px] font-semibold tabular-nums ${
                          Number(bet.clv_pts) > 0
                            ? 'text-cyan-300'
                            : Number(bet.clv_pts) < 0
                              ? 'text-zinc-500'
                              : 'text-zinc-400'
                        }`}
                      >
                        CLV {Number(bet.clv_pts) > 0 ? '+' : ''}
                        {Number(bet.clv_pts).toFixed(1)}
                      </div>
                    ) : null}
                  </div>
                </div>
                {bet.status === 'open' ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bet.confirmed === false ? (
                      <button
                        type="button"
                        onClick={() => void onConfirm(bet.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-bold uppercase text-cyan-200 active:bg-cyan-500/25"
                      >
                        <Check className="h-3 w-3" />
                        Confirm
                      </button>
                    ) : null}
                    {['won', 'lost', 'push', 'void'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void onSettle(bet.id, s)}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-300 active:bg-zinc-800"
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => openEdit(bet)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-300 active:bg-zinc-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(bet.id)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-300 active:bg-rose-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(bet)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-zinc-400 active:bg-zinc-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSettle(bet.id, 'open')}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold text-zinc-500 active:bg-zinc-800"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(bet.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-300 active:bg-rose-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {composerOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
            aria-label={editingId ? 'Edit bet' : 'Log bet'}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => {
              setComposerOpen(false)
              setEditingId(null)
            }}
          />
          <div
            data-sports-bet-composer
            className="relative z-[1] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">{editingId ? 'Edit bet' : 'Log a bet'}</h2>
              <button
                type="button"
                onClick={() => {
              setComposerOpen(false)
              setEditingId(null)
            }}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
                aria-label="Close composer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {draft.source && draft.source !== 'manual' ? (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-400">
                {sportsBetSourceLabel(draft.source)}
              </p>
            ) : null}
            {(draft.away_team || draft.home_team) && (
              <p className="mb-3 text-sm text-zinc-400">
                {[draft.away_team, draft.home_team].filter(Boolean).join(' @ ')}
                {draft.sport_label ? ` · ${draft.sport_label}` : ''}
              </p>
            )}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Market
                <select
                  className={`${inputClass} mt-1`}
                  value={draft.market}
                  onChange={(e) => setDraft((d) => ({ ...d, market: e.target.value }))}
                >
                  <option value="spread">Spread</option>
                  <option value="h2h">Moneyline</option>
                  <option value="total">Total</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Side
                <select
                  className={`${inputClass} mt-1`}
                  value={draft.side}
                  onChange={(e) => setDraft((d) => ({ ...d, side: e.target.value }))}
                >
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="over">Over</option>
                  <option value="under">Under</option>
                  <option value="draw">Draw</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Line
                  <input
                    className={`${inputClass} mt-1`}
                    inputMode="decimal"
                    value={draft.line}
                    onChange={(e) => setDraft((d) => ({ ...d, line: e.target.value }))}
                    placeholder="-3.5"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Odds
                  <input
                    className={`${inputClass} mt-1`}
                    inputMode="numeric"
                    value={draft.odds}
                    onChange={(e) => setDraft((d) => ({ ...d, odds: e.target.value }))}
                    placeholder="-110"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Stake (units)
                  <input
                    className={`${inputClass} mt-1`}
                    inputMode="decimal"
                    value={draft.stake_units}
                    onChange={(e) => {
                      const stake_units = e.target.value
                      setDraft((d) => ({
                        ...d,
                        stake_units,
                        stake_dollars: stakeDollarsFromUnits(stake_units, unitSize) || d.stake_dollars,
                      }))
                    }}
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Stake ($)
                  <input
                    className={`${inputClass} mt-1`}
                    inputMode="decimal"
                    value={draft.stake_dollars}
                    onChange={(e) => {
                      const stake_dollars = e.target.value
                      const fromUsd = stakeUnitsFromDollars(stake_dollars, unitSize)
                      setDraft((d) => ({
                        ...d,
                        stake_dollars,
                        stake_units: fromUsd || d.stake_units,
                      }))
                    }}
                    placeholder={stakeDollarsFromUnits(1, unitSize) || '100'}
                  />
                </label>
              </div>
              <p className="text-[11px] text-zinc-500">1u = {formatUsd(unitSize)}. Change unit size in settings.</p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Book
                <input
                  className={`${inputClass} mt-1`}
                  value={draft.book}
                  onChange={(e) => setDraft((d) => ({ ...d, book: e.target.value }))}
                  placeholder="DraftKings"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Label (optional)
                <input
                  className={`${inputClass} mt-1`}
                  value={draft.selection_label}
                  onChange={(e) => setDraft((d) => ({ ...d, selection_label: e.target.value }))}
                  placeholder="Chiefs -3.5"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Notes
                <textarea
                  className={`${inputClass} mt-1 min-h-[4rem] resize-none`}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onSave()}
                className="w-full rounded-2xl bg-cyan-600 py-3 text-[15px] font-bold text-white active:bg-cyan-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save bet'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Bankroll settings"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            data-sports-bet-composer
            className="relative z-[1] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Bankroll</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
                aria-label="Close settings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-400">
              Set what you have now. Wins and losses move it automatically.
            </p>
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Current bankroll ($)
                <input
                  className={`${inputClass} mt-1`}
                  inputMode="decimal"
                  value={settingsDraft.bankroll}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, bankroll: e.target.value }))}
                  placeholder="5000"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Unit size ($)
                <input
                  className={`${inputClass} mt-1`}
                  inputMode="decimal"
                  value={settingsDraft.unit}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, unit: e.target.value }))}
                  placeholder="100"
                />
              </label>
              <button
                type="button"
                onClick={() => void onSaveSettings()}
                className="w-full rounded-2xl bg-cyan-600 py-3 text-[15px] font-bold text-white active:bg-cyan-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pasteOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Paste slip"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setPasteOpen(false)}
          />
          <div
            data-sports-bet-composer
            className="relative z-[1] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Paste slip</h2>
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
                aria-label="Close paste"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-400">
              Paste a screenshot caption, share-sheet text, or a CSV. Confirm before it saves.
            </p>
            <textarea
              className={`${inputClass} min-h-[10rem] resize-none`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Chiefs -3.5 (-110) 1u\nor a CSV with Odds / Selection columns'}
            />
            <button
              type="button"
              className="mt-3 w-full rounded-2xl bg-cyan-600 py-3 text-[15px] font-bold text-white active:bg-cyan-500"
              onClick={() => {
                const drafts = parseSportsBetIntake(pasteText)
                setPasteOpen(false)
                void applyIntakeDrafts(drafts, { bulk: drafts.length > 1 })
              }}
            >
              Read bets
            </button>
          </div>
        </div>
      ) : null}
    </ScrollLinkedEdgeTitleBarShell>
  )
}
