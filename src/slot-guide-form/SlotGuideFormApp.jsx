import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeGuideAccessSlug } from '../features/guides/guideAccess.js'
import { supabase } from './LoginGate.jsx'
import {
  buildGuideMarkdown,
  buildSlotGuideDraft,
  diagramFilename,
  GUIDE_FORM_SELECT,
  guideRowToFormFields,
  loadSlotGuideDraftFromStorage,
  slugify,
  slugifyInput,
  writeSlotGuideDraftToStorage,
} from './formUtils.js'
import { prepareGuideImageFile, useBlobObjectUrl } from './guideImageUtils.js'
import { assertSupabaseRowUpdated } from './slotGuideViewport.js'
import { cacheBustUrl, useGuideFilePicker } from './guideFilePicker.jsx'
import GuideCardPreview from './GuideCardPreview.jsx'
import { extractAccentFromImageFile } from '../utils/guideCardAccent.js'

const CF_R2_CACHE_CONTROL = 'public, max-age=31536000, immutable'

async function readEdgeFunctionErrorBody(res) {
  if (!res || typeof res.clone !== 'function') return ''
  try {
    const raw = await res.clone().text()
    if (!raw) return ''
    try {
      const body = JSON.parse(raw)
      if (body?.error) return String(body.error).trim()
    } catch {
      return raw.slice(0, 400)
    }
  } catch { /* ignore */ }
  return ''
}

async function messageFromGuideUploadInvokeError(error, invokeResponse, defaultMessage) {
  const fallback = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || defaultMessage,
  ).trim()
  const ctx = error && typeof error === 'object' ? error.context : null
  const res =
    ctx && typeof ctx === 'object' && typeof ctx.status === 'number'
      ? ctx
      : invokeResponse && typeof invokeResponse.status === 'number'
        ? invokeResponse
        : null
  if (res) {
    const fromBody = await readEdgeFunctionErrorBody(res)
    if (fromBody) return fromBody
    if (res.status === 401) return 'Session expired - sign out and sign in again, then retry.'
    if (res.status === 403) return 'Admin role required for guide image uploads.'
    if (res.status === 404) return 'Guide upload service is not deployed on this Supabase project.'
    if (res.status === 503) return 'R2_NOT_CONFIGURED'
    if (res.status === 400) return 'Invalid slug or image filename for upload.'
    return fallback || `Upload service returned HTTP ${res.status}.`
  }
  return fallback || defaultMessage
}

async function getFreshGuideUploadAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  const expiresAt = session.expires_at ?? 0
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt > 0 && expiresAt - now < 120) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (error || !refreshed.session?.access_token) {
      throw new Error('Session expired - sign out and sign in again, then retry.')
    }
    return refreshed.session.access_token
  }
  return session.access_token
}

/**
 * Upload a guide image to R2 via the guide-cf-r2-upload Edge function.
 * Falls back to Supabase Storage if R2 is not configured (503).
 * Returns the public URL.
 */
