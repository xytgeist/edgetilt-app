import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import DateWheelPicker from '../../components/DateWheelPicker.jsx'
import TimeWheelPicker from '../../components/TimeWheelPicker.jsx'
import CasinoAutocomplete from '../../components/CasinoAutocomplete.jsx'
import { resolveDefaultCaptureCasino } from '../../utils/nearbyCasinos.js'
import {
  formatMetricValue,
  metricDefMap,
  sortMetricSlugs,
  templatesSorted,
  valuesForStorage,
} from './playLogMetrics.js'
import { analyzePlayLogEntries } from './playLogAnalysis.js'

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
  for (const s of metricSlugs) o[s] = ''
  return o
}

export default function PlayLogbook({ supabaseClient, titleBarNavSlot = null, onBackToSlotsHub = null }) {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)

  const [activeTab, setActiveTab] = useState('log')
  const [metricDefs, setMetricDefs] = useState([])
  const [templates, setTemplates] = useState([])
  const [entries, setEntries] = useState([])

  const [sheet, setSheet] = useState(null)
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

  const filteredAnalyzeEntries = useMemo(() => {
    if (!analyzeTemplate) return []
    return entries.filter(e => e.template_id === analyzeTemplate.id)
  }, [entries, analyzeTemplate])

  const analysisStats = useMemo(() => {
    if (!analyzeTemplate) return []
    return analyzePlayLogEntries(filteredAnalyzeEntries, analyzeTemplate.metric_slugs || [])
  }, [filteredAnalyzeEntries, analyzeTemplate])

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

      const [defsRes, tplRes, entRes] = await Promise.all([
        supabaseClient.from('play_log_metric_defs').select('*').order('sort_order'),
        supabaseClient.from('play_log_game_templates').select('*').order('display_name'),
        supabaseClient
          .from('play_log_entries')
          .select('*')
          .order('captured_at', { ascending: false })
          .limit(200),
      ])

      if (defsRes.error?.code === '42P01' || tplRes.error?.code === '42P01' || entRes.error?.code === '42P01') {
        setSchemaMissing(true)
        return
      }
      if (defsRes.error) throw defsRes.error
      if (tplRes.error) throw tplRes.error
      if (entRes.error) throw entRes.error

      setMetricDefs(defsRes.data || [])
      setTemplates(tplRes.data || [])
      setEntries(entRes.data || [])
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
    setError('')
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

  const openLogPlay = (templateId = '') => {
    const tid = templateId || sortedTemplates[0]?.id || ''
    setSelectedTemplateId(tid)
    const tpl = tid ? templateById[tid] : null
    setFormFields(emptyFormFields(tpl?.metric_slugs || []))
    setCaptureCasino('')
    setCaptureNotes('')
    setCaptureDate(localYmd())
    const d = new Date()
    setCaptureTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setNearbyCasinos([])
    setGpsLoading(false)
    setSheet('logPlay')
    setError('')
    populateCaptureCasino()
  }

  const openCreateTemplate = () => {
    setCustomName('')
    setCustomMetrics(new Set(['bet_size', 'spin_count', 'money_in', 'money_out']))
    setSheet('createTemplate')
    setError('')
  }

  const onTemplateChange = (tid) => {
    setSelectedTemplateId(tid)
    const tpl = templateById[tid]
    setFormFields(emptyFormFields(tpl?.metric_slugs || []))
  }

  const saveEntry = async () => {
    if (!userId || !selectedTemplate) return
    setSaving(true)
    setError('')
    try {
      const slugs = selectedTemplate.metric_slugs || []
      const stored = valuesForStorage(formFields, slugs, defsMap)
      if (!Object.keys(stored).length) {
        setError('Enter at least one metric value.')
        setSaving(false)
        return
      }
      const { error: e } = await supabaseClient.from('play_log_entries').insert({
        user_id: userId,
        template_id: selectedTemplate.id,
        captured_at: localDateTimeToIso(captureDate, captureTime),
        casino_name: captureCasino.trim() || null,
        notes: captureNotes.trim() || null,
        values: stored,
      })
      if (e) throw e
      closeSheet()
      await loadAll()
    } catch (e) {
      setError(e?.message || 'Failed to save entry')
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
    if (customMetrics.size === 0) {
      setError('Select at least one metric.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const metric_slugs = sortMetricSlugs([...customMetrics], defsMap)
      const { data, error: e } = await supabaseClient
        .from('play_log_game_templates')
        .insert({
          user_id: userId,
          display_name: name,
          metric_slugs,
          is_system: false,
        })
        .select('*')
        .single()
      if (e) throw e
      closeSheet()
      await loadAll()
      if (data?.id) openLogPlay(data.id)
    } catch (e) {
      setError(e?.message || 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Delete this log entry?')) return
    setError('')
    try {
      const { error: e } = await supabaseClient.from('play_log_entries').delete().eq('id', entryId)
      if (e) throw e
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

  const allMetricSlugsSorted = useMemo(
    () => sortMetricSlugs(Object.keys(defsMap), defsMap),
    [defsMap],
  )

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div data-play-logbook>
        <SlotsToolPageHeader onBackToSlotsHub={onBackToSlotsHub} quickLinkDestinationId="logbook" />
        <div className="mb-5">
          <div className="text-white text-2xl font-black tracking-tight">Play Logbook</div>
          <div className="text-zinc-400 text-sm mt-0.5">Capture AP slot data · analyze later</div>
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
            Apply <code className="text-cyan-300">supabase/play_logbook.sql</code> (or migration{' '}
            <code className="text-cyan-300">20260529120000_play_logbook.sql</code>) on your Supabase test project, then refresh.
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
                  const slugs = sortMetricSlugs(tpl?.metric_slugs || Object.keys(entry.values || {}), defsMap).slice(0, 4)
                  return (
                    <div
                      key={entry.id}
                      className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4"
                      data-play-logbook-card
                      data-play-logbook-entry
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-white font-bold truncate">{tpl?.display_name || 'Unknown game'}</div>
                          <div className="text-zinc-500 text-xs mt-0.5">{fmtCapturedAt(entry.captured_at)}</div>
                          {entry.casino_name ? (
                            <div className="text-zinc-400 text-xs mt-0.5 truncate">{entry.casino_name}</div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          className="shrink-0 text-zinc-500 text-xs font-semibold touch-manipulation active:text-red-400 px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {slugs.map(slug => (
                          <span
                            key={slug}
                            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-xs"
                          >
                            <span className="text-zinc-500">{defsMap[slug]?.label || slug}:</span>
                            <span className="text-zinc-200 font-semibold tabular-nums">
                              {formatMetricValue(entry.values?.[slug], defsMap[slug]?.value_type || 'decimal')}
                            </span>
                          </span>
                        ))}
                      </div>
                      {entry.notes ? (
                        <p className="text-zinc-400 text-xs mt-2 line-clamp-2">{entry.notes}</p>
                      ) : null}
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
                        <div className="text-zinc-500 text-xs">{t.metric_slugs?.length || 0} metrics</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openLogPlay(t.id)}
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
              <select
                value={analyzeTemplate?.id || ''}
                onChange={e => setAnalyzeTemplateId(e.target.value)}
                className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                {sortedTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
            </div>

            {filteredAnalyzeEntries.length === 0 ? (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800/60 p-6 text-center" data-play-logbook-card>
                <div className="text-zinc-400 text-sm">No entries for this game yet.</div>
              </div>
            ) : (
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
            )}
          </>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={closeSheet}>
          <div
            data-play-logbook-sheet
            className="w-full max-w-lg mx-auto rounded-t-3xl bg-zinc-900 border-t border-zinc-700/50 px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] min-h-[55vh] max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {sheet === 'logPlay' && selectedTemplate && (
              <>
                <SheetHeader title="Log Play" onClose={closeSheet} />
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Game</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => onTemplateChange(e.target.value)}
                      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                    >
                      {sortedTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Date</label>
                      <DateWheelPicker value={captureDate} onChange={setCaptureDate} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs mb-1.5">Time</label>
                      <TimeWheelPicker value={captureTime} onChange={setCaptureTime} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Casino / location (optional)</label>
                    <CasinoAutocomplete
                      value={captureCasino}
                      onChange={setCaptureCasino}
                      supabaseClient={supabaseClient}
                      nearbyCasinos={nearbyCasinos}
                      gpsLoading={gpsLoading}
                    />
                  </div>
                  {sortMetricSlugs(selectedTemplate.metric_slugs || [], defsMap).map(slug => {
                    const def = defsMap[slug]
                    if (!def) return null
                    return (
                      <div key={slug}>
                        <label className="block text-zinc-400 text-xs mb-1.5">{def.label}</label>
                        <MetricFieldInput
                          value={formFields[slug] ?? ''}
                          onChange={v => setFormFields(p => ({ ...p, [slug]: v }))}
                          valueType={def.value_type}
                        />
                      </div>
                    )
                  })}
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1.5">Notes (optional)</label>
                    <textarea
                      value={captureNotes}
                      onChange={e => setCaptureNotes(e.target.value)}
                      rows={2}
                      placeholder="Machine bank, observations…"
                      className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40 resize-none"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <button
                  type="button"
                  onClick={saveEntry}
                  disabled={saving}
                  className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Entry'}
                </button>
              </>
            )}

            {sheet === 'createTemplate' && (
              <>
                <SheetHeader title="Create Game Template" onClose={closeSheet} />
                <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                  Name your game and pick which metrics to capture each time you log a play.
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
                  <label className="block text-zinc-400 text-xs mb-2">Metrics</label>
                  <div className="flex flex-wrap gap-2">
                    {allMetricSlugsSorted.map(slug => {
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
    </ScrollLinkedEdgeTitleBarShell>
  )
}

function MetricFieldInput({ value, onChange, valueType }) {
  if (valueType === 'money') {
    return (
      <div className="relative">
        <span className="absolute top-1/2 -translate-y-1/2 left-4 text-zinc-400 font-semibold pointer-events-none">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))}
          className="w-full min-h-12 rounded-2xl bg-zinc-800 pl-8 pr-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
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
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
    />
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
