import { useCallback, useEffect, useMemo, useState } from 'react'
import { diagramFilename, slugify } from './formUtils.js'

const STORAGE_KEY = 'slotGuideFormSettings:v1'

const PLACEMENTS = [
  { id: 'when_to_play', label: 'After When to play' },
  { id: 'when_to_stop', label: 'After When to stop' },
  { id: 'how_to_check', label: 'After How to check' },
  { id: 'risk', label: 'After Risk & Warnings' },
  { id: 'skins', label: 'After Skins' },
  { id: 'gameplay', label: 'After Gameplay' },
]

const inputClass =
  'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'
const labelClass = 'block text-sm font-medium text-gray-300 mb-1'
const sectionClass = 'rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-4'

function readSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function emptyDiagram(slug) {
  return {
    id: crypto.randomUUID(),
    alt: '',
    placement: 'when_to_play',
    filename: `${slug}-diagram.webp`,
    file: null,
  }
}

const initialMachine = {
  slug: '',
  name: '',
  manufacturer: 'IGT',
  type: '',
  difficulty: 'Beginner',
  vegas_availability: 'Common',
  nerf_risk: 'auto',
  volatility_index: '',
  popularity_summary: '',
  release_year: '',
  has_calculator: false,
  calculator_slug: '',
}

const initialGuide = {
  title: '',
  card_ev_threshold: '',
  published: true,
  when_to_play: '',
  when_to_stop: '',
  how_to_check: '',
  risk_bankroll: '',
  risk_summary: '',
  risk_bullets: '',
  skins_markdown: '',
  gameplay_mechanics: '',
}

