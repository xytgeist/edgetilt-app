import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import QuickLinkPageToggle from '../../components/QuickLinkPageToggle.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import LogPlayOptionPicker from '../../components/LogPlayOptionPicker.jsx'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS, Z_APP_ALERT } from '../../constants/appZIndex.js'
import { resolveDefaultCaptureCasino } from '../../utils/nearbyCasinos.js'
import { consumePlayLogPrefill } from '../../utils/playLogPrefill.js'
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
  PLAY_LOG_REAL_RTP_INFO_INTRO,
  formatPlayLogRealRtp,
  recentEntryDisplayChips,
  entryDetailFieldsForEntry,
  runningRealRtpByEntryId,
  rtpToneFromPercentLabel,
  sortMetricSlugs,
  targetBonusPaidInBets,
  templatesSorted,
  valuesForStorage,
  getLogPlaySaveValidationError,
  defsMapForTemplate,
  buildCustomMetricDefsForTemplate,
  CUSTOM_METRIC_TYPE_OPTIONS,
  standardTemplatePickerSlugs,
  metricSlugsForUserTemplate,
  PLAY_LOG_TEMPLATE_REQUIRED_FIELD_SLUGS,
} from './playLogMetrics.js'
import { analyzePlayLogEntries } from './playLogAnalysis.js'
import { buildPlayLogCsv, downloadPlayLogCsv } from './playLogExport.js'
import PlayLogPartnersSection from './PlayLogPartnersSection.jsx'
import {
  defaultCreatorPartnerRow,
  playLogEntryIsSessionOwner,
  playLogEntrySessionOwnerId,
  playLogPartnersForSave,
  playLogPartnersFromSessionList,
  playLogPartnersHasExtraPartner,
  playLogPartnersToRpcPayload,
  playLogPartnersValidationError,
  playLogPartnersViewerCanMarkPaid,
} from './playLogPartners.js'
import {
  deletePlayLogSharedSession,
  fetchPlayLogSessionPartners,
  fetchPlayLogSessionsMeta,
  isPlayLogPartnersPaidRpcMissingError,
  savePlayLogSharedSession,
  updatePlayLogSessionPartnersPaid,
  updatePlayLogSharedSession,
} from './playLogApi.js'

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

