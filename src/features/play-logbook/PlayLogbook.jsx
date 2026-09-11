import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import FreemiumUsageCounter from '../billing/FreemiumUsageCounter.jsx'
import { FREE_PLAY_LOG_LIMIT } from '../billing/freemiumToolLimits.js'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import LogPlayOptionPicker from '../../components/LogPlayOptionPicker.jsx'
import LogPlayGamePicker from './LogPlayGamePicker.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS, Z_APP_ALERT } from '../../constants/appZIndex.js'
import { resolveDefaultCaptureCasino } from '../../utils/nearbyCasinos.js'
import { consumePlayLogPrefill } from '../../utils/playLogPrefill.js'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { recordAppSessionRecorded } from '../../utils/appSectionVisitTracking.js'
import { playLogCalcSnapshotNotes } from '../../utils/playLogCalcSnapshot.js'
import {
  formatMetricValue,
  metricDefMap,
  LOG_PLAY_DENOM_DEFAULT,
  LOG_PLAY_DENOM_OPTIONS,
  normalizeDenomFormValue,
  formatTargetBonusPaidBetsLabel,
  isTargetBonusPaidField,
  orderedLogPlayFormFields,
  parseAcquisitionFee,
  playLogWinLoss,
  playLogW2GPrefillFromSave,
  LOG_PLAY_TAIL_FIELD_SLUGS,
  PLAY_LOG_CASH_RETURN_INFO_INTRO,
  formatPlayLogBetsWonLost,
  formatPlayLogPercent,
  recentEntryDisplayChips,
  entryDetailFieldsForEntry,
  runningCashReturnByEntryId,
  rtpToneFromPercentLabel,
  targetBonusPaidInBets,
  templatesSorted,
  defaultLogPlayTemplateId,
  resolvePlayLogPrefillTemplate,
  valuesForStorage,
  getLogPlaySaveValidationError,
  defsMapForTemplate,
  parseMetricInput,
  buildCustomMetricDefsForTemplate,
  customTemplateFormStateFromTemplate,
  isValidGameTemplateSlug,
  slugifyGameTemplateSlug,
  CUSTOM_METRIC_TYPE_OPTIONS,
  standardTemplatePickerSlugs,
  metricSlugsForUserTemplate,
  PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS,
  MHB_MANUFACTURER_OPTIONS,
  PLAY_LOG_ANALYZE_ALL_PLAYS_ID,
  PLAY_LOG_ANALYZE_ALL_PLAYS_METRIC_SLUGS,
  isPlayLogAnalyzeAllPlays,
  playLogTemplateDisplayLabel,
  playLogTemplatesWithLoggedSessions,
} from './playLogMetrics.js'
import { analyzePlayLogEntries } from './playLogAnalysis.js'
import { buildPlayLogAnalyzeTrendSeries } from './playLogAnalyzeChart.js'
import {
  filterPlayLogEntriesByPeriod,
  PLAY_LOG_ANALYZE_PERIOD_ALL,
  PLAY_LOG_ANALYZE_PERIODS,
  playLogAnalyzePeriodEmptyLabel,
} from './playLogAnalyzePeriod.js'
import { buildPlayLogAllPlaysCsv, buildPlayLogCsv, downloadPlayLogCsv } from './playLogExport.js'
import PlayLogPartnersSection from './PlayLogPartnersSection.jsx'
import PlayLogLedgerTab from './PlayLogLedgerTab.jsx'
import {
  playLogEntryIsSessionOwner,
  playLogEntrySessionOwnerId,
  playLogPartnersForSave,
  playLogPartnersFromSessionList,
  playLogPartnersHasExtraPartner,
  playLogPartnersToRpcPayload,
  playLogPartnersValidationError,
  playLogPartnersViewerCanMarkPaid,
  playLogPartnersViewerCanSettleOwnShare,
} from './playLogPartners.js'
import {
  buildPlayLogLedger,
  buildPlayLogLedgerSettlementInserts,
  playLogLedgerClosedKeysForSession,
  playLogLedgerSettleKeyForPaidToggle,
} from './playLogLedger.js'
import {
  deletePlayLogSharedSession,
  fetchPlayLogLedgerSettlements,
  fetchPlayLogSessionPartners,
  fetchPlayLogSessionPartnersBySessionIds,
  fetchPlayLogSessionsMeta,
  insertPlayLogLedgerSettlements,
  acceptPlayLogLedgerSettlement,
  declinePlayLogLedgerSettlement,
  nudgePlayLogLedgerSettlement,
  isPlayLogPartnersPaidRpcMissingError,
  savePlayLogSharedSession,
  updatePlayLogSessionPartnersPaid,
  updatePlayLogSharedSession,
} from './playLogApi.js'
import { lazyRoute } from '../../utils/lazyImportWithChunkReload.js'

const PlayLogAnalyzeTrendChart = lazyRoute(() => import('./PlayLogAnalyzeTrendChart.jsx'))

/** Max entries loaded for Log + Analyze (service returns newest first). */
const PLAY_LOG_ENTRIES_FETCH_LIMIT = 500

/** Flip true to restore the admin Primary game templates button on the Log tab. */
const SHOW_PRIMARY_GAME_TEMPLATES_BUTTON = false

function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localDateTimeToIso(dateYmd, timeHm) {
  if (!dateYmd || !timeHm) return new Date().toISOString()
  const [y, m, day] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  if ([y, m, day, hh, mm].some(n => Number.isNaN(n))) return new Date().toISOString()
  return new Date(y, m - 1, day, hh, mm).toISOString()
}

function captureDateTimeFromIso(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return {
      date: localYmd(now),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    }
  }
  return {
    date: localYmd(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  }
}

function fmtCapturedAt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function hydratePlayLogLedgerSettlementRows(rows, { viewerProfile, counterparts = [] } = {}) {
  return (rows || []).map(row => {
    const counterpart = counterparts.find(c => {
      if (row.counterpart_kind === 'guest') {
        return (
          c.kind === 'guest' &&
          String(c.guestLabel || '').trim().toLowerCase() ===
            String(row.counterpart_guest_label || '').trim().toLowerCase()
        )
      }
      return c.kind === 'user' && String(c.userId || '') === String(row.counterpart_user_id || '')
    })
    return {
      ...row,
      actorHandle: row.actorHandle || viewerProfile?.handle || '',
      actorDisplayName: row.actorDisplayName || viewerProfile?.display_name || '',
      counterpartHandle: row.counterpartHandle || counterpart?.handle || '',
      counterpartDisplayName: row.counterpartDisplayName || counterpart?.displayName || '',
    }
  })
}

function emptyFormFields(metricSlugs) {
  /** @type {Record<string, string>} */
  const o = {}
  for (const s of metricSlugs) {
    o[s] = s === 'denom' ? LOG_PLAY_DENOM_DEFAULT : ''
  }
  return o
}

/**
 * Swap the visible metric set to `nextSlugs`. Keep filled values that exist on
 * the new game (same slug + parseable for that field). Extra keys stay in state
 * so switching back to the previous game restores those fields.
 * @param {Record<string, unknown> | null | undefined} prev
 * @param {string[]} nextSlugs
 * @param {Record<string, { value_type?: string }>} defsMap
 */
function carryFormFieldsToTemplate(prev, nextSlugs, defsMap) {
  const next = { ...(prev || {}) }
  for (const slug of nextSlugs) {
    const raw = next[slug]
    const filled = raw != null && raw !== ''
    const type = defsMap?.[slug]?.value_type
    if (filled && (!type || parseMetricInput(raw, type) != null)) {
      next[slug] = String(raw)
      continue
    }
    next[slug] = slug === 'denom' ? LOG_PLAY_DENOM_DEFAULT : ''
  }
  if (nextSlugs.includes('denom')) {
    next.denom = normalizeDenomFormValue(next.denom)
  }
  return next
}

/** @param {Record<string, number | string> | null | undefined} values @param {string[]} metricSlugs */
function formFieldsFromPrefill(values, metricSlugs) {
  const fields = emptyFormFields(metricSlugs)
  if (!values) return fields
  for (const slug of metricSlugs) {
    const v = values[slug]
    if (v != null && v !== '') fields[slug] = String(v)
  }
  if (metricSlugs.includes('denom')) {
    fields.denom = normalizeDenomFormValue(fields.denom)
  }
  return fields
}