export default function SlotGuideFormApp() {
  const saved = useMemo(() => (typeof window !== 'undefined' ? readSettings() : null), [])
  const [apiUrl, setApiUrl] = useState(saved?.apiUrl || '/api/slot-guide-ingest')
  const [secret, setSecret] = useState(saved?.secret || '')
  const [target, setTarget] = useState(saved?.target || 'test')
  const [machine, setMachine] = useState(initialMachine)
  const [guide, setGuide] = useState(initialGuide)
  const [heroFile, setHeroFile] = useState(null)
  const [diagrams, setDiagrams] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiUrl, secret, target }))
    } catch {
      // ignore
    }
  }, [apiUrl, secret, target])

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

  const setGuideField = useCallback((key, value) => {
    setGuide((g) => ({ ...g, [key]: value }))
  }, [])

  const addDiagram = () => {
    setDiagrams((d) => [...d, emptyDiagram(slug || 'guide')])
  }

  const updateDiagram = (id, patch) => {
    setDiagrams((list) =>
      list.map((d) => {
        if (d.id !== id) return d
        const next = { ...d, ...patch }
        if (patch.file && !patch.filename) {
          next.filename = diagramFilename(patch.file.name, slug || 'guide')
        }
        return next
      }),
    )
  }

  const removeDiagram = (id) => {
    setDiagrams((list) => list.filter((d) => d.id !== id))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!secret.trim()) {
      setError('Ingest secret is required (x-guide-ingest-secret).')
      return
    }
    if (!heroFile) {
      setError('Hero image is required.')
      return
    }
    if (!slug) {
      setError('Slug is required.')
      return
    }

    setBusy(true)
    try {
      const payload = {
        machine: {
          ...machine,
          slug,
          release_year: machine.release_year ? Number(machine.release_year) : null,
          calculator_slug: machine.has_calculator ? machine.calculator_slug || slug : null,
        },
        guide: {
          ...guide,
          title: guide.title || machine.name,
          risk_bullets: guide.risk_bullets
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        diagrams: diagrams
          .filter((d) => d.file && d.alt.trim())
          .map((d) => ({
            alt: d.alt.trim(),
            placement: d.placement,
            filename: d.filename || diagramFilename(d.file.name, slug),
          })),
      }

      const heroImage = { dataBase64: await fileToBase64(heroFile) }
      const diagramImages = []
      for (const d of diagrams) {
        if (!d.file || !d.alt.trim()) continue
        diagramImages.push({
          filename: d.filename || diagramFilename(d.file.name, slug),
          dataBase64: await fileToBase64(d.file),
        })
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guide-ingest-secret': secret.trim(),
        },
        body: JSON.stringify({ target, payload, heroImage, diagramImages }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || (Array.isArray(data.errors) ? data.errors.join(' ') : res.statusText)
        throw new Error(msg || 'Ingest failed.')
      }
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-950 text-white px-4 py-8 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-cyan-300">AP Guide ingest</h1>
          <p className="text-gray-400 text-sm mt-1">
            Builds <code className="text-gray-300">card.meta.json</code> + <code className="text-gray-300">guide.md</code>,
            uploads hero/diagrams, upserts Supabase. Local server also writes{' '}
            <code className="text-gray-300">public/guides/&lt;slug&gt;/</code>.
          </p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">Connection</h2>
          <div>
            <label className={labelClass}>API URL</label>
            <input
              className={inputClass}
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="/api/slot-guide-ingest or http://localhost:8787/ingest"
            />
          </div>
          <div>
            <label className={labelClass}>Ingest secret</label>
            <input
              type="password"
              className={inputClass}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>Supabase target</label>
            <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="test">test</option>
              <option value="production">production</option>
            </select>
          </div>
        </section>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">Machine</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Name</label>
                <input className={inputClass} value={machine.name} onChange={(e) => setMachineField('name', e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Slug</label>
                <input className={inputClass} value={machine.slug} onChange={(e) => setMachineField('slug', slugify(e.target.value))} required />
              </div>
              <div>
                <label className={labelClass}>Manufacturer</label>
                <input className={inputClass} value={machine.manufacturer} onChange={(e) => setMachineField('manufacturer', e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Type</label>
                <input className={inputClass} value={machine.type} onChange={(e) => setMachineField('type', e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Difficulty</label>
                <select className={inputClass} value={machine.difficulty} onChange={(e) => setMachineField('difficulty', e.target.value)}>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Vegas availability</label>
                <input className={inputClass} value={machine.vegas_availability} onChange={(e) => setMachineField('vegas_availability', e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Nerf risk</label>
                <select className={inputClass} value={machine.nerf_risk} onChange={(e) => setMachineField('nerf_risk', e.target.value)}>
                  <option value="auto">auto</option>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Volatility index</label>
                <input className={inputClass} value={machine.volatility_index} onChange={(e) => setMachineField('volatility_index', e.target.value)} placeholder="Low-Medium" />
              </div>
              <div>
                <label className={labelClass}>Popularity summary</label>
                <input className={inputClass} value={machine.popularity_summary} onChange={(e) => setMachineField('popularity_summary', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Release year</label>
                <input className={inputClass} type="number" value={machine.release_year} onChange={(e) => setMachineField('release_year', e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input id="has_calc" type="checkbox" checked={machine.has_calculator} onChange={(e) => setMachineField('has_calculator', e.target.checked)} />
                <label htmlFor="has_calc">Has calculator</label>
              </div>
              {machine.has_calculator ? (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Calculator slug</label>
                  <input className={inputClass} value={machine.calculator_slug} onChange={(e) => setMachineField('calculator_slug', e.target.value)} />
                </div>
              ) : null}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">Guide card</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Guide title (H1)</label>
                <input className={inputClass} value={guide.title} onChange={(e) => setGuideField('title', e.target.value)} placeholder={machine.name || 'Same as machine name'} />
              </div>
              <div>
                <label className={labelClass}>+EV threshold (collapsed card line)</label>
                <input className={inputClass} value={guide.card_ev_threshold} onChange={(e) => setGuideField('card_ev_threshold', e.target.value)} required placeholder="6+ lit letters on Reels 1–3" />
              </div>
              <div>
                <label className={labelClass}>Hero image (required → hero.webp)</label>
                <input type="file" accept="image/*" className={inputClass} onChange={(e) => setHeroFile(e.target.files?.[0] || null)} required />
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">Guide sections</h2>
            {[
              ['when_to_play', 'When to play'],
              ['when_to_stop', 'When to stop'],
              ['how_to_check', 'How to check'],
              ['risk_bankroll', 'Risk — bankroll line (e.g. 5–40 units)'],
              ['risk_summary', 'Risk — summary paragraph'],
              ['skins_markdown', 'Skins (optional markdown; use [Title](guide:other-slug))'],
              ['gameplay_mechanics', 'Gameplay mechanics'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <textarea
                  className={`${inputClass} min-h-28`}
                  value={guide[key]}
                  onChange={(e) => setGuideField(key, e.target.value)}
                  required={!['skins_markdown', 'risk_bankroll'].includes(key)}
                />
              </div>
            ))}
            <div>
              <label className={labelClass}>Risk bullets (one per line, optional)</label>
              <textarea className={`${inputClass} min-h-24`} value={guide.risk_bullets} onChange={(e) => setGuideField('risk_bullets', e.target.value)} />
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Diagrams</h2>
              <button type="button" className="text-sm text-cyan-300 hover:underline" onClick={addDiagram}>
                + Add diagram
              </button>
            </div>
            {diagrams.length === 0 ? (
              <p className="text-sm text-gray-500">Optional. Each diagram is converted to WebP and embedded in guide.md.</p>
            ) : null}
            {diagrams.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-800 p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Diagram</span>
                  <button type="button" className="text-xs text-red-400" onClick={() => removeDiagram(d.id)}>
                    Remove
                  </button>
                </div>
                <input type="file" accept="image/*" className={inputClass} onChange={(e) => updateDiagram(d.id, { file: e.target.files?.[0] || null })} />
                <input className={inputClass} placeholder="Alt text" value={d.alt} onChange={(e) => updateDiagram(d.id, { alt: e.target.value })} />
                <input className={inputClass} placeholder="Filename" value={d.filename} onChange={(e) => updateDiagram(d.id, { filename: e.target.value })} />
                <select className={inputClass} value={d.placement} onChange={(e) => updateDiagram(d.id, { placement: e.target.value })}>
                  {PLACEMENTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          {result ? (
            <pre className="text-xs bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-12 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-bold text-lg"
          >
            {busy ? 'Ingesting…' : 'Ingest guide'}
          </button>
        </form>
      </div>
    </div>
  )
}
