import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { supabase } from './LoginGate.jsx'
import { buildGuideMarkdown, diagramFilename, parseGuideMarkdown, slugify } from './formUtils.js'
import GuideCardPreview from './GuideCardPreview.jsx'

const CF_R2_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * Upload a guide image to R2 via the guide-cf-r2-upload Edge function.
 * Falls back to Supabase Storage if R2 is not configured (503).
 * Returns the public URL.
 */
async function uploadGuideImageToR2OrStorage(file, { slug, filename }) {
  // Try R2 first
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const { data: mintData, error: mintErr } = await supabase.functions.invoke('guide-cf-r2-upload', {
      body: { slug, contentType: file.type || 'image/webp', filename },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const r2NotConfigured = mintErr?.context?.status === 503 ||
      (typeof mintData?.error === 'string' && mintData.error.includes('not configured'))
    if (!r2NotConfigured) {
      if (mintErr) {
        const msg = mintData?.error || mintErr.message || 'Could not start R2 upload.'
        throw new Error(msg)
      }
      if (mintData?.uploadURL) {
        const putRes = await fetch(mintData.uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/webp', 'Cache-Control': CF_R2_CACHE_CONTROL },
          body: file,
        })
        if (!putRes.ok) throw new Error(`R2 upload failed (${putRes.status})`)
        return mintData.publicUrl
      }
    }
  }
  // Fallback: Supabase Storage
  const { error: upErr } = await supabase.storage
    .from('guide-assets')
    .upload(`${slug}/${filename}`, file, { contentType: file.type || 'image/webp', upsert: true, cacheControl: '31536000' })
  if (upErr) throw new Error(`Storage upload: ${upErr.message}`)
  const { data: urlData } = supabase.storage.from('guide-assets').getPublicUrl(`${slug}/${filename}`)
  return urlData.publicUrl
}

const STORAGE_KEY = 'slotGuideFormSettings:v4'

// Ingest API targets — controls which Vercel function receives new guide ingests.
// Reads and writes use the authenticated Supabase client from LoginGate (test env).
const INGEST_TARGETS = [
  { id: 'test',       label: 'test',       apiUrl: '/api/slot-guide-ingest' },
  { id: 'production', label: 'production', apiUrl: 'https://lvslotpro-calc-tx18.vercel.app/api/slot-guide-ingest' },
]

const PLACEMENTS = [
  { id: 'when_to_play', label: 'After When to play' },
  { id: 'when_to_stop', label: 'After When to stop' },
  { id: 'how_to_check', label: 'After How to check' },
  { id: 'risk', label: 'After Risk & Warnings' },
  { id: 'skins', label: 'After Skins' },
  { id: 'gameplay', label: 'After Gameplay' },
]

const ic = 'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'
const lc = 'block text-sm font-medium text-gray-300 mb-1'
const sc = 'rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-4'

const VEGAS_OPTIONS = [
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
  return { id: crypto.randomUUID(), alt: '', placement: 'when_to_play', filename: `${slug}-diagram.webp`, file: null }
}

/** Fields that support inline image insertion. */
const IMAGE_UPLOAD_FIELDS = new Set(['when_to_play', 'when_to_stop', 'how_to_check'])

/**
 * Textarea with an "Add image" toolbar button.
 * Uploads the image to R2 (or Supabase Storage fallback) and inserts
 * `![image](url)` markdown at the current cursor position.
 */
