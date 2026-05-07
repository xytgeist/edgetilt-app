import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultAlertPresetForAllDay,
  draftFromAiReviewPayload,
  emptyOfferDraft,
  localDateKeyFromDate,
  localDateKeyFromIso,
  OFFER_ALERT_DAY_9AM,
  OFFER_ALERT_HOUR_BEFORE,
  OFFER_ALERT_NONE,
  shuffledCopy,
  toDatetimeLocalValue
} from '../utils'

const OFFERS_FORM_DRAFT_STORAGE_KEY = 'offers_form_draft_v1'
const OFFERS_FORM_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function readPersistedFormDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(OFFERS_FORM_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const savedAt = Number(parsed.savedAt || 0)
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > OFFERS_FORM_DRAFT_MAX_AGE_MS) return null
    const draft = { ...emptyOfferDraft(), ...(parsed.draft || {}) }
    return {
      showForm: parsed.showForm === true,
      draft,
      allDay: parsed.allDay !== false
    }
  } catch {
    return null
  }
}

function clearPersistedFormDraft() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(OFFERS_FORM_DRAFT_STORAGE_KEY)
}

export default function useOffersCalendarState({ supabaseClient, normalizeLoadedEvent }) {
  const restoredFormDraft = readPersistedFormDraft()
  const fileInputRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const casinoFieldRef = useRef(null)
  const titleFieldRef = useRef(null)
  const importSyncRunningRef = useRef(false)

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingTick, setUploadingTick] = useState(0)
  const [uploadingMessageOrder, setUploadingMessageOrder] = useState([])
  const [syncingImportResults, setSyncingImportResults] = useState(false)
  const [activeImportBatchId, setActiveImportBatchId] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem('offers_active_import_batch_id')
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reviewQueue, setReviewQueue] = useState([])
  const [completingReviewItemId, setCompletingReviewItemId] = useState(null)
  const [completingReviewUploadId, setCompletingReviewUploadId] = useState(null)
  const [propagateCasinoOnSave, setPropagateCasinoOnSave] = useState(false)
  const [propagateTitleOnSave, setPropagateTitleOnSave] = useState(false)
  const [propagateValueOnSave, setPropagateValueOnSave] = useState(false)
  const [reviewSourceImagePath, setReviewSourceImagePath] = useState(null)
  const [reviewSourceImageUrl, setReviewSourceImageUrl] = useState('')
  const [reviewSourceImageLoading, setReviewSourceImageLoading] = useState(false)
  const [showForm, setShowForm] = useState(() => restoredFormDraft?.showForm === true)
  const [editingId, setEditingId] = useState(null)
  const [selectedDays, setSelectedDays] = useState([])
  const [cursorMonth, setCursorMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [draft, setDraft] = useState(() => restoredFormDraft?.draft || emptyOfferDraft())
  const [allDay, setAllDay] = useState(() => (restoredFormDraft ? restoredFormDraft.allDay : true))
  const [showCasinoSuggestions, setShowCasinoSuggestions] = useState(false)
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState(null)
  const notesPreviewRefs = useRef({})
  const [notesOverflowById, setNotesOverflowById] = useState({})
  /** 'auto' = week in landscape, month in portrait; 'month' | 'week' | 'agenda' = forced */
  const [calendarMode, setCalendarMode] = useState('auto')
  const [weekDetailEvent, setWeekDetailEvent] = useState(null)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef(null)
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape)').matches : false
  )
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())

  const uploadSpinnerMessages = useMemo(
    () => [
      'Doing funky stuff... one sec.',
      'Teaching robots to read casino mailers...',
      'Summoning OCR goblins...',
      'Sorting winners from weird blurry photos...',
      'Almost there, polishing your events...',
      'WTF is that image quality...',
      'Please no more dick pics...',
      'Translating casino hieroglyphics...',
      'OCR is squinting aggressively...',
      'Convincing AI this is not a tournament...',
      'Unblurring the blur. Sort of.',
      'Cooking events with extra chaos...',
      'Stealing dates from tiny print...',
      'Checking if this is free play or free pain...',
      'Shaking snacks out of these pixels...',
      'Bribing the parser with virtual coffee...',
      'Reading mailers so you do not have to...',
      'Almost done. Nobody panic.'
    ],
    []
  )

  const uploadMessageIndex = Math.min(uploadingTick, Math.max(0, uploadingMessageOrder.length - 1))
  const uploadBaseMessage = uploadingMessageOrder[uploadMessageIndex] || uploadSpinnerMessages[0]
  const atLastUploadMessage = uploadingMessageOrder.length > 0 && uploadMessageIndex === uploadingMessageOrder.length - 1
  const uploadEllipsis = atLastUploadMessage ? '.'.repeat((uploadingTick % 3) + 1) : ''
  const uploadSpinnerMessage = `${uploadBaseMessage}${uploadEllipsis}`

  useEffect(() => {
    if (!uploading) {
      setUploadingTick(0)
      setUploadingMessageOrder([])
      return undefined
    }
    const order = shuffledCopy(uploadSpinnerMessages)
    setUploadingMessageOrder(order)
    setUploadingTick(0)
    const id = window.setInterval(() => {
      setUploadingTick((n) => n + 1)
    }, 1600)
    return () => window.clearInterval(id)
  }, [uploading, uploadSpinnerMessages])

  const offerTypeMeta = useMemo(
    () => ({
      free_play: { label: 'Free play', dot: 'bg-violet-400', chip: 'bg-violet-500/15 text-violet-200 border-violet-500/40', card: 'bg-violet-500/18' },
      hotel: { label: 'Hotel stay', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-200 border-sky-500/40', card: 'bg-sky-500/16' },
      dining: { label: 'Dining credit', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40', card: 'bg-emerald-500/16' },
      gift: { label: 'Gift day', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-200 border-amber-500/40', card: 'bg-amber-500/16' },
      multiplier: { label: 'Tier multiplier', dot: 'bg-fuchsia-400', chip: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40', card: 'bg-fuchsia-500/16' },
      tournament: { label: 'Tournament', dot: 'bg-rose-400', chip: 'bg-rose-500/15 text-rose-200 border-rose-500/40', card: 'bg-rose-500/16' },
      drawing: { label: 'Drawing', dot: 'bg-cyan-400', chip: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40', card: 'bg-cyan-500/16' },
      other: { label: 'Other', dot: 'bg-zinc-400', chip: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/40', card: 'bg-zinc-700/45' }
    }),
    []
  )

  const dayBuckets = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const key = localDateKeyFromIso(ev.start_at)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  const dayTypeDots = useMemo(() => {
    const map = {}
    for (const [dayKey, dayEvents] of Object.entries(dayBuckets)) {
      const seen = new Set(dayEvents.map((ev) => ev.offer_type || 'other'))
      map[dayKey] = Array.from(seen).slice(0, 4)
    }
    return map
  }, [dayBuckets])

  const calendarCells = useMemo(() => {
    const y = cursorMonth.getFullYear()
    const month = cursorMonth.getMonth()
    const first = new Date(y, month, 1)
    const lastDay = new Date(y, month + 1, 0).getDate()
    const startDow = first.getDay()
    const cells = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= lastDay; d++) cells.push(new Date(y, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursorMonth])

  const monthTitle = cursorMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const todayKey = localDateKeyFromDate(new Date())

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeImportBatchId) {
      window.localStorage.setItem('offers_active_import_batch_id', activeImportBatchId)
    } else {
      window.localStorage.removeItem('offers_active_import_batch_id')
    }
  }, [activeImportBatchId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Persist only unsaved "new event" drafts.
    if (showForm && !editingId && !completingReviewItemId) {
      const payload = {
        savedAt: Date.now(),
        showForm: true,
        allDay,
        draft
      }
      window.localStorage.setItem(OFFERS_FORM_DRAFT_STORAGE_KEY, JSON.stringify(payload))
      return
    }
    clearPersistedFormDraft()
  }, [allDay, completingReviewItemId, draft, editingId, showForm])

  const loadEvents = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError('')
    try {
      const { data, error: e } = await supabaseClient
        .from('offer_events')
        .select(
          'id,casino_name,offer_type,title,start_at,end_at,value_amount,notes,created_at,source_type,source_image_path,alert_preset,alert_fire_at'
        )
        .order('start_at', { ascending: true })
        .limit(500)
      if (e) throw e
      setEvents((data || []).map(normalizeLoadedEvent))
    } catch (e) {
      setError(e?.message || 'Failed to load offers.')
    } finally {
      setLoading(false)
    }
  }, [normalizeLoadedEvent, supabaseClient])

  const loadReviewQueue = useCallback(async () => {
    if (!supabaseClient) return
    try {
      const { data, error } = await supabaseClient
        .from('offer_ai_review_items')
        .select('id,upload_id,batch_id,draft,warnings,created_at, offer_uploads ( file_name, storage_path )')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      if (error) {
        if (error.code === '42P01' || String(error.message || '').toLowerCase().includes('relation')) {
          setReviewQueue([])
          return
        }
        throw error
      }
      setReviewQueue(data || [])
    } catch {
      setReviewQueue([])
    }
  }, [supabaseClient])

  const refreshImportResults = useCallback(
    async (batchId = null, attempts = 18, intervalMs = 2500) => {
      if (!supabaseClient) return
      if (importSyncRunningRef.current) return
      importSyncRunningRef.current = true
      setSyncingImportResults(true)
      try {
        for (let i = 0; i < attempts; i++) {
          await Promise.all([loadEvents(), loadReviewQueue()])
          if (batchId) {
            const { data: batchRow, error: batchErr } = await supabaseClient
              .from('offer_import_batches')
              .select('status')
              .eq('id', batchId)
              .maybeSingle()
            if (!batchErr && batchRow?.status) {
              const doneStatuses = new Set(['completed', 'completed_with_errors', 'failed'])
              if (doneStatuses.has(batchRow.status)) {
                // One extra sync pass after completion to avoid stale UI.
                await Promise.all([loadEvents(), loadReviewQueue()])
                setActiveImportBatchId(null)
                break
              }
            }
          }
          if (i < attempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
          }
        }
      } finally {
        setSyncingImportResults(false)
        importSyncRunningRef.current = false
      }
    },
    [loadEvents, loadReviewQueue, supabaseClient]
  )

  useEffect(() => {
    void loadEvents()
    void loadReviewQueue()
  }, [loadEvents, loadReviewQueue])

  useEffect(() => {
    if (!activeImportBatchId) return
    if (importSyncRunningRef.current) return
    void refreshImportResults(activeImportBatchId, 24, 2500)
  }, [activeImportBatchId, refreshImportResults])

  const beginReviewItem = useCallback(
    async (item) => {
      if (!supabaseClient) return
      const row = draftFromAiReviewPayload(item.draft || {})
      const hasSpecificTime = row.hasSpecificTime === true
      setAllDay(!hasSpecificTime)
      setDraft({ ...emptyOfferDraft(), ...row })
      setCompletingReviewItemId(item.id)
      const uploadId = item.upload_id || null
      setCompletingReviewUploadId(uploadId)
      setPropagateCasinoOnSave(false)
      setPropagateTitleOnSave(false)
      setPropagateValueOnSave(false)
      const up = item.offer_uploads
      const path = Array.isArray(up) ? up[0]?.storage_path : up?.storage_path
      setReviewSourceImagePath(path || null)
      setReviewSourceImageUrl('')
      setEditingId(null)
      setShowForm(true)
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
      setError('')
      if (uploadId) {
        try {
          const { count } = await supabaseClient
            .from('offer_ai_review_items')
            .select('id', { head: true, count: 'exact' })
            .eq('upload_id', uploadId)
            .eq('status', 'open')
          if (typeof count === 'number' && count >= 3) {
            setPropagateCasinoOnSave(true)
          }
        } catch {
          // ignore auto-toggle failures; manual checkbox still available
        }
      }
      if (!path) return
      setReviewSourceImageLoading(true)
      try {
        const { data, error: signedErr } = await supabaseClient.storage.from('offer-mailers').createSignedUrl(path, 60 * 30)
        if (signedErr) throw signedErr
        setReviewSourceImageUrl(data?.signedUrl || '')
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not create signed URL for review image:', e)
        setReviewSourceImageUrl('')
      } finally {
        setReviewSourceImageLoading(false)
      }
    },
    [supabaseClient]
  )

  const closeForm = useCallback(() => {
    clearPersistedFormDraft()
    setShowForm(false)
    setEditingId(null)
    setDraft(emptyOfferDraft())
    setAllDay(true)
    setShowCasinoSuggestions(false)
    setShowTitleSuggestions(false)
    setCompletingReviewItemId(null)
    setCompletingReviewUploadId(null)
    setPropagateCasinoOnSave(false)
    setPropagateTitleOnSave(false)
    setPropagateValueOnSave(false)
    setReviewSourceImagePath(null)
    setReviewSourceImageUrl('')
    setReviewSourceImageLoading(false)
  }, [])

  const openForm = useCallback((dayKey = null) => {
    setCompletingReviewItemId(null)
    setCompletingReviewUploadId(null)
    setPropagateCasinoOnSave(false)
    setPropagateTitleOnSave(false)
    setPropagateValueOnSave(false)
    setReviewSourceImagePath(null)
    setReviewSourceImageUrl('')
    setReviewSourceImageLoading(false)
    setShowForm(true)
    setEditingId(null)
    if (dayKey) {
      // Default to an all-day event when opening from a calendar day
      setDraft(() => ({ ...emptyOfferDraft(), startAt: `${dayKey}T00:00`, endAt: `${dayKey}T00:00` }))
      setAllDay(true)
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
    } else {
      const todayKey = localDateKeyFromDate(new Date())
      setDraft(() => ({ ...emptyOfferDraft(), startAt: `${todayKey}T00:00`, endAt: `${todayKey}T00:00` }))
      setAllDay(true)
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
    }
  }, [])

  const beginEdit = useCallback((ev) => {
    setCompletingReviewItemId(null)
    setCompletingReviewUploadId(null)
    setPropagateCasinoOnSave(false)
    setPropagateTitleOnSave(false)
    setPropagateValueOnSave(false)
    setReviewSourceImagePath(null)
    setReviewSourceImageUrl('')
    setReviewSourceImageLoading(false)
    setEditingId(ev.id)
    setShowForm(true)
    const st = new Date(ev.start_at)
    const stHasVisibleTime = st.getHours() !== 0 || st.getMinutes() !== 0
    const en = ev.end_at ? new Date(ev.end_at) : null
    const enHasVisibleTime = en ? en.getHours() !== 0 || en.getMinutes() !== 0 : false
    setAllDay(!(stHasVisibleTime || enHasVisibleTime))
    const allDayEdit = !(stHasVisibleTime || enHasVisibleTime)
    const ap = ev.alert_preset
    const alertPreset =
      ap === OFFER_ALERT_NONE || ap === OFFER_ALERT_DAY_9AM || ap === OFFER_ALERT_HOUR_BEFORE
        ? ap
        : defaultAlertPresetForAllDay(allDayEdit)
    setDraft({
      casinoName: ev.casino_name || '',
      offerType: ev.offer_type || 'free_play',
      title: ev.title || '',
      startAt: toDatetimeLocalValue(ev.start_at),
      endAt: ev.end_at ? toDatetimeLocalValue(ev.end_at) : '',
      valueAmount: ev.value_amount !== null && ev.value_amount !== undefined ? String(ev.value_amount) : '',
      notes: ev.notes || '',
      alertPreset
    })
    setShowCasinoSuggestions(false)
    setShowTitleSuggestions(false)
    setError('')
  }, [])

  const skipReviewItem = useCallback(
    async (id) => {
      if (!supabaseClient) return
      try {
        const { error: delReviewErr } = await supabaseClient.from('offer_ai_review_items').delete().eq('id', id)
        if (delReviewErr) {
          if (delReviewErr.code === '42P01') return
          throw delReviewErr
        }
        await loadReviewQueue()
      } catch (e) {
        setError(e?.message || 'Could not remove review item.')
      }
    },
    [loadReviewQueue, supabaseClient]
  )

  const skipCurrentReviewFromForm = useCallback(
    async () => {
      if (!completingReviewItemId) return
      await skipReviewItem(completingReviewItemId)
      closeForm()
    },
    [closeForm, completingReviewItemId, skipReviewItem]
  )

  return {
    fileInputRef,
    longPressTimerRef,
    casinoFieldRef,
    titleFieldRef,
    importSyncRunningRef,
    events,
    setEvents,
    loading,
    setLoading,
    saving,
    setSaving,
    uploading,
    setUploading,
    syncingImportResults,
    setSyncingImportResults,
    activeImportBatchId,
    setActiveImportBatchId,
    error,
    setError,
    notice,
    setNotice,
    reviewQueue,
    setReviewQueue,
    completingReviewItemId,
    setCompletingReviewItemId,
    completingReviewUploadId,
    setCompletingReviewUploadId,
    propagateCasinoOnSave,
    setPropagateCasinoOnSave,
    propagateTitleOnSave,
    setPropagateTitleOnSave,
    propagateValueOnSave,
    setPropagateValueOnSave,
    reviewSourceImagePath,
    setReviewSourceImagePath,
    reviewSourceImageUrl,
    setReviewSourceImageUrl,
    reviewSourceImageLoading,
    setReviewSourceImageLoading,
    showForm,
    setShowForm,
    editingId,
    setEditingId,
    selectedDays,
    setSelectedDays,
    cursorMonth,
    setCursorMonth,
    draft,
    setDraft,
    allDay,
    setAllDay,
    showCasinoSuggestions,
    setShowCasinoSuggestions,
    showTitleSuggestions,
    setShowTitleSuggestions,
    expandedEventId,
    setExpandedEventId,
    notesPreviewRefs,
    notesOverflowById,
    setNotesOverflowById,
    calendarMode,
    setCalendarMode,
    weekDetailEvent,
    setWeekDetailEvent,
    viewMenuOpen,
    setViewMenuOpen,
    viewMenuRef,
    isLandscape,
    setIsLandscape,
    weekAnchor,
    setWeekAnchor,
    offerTypeMeta,
    dayBuckets,
    dayTypeDots,
    calendarCells,
    monthTitle,
    todayKey,
    uploadSpinnerMessage,
    loadEvents,
    loadReviewQueue,
    refreshImportResults,
    beginReviewItem,
    skipReviewItem,
    skipCurrentReviewFromForm,
    closeForm,
    openForm,
    beginEdit
  }
}
