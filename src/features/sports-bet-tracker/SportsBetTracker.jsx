import { useEffect, useRef, useState } from 'react'
import { Calculator, Camera, Check, ChevronLeft, ClipboardList, ClipboardPaste, FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TitleBarScreenTitle from '../../components/TitleBarScreenTitle.jsx'
import AppModalOverlay from '../../components/AppModalOverlay.jsx'
import { useIpadAuthStage } from '../auth/AuthModalShell.jsx'
import {
  confirmSportsBet,
  deleteSportsBet,
  gradeOpenSportsBets,
  insertSportsBet,
  listSportsBets,
  refreshSportsBetClv,
  settleSportsBet,
  sportsBetIsAutoGradeable,
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
  sportsBetToolsFromSearch,
} from './sportsBetNav.js'
import SportsBetToolsSheet from './SportsBetToolsSheet.jsx'
import { parseEventMatchup, parseSportsBetCsv, parseSportsBetIntake } from './sportsBetParse.js'
import {
  combinedOddsFromLegs,
  isParlayDraft,
  normalizeParlayLegs,
  parlaySelectionLabel,
} from './sportsBetParlay.js'
import { ocrSportsBetSlipImage } from './sportsBetOcr.js'

const MAX_SLIP_PHOTOS = 8

function blankParlayLegs() {
  return normalizeParlayLegs([
    { market: 'h2h', side: 'home', selection_label: '', odds: '-110' },
    { market: 'h2h', side: 'home', selection_label: '', odds: '-110' },
  ])
}
import {
  DEFAULT_BANKROLL_START,
  DEFAULT_STAKE_UNITS,
  formatUsd,
  readBankrollStart,
  readUnitSizeDollars,
  writeUnitSizeDollars,
  stakeDollarsFromUnits,
  stakeUnitsFromDollars,
} from './sportsBetStake.js'
import { loadSportsBetSettings, saveSportsBetSettings } from './sportsBetSettings.js'
import { normalizeSportsBetSource, sportsBetSourceLabel } from './sportsBetSources.js'
import {
  isParticipantSport,
  participantSideOptions,
  resolveSportsBetSport,
  SPORTS_BET_SPORTS,
  sportByKey,
} from './sportsBetSports.js'

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
    event_label: '',
    sport_label: '',
    event_id: '',
    sport_key: '',
    commence_time: '',
    player_name: '',
    prop_stat: '',
    slip_preview_url: '',
    source: 'manual',
    legs: [],
  }
}

function revokeSlipPreviewUrl(url) {
  const s = String(url || '')
  if (!s.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(s)
  } catch {
    /* ignore */
  }
}

function eventLabelFromDraft(d) {
  if (!d) return ''
  if (d.event_label) return String(d.event_label)
  const away = String(d.away_team || '').trim()
  const home = String(d.home_team || '').trim()
  if (away && home) return `${away} @ ${home}`
  return away || home || ''
}