function InlineImageTextarea({ value, onChange, className, required, slug, guideTitle }) {
  const taRef  = useRef(null)
  const fileRef = useRef(null)
  const inputId = useId()
  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const effectiveSlug = slug || slugify(guideTitle || 'guide') || 'guide'
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const filename = `content-${Date.now()}.${ext || 'jpg'}`

    setUploading(true)
    setUploadErr('')
    try {
      const url = await uploadGuideImageToR2OrStorage(file, { slug: effectiveSlug, filename })
      const ta = taRef.current
      const pos = ta?.selectionStart ?? value.length
      const before = value.slice(0, pos)
      const after  = value.slice(pos)
      const pad    = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
      const insert = `${pad}![image](${url})\n`
      const next   = before + insert + after
      onChange(next)
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
      {/* toolbar */}
      <div className="flex items-center justify-end mb-1">
        <label
          htmlFor={inputId}
          className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors
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
        </label>
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept="image/*"
          disabled={uploading}
          className="sr-only"
          onChange={handleFile}
        />
      </div>
      <textarea
        ref={taRef}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {uploadErr && <p className="text-xs text-red-400 mt-1">{uploadErr}</p>}
    </div>
  )
}

/**
 * Textarea for the Skins section with a "Insert guide link" slug-picker toolbar.
 * Selecting a guide from the dropdown inserts `[Machine Name](guide:slug)` at cursor.
 */
