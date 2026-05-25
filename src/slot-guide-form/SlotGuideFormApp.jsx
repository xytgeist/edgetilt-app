import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { buildGuideMarkdown, diagramFilename, parseGuideMarkdown, slugify } from './formUtils.js'

const STORAGE_KEY = 'slotGuideFormSettings:v3'

// Publishable (non-secret) — safe to hardcode in client source.
// Secrets (service key, ingest secret) are entered by the user at runtime.
const ENVS = [
  {
    id: 'test', label: 'test',
    url:     'https://jtjgtucumuoswnbauxry.supabase.co',
    anonKey: 'sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B',
  },
  {
    id: 'production', label: 'production',
    url:     'https://wedrhwtsxifbnnbgxdkm.supabase.co',
    anonKey: 'sb_publishable_jtH82joS6gk2_gfzwEgomA_AtmkXwOY',
  },
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
}

export default function SlotGuideFormApp() {
  const saved = useMemo(() => (typeof window !== 'undefined' ? readSettings() : null), [])

  // ── Connection settings
  const [apiUrl, setApiUrl]           = useState(saved?.apiUrl || '/api/slot-guide-ingest')
  const [secret, setSecret]           = useState(saved?.secret || '')
  const [envId, setEnvId]             = useState(saved?.envId || 'test')
  const [supabaseKey, setSupabaseKey] = useState(saved?.supabaseKey || '')

  const activeEnv   = ENVS.find(e => e.id === envId) ?? ENVS[0]
  const target      = activeEnv.id
  const supabaseUrl = activeEnv.url

  // ── Mode: 'new' | 'edit'
  const [mode, setMode] = useState('new')

  // ── Guide picker
  const [guideList, setGuideList]   = useState([])      // [{id, slug, title, published, machines}]
  const [listBusy, setListBusy]     = useState(false)
  const [listErr, setListErr]       = useState('')
  const [selectedId, setSelectedId] = useState('')       // guide id in picker

  // ── Form state
  const [machine, setMachine]   = useState(blankMachine)
  const [guide, setGuide]       = useState(blankGuide)
  const [heroFile, setHeroFile] = useState(null)
  const [diagrams, setDiagrams] = useState([])
  const [editIds, setEditIds]   = useState(null)      // {guideId, machineId} when editing

  // ── Submit
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError]   = useState('')

  const supaClientRef = useRef(null)

  // For reads (guide list, load): use service key if entered, else fall back to anon key.
  // For writes (save edits): caller must ensure service key is present.
  function getSupaClient({ requireServiceKey = false } = {}) {
    const key = supabaseKey.trim() || activeEnv.anonKey
    if (!supabaseUrl || !key) return null
    if (requireServiceKey && !supabaseKey.trim()) return null
    if (!supaClientRef.current ||
        supaClientRef.current._url !== supabaseUrl ||
        supaClientRef.current._key !== key) {
      const c = createClient(supabaseUrl, key)
      c._url = supabaseUrl
      c._key = key
      supaClientRef.current = c
    }
    return supaClientRef.current
  }

  // Persist settings
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiUrl, secret, envId, supabaseKey }))
    } catch { /* ignore */ }
  }, [apiUrl, secret, envId, supabaseKey])

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
    const sb = getSupaClient()
    if (!sb) { setListErr('Enter Supabase URL and key first.'); return }
    setListBusy(true)
    setListErr('')
    try {
      const { data, error: err } = await sb.from('guides').select(
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
    const sb = getSupaClient()
    if (!sb) { setListErr('Enter Supabase URL and key first.'); return }
    setListBusy(true)
    setListErr('')
    setError('')
    setResult(null)
    try {
      const { data, error: err } = await sb.from('guides').select(`
        id, slug, title, content_markdown, card_ev_threshold, published,
        machines (
          id, slug, name, manufacturer, type, difficulty,
          vegas_availability, nerf_risk, volatility_index,
          popularity_summary, release_year, has_calculator, calculator_slug
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
      })
      setHeroFile(null)
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
    setDiagrams([])
    setEditIds(null)
    setSelectedId('')
    setError('')
    setResult(null)
  }

  // ── Submit: new guide via ingest API
  async function handleIngest(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!secret.trim()) { setError('Ingest secret is required.'); return }
    if (!heroFile) { setError('Hero image is required for new guides.'); return }
    if (!slug) { setError('Slug is required.'); return }

    setBusy(true)
    try {
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
        headers: { 'Content-Type': 'application/json', 'x-guide-ingest-secret': secret.trim() },
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

  // ── Submit: update existing guide via Supabase directly
  async function handleUpdate(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    const sb = getSupaClient({ requireServiceKey: true })
    if (!sb) { setError('Enter the Supabase service key to save edits (anon key is read-only).'); return }
    if (!editIds) { setError('No guide loaded for editing.'); return }

    setBusy(true)
    try {
      // Update machines row
      const { error: mErr } = await sb.from('machines').update({
        name: machine.name,
        manufacturer: machine.manufacturer,
        type: machine.type,
        difficulty: machine.difficulty,
        vegas_availability: machine.vegas_availability,
        nerf_risk: machine.nerf_risk,
        volatility_index: machine.volatility_index || null,
        popularity_summary: machine.popularity_summary || null,
        release_year: machine.release_year ? Number(machine.release_year) : null,
        has_calculator: machine.has_calculator,
        calculator_slug: machine.has_calculator ? machine.calculator_slug || machine.slug : null,
      }).eq('id', editIds.machineId)
      if (mErr) throw new Error(`machines: ${mErr.message}`)

      const compiledMarkdown = buildGuideMarkdown({ title: guide.title || machine.name, guide })

      // Update guides row
      const { error: gErr } = await sb.from('guides').update({
        title: guide.title || machine.name,
        card_ev_threshold: guide.card_ev_threshold || null,
        published: guide.published,
        content_markdown: compiledMarkdown,
      }).eq('id', editIds.guideId)
      if (gErr) throw new Error(`guides: ${gErr.message}`)

      setResult({ ok: true, message: 'Guide updated successfully.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const isEdit = mode === 'edit'

  return (
    <div className="min-h-dvh bg-gray-950 text-white px-4 py-8 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">

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

        {/* ── Connection */}
        <section className={sc}>
          <h2 className="text-lg font-semibold">Connection</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Environment selector — sets both ingest target and Supabase URL */}
            <div className="sm:col-span-2">
              <label className={lc}>Environment</label>
              <select className={ic} value={envId} onChange={(e) => setEnvId(e.target.value)}>
                {ENVS.map(e => (
                  <option key={e.id} value={e.id}>{e.label} — {e.url}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lc}>Supabase service key</label>
              <input type="password" className={ic} value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className={lc}>Ingest secret</label>
              <input type="password" className={ic} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label className={lc}>Ingest API URL</label>
              <input className={ic} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="/api/slot-guide-ingest" />
            </div>
          </div>
        </section>

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
                <label className={lc}>Vegas availability</label>
                <input className={ic} value={machine.vegas_availability} onChange={(e) => setMachineField('vegas_availability', e.target.value)} required />
              </div>
              <div>
                <label className={lc}>Nerf risk</label>
                <select className={ic} value={machine.nerf_risk} onChange={(e) => setMachineField('nerf_risk', e.target.value)}>
                  <option value="auto">auto</option><option>Low</option><option>Medium</option><option>High</option>
                </select>
              </div>
              <div>
                <label className={lc}>Volatility index</label>
                <input className={ic} value={machine.volatility_index} onChange={(e) => setMachineField('volatility_index', e.target.value)} placeholder="Low-Medium" />
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
                  Hero image{isEdit ? <span className="text-gray-500 font-normal"> — leave blank to keep existing</span> : <span className="text-red-400"> *</span>}
                </label>
                <input type="file" accept="image/*" className={ic} onChange={(e) => setHeroFile(e.target.files?.[0] || null)} required={!isEdit} />
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
              ['skins_markdown',    '🎭 Skins (optional — use [Title](guide:other-slug))'],
              ['gameplay_mechanics','🎰 Gameplay mechanics'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={lc}>{label}</label>
                <textarea
                  className={`${ic} min-h-28`}
                  value={guide[key]}
                  onChange={(e) => setGuideField(key, e.target.value)}
                  required={!isEdit && !['skins_markdown', 'risk_bankroll'].includes(key)}
                />
              </div>
            ))}
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
      </div>
    </div>
  )
}
