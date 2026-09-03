import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compressImageFileUnderMaxBytes } from '../../utils/compressImageForUpload.js'
import {
  imageFilesFromClipboardEvent,
  imageFilesFromNavigatorClipboardRead,
} from '../../utils/clipboardImagePaste.js'

const SPORT_OPTIONS = [
  { id: 'americanfootball_ncaaf', label: 'CFB' },
  { id: 'americanfootball_nfl', label: 'NFL' },
]

const SOURCE_OPTIONS = [
  { id: 'action_pro', label: 'Action PRO' },
  { id: 'vsin_pro', label: 'VSiN Pro' },
  { id: 'manual', label: 'Manual / other' },
]

const emptyForm = () => ({
  sport_key: 'americanfootball_ncaaf',
  away_team: '',
  home_team: '',
  commence_time: '',
  event_id: '',
  home_ticket_pct: '',
  home_handle_pct: '',
  over_ticket_pct: '',
  over_handle_pct: '',
  source: 'action_pro',
  notes: '',
})

function clampPct(n) {
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

function sportLabel(sportKey) {
  return sportKey?.includes('ncaaf') ? 'CFB' : 'NFL'
}

function gameMatchKey(sportKey, away, home) {
  return `${sportKey || 'unknown'}::${String(away || '').trim().toLowerCase()}@${String(home || '').trim().toLowerCase()}`
}

/** Later screenshot wins on same sport + matchup (re-shot refresh). */
function mergePreviewGames(existing, incoming) {
  const map = new Map()
  for (const g of existing) {
    map.set(gameMatchKey(g.sport_key, g.away_team, g.home_team), g)
  }
  for (const g of incoming) {
    map.set(gameMatchKey(g.sport_key, g.away_team, g.home_team), g)
  }
  return [...map.values()]
}

function collectImageFiles(fileList) {
  if (!fileList?.length) return []
  return Array.from(fileList).filter((f) => f && String(f.type || '').startsWith('image/'))
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Paste ticket% / handle% from Action PRO or VSiN before slate lock.
 * Preferred: drop board screenshots (multi OK) … vision extracts the slate.
 * Chedda reads these; no scraping.
 */
export default function BotBettingSplitsPaste({ supabaseClient, setToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [previewGames, setPreviewGames] = useState([])
  const [bulkSport, setBulkSport] = useState('americanfootball_nfl')
  const [previewSource, setPreviewSource] = useState('action_pro')
  const [previewConfidence, setPreviewConfidence] = useState(null)
  const fileRef = useRef(null)

  const awayTicket = useMemo(() => {
    const home = clampPct(Number(form.home_ticket_pct))
    return home == null ? null : clampPct(100 - home)
  }, [form.home_ticket_pct])

  const awayHandle = useMemo(() => {
    const home = clampPct(Number(form.home_handle_pct))
    return home == null ? null : clampPct(100 - home)
  }, [form.home_handle_pct])

  const loadRows = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('syndicate_betting_splits')
        .select('*')
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error('Failed to load betting splits:', err)
      setToast?.(`Failed to load splits: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, setToast])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const parseOneScreenshot = useCallback(async (file) => {
    const { file: prepared, error: compressErr } = await compressImageFileUnderMaxBytes(
      file,
      3.5 * 1024 * 1024,
    )
    if (compressErr || !prepared) throw compressErr || new Error('Could not prepare image.')

    const imageBase64 = await blobToBase64(prepared)
    const mimeType = prepared.type || 'image/jpeg'
    const { data, error } = await supabaseClient.functions.invoke('syndicate-splits-vision', {
      body: { imageBase64, mimeType },
    })
    if (error) throw new Error(error.message || 'Vision extract failed')
    if (data?.error) throw new Error(String(data.error))

    const sport_key = data?.sport_key || bulkSport || 'americanfootball_nfl'
    const games = Array.isArray(data?.games) ? data.games : []
    const confidence =
      typeof data?.confidence === 'number' ? Math.round(data.confidence * 100) : null
    const stamp = Date.now()
    const mapped = games.map((g, idx) => ({
      key: `${sport_key}-${g.away_team}-${g.home_team}-${stamp}-${idx}`,
      selected: true,
      sport_key,
      away_team: g.away_team,
      home_team: g.home_team,
      away_ticket_pct: g.away_ticket_pct,
      away_handle_pct: g.away_handle_pct,
      home_ticket_pct: g.home_ticket_pct,
      home_handle_pct: g.home_handle_pct,
      commence_hint: g.commence_hint || '',
      from_file: file?.name || 'paste',
    }))
    return { mapped, confidence, sport_key }
  }, [supabaseClient, bulkSport])

  /** Multi-file / paste / drop … sequential vision, merge into one review table. */
  const handleScreenshots = useCallback(async (files) => {
    const list = collectImageFiles(files)
    if (!supabaseClient || !list.length) {
      if (files?.length) setToast?.('No image files found in that paste/drop.')
      return
    }

    setScanning(true)
    setScanProgress({ done: 0, total: list.length, label: list[0]?.name || 'image' })
    let merged = previewGames
    let confidences = previewConfidence != null ? [previewConfidence] : []
    let okFiles = 0
    let failFiles = 0
    let lastSport = null

    try {
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i]
        setScanProgress({
          done: i,
          total: list.length,
          label: file?.name || `image ${i + 1}`,
        })
        try {
          const { mapped, confidence, sport_key } = await parseOneScreenshot(file)
          if (mapped.length) {
            merged = mergePreviewGames(merged, mapped)
            okFiles += 1
            if (confidence != null) confidences.push(confidence)
            if (sport_key) lastSport = sport_key
          } else {
            failFiles += 1
          }
        } catch (err) {
          console.error('Splits vision failed for file:', file?.name, err)
          failFiles += 1
        }
      }

      setScanProgress({ done: list.length, total: list.length, label: 'done' })
      if (!merged.length || !okFiles) {
        setToast?.('No games read from screenshot(s). Try a tighter crop of the table.')
        return
      }

      if (lastSport) setBulkSport(lastSport)
      setPreviewConfidence(
        confidences.length
          ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          : null,
      )
      setPreviewGames(merged)
      const parts = [
        `Added from ${okFiles} screenshot${okFiles === 1 ? '' : 's'}`,
        `· ${merged.length} game${merged.length === 1 ? '' : 's'} in review`,
      ]
      if (failFiles) parts.push(`(${failFiles} image${failFiles === 1 ? '' : 's'} empty/failed)`)
      setToast?.(`${parts.join(' ')}. Review + save.`)
    } finally {
      setScanning(false)
      setScanProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [supabaseClient, parseOneScreenshot, setToast, previewGames, previewConfidence])

  const handleDropZonePaste = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    let files = imageFilesFromClipboardEvent(e)
    if (!files.length) {
      files = await imageFilesFromNavigatorClipboardRead()
    }
    if (!files.length) {
      setToast?.('Clipboard has no image. Copy a screenshot first (Win+Shift+S), then Ctrl+V here.')
      return
    }
    await handleScreenshots(files)
  }, [handleScreenshots, setToast])

  const handlePasteFromClipboardButton = useCallback(async () => {
    const files = await imageFilesFromNavigatorClipboardRead()
    if (!files.length) {
      setToast?.('No image on clipboard. Screenshot first, click the drop zone, then Ctrl+V … or grant clipboard permission for Paste clipboard.')
      return
    }
    await handleScreenshots(files)
  }, [handleScreenshots, setToast])

  const applyBulkSport = () => {
    setPreviewGames((prev) => prev.map((g) => (g.selected ? { ...g, sport_key: bulkSport } : g)))
  }

  const handleSavePreview = async () => {
    if (!supabaseClient) return
    const selected = previewGames.filter((g) => g.selected)
    if (!selected.length) {
      setToast?.('Select at least one game to save.')
      return
    }
    setSaving(true)
    try {
      const payloads = selected.map((g) => ({
        sport_key: g.sport_key || bulkSport,
        home_team: String(g.home_team || '').trim(),
        away_team: String(g.away_team || '').trim(),
        commence_time: null,
        event_id: null,
        home_ticket_pct: clampPct(Number(g.home_ticket_pct)),
        home_handle_pct: clampPct(Number(g.home_handle_pct)),
        away_ticket_pct: clampPct(Number(g.away_ticket_pct)),
        away_handle_pct: clampPct(Number(g.away_handle_pct)),
        over_ticket_pct: null,
        over_handle_pct: null,
        source: previewSource,
        notes: g.commence_hint
          ? `screenshot · ${g.commence_hint}`
          : 'screenshot board parse',
        active: true,
        updated_at: new Date().toISOString(),
      }))

      let saved = 0
      for (const p of payloads) {
        if (!p.home_team || !p.away_team) continue
        if (
          p.home_ticket_pct == null
          || p.home_handle_pct == null
          || p.away_ticket_pct == null
          || p.away_handle_pct == null
        ) {
          continue
        }
        await supabaseClient
          .from('syndicate_betting_splits')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('sport_key', p.sport_key)
          .eq('home_team', p.home_team)
          .eq('away_team', p.away_team)
          .eq('active', true)

        const { error } = await supabaseClient.from('syndicate_betting_splits').insert(p)
        if (error) throw error
        saved += 1
      }

      setToast?.(`Saved ${saved} split row${saved === 1 ? '' : 's'} for Chedda.`)
      setPreviewGames([])
      setPreviewConfidence(null)
      await loadRows()
    } catch (err) {
      console.error('Bulk save splits failed:', err)
      setToast?.(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (!supabaseClient) return

    const homeTicket = clampPct(Number(form.home_ticket_pct))
    const homeHandle = clampPct(Number(form.home_handle_pct))
    const awayT = awayTicket
    const awayH = awayHandle
    const homeTeam = form.home_team.trim()
    const awayTeam = form.away_team.trim()

    if (!homeTeam || !awayTeam) {
      setToast?.('Home and away team required.')
      return
    }
    if (homeTicket == null || homeHandle == null || awayT == null || awayH == null) {
      setToast?.('Enter home ticket % and home handle % (0-100). Away auto-fills.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        sport_key: form.sport_key,
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: form.commence_time ? new Date(form.commence_time).toISOString() : null,
        event_id: form.event_id.trim() || null,
        home_ticket_pct: homeTicket,
        home_handle_pct: homeHandle,
        away_ticket_pct: awayT,
        away_handle_pct: awayH,
        over_ticket_pct: form.over_ticket_pct !== '' ? clampPct(Number(form.over_ticket_pct)) : null,
        over_handle_pct: form.over_handle_pct !== '' ? clampPct(Number(form.over_handle_pct)) : null,
        source: form.source,
        notes: form.notes.trim() || null,
        active: true,
        updated_at: new Date().toISOString(),
      }

      if (payload.event_id) {
        const { data: existing } = await supabaseClient
          .from('syndicate_betting_splits')
          .select('id')
          .eq('event_id', payload.event_id)
          .eq('active', true)
          .maybeSingle()
        if (existing?.id) {
          const { error } = await supabaseClient
            .from('syndicate_betting_splits')
            .update(payload)
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabaseClient.from('syndicate_betting_splits').insert(payload)
          if (error) throw error
        }
      } else {
        const { error } = await supabaseClient.from('syndicate_betting_splits').insert(payload)
        if (error) throw error
      }

      setToast?.(`Saved splits: ${awayTeam} @ ${homeTeam} (tickets ${homeTicket}/${awayT}, handle ${homeHandle}/${awayH})`)
      setForm(emptyForm())
      await loadRows()
    } catch (err) {
      console.error('Save splits failed:', err)
      setToast?.(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!supabaseClient || !id) return
    try {
      const { error } = await supabaseClient
        .from('syndicate_betting_splits')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      setToast?.('Split row deactivated.')
      await loadRows()
    } catch (err) {
      setToast?.(`Deactivate failed: ${err.message}`)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-zinc-100 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white tracking-wide">
              Chedda splits paste
            </span>
            <span className="rounded bg-amber-950/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-300 ring-1 ring-amber-500/30">
              Action / VSiN
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400 max-w-2xl">
            Paste or drop Action PRO board screenshots (multi OK … NFL + CFB). We read % bets / % money
            with vision, you confirm, then Chedda uses it. Manual single-game form still below.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRows}
          disabled={loading}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div
        tabIndex={0}
        role="button"
        aria-label="Paste or drop Action PRO screenshots"
        className="rounded-lg border border-dashed border-amber-700/50 bg-amber-950/20 px-4 py-5 text-center focus:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void handleScreenshots(e.dataTransfer?.files)
        }}
        onPaste={(e) => {
          void handleDropZonePaste(e)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleScreenshots(e.target.files)
          }}
        />
        <p className="text-sm font-semibold text-amber-200">
          {scanning
            ? (scanProgress
              ? `Reading ${scanProgress.done + 1}/${scanProgress.total}… ${scanProgress.label}`
              : 'Reading screenshot…')
            : 'Click here → Ctrl+V paste · or drop screenshots'}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Win+Shift+S (or any screenshot) → click this box → Ctrl+V. Multi-select upload also works.
          Same matchup on a later shot replaces the earlier row.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handlePasteFromClipboardButton()}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-black transition disabled:opacity-50"
          >
            {scanning ? 'Parsing…' : 'Paste clipboard'}
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-amber-700/60 bg-zinc-950/60 hover:bg-zinc-900 px-4 py-2 text-xs font-bold text-amber-100 transition disabled:opacity-50"
          >
            Choose screenshots
          </button>
        </div>
      </div>

      {previewGames.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-amber-200">
              Review parsed games ({previewGames.length})
              {previewConfidence != null ? (
                <span className="ml-2 text-zinc-500 font-normal">confidence ~{previewConfidence}%</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <select
                value={bulkSport}
                onChange={(e) => setBulkSport(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                title="Sport to apply to checked rows"
              >
                {SPORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkSport}
                className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:text-white"
              >
                Apply sport to checked
              </button>
              <select
                value={previewSource}
                onChange={(e) => setPreviewSource(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={handleSavePreview}
                className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1 font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Save ${previewGames.filter((g) => g.selected).length} to Chedda`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewGames([])
                  setPreviewConfidence(null)
                }}
                className="rounded bg-zinc-800 px-2 py-1 text-zinc-300"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-[10px] text-left">
              <thead className="text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-900">
                <tr>
                  <th className="py-1 pr-1"> </th>
                  <th className="py-1 pr-2">Sport</th>
                  <th className="py-1 pr-2">Away @ Home</th>
                  <th className="py-1 pr-2">Tickets A/H</th>
                  <th className="py-1 pr-2">Handle A/H</th>
                </tr>
              </thead>
              <tbody>
                {previewGames.map((g, idx) => (
                  <tr key={g.key} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-1 pr-1">
                      <input
                        type="checkbox"
                        checked={g.selected}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setPreviewGames((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, selected: checked } : row)),
                          )
                        }}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={g.sport_key || bulkSport}
                        onChange={(e) => {
                          const sport_key = e.target.value
                          setPreviewGames((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, sport_key } : row)),
                          )
                        }}
                        className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-white"
                      >
                        {SPORT_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      {g.away_team} @ {g.home_team}
                      {g.commence_hint ? (
                        <span className="block text-zinc-600">{g.commence_hint}</span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">{g.away_ticket_pct}/{g.home_ticket_pct}</td>
                    <td className="py-1 pr-2 tabular-nums">{g.away_handle_pct}/{g.home_handle_pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 open:pb-2">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
          Manual single-game entry (fallback)
        </summary>
        <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs px-3 pb-3">
          <label className="space-y-1">
            <span className="text-zinc-500">Sport</span>
            <select
              value={form.sport_key}
              onChange={(e) => setField('sport_key', e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            >
              {SPORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Source</span>
            <select
              value={form.source}
              onChange={(e) => setField('source', e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Kickoff (optional)</span>
            <input
              type="datetime-local"
              value={form.commence_time}
              onChange={(e) => setField('commence_time', e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Away team</span>
            <input
              value={form.away_team}
              onChange={(e) => setField('away_team', e.target.value)}
              placeholder="Ohio State"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Home team</span>
            <input
              value={form.home_team}
              onChange={(e) => setField('home_team', e.target.value)}
              placeholder="Texas"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Odds event id (optional)</span>
            <input
              value={form.event_id}
              onChange={(e) => setField('event_id', e.target.value)}
              placeholder="from Odds API if you have it"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Home ticket % (bets)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.home_ticket_pct}
              onChange={(e) => setField('home_ticket_pct', e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Home handle % (money)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.home_handle_pct}
              onChange={(e) => setField('home_handle_pct', e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
              required
            />
          </label>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 space-y-0.5">
            <div className="text-zinc-500">Away auto</div>
            <div className="tabular-nums text-zinc-200">
              tickets {awayTicket != null ? awayTicket : 'n/a'}% · handle {awayHandle != null ? awayHandle : 'n/a'}%
            </div>
          </div>
          <label className="space-y-1 sm:col-span-2 lg:col-span-3">
            <span className="text-zinc-500">Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="e.g. Action PRO · Fri 6pm PT"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-black transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save single game'}
            </button>
          </div>
        </form>
      </details>

      <div className="overflow-x-auto">
        <div className="text-[10px] text-zinc-500 mb-1">Active pastes</div>
        <table className="w-full text-[11px] text-left">
          <thead className="text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="py-1 pr-2">Matchup</th>
              <th className="py-1 pr-2">Sport</th>
              <th className="py-1 pr-2">Tickets H/A</th>
              <th className="py-1 pr-2">Handle H/A</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-900 text-zinc-300">
                <td className="py-1 pr-2">{r.away_team} @ {r.home_team}</td>
                <td className="py-1 pr-2 text-zinc-500">{sportLabel(r.sport_key)}</td>
                <td className="py-1 pr-2 tabular-nums">{r.home_ticket_pct}/{r.away_ticket_pct}</td>
                <td className="py-1 pr-2 tabular-nums">{r.home_handle_pct}/{r.away_handle_pct}</td>
                <td className="py-1 pr-2">{r.source}</td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => handleDeactivate(r.id)}
                    className="text-[10px] text-zinc-500 hover:text-rose-300"
                  >
                    Off
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} className="py-3 text-zinc-500">
                  No pastes yet. Paste or drop Action PRO board screenshots above before slate publish.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