/** ISO / Date → value for `<input type="datetime-local">` (local wall clock). */
function commenceToDatetimeLocal(iso) {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

function datetimeLocalToIso(local) {
  const s = String(local || '').trim()
  if (!s) return ''
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toISOString()
}

function applyEventLabelToDraft(d, label) {
  const parsed = parseEventMatchup(label)
  return {
    ...d,
    event_label: parsed.event || String(label || '').trim(),
    away_team: parsed.away_team,
    home_team: parsed.home_team,
  }
}

function sideSelectOptions(draft) {
  if (draft.market === 'prop' || draft.market === 'total') {
    return [
      { value: 'over', label: 'Over' },
      { value: 'under', label: 'Under' },
    ]
  }
  if (isParticipantSport(draft.sport_key, draft.sport_label)) {
    const opts = participantSideOptions(draft)
    if (opts.length) return opts
    const pick = String(draft.selection_label || '').trim()
    return [{
      value: draft.side === 'away' ? 'away' : 'home',
      label: pick || 'Select fighter / player',
    }]
  }
  return [
    { value: 'home', label: 'Home' },
    { value: 'away', label: 'Away' },
    { value: 'over', label: 'Over' },
    { value: 'under', label: 'Under' },
    { value: 'draw', label: 'Draw' },
  ]
}

function draftFromPrefill(prefill, unitSize = readUnitSizeDollars()) {
  if (!prefill || typeof prefill !== 'object') return emptyDraft(unitSize)
  const hasDollars = prefill.stake_dollars != null && String(prefill.stake_dollars) !== ''
  const hasUnits = prefill.stake_units != null && String(prefill.stake_units) !== ''
  let dollars = ''
  let units = String(DEFAULT_STAKE_UNITS)
  if (hasDollars) {
    dollars = String(prefill.stake_dollars)
    units = hasUnits
      ? String(prefill.stake_units)
      : stakeUnitsFromDollars(dollars, unitSize) || String(DEFAULT_STAKE_UNITS)
  } else if (hasUnits) {
    units = String(prefill.stake_units)
    dollars = stakeDollarsFromUnits(units, unitSize)
  } else {
    dollars = stakeDollarsFromUnits(units, unitSize)
  }
  const next = {
    ...emptyDraft(unitSize),
    book: prefill.book != null ? String(prefill.book) : '',
    market: prefill.market || 'spread',
    side: prefill.side || (prefill.market === 'prop' || prefill.market === 'total' ? 'over' : 'home'),
    line: prefill.line != null && prefill.line !== '' ? String(prefill.line) : '',
    odds: prefill.odds != null && prefill.odds !== '' ? String(prefill.odds) : '-110',
    stake_units: units,
    stake_dollars: dollars,
    unit_size_dollars: unitSize,
    selection_label: prefill.selection_label ? String(prefill.selection_label) : '',
    notes: prefill.notes ? String(prefill.notes) : '',
    home_team: prefill.home_team ? String(prefill.home_team) : '',
    away_team: prefill.away_team ? String(prefill.away_team) : '',
    event_label: prefill.event_label ? String(prefill.event_label) : '',
    sport_label: prefill.sport_label ? String(prefill.sport_label) : '',
    event_id: prefill.event_id ? String(prefill.event_id) : '',
    sport_key: prefill.sport_key ? String(prefill.sport_key) : '',
    commence_time: prefill.commence_time ? String(prefill.commence_time) : '',
    player_name: prefill.player_name ? String(prefill.player_name) : '',
    prop_stat: prefill.prop_stat ? String(prefill.prop_stat) : '',
    slip_preview_url: prefill.slip_preview_url ? String(prefill.slip_preview_url) : '',
    source: normalizeSportsBetSource(prefill.source, 'manual'),
    legs: normalizeParlayLegs(prefill.legs || prefill.sports_bet_legs || []),
  }
  if (next.market === 'parlay') {
    if (next.legs.length < 2) next.legs = blankParlayLegs()
    next.selection_label = parlaySelectionLabel(next.legs, next.selection_label)
    next.side = ''
    next.home_team = ''
    next.away_team = ''
    next.line = ''
  }
  if (!next.event_label) next.event_label = eventLabelFromDraft(next)
  const sport = resolveSportsBetSport(next.sport_key, next.sport_label)
  next.sport_key = sport.key
  next.sport_label = next.market === 'parlay' ? (sport.label || 'Parlay') : sport.label
  return next
}

function StatChip({ label, value, tone = 'zinc', onClick = null, hint = '' }) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
        ? 'text-rose-300'
        : tone === 'cyan'
          ? 'text-cyan-300'
          : 'text-white'
  const body = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-black tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] font-semibold text-cyan-400">{hint}</div> : null}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        data-sports-bet-stat
        onClick={onClick}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-left touch-manipulation active:bg-zinc-800"
      >
        {body}
      </button>
    )
  }
  return (
    <div
      data-sports-bet-stat
      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5"
    >
      {body}
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
  onBack = null,
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
  const [bankrollStart, setBankrollStart] = useState(readBankrollStart)
  const [settingsDraft, setSettingsDraft] = useState({ unit: '', bankroll: '' })
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsTool, setToolsTool] = useState('')
  const [toolsSeed, setToolsSeed] = useState(null)
  /** Multi-slip confirm queue: [{ key, draft }] */
  const [reviewQueue, setReviewQueue] = useState(null)
  const [reviewEditingKey, setReviewEditingKey] = useState(null)
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
    // Auto-settle finished spread / ML / total bets before listing.
    await gradeOpenSportsBets(supabaseClient)
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
        settings.bankroll_start == null
          ? DEFAULT_BANKROLL_START
          : Number(settings.bankroll_start),
      )
    })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, userId])

  const closeComposer = () => {
    setDraft((prev) => {
      // Keep slip preview if this draft is still in the multi-slip review queue.
      const keepPreview = reviewEditingKey
        && Array.isArray(reviewQueue)
        && reviewQueue.some((item) => (
          item.key === reviewEditingKey
          && item.draft?.slip_preview_url
          && item.draft.slip_preview_url === prev.slip_preview_url
        ))
      if (!keepPreview) revokeSlipPreviewUrl(prev.slip_preview_url)
      return emptyDraft(unitSize)
    })
    setComposerOpen(false)
    setEditingId(null)
    setReviewEditingKey(null)
  }

  const openComposer = (prefill) => {
    const useful = isUsefulSportsBetPrefill(prefill) ? prefill : null
    setEditingId(null)
    setDraft((prev) => {
      const next = draftFromPrefill(useful, unitSize)
      if (prev.slip_preview_url && prev.slip_preview_url !== next.slip_preview_url) {
        revokeSlipPreviewUrl(prev.slip_preview_url)
      }
      return next
    })
    setComposerOpen(true)
    setError('')
  }

  const openEdit = (bet) => {
    if (!bet) return
    setEditingId(bet.id)
    setDraft((prev) => {
      revokeSlipPreviewUrl(prev.slip_preview_url)
      return draftFromPrefill({
        ...bet,
        stake_units: bet.stake_units,
        stake_dollars: bet.stake_dollars,
        source: bet.source || 'manual',
      }, unitSize)
    })
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
    if (isUsefulSportsBetPrefill(fromStore)) openComposer(fromStore)
    const onOpen = (e) => {
      const next = e?.detail || consumeSportsBetLogPending()
      if (isUsefulSportsBetPrefill(next)) openComposer(next)
    }
    window.addEventListener(sportsBetLogOpenEventName(), onOpen)
    return () => window.removeEventListener(sportsBetLogOpenEventName(), onOpen)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const apply = () => {
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('tab') !== 'sports-bets') return
      const fromUrl = sportsBetPrefillFromSearchParams(params)
      // Hollow `?logBet=1` is only a door. Prefill lives in sessionStorage / the open event.
      // Opening from the empty URL wiped book / line / odds after a hold-to-log.
      if (isUsefulSportsBetPrefill(fromUrl)) openComposer(fromUrl)
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
    const nextUnit = Number(draft.unit_size_dollars)
    if (Number.isFinite(nextUnit) && nextUnit > 0) {
      writeUnitSizeDollars(nextUnit)
      setUnitSize(nextUnit)
      if (bankrollStart != null) {
        void saveSportsBetSettings(supabaseClient, userId, {
          unit_size_dollars: nextUnit,
          bankroll_start: bankrollStart,
        })
      }
    }
    setBets((prev) => (
      editingId
        ? prev.map((row) => (row.id === bet.id ? bet : row))
        : [bet, ...prev]
    ))
    if (reviewEditingKey && Array.isArray(reviewQueue)) {
      const nextQueue = reviewQueue.filter((item) => item.key !== reviewEditingKey)
      setReviewQueue(nextQueue.length ? nextQueue : null)
      setReviewEditingKey(null)
      setDraft((prev) => {
        // Preview owned by queue item we just saved … revoke after remove.
        revokeSlipPreviewUrl(prev.slip_preview_url)
        return emptyDraft(unitSize)
      })
      setComposerOpen(false)
      setEditingId(null)
    } else {
      closeComposer()
    }
    void refreshSportsBetClv(supabaseClient).then(() => load())
  }

  const closeReviewQueue = () => {
    if (Array.isArray(reviewQueue)) {
      for (const item of reviewQueue) {
        revokeSlipPreviewUrl(item.draft?.slip_preview_url)
      }
    }
    setReviewQueue(null)
    setReviewEditingKey(null)
  }

  const openReviewEdit = (key) => {
    const item = Array.isArray(reviewQueue)
      ? reviewQueue.find((row) => row.key === key)
      : null
    if (!item) return
    setReviewEditingKey(key)
    setEditingId(null)
    setDraft((prev) => {
      if (
        prev.slip_preview_url
        && prev.slip_preview_url !== item.draft?.slip_preview_url
      ) {
        revokeSlipPreviewUrl(prev.slip_preview_url)
      }
      return { ...item.draft }
    })
    setComposerOpen(true)
    setError('')
  }

  const skipReviewItem = (key) => {
    setReviewQueue((prev) => {
      if (!Array.isArray(prev)) return null
      const item = prev.find((row) => row.key === key)
      if (item) revokeSlipPreviewUrl(item.draft?.slip_preview_url)
      const next = prev.filter((row) => row.key !== key)
      return next.length ? next : null
    })
  }

  const applyIntakeDrafts = async (drafts, { bulk = false, review = false } = {}) => {
    const list = Array.isArray(drafts) ? drafts.filter(Boolean) : []
    if (!list.length) {
      setError('Could not read a bet from that. Check odds look like -110 / +150.')
      return
    }
    if (review && list.length > 1) {
      const stamp = Date.now()
      setReviewQueue(list.map((row, i) => ({
        key: `${stamp}-${i}`,
        draft: draftFromPrefill(row, unitSize),
      })))
      setError('')
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
      const filled = draftFromPrefill(row, unitSize)
      const payload = {
        ...filled,
        unit_size_dollars: filled.unit_size_dollars || unitSize,
      }
      const { bet, error: saveErr } = await insertSportsBet(supabaseClient, userId, payload)
      if (saveErr) lastErr = saveErr
      else if (bet) inserted.push(bet)
    }
    setSaving(false)
    if (inserted.length) setBets((prev) => [...inserted, ...prev])
    if (lastErr) setError(`Imported ${inserted.length}/${list.length}. ${lastErr}`)
  }

  const saveReviewQueueAll = async () => {
    if (!userId) {
      setError('Sign in to import bets.')
      return
    }
    const list = Array.isArray(reviewQueue) ? reviewQueue : []
    if (!list.length) return
    setSaving(true)
    setError('')
    const inserted = []
    let lastErr = ''
    for (const item of list) {
      const payload = {
        ...item.draft,
        unit_size_dollars: item.draft.unit_size_dollars || unitSize,
      }
      const { bet, error: saveErr } = await insertSportsBet(supabaseClient, userId, payload)
      if (saveErr) lastErr = saveErr
      else if (bet) inserted.push(bet)
      revokeSlipPreviewUrl(item.draft?.slip_preview_url)
    }
    setSaving(false)
    setReviewQueue(null)
    if (inserted.length) setBets((prev) => [...inserted, ...prev])
    if (lastErr) setError(`Saved ${inserted.length}/${list.length}. ${lastErr}`)
    void refreshSportsBetClv(supabaseClient).then(() => load())
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

  const openSettings = () => {
    setSettingsDraft({
      unit: String(unitSize || ''),
      bankroll: bankrollNow == null ? '' : String(Number(bankrollNow.toFixed(2))),
    })
    setSettingsOpen(true)
    setError('')
  }

  const openTools = (tool = '', bet = null) => {
    setToolsTool(String(tool || '').trim() === '1' ? '' : String(tool || '').trim())
    setToolsSeed(bet || null)
    setToolsOpen(true)
    setError('')
  }

  const closeTools = () => {
    setToolsOpen(false)
    setToolsTool('')
    setToolsSeed(null)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.get('betTools')) return
    url.searchParams.delete('betTools')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const onBetSlipPhotoPicked = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_SLIP_PHOTOS)
    e.target.value = ''
    if (!files.length) return
    void (async () => {
      setError('')
      setSaving(true)
      const collected = []
      let nativeOk = false
      let lastOcrErr = ''
      for (const file of files) {
        const previewUrl = typeof URL !== 'undefined' && URL.createObjectURL
          ? URL.createObjectURL(file)
          : ''
        const { text, error: ocrErr, native } = await ocrSportsBetSlipImage(file)
        if (!native) {
          revokeSlipPreviewUrl(previewUrl)
          continue
        }
        nativeOk = true
        if (ocrErr) {
          revokeSlipPreviewUrl(previewUrl)
          lastOcrErr = ocrErr
          continue
        }
        const drafts = parseSportsBetIntake(text).filter(Boolean)
        if (!drafts.length) {
          revokeSlipPreviewUrl(previewUrl)
          lastOcrErr = 'Could not read a bet from that slip.'
          continue
        }
        for (const d of drafts) {
          collected.push({ ...d, slip_preview_url: previewUrl })
        }
      }
      setSaving(false)
      if (!nativeOk) {
        setError('Photo OCR needs the EdgeTilt app. Paste the slip text instead.')
        setPasteOpen(true)
        return
      }
      if (!collected.length) {
        setError(lastOcrErr || 'Could not read a bet from those photos.')
        return
      }
      await applyIntakeDrafts(collected, { review: true })
    })()
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const apply = () => {
      const params = new URLSearchParams(window.location.search || '')
      if (params.get('tab') !== 'sports-bets') return
      const tool = sportsBetToolsFromSearch(params)
      if (tool) openTools(tool)
    }
    apply()
    window.addEventListener('popstate', apply)
    return () => window.removeEventListener('popstate', apply)
  }, [])

  const inputClass =
    'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-[15px] text-white outline-none focus:border-cyan-500'

  return (
    <>
    <ScrollLinkedEdgeTitleBarShell
      publishScrollReveal
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarToolCloseVisible={Boolean(onBack) || titleBarToolCloseVisible}
      titleBarBrand={
        ipadShell ? <TitleBarScreenTitle>Bet Tracker</TitleBarScreenTitle> : null
      }
      contentClassName="px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div data-sports-bet-tracker>
        <div className="mb-5">
          {ipadShell ? null : (
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Close Bet Tracker"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700 text-zinc-200 touch-manipulation active:bg-zinc-800"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
                </button>
              ) : null}
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
            value={bankrollNow == null ? '—' : formatUsd(bankrollNow)}
            hint={bankrollNow == null ? 'Tap to set' : 'Tap to edit'}
            onClick={openSettings}
          />
          <StatChip
            label="Unit"
            value={formatUsd(unitSize)}
            tone="cyan"
            hint="Tap to edit"
            onClick={openSettings}
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
          <button
            type="button"
            onClick={() => openTools()}
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-zinc-700 px-3 text-[12px] font-bold text-zinc-200 active:bg-zinc-800"
          >
            <Calculator className="h-3.5 w-3.5" />
            Tools
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onBetSlipPhotoPicked}
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
                      {bet.market === 'parlay'
                        ? parlaySelectionLabel(bet.legs || bet.sports_bet_legs, bet.selection_label)
                        : bet.selection_label}
                    </div>
                    <div className="mt-0.5 text-[12px] text-zinc-400">
                      {[
                        bet.market === 'parlay' ? 'Parlay' : (bet.sport_label || bet.sport_key),
                        bet.book,
                        formatAmericanOdds(bet.odds),
                        `${bet.stake_units}u`,
                        bet.stake_dollars != null ? formatUsd(bet.stake_dollars) : null,
                        sportsBetSourceLabel(bet.source),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {bet.line != null && bet.market !== 'h2h' && bet.market !== 'parlay'
                        ? ` · ${formatLine(bet.line, bet.market)}`
                        : ''}
                    </div>
                    {bet.market === 'parlay' && (bet.legs || bet.sports_bet_legs)?.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {(bet.legs || bet.sports_bet_legs).map((leg) => (
                          <li
                            key={leg.id || `${leg.leg_index}-${leg.selection_label}`}
                            className="truncate text-[11px] text-zinc-500"
                          >
                            {leg.selection_label}
                            {leg.odds != null ? ` · ${formatAmericanOdds(leg.odds)}` : ''}
                            {leg.status && leg.status !== 'open' ? ` · ${leg.status}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : bet.away_team && bet.home_team ? (
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
                    {sportsBetIsAutoGradeable(bet) ? (
                      <span className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
                        Auto-grades when final
                      </span>
                    ) : (
                      ['won', 'lost', 'push', 'void'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void onSettle(bet.id, s)}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-300 active:bg-zinc-800"
                        >
                          {s}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => openTools('hedge', bet)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-300 active:bg-zinc-800"
                    >
                      <Calculator className="h-3 w-3" />
                      Hedge
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(bet)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-300 active:bg-zinc-800"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    {sportsBetIsAutoGradeable(bet) ? (
                      <details className="contents">
                        <summary className="list-none rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-500 active:bg-zinc-800 [&::-webkit-details-marker]:hidden">
                          Manual
                        </summary>
                        {['won', 'lost', 'push', 'void'].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void onSettle(bet.id, s)}
                            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-400 active:bg-zinc-800"
                          >
                            {s}
                          </button>
                        ))}
                      </details>
                    ) : null}
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
                      onClick={() => openTools('payout', bet)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-zinc-400 active:bg-zinc-800"
                    >
                      <Calculator className="h-3 w-3" />
                      Payout
                    </button>
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

      {reviewQueue?.length && !composerOpen ? (
        <AppModalOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Review slips"
          onClick={closeReviewQueue}
        >
          <div
            data-sports-bet-review
            className="relative z-[1] flex w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-t-3xl border border-zinc-700 bg-zinc-950 shadow-xl max-h-[min(85dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-4.5rem))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-lg font-black text-white">
                Review {reviewQueue.length} slip{reviewQueue.length === 1 ? '' : 's'}
              </h2>
              <button
                type="button"
                onClick={closeReviewQueue}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
                aria-label="Close review"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
              {reviewQueue.map((item) => {
                const d = item.draft || {}
                const title = d.market === 'parlay'
                  ? parlaySelectionLabel(d.legs, d.selection_label)
                  : (d.selection_label || 'Bet')
                return (
                  <div
                    key={item.key}
                    className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70"
                  >
                    {d.slip_preview_url ? (
                      <img
                        src={d.slip_preview_url}
                        alt=""
                        className="max-h-36 w-full object-contain bg-zinc-950"
                      />
                    ) : null}
                    <div className="px-3 py-2.5">
                      <div className="truncate text-[15px] font-bold text-white">{title}</div>
                      <div className="mt-0.5 text-[12px] text-zinc-400">
                        {[
                          d.market === 'parlay' ? 'Parlay' : (d.sport_label || d.market),
                          formatAmericanOdds(d.odds),
                          d.stake_dollars ? formatUsd(d.stake_dollars) : null,
                          d.book,
                        ].filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReviewEdit(item.key)}
                          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold uppercase text-cyan-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => skipReviewItem(item.key)}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-400"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex shrink-0 gap-2 border-t border-zinc-800 px-4 py-3">
              <button
                type="button"
                onClick={closeReviewQueue}
                className="flex-1 rounded-2xl border border-zinc-700 py-3 text-[14px] font-bold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveReviewQueueAll()}
                className="flex-[1.4] rounded-2xl bg-cyan-600 py-3 text-[14px] font-bold text-white active:bg-cyan-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Save all (${reviewQueue.length})`}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      ) : null}

      {composerOpen ? (
        <AppModalOverlay
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? 'Edit bet' : 'Log bet'}
          onClick={closeComposer}
        >
          <div
            data-sports-bet-composer
            className="relative z-[1] flex w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-t-3xl border border-zinc-700 bg-zinc-950 shadow-xl max-h-[min(85dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-4.5rem))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-lg font-black text-white">{editingId ? 'Edit bet' : 'Log a bet'}</h2>
              <button
                type="button"
                onClick={closeComposer}
                className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
                aria-label="Close composer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {draft.source && draft.source !== 'manual' ? (
              <p className="shrink-0 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-400">
                {sportsBetSourceLabel(draft.source)}
              </p>
            ) : null}
            <div
              data-sports-bet-composer-scroll
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-3 touch-pan-y"
            >
              {draft.slip_preview_url ? (
                <div data-sports-bet-slip-preview className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/80">
                  <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Slip photo … check against fields below
                  </p>
                  <a
                    href={draft.slip_preview_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open full slip photo"
                    className="block max-w-full px-2 pb-2 pt-1"
                  >
                    <img
                      src={draft.slip_preview_url}
                      alt="Bet slip"
                      draggable={false}
                      className="mx-auto max-h-56 max-w-full object-contain"
                    />
                  </a>
                </div>
              ) : null}
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Market
                <select
                  className={`${inputClass} mt-1`}
                  value={draft.market}
                  onChange={(e) => {
                    const market = e.target.value
                    setDraft((d) => {
                      if (market === 'parlay') {
                        const legs = d.legs?.length >= 2 ? normalizeParlayLegs(d.legs) : blankParlayLegs()
                        return {
                          ...d,
                          market,
                          side: '',
                          line: '',
                          home_team: '',
                          away_team: '',
                          event_label: '',
                          legs,
                          selection_label: parlaySelectionLabel(legs, d.selection_label),
                        }
                      }
                      let side = d.side
                      if (market === 'prop' || market === 'total') {
                        side = side === 'under' ? 'under' : 'over'
                      } else if (!side || side === 'over' || side === 'under') {
                        side = 'home'
                      }
                      return { ...d, market, side, legs: [] }
                    })
                  }}
                >
                  <option value="spread">Spread</option>
                  <option value="h2h">Moneyline</option>
                  <option value="total">Total</option>
                  <option value="prop">Player prop</option>
                  <option value="parlay">Parlay</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {isParlayDraft(draft) ? (
                <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Legs ({normalizeParlayLegs(draft.legs).length})
                    </p>
                    <button
                      type="button"
                      className="text-[11px] font-bold uppercase text-cyan-400 active:text-cyan-300"
                      onClick={() => setDraft((d) => {
                        const combined = combinedOddsFromLegs(d.legs)
                        return combined == null ? d : { ...d, odds: String(combined) }
                      })}
                    >
                      Recompute odds
                    </button>
                  </div>
                  {normalizeParlayLegs(draft.legs).map((leg, idx) => (
                    <div key={`leg-${idx}`} className="space-y-1.5 rounded-xl border border-zinc-800 px-2.5 py-2">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Selection
                        <input
                          className={`${inputClass} mt-0.5 py-2 text-[14px]`}
                          value={leg.selection_label}
                          onChange={(e) => setDraft((d) => {
                            const legs = normalizeParlayLegs(d.legs).map((row, i) => (
                              i === idx ? { ...row, selection_label: e.target.value } : row
                            ))
                            return {
                              ...d,
                              legs,
                              selection_label: parlaySelectionLabel(legs),
                            }
                          })}
                          placeholder="BUF Bills +3.5"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Market
                          <select
                            className={`${inputClass} mt-0.5 py-2 text-[14px]`}
                            value={leg.market || 'h2h'}
                            onChange={(e) => setDraft((d) => ({
                              ...d,
                              legs: normalizeParlayLegs(d.legs).map((row, i) => (
                                i === idx ? { ...row, market: e.target.value } : row
                              )),
                            }))}
                          >
                            <option value="spread">Spread</option>
                            <option value="h2h">ML</option>
                            <option value="total">Total</option>
                            <option value="prop">Prop</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Odds
                          <input
                            className={`${inputClass} mt-0.5 py-2 text-[14px]`}
                            inputMode="numeric"
                            value={leg.odds}
                            onChange={(e) => setDraft((d) => ({
                              ...d,
                              legs: normalizeParlayLegs(d.legs).map((row, i) => (
                                i === idx ? { ...row, odds: e.target.value } : row
                              )),
                            }))}
                            placeholder="-110"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="w-full rounded-xl border border-dashed border-zinc-700 py-2 text-[12px] font-bold text-zinc-400 active:bg-zinc-800"
                    onClick={() => setDraft((d) => {
                      const legs = [
                        ...normalizeParlayLegs(d.legs),
                        { market: 'h2h', side: 'home', selection_label: '', odds: '-110' },
                      ]
                      return {
                        ...d,
                        legs: normalizeParlayLegs(legs),
                        selection_label: parlaySelectionLabel(legs),
                      }
                    })}
                  >
                    + Add leg
                  </button>
                </div>
              ) : (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Event
                    <input
                      className={`${inputClass} mt-1`}
                      value={eventLabelFromDraft(draft)}
                      onChange={(e) => setDraft((d) => applyEventLabelToDraft(d, e.target.value))}
                      placeholder="BUF Bills vs LV Raiders"
                    />
                  </label>
                  <label className="block min-w-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Event date
                    <input
                      type="datetime-local"
                      data-sports-bet-datetime
                      className={`${inputClass} mt-1 min-w-0 max-w-full`}
                      value={commenceToDatetimeLocal(draft.commence_time)}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        commence_time: datetimeLocalToIso(e.target.value),
                      }))}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Sport
                    <select
                      className={`${inputClass} mt-1`}
                      value={resolveSportsBetSport(draft.sport_key, draft.sport_label).key || ''}
                      onChange={(e) => {
                        const s = sportByKey(e.target.value) || { key: e.target.value, label: e.target.value }
                        setDraft((d) => ({ ...d, sport_key: s.key, sport_label: s.label }))
                      }}
                    >
                      <option value="">Select</option>
                      {SPORTS_BET_SPORTS.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  {draft.market === 'prop' ? (
                    <>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Player
                        <input
                          className={`${inputClass} mt-1`}
                          value={draft.player_name}
                          onChange={(e) => setDraft((d) => ({ ...d, player_name: e.target.value }))}
                          placeholder="Ja'Marr Chase"
                        />
                      </label>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Stat
                        <input
                          className={`${inputClass} mt-1`}
                          value={draft.prop_stat}
                          onChange={(e) => setDraft((d) => ({ ...d, prop_stat: e.target.value }))}
                          placeholder="rec yds"
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Side
                    <select
                      className={`${inputClass} mt-1`}
                      value={draft.side}
                      onChange={(e) => setDraft((d) => ({ ...d, side: e.target.value }))}
                    >
                      {sideSelectOptions(draft).map((o) => (
                        <option key={`${o.value}-${o.label}`} value={o.value}>{o.label}</option>
                      ))}
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
                </>
              )}
              {isParlayDraft(draft) ? (
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Combined odds
                  <input
                    className={`${inputClass} mt-1`}
                    inputMode="numeric"
                    value={draft.odds}
                    onChange={(e) => setDraft((d) => ({ ...d, odds: e.target.value }))}
                    placeholder="+450"
                  />
                </label>
              ) : null}
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
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Unit size ($)
                <input
                  className={`${inputClass} mt-1`}
                  inputMode="decimal"
                  value={draft.unit_size_dollars == null ? '' : String(draft.unit_size_dollars)}
                  onChange={(e) => {
                    const raw = e.target.value
                    const n = Number(raw)
                    setDraft((d) => ({
                      ...d,
                      unit_size_dollars: raw,
                      stake_dollars:
                        Number.isFinite(n) && n > 0
                          ? stakeDollarsFromUnits(d.stake_units, n) || d.stake_dollars
                          : d.stake_dollars,
                    }))
                    if (Number.isFinite(n) && n > 0) {
                      setUnitSize(n)
                      writeUnitSizeDollars(n)
                    }
                  }}
                  placeholder="100"
                />
              </label>
              <p className="text-[11px] text-zinc-500">1u = {formatUsd(unitSize)}. Bankroll is on the tracker, not per bet.</p>
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
                  placeholder="Kirk Cousins Over 4.5 Passing Touchdowns"
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
            </div>
            <div className="shrink-0 border-t border-zinc-800 px-4 pt-3 pb-[calc(0.75rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
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
        </AppModalOverlay>
      ) : null}

      {settingsOpen ? (
        <AppModalOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Bankroll settings"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            data-sports-bet-composer
            className="relative z-[1] max-h-[min(85dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-4.5rem))] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Bankroll & unit</h2>
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
              Set what you have now. Wins and losses move bankroll automatically. Unit size is what 1u costs.
            </p>
            {error ? <p className="mb-3 text-sm text-rose-300">{error}</p> : null}
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
        </AppModalOverlay>
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
                void applyIntakeDrafts(drafts, { review: drafts.length > 1 })
              }}
            >
              Read bets
            </button>
          </div>
        </div>
      ) : null}
    </ScrollLinkedEdgeTitleBarShell>
    {toolsOpen ? (
      <SportsBetToolsSheet
        key={`${toolsTool || 'home'}:${toolsSeed?.id || 'none'}`}
        open
        onClose={closeTools}
        bets={bets}
        bankrollNow={bankrollNow}
        unitSize={unitSize}
        initialTool={toolsTool}
        seedBet={toolsSeed}
      />
    ) : null}
    </>
  )
}