function emptyFormFields(metricSlugs) {
  /** @type {Record<string, string>} */
  const o = {}
  for (const s of metricSlugs) {
    o[s] = s === 'denom' ? LOG_PLAY_DENOM_DEFAULT : ''
  }
  return o
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
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  highlightEntryId = null,
  onHighlightEntryConsumed = null,
}) {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveAlertMessage, setSaveAlertMessage] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)

  const [activeTab, setActiveTab] = useState('log')
  const [metricDefs, setMetricDefs] = useState([])
  const [templates, setTemplates] = useState([])
  const [entries, setEntries] = useState([])
  const [sessionMetaById, setSessionMetaById] = useState(() => new Map())
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
  /** @type {[Array<{ id: string, label: string, value_type: import('./playLogMetrics.js').PlayLogValueType }>, Function]} */
  const [customFieldDrafts, setCustomFieldDrafts] = useState([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState(
    /** @type {import('./playLogMetrics.js').PlayLogValueType} */ ('integer'),
  )

  const [analyzeTemplateId, setAnalyzeTemplateId] = useState('')

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
  const analyzeTemplate = analyzeTemplateId ? templateById[analyzeTemplateId] : sortedTemplates[0] || null

  const selectedDefsMap = useMemo(
    () => defsMapForTemplate(defsMap, selectedTemplate),
    [defsMap, selectedTemplate],
  )
  const analyzeDefsMap = useMemo(
    () => defsMapForTemplate(defsMap, analyzeTemplate),
    [defsMap, analyzeTemplate],
  )

  const filteredAnalyzeEntries = useMemo(() => {
    if (!analyzeTemplate) return []
    return entries.filter(e => e.template_id === analyzeTemplate.id)
  }, [entries, analyzeTemplate])

  const analysisStats = useMemo(() => {
    if (!analyzeTemplate) return []
    return analyzePlayLogEntries(filteredAnalyzeEntries, analyzeTemplate.metric_slugs || [])
  }, [filteredAnalyzeEntries, analyzeTemplate])

  const logPlayFormFields = useMemo(() => {
    if (!selectedTemplate) return []
    return orderedLogPlayFormFields(selectedTemplate.metric_slugs || [], selectedDefsMap)
  }, [selectedTemplate, selectedDefsMap])

  const logPlayNetOutcome = useMemo(
    () => playLogWinLoss(formFields.money_in, formFields.money_out, formFields.acquisition_fee),
    [formFields.money_in, formFields.money_out, formFields.acquisition_fee],
  )

  const realRtpSnapByEntryId = useMemo(() => runningRealRtpByEntryId(entries), [entries])

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
        return
      }

      const [defsRes, tplRes, entRes, profRes] = await Promise.all([
        supabaseClient.from('play_log_metric_defs').select('*').order('sort_order'),
        supabaseClient.from('play_log_game_templates').select('*').order('display_name'),
        supabaseClient
          .from('play_log_entries')
          .select('*, play_log_sessions ( created_by_user_id )')
          .order('captured_at', { ascending: false })
          .limit(200),
        supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
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

      setMetricDefs(defsRes.data || [])
      setTemplates(tplRes.data || [])
      setEntries(entList)
      setSessionMetaById(metaMap)
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
    if (templates.length && !analyzeTemplateId) {
      setAnalyzeTemplateId(templates.find(t => t.is_system)?.id || templates[0].id)
    }
  }, [templates, analyzeTemplateId])

  const closeSheet = () => {
    setSheet(null)
    setViewingEntryId(null)
    setDetailPartners([])
    setEditingEntryId(null)
    setEditingSessionId(null)
    setPartners([])
    setError('')
    setSaveAlertMessage('')
    setNearbyCasinos([])
    setGpsLoading(false)
  }

  const populateCaptureCasino = useCallback(async () => {
    await resolveDefaultCaptureCasino(supabaseClient, {
      cacheRef: casinoCoordCacheRef,
      onLoading: setGpsLoading,
      onNearby: setNearbyCasinos,
      onCasino: setCaptureCasino,
    })
  }, [supabaseClient])

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
          setDetailPartners(
            playLogPartnersFromSessionList(rows, sessionOwnerId(entry.session_id)),
          )
        } catch {
          setDetailPartners([])
        }
      }
    },
    [supabaseClient, sessionOwnerId],
  )

  const openLogPlay = useCallback(
    (opts = {}) => {
      setViewingEntryId(null)
      setEditingEntryId(null)
      setEditingSessionId(null)
      setPartners(userId ? [defaultCreatorPartnerRow(userId, viewerProfile)] : [])
      const templateId = opts.templateId || sortedTemplates[0]?.id || ''
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
      if (!opts.casinoName && !opts.skipCasinoPopulate) populateCaptureCasino()
    },
    [sortedTemplates, templateById, populateCaptureCasino, userId, viewerProfile],
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
          setPartners(userId ? [defaultCreatorPartnerRow(userId, viewerProfile)] : [])
        }
      } else {
        setPartners(userId ? [defaultCreatorPartnerRow(userId, viewerProfile)] : [])
      }
    },
    [templateById, sessionMetaById, supabaseClient, userId, viewerProfile, sessionOwnerId],
  )

  useEffect(() => {
    if (!highlightEntryId || loading) return
    const entry = entries.find(e => String(e.id) === String(highlightEntryId))
    const el = document.querySelector(`[data-play-log-entry-id="${highlightEntryId}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    if (entry) {
      void openEntryDetail(entry)
      onHighlightEntryConsumed?.()
    }
  }, [highlightEntryId, loading, entries, onHighlightEntryConsumed, openEntryDetail])

  useEffect(() => {
    if (loading || !templates.length) return
    const pre = consumePlayLogPrefill()
    if (!pre) return
    const tpl =
      templates.find(t => pre.calculatorSlug && t.calculator_slug === pre.calculatorSlug) ||
      templates.find(t => pre.templateSlug && t.slug === pre.templateSlug)
    if (!tpl) return
    setActiveTab('log')
    openLogPlay({
      templateId: tpl.id,
      prefillValues: pre.values || {},
      notes: pre.notes || playLogCalcSnapshotNotes(pre.values) || null,
      casinoName: pre.casinoName || null,
      skipCasinoPopulate: Boolean(pre.casinoName),
    })
  }, [loading, templates, openLogPlay])

  const openCreateTemplate = () => {
    setCustomName('')
    setCustomMetrics(new Set(['spin_count']))
    setCustomFieldDrafts([])
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
    setSelectedTemplateId(tid)
    const tpl = templateById[tid]
    setFormFields(emptyFormFields(tpl?.metric_slugs || []))
  }

  const saveEntry = async () => {
    if (!userId || !selectedTemplate) return
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
        await updatePlayLogSharedSession(supabaseClient, {
          sessionId: editingSessionId,
          capturedAt,
          casinoName: casino_name,
          notes,
          values: stored,
          partners: sharedPartnersPayload,
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
      closeSheet()
      await loadAll()
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
      const { data, error: e } = await supabaseClient
        .from('play_log_game_templates')
        .insert({
          user_id: userId,
          display_name: name,
          metric_slugs,
          custom_metric_defs: customDefs,
          is_system: false,
        })
        .select('*')
        .single()
      if (e) throw e
      closeSheet()
      await loadAll()
      if (data?.id) openLogPlay({ templateId: data.id })
    } catch (e) {
      setError(e?.message || 'Failed to create template')
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
        /* fall through — partner-only delete */
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
      if (analyzeTemplateId === templateId) setAnalyzeTemplateId('')
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Failed to delete template')
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
      titleBarToolCloseVisible={titleBarToolCloseVisible}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div data-play-logbook>
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 text-white text-2xl font-black tracking-tight">Play Logbook</h1>
            <QuickLinkPageToggle destinationId="logbook" className="mb-0 shrink-0" />
          </div>
          <p className="text-zinc-400 text-sm mt-0.5">Capture AP slot data · analyze later</p>
        </div>

        <div className="flex rounded-2xl bg-zinc-900 p-1 gap-1 mb-5" data-play-logbook-card>
          {[
            { id: 'log', label: 'LOG' },
            { id: 'analyze', label: 'ANALYZE' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold touch-manipulation transition-colors ${
                activeTab === tab.id ? 'bg-cyan-600 text-white' : 'text-zinc-400 active:bg-zinc-800'
              }`}
            >
              {tab.label}
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
                className="w-full rounded-3xl bg-cyan-600 py-4 text-white font-bold text-base touch-manipulation active:bg-cyan-700 disabled:opacity-40"
              >
                + Log Play
              </button>
              <button
                type="button"
                onClick={openCreateTemplate}
                disabled={schemaMissing}
                className="w-full rounded-2xl py-3 text-zinc-400 text-sm font-semibold touch-manipulation active:text-zinc-200 disabled:opacity-40"
              >
                Create custom game template
              </button>
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
                  const realRtpSnap = realRtpSnapByEntryId[entry.id]
                  const runningRtpLabel = realRtpSnap?.label
                  const runningRtpTone = rtpToneFromPercentLabel(runningRtpLabel)
                  const shared = Boolean(entry.session_id)
                  const highlight =
                    highlightEntryId && String(highlightEntryId) === String(entry.id)
                  const entryTitle = tpl?.display_name || 'Unknown game'
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
                            {tpl?.display_name || 'Unknown game'}
                          </span>
                          {shared ? (
                            <span className="shrink-0 rounded-md bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                              Shared
                            </span>
                          ) : null}
                          {runningRtpLabel ? (
                            <RunningRtpLabelButton
                              label={runningRtpLabel}
                              wagerAgnosticRtpPct={realRtpSnap?.wagerAgnosticRtpPct ?? null}
                              toneClass={
                                runningRtpTone === 'win'
                                  ? 'text-emerald-300'
                                  : runningRtpTone === 'loss'
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

            {sortedTemplates.some(t => !t.is_system) && (
              <div className="mt-6">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1 mb-2">
                  Your custom games
                </div>
                <div className="space-y-2">
                  {sortedTemplates.filter(t => !t.is_system).map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-2xl bg-zinc-900 border border-zinc-800/60 px-4 py-3"
                      data-play-logbook-card
                    >
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{t.display_name}</div>
                        <div className="text-zinc-500 text-xs">{t.metric_slugs?.length || 0} fields</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openLogPlay({ templateId: t.id })}
                          className="text-cyan-400 text-xs font-bold touch-manipulation active:text-cyan-300 px-2 py-1"
                        >
                          Log
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomTemplate(t.id)}
                          className="text-zinc-500 text-xs font-semibold touch-manipulation active:text-red-400 px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-zinc-400 text-xs mb-1.5">Game</label>
              <LogPlayOptionPicker
                value={analyzeTemplate?.id || ''}
                onChange={setAnalyzeTemplateId}
                options={sortedTemplates.map(t => ({ value: t.id, label: t.display_name }))}
                ariaLabel="Game"
                placeholder="Select game"
              />
            </div>

            {filteredAnalyzeEntries.length === 0 ? (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center" data-play-logbook-card>
                <div className="text-zinc-400 text-sm">No entries for this game yet.</div>
              </div>
            ) : (
              <>
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
                      const slug = analyzeTemplate?.slug || 'game'
                      const csv = buildPlayLogCsv(filteredAnalyzeEntries, analyzeTemplate, analyzeDefsMap)
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
              sheet === 'logPlay' || sheet === 'entryDetail'
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
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  <div className="space-y-3 pb-3">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Game</label>
                      {editingEntryId ? (
                        <div className="flex min-h-12 items-center rounded-2xl bg-zinc-800/90 px-4 text-sm font-semibold text-white">
                          {selectedTemplate.display_name}
                        </div>
                      ) : (
                        <LogPlayOptionPicker
                          value={selectedTemplateId}
                          onChange={onTemplateChange}
                          options={sortedTemplates.map(t => ({ value: t.id, label: t.display_name }))}
                          ariaLabel="Game"
                          placeholder="Select game"
                        />
                      )}
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
                      fields={logPlayFormFields}
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
                    {userId ? (
                      <PlayLogPartnersSection
                        supabaseClient={supabaseClient}
                        userId={userId}
                        ownerUserId={sessionOwnerId(editingSessionId) ?? userId}
                        viewerProfile={viewerProfile}
                        partners={partners}
                        onPartnersChange={setPartners}
                        netOutcome={logPlayNetOutcome}
                        canEditPaid={playLogPartnersViewerCanMarkPaid(
                          partners,
                          userId,
                          sessionOwnerId(editingSessionId) ?? userId,
                        )}
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
                  </div>
                  {error ? <p className="text-red-400 text-sm pb-3">{error}</p> : null}
                </div>
                <div className="shrink-0 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                  <button
                    type="button"
                    onClick={saveEntry}
                    disabled={saving}
                    className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : editingEntryId ? 'Save changes' : 'Save Entry'}
                  </button>
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
              const realRtpSnap = realRtpSnapByEntryId[viewingEntry.id]
              const runningRtpLabel = realRtpSnap?.label
              const runningRtpTone = rtpToneFromPercentLabel(runningRtpLabel)
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
              return (
                <>
                  <SheetHeader title={tpl?.display_name || 'Play entry'} onClose={closeSheet} />
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mt-2">
                    <div className="space-y-4 pb-3">
                      <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {shared ? (
                            <span className="shrink-0 rounded-md bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                              Shared
                            </span>
                          ) : null}
                          {runningRtpLabel ? (
                            <RunningRtpLabelButton
                              label={runningRtpLabel}
                              wagerAgnosticRtpPct={realRtpSnap?.wagerAgnosticRtpPct ?? null}
                              toneClass={
                                runningRtpTone === 'win'
                                  ? 'text-emerald-300'
                                  : runningRtpTone === 'loss'
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
                          onPartnersChange={setDetailPartners}
                          readOnly
                          canEditManager={false}
                          canEditPaid={detailCanMarkPaid}
                          netOutcome={detailNetOutcome}
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
                  <div className="shrink-0 flex gap-2 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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
                <SheetHeader title="Create Game Template" onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                  Name your game and pick which fields to capture each time you log a play.
                </p>
                <div className="mb-4">
                  <label className="block text-zinc-400 text-xs mb-1.5">Game name</label>
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
                    <p className="text-zinc-600 text-xs mt-2">Optional — add fields unique to this game.</p>
                  )}
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  type="button"
                  onClick={saveCustomTemplate}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create & Log Play'}
                </button>
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
                {winLoss == null ? '—' : formatMetricValue(winLoss, 'money')}
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

function LogPlayFormMetricControl({ field, value, onChange, trailingHint = null }) {
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

function MetricFieldInput({ value, onChange, valueType, trailingHint = null }) {
  if (valueType === 'money') {
    return (
      <div className="relative">
        <span className="absolute top-1/2 -translate-y-1/2 left-4 text-zinc-400 font-semibold pointer-events-none">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))}
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
        onChange={e => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))}
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

function wagerAgnosticRtpPctToneClass(wagerAgnosticRtpPct) {
  const tone = rtpToneFromPercentLabel(formatPlayLogRealRtp(wagerAgnosticRtpPct))
  if (tone === 'win') return 'text-emerald-300'
  if (tone === 'loss') return 'text-red-300'
  return 'text-zinc-300'
}

const RTP_POPOVER_VIEWPORT_MARGIN = 12
const RTP_POPOVER_ANCHOR_GAP = 6

/** After RTP popover dismiss, block entry-card open (avoids click-through on touch). */
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

function RunningRtpLabelButton({ label, toneClass, wagerAgnosticRtpPct }) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState(/** @type {{ left: number, top: number } | null} */ (null))
  const anchorRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const popoverRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const wagerAgnosticLabel = formatPlayLogRealRtp(wagerAgnosticRtpPct)

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
  }, [open, repositionPopover, wagerAgnosticLabel])

  const popoverLayer =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 cursor-default bg-transparent touch-none"
              style={{ zIndex: Z_APP_ALERT - 1 }}
              aria-label="Close RTP info"
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
              className="w-[min(17rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-zinc-600/80 bg-zinc-800 px-3 py-2.5 text-left text-[11px] leading-snug text-zinc-200 shadow-lg"
            >
              <p>{PLAY_LOG_REAL_RTP_INFO_INTRO}</p>
              {wagerAgnosticLabel ? (
                <>
                  <hr className="my-2 border-zinc-600/60" />
                  <p className="font-bold leading-snug text-zinc-200">
                    Your wager-agnostic total RTP is{' '}
                    <span
                      className={`font-bold tabular-nums ${wagerAgnosticRtpPctToneClass(wagerAgnosticRtpPct)}`}
                    >
                      {wagerAgnosticLabel}
                    </span>
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
        aria-label={`Aggregate weighted RTP ${label}. Tap for details.`}
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