export default function PlayLogbook({
  supabaseClient,
  isAdmin = false,
  titleBarNavSlot = null,
  titleBarCenterSlot = null,
  titleBarToolCloseVisible = false,
  highlightEntryId = null,
  onHighlightEntryConsumed = null,
  openLedger = false,
  ledgerPartnerKey = null,
  ledgerSessionId = null,
  onLedgerDeepLinkConsumed = null,
  canCreatePlayLog = true,
  playLogsRemaining = null,
  freemiumUsageLoading = false,
  onRequireSubscribeForPlayLog = null,
  onPlayLogCreated = null,
  onScanW2G = null,
}) {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveAlertMessage, setSaveAlertMessage] = useState('')
  const [w2gHandpayPrompt, setW2gHandpayPrompt] = useState(
    /** @type {{ dateWon: string, box1Winnings: string } | null} */ (null),
  )
  const [schemaMissing, setSchemaMissing] = useState(false)

  const [activeTab, setActiveTab] = useState('log')
  const [metricDefs, setMetricDefs] = useState([])
  const [templates, setTemplates] = useState([])
  const [entries, setEntries] = useState([])
  const [sessionMetaById, setSessionMetaById] = useState(() => new Map())
  const [partnersBySessionId, setPartnersBySessionId] = useState(() => new Map())
  const [ledgerSettlements, setLedgerSettlements] = useState([])
  const [ledgerSettling, setLedgerSettling] = useState(false)
  const [pinnedLedgerPartnerKey, setPinnedLedgerPartnerKey] = useState(null)
  const [pinnedLedgerSessionId, setPinnedLedgerSessionId] = useState(null)
  const [focusIncomingSettlement, setFocusIncomingSettlement] = useState(false)
  const [viewerProfile, setViewerProfile] = useState(null)
  const [partners, setPartners] = useState([])
  const [editingSessionId, setEditingSessionId] = useState(null)

  const [sheet, setSheet] = useState(null)
  const [viewingEntryId, setViewingEntryId] = useState(null)
  const [detailPartners, setDetailPartners] = useState([])
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formFields, setFormFields] = useState({})
  const [captureCasino, setCaptureCasino] = useState('')
  const [captureNotes, setCaptureNotes] = useState('')
  const [captureDate, setCaptureDate] = useState(() => localYmd())
  const [captureTime, setCaptureTime] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const [customName, setCustomName] = useState('')
  const [customMetrics, setCustomMetrics] = useState(() => new Set())
  const [templateSheetMode, setTemplateSheetMode] = useState(/** @type {'custom' | 'system'} */ ('custom'))
  const [editingCustomTemplateId, setEditingCustomTemplateId] = useState(/** @type {string | null} */ (null))
  const [editingSystemTemplateId, setEditingSystemTemplateId] = useState(/** @type {string | null} */ (null))
  const [systemSlug, setSystemSlug] = useState('')
  const [systemMachineSlug, setSystemMachineSlug] = useState('')
  const [systemCalculatorSlug, setSystemCalculatorSlug] = useState('')
  /** @type {[Array<{ id: string, slug?: string, label: string, value_type: import('./playLogMetrics.js').PlayLogValueType }>, Function]} */
  const [customFieldDrafts, setCustomFieldDrafts] = useState([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState(
    /** @type {import('./playLogMetrics.js').PlayLogValueType} */ ('integer'),
  )

  const [analyzeTemplateId, setAnalyzeTemplateId] = useState(PLAY_LOG_ANALYZE_ALL_PLAYS_ID)
  const [analyzePeriodId, setAnalyzePeriodId] = useState(PLAY_LOG_ANALYZE_PERIOD_ALL)

  const [nearbyCasinos, setNearbyCasinos] = useState([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const casinoCoordCacheRef = useRef(null)

  const defsMap = useMemo(() => metricDefMap(metricDefs), [metricDefs])
  const sortedTemplates = useMemo(() => templatesSorted(templates), [templates])

  const templateById = useMemo(() => {
    /** @type {Record<string, typeof templates[0]>} */
    const m = {}
    for (const t of templates) m[t.id] = t
    return m
  }, [templates])

  const selectedTemplate = selectedTemplateId ? templateById[selectedTemplateId] : null
  const isAnalyzeAllPlays = isPlayLogAnalyzeAllPlays(analyzeTemplateId)
  const analyzeTemplate = isAnalyzeAllPlays
    ? null
    : analyzeTemplateId
      ? templateById[analyzeTemplateId] || null
      : null

  const selectedDefsMap = useMemo(
    () => defsMapForTemplate(defsMap, selectedTemplate),
    [defsMap, selectedTemplate],
  )
  const analyzeDefsMap = useMemo(
    () => defsMapForTemplate(defsMap, analyzeTemplate),
    [defsMap, analyzeTemplate],
  )

  const analyzePeriodEntries = useMemo(
    () => filterPlayLogEntriesByPeriod(entries, analyzePeriodId),
    [entries, analyzePeriodId],
  )

  const filteredAnalyzeEntries = useMemo(() => {
    if (isAnalyzeAllPlays) return analyzePeriodEntries
    if (!analyzeTemplate) return []
    return analyzePeriodEntries.filter(e => e.template_id === analyzeTemplate.id)
  }, [analyzePeriodEntries, analyzeTemplate, isAnalyzeAllPlays])

  const analysisStats = useMemo(() => {
    if (isAnalyzeAllPlays) {
      return analyzePlayLogEntries(analyzePeriodEntries, PLAY_LOG_ANALYZE_ALL_PLAYS_METRIC_SLUGS, {
        allPlays: true,
      })
    }
    if (!analyzeTemplate) return []
    return analyzePlayLogEntries(filteredAnalyzeEntries, analyzeTemplate.metric_slugs || [])
  }, [analyzePeriodEntries, filteredAnalyzeEntries, analyzeTemplate, isAnalyzeAllPlays])

  const analyzeTrendSeries = useMemo(
    () => buildPlayLogAnalyzeTrendSeries(filteredAnalyzeEntries),
    [filteredAnalyzeEntries],
  )

  const logPlayFormFields = useMemo(() => {
    if (!selectedTemplate) return []
    return orderedLogPlayFormFields(selectedTemplate.metric_slugs || [], selectedDefsMap)
  }, [selectedTemplate, selectedDefsMap])

  const logPlayTailFieldSlugSet = useMemo(() => new Set(LOG_PLAY_TAIL_FIELD_SLUGS), [])

  const logPlayBodyFormFields = useMemo(
    () => logPlayFormFields.filter(f => !logPlayTailFieldSlugSet.has(f.slug)),
    [logPlayFormFields, logPlayTailFieldSlugSet],
  )

  const logPlayTailFormFields = useMemo(
    () =>
      LOG_PLAY_TAIL_FIELD_SLUGS.map(slug => logPlayFormFields.find(f => f.slug === slug)).filter(Boolean),
    [logPlayFormFields],
  )

  const logPlayNetOutcome = useMemo(
    () => playLogWinLoss(formFields.money_in, formFields.money_out, formFields.acquisition_fee),
    [formFields.money_in, formFields.money_out, formFields.acquisition_fee],
  )

  const cashReturnSnapByEntryId = useMemo(() => runningCashReturnByEntryId(entries), [entries])
  const settleFocusSessionId = useMemo(() => {
    if (pinnedLedgerSessionId || ledgerSessionId) {
      return String(pinnedLedgerSessionId || ledgerSessionId)
    }
    if (!(openLedger || ledgerPartnerKey || pinnedLedgerPartnerKey) || !highlightEntryId) {
      return null
    }
    const entry = entries.find(e => String(e.id) === String(highlightEntryId))
    return entry?.session_id ? String(entry.session_id) : null
  }, [
    pinnedLedgerSessionId,
    ledgerSessionId,
    openLedger,
    ledgerPartnerKey,
    pinnedLedgerPartnerKey,
    highlightEntryId,
    entries,
  ])
  const viewerIsAdmin = isAdmin || viewerProfile?.role === 'admin'
  const isSystemTemplateSheet = templateSheetMode === 'system'

  const playLogLedger = useMemo(
    () =>
      buildPlayLogLedger({
        viewerUserId: userId,
        entries,
        partnersBySessionId,
        templateById,
        templates,
        sessionMetaById,
        settlements: ledgerSettlements,
      }),
    [userId, entries, partnersBySessionId, templateById, templates, sessionMetaById, ledgerSettlements],
  )

  const viewingEntry = useMemo(() => {
    if (!viewingEntryId) return null
    return entries.find(e => String(e.id) === String(viewingEntryId)) || null
  }, [viewingEntryId, entries])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    setSchemaMissing(false)
    try {
      const { data: auth } = await supabaseClient.auth.getUser()
      const uid = auth?.user?.id
      setUserId(uid || null)
      if (!uid) {
        setMetricDefs([])
        setTemplates([])
        setEntries([])
        setPartnersBySessionId(new Map())
        setLedgerSettlements([])
        return
      }

      const [defsRes, tplRes, entRes, profRes] = await Promise.all([
        supabaseClient.from('play_log_metric_defs').select('*').order('sort_order'),
        supabaseClient.from('play_log_game_templates').select('*').order('display_name'),
        supabaseClient
          .from('play_log_entries')
          .select('*, play_log_sessions ( created_by_user_id )')
          .order('captured_at', { ascending: false })
          .limit(PLAY_LOG_ENTRIES_FETCH_LIMIT),
        supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url, role')
          .eq('user_id', uid)
          .maybeSingle(),
      ])

      if (defsRes.error?.code === '42P01' || tplRes.error?.code === '42P01' || entRes.error?.code === '42P01') {
        setSchemaMissing(true)
        return
      }
      if (defsRes.error) throw defsRes.error
      if (tplRes.error) throw tplRes.error
      if (entRes.error) throw entRes.error

      const entList = entRes.data || []
      const sessionIds = [...new Set(entList.map(e => e.session_id).filter(Boolean))]
      let metaMap = new Map()
      try {
        metaMap = await fetchPlayLogSessionsMeta(supabaseClient, sessionIds)
      } catch {
        metaMap = new Map()
      }
      let partnersMap = new Map()
      try {
        const rawBySession = await fetchPlayLogSessionPartnersBySessionIds(
          supabaseClient,
          sessionIds,
        )
        for (const [sid, rows] of rawBySession) {
          const owner = metaMap.get(String(sid))?.created_by_user_id
          partnersMap.set(String(sid), playLogPartnersFromSessionList(rows, owner))
        }
      } catch {
        partnersMap = new Map()
      }
      let settlements = []
      try {
        settlements = await fetchPlayLogLedgerSettlements(supabaseClient)
      } catch {
        settlements = []
      }

      setMetricDefs(defsRes.data || [])
      setTemplates(tplRes.data || [])
      setEntries(entList)
      setSessionMetaById(metaMap)
      setPartnersBySessionId(partnersMap)
      setLedgerSettlements(settlements)
      setViewerProfile(profRes.data || null)
    } catch (e) {
      setError(e?.message || 'Failed to load logbook')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (isPlayLogAnalyzeAllPlays(analyzeTemplateId)) return
    const logged = playLogTemplatesWithLoggedSessions(templates, entries)
    if (!logged.some(t => String(t.id) === String(analyzeTemplateId))) {
      setAnalyzeTemplateId(PLAY_LOG_ANALYZE_ALL_PLAYS_ID)
    }
  }, [analyzeTemplateId, templates, entries])

  const openAnalyzeTab = useCallback(() => {
    setActiveTab('analyze')
    setAnalyzeTemplateId(PLAY_LOG_ANALYZE_ALL_PLAYS_ID)
    setAnalyzePeriodId(PLAY_LOG_ANALYZE_PERIOD_ALL)
  }, [])

  const closeSheet = () => {
    setSheet(null)
    setViewingEntryId(null)
    setDetailPartners([])
    setEditingEntryId(null)
    setEditingSessionId(null)
    setEditingCustomTemplateId(null)
    setEditingSystemTemplateId(null)
    setTemplateSheetMode('custom')
    setSystemSlug('')
    setSystemMachineSlug('')
    setSystemCalculatorSlug('')
    setPartners([])
    setError('')
    setSaveAlertMessage('')
    setNearbyCasinos([])
    setGpsLoading(false)
  }

  const populateCaptureCasino = useCallback(async () => {
    await resolveDefaultCaptureCasino(supabaseClient, {
      cacheRef: casinoCoordCacheRef,
      userId,
      onLoading: setGpsLoading,
      onNearby: setNearbyCasinos,
      onCasino: setCaptureCasino,
    })
  }, [supabaseClient, userId])

  const sessionOwnerId = useCallback(
    (sessionId, entry = null) => {
      if (!sessionId) return userId
      const fromEntry = entry ? playLogEntrySessionOwnerId(entry, sessionMetaById) : null
      if (fromEntry) return fromEntry
      return sessionMetaById.get(String(sessionId))?.created_by_user_id ?? null
    },
    [sessionMetaById, userId],
  )

  const handlePaidPersistError = useCallback(err => {
    if (isPlayLogPartnersPaidRpcMissingError(err)) {
      setSchemaMissing(true)
      setError(
        'Paid status needs SQL migration 20260531190000_play_log_session_manager_paid.sql (and later paid-alert migrations) on this Supabase project.',
      )
      return
    }
    setError(err?.message || 'Could not update paid status')
  }, [])

  const rememberSessionPartners = useCallback((sessionId, rows) => {
    if (!sessionId) return
    setPartnersBySessionId(prev => {
      const next = new Map(prev)
      next.set(String(sessionId), rows)
      return next
    })
  }, [])

  const settleLedgerPlays = useCallback(
    async (counterpartKey = null, sessionId = null) => {
      if (ledgerSettling) return
      const settlementInserts = buildPlayLogLedgerSettlementInserts({
        ledger: playLogLedger,
        counterpartKey,
        sessionId,
      })
      if (!settlementInserts.length) return
      setLedgerSettling(true)
      setError('')
      try {
        const inserted = await insertPlayLogLedgerSettlements(
          supabaseClient,
          userId,
          settlementInserts,
        )
        if (inserted.length) {
          const hydrated = hydratePlayLogLedgerSettlementRows(inserted, {
            viewerProfile,
            counterparts: playLogLedger.counterparts,
          })
          setLedgerSettlements(prev => [...hydrated, ...prev])
        } else {
          setError(
            'Ledger notes need SQL 20260907220000_play_log_ledger_settlements.sql on this project.',
          )
        }
      } catch (settleErr) {
        setError(settleErr?.message || 'Could not update your ledger books.')
      } finally {
        setLedgerSettling(false)
      }
    },
    [ledgerSettling, playLogLedger, userId, supabaseClient, viewerProfile],
  )

  const viewerCanEditPaid = useCallback(
    (partnerRows, ownerId) =>
      playLogPartnersViewerCanMarkPaid(partnerRows, userId, ownerId) ||
      playLogPartnersViewerCanSettleOwnShare(partnerRows, userId),
    [userId],
  )

  const settlePaidToggle = useCallback(
    async (partnerRows, sessionId, ownerId, rowKey) => {
      const row = (partnerRows || []).find(p => p.key === rowKey)
      const ledgerKey = playLogLedgerSettleKeyForPaidToggle(
        partnerRows,
        userId,
        ownerId,
        row,
      )
      if (!ledgerKey) return
      await settleLedgerPlays(ledgerKey, sessionId)
    },
    [userId, settleLedgerPlays],
  )

  const acceptLedgerSettlement = useCallback(
    async settlementId => {
      if (ledgerSettling || !settlementId) return
      setLedgerSettling(true)
      setError('')
      try {
        const row = await acceptPlayLogLedgerSettlement(supabaseClient, settlementId)
        if (row?.id) {
          setLedgerSettlements(prev =>
            prev.map(item =>
              String(item.id) === String(row.id)
                ? {
                    ...item,
                    ...row,
                    counterpart_accepted_at: row.counterpart_accepted_at,
                    counterpart_declined_at: row.counterpart_declined_at,
                  }
                : item,
            ),
          )
        }
      } catch (err) {
        setError(err?.message || 'Could not update your books.')
      } finally {
        setLedgerSettling(false)
      }
    },
    [ledgerSettling, supabaseClient],
  )

  const declineLedgerSettlement = useCallback(
    async settlementId => {
      if (ledgerSettling || !settlementId) return
      setLedgerSettling(true)
      setError('')
      try {
        const row = await declinePlayLogLedgerSettlement(supabaseClient, settlementId)
        if (row?.id) {
          setLedgerSettlements(prev =>
            prev.map(item =>
              String(item.id) === String(row.id)
                ? {
                    ...item,
                    ...row,
                    counterpart_accepted_at: row.counterpart_accepted_at,
                    counterpart_declined_at: row.counterpart_declined_at,
                  }
                : item,
            ),
          )
        }
      } catch (err) {
        setError(err?.message || 'Could not remain unsettled.')
      } finally {
        setLedgerSettling(false)
      }
    },
    [ledgerSettling, supabaseClient],
  )

  const nudgeLedgerSettlement = useCallback(
    async settlementId => {
      if (!settlementId) return
      setError('')
      try {
        const row = await nudgePlayLogLedgerSettlement(supabaseClient, settlementId)
        if (row?.id) {
          setLedgerSettlements(prev =>
            prev.map(item =>
              String(item.id) === String(row.id)
                ? {
                    ...item,
                    ...row,
                    counterpart_nudged_at: row.counterpart_nudged_at,
                  }
                : item,
            ),
          )
        }
      } catch (err) {
        setError(err?.message || 'Could not send nudge.')
      }
    },
    [supabaseClient],
  )

  const openEntryDetail = useCallback(
    async entry => {
      if (!entry?.id) return
      setViewingEntryId(entry.id)
      setDetailPartners([])
      setSheet('entryDetail')
      setError('')
      if (entry.session_id) {
        try {
          const rows = await fetchPlayLogSessionPartners(supabaseClient, entry.session_id)
          const mapped = playLogPartnersFromSessionList(rows, sessionOwnerId(entry.session_id))
          setDetailPartners(mapped)
          rememberSessionPartners(entry.session_id, mapped)
        } catch {
          setDetailPartners([])
        }
      }
    },
    [supabaseClient, sessionOwnerId, rememberSessionPartners],
  )

  const openLogPlay = useCallback(
    (opts = {}) => {
      if (!canCreatePlayLog && !opts.allowWhenLocked) {
        onRequireSubscribeForPlayLog?.()
        return
      }
      setViewingEntryId(null)
      setEditingEntryId(null)
      setEditingSessionId(null)
      setPartners([])
      const templateId = opts.templateId || defaultLogPlayTemplateId(templates)
      setSelectedTemplateId(templateId)
      const tpl = templateId ? templateById[templateId] : null
      const slugs = tpl?.metric_slugs || []
      setFormFields(
        opts.prefillValues
          ? formFieldsFromPrefill(opts.prefillValues, slugs)
          : emptyFormFields(slugs),
      )
      setCaptureCasino(opts.casinoName?.trim() || '')
      setCaptureNotes(String(opts.notes ?? '').trim())
      setCaptureDate(localYmd())
      const d = new Date()
      setCaptureTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
      setNearbyCasinos([])
      setGpsLoading(false)
      setSheet('logPlay')
      setError('')
      triggerTapHapticLight()
      if (!opts.casinoName && !opts.skipCasinoPopulate) populateCaptureCasino()
    },
    [templates, templateById, populateCaptureCasino, userId, viewerProfile, canCreatePlayLog, onRequireSubscribeForPlayLog],
  )

  const openEditEntry = useCallback(
    async (entry) => {
      const tpl = templateById[entry.template_id]
      if (!tpl) return
      if (entry.session_id && !playLogEntryIsSessionOwner(entry, userId, sessionMetaById)) return
      setViewingEntryId(null)
      setDetailPartners([])
      const { date, time } = captureDateTimeFromIso(entry.captured_at)
      setEditingEntryId(entry.id)
      setEditingSessionId(entry.session_id || null)
      setSelectedTemplateId(entry.template_id)
      setFormFields(formFieldsFromPrefill(entry.values, tpl.metric_slugs || []))
      setCaptureCasino(String(entry.casino_name || '').trim())
      setCaptureNotes(String(entry.notes || '').trim())
      setCaptureDate(date)
      setCaptureTime(time)
      setNearbyCasinos([])
      setGpsLoading(false)
      setSheet('logPlay')
      setError('')
      if (entry.session_id) {
        try {
          const rows = await fetchPlayLogSessionPartners(supabaseClient, entry.session_id)
          setPartners(
            playLogPartnersFromSessionList(rows, sessionOwnerId(entry.session_id)),
          )
        } catch {
          setPartners([])
        }
      } else {
        setPartners([])
      }
    },
    [templateById, sessionMetaById, supabaseClient, userId, viewerProfile, sessionOwnerId],
  )

  useEffect(() => {
    if (!ledgerPartnerKey) return
    setPinnedLedgerPartnerKey(ledgerPartnerKey)
    setFocusIncomingSettlement(true)
  }, [ledgerPartnerKey])

  useEffect(() => {
    if (ledgerSessionId) setPinnedLedgerSessionId(ledgerSessionId)
  }, [ledgerSessionId])

  useEffect(() => {
    if (!settleFocusSessionId) return
    setPinnedLedgerSessionId(prev => prev || settleFocusSessionId)
  }, [settleFocusSessionId])

  useEffect(() => {
    if (!highlightEntryId || loading) return
    if (openLedger || ledgerPartnerKey || pinnedLedgerPartnerKey) {
      if (settleFocusSessionId) onHighlightEntryConsumed?.()
      return
    }
    const entry = entries.find(e => String(e.id) === String(highlightEntryId))
    const el = document.querySelector(`[data-play-log-entry-id="${highlightEntryId}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    if (entry) {
      void openEntryDetail(entry)
      onHighlightEntryConsumed?.()
    }
  }, [
    highlightEntryId,
    loading,
    entries,
    onHighlightEntryConsumed,
    openEntryDetail,
    openLedger,
    ledgerPartnerKey,
    pinnedLedgerPartnerKey,
    settleFocusSessionId,
  ])

  useEffect(() => {
    if (!openLedger || loading) return
    setActiveTab('ledger')
    onLedgerDeepLinkConsumed?.()
  }, [openLedger, loading, onLedgerDeepLinkConsumed])

  useEffect(() => {
    if (loading || !templates.length) return
    const pre = consumePlayLogPrefill()
    if (!pre) return
    const tpl = resolvePlayLogPrefillTemplate(templates, pre)
    if (!tpl) return
    setActiveTab('log')
    if (!canCreatePlayLog) {
      onRequireSubscribeForPlayLog?.()
      return
    }
    openLogPlay({
      templateId: tpl.id,
      prefillValues: pre.values || {},
      notes: pre.notes || playLogCalcSnapshotNotes(pre.values) || null,
      casinoName: pre.casinoName || null,
      skipCasinoPopulate: Boolean(pre.casinoName),
    })
  }, [loading, templates, openLogPlay, canCreatePlayLog, onRequireSubscribeForPlayLog])

  const resetTemplateFormFields = () => {
    setCustomName('')
    setCustomMetrics(new Set(['spin_count']))
    setCustomFieldDrafts([])
    setNewFieldLabel('')
    setNewFieldType('integer')
    setSystemSlug('')
    setSystemMachineSlug('')
    setSystemCalculatorSlug('')
  }

  const resetCustomTemplateForm = () => {
    setEditingCustomTemplateId(null)
    resetTemplateFormFields()
  }

  const resetSystemTemplateForm = () => {
    setEditingSystemTemplateId(null)
    resetTemplateFormFields()
  }

  const cancelSystemTemplateEdit = () => {
    resetSystemTemplateForm()
    setError('')
  }

  const openCreateTemplate = () => {
    setTemplateSheetMode('custom')
    resetCustomTemplateForm()
    resetSystemTemplateForm()
    setSheet('createTemplate')
    setError('')
  }

  const openManageSystemTemplates = () => {
    if (!viewerIsAdmin) return
    setTemplateSheetMode('system')
    resetCustomTemplateForm()
    resetSystemTemplateForm()
    setSheet('createTemplate')
    setError('')
  }

  const openEditCustomTemplate = template => {
    const form = customTemplateFormStateFromTemplate(template, defsMap)
    setTemplateSheetMode('custom')
    setEditingCustomTemplateId(template.id)
    setEditingSystemTemplateId(null)
    setCustomName(form.displayName)
    setCustomMetrics(form.standardMetrics)
    setCustomFieldDrafts(form.customFieldDrafts)
    setNewFieldLabel('')
    setNewFieldType('integer')
    setSheet('createTemplate')
    setError('')
  }

  const openEditSystemTemplate = template => {
    const form = customTemplateFormStateFromTemplate(template, defsMap)
    setTemplateSheetMode('system')
    setEditingSystemTemplateId(template.id)
    setEditingCustomTemplateId(null)
    setSystemSlug(template.slug || '')
    setSystemMachineSlug(template.machine_slug || '')
    setSystemCalculatorSlug(template.calculator_slug || '')
    setCustomName(form.displayName)
    setCustomMetrics(form.standardMetrics)
    setCustomFieldDrafts(form.customFieldDrafts)
    setNewFieldLabel('')
    setNewFieldType('integer')
    setSheet('createTemplate')
    setError('')
  }

  const addCustomFieldDraft = () => {
    const label = newFieldLabel.trim()
    if (!label) {
      setError('Enter a field name.')
      return
    }
    if (customFieldDrafts.some(f => f.label.trim().toLowerCase() === label.toLowerCase())) {
      setError('You already have a field with that name.')
      return
    }
    if (customFieldDrafts.length >= 20) {
      setError('Maximum 20 custom fields per template.')
      return
    }
    setCustomFieldDrafts(prev => [
      ...prev,
      { id: crypto.randomUUID(), label, value_type: newFieldType },
    ])
    setNewFieldLabel('')
    setError('')
  }

  const onTemplateChange = (tid) => {
    if (String(tid) === String(selectedTemplateId)) return
    setSelectedTemplateId(tid)
    const tpl = templateById[tid]
    const nextSlugs = tpl?.metric_slugs || []
    const nextDefs = defsMapForTemplate(defsMap, tpl)
    setFormFields(prev => carryFormFieldsToTemplate(prev, nextSlugs, nextDefs))
  }

  const saveEntry = async () => {
    if (!userId || !selectedTemplate) return
    if (!editingEntryId && !editingSessionId && !canCreatePlayLog) {
      onRequireSubscribeForPlayLog?.()
      return
    }
    setError('')
    const validationMsg = getLogPlaySaveValidationError({
      selectedTemplateId,
      selectedTemplate,
      formFields,
      metricSlugs: selectedTemplate.metric_slugs,
      defsMap: selectedDefsMap,
    })
    if (validationMsg) {
      setSaveAlertMessage(validationMsg)
      return
    }

    const useShared =
      !editingEntryId &&
      playLogPartnersHasExtraPartner(partners, userId)
    const sharedOnEdit = Boolean(editingSessionId)

    if (useShared || sharedOnEdit) {
      const ownerId = sessionOwnerId(editingSessionId)
      const partnersForSave = playLogPartnersForSave(partners, ownerId)
      const partnerErr = playLogPartnersValidationError(partnersForSave, userId)
      if (partnerErr) {
        setSaveAlertMessage(partnerErr)
        return
      }
    }

    setSaving(true)
    try {
      const slugs = selectedTemplate.metric_slugs || []
      const stored = valuesForStorage(formFields, slugs, selectedDefsMap)
      const capturedAt = localDateTimeToIso(captureDate, captureTime)
      const casino_name = captureCasino.trim() || null
      const notes = captureNotes.trim() || null

      const sharedPartnersPayload = playLogPartnersToRpcPayload(
        playLogPartnersForSave(partners, sessionOwnerId(editingSessionId)),
      )

      if (sharedOnEdit && editingSessionId) {
        const originalTemplateId = entries.find(e => e.id === editingEntryId)?.template_id
        await updatePlayLogSharedSession(supabaseClient, {
          sessionId: editingSessionId,
          capturedAt,
          casinoName: casino_name,
          notes,
          values: stored,
          partners: sharedPartnersPayload,
          templateId:
            selectedTemplate.id && selectedTemplate.id !== originalTemplateId
              ? selectedTemplate.id
              : undefined,
        })
      } else if (useShared) {
        await savePlayLogSharedSession(supabaseClient, {
          templateId: selectedTemplate.id,
          capturedAt,
          casinoName: casino_name,
          notes,
          values: stored,
          partners: sharedPartnersPayload,
        })
      } else if (editingEntryId) {
        const { error: e } = await supabaseClient
          .from('play_log_entries')
          .update({
            template_id: selectedTemplate.id,
            captured_at: capturedAt,
            casino_name,
            notes,
            values: stored,
          })
          .eq('id', editingEntryId)
        if (e) throw e
      } else {
        const { error: e } = await supabaseClient.from('play_log_entries').insert({
          user_id: userId,
          template_id: selectedTemplate.id,
          captured_at: capturedAt,
          casino_name,
          notes,
          values: stored,
        })
        if (e) throw e
      }
      const handpayPrefill =
        !editingEntryId && !sharedOnEdit
          ? playLogW2GPrefillFromSave(stored, captureDate)
          : null
      closeSheet()
      triggerTapHapticLight()
      if (!editingEntryId && !editingSessionId) {
        void recordAppSessionRecorded(supabaseClient, 'play-logbook', selectedTemplate.id)
      }
      await loadAll()
      if (!editingEntryId && !sharedOnEdit) onPlayLogCreated?.()
      if (handpayPrefill) setW2gHandpayPrompt(handpayPrefill)
    } catch (e) {
      setError(e?.message || (editingEntryId ? 'Failed to update entry' : 'Failed to save entry'))
    } finally {
      setSaving(false)
    }
  }

  const saveCustomTemplate = async () => {
    if (!userId) return
    const name = customName.trim()
    if (!name) {
      setError('Name your game template.')
      return
    }
    const customDefs = buildCustomMetricDefsForTemplate(customFieldDrafts, [
      ...Object.keys(defsMap),
      ...PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS,
      ...customMetrics,
    ])
    setSaving(true)
    setError('')
    try {
      const sortMap = defsMapForTemplate(defsMap, { custom_metric_defs: customDefs })
      const metric_slugs = metricSlugsForUserTemplate(
        [...customMetrics, ...customDefs.map(d => d.slug)],
        sortMap,
      )
      const payload = {
        display_name: name,
        metric_slugs,
        custom_metric_defs: customDefs,
      }
      if (editingCustomTemplateId) {
        const { error: e } = await supabaseClient
          .from('play_log_game_templates')
          .update(payload)
          .eq('id', editingCustomTemplateId)
          .eq('is_system', false)
        if (e) throw e
        closeSheet()
        await loadAll()
      } else {
        const { data, error: e } = await supabaseClient
          .from('play_log_game_templates')
          .insert({
            user_id: userId,
            ...payload,
            is_system: false,
          })
          .select('*')
          .single()
        if (e) throw e
        closeSheet()
        await loadAll()
        if (data?.id) openLogPlay({ templateId: data.id })
      }
    } catch (e) {
      setError(
        e?.message ||
          (editingCustomTemplateId ? 'Failed to update template' : 'Failed to create template'),
      )
    } finally {
      setSaving(false)
    }
  }

  const saveSystemTemplate = async () => {
    if (!viewerIsAdmin) return
    const name = customName.trim()
    if (!name) {
      setError('Name the primary game.')
      return
    }
    const slugRaw = (editingSystemTemplateId ? systemSlug : systemSlug || slugifyGameTemplateSlug(name))
      .trim()
      .toLowerCase()
    if (!isValidGameTemplateSlug(slugRaw)) {
      setError('Slug must be lowercase letters, numbers, and hyphens (e.g. phoenix-link).')
      return
    }
    const customDefs = buildCustomMetricDefsForTemplate(customFieldDrafts, [
      ...Object.keys(defsMap),
      ...PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS,
      ...customMetrics,
    ])
    setSaving(true)
    setError('')
    try {
      const sortMap = defsMapForTemplate(defsMap, { custom_metric_defs: customDefs })
      const metric_slugs = metricSlugsForUserTemplate(
        [...customMetrics, ...customDefs.map(d => d.slug)],
        sortMap,
      )
      const payload = {
        slug: slugRaw,
        display_name: name,
        machine_slug: systemMachineSlug.trim() || null,
        calculator_slug: systemCalculatorSlug.trim() || null,
        metric_slugs,
        custom_metric_defs: customDefs,
        is_system: true,
        user_id: null,
      }
      if (editingSystemTemplateId) {
        const { error: e } = await supabaseClient
          .from('play_log_game_templates')
          .update(payload)
          .eq('id', editingSystemTemplateId)
          .eq('is_system', true)
        if (e) throw e
      } else {
        const { error: e } = await supabaseClient.from('play_log_game_templates').insert(payload)
        if (e) throw e
      }
      closeSheet()
      await loadAll()
    } catch (e) {
      setError(
        e?.message ||
          (editingSystemTemplateId ? 'Failed to update primary game' : 'Failed to create primary game'),
      )
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (entry) => {
    const entryId = entry?.id || entry
    const sessionId = entry?.session_id
    let isOwner = playLogEntryIsSessionOwner(entry, userId, sessionMetaById)
    if (sessionId && !isOwner && !playLogEntrySessionOwnerId(entry, sessionMetaById)) {
      try {
        const meta = await fetchPlayLogSessionsMeta(supabaseClient, [sessionId])
        const fetched = meta.get(String(sessionId))?.created_by_user_id
        if (fetched && String(fetched) === String(userId)) isOwner = true
        if (fetched) {
          setSessionMetaById(prev => {
            const next = new Map(prev)
            next.set(String(sessionId), { created_by_user_id: fetched })
            return next
          })
        }
      } catch {
        /* fall through - partner-only delete */
      }
    }
    const msg = sessionId
      ? isOwner
        ? 'Delete this shared play for everyone? All partners will lose their log entries.'
        : 'Remove this play from your logbook only? Other partners keep their entries.'
      : 'Delete this log entry?'
    if (!window.confirm(msg)) return
    setError('')
    const wasViewing = viewingEntryId != null && String(viewingEntryId) === String(entryId)
    try {
      if (sessionId && isOwner) {
        await deletePlayLogSharedSession(supabaseClient, sessionId)
      } else {
        const { error: e } = await supabaseClient.from('play_log_entries').delete().eq('id', entryId)
        if (e) throw e
      }
      if (wasViewing) closeSheet()
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Failed to delete entry')
    }
  }

  const deleteCustomTemplate = async (templateId) => {
    if (!window.confirm('Delete this custom game template? Entries using it will remain.')) return
    try {
      const { error: e } = await supabaseClient
        .from('play_log_game_templates')
        .delete()
        .eq('id', templateId)
        .eq('is_system', false)
      if (e) throw e
      if (analyzeTemplateId === templateId) setAnalyzeTemplateId(PLAY_LOG_ANALYZE_ALL_PLAYS_ID)
      if (editingCustomTemplateId === templateId) resetCustomTemplateForm()
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Failed to delete template')
    }
  }

  const deleteSystemTemplate = async (templateId) => {
    if (!viewerIsAdmin) return
    if (!window.confirm('Delete this primary game template? Existing log entries will remain.')) return
    try {
      const { error: e } = await supabaseClient
        .from('play_log_game_templates')
        .delete()
        .eq('id', templateId)
        .eq('is_system', true)
      if (e) throw e
      if (analyzeTemplateId === templateId) setAnalyzeTemplateId(PLAY_LOG_ANALYZE_ALL_PLAYS_ID)
      if (selectedTemplateId === templateId) setSelectedTemplateId('')
      if (editingSystemTemplateId === templateId) resetSystemTemplateForm()
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Failed to delete primary game')
    }
  }

  const standardFieldSlugsSorted = useMemo(
    () => standardTemplatePickerSlugs(defsMap),
    [defsMap],
  )

  return (
    <>
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarToolCloseVisible={titleBarToolCloseVisible}
      contentClassName="px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div data-play-logbook>
        <div className="mb-5">
          <h1 className="min-w-0 text-white text-2xl font-black tracking-tight">Play Logbook</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Capture AP slot data · analyze later</p>
          <FreemiumUsageCounter
            remaining={playLogsRemaining}
            limit={FREE_PLAY_LOG_LIMIT}
            itemLabelPlural="play logs"
            loading={freemiumUsageLoading}
            className="mt-2 text-left"
          />
        </div>

        <div className="flex rounded-2xl bg-zinc-900 p-1 gap-1 mb-5" data-play-logbook-card>
          {[
            { id: 'log', label: 'LOG' },
            { id: 'analyze', label: 'ANALYZE' },
            { id: 'ledger', label: 'LEDGER' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.id === 'analyze' ? openAnalyzeTab() : setActiveTab(tab.id))}
              className={`flex-1 py-2.5 px-1 rounded-xl text-[13px] font-bold whitespace-nowrap touch-manipulation transition-colors ${
                activeTab === tab.id ? 'bg-cyan-600 text-white' : 'text-zinc-400 active:bg-zinc-800'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1">
                {tab.label}
                {tab.id === 'ledger' && playLogLedger.peopleCount > 0 ? (
                  <span
                    data-play-logbook-ledger-dot
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      activeTab === 'ledger' ? 'bg-white' : 'bg-cyan-300'
                    }`}
                    aria-hidden
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>

        {schemaMissing && (
          <div className="rounded-2xl border border-amber-500/40 bg-zinc-900 p-4 mb-4 text-sm text-zinc-300" data-play-logbook-card>
            <div className="font-semibold text-amber-300 mb-1">Database not ready</div>
            Apply play logbook SQL on your Supabase test project, then refresh. Migrations:{' '}
            <code className="text-cyan-300">20260529120000_play_logbook.sql</code>,{' '}
            <code className="text-cyan-300">20260531140000_play_log_shared_sessions.sql</code> (shared partners),{' '}
            <code className="text-cyan-300">20260531180000_play_log_update_shared_partners.sql</code> (edit attributions),{' '}
            <code className="text-cyan-300">20260531190000_play_log_session_manager_paid.sql</code> (manager / paid),{' '}
            <code className="text-cyan-300">20260531200000_play_log_partner_paid_notification.sql</code> (paid alerts; or{' '}
            <code className="text-cyan-300">20260531300000_play_log_partner_paid_notify_repair.sql</code> if that was skipped),{' '}
            <code className="text-cyan-300">20260531310000_play_log_partner_unpaid_notification.sql</code> (unpaid alerts),{' '}
            <code className="text-cyan-300">20260531210000_play_log_manager_owner_default.sql</code> (owner = manager default).
          </div>
        )}

        {error && !sheet && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        {loading ? (
          <div className="text-zinc-500 text-sm py-8 text-center">Loading…</div>
        ) : activeTab === 'log' ? (
          <>
            <div className="flex flex-col gap-2 mb-5">
              <button
                type="button"
                onClick={() => openLogPlay()}
                disabled={!sortedTemplates.length || schemaMissing}
                data-play-logbook-primary-btn
                data-play-logbook-primary-locked={!canCreatePlayLog ? 'true' : undefined}
                className={`w-full rounded-3xl bg-cyan-600 py-4 text-white font-bold text-base touch-manipulation active:bg-cyan-700 disabled:opacity-40 ${
                  canCreatePlayLog ? '' : 'opacity-45 cursor-not-allowed'
                }`}
              >
                + Log Play
              </button>
              <button
                type="button"
                onClick={openCreateTemplate}
                disabled={schemaMissing}
                className="w-full rounded-2xl py-3 text-zinc-400 text-sm font-semibold touch-manipulation active:text-zinc-200 disabled:opacity-40"
              >
                Custom game templates
              </button>
              {SHOW_PRIMARY_GAME_TEMPLATES_BUTTON && viewerIsAdmin ? (
                <button
                  type="button"
                  onClick={openManageSystemTemplates}
                  disabled={schemaMissing}
                  className="w-full rounded-2xl py-3 text-amber-300/90 text-sm font-semibold touch-manipulation active:text-amber-200 disabled:opacity-40 border border-amber-500/30"
                >
                  Primary game templates
                </button>
              ) : null}
            </div>

            {entries.length === 0 ? (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center" data-play-logbook-card>
                <div className="text-zinc-400 text-sm">No plays logged yet.</div>
                <div className="text-zinc-500 text-xs mt-1">Tap + Log Play to capture your first sample.</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1 mb-1">
                  Recent entries
                </div>
                {entries.map(entry => {
                  const tpl = templateById[entry.template_id]
                  const chips = recentEntryDisplayChips(entry, defsMapForTemplate(defsMap, tpl))
                  const cashReturnSnap = cashReturnSnapByEntryId[entry.id]
                  const runningReturnLabel = cashReturnSnap?.label
                  const runningReturnTone = rtpToneFromPercentLabel(runningReturnLabel)
                  const shared = Boolean(entry.session_id)
                  const highlight =
                    highlightEntryId && String(highlightEntryId) === String(entry.id)
                  const entryTitle = playLogTemplateDisplayLabel(tpl, templates) || 'Unknown game'
                  return (
                    <div
                      key={entry.id}
                      tabIndex={0}
                      data-play-log-entry-id={entry.id}
                      aria-label={`${entryTitle}, ${fmtCapturedAt(entry.captured_at)}. Open entry details.`}
                      onClick={() => {
                        if (isPlayLogEntryOpenSuppressed()) return
                        void openEntryDetail(entry)
                      }}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        if (e.currentTarget !== e.target) return
                        e.preventDefault()
                        void openEntryDetail(entry)
                      }}
                      className={`w-full text-left rounded-2xl bg-zinc-900 border p-4 touch-manipulation cursor-pointer active:bg-zinc-800/90 ${
                        highlight ? 'border-cyan-500/70 ring-1 ring-cyan-500/30' : 'border-zinc-800/60'
                      }`}
                      data-play-logbook-card
                      data-play-logbook-entry
                    >
                      <div className="mb-2 min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="min-w-0 truncate text-white font-bold">
                            {playLogTemplateDisplayLabel(tpl, templates) || 'Unknown game'}
                          </span>
                          {shared ? (
                            <span className="shrink-0 rounded-md bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                              Shared
                            </span>
                          ) : null}
                          {runningReturnLabel ? (
                            <RunningReturnLabelButton
                              label={runningReturnLabel}
                              unweightedAvgReturnPct={cashReturnSnap?.unweightedAvgReturnPct ?? null}
                              avgBetsWonLost={cashReturnSnap?.avgBetsWonLost ?? null}
                              coinInRtpPct={cashReturnSnap?.coinInRtpPct ?? null}
                              coinInPlayCount={cashReturnSnap?.coinInPlayCount ?? 0}
                              toneClass={
                                runningReturnTone === 'win'
                                  ? 'text-emerald-300'
                                  : runningReturnTone === 'loss'
                                    ? 'text-red-300'
                                    : 'text-zinc-400'
                              }
                            />
                          ) : null}
                        </div>
                        <div className="text-zinc-500 text-xs mt-0.5">{fmtCapturedAt(entry.captured_at)}</div>
                        {entry.casino_name ? (
                          <div className="text-zinc-400 text-xs mt-0.5 truncate">{entry.casino_name}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {chips.map(chip => (
                          <span
                            key={chip.key}
                            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-xs"
                          >
                            <span className="text-zinc-500">{chip.label}:</span>
                            <span
                              className={`font-semibold tabular-nums ${
                                chip.tone === 'win'
                                  ? 'text-emerald-300'
                                  : chip.tone === 'loss'
                                    ? 'text-red-300'
                                    : 'text-zinc-200'
                              }`}
                            >
                              {chip.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </>
        ) : activeTab === 'ledger' ? (
          <PlayLogLedgerTab
            ledger={playLogLedger}
            settlements={ledgerSettlements}
            viewerUserId={userId}
            settling={ledgerSettling}
            initialCounterpartKey={pinnedLedgerPartnerKey || ledgerPartnerKey}
            initialSessionId={settleFocusSessionId}
            focusIncomingSettlement={focusIncomingSettlement}
            onFocusIncomingConsumed={() => setFocusIncomingSettlement(false)}
            onSettleAll={counterpartKey => void settleLedgerPlays(counterpartKey)}
            onSettlePlay={(counterpartKey, sessionId) =>
              void settleLedgerPlays(counterpartKey, sessionId)
            }
            onAcceptSettlement={settlementId => void acceptLedgerSettlement(settlementId)}
            onDeclineSettlement={settlementId => void declineLedgerSettlement(settlementId)}
            onNudgeSettlement={settlementId => void nudgeLedgerSettlement(settlementId)}
            onOpenEntry={entryId => {
              const entry = entries.find(e => String(e.id) === String(entryId))
              if (entry) void openEntryDetail(entry)
            }}
          />
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-zinc-400 text-xs mb-1.5">Scope</label>
              <LogPlayGamePicker
                value={analyzeTemplateId}
                onChange={setAnalyzeTemplateId}
                templates={templates}
                entries={entries}
                ariaLabel="Analyze scope"
                placeholder="Select scope"
                includeAllPlaysOption
              />
            </div>

            <div className="mb-4" data-play-logbook-analyze-period>
              <label className="block text-zinc-400 text-xs mb-1.5">Period</label>
              <div className="flex flex-wrap gap-1.5">
                {PLAY_LOG_ANALYZE_PERIODS.map(period => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => setAnalyzePeriodId(period.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold touch-manipulation transition-colors ${
                      analyzePeriodId === period.id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 active:bg-zinc-700'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredAnalyzeEntries.length === 0 ? (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center" data-play-logbook-card>
                <div className="text-zinc-400 text-sm">
                  {analyzePeriodEntries.length === 0
                    ? playLogAnalyzePeriodEmptyLabel(analyzePeriodId)
                    : isAnalyzeAllPlays
                      ? 'No plays logged yet.'
                      : 'No entries for this game in this period.'}
                </div>
              </div>
            ) : (
              <>
                <div
                  className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4 mb-4"
                  data-play-logbook-card
                  data-play-logbook-chart
                >
                  <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">
                    Return &amp; P/L trend
                  </div>
                  <p className="text-zinc-500 text-xs mt-1 leading-snug">
                    Cumulative net profit/loss in dollars (left axis) and cash return % (right axis),
                    oldest → newest. Cash return is out ÷ in, not slot RTP. P/L includes acquisition fees when
                    logged.
                  </p>
                  {analyzeTrendSeries.chartable ? (
                    <div className="mt-3">
                      <Suspense
                        fallback={
                          <div className="h-52 flex items-center justify-center text-zinc-500 text-sm">
                            Loading chart…
                          </div>
                        }
                      >
                        <PlayLogAnalyzeTrendChart series={analyzeTrendSeries} />
                      </Suspense>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl overflow-hidden bg-zinc-800/50 px-4 py-6 text-center text-zinc-500 text-sm">
                      {analyzeTrendSeries.minPlaysHint || 'Not enough data for a trend yet.'}
                    </div>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {analysisStats.map(stat => (
                    <div
                      key={stat.key}
                      className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4"
                      data-play-logbook-card
                      data-play-logbook-stat
                    >
                      <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">{stat.label}</div>
                      <div className="text-white text-2xl font-black tabular-nums mt-1">{stat.value}</div>
                      {stat.hint ? <p className="text-zinc-500 text-xs mt-2 leading-snug">{stat.hint}</p> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      const slug = isAnalyzeAllPlays ? 'all-plays' : analyzeTemplate?.slug || 'game'
                      const csv = isAnalyzeAllPlays
                        ? buildPlayLogAllPlaysCsv(filteredAnalyzeEntries, templates, defsMap)
                        : buildPlayLogCsv(filteredAnalyzeEntries, analyzeTemplate, analyzeDefsMap)
                      downloadPlayLogCsv(csv, `play-logbook-${slug}-${localYmd()}.csv`)
                    }}
                    className="w-full min-h-12 rounded-2xl bg-zinc-800 text-sm font-semibold text-cyan-300 touch-manipulation active:bg-zinc-700"
                  >
                    Export CSV
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ScrollLinkedEdgeTitleBarShell>

      {sheet && (
        <div
          className={APP_MODAL_OVERLAY_CLASS}
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
        >
          <div
            data-bankroll-sheet
            className={
              sheet === 'logPlay'
                ? `${APP_MODAL_SHEET_PANEL_CLASS} !overflow-y-hidden flex flex-col !pb-0 !max-h-[min(92dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-3rem))]`
                : sheet === 'entryDetail'
                  ? `${APP_MODAL_SHEET_PANEL_CLASS} !overflow-y-hidden flex flex-col !pb-0`
                  : APP_MODAL_SHEET_PANEL_CLASS
            }
            onClick={e => e.stopPropagation()}
          >
            {sheet === 'logPlay' && selectedTemplate && (
              <>
                <div className="shrink-0">
                  <SheetHeader title={editingEntryId ? 'Edit Play' : 'Log Play'} onClose={closeSheet} />
                </div>
                <div
                  data-log-play-sheet-scroll
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                >
                  <div className="space-y-3 pb-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Game</label>
                      <LogPlayGamePicker
                        value={selectedTemplateId}
                        onChange={onTemplateChange}
                        templates={templates}
                        entries={entries}
                        ariaLabel="Game"
                        placeholder="Select game"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-zinc-400 text-xs mb-1.5">Date</label>
                        <DateWheelPicker value={captureDate} onChange={setCaptureDate} showYear />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-xs mb-1.5">Time</label>
                        <TimeWheelPicker value={captureTime} onChange={setCaptureTime} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Casino</label>
                      <CasinoAutocomplete
                        value={captureCasino}
                        onChange={setCaptureCasino}
                        supabaseClient={supabaseClient}
                        nearbyCasinos={nearbyCasinos}
                        gpsLoading={gpsLoading}
                        placeholder="Optional"
                      />
                    </div>
                    <LogPlayMetricFieldsList
                      fields={logPlayBodyFormFields}
                      formFields={formFields}
                      setFormFields={setFormFields}
                    />
                    {userId ? (
                      <PlayLogPartnersSection
                        supabaseClient={supabaseClient}
                        userId={userId}
                        ownerUserId={sessionOwnerId(editingSessionId) ?? userId}
                        viewerProfile={viewerProfile}
                        partners={partners}
                        onPartnersChange={rows => {
                          setPartners(rows)
                          if (editingSessionId) rememberSessionPartners(editingSessionId, rows)
                        }}
                        netOutcome={logPlayNetOutcome}
                        playBetSize={formFields.bet_size}
                        canEditPaid={viewerCanEditPaid(
                          partners,
                          sessionOwnerId(editingSessionId) ?? userId,
                        )}
                        closedPartnerKeys={
                          editingSessionId
                            ? playLogLedgerClosedKeysForSession(
                                ledgerSettlements,
                                userId,
                                editingSessionId,
                              )
                            : undefined
                        }
                        onSettlePartnerPlay={
                          editingSessionId &&
                          viewerCanEditPaid(
                            partners,
                            sessionOwnerId(editingSessionId) ?? userId,
                          )
                            ? async key => {
                                await settlePaidToggle(
                                  partners,
                                  editingSessionId,
                                  sessionOwnerId(editingSessionId) ?? userId,
                                  key,
                                )
                              }
                            : undefined
                        }
                        onPaidPersist={
                          editingSessionId &&
                          playLogPartnersViewerCanMarkPaid(
                            partners,
                            userId,
                            sessionOwnerId(editingSessionId) ?? userId,
                          )
                            ? async rows => {
                                await updatePlayLogSessionPartnersPaid(supabaseClient, {
                                  sessionId: editingSessionId,
                                  partners: playLogPartnersToRpcPayload(rows),
                                })
                              }
                            : undefined
                        }
                        onPaidPersistError={handlePaidPersistError}
                      />
                    ) : null}
                    <LogPlayTailMetricFields
                      fields={logPlayTailFormFields}
                      formFields={formFields}
                      setFormFields={setFormFields}
                    />
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Notes</label>
                      <textarea
                        value={captureNotes}
                        onChange={e => setCaptureNotes(e.target.value)}
                        rows={2}
                        placeholder="Machine bank, observations…"
                        className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40 resize-none"
                      />
                    </div>
                  </div>
                  {error ? <p className="text-red-400 text-sm pb-3">{error}</p> : null}
                </div>
                <div className="shrink-0 pt-3 pb-[calc(1rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      data-log-play-cancel-btn
                      onClick={closeSheet}
                      disabled={saving}
                      className="flex-1 min-h-12 rounded-2xl bg-zinc-800 text-white font-semibold touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEntry}
                      disabled={saving}
                      className="flex-1 min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : editingEntryId ? 'Save changes' : 'Save Entry'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {sheet === 'entryDetail' && viewingEntry && (() => {
              const tpl = templateById[viewingEntry.template_id]
              const detailRows = entryDetailFieldsForEntry(
                viewingEntry,
                tpl,
                defsMapForTemplate(defsMap, tpl),
              )
              const shared = Boolean(viewingEntry.session_id)
              const isOwner = playLogEntryIsSessionOwner(viewingEntry, userId, sessionMetaById)
              const canEdit = !shared || isOwner
              const cashReturnSnap = cashReturnSnapByEntryId[viewingEntry.id]
              const runningReturnLabel = cashReturnSnap?.label
              const runningReturnTone = rtpToneFromPercentLabel(runningReturnLabel)
              const detailNetOutcome = playLogWinLoss(
                viewingEntry.values?.money_in,
                viewingEntry.values?.money_out,
                viewingEntry.values?.acquisition_fee,
              )
              const detailCreatorId = sessionOwnerId(viewingEntry.session_id, viewingEntry)
              const detailCanMarkPaid = playLogPartnersViewerCanMarkPaid(
                detailPartners,
                userId,
                detailCreatorId,
              )
              const detailCanEditPaid = viewerCanEditPaid(detailPartners, detailCreatorId)
              return (
                <>
                  <SheetHeader
                    title={playLogTemplateDisplayLabel(tpl, templates) || 'Play entry'}
                    onClose={closeSheet}
                  />
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mt-2">
                    <div className="space-y-4 pb-3">
                      <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {shared ? (
                            <span className="shrink-0 rounded-md bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                              Shared
                            </span>
                          ) : null}
                          {runningReturnLabel ? (
                            <RunningReturnLabelButton
                              label={runningReturnLabel}
                              unweightedAvgReturnPct={cashReturnSnap?.unweightedAvgReturnPct ?? null}
                              avgBetsWonLost={cashReturnSnap?.avgBetsWonLost ?? null}
                              coinInRtpPct={cashReturnSnap?.coinInRtpPct ?? null}
                              coinInPlayCount={cashReturnSnap?.coinInPlayCount ?? 0}
                              toneClass={
                                runningReturnTone === 'win'
                                  ? 'text-emerald-300'
                                  : runningReturnTone === 'loss'
                                    ? 'text-red-300'
                                    : 'text-zinc-400'
                              }
                            />
                          ) : null}
                        </div>
                        <div className="text-zinc-500 text-sm mt-1">{fmtCapturedAt(viewingEntry.captured_at)}</div>
                        {viewingEntry.casino_name ? (
                          <div className="text-zinc-400 text-sm mt-0.5">{viewingEntry.casino_name}</div>
                        ) : null}
                      </div>
                      {detailRows.length > 0 ? (
                        <div className="rounded-2xl bg-zinc-800/50 border border-zinc-800/80 px-4 divide-y divide-zinc-800/80">
                          {detailRows.map(row => (
                            <div key={row.slug} className="flex items-start justify-between gap-3 py-2.5">
                              <span className="text-zinc-500 text-sm shrink-0">{row.label}</span>
                              <span className="text-white text-sm font-semibold tabular-nums text-right">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {viewingEntry.notes ? (
                        <div>
                          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-1.5">Notes</div>
                          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{viewingEntry.notes}</p>
                        </div>
                      ) : null}
                      {shared && detailPartners.length > 0 && userId ? (
                        <PlayLogPartnersSection
                          supabaseClient={supabaseClient}
                          userId={userId}
                          ownerUserId={sessionOwnerId(viewingEntry.session_id, viewingEntry)}
                          viewerProfile={viewerProfile}
                          partners={detailPartners}
                          onPartnersChange={rows => {
                            setDetailPartners(rows)
                            rememberSessionPartners(viewingEntry.session_id, rows)
                          }}
                          readOnly
                          canEditManager={false}
                          canEditPaid={detailCanEditPaid}
                          netOutcome={detailNetOutcome}
                          playBetSize={viewingEntry.values?.bet_size}
                          closedPartnerKeys={
                            viewingEntry.session_id
                              ? playLogLedgerClosedKeysForSession(
                                  ledgerSettlements,
                                  userId,
                                  viewingEntry.session_id,
                                )
                              : undefined
                          }
                          onSettlePartnerPlay={
                            detailCanEditPaid && viewingEntry.session_id
                              ? async key => {
                                await settlePaidToggle(
                                  detailPartners,
                                  viewingEntry.session_id,
                                  detailCreatorId,
                                  key,
                                )
                              }
                              : undefined
                          }
                          onPaidPersist={
                            detailCanMarkPaid && viewingEntry.session_id
                              ? async rows => {
                                  await updatePlayLogSessionPartnersPaid(supabaseClient, {
                                    sessionId: viewingEntry.session_id,
                                    partners: playLogPartnersToRpcPayload(rows),
                                  })
                                }
                              : undefined
                          }
                          onPaidPersistError={handlePaidPersistError}
                        />
                      ) : null}
                    </div>
                    {error ? <p className="text-red-400 text-sm pb-3">{error}</p> : null}
                    {schemaMissing ? (
                      <p className="text-amber-300/90 text-xs pb-3">
                        Apply the migrations listed on the Logbook tab, then refresh.
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex gap-2 pt-3 pb-[calc(1rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void openEditEntry(viewingEntry)}
                        className="flex-1 min-h-12 rounded-2xl bg-zinc-800 text-white font-bold touch-manipulation active:bg-zinc-700"
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteEntry(viewingEntry)}
                      className={`min-h-12 rounded-2xl bg-red-600/20 text-red-400 font-bold touch-manipulation active:bg-red-600/30 ${
                        canEdit ? 'flex-1' : 'w-full'
                      }`}
                    >
                      {shared && isOwner ? 'Delete for all' : shared ? 'Remove from my log' : 'Delete'}
                    </button>
                  </div>
                </>
              )
            })()}

            {sheet === 'createTemplate' && (
              <>
                <SheetHeader
                  title={
                    isSystemTemplateSheet
                      ? editingSystemTemplateId
                        ? 'Edit primary game'
                        : 'Primary game templates'
                      : editingCustomTemplateId
                        ? 'Edit Game Template'
                        : 'Create Game Template'
                  }
                  onClose={closeSheet}
                />
                <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                  {isSystemTemplateSheet
                    ? editingSystemTemplateId
                      ? 'Update the form fields shown in the primary games dropdown for everyone.'
                      : 'Add or edit built-in games in the Log Play picker (admin only). Slug stays fixed after create.'
                    : editingCustomTemplateId
                      ? 'Update fields for this game, or pick another template below to edit.'
                      : 'Name your game and pick which fields to capture each time you log a play.'}
                </p>
                {isSystemTemplateSheet && sortedTemplates.some(t => t.is_system) ? (
                  <div className="mb-4">
                    <div className="text-amber-400/80 text-xs font-semibold uppercase tracking-wide mb-2">
                      Primary games
                    </div>
                    <ul className="space-y-1.5">
                      {sortedTemplates
                        .filter(t => t.is_system)
                        .map(t => {
                          const editing = editingSystemTemplateId === t.id
                          return (
                            <li
                              key={t.id}
                              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                                editing
                                  ? 'bg-amber-600/15 border border-amber-500/40'
                                  : 'bg-zinc-800/80 border border-transparent'
                              }`}
                            >
                              <span className="min-w-0 truncate text-sm font-semibold text-zinc-200">
                                {t.display_name}
                                <span className="text-zinc-500 font-normal text-xs ml-1.5">{t.slug}</span>
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditSystemTemplate(t)}
                                  className="text-amber-300 text-xs font-bold px-2 py-1 touch-manipulation active:text-amber-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteSystemTemplate(t.id)}
                                  className="text-zinc-500 text-xs font-semibold px-2 py-1 touch-manipulation active:text-red-400"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          )
                        })}
                    </ul>
                    {editingSystemTemplateId ? (
                      <button
                        type="button"
                        onClick={() => {
                          resetSystemTemplateForm()
                          setError('')
                        }}
                        className="mt-2 text-amber-300 text-xs font-semibold touch-manipulation active:text-amber-200"
                      >
                        + New primary game
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {!isSystemTemplateSheet && sortedTemplates.some(t => !t.is_system) ? (
                  <div className="mb-4">
                    <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-2">
                      Your custom games
                    </div>
                    <ul className="space-y-1.5">
                      {sortedTemplates
                        .filter(t => !t.is_system)
                        .map(t => {
                          const editing = editingCustomTemplateId === t.id
                          return (
                            <li
                              key={t.id}
                              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                                editing
                                  ? 'bg-cyan-600/15 border border-cyan-500/40'
                                  : 'bg-zinc-800/80 border border-transparent'
                              }`}
                            >
                              <span className="min-w-0 truncate text-sm font-semibold text-zinc-200">
                                {playLogTemplateDisplayLabel(t, templates)}
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditCustomTemplate(t)}
                                  className="text-cyan-400 text-xs font-bold px-2 py-1 touch-manipulation active:text-cyan-300"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteCustomTemplate(t.id)}
                                  className="text-zinc-500 text-xs font-semibold px-2 py-1 touch-manipulation active:text-red-400"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          )
                        })}
                    </ul>
                    {editingCustomTemplateId ? (
                      <button
                        type="button"
                        onClick={() => {
                          resetCustomTemplateForm()
                          setError('')
                        }}
                        className="mt-2 text-cyan-400 text-xs font-semibold touch-manipulation active:text-cyan-300"
                      >
                        + New custom game
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {isSystemTemplateSheet ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-zinc-400 text-xs mb-1.5">Slug</label>
                      {editingSystemTemplateId ? (
                        <p className="min-h-12 flex items-center rounded-2xl bg-zinc-800/60 px-4 text-zinc-300 font-mono text-sm">
                          {systemSlug}
                        </p>
                      ) : (
                        <input
                          type="text"
                          value={systemSlug}
                          onChange={e => setSystemSlug(e.target.value.toLowerCase())}
                          placeholder={slugifyGameTemplateSlug(customName) || 'e.g. phoenix-link'}
                          className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                      )}
                      <p className="text-zinc-600 text-xs mt-1.5">
                        Used for calculator links; auto-filled from name if left blank on create.
                      </p>
                    </div>
                    <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-zinc-400 text-xs mb-1.5">Machine slug (optional)</label>
                        <input
                          type="text"
                          value={systemMachineSlug}
                          onChange={e => setSystemMachineSlug(e.target.value)}
                          placeholder="e.g. phoenix-link"
                          className="w-full min-h-11 rounded-2xl bg-zinc-800 px-4 text-white text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-xs mb-1.5">Calculator slug (optional)</label>
                        <input
                          type="text"
                          value={systemCalculatorSlug}
                          onChange={e => setSystemCalculatorSlug(e.target.value)}
                          placeholder="e.g. phoenix-link"
                          className="w-full min-h-11 rounded-2xl bg-zinc-800 px-4 text-white text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="mb-4">
                  <label className="block text-zinc-400 text-xs mb-1.5">
                    {isSystemTemplateSheet ? 'Display name' : 'Game name'}
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="e.g. Dragon Link High Limit"
                    className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div className="mb-5">
                  <label className="block text-zinc-400 text-xs mb-1">Standard fields</label>
                  <p className="text-zinc-600 text-xs mb-2">
                    Bet size, denom, cash in, and cash out are always included.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {standardFieldSlugsSorted.map(slug => {
                      const def = defsMap[slug]
                      const on = customMetrics.has(slug)
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => {
                            setCustomMetrics(prev => {
                              const next = new Set(prev)
                              if (next.has(slug)) next.delete(slug)
                              else next.add(slug)
                              return next
                            })
                          }}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold touch-manipulation border ${
                            on
                              ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                              : 'bg-zinc-800 border-zinc-700/60 text-zinc-400 active:bg-zinc-700'
                          }`}
                        >
                          {def?.label || slug}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mb-5">
                  <label className="block text-zinc-400 text-xs mb-2">Custom fields</label>
                  <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-3 space-y-3">
                    <div>
                      <label className="block text-zinc-500 text-[11px] mb-1">Field name</label>
                      <input
                        type="text"
                        value={newFieldLabel}
                        onChange={e => setNewFieldLabel(e.target.value)}
                        placeholder="e.g. Chomp Size"
                        className="w-full min-h-11 rounded-xl bg-zinc-800 px-3 text-white text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-500 text-[11px] mb-1.5">Data type</label>
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOM_METRIC_TYPE_OPTIONS.map(opt => {
                          const on = newFieldType === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setNewFieldType(opt.value)}
                              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold touch-manipulation border ${
                                on
                                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                                  : 'bg-zinc-800 border-zinc-700/60 text-zinc-400 active:bg-zinc-700'
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addCustomFieldDraft}
                      className="w-full min-h-11 rounded-xl bg-zinc-800 text-cyan-300 text-sm font-bold touch-manipulation border border-cyan-500/30 active:bg-zinc-700"
                    >
                      Create field
                    </button>
                  </div>
                  {customFieldDrafts.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {customFieldDrafts.map(field => {
                        const typeLabel =
                          CUSTOM_METRIC_TYPE_OPTIONS.find(o => o.value === field.value_type)?.label ||
                          field.value_type
                        return (
                          <li
                            key={field.id}
                            className="flex items-center gap-2 rounded-xl bg-zinc-800/80 px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 text-white text-sm font-semibold truncate">
                              {field.label}
                            </span>
                            <span className="shrink-0 text-zinc-500 text-[11px] font-medium">{typeLabel}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCustomFieldDrafts(prev => prev.filter(f => f.id !== field.id))
                              }
                              className="shrink-0 text-zinc-500 text-xs font-semibold px-2 py-1 touch-manipulation active:text-red-400"
                              aria-label={`Remove ${field.label}`}
                            >
                              Remove
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-zinc-600 text-xs mt-2">Optional - add fields unique to this game.</p>
                  )}
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                {isSystemTemplateSheet && editingSystemTemplateId ? (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={cancelSystemTemplateEdit}
                      disabled={saving}
                      className="min-h-12 flex-1 rounded-2xl bg-zinc-800 text-zinc-300 font-bold touch-manipulation active:bg-zinc-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveSystemTemplate}
                      disabled={saving || !viewerIsAdmin}
                      className="min-h-12 flex-[1.4] rounded-2xl bg-amber-600 text-white font-bold touch-manipulation active:bg-amber-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save primary game'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={isSystemTemplateSheet ? saveSystemTemplate : saveCustomTemplate}
                    disabled={saving || (isSystemTemplateSheet && !viewerIsAdmin)}
                    className={`w-full min-h-12 rounded-2xl text-white font-bold touch-manipulation disabled:opacity-50 ${
                      isSystemTemplateSheet
                        ? 'bg-amber-600 active:bg-amber-700'
                        : 'bg-cyan-600 active:bg-cyan-700'
                    }`}
                  >
                    {saving
                      ? isSystemTemplateSheet
                        ? editingSystemTemplateId
                          ? 'Saving…'
                          : 'Creating…'
                        : editingCustomTemplateId
                          ? 'Saving…'
                          : 'Creating…'
                      : isSystemTemplateSheet
                        ? editingSystemTemplateId
                          ? 'Save primary game'
                          : 'Create primary game'
                        : editingCustomTemplateId
                          ? 'Save changes'
                          : 'Create & Log Play'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {saveAlertMessage ? (
        <div
          className="fixed inset-0 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm"
          style={{ zIndex: Z_APP_ALERT }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="play-log-save-alert-title"
          onClick={() => setSaveAlertMessage('')}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-600/80 bg-zinc-900 px-5 py-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15"
                aria-hidden
              >
                <svg
                  className="h-7 w-7 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </div>
              <h3 id="play-log-save-alert-title" className="text-lg font-bold text-white mb-2">
                Cannot save play
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{saveAlertMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveAlertMessage('')}
              className="mt-5 w-full min-h-11 rounded-xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      {w2gHandpayPrompt
        ? createPortal(
            <div
              className="fixed inset-0 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px),var(--edge-sab,0px))] bg-black/70 backdrop-blur-sm sm:items-center"
              style={{ zIndex: Z_APP_ALERT }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="play-log-w2g-prompt-title"
              data-w2g-handpay-prompt
              onClick={() => setW2gHandpayPrompt(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-amber-400/25 bg-zinc-900 px-5 py-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">W-2G</div>
                <h3 id="play-log-w2g-prompt-title" className="mt-1 text-lg font-bold text-white">
                  Scan the W-2G?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  Cash out is {w2gHandpayPrompt.box1Winnings}
                  {w2gHandpayPrompt.dateWon ? ` on ${w2gHandpayPrompt.dateWon}` : ''}. Casinos
                  issue a W-2G at $1,200. We can prefill date and box 1.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setW2gHandpayPrompt(null)}
                    className="min-h-11 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-200 touch-manipulation"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const prefill = w2gHandpayPrompt
                      setW2gHandpayPrompt(null)
                      onScanW2G?.(prefill)
                    }}
                    className="min-h-11 rounded-xl bg-amber-400 text-sm font-bold text-zinc-950 touch-manipulation"
                  >
                    Scan
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function LogPlayMetricFieldsList({ fields, formFields, setFormFields }) {
  const winLoss = useMemo(
    () => playLogWinLoss(formFields.money_in, formFields.money_out, formFields.acquisition_fee),
    [formFields.money_in, formFields.money_out, formFields.acquisition_fee],
  )
  const winLossLabel = parseAcquisitionFee(formFields.acquisition_fee) != null ? 'Net win / loss' : 'Win / loss'

  const nodes = []
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field.slug === 'mhb_meter') {
      const mhbField = fields[i + 1]?.slug === 'must_hit_by' ? fields[i + 1] : null
      nodes.push(
        <LogPlayMetricPairRow
          key="mhb-meter-cap"
          left={field}
          right={mhbField}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      if (mhbField) i += 1
      continue
    }
    if (field.slug === 'must_hit_by') {
      nodes.push(
        <LogPlayMetricPairRow
          key="must-hit-by-only"
          left={null}
          right={field}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      continue
    }
    if (field.slug === 'counter') {
      const endField = fields[i + 1]?.slug === 'counter_at_hit' ? fields[i + 1] : null
      nodes.push(
        <LogPlayMetricPairRow
          key="counter-start-end"
          left={field}
          right={endField}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      if (endField) i += 1
      continue
    }
    if (field.slug === 'counter_at_hit') {
      nodes.push(
        <LogPlayMetricPairRow
          key="counter-end-only"
          left={null}
          right={field}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      continue
    }
    if (field.slug === 'bet_size') {
      const denomField = fields[i + 1]?.slug === 'denom' ? fields[i + 1] : null
      nodes.push(
        <LogPlayMetricPairRow
          key="bet-denom"
          left={field}
          right={denomField}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      if (denomField) i += 1
      continue
    }
    if (field.slug === 'denom') {
      nodes.push(
        <LogPlayMetricPairRow
          key="denom-only"
          left={null}
          right={field}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      continue
    }
    if (field.slug === 'money_in') {
      const outField = fields[i + 1]?.slug === 'money_out' ? fields[i + 1] : null
      nodes.push(
        <LogPlayMetricPairRow
          key="money-in-out"
          left={field}
          right={outField}
          formFields={formFields}
          setFormFields={setFormFields}
          footer={field && outField ? (
            <div className="mt-1.5 flex items-center justify-between gap-3 px-0.5">
              <span className="text-zinc-500 text-xs font-medium">{winLossLabel}</span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  winLoss == null ? 'text-zinc-500' : winLoss >= 0 ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                {winLoss == null ? '-' : formatMetricValue(winLoss, 'money')}
              </span>
            </div>
          ) : null}
        />,
      )
      if (outField) i += 1
      continue
    }
    if (field.slug === 'money_out') {
      nodes.push(
        <LogPlayMetricPairRow
          key="money-out-only"
          left={null}
          right={field}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      continue
    }
    if (field.slug === 'current_ev_rtp') {
      const avgField = fields[i + 1]?.slug === 'average_case_mult' ? fields[i + 1] : null
      nodes.push(
        <LogPlayMetricPairRow
          key="calc-ev-avg"
          left={field}
          right={avgField}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      if (avgField) i += 1
      continue
    }
    if (field.slug === 'average_case_mult') {
      nodes.push(
        <LogPlayMetricPairRow
          key="avg-mult-only"
          left={null}
          right={field}
          formFields={formFields}
          setFormFields={setFormFields}
        />,
      )
      continue
    }
    const betsLabel = isTargetBonusPaidField(field)
      ? formatTargetBonusPaidBetsLabel(
          targetBonusPaidInBets(formFields[field.slug], formFields.bet_size),
        )
      : null
    nodes.push(
      <div key={field.slug}>
        <label className="block text-zinc-400 text-xs mb-1.5">{field.label}</label>
        <LogPlayFormMetricControl
          field={field}
          value={formFields[field.slug] ?? ''}
          onChange={v => setFormFields(p => ({ ...p, [field.slug]: v }))}
          trailingHint={betsLabel}
        />
      </div>,
    )
  }
  return nodes
}

function LogPlayMetricPairRow({ left, right, formFields, setFormFields, footer = null }) {
  return (
    <div>
      <div className={`grid gap-2 ${left && right ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {left ? (
          <div>
            <label className="block text-zinc-400 text-xs mb-1.5">{left.label}</label>
            <LogPlayFormMetricControl
              field={left}
              value={formFields[left.slug] ?? ''}
              onChange={v => setFormFields(p => ({ ...p, [left.slug]: v }))}
            />
          </div>
        ) : null}
        {right ? (
          <div>
            <label className="block text-zinc-400 text-xs mb-1.5">{right.label}</label>
            <LogPlayFormMetricControl
              field={right}
              value={formFields[right.slug] ?? ''}
              onChange={v => setFormFields(p => ({ ...p, [right.slug]: v }))}
            />
          </div>
        ) : null}
      </div>
      {footer}
    </div>
  )
}

/** Below Partners: acquisition fee solo, then spin + bonus counts paired. */
function LogPlayTailMetricFields({ fields, formFields, setFormFields }) {
  if (!fields?.length) return null
  const acquisitionFee = fields.find(f => f.slug === 'acquisition_fee') ?? null
  const spinCount = fields.find(f => f.slug === 'spin_count') ?? null
  const bonusCount = fields.find(f => f.slug === 'bonus_count') ?? null

  return (
    <>
      {acquisitionFee ? (
        <div>
          <label className="block text-zinc-400 text-xs mb-1.5">{acquisitionFee.label}</label>
          <LogPlayFormMetricControl
            field={acquisitionFee}
            value={formFields[acquisitionFee.slug] ?? ''}
            onChange={v => setFormFields(p => ({ ...p, [acquisitionFee.slug]: v }))}
          />
        </div>
      ) : null}
      {spinCount || bonusCount ? (
        <LogPlayMetricPairRow
          left={spinCount}
          right={bonusCount}
          formFields={formFields}
          setFormFields={setFormFields}
        />
      ) : null}
    </>
  )
}

function LogPlayFormMetricControl({ field, value, onChange, trailingHint = null }) {
  if (field.slug === 'mhb_manufacturer') {
    return (
      <MhbManufacturerSelect
        value={String(value ?? '').trim().toLowerCase()}
        onChange={onChange}
      />
    )
  }
  if (field.slug === 'denom') {
    return (
      <DenomSelect
        value={normalizeDenomFormValue(value)}
        onChange={onChange}
      />
    )
  }
  if (field.slug === 'acquisition_fee') {
    return (
      <MetricFieldInput
        value={value}
        onChange={v => onChange(v.replace(/[^0-9.]/g, ''))}
        valueType={field.value_type}
        trailingHint={trailingHint}
      />
    )
  }
  return (
    <MetricFieldInput
      value={value}
      onChange={onChange}
      valueType={field.value_type}
      trailingHint={trailingHint}
    />
  )
}

function DenomSelect({ value, onChange }) {
  return (
    <LogPlayOptionPicker
      value={value || LOG_PLAY_DENOM_DEFAULT}
      onChange={onChange}
      options={LOG_PLAY_DENOM_OPTIONS}
      ariaLabel="Denom"
    />
  )
}

function MhbManufacturerSelect({ value, onChange }) {
  return (
    <LogPlayOptionPicker
      value={value || MHB_MANUFACTURER_OPTIONS[0].value}
      onChange={onChange}
      options={MHB_MANUFACTURER_OPTIONS}
      ariaLabel="Manufacturer"
    />
  )
}

function MetricFieldInput({ value, onChange, valueType, trailingHint = null }) {
  if (valueType === 'money') {
    return (
      <div className="relative">
        <span className="absolute top-1/2 -translate-y-1/2 left-4 text-zinc-400 font-semibold pointer-events-none">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9.-]/g, ''))}
          className={`w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40 ${
            trailingHint ? 'pr-[7.25rem]' : 'pr-4'
          }`}
        />
        {trailingHint ? (
          <span className="pointer-events-none absolute top-1/2 right-4 max-w-[6.5rem] -translate-y-1/2 truncate text-right text-[11px] font-semibold tabular-nums text-zinc-400">
            {trailingHint}
          </span>
        ) : null}
      </div>
    )
  }
  if (valueType === 'integer') {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40 tabular-nums"
      />
    )
  }
  if (valueType === 'decimal') {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9.-]/g, ''))}
        className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40 tabular-nums"
      />
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
    />
  )
}

function percentToneClass(pct) {
  const tone = rtpToneFromPercentLabel(formatPlayLogPercent(pct))
  if (tone === 'win') return 'text-emerald-300'
  if (tone === 'loss') return 'text-red-300'
  return 'text-zinc-300'
}

function betsToneClass(bets) {
  if (bets == null || !Number.isFinite(bets)) return 'text-zinc-300'
  if (bets > 0) return 'text-emerald-300'
  if (bets < 0) return 'text-red-300'
  return 'text-zinc-300'
}

const RTP_POPOVER_VIEWPORT_MARGIN = 12
const RTP_POPOVER_ANCHOR_GAP = 6

/** After return popover dismiss, block entry-card open (avoids click-through on touch). */
let playLogEntryOpenSuppressUntil = 0

function suppressPlayLogEntryOpenBriefly(ms = 450) {
  playLogEntryOpenSuppressUntil = Date.now() + ms
}

function isPlayLogEntryOpenSuppressed() {
  return Date.now() < playLogEntryOpenSuppressUntil
}

/** @param {HTMLElement} anchorEl @param {HTMLElement} panelEl */
function layoutRtpPopoverPosition(anchorEl, panelEl) {
  const ar = anchorEl.getBoundingClientRect()
  const pw = panelEl.offsetWidth
  const ph = panelEl.offsetHeight
  const margin = RTP_POPOVER_VIEWPORT_MARGIN
  const gap = RTP_POPOVER_ANCHOR_GAP
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = ar.left
  if (left + pw > vw - margin) left = vw - margin - pw
  if (left < margin) left = margin

  const belowTop = ar.bottom + gap
  const aboveTop = ar.top - gap - ph
  let top = belowTop
  if (belowTop + ph > vh - margin && aboveTop >= margin) {
    top = aboveTop
  } else if (belowTop + ph > vh - margin) {
    top = Math.max(margin, vh - margin - ph)
  }
  top = Math.max(margin, Math.min(top, vh - margin - ph))

  return { left, top }
}

function RunningReturnLabelButton({
  label,
  toneClass,
  unweightedAvgReturnPct,
  avgBetsWonLost,
  coinInRtpPct,
  coinInPlayCount = 0,
}) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState(/** @type {{ left: number, top: number } | null} */ (null))
  const anchorRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const popoverRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const unweightedLabel = formatPlayLogPercent(unweightedAvgReturnPct)
  const avgBetsLabel = formatPlayLogBetsWonLost(avgBetsWonLost)
  const coinInRtpLabel = formatPlayLogPercent(coinInRtpPct)

  const repositionPopover = useCallback(() => {
    const anchor = anchorRef.current
    const panel = popoverRef.current
    if (!anchor || !panel) return
    setPopoverPos(layoutRtpPopoverPosition(anchor, panel))
  }, [])

  const closePopover = useCallback(() => {
    suppressPlayLogEntryOpenBriefly()
    setOpen(false)
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null)
      return undefined
    }
    repositionPopover()
    const onReflow = () => repositionPopover()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, repositionPopover, unweightedLabel, avgBetsLabel, coinInRtpLabel])

  const popoverLayer =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 cursor-default bg-transparent touch-none"
              style={{ zIndex: Z_APP_ALERT - 1 }}
              aria-label="Close cash return info"
              onPointerDown={e => {
                e.preventDefault()
                e.stopPropagation()
                closePopover()
              }}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
            />
            <div
              ref={popoverRef}
              role="tooltip"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: popoverPos?.left ?? -9999,
                top: popoverPos?.top ?? -9999,
                zIndex: Z_APP_ALERT,
                visibility: popoverPos ? 'visible' : 'hidden',
                maxHeight: `calc(100dvh - ${RTP_POPOVER_VIEWPORT_MARGIN * 2}px)`,
              }}
              className="w-[min(18rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-zinc-600/80 bg-zinc-800 px-3 py-2.5 text-left text-[11px] leading-snug text-zinc-200 shadow-lg"
            >
              <p>{PLAY_LOG_CASH_RETURN_INFO_INTRO}</p>
              {unweightedLabel ? (
                <>
                  <hr className="my-2 border-zinc-600/60" />
                  <p className="leading-snug text-zinc-200">
                    Unweighted average cash return (each play equal) is{' '}
                    <span className={`font-bold tabular-nums ${percentToneClass(unweightedAvgReturnPct)}`}>
                      {unweightedLabel}
                    </span>
                    .
                  </p>
                </>
              ) : null}
              {avgBetsLabel ? (
                <>
                  <hr className="my-2 border-zinc-600/60" />
                  <p className="leading-snug text-zinc-200">
                    Avg bets won/lost through this play is{' '}
                    <span className={`font-bold tabular-nums ${betsToneClass(avgBetsWonLost)}`}>
                      {avgBetsLabel}
                    </span>
                    .
                  </p>
                </>
              ) : null}
              {coinInRtpLabel ? (
                <>
                  <hr className="my-2 border-zinc-600/60" />
                  <p className="leading-snug text-zinc-200">
                    RTP from {coinInPlayCount} play{coinInPlayCount === 1 ? '' : 's'} with # spins is{' '}
                    <span className={`font-bold tabular-nums ${percentToneClass(coinInRtpPct)}`}>
                      {coinInRtpLabel}
                    </span>
                    .
                  </p>
                </>
              ) : null}
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <span className={`inline-flex shrink-0 ${toneClass}`}>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label={`Cash return ${label}. Tap for details.`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          if (open) {
            closePopover()
          } else {
            setOpen(true)
          }
        }}
        className={`shrink-0 touch-manipulation border-0 bg-transparent p-0 text-xs font-bold tabular-nums underline decoration-dotted decoration-current/50 underline-offset-2 opacity-95 hover:opacity-100 active:opacity-100 [-webkit-tap-highlight-color:transparent] ${toneClass}`}
      >
        {label}
      </button>
      {popoverLayer}
    </span>
  )
}

function SheetHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="text-white font-bold text-lg">{title}</div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm touch-manipulation active:bg-zinc-700"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  )
}