function SkinsTextarea({ value, onChange, className, guideList = [] }) {
  const taRef = useRef(null)
  const [pickerSlug, setPickerSlug] = useState('')

  function insertLink() {
    if (!pickerSlug) return
    const picked = guideList.find(
      (g) => (g.machines?.slug || g.slug) === pickerSlug
    )
    const label = picked?.machines?.name || picked?.title || pickerSlug
    const insert = `[${label}](guide:${pickerSlug})`

    const ta = taRef.current
    const pos = ta?.selectionStart ?? value.length
    const before = value.slice(0, pos)
    const after  = value.slice(pos)
    const pad    = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const next   = before + pad + insert + after
    onChange(next)

    setTimeout(() => {
      if (!ta) return
      ta.focus()
      const cur = (before + pad + insert).length
      ta.setSelectionRange(cur, cur)
    }, 0)
    setPickerSlug('')
  }

  return (
    <div>
      {/* slug picker toolbar */}
      <div className="flex items-center gap-2 mb-1">
        <select
          className="flex-1 min-h-9 text-sm text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          value={pickerSlug}
          onChange={(e) => setPickerSlug(e.target.value)}
        >
          <option value="">— pick a guide to link —</option>
          {guideList.map((g) => {
            const slug = g.machines?.slug || g.slug
            const name = g.machines?.name || g.title || slug
            return (
              <option key={g.id} value={slug}>
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
      </div>
      <textarea
        ref={taRef}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

const blankMachine = {
  slug: '', name: '', manufacturer: 'IGT', type: '', difficulty: 'Beginner',
  vegas_availability: 'Common', nerf_risk: 'auto', volatility_index: '',
  popularity_summary: '', release_year: '', has_calculator: false, calculator_slug: '',
}
const blankGuide = {
  title: '', card_ev_threshold: '', published: true,
  when_to_play: '', when_to_stop: '', how_to_check: '',
  risk_bankroll: '', risk_summary: '', risk_bullets: '',
  skins_markdown: '', gameplay_mechanics: '',
  // preview-only fields (not submitted to ingest/update)
  _slug: '', _created_at: '', _updated_at: '',
}

export default function SlotGuideFormApp() {
  const saved = useMemo(() => (typeof window !== 'undefined' ? readSettings() : null), [])

  // ── Connection settings (ingest target only — auth uses LoginGate session token)
  const [ingestId, setIngestId] = useState(saved?.ingestId || 'test')

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

  // ── Submit
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError]   = useState('')

  // Persist settings
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ingestId }))
    } catch { /* ignore */ }
  }, [ingestId])

  // Auto-slug from machine name
  useEffect(() => {
    setMachine((m) => {
      const slug = slugify(m.slug || m.name)
      if (!slug || m.slug === slug) return m
      return { ...m, slug }
    })
    setGuide((g) => {
      if (g.title || !machine.name) return g
      return { ...g, title: machine.name }
    })
  }, [machine.name, machine.slug])

  const slug = machine.slug.trim()

  const setMachineField = useCallback((key, value) => {
    setMachine((m) => {
      const next = { ...m, [key]: value }
      if (key === 'name' && !m.slug) next.slug = slugify(value)
      if (key === 'has_calculator' && value && !m.calculator_slug) next.calculator_slug = next.slug || slugify(next.name)
      return next
    })
  }, [])

  const setGuideField = useCallback((key, value) => setGuide((g) => ({ ...g, [key]: value })), [])

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

  // ── Load a selected guide into the form
  async function loadGuide(id) {
    setListBusy(true)
    setListErr('')
    setError('')
    setResult(null)
    try {
      const { data, error: err } = await supabase.from('guides').select(`
        id, slug, title, content_markdown, card_ev_threshold, published, thumbnail_url,
        created_at, updated_at,
        machines (
          id, slug, name, manufacturer, type, difficulty,
          vegas_availability, nerf_risk, volatility_index,
          popularity_summary, release_year, has_calculator, calculator_slug, thumbnail_url
        )
      `).eq('id', id).single()
      if (err) throw new Error(err.message)

      const m = Array.isArray(data.machines) ? data.machines[0] : data.machines
      if (m) {
        setMachine({
          slug: m.slug || '',
          name: m.name || '',
          manufacturer: m.manufacturer || 'IGT',
          type: m.type || '',
          difficulty: m.difficulty || 'Beginner',
          vegas_availability: m.vegas_availability || 'Common',
          nerf_risk: m.nerf_risk || 'auto',
          volatility_index: m.volatility_index || '',
          popularity_summary: m.popularity_summary || '',
          release_year: m.release_year ? String(m.release_year) : '',
          has_calculator: m.has_calculator || false,
          calculator_slug: m.calculator_slug || '',
        })
        setEditIds({ guideId: data.id, machineId: m.id })
      }
      const parsed = parseGuideMarkdown(data.content_markdown || '')
      setGuide({
        ...parsed,
        title: data.title || '',
        card_ev_threshold: data.card_ev_threshold || '',
        published: data.published ?? true,
        _slug: data.slug || '',
        _created_at: data.created_at || '',
        _updated_at: data.updated_at || '',
      })
      setHeroFile(null)
      // Fall back to the static public path used by GuidesScreen when no DB thumbnail is set
      setCurrentThumbnail(data.thumbnail_url || m?.thumbnail_url || `/guides/${data.slug}/hero.webp`)
      setDiagrams([])
      setMode('edit')
    } catch (e) {
      setListErr(e.message)
    } finally {
      setListBusy(false)
    }
  }

  function startNew() {
    setMode('new')
    setMachine(blankMachine)
    setGuide(blankGuide)
    setHeroFile(null)
    setCurrentThumbnail('')
    setDiagrams([])
    setEditIds(null)
    setSelectedId('')
    setError('')
    setResult(null)
  }

  // ── Submit: new guide via ingest API (auth via Supabase session token)
  async function handleIngest(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!heroFile) { setError('Hero image is required for new guides.'); return }
    if (!slug) { setError('Slug is required.'); return }

    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Session expired — please sign out and back in.'); setBusy(false); return }

      const payload = {
        machine: { ...machine, slug, release_year: machine.release_year ? Number(machine.release_year) : null, calculator_slug: machine.has_calculator ? machine.calculator_slug || slug : null },
        guide: { ...guide, title: guide.title || machine.name, risk_bullets: guide.risk_bullets.split('\n').map((s) => s.trim()).filter(Boolean) },
        diagrams: diagrams.filter((d) => d.file && d.alt.trim()).map((d) => ({
          alt: d.alt.trim(), placement: d.placement,
          filename: d.filename || diagramFilename(d.file.name, slug),
        })),
      }
      const heroImage = { dataBase64: await fileToBase64(heroFile) }
      const diagramImages = []
      for (const d of diagrams) {
        if (!d.file || !d.alt.trim()) continue
        diagramImages.push({ filename: d.filename || diagramFilename(d.file.name, slug), dataBase64: await fileToBase64(d.file) })
      }
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ target, payload, heroImage, diagramImages }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || (Array.isArray(data.errors) ? data.errors.join(' ') : res.statusText) || 'Ingest failed.')
      setResult(data)
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
      if (heroFile) {
        const heroExt = heroFile.name.split('.').pop().toLowerCase() || 'webp'
        newThumbnailUrl = await uploadGuideImageToR2OrStorage(heroFile, {
          slug: machine.slug,
          filename: `hero.${heroExt}`,
        })
        setCurrentThumbnail(newThumbnailUrl)
        setHeroFile(null)
      }

      // Update machines row
      const machinePayload = {
        name: machine.name,
        manufacturer: machine.manufacturer,
        type: machine.type,
        difficulty: machine.difficulty,
        vegas_availability: machine.vegas_availability === CUSTOM_SENTINEL ? null : (machine.vegas_availability || null),
        nerf_risk: machine.nerf_risk,
        volatility_index: (machine.volatility_index === CUSTOM_SENTINEL ? null : machine.volatility_index) || null,
        popularity_summary: machine.popularity_summary || null,
        release_year: machine.release_year ? Number(machine.release_year) : null,
        has_calculator: machine.has_calculator,
        calculator_slug: machine.has_calculator ? machine.calculator_slug || machine.slug : null,
      }
      if (newThumbnailUrl) machinePayload.thumbnail_url = newThumbnailUrl
      const { error: mErr } = await supabase.from('machines').update(machinePayload).eq('id', editIds.machineId)
      if (mErr) throw new Error(`machines: ${mErr.message}`)

      const compiledMarkdown = buildGuideMarkdown({ title: guide.title || machine.name, guide })

      // Update guides row
      const guidePayload = {
        title: guide.title || machine.name,
        card_ev_threshold: guide.card_ev_threshold || null,
        published: guide.published,
        content_markdown: compiledMarkdown,
      }
      if (newThumbnailUrl) guidePayload.thumbnail_url = newThumbnailUrl
      const { error: gErr } = await supabase.from('guides').update(guidePayload).eq('id', editIds.guideId)
      if (gErr) throw new Error(`guides: ${gErr.message}`)

      setResult({ ok: true, message: newThumbnailUrl ? 'Guide and hero image updated.' : 'Guide updated successfully.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const isEdit = mode === 'edit'

  const showPreview = isEdit || !!(guide.title || machine.name)

  return (
    <div className="min-h-dvh bg-gray-950 text-white px-4 py-8 pb-24">
      {/* Two-column on large screens: form left, card preview right */}
      <div className="max-w-7xl mx-auto">
      <div className={`flex gap-8 items-start ${showPreview ? 'xl:grid xl:grid-cols-[1fr_360px]' : ''}`}>

      {/* ── LEFT: form ── */}
      <div className="flex-1 min-w-0 space-y-6">

        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-cyan-300">AP Guide editor</h1>
            <p className="text-gray-400 text-sm mt-0.5">Load an existing guide or create a new one.</p>
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
            {isEdit && (
              <span className="px-3 py-2 rounded-xl text-sm font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                Editing: {machine.name || slug}
              </span>
            )}
          </div>
        </header>

        {/* ── New-guide ingest target (hidden in edit mode) */}
        {!isEdit && (
          <section className={sc}>
            <h2 className="text-lg font-semibold">New guide — ingest target</h2>
            <div>
              <label className={lc}>Target environment</label>
              <select className={ic} value={ingestId} onChange={(e) => setIngestId(e.target.value)}>
                {INGEST_TARGETS.map(t => (
                  <option key={t.id} value={t.id}>{t.label} — {t.apiUrl}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">Auth uses your logged-in admin session — no secret key needed.</p>
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
                <option value="">— select a guide —</option>
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
                <input className={ic} value={machine.slug} onChange={(e) => setMachineField('slug', slugify(e.target.value))} required />
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
                <label className={lc}>Vegas availability <span className="text-gray-500 font-normal text-xs">(🔥 rating)</span></label>
                <select
                  className={ic}
                  value={isCustomVal(machine.vegas_availability, VEGAS_OPTIONS) ? CUSTOM_SENTINEL : (machine.vegas_availability || '')}
                  onChange={(e) => setMachineField('vegas_availability', e.target.value)}
                  required={!isCustomVal(machine.vegas_availability, VEGAS_OPTIONS) && machine.vegas_availability !== CUSTOM_SENTINEL}
                >
                  <option value="">— select —</option>
                  {VEGAS_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  <option value={CUSTOM_SENTINEL}>{CUSTOM_SENTINEL}</option>
                </select>
                {(isCustomVal(machine.vegas_availability, VEGAS_OPTIONS) ||
                  machine.vegas_availability === CUSTOM_SENTINEL) && (
                  <input
                    className={`${ic} mt-2 text-sm`}
                    placeholder="Type custom value…"
                    value={machine.vegas_availability === CUSTOM_SENTINEL ? '' : machine.vegas_availability}
                    onChange={(e) => setMachineField('vegas_availability', e.target.value || CUSTOM_SENTINEL)}
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
                  <option value="">— select —</option>
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
                <input className={ic} value={guide.card_ev_threshold} onChange={(e) => setGuideField('card_ev_threshold', e.target.value)} placeholder="6+ lit letters on Reels 1–3" required={!isEdit} />
              </div>
              <div className="flex items-center gap-2">
                <input id="published" type="checkbox" checked={guide.published} onChange={(e) => setGuideField('published', e.target.checked)} />
                <label htmlFor="published" className="text-sm text-gray-300">Published</label>
              </div>
              <div>
                <label className={lc}>
                  Hero image{!isEdit && <span className="text-red-400"> *</span>}
                </label>
                {isEdit && currentThumbnail ? (
                  /* Edit mode: show current image with click-to-replace */
                  <label className="block cursor-pointer group">
                    <div className="relative w-full rounded-xl overflow-hidden border border-gray-700 bg-gray-900">
                      <img
                        src={heroFile ? URL.createObjectURL(heroFile) : currentThumbnail}
                        alt="Hero"
                        className="w-full max-h-52 object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                      {/* Hover overlay */}
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
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => setHeroFile(e.target.files?.[0] || null)}
                    />
                    {heroFile
                      ? <p className="text-xs text-emerald-400 mt-1.5">Replacing with: {heroFile.name} — save to apply</p>
                      : <p className="text-xs text-gray-600 mt-1.5">Click image to replace</p>
                    }
                  </label>
                ) : isEdit ? (
                  /* Edit mode, no existing image */
                  <div>
                    <input type="file" accept="image/*" className={ic} onChange={(e) => setHeroFile(e.target.files?.[0] || null)} />
                    {heroFile && <p className="text-xs text-emerald-400 mt-1">Selected: {heroFile.name}</p>}
                  </div>
                ) : (
                  /* New guide mode */
                  <input type="file" accept="image/*" className={ic} onChange={(e) => setHeroFile(e.target.files?.[0] || null)} required />
                )}
              </div>
            </div>
          </section>

          {/* Guide sections — same form for both new and edit */}
          <section className={sc}>
            <h2 className="text-lg font-semibold">Guide sections</h2>
            {[
              ['when_to_play',      '🟢 When to play'],
              ['when_to_stop',      '🛑 When to stop'],
              ['how_to_check',      '🔍 How to check'],
              ['risk_bankroll',     '⚠️ Risk — bankroll line (e.g. 5–40 units)'],
              ['risk_summary',      '⚠️ Risk — summary paragraph'],
              ['gameplay_mechanics','🎰 Gameplay mechanics'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={lc}>{label}</label>
                {IMAGE_UPLOAD_FIELDS.has(key) ? (
                  <InlineImageTextarea
                    className={`${ic} min-h-28`}
                    value={guide[key]}
                    onChange={(val) => setGuideField(key, val)}
                    required={!isEdit}
                    slug={machine.slug || guide._slug}
                    guideTitle={guide.title}
                  />
                ) : (
                  <textarea
                    className={`${ic} min-h-28`}
                    value={guide[key]}
                    onChange={(e) => setGuideField(key, e.target.value)}
                    required={!isEdit && key !== 'risk_bankroll'}
                  />
                )}
              </div>
            ))}

            {/* Skins — separate because it needs the slug-link picker */}
            <div>
              <label className={lc}>🎭 Skins <span className="text-gray-500 font-normal text-xs">(optional)</span></label>
              <SkinsTextarea
                className={`${ic} min-h-28`}
                value={guide.skins_markdown}
                onChange={(val) => setGuideField('skins_markdown', val)}
                guideList={guideList}
              />
            </div>
            <div>
              <label className={lc}>⚠️ Risk bullets (one per line, optional)</label>
              <textarea className={`${ic} min-h-24`} value={guide.risk_bullets} onChange={(e) => setGuideField('risk_bullets', e.target.value)} />
            </div>
          </section>

          {/* Diagrams — new guides only (edits keep existing diagrams in DB) */}
          {!isEdit && (
            <section className={sc}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Diagrams</h2>
                <button type="button" className="text-sm text-cyan-300 hover:underline" onClick={() => setDiagrams((d) => [...d, emptyDiagram(slug || 'guide')])}>
                  + Add diagram
                </button>
              </div>
              {diagrams.length === 0 && (
                <p className="text-sm text-gray-500">Optional. Each diagram is converted to WebP and embedded in guide.md.</p>
              )}
              {diagrams.map((d) => (
                <div key={d.id} className="rounded-xl border border-gray-800 p-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Diagram</span>
                    <button type="button" className="text-xs text-red-400" onClick={() => setDiagrams((list) => list.filter((x) => x.id !== d.id))}>Remove</button>
                  </div>
                  <input type="file" accept="image/*" className={ic} onChange={(e) => setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, file: e.target.files?.[0] || null }))} />
                  <input className={ic} placeholder="Alt text" value={d.alt} onChange={(e) => setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, alt: e.target.value }))} />
                  <input className={ic} placeholder="Filename" value={d.filename} onChange={(e) => setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, filename: e.target.value }))} />
                  <select className={ic} value={d.placement} onChange={(e) => setDiagrams((list) => list.map((x) => x.id !== d.id ? x : { ...x, placement: e.target.value }))}>
                    {PLACEMENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              ))}
            </section>
          )}

          {error  ? <p className="text-red-400 text-sm">{error}</p> : null}
          {result ? (
            <div className={`rounded-xl border p-4 text-sm ${result.ok ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-gray-700 bg-gray-900'}`}>
              {result.message ? <p>{result.message}</p> : (
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>
              )}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className={`w-full min-h-12 rounded-xl font-bold text-lg disabled:opacity-50 transition-colors ${
              isEdit ? 'bg-amber-600 hover:bg-amber-500' : 'bg-cyan-600 hover:bg-cyan-500'
            }`}
          >
            {busy ? (isEdit ? 'Saving…' : 'Ingesting…') : (isEdit ? 'Save changes' : 'Ingest guide')}
          </button>
        </form>

      </div>{/* end form column */}

      {/* ── RIGHT: sticky live card preview ── */}
      {showPreview && (
        <div className="hidden xl:block w-[360px] shrink-0">
          <div className="sticky top-8 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Live card preview
            </div>
            {/* Phone-frame chrome for context */}
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
                  contentMarkdown={buildGuideMarkdown({ title: guide.title, guide })}
                  guideList={guideList}
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 text-center">Updates as you type · Collapsed view only</p>
          </div>
        </div>
      )}

      </div>{/* end flex/grid row */}
      </div>{/* end max-w-7xl */}
    </div>
  )
}
