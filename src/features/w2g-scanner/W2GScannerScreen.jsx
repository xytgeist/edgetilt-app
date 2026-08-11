import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Download, Share2, RefreshCw, ScanLine, SlidersHorizontal } from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import {
  autoScanDocument,
  canvasToPngFile,
  defaultInsetCorners,
  downloadScanPng,
  extractWithCorners,
  loadImageCanvasFromFile,
  presentPrettyScan,
  shareOrDownloadScan,
} from './w2gScanPipeline.js'

/**
 * Pretty-picture W-2G scanner: capture → auto-crop/center → save/share.
 * Local-only; no OCR / no upload.
 */
export default function W2GScannerScreen({
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
}) {
  const cameraInputRef = useRef(null)
  const libraryInputRef = useRef(null)
  const editorHostRef = useRef(null)
  const editorRef = useRef(null)
  const sourceCanvasRef = useRef(null)

  const [phase, setPhase] = useState('idle') // idle | scanning | adjust | result
  const [resultCanvas, setResultCanvas] = useState(null)
  const [resultPreviewUrl, setResultPreviewUrl] = useState(null)
  const [statusNote, setStatusNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const probe = new File([new Uint8Array([137, 80, 78, 71])], 'probe.png', { type: 'image/png' })
        const ok = typeof navigator !== 'undefined' && Boolean(navigator.canShare?.({ files: [probe] }))
        if (!cancelled) setCanNativeShare(ok)
      } catch {
        if (!cancelled) setCanNativeShare(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      editorRef.current?.destroy?.()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    let revoked = false
    let url = null
    if (!resultCanvas) {
      setResultPreviewUrl(null)
      return undefined
    }
    void resultCanvas.toBlob((blob) => {
      if (revoked || !blob) return
      url = URL.createObjectURL(blob)
      setResultPreviewUrl(url)
    }, 'image/png')
    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [resultCanvas])

  const clearEditor = useCallback(() => {
    editorRef.current?.destroy?.()
    editorRef.current = null
    if (editorHostRef.current) editorHostRef.current.innerHTML = ''
  }, [])

  const resetAll = useCallback(() => {
    clearEditor()
    sourceCanvasRef.current = null
    setResultCanvas(null)
    setStatusNote('')
    setError('')
    setBusy(false)
    setPhase('idle')
  }, [clearEditor])

  const finishPretty = useCallback(async (docCanvas, note) => {
    const pretty = presentPrettyScan(docCanvas)
    setResultCanvas(pretty)
    setStatusNote(note || '')
    setPhase('result')
    setBusy(false)
    try {
      const file = await canvasToPngFile(pretty, 'probe-share.png')
      setCanNativeShare(Boolean(navigator.canShare?.({ files: [file] })))
    } catch {
      /* keep prior */
    }
  }, [])

  const openAdjust = useCallback(
    async (source, corners) => {
      clearEditor()
      setPhase('adjust')
      setBusy(false)
      setError('')
      setStatusNote('Drag the corners to the W-2G edges, then Apply.')

      // Wait a frame so the host is mounted.
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const host = editorHostRef.current
      if (!host) {
        setError('Could not open corner editor.')
        setPhase('idle')
        return
      }

      const { createCornerEditor } = await import('scanic')
      const initial = corners || defaultInsetCorners(source.width, source.height)
      editorRef.current = createCornerEditor({
        container: host,
        image: source,
        corners: initial,
        magnifier: { enabled: true, zoom: 2.2, size: 112 },
        toolbar: {
          enabled: true,
          labels: { reset: 'Reset', cancel: 'Cancel', apply: 'Apply' },
        },
        theme: {
          accent: '#22d3ee',
          mask: 'rgba(9, 9, 11, 0.55)',
          surface: '#18181b',
          surfaceColor: '#fafafa',
          radius: '14px',
        },
        onCancel: () => {
          resetAll()
        },
        onConfirm: (nextCorners) => {
          void (async () => {
            setBusy(true)
            setError('')
            try {
              const extracted = await extractWithCorners(source, nextCorners)
              if (!extracted?.success || !extracted.output) {
                throw new Error(extracted?.message || 'Could not crop that frame.')
              }
              clearEditor()
              await finishPretty(/** @type {HTMLCanvasElement} */ (extracted.output), 'Manual crop')
            } catch (err) {
              setBusy(false)
              setError(err?.message || 'Crop failed.')
            }
          })()
        },
      })
    },
    [clearEditor, finishPretty, resetAll],
  )

  const processFile = useCallback(
    async (file) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
        setError('Pick a photo of the W-2G.')
        return
      }
      clearEditor()
      setError('')
      setResultCanvas(null)
      setBusy(true)
      setPhase('scanning')
      setStatusNote('Finding the form…')

      try {
        const source = await loadImageCanvasFromFile(file)
        sourceCanvasRef.current = source
        const { result, detector } = await autoScanDocument(source)
        if (result?.success && result.output) {
          const label = detector === 'ml' ? 'Auto crop (ML)' : 'Auto crop'
          await finishPretty(/** @type {HTMLCanvasElement} */ (result.output), label)
          return
        }
        await openAdjust(source, result?.corners || null)
      } catch (err) {
        setBusy(false)
        setPhase('idle')
        setError(err?.message || 'Scan failed. Try another photo.')
      }
    },
    [clearEditor, finishPretty, openAdjust],
  )

  const onPickFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void processFile(file)
  }

  const onAdjustFromResult = () => {
    const source = sourceCanvasRef.current
    if (!source) return
    void openAdjust(source, null)
  }

  const onDownload = async () => {
    if (!resultCanvas) return
    setBusy(true)
    try {
      await downloadScanPng(resultCanvas)
    } catch (err) {
      setError(err?.message || 'Download failed.')
    } finally {
      setBusy(false)
    }
  }

  const onShare = async () => {
    if (!resultCanvas) return
    setBusy(true)
    try {
      await shareOrDownloadScan(resultCanvas)
    } catch (err) {
      setError(err?.message || 'Share failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      titleBarToolCloseVisible={titleBarToolCloseVisible}
      contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      <div data-w2g-scanner className="space-y-5">
        <div>
          <div className="text-white text-2xl font-black tracking-tight">W-2G Scanner</div>
          <div className="text-zinc-400 text-sm mt-0.5">
            Snap the form… we auto-crop, straighten, and center it. Pretty picture only (no OCR).
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            data-w2g-alert
          >
            {error}
          </div>
        ) : null}

        {phase === 'idle' || phase === 'scanning' ? (
          <div className="space-y-3" data-w2g-capture>
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              className="flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-5 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-60"
              data-w2g-primary
            >
              <span
                aria-hidden
                className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                style={{ '--tc': '#fbbf24' }}
              >
                <Camera size={22} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-white">Take photo</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  Use the rear camera when you can
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => libraryInputRef.current?.click()}
              className="flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-5 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              <span
                aria-hidden
                className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                style={{ '--tc': '#a78bfa' }}
              >
                <ImagePlus size={22} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-white">Choose from library</span>
                <span className="mt-0.5 block text-sm text-zinc-500">Any clear photo of the W-2G</span>
              </span>
            </button>

            {phase === 'scanning' ? (
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/80 px-4 py-3 text-sm text-zinc-300">
                <ScanLine className="h-4 w-4 shrink-0 animate-pulse text-amber-300" aria-hidden />
                <span>{statusNote || 'Scanning…'}</span>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-500 px-1">
                Tip: fill the frame, avoid heavy glare, and keep all four edges visible. Processing stays on
                your device.
              </p>
            )}
          </div>
        ) : null}

        {phase === 'adjust' ? (
          <div className="space-y-3" data-w2g-adjust>
            <div className="text-sm text-zinc-400">{statusNote}</div>
            <div
              ref={editorHostRef}
              className="min-h-[280px] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
              data-w2g-editor-host
            />
            {busy ? <div className="text-sm text-zinc-400">Cropping…</div> : null}
          </div>
        ) : null}

        {phase === 'result' && resultCanvas ? (
          <div className="space-y-4" data-w2g-result>
            {statusNote ? <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{statusNote}</div> : null}
            <div className="overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-zinc-800" data-w2g-preview>
              {resultPreviewUrl ? (
                <img
                  src={resultPreviewUrl}
                  alt="Cropped W-2G"
                  className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
                />
              ) : (
                <div className="grid min-h-[200px] place-items-center text-sm text-zinc-500">Preparing preview…</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDownload()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
              >
                <Download size={16} strokeWidth={1.75} aria-hidden />
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onShare()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-700 px-3 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
                data-w2g-share
              >
                <Share2 size={16} strokeWidth={1.75} aria-hidden />
                {canNativeShare ? 'Share' : 'Export'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onAdjustFromResult}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-60"
              >
                <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
                Adjust
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={resetAll}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-60"
              >
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
                New scan
              </button>
            </div>
          </div>
        ) : null}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickFile}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
