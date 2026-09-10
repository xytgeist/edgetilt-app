import { useCallback, useEffect, useRef, useState } from 'react'
import { compressImageFileUnderMaxBytes } from '../../utils/compressImageForUpload.js'
import {
  imageFilesFromClipboardEvent,
  imageFilesFromNavigatorClipboardRead,
} from '../../utils/clipboardImagePaste.js'

function collectImageFiles(fileList) {
  if (!fileList?.length) return []
  return Array.from(fileList).filter((f) => f && String(f.type || '').startsWith('image/'))
}

function makeStagedShot(file) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    file,
    name: file?.name || `screenshot-${id}`,
    url: URL.createObjectURL(file),
  }
}

function revokeStagedUrls(shots) {
  for (const s of shots || []) {
    if (s?.url) URL.revokeObjectURL(s.url)
  }
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

function mergePreviewTeams(existing, incoming) {
  const map = new Map()
  for (const t of existing) map.set(t.team_abbr, t)
  for (const t of incoming) map.set(t.team_abbr, t)
  return [...map.values()].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr))
}

/**
 * Paste ESPN team win-rate screenshots, review 32 rows, write PBWR/PRWR/RBWR/RSWR.
 */
export default function BotTrenchScreenshotIngest({ supabaseClient, teams, setToast, onApplied }) {
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [applying, setApplying] = useState(false)
  const [pasteArmed, setPasteArmed] = useState(false)
  const [stagedShots, setStagedShots] = useState([])
  const [previewTeams, setPreviewTeams] = useState([])
  const [unmatched, setUnmatched] = useState([])
  const [through, setThrough] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const fileRef = useRef(null)
  const dropZoneRef = useRef(null)

  const focusPasteZone = useCallback(() => {
    dropZoneRef.current?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => focusPasteZone(), 50)
    return () => window.clearTimeout(t)
  }, [focusPasteZone])

  useEffect(() => {
    return () => {
      revokeStagedUrls(stagedShots)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, [])

  const clearStaged = useCallback(() => {
    setStagedShots((prev) => {
      revokeStagedUrls(prev)
      return []
    })
    queueMicrotask(() => focusPasteZone())
  }, [focusPasteZone])

  const removeStaged = useCallback((id) => {
    setStagedShots((prev) => {
      const doomed = prev.find((s) => s.id === id)
      if (doomed?.url) URL.revokeObjectURL(doomed.url)
      return prev.filter((s) => s.id !== id)
    })
    queueMicrotask(() => focusPasteZone())
  }, [focusPasteZone])

  const addStagedFiles = useCallback((files) => {
    const list = collectImageFiles(files)
    if (!list.length) {
      if (files?.length) setToast?.({ message: 'No image files found in that paste/drop.', isError: true })
      return 0
    }
    const next = list.map(makeStagedShot)
    setStagedShots((prev) => {
      const total = prev.length + next.length
      setToast?.({
        message:
          total === next.length
            ? `Queued ${next.length} … keep Ctrl+V for more, or Process all.`
            : `Queued ${total} total … keep Ctrl+V or Process all.`,
        isError: false,
      })
      return [...prev, ...next]
    })
    queueMicrotask(() => focusPasteZone())
    return next.length
  }, [setToast, focusPasteZone])

  const handleDropZonePaste = useCallback(async (e) => {
    e.preventDefault()
    let files = imageFilesFromClipboardEvent(e)
    if (!files.length) files = await imageFilesFromNavigatorClipboardRead()
    addStagedFiles(files)
  }, [addStagedFiles])

  const parseOneScreenshot = useCallback(async (file) => {
    const { file: prepared, error: compressErr } = await compressImageFileUnderMaxBytes(
      file,
      3.5 * 1024 * 1024,
    )
    if (compressErr || !prepared) throw compressErr || new Error('Could not prepare image.')

    const imageBase64 = await blobToBase64(prepared)
    const mimeType = prepared.type || 'image/jpeg'
    const { data, error } = await supabaseClient.functions.invoke('syndicate-trench-vision', {
      body: { imageBase64, mimeType },
    })
    if (error) throw new Error(error.message || 'Vision extract failed')
    if (data?.error) throw new Error(String(data.error))

    const rows = Array.isArray(data?.teams) ? data.teams : []
    const mapped = rows.map((t) => ({
      team_abbr: t.team_abbr,
      team_name: t.team_name,
      prwr: t.prwr,
      rswr: t.rswr,
      pbwr: t.pbwr,
      rbwr: t.rbwr,
      selected: true,
      from_file: file?.name || 'paste',
    }))
    return {
      mapped,
      unmatched: Array.isArray(data?.unmatched) ? data.unmatched : [],
      through: data?.through || null,
      confidence: typeof data?.confidence === 'number' ? Math.round(data.confidence * 100) : null,
    }
  }, [supabaseClient])

  const processStaged = useCallback(async () => {
    if (!supabaseClient || !stagedShots.length) {
      setToast?.({ message: 'Click the box, Ctrl+V a screenshot first.', isError: true })
      return
    }
    setScanning(true)
    setScanProgress({ done: 0, total: stagedShots.length, label: stagedShots[0]?.name || '' })
    const merged = []
    const missed = []
    let lastThrough = null
    let lastConf = null
    try {
      for (let i = 0; i < stagedShots.length; i += 1) {
        const shot = stagedShots[i]
        setScanProgress({ done: i, total: stagedShots.length, label: shot.name })
        const result = await parseOneScreenshot(shot.file)
        merged.push(...result.mapped)
        missed.push(...result.unmatched)
        if (result.through) lastThrough = result.through
        if (result.confidence != null) lastConf = result.confidence
      }
      const next = mergePreviewTeams([], merged)
      setPreviewTeams(next)
      setUnmatched([...new Set(missed)])
      setThrough(lastThrough)
      setConfidence(lastConf)
      if (!next.length) {
        setToast?.({ message: 'No team rows read. Crop to the NFL team win rate table.', isError: true })
      } else {
        setToast?.({
          message: `Read ${next.length}/32 teams${lastThrough ? ` · ${lastThrough}` : ''}. Review, then Apply.`,
          isError: false,
        })
      }
    } catch (err) {
      console.error('Trench vision failed:', err)
      setToast?.({ message: err?.message || 'Vision extract failed', isError: true })
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }, [parseOneScreenshot, setToast, stagedShots, supabaseClient])

  const toggleRow = (abbr) => {
    setPreviewTeams((prev) =>
      prev.map((t) => (t.team_abbr === abbr ? { ...t, selected: !t.selected } : t)),
    )
  }

  const setPreviewField = (abbr, field, value) => {
    setPreviewTeams((prev) =>
      prev.map((t) => (t.team_abbr === abbr ? { ...t, [field]: value } : t)),
    )
  }

  const applySelected = useCallback(async () => {
    const selected = previewTeams.filter((t) => t.selected)
    if (!selected.length) {
      setToast?.({ message: 'Select at least one team row.', isError: true })
      return
    }
    const byAbbr = new Map((teams || []).map((t) => [t.team_abbr, t]))
    const skipped = []
    const toWrite = []
    for (const row of selected) {
      const existing = byAbbr.get(row.team_abbr)
      if (!existing) {
        skipped.push(`${row.team_abbr} (not in table)`)
        continue
      }
      if (existing.is_custom_override) {
        skipped.push(`${row.team_abbr} (custom override)`)
        continue
      }
      const pbwr = Number(row.pbwr)
      const prwr = Number(row.prwr)
      const rbwr = Number(row.rbwr)
      const rswr = Number(row.rswr)
      if ([pbwr, prwr, rbwr, rswr].some((n) => !Number.isFinite(n))) {
        skipped.push(`${row.team_abbr} (bad number)`)
        continue
      }
      toWrite.push({
        id: existing.id,
        team_abbr: row.team_abbr,
        pass_block_win_rate: pbwr,
        pass_rush_win_rate: prwr,
        run_block_win_rate: rbwr,
        run_stop_win_rate: rswr,
      })
    }
    if (!toWrite.length) {
      setToast?.({ message: `Nothing to write. ${skipped.join('; ')}`, isError: true })
      return
    }

    setApplying(true)
    try {
      const now = new Date().toISOString()
      for (const row of toWrite) {
        const { error } = await supabaseClient
          .from('nfl_team_metrics')
          .update({
            pass_block_win_rate: row.pass_block_win_rate,
            pass_rush_win_rate: row.pass_rush_win_rate,
            run_block_win_rate: row.run_block_win_rate,
            run_stop_win_rate: row.run_stop_win_rate,
            updated_at: now,
          })
          .eq('id', row.id)
        if (error) throw error
      }
      const extra = skipped.length ? ` Skipped ${skipped.join(', ')}.` : ''
      setToast?.({
        message: `Wrote ${toWrite.length} trench rows.${extra}`,
        isError: false,
      })
      setPreviewTeams([])
      clearStaged()
      onApplied?.()
    } catch (err) {
      console.error('Trench apply failed:', err)
      setToast?.({ message: err?.message || 'Apply failed', isError: true })
    } finally {
      setApplying(false)
    }
  }, [clearStaged, onApplied, previewTeams, setToast, supabaseClient, teams])

  return (
    <div
      data-trench-ingest
      className="mt-3 rounded-lg border border-dashed border-indigo-700/50 bg-indigo-950/15 p-4"
    >
      <div
        ref={dropZoneRef}
        tabIndex={0}
        role="region"
        aria-label="Paste ESPN trench screenshots with Control V"
        className={`rounded-lg border border-dashed px-4 py-5 outline-none transition ${
          pasteArmed
            ? 'border-indigo-400 bg-indigo-950/40 ring-2 ring-indigo-500/40'
            : 'border-indigo-700/40 bg-zinc-950/40 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/30'
        }`}
        onFocus={() => setPasteArmed(true)}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return
          setPasteArmed(false)
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || e.target?.closest?.('[data-paste-surface]')) {
            focusPasteZone()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          addStagedFiles(e.dataTransfer?.files)
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
            addStagedFiles(e.target.files)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        <div data-paste-surface className="text-center cursor-text" onClick={() => focusPasteZone()}>
          <p className="text-sm font-semibold text-indigo-200">
            {scanning
              ? (scanProgress
                ? `Reading ${scanProgress.done + 1}/${scanProgress.total}… ${scanProgress.label}`
                : 'Reading screenshots…')
              : pasteArmed
                ? 'Ready … Ctrl+V ESPN team table (repeat if split), then Process'
                : 'Paste ESPN team win-rate screenshot'}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 max-w-xl mx-auto">
            Crop to <span className="text-zinc-300">NFL team win rate rankings</span> (all 32).
            Player leaderboards get ignored. Two shots if the table is scrolled.
            Writes PBWR / PRWR / RBWR / RSWR only … EPA stays.
          </p>
        </div>

        {stagedShots.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {stagedShots.map((s, idx) => (
              <div
                key={s.id}
                className="relative w-24 rounded-md border border-zinc-700 bg-zinc-950/80 overflow-hidden"
              >
                <img src={s.url} alt={s.name} className="h-16 w-full object-cover object-top" />
                <div className="px-1 py-0.5 text-[9px] text-zinc-400 truncate">#{idx + 1}</div>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => removeStaged(s.id)}
                  className="absolute top-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] text-zinc-200 hover:text-white disabled:opacity-40"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={scanning || !stagedShots.length}
            onClick={() => void processStaged()}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
          >
            {scanning
              ? 'Processing…'
              : stagedShots.length
                ? `Process all (${stagedShots.length})`
                : 'Process'}
          </button>
          <button
            type="button"
            disabled={scanning || !stagedShots.length}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white"
          >
            Add files
          </button>
          {stagedShots.length > 0 && (
            <button
              type="button"
              disabled={scanning}
              onClick={clearStaged}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-200"
            >
              Clear queue
            </button>
          )}
        </div>
      </div>

      {previewTeams.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-zinc-400">
              Review {previewTeams.filter((t) => t.selected).length}/{previewTeams.length}
              {through ? ` · ${through}` : ''}
              {confidence != null ? ` · ${confidence}% conf` : ''}
              {previewTeams.length < 32 ? ` · missing ${32 - previewTeams.length}` : ''}
            </p>
            <button
              type="button"
              disabled={applying}
              onClick={() => void applySelected()}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
            >
              {applying ? 'Writing…' : 'Apply selected to board'}
            </button>
          </div>
          {unmatched.length > 0 && (
            <p className="mb-2 text-[11px] text-amber-400/90">
              Unmatched labels: {unmatched.join(', ')}
            </p>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
            <table className="w-full text-left text-[11px] font-mono">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-1.5"> </th>
                  <th className="px-2 py-1.5">Team</th>
                  <th className="px-2 py-1.5">PRWR</th>
                  <th className="px-2 py-1.5">RSWR</th>
                  <th className="px-2 py-1.5">PBWR</th>
                  <th className="px-2 py-1.5">RBWR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {previewTeams.map((t) => (
                  <tr key={t.team_abbr} className={t.selected ? '' : 'opacity-40'}>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={() => toggleRow(t.team_abbr)}
                      />
                    </td>
                    <td className="px-2 py-1 text-white">
                      {t.team_abbr}
                      <span className="ml-1 text-zinc-500 font-sans">{t.team_name}</span>
                    </td>
                    {['prwr', 'rswr', 'pbwr', 'rbwr'].map((field) => (
                      <td key={field} className="px-2 py-1">
                        <input
                          type="number"
                          step="1"
                          value={t[field]}
                          onChange={(e) => setPreviewField(t.team_abbr, field, e.target.value)}
                          className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-white"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