async function uploadGuideImageToR2OrStorage(file, { slug, filename }) {
  const safeSlug = slugify(String(slug || '').trim())
  if (!safeSlug) throw new Error('Set a slug before uploading images.')
  if (safeSlug.length > 120) {
    throw new Error(`Slug is too long for image upload (${safeSlug.length} chars, max 120). Shorten the slug or ask to redeploy guide-cf-r2-upload.`)
  }

  const accessToken = await getFreshGuideUploadAccessToken()
  if (accessToken) {
    const { data: mintData, error: mintErr, response } = await supabase.functions.invoke('guide-cf-r2-upload', {
      body: { slug: safeSlug, contentType: file.type || 'image/webp', filename },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const detail = mintErr
      ? await messageFromGuideUploadInvokeError(mintErr, response, 'Could not start R2 upload.')
      : ''
    const r2NotConfigured =
      mintErr?.context?.status === 503 ||
      response?.status === 503 ||
      detail === 'R2_NOT_CONFIGURED' ||
      (typeof mintData?.error === 'string' && mintData.error.includes('not configured'))
    if (!r2NotConfigured) {
      if (mintErr) throw new Error(detail || mintData?.error || 'Could not start R2 upload.')
      if (mintData?.uploadURL) {
        const putRes = await fetch(mintData.uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/webp', 'Cache-Control': CF_R2_CACHE_CONTROL },
          body: file,
        })
        if (!putRes.ok) throw new Error(`R2 upload failed (${putRes.status})`)
        return mintData.publicUrl
      }
      if (mintData?.error) throw new Error(String(mintData.error))
    }
  }
  // Fallback: Supabase Storage
  const { error: upErr } = await supabase.storage
    .from('guide-assets')
    .upload(`${safeSlug}/${filename}`, file, { contentType: file.type || 'image/webp', upsert: true, cacheControl: '31536000' })
  if (upErr) throw new Error(`Storage upload: ${upErr.message}`)
  const { data: urlData } = supabase.storage.from('guide-assets').getPublicUrl(`${safeSlug}/${filename}`)
  return urlData.publicUrl
}

const STORAGE_KEY = 'slotGuideFormSettings:v4'

// Ingest API targets - controls which Vercel function receives new guide ingests.
// Login + Save changes use the deployment's Supabase (VITE_SUPABASE_*). Prod ingests from
// lvslotpro.com require signing in on edgetilt.com (cross-origin session won't validate).
const PROD_APP_ORIGIN = String(import.meta.env.VITE_PROD_APP_ORIGIN || 'https://edgetilt.com').replace(/\/+$/, '')
const INGEST_TARGETS = [
  { id: 'test', label: 'test', apiUrl: '/api/slot-guide-ingest' },
  { id: 'production', label: 'production', apiUrl: `${PROD_APP_ORIGIN}/api/slot-guide-ingest` },
]

function defaultIngestId() {
  if (typeof window === 'undefined') return 'test'
  return /(^|\.)edgetilt\.com$/i.test(window.location.hostname) ? 'production' : 'test'
}

const PLACEMENTS = [
  { id: 'when_to_play', label: 'After When to play' },
  { id: 'when_to_stop', label: 'After When to stop' },
  { id: 'how_to_check', label: 'After How to check' },
  { id: 'bankroll', label: 'After Bankroll on hand' },
  { id: 'risk', label: 'After Risk & Warnings' },
  { id: 'skins', label: 'After Skins' },
  { id: 'where_to_find', label: 'After Where to find' },
  { id: 'gameplay', label: 'After Gameplay' },
]

const ic = 'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'
const lc = 'block text-sm font-medium text-gray-300 mb-1'
const sc = 'rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-4'
const guideSectionPanel = 'rounded-xl border border-gray-800 bg-gray-950/80 p-4 space-y-3'
const subFieldLabel = 'block text-xs font-medium text-gray-500 mb-1'

/** Matches expanded AP guide card section headers (same order). */
function GuideSectionPanel({ title, optional, children }) {
  return (
    <div className={guideSectionPanel}>
      <h3 className="text-base font-semibold text-white border-b border-gray-800 pb-2">
        {title}
        {optional ? (
          <span className="text-gray-500 font-normal text-xs ml-2">(optional)</span>
        ) : null}
      </h3>
      {children}
    </div>
  )
}

function GuideSectionBody({
  fieldKey,
  value,
  onChange,
  slug,
  guideTitle,
  pickFile,
  minH = 'min-h-28',
  placeholder,
  required,
}) {
  if (IMAGE_UPLOAD_FIELDS.has(fieldKey)) {
    return (
      <InlineImageTextarea
        className={`${ic} ${minH}`}
        value={value}
        onChange={onChange}
        slug={slug}
        guideTitle={guideTitle}
        pickFile={pickFile}
        required={required}
      />
    )
  }
  return (
    <textarea
      className={`${ic} ${minH}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
    />
  )
}

const POPULARITY_OPTIONS = [
  'Extremely Common', 'Very Common', 'Common', 'Uncommon', 'Rare', 'Rare (nostalgia)',
]
const VOLATILITY_OPTIONS = [
  'Low', 'Low-Medium', 'Medium', 'Med-High', 'High', 'High (extreme session swings)',
]
const CUSTOM_SENTINEL = 'Custom…'

/** Returns true when a value is set but not in the canonical options list. */
function isCustomVal(val, options) {
  return Boolean(val && val !== CUSTOM_SENTINEL && !options.includes(val))
}

function readSettings() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function emptyDiagram(slug) {
  return {
    id: crypto.randomUUID(),
    alt: '',
    placement: 'when_to_play',
    filename: `${slug}-diagram.webp`,
    file: null,
    publicUrl: null,
  }
}

/** Diagram rows ready for buildGuideMarkdown (new file or already uploaded). */
function activeDiagramRows(diagrams, slug) {
  return diagrams
    .filter((d) => d.alt?.trim() && (d.file || d.publicUrl))
    .map((d) => ({
      alt: d.alt.trim(),
      placement: d.placement,
      filename: d.filename || diagramFilename(d.file?.name || 'diagram', slug),
    }))
}

function resolveGuideImageUrl(slug, diagrams, filename) {
  const match = diagrams.find((d) => d.filename === filename && d.publicUrl)
  if (match?.publicUrl) return match.publicUrl
  return `/guides/${slug}/${filename}`
}

function DiagramPreview({ file, publicUrl, alt }) {
  const blobUrl = useBlobObjectUrl(file)
  const src = file ? blobUrl : publicUrl
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt || 'Diagram preview'}
      className="w-full max-h-40 object-contain rounded-lg border border-gray-800 bg-gray-950"
    />
  )
}

/** Fields that support inline image insertion. */
const IMAGE_UPLOAD_FIELDS = new Set([
  'when_to_play', 'when_to_stop', 'how_to_check', 'where_to_find', 'gameplay_mechanics',
])

/**
 * Textarea with an "Add image" toolbar button.
 * Uploads the image to R2 (or Supabase Storage fallback) and inserts
 * `![image](url)` markdown at the current cursor position.
 */
function InlineImageTextarea({ value, onChange, className, required, slug, guideTitle, pickFile }) {
  const taRef  = useRef(null)
  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState('')
  const [uploadOk, setUploadOk]     = useState('')

  async function handleFile(file) {
    if (!file) return

    const effectiveSlug = slug || slugify(guideTitle || 'guide') || 'guide'
    const filename = `content-${Date.now()}.webp`

    setUploading(true)
    setUploadErr('')
    setUploadOk('')
    try {
      const prepared = await prepareGuideImageFile(file, filename)
      const url = await uploadGuideImageToR2OrStorage(prepared, { slug: effectiveSlug, filename: prepared.name })
      const ta = taRef.current
      const pos = ta?.selectionStart ?? value.length
      const before = value.slice(0, pos)
      const after  = value.slice(pos)
      const pad    = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
      const insert = `${pad}![image](${url})\n`
      const next   = before + insert + after
      onChange(next)
      setUploadOk('Image uploaded and inserted in markdown below.')
      // Restore focus and park cursor after the inserted text
      setTimeout(() => {
        if (!ta) return
        ta.focus()
        const cur = (before + insert).length
        ta.setSelectionRange(cur, cur)
      }, 0)
    } catch (err) {
      setUploadErr(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {/* toolbar - button (not label) so file picker does not steal layout/focus in the form */}
      <div className="flex items-center justify-end mb-1">
        <button
          type="button"
          disabled={uploading || !pickFile}
          onClick={() => pickFile?.({ accept: 'image/*', onPick: (f) => f && handleFile(f) })}
          className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors
            ${uploading ? 'text-zinc-500 cursor-not-allowed' : 'text-cyan-400 hover:text-cyan-300'}`}
          title="Upload image and insert at cursor"
        >
          {uploading ? (
            <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
          {uploading ? 'Uploading…' : 'Insert image'}
        </button>
      </div>
      <textarea
        ref={taRef}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {uploadErr && <p className="text-xs text-red-400 mt-1">{uploadErr}</p>}
      {uploadOk && !uploadErr && <p className="text-xs text-emerald-400 mt-1">{uploadOk}</p>}
    </div>
  )
}

/**
 * Textarea for the Skins section with guide-link picker and inline image insert.
 */
function SkinsTextarea({ value, onChange, className, guideList = [], pickFile, slug, guideTitle }) {
  const taRef = useRef(null)
  const [pickerSlug, setPickerSlug] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [uploadOk, setUploadOk] = useState('')

  function insertAtCursor(insert, { padBefore = true } = {}) {
    const ta = taRef.current
    const pos = ta?.selectionStart ?? value.length
    const before = value.slice(0, pos)
    const after = value.slice(pos)
    const pad = padBefore && before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const next = before + pad + insert + after
    onChange(next)
    setTimeout(() => {
      if (!ta) return
      ta.focus()
      const cur = (before + pad + insert).length
      ta.setSelectionRange(cur, cur)
    }, 0)
  }

  function insertLink() {
    if (!pickerSlug) return
    const picked = guideList.find(
      (g) => (g.machines?.slug || g.slug) === pickerSlug
    )
    const label = picked?.machines?.name || picked?.title || pickerSlug
    insertAtCursor(`[${label}](guide:${pickerSlug})`)
    setPickerSlug('')
  }

  async function handleImageFile(file) {
    if (!file) return

    const effectiveSlug = slug || slugify(guideTitle || 'guide') || 'guide'
    const filename = `content-${Date.now()}.webp`

    setUploading(true)
    setUploadErr('')
    setUploadOk('')
    try {
      const prepared = await prepareGuideImageFile(file, filename)
      const url = await uploadGuideImageToR2OrStorage(prepared, { slug: effectiveSlug, filename: prepared.name })
      insertAtCursor(`![image](${url})\n`, { padBefore: true })
      setUploadOk('Image uploaded and inserted in markdown below.')
    } catch (err) {
      setUploadErr(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <select
          className="flex-1 min-w-[12rem] min-h-9 text-sm text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          value={pickerSlug}
          onChange={(e) => setPickerSlug(e.target.value)}
        >
          <option value="">- pick a guide to link -</option>
          {guideList.map((g) => {
            const s = g.machines?.slug || g.slug
            const name = g.machines?.name || g.title || s
            return (
              <option key={g.id} value={s}>
                {name}{g.published ? '' : ' (unpublished)'}
              </option>
            )
          })}
        </select>
        <button
          type="button"
          disabled={!pickerSlug}
          onClick={insertLink}
          className="shrink-0 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors
            bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Insert link
        </button>
        <button
          type="button"
          disabled={uploading || !pickFile}
          onClick={() => pickFile?.({ accept: 'image/*', onPick: (f) => f && handleImageFile(f) })}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors
            ${uploading
              ? 'text-zinc-500 cursor-not-allowed bg-gray-800'
              : 'text-cyan-300 hover:text-cyan-200 bg-gray-800 hover:bg-gray-700 border border-gray-700'}`}
          title="Upload image and insert at cursor"
        >
          {uploading ? (
            <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
          {uploading ? 'Uploading…' : 'Insert image'}
        </button>
      </div>
      <textarea
        ref={taRef}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {uploadErr && <p className="text-xs text-red-400 mt-1">{uploadErr}</p>}
      {uploadOk && !uploadErr && <p className="text-xs text-emerald-400 mt-1">{uploadOk}</p>}
    </div>
  )
}

const blankMachine = {
  slug: '', name: '', manufacturer: 'IGT', type: '', difficulty: 'Beginner',
  popularity: 'Common', nerf_risk: 'auto', volatility_index: '',
  popularity_summary: '', release_year: '', has_calculator: false, calculator_slug: '',
}
const blankGuide = {
  title: '', card_ev_threshold: '', card_accent_color: '', published: true,
  when_to_play: '', when_to_stop: '', how_to_check: '',
  risk_bankroll: '', risk_summary: '', risk_bullets: '',
  where_to_find: '',
  skins_markdown: '', gameplay_mechanics: '',
  // preview-only fields (not submitted to ingest/update)
  _slug: '', _created_at: '', _updated_at: '',
}

/** @param {Record<string, unknown>} data */
function ingestResultHeadline(data) {
  const ingestedSlug = String(data.slug || 'guide')
  const ingestedTarget = String(data.target || 'test')
  if (data.syncedSupabase) {
    return `Ingest succeeded - ${ingestedSlug} is live on ${ingestedTarget}.`
  }
  return 'Ingest finished - see response below (syncedSupabase was false).'
}

export default function SlotGuideFormApp() {
  const { pickFile, portal: filePickerPortal } = useGuideFilePicker()
  const saved = useMemo(() => (typeof window !== 'undefined' ? readSettings() : null), [])

  // ── Connection settings (ingest target only - auth uses LoginGate session token)
  const [ingestId, setIngestId] = useState(saved?.ingestId || defaultIngestId())

  const activeIngest = INGEST_TARGETS.find(t => t.id === ingestId) ?? INGEST_TARGETS[0]
  const apiUrl       = activeIngest.apiUrl
  const target       = activeIngest.id

  // ── Mode: 'new' | 'edit'
  const [mode, setMode] = useState('new')

  // ── Guide picker
  const [guideList, setGuideList]   = useState([])      // [{id, slug, title, published, machines}]
  const [listBusy, setListBusy]     = useState(false)
  const [listErr, setListErr]       = useState('')
  const [selectedId, setSelectedId] = useState('')       // guide id in picker

  // ── Form state
  const [machine, setMachine]             = useState(blankMachine)
  const [guide, setGuide]                 = useState(blankGuide)
  const [heroFile, setHeroFile]           = useState(null)
  const [currentThumbnail, setCurrentThumbnail] = useState('')   // existing hero URL in edit mode
  const [diagrams, setDiagrams]           = useState([])
  const [editIds, setEditIds]             = useState(null)      // {guideId, machineId} when editing

  // ── Dirty / unsaved-edits tracking
  const [isDirty, setIsDirty] = useState(false)
  const [storedDraft, setStoredDraft] = useState(() => (typeof window !== 'undefined' ? loadSlotGuideDraftFromStorage() : null))
  const [draftSavedAt, setDraftSavedAt] = useState(storedDraft?.savedAt ?? null)
  const [draftNotice, setDraftNotice] = useState('')

  const applyDraft = useCallback((draft) => {
    if (!draft) return
    if (draft.ingestId) setIngestId(draft.ingestId)
    setMachine({ ...blankMachine, ...draft.machine })
    setGuide({ ...blankGuide, ...draft.guide })
    setDiagrams(
      (draft.diagrams || []).map((d) => ({
        id: d.id || crypto.randomUUID(),
        alt: d.alt || '',
        placement: d.placement || 'when_to_play',
        filename: d.filename || '',
        file: null,
        publicUrl: null,
      })),
    )
    setHeroFile(null)
    setCurrentThumbnail('')
    setEditIds(null)
    setSelectedId('')
    setMode('new')
    setIsDirty(true)
    setDraftSavedAt(draft.savedAt)
    setStoredDraft(null)
    setDraftNotice('Draft restored. Re-select hero image or diagram files if you had chosen any.')
  }, [])

  const saveDraft = useCallback((quiet = false) => {
    const draft = buildSlotGuideDraft({ ingestId, machine, guide, diagrams })
    if (!draft) {
      if (!quiet) setDraftNotice('Nothing to save yet - add at least one field.')
      return false
    }
    writeSlotGuideDraftToStorage(draft)
    setDraftSavedAt(draft.savedAt)
    if (!quiet) setDraftNotice(`Draft saved ${new Date(draft.savedAt).toLocaleString()}. Images are not stored - re-attach hero/diagrams after restore.`)
    return true
  }, [ingestId, machine, guide, diagrams])

  const clearDraft = useCallback(() => {
    writeSlotGuideDraftToStorage(null)
    setStoredDraft(null)
    setDraftSavedAt(null)
    setDraftNotice('')
  }, [])

  // Hide stale restore prompt once the user starts editing without restoring
  useEffect(() => {
    if (isDirty && storedDraft) setStoredDraft(null)
  }, [isDirty, storedDraft])

  // Auto-save new-guide drafts while typing (files are not persisted)
  useEffect(() => {
    if (mode !== 'new' || !isDirty) return undefined
    const t = window.setTimeout(() => {
      const draft = buildSlotGuideDraft({ ingestId, machine, guide, diagrams })
      if (draft) {
        writeSlotGuideDraftToStorage(draft)
        setDraftSavedAt(draft.savedAt)
      }
    }, 2000)
    return () => window.clearTimeout(t)
  }, [mode, isDirty, ingestId, machine, guide, diagrams])

  // Warn before closing/navigating away with unsaved edits
  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Submit / delete
  const [busy, setBusy]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError]   = useState('')

  // Persist settings
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ingestId }))
    } catch { /* ignore */ }
  }, [ingestId])

  // Auto-slug from machine name (only while slug is empty - do not rewrite manual slug edits)
  useEffect(() => {
    setMachine((m) => {
      if (m.slug.trim()) return m
      const slug = slugify(m.name)
      if (!slug || m.slug === slug) return m
      return { ...m, slug }
    })
    setGuide((g) => {
      if (g.title || !machine.name) return g
      return { ...g, title: machine.name }
    })
  }, [machine.name])

  const slug = slugify(machine.slug.trim())

  const heroPreviewUrl = useBlobObjectUrl(heroFile)

  const setMachineField = useCallback((key, value) => {
    setMachine((m) => {
      const next = { ...m, [key]: value }
      if (key === 'name' && !m.slug) next.slug = slugify(value)
      if (key === 'has_calculator' && value && !m.calculator_slug) next.calculator_slug = next.slug || slugify(next.name)
      return next
    })
    setIsDirty(true)
  }, [])

  const setGuideField = useCallback((key, value) => {
    setGuide((g) => ({ ...g, [key]: value }))
    setIsDirty(true)
  }, [])

  // ── Load guide list from Supabase
  async function fetchGuideList() {
    setListBusy(true)
    setListErr('')
    try {
      const { data, error: err } = await supabase.from('guides').select(
        'id, slug, title, published, machines(id, slug, name)'
      ).order('title')
      if (err) throw new Error(err.message)
      setGuideList(data || [])
      if (!data?.length) setListErr('No guides found.')
    } catch (e) {
      setListErr(e.message)
    } finally {
      setListBusy(false)
    }
  }

  async function fetchGuideRow(id) {
    const { data, error: err } = await supabase.from('guides').select(GUIDE_FORM_SELECT).eq('id', id).single()
    if (err) throw new Error(err.message)
    return data
  }

  function confirmReplaceDirtyForm(actionLabel) {
    if (!isDirty) return true
    return window.confirm(`You have unsaved changes. ${actionLabel}?`)
  }

  function applyDuplicateForm({ machine: srcMachine, guide: srcGuide, sourceLabel }) {
    setMode('new')
    setEditIds(null)
    setSelectedId('')
    setMachine({ ...srcMachine, slug: '' })
    setGuide({
      ...srcGuide,
      _slug: '',
      _created_at: '',
      _updated_at: '',
    })
    setHeroFile(null)
    setCurrentThumbnail('')
    setDiagrams([])
    setIsDirty(true)
    setResult(null)
    setError('')
    setDraftNotice(
      `Duplicated from ${sourceLabel}. Set a new slug and title, then Ingest. Hero and diagram file picks are not copied ... re-upload if needed.`,
    )
  }

  // ── Load a selected guide into the form
  async function loadGuide(id, { preserveResult = false } = {}) {
    setListBusy(true)
    setListErr('')
    setError('')
    if (!preserveResult) setResult(null)
    try {
      const data = await fetchGuideRow(id)
      const { machine: m, guide: g, thumbnailUrl, editIds: ids } = guideRowToFormFields(data)
      setMachine(m)
      setGuide(g)
      setEditIds(ids)
      setHeroFile(null)
      setCurrentThumbnail(thumbnailUrl)
      setDiagrams([])
      setIsDirty(false)
      setMode('edit')
      setSelectedId(id)
    } catch (e) {
      setListErr(e.message)
    } finally {
      setListBusy(false)
    }
  }

  async function duplicateFromPicker() {
    if (!selectedId) return
    if (!confirmReplaceDirtyForm('Duplicate will replace the form with a copy of the selected guide')) return
    setListBusy(true)
    setListErr('')
    setError('')
    setResult(null)
    try {
      const data = await fetchGuideRow(selectedId)
      const mapped = guideRowToFormFields(data)
      applyDuplicateForm({
        ...mapped,
        sourceLabel: data.slug || data.title || 'guide',
      })
    } catch (e) {
      setListErr(e.message)
    } finally {
      setListBusy(false)
    }
  }

  function duplicateFromCurrentForm() {
    const sourceLabel = guide._slug || machine.slug || guide.title || machine.name
    if (!sourceLabel && !machine.name && !guide.title && !guide.when_to_play) {
      setError('Load a guide first, or select one in the picker.')
      return
    }
    if (
      isDirty
      && !window.confirm(
        `Duplicate "${sourceLabel || 'current form'}" as a new guide? Current field values (including unsaved edits) will be copied.`,
      )
    ) return
    applyDuplicateForm({
      machine,
      guide,
      sourceLabel: sourceLabel || 'current form',
    })
  }

  function resetToNewGuide() {
    setMode('new')
    setMachine(blankMachine)
    setGuide(blankGuide)
    setHeroFile(null)
    setIsDirty(false)
    setCurrentThumbnail('')
    setDiagrams([])
    setEditIds(null)
    setSelectedId('')
    setError('')
    setResult(null)
    clearDraft()
  }

  function startNew() {
    if (isDirty && !window.confirm('Discard unsaved edits and start a blank new guide?')) return
    resetToNewGuide()
  }

  async function handleDeleteGuide() {
    if (!deleteConfirm || !editIds) return
    const { guideId, machineId, slug, name } = deleteConfirm
    const normalized = normalizeGuideAccessSlug(slug)
    setDeleteBusy(true)
    setError('')
    try {
      if (normalized) {
        const { error: gateErr } = await supabase
          .from('content_access_gates')
          .delete()
          .eq('content_kind', 'guide')
          .eq('content_key', normalized)
        if (gateErr && !gateErr.message?.includes('content_access_gates')) throw gateErr
      }
      const { error: guideErr } = await supabase.from('guides').delete().eq('id', guideId)
      if (guideErr) {
        if (guideErr.message?.includes('policy') || guideErr.code === '42501') {
          throw new Error(
            'Delete blocked by RLS. Apply migration 20260610180000_guide_admin_delete_rls.sql on test Supabase.',
          )
        }
        throw guideErr
      }
      if (machineId) {
        const { error: machineErr } = await supabase.from('machines').delete().eq('id', machineId)
        if (machineErr) throw machineErr
      }
      setGuideList((prev) => prev.filter((g) => g.id !== guideId))
      setDeleteConfirm(null)
      resetToNewGuide()
      setResult({ ok: true, message: `Deleted ${name || slug}. R2/Storage images were not removed.` })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteBusy(false)
    }
  }

  // ── Submit: new guide via ingest API (auth via Supabase session token)
  async function handleIngest(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!slug) { setError('Slug is required.'); return }

    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Session expired - please sign out and back in.'); setBusy(false); return }

      const payload = {
        machine: { ...machine, slug, release_year: machine.release_year ? Number(machine.release_year) : null, calculator_slug: machine.has_calculator ? machine.calculator_slug || slug : null },
        guide: { ...guide, title: guide.title || machine.name, risk_bullets: guide.risk_bullets.split('\n').map((s) => s.trim()).filter(Boolean) },
        diagrams: diagrams.filter((d) => d.file && d.alt.trim()).map((d) => ({
          alt: d.alt.trim(), placement: d.placement,
          filename: d.filename || diagramFilename(d.file.name, slug),
        })),
      }
      const diagramImages = []
      for (const d of diagrams) {
        if (!d.file || !d.alt.trim()) continue
        const fn = d.filename || diagramFilename(d.file.name, slug)
        const prepared = await prepareGuideImageFile(d.file, fn)
        diagramImages.push({ filename: prepared.name, dataBase64: await fileToBase64(prepared) })
      }
      const body = { target, payload, diagramImages }
      if (heroFile) {
        const preparedHero = await prepareGuideImageFile(heroFile, 'hero.webp')
        body.heroImage = { dataBase64: await fileToBase64(preparedHero) }
      }
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || (Array.isArray(data.errors) ? data.errors.join(' ') : res.statusText) || 'Ingest failed.')
      setResult({ ok: true, headline: ingestResultHeadline(data), payload: data })
      setIsDirty(false)
      clearDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // ── Submit: update existing guide via authenticated Supabase client
  async function handleUpdate(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!editIds) { setError('No guide loaded for editing.'); return }

    setBusy(true)
    try {
      // Upload hero image first if a new one was provided
      let newThumbnailUrl = null
      let newAccentColor = null
      if (heroFile) {
        const preparedHero = await prepareGuideImageFile(heroFile, 'hero.webp')
        const uploadedUrl = await uploadGuideImageToR2OrStorage(preparedHero, {
          slug: machine.slug || guide._slug,
          filename: preparedHero.name,
        })
        newThumbnailUrl = cacheBustUrl(uploadedUrl)
        newAccentColor = await extractAccentFromImageFile(preparedHero)
        setCurrentThumbnail(newThumbnailUrl)
        setHeroFile(null)
      }

      // Upload new diagram files to cloud storage
      const diagramUrlMap = {}
      const nextDiagrams = [...diagrams]
      for (let i = 0; i < nextDiagrams.length; i++) {
        const d = nextDiagrams[i]
        if (!d.file || !d.alt?.trim()) continue
        const fn = d.filename || diagramFilename(d.file.name, machine.slug)
        const prepared = await prepareGuideImageFile(d.file, fn)
        const publicUrl = await uploadGuideImageToR2OrStorage(prepared, {
          slug: machine.slug,
          filename: prepared.name,
        })
        diagramUrlMap[prepared.name] = publicUrl
        nextDiagrams[i] = { ...d, filename: prepared.name, file: null, publicUrl }
      }
      if (nextDiagrams.some((d, i) => d !== diagrams[i])) setDiagrams(nextDiagrams)
      for (const d of nextDiagrams) {
        if (d.publicUrl && d.filename) diagramUrlMap[d.filename] = d.publicUrl
      }

      // Update machines row
      const machinePayload = {
        name: machine.name,
        manufacturer: machine.manufacturer,
        type: machine.type,
        difficulty: machine.difficulty,
        popularity: machine.popularity === CUSTOM_SENTINEL ? null : (machine.popularity || null),
        nerf_risk: machine.nerf_risk,
        volatility_index: (machine.volatility_index === CUSTOM_SENTINEL ? null : machine.volatility_index) || null,
        popularity_summary: machine.popularity_summary || null,
        release_year: machine.release_year ? Number(machine.release_year) : null,
        has_calculator: machine.has_calculator,
        calculator_slug: machine.has_calculator ? machine.calculator_slug || machine.slug : null,
      }
      if (newThumbnailUrl) machinePayload.thumbnail_url = newThumbnailUrl
      const machineResult = await supabase.from('machines').update(machinePayload).eq('id', editIds.machineId).select('id').maybeSingle()
      assertSupabaseRowUpdated(machineResult, 'machines')

      const compiledMarkdown = buildGuideMarkdown({
        machine,
        guide,
        diagrams: activeDiagramRows(nextDiagrams, machine.slug),
        resolveImageUrl: (filename) => diagramUrlMap[filename] || resolveGuideImageUrl(machine.slug, nextDiagrams, filename),
      })
      const nowIso = new Date().toISOString()

      // Update guides row
      const guidePayload = {
        title: guide.title || machine.name,
        card_ev_threshold: guide.card_ev_threshold || null,
        published: guide.published,
        content_markdown: compiledMarkdown,
        updated_at: nowIso,
      }
      if (newThumbnailUrl) guidePayload.thumbnail_url = newThumbnailUrl
      if (newAccentColor) guidePayload.card_accent_color = newAccentColor
      const guideResult = await supabase.from('guides').update(guidePayload).eq('id', editIds.guideId).select('id, updated_at, content_markdown').maybeSingle()
      assertSupabaseRowUpdated(guideResult, 'guides')

      // Reflect new timestamp in the preview
      setGuide((g) => ({ ...g, _updated_at: guideResult.data.updated_at || nowIso }))

      setResult({ ok: true, message: newThumbnailUrl ? 'Guide and hero image updated.' : 'Guide updated successfully.' })
      setIsDirty(false)

      if (editIds.guideId) await loadGuide(editIds.guideId, { preserveResult: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const isEdit = mode === 'edit'

  const showPreview = isEdit || !!(guide.title || machine.name)

  const previewMarkdown = useMemo(() => {
    const effectiveSlug = guide._slug || machine.slug || slug
    if (!effectiveSlug && !guide.title && !machine.name) return ''
    return buildGuideMarkdown({
      machine: { ...machine, slug: effectiveSlug },
      guide,
      diagrams: activeDiagramRows(diagrams, effectiveSlug),
      resolveImageUrl: (filename) => resolveGuideImageUrl(effectiveSlug, diagrams, filename),
    })
  }, [machine, guide, diagrams, slug])

  const pickHeroFile = useCallback(() => {
    pickFile({
      accept: 'image/*',
      onPick: (file) => {
        if (file) {
          setHeroFile(file)
          setIsDirty(true)
          void extractAccentFromImageFile(file).then((hex) => {
            if (hex) setGuideField('card_accent_color', hex)
          })
        }
      },
    })
  }, [pickFile, setGuideField])

  const livePreviewPanel = showPreview ? (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-widest">
        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        Live card preview
      </div>
      <div className="rounded-[2.5rem] border-2 border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/60">
        <div className="rounded-[2rem] overflow-hidden">
          <GuideCardPreview
            guide={{
              slug: guide._slug || machine.slug,
              title: guide.title,
              card_ev_threshold: guide.card_ev_threshold,
              created_at: guide._created_at,
              updated_at: guide._updated_at,
            }}
            machine={machine}
            heroFile={heroFile}
            heroUrl={currentThumbnail}
            contentMarkdown={previewMarkdown}
            guideList={guideList}
          />
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 text-center">Updates as you type · Tap hero to expand/collapse</p>
    </div>
  ) : null

  return (
    <>
    {filePickerPortal}
    <div className="bg-gray-950 text-white px-4 py-8 pb-[max(6rem,env(safe-area-inset-bottom,0px))]">
      {/* Two-column on large screens: form left, card preview right */}
      <div className="max-w-7xl mx-auto">
      <div className={`flex gap-8 items-start ${showPreview ? 'lg:grid lg:grid-cols-[1fr_360px]' : ''}`}>

      {/* ── LEFT: form ── */}
      <div className="flex-1 min-w-0 space-y-6">

        {livePreviewPanel && (
          <div className="lg:hidden max-w-md mx-auto w-full">
            {livePreviewPanel}
          </div>
        )}

        {storedDraft && !isEdit && (
          <div className="rounded-2xl border border-cyan-600/40 bg-cyan-950/50 px-4 py-3 space-y-2">
            <p className="text-sm text-cyan-100">
              Saved draft from {new Date(storedDraft.savedAt).toLocaleString()} - restore to continue where you left off.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyDraft(storedDraft)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-cyan-600 hover:bg-cyan-500"
              >
                Restore draft
              </button>
              <button
                type="button"
                onClick={() => { clearDraft(); setStoredDraft(null) }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700"
              >
                Discard draft
              </button>
            </div>
          </div>
        )}

        {/* Unsaved-edits banner */}
        {(isDirty || draftSavedAt) && !isEdit && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-sm font-semibold text-amber-300 flex-1 min-w-[12rem]">
              {isDirty ? 'Unsaved edits' : 'Draft on this device'}
              {draftSavedAt ? ` - last saved ${new Date(draftSavedAt).toLocaleString()}` : ''}
              {' - use '}
              <span className="text-amber-100">Save draft</span>
              {' below or here.'}
            </p>
            <button
              type="button"
              onClick={() => saveDraft(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white"
            >
              Save draft
            </button>
            {draftSavedAt && (
              <button
                type="button"
                onClick={() => { if (window.confirm('Delete saved draft on this device?')) { clearDraft(); setStoredDraft(null) } }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-amber-200/80 hover:text-white"
              >
                Clear draft
              </button>
            )}
          </div>
        )}
        {isDirty && isEdit && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-amber-300 flex-1">Unsaved edits - save changes before leaving.</p>
          </div>
        )}
        {draftNotice ? <p className="text-sm text-cyan-300/90">{draftNotice}</p> : null}

        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-cyan-300">AP Guide editor</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Supabase + cloud storage are the source of truth. Edit here, upload images from your computer, save... no repo markdown required.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startNew}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                !isEdit ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              + New guide
            </button>
            {isEdit && editIds ? (
              <>
                <span className="px-3 py-2 rounded-xl text-sm font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  Editing: {machine.name || slug}
                </span>
                <button
                  type="button"
                  disabled={deleteBusy || busy || listBusy}
                  onClick={() => duplicateFromCurrentForm()}
                  className="px-4 py-2 rounded-xl text-sm font-bold border border-cyan-500/70 bg-cyan-950/75 text-cyan-200 hover:bg-cyan-950 disabled:opacity-50 transition-colors"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={deleteBusy || busy}
                  onClick={() =>
                    setDeleteConfirm({
                      guideId: editIds.guideId,
                      machineId: editIds.machineId,
                      slug: guide._slug || machine.slug || slug,
                      name: guide.title || machine.name || guide._slug || machine.slug,
                    })
                  }
                  className="px-4 py-2 rounded-xl text-sm font-bold border border-red-500/70 bg-red-950/75 text-red-200 hover:bg-red-950 disabled:opacity-50 transition-colors"
                >
                  Delete guide
                </button>
              </>
            ) : null}
          </div>
        </header>

        {/* ── New-guide ingest target (hidden in edit mode) */}
        {!isEdit && (
          <section className={sc}>
            <h2 className="text-lg font-semibold">New guide - ingest target</h2>
            <div>
              <label className={lc}>Target environment</label>
              <select className={ic} value={ingestId} onChange={(e) => setIngestId(e.target.value)}>
                {INGEST_TARGETS.map(t => (
                  <option key={t.id} value={t.id}>{t.label} - {t.apiUrl}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">Auth uses your logged-in admin session - no secret key needed.</p>
            </div>
          </section>
        )}

        {/* ── Guide picker */}
        <section className={sc}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Load existing guide</h2>
            <button
              type="button"
              onClick={fetchGuideList}
              disabled={listBusy}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {listBusy ? 'Loading…' : 'Fetch guides'}
            </button>
          </div>
          {listErr ? <p className="text-red-400 text-sm">{listErr}</p> : null}
          {guideList.length > 0 && (
            <div className="flex gap-2">
              <select
                className={`${ic} flex-1`}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">- select a guide -</option>
                {guideList.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title || g.slug}{g.published ? '' : ' (unpublished)'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedId || listBusy}
                onClick={() => selectedId && loadGuide(selectedId)}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {listBusy ? '…' : 'Load →'}
              </button>
              <button
                type="button"
                disabled={!selectedId || listBusy}
                onClick={() => void duplicateFromPicker()}
                title="Copy guide fields into a new ingest (clears slug; re-upload hero/diagrams)"
                className="px-4 py-2 rounded-xl text-sm font-bold bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {listBusy ? '…' : 'Duplicate'}
              </button>
            </div>
          )}
        </section>

        {/* ── Main form */}
        <form className="space-y-6" onSubmit={isEdit ? handleUpdate : handleIngest}>

          {/* Machine */}
          <section className={sc}>
            <h2 className="text-lg font-semibold">Machine</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={lc}>Name</label>
                <input className={ic} value={machine.name} onChange={(e) => setMachineField('name', e.target.value)} required />
              </div>
              <div>
                <label className={lc}>Slug</label>
                <input
                  className={ic}
                  value={machine.slug}
                  onChange={(e) => setMachineField('slug', slugifyInput(e.target.value))}
                  onBlur={() => {
                    const normalized = slugify(machine.slug)
                    if (normalized !== machine.slug) setMachineField('slug', normalized)
                  }}
                  required
                />
              </div>
              <div>
                <label className={lc}>Manufacturer</label>
                <input className={ic} value={machine.manufacturer} onChange={(e) => setMachineField('manufacturer', e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className={lc}>Type</label>
                <input className={ic} value={machine.type} onChange={(e) => setMachineField('type', e.target.value)} required />
              </div>
              <div>
                <label className={lc}>Difficulty</label>
                <select className={ic} value={machine.difficulty} onChange={(e) => setMachineField('difficulty', e.target.value)}>
                  <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                </select>
              </div>
              <div>
                <label className={lc}>Popularity <span className="text-gray-500 font-normal text-xs">(🔥 rating)</span></label>
                <select
                  className={ic}
                  value={isCustomVal(machine.popularity, POPULARITY_OPTIONS) ? CUSTOM_SENTINEL : (machine.popularity || '')}
                  onChange={(e) => setMachineField('popularity', e.target.value)}
                  required={!isCustomVal(machine.popularity, POPULARITY_OPTIONS) && machine.popularity !== CUSTOM_SENTINEL}
                >
                  <option value="">- select -</option>
                  {POPULARITY_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  <option value={CUSTOM_SENTINEL}>{CUSTOM_SENTINEL}</option>
                </select>
                {(isCustomVal(machine.popularity, POPULARITY_OPTIONS) ||
                  machine.popularity === CUSTOM_SENTINEL) && (
                  <input
                    className={`${ic} mt-2 text-sm`}
                    placeholder="Type custom value…"
                    value={machine.popularity === CUSTOM_SENTINEL ? '' : machine.popularity}
                    onChange={(e) => setMachineField('popularity', e.target.value || CUSTOM_SENTINEL)}
                  />
                )}
              </div>
              <div>
                <label className={lc}>Nerf risk</label>
                <select className={ic} value={machine.nerf_risk} onChange={(e) => setMachineField('nerf_risk', e.target.value)}>
                  <option value="auto">auto</option><option>Low</option><option>Medium</option><option>High</option>
                </select>
              </div>
              <div>
                <label className={lc}>Volatility index <span className="text-gray-500 font-normal text-xs">(⚡ rating)</span></label>
                <select
                  className={ic}
                  value={isCustomVal(machine.volatility_index, VOLATILITY_OPTIONS) ? CUSTOM_SENTINEL : (machine.volatility_index || '')}
                  onChange={(e) => setMachineField('volatility_index', e.target.value)}
                >
                  <option value="">- select -</option>
                  {VOLATILITY_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  <option value={CUSTOM_SENTINEL}>{CUSTOM_SENTINEL}</option>
                </select>
                {(isCustomVal(machine.volatility_index, VOLATILITY_OPTIONS) ||
                  machine.volatility_index === CUSTOM_SENTINEL) && (
                  <input
                    className={`${ic} mt-2 text-sm`}
                    placeholder="Type custom value…"
                    value={machine.volatility_index === CUSTOM_SENTINEL ? '' : machine.volatility_index}
                    onChange={(e) => setMachineField('volatility_index', e.target.value || CUSTOM_SENTINEL)}
                  />
                )}
              </div>
              <div>
                <label className={lc}>Popularity summary</label>
                <input className={ic} value={machine.popularity_summary} onChange={(e) => setMachineField('popularity_summary', e.target.value)} />
              </div>
              <div>
                <label className={lc}>Release year</label>
                <input className={ic} type="number" value={machine.release_year} onChange={(e) => setMachineField('release_year', e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input id="has_calc" type="checkbox" checked={machine.has_calculator} onChange={(e) => setMachineField('has_calculator', e.target.checked)} />
                <label htmlFor="has_calc">Has calculator</label>
              </div>
              {machine.has_calculator && (
                <div className="sm:col-span-2">
                  <label className={lc}>Calculator slug</label>
                  <input className={ic} value={machine.calculator_slug} onChange={(e) => setMachineField('calculator_slug', e.target.value)} />
                </div>
              )}
            </div>
          </section>

          {/* Guide card metadata */}
          <section className={sc}>
            <h2 className="text-lg font-semibold">Guide card</h2>
            <div className="space-y-4">
              <div>
                <label className={lc}>Title (H1)</label>
                <input className={ic} value={guide.title} onChange={(e) => setGuideField('title', e.target.value)} placeholder={machine.name || 'Same as machine name'} />
              </div>
              <div>
                <label className={lc}>+EV threshold (collapsed card line)</label>
                <input className={ic} value={guide.card_ev_threshold} onChange={(e) => setGuideField('card_ev_threshold', e.target.value)} placeholder="6+ lit letters on Reels 1–3" />
              </div>
              <div className="flex items-center gap-2">
                <input id="published" type="checkbox" checked={guide.published} onChange={(e) => setGuideField('published', e.target.checked)} />
                <label htmlFor="published" className="text-sm text-gray-300">Published</label>
              </div>
              <div>
                <label className={lc}>
                  Hero image <span className="text-gray-500 font-normal text-xs">(optional)</span>
                </label>
                {isEdit && currentThumbnail ? (
                  <div>
                    <button
                      type="button"
                      onClick={pickHeroFile}
                      className="block w-full cursor-pointer group text-left"
                    >
                      <div className="relative w-full rounded-xl overflow-hidden border border-gray-700 bg-gray-900">
                        <img
                          src={heroPreviewUrl || currentThumbnail}
                          alt="Hero"
                          className="w-full max-h-52 object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          <span className="text-white text-sm font-semibold">{heroFile ? 'Change image' : 'Replace image'}</span>
                        </div>
                        {heroFile && (
                          <div className="absolute top-2 right-2 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            New
                          </div>
                        )}
                      </div>
                    </button>
                    {heroFile
                      ? <p className="text-xs text-emerald-400 mt-1.5">Replacing with: {heroFile.name} - save to apply</p>
                      : <p className="text-xs text-gray-600 mt-1.5">Click image to replace</p>
                    }
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={pickHeroFile}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700"
                    >
                      Choose hero image
                    </button>
                    {heroFile && <p className="text-xs text-emerald-400 mt-1">Selected: {heroFile.name}</p>}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Guide sections - same order & headers as expanded AP guide card */}
          <section className={sc}>
            <div>
              <h2 className="text-lg font-semibold">Guide card sections</h2>
              <p className="text-xs text-gray-500 mt-1">
                Same order and titles as the expanded AP Guides card. One panel = one section on the card.
              </p>
            </div>

            <GuideSectionPanel title="🟢 When to play">
              <GuideSectionBody
                fieldKey="when_to_play"
                value={guide.when_to_play}
                onChange={(val) => setGuideField('when_to_play', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="🛑 When to stop">
              <GuideSectionBody
                fieldKey="when_to_stop"
                value={guide.when_to_stop}
                onChange={(val) => setGuideField('when_to_stop', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="🔍 How to check">
              <GuideSectionBody
                fieldKey="how_to_check"
                value={guide.how_to_check}
                onChange={(val) => setGuideField('how_to_check', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="💰 Bankroll on hand">
              <GuideSectionBody
                fieldKey="risk_bankroll"
                value={guide.risk_bankroll}
                onChange={(val) => setGuideField('risk_bankroll', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
                placeholder={'Major - 1500+ (min bet) units\nGrand - 15000+ (min bet) units'}
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="⚠️ Risk & Warnings">
              <div>
                <span className={subFieldLabel}>Summary</span>
                <GuideSectionBody
                  fieldKey="risk_summary"
                  value={guide.risk_summary}
                  onChange={(val) => setGuideField('risk_summary', val)}
                  slug={machine.slug || guide._slug}
                  guideTitle={guide.title}
                  pickFile={pickFile}
                />
              </div>
              <div>
                <span className={subFieldLabel}>Bullets (one per line, optional)</span>
                <textarea
                  className={`${ic} min-h-24`}
                  value={guide.risk_bullets}
                  onChange={(e) => setGuideField('risk_bullets', e.target.value)}
                />
              </div>
            </GuideSectionPanel>

            <GuideSectionPanel title="🎭 Skins (same game different theme/art)" optional>
              <SkinsTextarea
                className={`${ic} min-h-28`}
                value={guide.skins_markdown}
                onChange={(val) => setGuideField('skins_markdown', val)}
                guideList={guideList}
                pickFile={pickFile}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="📍 Where to find" optional>
              <GuideSectionBody
                fieldKey="where_to_find"
                value={guide.where_to_find}
                onChange={(val) => setGuideField('where_to_find', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
                minH="min-h-36"
              />
            </GuideSectionPanel>

            <GuideSectionPanel title="🎰 Gameplay Mechanics">
              <GuideSectionBody
                fieldKey="gameplay_mechanics"
                value={guide.gameplay_mechanics}
                onChange={(val) => setGuideField('gameplay_mechanics', val)}
                slug={machine.slug || guide._slug}
                guideTitle={guide.title}
                pickFile={pickFile}
              />
            </GuideSectionPanel>
          </section>

          {/* Diagrams - placement images (also use Insert image in section fields for inline) */}
          <section className={sc}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Diagrams</h2>
              <button
                type="button"
                className="text-sm text-cyan-300 hover:underline"
                onClick={() => { setDiagrams((d) => [...d, emptyDiagram(slug || machine.slug || 'guide')]); setIsDirty(true) }}
              >
                + Add diagram
              </button>
            </div>
            {diagrams.length === 0 && (
              <p className="text-sm text-gray-500">
                Optional. Each diagram converts to WebP, uploads to cloud storage, and embeds in the saved guide markdown.
                You can also use <span className="text-gray-400">Insert image</span> inside section fields.
              </p>
            )}
            {diagrams.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-800 p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Diagram</span>
                  <button type="button" className="text-xs text-red-400" onClick={() => { setDiagrams((list) => list.filter((x) => x.id !== d.id)); setIsDirty(true) }}>Remove</button>
                </div>
                {(d.publicUrl || d.file) && (
                  <DiagramPreview file={d.file} publicUrl={d.publicUrl} alt={d.alt} />
                )}
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700"
                  onClick={() => pickFile({
                    accept: 'image/*',
                    onPick: (file) => {
                      if (!file) return
                      setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, file, publicUrl: null }))
                      setIsDirty(true)
                    },
                  })}
                >
                  {d.file ? `Selected: ${d.file.name}` : 'Choose diagram image'}
                </button>
                <input className={ic} placeholder="Alt text" value={d.alt} onChange={(e) => { setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, alt: e.target.value })); setIsDirty(true) }} />
                <input className={ic} placeholder="Filename (e.g. ladder-diagram.webp)" value={d.filename} onChange={(e) => { setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, filename: e.target.value })); setIsDirty(true) }} />
                <select className={ic} value={d.placement} onChange={(e) => { setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, placement: e.target.value })); setIsDirty(true) }}>
                  {PLACEMENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            ))}
          </section>

          {error  ? <p className="text-red-400 text-sm">{error}</p> : null}
          {result ? (
            <div className={`rounded-xl border p-4 text-sm ${result.ok ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-gray-700 bg-gray-900'}`}>
              {result.headline ? <p className="font-semibold mb-3">{result.headline}</p> : null}
              {result.message ? <p>{result.message}</p> : null}
              {result.payload ? (
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs mt-2 text-gray-300">{JSON.stringify(result.payload, null, 2)}</pre>
              ) : !result.message && !result.headline ? (
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>
              ) : null}
            </div>
          ) : null}

          {!isEdit ? (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveDraft(false)}
                  className="flex-1 min-h-12 rounded-xl font-bold text-lg border-2 border-amber-500 bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-12 rounded-xl font-bold text-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Ingesting…' : 'Ingest guide'}
                </button>
              </div>
              <p className="text-xs text-gray-500 text-center sm:text-left">
                <strong className="text-gray-400">Save draft</strong> keeps your work in this browser only.
                <strong className="text-gray-400"> Ingest guide</strong> publishes to Supabase + cloud storage (live on test).
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={deleteBusy || busy || !editIds}
                onClick={() =>
                  setDeleteConfirm({
                    guideId: editIds.guideId,
                    machineId: editIds.machineId,
                    slug: guide._slug || machine.slug || slug,
                    name: guide.title || machine.name || guide._slug || machine.slug,
                  })
                }
                className="sm:w-40 min-h-12 rounded-xl font-bold text-sm border border-red-500/70 bg-red-950/75 text-red-200 hover:bg-red-950 disabled:opacity-50 transition-colors"
              >
                Delete guide
              </button>
              <button
                type="submit"
                disabled={busy || deleteBusy}
                className="flex-1 min-h-12 rounded-xl font-bold text-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </form>

      </div>{/* end form column */}

      {/* ── RIGHT: sticky live card preview (wide screens) ── */}
      {livePreviewPanel && (
        <div className="hidden lg:block w-[360px] shrink-0">
          <div className="sticky top-8">
            {livePreviewPanel}
          </div>
        </div>
      )}

      </div>{/* end flex/grid row */}
      </div>{/* end max-w-7xl */}
    </div>

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/75"
          role="dialog"
          aria-modal
          aria-labelledby="slot-guide-delete-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 id="slot-guide-delete-title" className="text-lg font-bold text-white">
              Delete AP guide?
            </h2>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
              Remove <strong className="text-white">{deleteConfirm.name}</strong>{' '}
              (<code className="text-zinc-400">{deleteConfirm.slug}</code>) from test. This deletes the Supabase{' '}
              <code className="text-zinc-400">guides</code> and <code className="text-zinc-400">machines</code> rows
              (and related access gates). Cloud images in R2/Storage are not removed automatically.
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirm(null)}
                className="min-h-11 rounded-xl border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleDeleteGuide()}
                className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete guide'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
