import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ImagePlus,
  Download,
  Share2,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  Copy,
  ClipboardCheck,
  CloudUpload,
  Trash2,
  Layers,
  Images,
} from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import { PRODUCT_SLOTS_EDGE_STARTER } from '../billing/edgeProducts.js'
import {
  autoScanDocument,
  canvasToPngFile,
  defaultInsetCorners,
  downloadScanPng,
  extractWithCorners,
  flattenCroppedDocument,
  loadImageCanvasFromFile,
  presentPrettyScan,
  shareOrDownloadScan,
} from './w2gScanPipeline.js'
import {
  W2G_FIELD_DEFS,
  fieldsToList,
  formatFieldsForCopy,
  ocrW2G,
  taxYearFromDate,
} from './w2gOcr.js'
import {
  collateW2GSlips,
  deleteW2GSlip,
  formatAllCombineSummaries,
  listW2GSlips,
  saveW2GSlip,
  signedW2GImageUrl,
} from './w2gArchiveApi.js'
import { processW2GImageForArchive } from './w2gBulkImport.js'
import { canvasToVisionJpegBlob, extractW2GFieldsWithVision } from './w2gVisionApi.js'

function moneyLabel(n) {
  return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatIsoDate(iso) {
  if (!iso) return '...'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(iso)
  return `${m[2]}/${m[3]}/${m[1]}`
}

function canvasToJpegBlob(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode slip image.'))
        else resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

/**
 * W-2G tax archive: scan → six TurboTax fields → save image + row → collate by EIN.
 */
export default function W2GScannerScreen({
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  supabaseClient = null,
  onOpenAuth = null,
  /** Slots Edge Starter and up (or staff) … bulk import + AI vision extract. */
  canUseBulkImport = false,
  canUseVisionExtract = false,
  onRequireSubscribe = null,
}) {
  const cameraInputRef = useRef(null)
  const libraryInputRef = useRef(null)
  const bulkInputRef = useRef(null)
  const editorHostRef = useRef(null)
  const editorRef = useRef(null)
  const sourceCanvasRef = useRef(null)
  const flatCanvasRef = useRef(null)
  const ocrSeqRef = useRef(0)
  const ocrConfidenceRef = useRef(null)
  const bulkAbortRef = useRef(/** @type {AbortController | null} */ (null))
  /** @type {{ current: { source: HTMLCanvasElement, corners: any } | null }} */
  const pendingAdjustRef = useRef(null)
  const finishPrettyRef = useRef(/** @type {any} */ (null))
  const resetAllRef = useRef(/** @type {any} */ (null))

  const [mainTab, setMainTab] = useState('scan') // scan | archive
  const [phase, setPhase] = useState('idle') // idle | scanning | adjust | result
  const [resultCanvas, setResultCanvas] = useState(null)
  const [resultPreviewUrl, setResultPreviewUrl] = useState(null)
  const [statusNote, setStatusNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('') // '', loading, ready, error
  const [ocrProgress, setOcrProgress] = useState(0)
  const [fieldList, setFieldList] = useState(() => fieldsToList({}))
  const [copied, setCopied] = useState(false)
  const [hasFlat, setHasFlat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOkNote, setSaveOkNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(/** @type {{ index: number, total: number, fileName: string } | null} */ (null))
  const [bulkSummary, setBulkSummary] = useState(/** @type {{ saved: number, failed: Array<{ fileName: string, error: string }> } | null} */ (null))

  const currentYear = new Date().getFullYear()
  const [taxYear, setTaxYear] = useState(currentYear)
  const [slips, setSlips] = useState([])
  const [thumbUrls, setThumbUrls] = useState(/** @type {Record<string, string>} */ ({}))
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [collateCopied, setCollateCopied] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const collated = useMemo(() => collateW2GSlips(slips), [slips])

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
      ocrSeqRef.current += 1
      bulkAbortRef.current?.abort()
      bulkAbortRef.current = null
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

  const refreshArchive = useCallback(async () => {
    if (!supabaseClient) {
      setSlips([])
      setArchiveError('')
      return
    }
    setArchiveLoading(true)
    setArchiveError('')
    try {
      const rows = await listW2GSlips({ supabase: supabaseClient, taxYear })
      setSlips(rows)
      const urls = {}
      await Promise.all(
        rows.map(async (row) => {
          if (!row.image_path) return
          try {
            urls[row.id] = await signedW2GImageUrl(supabaseClient, row.image_path)
          } catch {
            /* skip broken thumb */
          }
        }),
      )
      setThumbUrls(urls)
    } catch (err) {
      const msg = err?.message || 'Could not load archive.'
      if (/sign in/i.test(msg) || err?.status === 401) {
        setSlips([])
        setArchiveError('Sign in to view your saved W-2Gs.')
      } else {
        setArchiveError(msg)
      }
    } finally {
      setArchiveLoading(false)
    }
  }, [supabaseClient, taxYear])

  useEffect(() => {
    if (mainTab !== 'archive') return
    void refreshArchive()
  }, [mainTab, refreshArchive])

  const clearEditor = useCallback(() => {
    editorRef.current?.destroy?.()
    editorRef.current = null
    if (editorHostRef.current) editorHostRef.current.innerHTML = ''
  }, [])

  const resetAll = useCallback(() => {
    clearEditor()
    ocrSeqRef.current += 1
    ocrConfidenceRef.current = null
    sourceCanvasRef.current = null
    flatCanvasRef.current = null
    setHasFlat(false)
    setResultCanvas(null)
    setStatusNote('')
    setError('')
    setBusy(false)
    setPhase('idle')
    setOcrStatus('')
    setOcrProgress(0)
    setFieldList(fieldsToList({}))
    setCopied(false)
    setSaveOkNote('')
  }, [clearEditor])

  const runOcr = useCallback(async (flatCanvas) => {
    const seq = ++ocrSeqRef.current
    setOcrStatus('loading')
    setOcrProgress(0)
    ocrConfidenceRef.current = null
    setError('')

    const applyFields = (fields, confidence, engineLabel) => {
      if (ocrSeqRef.current !== seq) return
      setFieldList(fieldsToList(fields))
      setOcrStatus('ready')
      ocrConfidenceRef.current = confidence ?? null
      setStatusNote((prev) => {
        const base = String(prev || '')
          .replace(/\s*·\s*(AI|OCR)\s+\d*%?/i, '')
          .trim()
        const tag =
          confidence != null
            ? `${engineLabel} ${Math.round(confidence)}%`
            : engineLabel
        return base ? `${base} · ${tag}` : tag
      })
    }

    // Starter+: OpenAI vision (same class as human/vision read). Tesseract is fallback.
    if (canUseVisionExtract && supabaseClient && flatCanvas) {
      try {
        setOcrProgress(12)
        setStatusNote((prev) => {
          const base = String(prev || '')
            .replace(/\s*·\s*(AI|OCR).*$/i, '')
            .trim()
          return base ? `${base} · AI extract…` : 'AI extract…'
        })
        const imageBlob = await canvasToVisionJpegBlob(flatCanvas)
        if (ocrSeqRef.current !== seq) return
        setOcrProgress(45)
        const vision = await extractW2GFieldsWithVision({
          supabase: supabaseClient,
          imageBlob,
        })
        if (ocrSeqRef.current !== seq) return
        setOcrProgress(100)
        applyFields(vision.fields, vision.confidence, 'AI')
        return
      } catch (err) {
        if (ocrSeqRef.current !== seq) return
        if (err?.code === 'subscribe_required') {
          onRequireSubscribe?.(PRODUCT_SLOTS_EDGE_STARTER)
        }
        // Fall through to on-device OCR.
        setStatusNote((prev) => {
          const base = String(prev || '')
            .replace(/\s*·\s*(AI|OCR).*$/i, '')
            .trim()
          return base ? `${base} · AI missed, local OCR…` : 'AI missed, local OCR…'
        })
      }
    }

    try {
      const { fields, confidence } = await ocrW2G(flatCanvas, {
        onProgress: (pct) => {
          if (ocrSeqRef.current === seq) setOcrProgress(pct)
        },
      })
      applyFields(fields, confidence, 'OCR')
    } catch (err) {
      if (ocrSeqRef.current !== seq) return
      setOcrStatus('error')
      setError(err?.message || 'OCR failed. You can still edit fields and save.')
    }
  }, [canUseVisionExtract, onRequireSubscribe, supabaseClient])

  const finishPretty = useCallback(
    async (docCanvas, note) => {
      setStatusNote('Preparing…')
      const flat = await flattenCroppedDocument(docCanvas)
      flatCanvasRef.current = flat
      setHasFlat(true)
      const pretty = presentPrettyScan(flat)
      setResultCanvas(pretty)
      setStatusNote(note || 'Ready')
      setPhase('result')
      setBusy(false)
      setSaveOkNote('')
      try {
        const file = await canvasToPngFile(pretty, 'probe-share.png')
        setCanNativeShare(Boolean(navigator.canShare?.({ files: [file] })))
      } catch {
        /* keep prior */
      }
      void runOcr(flat)
    },
    [runOcr],
  )

  finishPrettyRef.current = finishPretty
  resetAllRef.current = resetAll

  const openAdjust = useCallback((source, corners, statusOverride = '') => {
    clearEditor()
    pendingAdjustRef.current = { source, corners: corners || null }
    setBusy(false)
    setError('')
    setStatusNote(
      statusOverride ||
        (corners
          ? 'Close… drag the corners onto the form edges, then Apply.'
          : 'Drag each handle to a corner of the W-2G, then Apply.'),
    )
    setPhase('adjust')
  }, [clearEditor])

  useEffect(() => {
    if (phase !== 'adjust') return undefined
    const pending = pendingAdjustRef.current
    if (!pending?.source) return undefined

    let cancelled = false

    const mountEditor = async () => {
      let host = editorHostRef.current
      for (let i = 0; i < 45 && !host && !cancelled; i++) {
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        host = editorHostRef.current
      }
      if (cancelled) return
      if (!host) {
        setError('Could not open corner editor.')
        setPhase('idle')
        return
      }

      try {
        const { createCornerEditor } = await import('scanic')
        if (cancelled || !editorHostRef.current) return
        host = editorHostRef.current
        host.innerHTML = ''
        const source = pending.source
        const initial = pending.corners || defaultInsetCorners(source.width, source.height)
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
            resetAllRef.current?.()
          },
          onConfirm: (nextCorners) => {
            void (async () => {
              setBusy(true)
              setError('')
              try {
                const { result: extracted, cropMode } = await extractWithCorners(source, nextCorners)
                if (!extracted?.success || !extracted.output) {
                  throw new Error(extracted?.message || 'Could not crop that frame.')
                }
                clearEditor()
                pendingAdjustRef.current = null
                const modeLabel = cropMode === 'perspective' ? 'deskewed' : 'cropped'
                await finishPrettyRef.current?.(
                  /** @type {HTMLCanvasElement} */ (extracted.output),
                  `Manual ${modeLabel}`,
                )
              } catch (err) {
                setBusy(false)
                setError(err?.message || 'Crop failed.')
              }
            })()
          },
        })
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not open corner editor.')
          setPhase('idle')
        }
      }
    }

    void mountEditor()
    return () => {
      cancelled = true
      editorRef.current?.destroy?.()
      editorRef.current = null
    }
  }, [phase, clearEditor])

  const processFile = useCallback(
    async (file) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
        setError('Pick a photo of the W-2G.')
        return
      }
      clearEditor()
      ocrSeqRef.current += 1
      setError('')
      setResultCanvas(null)
      setFieldList(fieldsToList({}))
      setOcrStatus('')
      setSaveOkNote('')
      setBusy(true)
      setPhase('scanning')
      setStatusNote('Finding corners…')

      try {
        const source = await loadImageCanvasFromFile(file)
        sourceCanvasRef.current = source
        const { result, detector, cropMode } = await autoScanDocument(source)
        if (result?.success && result.output) {
          const engine = detector === 'ml' ? 'ML' : 'auto'
          const mode = cropMode === 'perspective' ? 'deskew' : 'crop'
          await finishPretty(/** @type {HTMLCanvasElement} */ (result.output), `${engine} ${mode}`)
          return
        }
        openAdjust(
          source,
          result?.corners || null,
          result?.corners
            ? 'Close… drag the corners onto the form edges, then Apply.'
            : 'Couldn’t lock corners… drag the handles to each corner of the W-2G, then Apply.',
        )
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

  const cancelBulkImport = useCallback(() => {
    bulkAbortRef.current?.abort()
  }, [])

  const runBulkImport = useCallback(
    async (files) => {
      const list = [...(files || [])].filter((f) => String(f?.type || '').startsWith('image/'))
      if (!list.length) {
        setError('Pick one or more W-2G photos.')
        return
      }
      if (!canUseBulkImport) {
        onRequireSubscribe?.(PRODUCT_SLOTS_EDGE_STARTER)
        return
      }
      if (!supabaseClient) {
        setError('Archive unavailable.')
        return
      }
      try {
        const { data } = await supabaseClient.auth.getUser()
        if (!data?.user?.id) {
          setError('Sign in to bulk-import W-2Gs.')
          onOpenAuth?.('login')
          return
        }
      } catch {
        setError('Sign in to bulk-import W-2Gs.')
        onOpenAuth?.('login')
        return
      }

      bulkAbortRef.current?.abort()
      const ac = new AbortController()
      bulkAbortRef.current = ac
      setBulkBusy(true)
      setBusy(true)
      setError('')
      setBulkSummary(null)
      setMainTab('scan')
      setPhase('idle')
      clearEditor()
      ocrSeqRef.current += 1

      let saved = 0
      /** @type {Array<{ fileName: string, error: string }>} */
      const failed = []

      try {
        for (let i = 0; i < list.length; i++) {
          if (ac.signal.aborted) break
          const file = list[i]
          setBulkProgress({ index: i + 1, total: list.length, fileName: file.name || `Image ${i + 1}` })
          setStatusNote(`Bulk import ${i + 1}/${list.length}…`)
          try {
            const result = await processW2GImageForArchive(file, {
              signal: ac.signal,
              supabase: canUseVisionExtract ? supabaseClient : null,
              useVision: canUseVisionExtract,
            })
            if (!result.ok) {
              failed.push({ fileName: result.fileName, error: result.error })
              continue
            }
            await saveW2GSlip({
              supabase: supabaseClient,
              fields: result.fields,
              imageBlob: result.imageBlob,
              ocrConfidence: result.ocrConfidence,
            })
            saved += 1
          } catch (err) {
            if (err?.name === 'AbortError') break
            failed.push({ fileName: file.name || `Image ${i + 1}`, error: err?.message || 'Import failed.' })
          }
        }
      } finally {
        if (bulkAbortRef.current === ac) bulkAbortRef.current = null
        setBulkBusy(false)
        setBusy(false)
        setBulkProgress(null)
        setStatusNote('')
        setBulkSummary({ saved, failed })
        if (saved > 0) void refreshArchive()
      }
    },
    [
      canUseBulkImport,
      canUseVisionExtract,
      clearEditor,
      onOpenAuth,
      onRequireSubscribe,
      refreshArchive,
      supabaseClient,
    ],
  )

  const onPickBulkFiles = (event) => {
    const files = event.target.files
    event.target.value = ''
    if (files?.length) void runBulkImport(files)
  }

  const onBulkImportClick = () => {
    if (!canUseBulkImport) {
      if (!supabaseClient) {
        onOpenAuth?.('login')
        return
      }
      // Anon members still need auth first; subscribe modal is for free verified users.
      void (async () => {
        try {
          const { data } = await supabaseClient.auth.getUser()
          if (!data?.user?.id) {
            onOpenAuth?.('login')
            return
          }
        } catch {
          onOpenAuth?.('login')
          return
        }
        onRequireSubscribe?.(PRODUCT_SLOTS_EDGE_STARTER)
      })()
      return
    }
    bulkInputRef.current?.click()
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

  const onFieldChange = (key, value) => {
    setFieldList((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)))
    setCopied(false)
    setSaveOkNote('')
  }

  const fieldsObject = useMemo(() => {
    /** @type {Record<string, string>} */
    const o = {}
    for (const f of fieldList) o[f.key] = f.value
    return o
  }, [fieldList])

  const onCopyFields = async () => {
    const text = formatFieldsForCopy(fieldList)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Could not copy. Select the fields manually.')
    }
  }

  const onRerunOcr = () => {
    const flat = flatCanvasRef.current
    if (!flat) return
    void runOcr(flat)
  }

  const onSaveToArchive = async () => {
    if (!resultCanvas) return
    if (!supabaseClient) {
      setError('Archive unavailable.')
      return
    }
    try {
      const { data } = await supabaseClient.auth.getUser()
      if (!data?.user?.id) {
        setError('Sign in to save W-2Gs to your archive.')
        onOpenAuth?.('login')
        return
      }
    } catch {
      setError('Sign in to save W-2Gs to your archive.')
      onOpenAuth?.('login')
      return
    }

    setSaving(true)
    setError('')
    setSaveOkNote('')
    try {
      const imageBlob = await canvasToJpegBlob(resultCanvas)
      await saveW2GSlip({
        supabase: supabaseClient,
        fields: fieldsObject,
        imageBlob,
        ocrConfidence: ocrConfidenceRef.current,
      })
      const year = taxYearFromDate(fieldsObject.dateWon)
      setTaxYear(year)
      resetAll()
      setSaveOkNote(`Saved to ${year} archive.`)
      void refreshArchive()
    } catch (err) {
      setError(err?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const onDeleteSlip = async (slip) => {
    if (!supabaseClient || !slip?.id) return
    if (!window.confirm('Delete this W-2G from your archive?')) return
    setDeletingId(slip.id)
    setArchiveError('')
    try {
      await deleteW2GSlip({ supabase: supabaseClient, slip })
      setSlips((prev) => prev.filter((s) => s.id !== slip.id))
      setThumbUrls((prev) => {
        const next = { ...prev }
        delete next[slip.id]
        return next
      })
    } catch (err) {
      setArchiveError(err?.message || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  const onCopyCollate = async () => {
    const text = formatAllCombineSummaries(collated)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCollateCopied(true)
      window.setTimeout(() => setCollateCopied(false), 1800)
    } catch {
      setArchiveError('Could not copy combine summary.')
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set([currentYear, currentYear - 1, currentYear - 2, taxYear])
    for (const s of slips) {
      if (s.tax_year) years.add(Number(s.tax_year))
    }
    return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => b - a)
  }, [currentYear, taxYear, slips])

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
            Snap slips, save the six TurboTax fields + image, then collate by payer EIN for filing.
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-1 rounded-2xl bg-zinc-900 p-1"
          role="tablist"
          aria-label="W-2G sections"
          data-w2g-tabs
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'scan'}
            onClick={() => setMainTab('scan')}
            className={`min-h-10 rounded-xl text-sm font-semibold touch-manipulation ${
              mainTab === 'scan' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            Scan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'archive'}
            onClick={() => setMainTab('archive')}
            className={`min-h-10 rounded-xl text-sm font-semibold touch-manipulation ${
              mainTab === 'archive' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            My W-2Gs
          </button>
        </div>

        {error && mainTab === 'scan' ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            data-w2g-alert
          >
            {error}
          </div>
        ) : null}

        {bulkSummary && !bulkBusy ? (
          <div
            className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100 space-y-1.5"
            data-w2g-bulk-summary
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">
                Bulk import done… {bulkSummary.saved} saved
                {bulkSummary.failed.length ? `, ${bulkSummary.failed.length} failed` : ''}
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-emerald-200/90 touch-manipulation"
                onClick={() => setBulkSummary(null)}
              >
                Dismiss
              </button>
            </div>
            {bulkSummary.failed.length ? (
              <ul className="text-xs text-emerald-200/80 space-y-1 max-h-28 overflow-auto">
                {bulkSummary.failed.slice(0, 8).map((f) => (
                  <li key={`${f.fileName}-${f.error}`}>
                    {f.fileName}: {f.error}
                  </li>
                ))}
                {bulkSummary.failed.length > 8 ? (
                  <li>+{bulkSummary.failed.length - 8} more</li>
                ) : null}
              </ul>
            ) : null}
            {bulkSummary.saved > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold underline underline-offset-2"
                onClick={() => setMainTab('archive')}
              >
                Review in My W-2Gs
              </button>
            ) : null}
          </div>
        ) : null}

        {mainTab === 'scan' ? (
          <>
            {phase === 'idle' || phase === 'scanning' ? (
              <div className="space-y-3" data-w2g-capture>
                {saveOkNote ? (
                  <div
                    className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
                    data-w2g-save-ok
                  >
                    {saveOkNote}{' '}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => setMainTab('archive')}
                    >
                      View My W-2Gs
                    </button>
                  </div>
                ) : null}
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

                <button
                  type="button"
                  disabled={busy}
                  onClick={onBulkImportClick}
                  className="flex w-full items-center gap-4 rounded-3xl bg-zinc-900 px-4 py-5 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-60"
                  data-w2g-bulk
                >
                  <span
                    aria-hidden
                    className="slots-icon-tile grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                    style={{ '--tc': '#34d399' }}
                  >
                    <Images size={22} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-lg font-bold text-white">
                      Bulk import
                      {!canUseBulkImport ? (
                        <NavLockGlyph className="h-4 w-4 shrink-0 text-amber-400/95" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-zinc-500">
                      {canUseBulkImport
                        ? 'Select many photos… OCR + save each to your archive'
                        : 'Slots Edge and up … multi-slip import'}
                    </span>
                  </span>
                </button>

                {bulkBusy && bulkProgress ? (
                  <div className="space-y-2 rounded-2xl bg-zinc-900/80 px-4 py-3" data-w2g-bulk-progress>
                    <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
                      <span className="min-w-0 truncate">
                        Importing {bulkProgress.index}/{bulkProgress.total}… {bulkProgress.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={cancelBulkImport}
                        className="shrink-0 text-xs font-semibold text-amber-300 touch-manipulation"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-[width] duration-200"
                        style={{
                          width: `${Math.max(4, Math.round((bulkProgress.index / bulkProgress.total) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {phase === 'scanning' ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/80 px-4 py-3 text-sm text-zinc-300">
                    <ScanLine className="h-4 w-4 shrink-0 animate-pulse text-amber-300" aria-hidden />
                    <span>{statusNote || 'Scanning…'}</span>
                  </div>
                ) : !bulkBusy ? (
                  <p className="text-xs leading-relaxed text-zinc-500 px-1">
                    Tip: fill the frame, avoid heavy glare, and keep all four edges visible. OCR runs on-device;
                    saving stores the image privately in your account.
                  </p>
                ) : null}
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
                {statusNote ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{statusNote}</div>
                ) : null}
                <div className="overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-zinc-800" data-w2g-preview>
                  {resultPreviewUrl ? (
                    <img
                      src={resultPreviewUrl}
                      alt="Scanned W-2G"
                      className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
                    />
                  ) : (
                    <div className="grid min-h-[200px] place-items-center text-sm text-zinc-500">Preparing preview…</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy || saving || ocrStatus === 'loading'}
                    onClick={() => void onSaveToArchive()}
                    className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-3 text-sm font-semibold text-zinc-950 touch-manipulation disabled:opacity-60"
                    data-w2g-save
                  >
                    <CloudUpload size={16} strokeWidth={1.75} aria-hidden />
                    {saving ? 'Saving…' : 'Save to archive'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDownload()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
                  >
                    <Download size={16} strokeWidth={1.75} aria-hidden />
                    Download
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

                <div className="rounded-3xl bg-zinc-900 px-4 py-4 space-y-3" data-w2g-ocr>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-white">Tax fields</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {ocrStatus === 'loading'
                          ? canUseVisionExtract
                            ? `AI reading form… ${ocrProgress}%`
                            : `Reading form… ${ocrProgress}%`
                          : ocrStatus === 'ready'
                            ? 'Edit anything that looks off, then save.'
                            : ocrStatus === 'error'
                              ? 'Extract hiccuped. Retry or fill manually.'
                              : canUseVisionExtract
                                ? 'AI extract runs after crop (Slots Edge).'
                                : 'OCR runs after crop.'}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={ocrStatus === 'loading' || !hasFlat}
                        onClick={onRerunOcr}
                        className="inline-flex min-h-9 items-center justify-center rounded-xl bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                      >
                        Re-run
                      </button>
                      <button
                        type="button"
                        disabled={!fieldList.some((f) => f.value)}
                        onClick={() => void onCopyFields()}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500/90 px-3 text-xs font-semibold text-zinc-950 touch-manipulation disabled:opacity-50"
                        data-w2g-copy
                      >
                        {copied ? <ClipboardCheck size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {ocrStatus === 'loading' ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-[width] duration-200"
                        style={{ width: `${Math.max(4, ocrProgress)}%` }}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2.5">
                    {fieldList.map((field) => {
                      const def = W2G_FIELD_DEFS.find((d) => d.key === field.key)
                      return (
                        <label key={field.key} className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {def?.label || field.label}
                          </span>
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => onFieldChange(field.key, e.target.value)}
                            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                      )
                    })}
                  </div>
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
            <input
              ref={bulkInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPickBulkFiles}
            />
          </>
        ) : null}

        {mainTab === 'archive' ? (
          <div className="space-y-4" data-w2g-archive>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="font-semibold text-zinc-300">Tax year</span>
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                  data-w2g-year
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={archiveLoading}
                onClick={() => void refreshArchive()}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
              >
                <RefreshCw size={14} aria-hidden />
                Refresh
              </button>
            </div>

            {archiveError ? (
              <div
                role="alert"
                className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
                data-w2g-alert
              >
                {archiveError}
                {/sign in/i.test(archiveError) ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => onOpenAuth?.('login')}
                    >
                      Sign in
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {archiveLoading ? (
              <div className="text-sm text-zinc-400">Loading archive…</div>
            ) : slips.length === 0 && !archiveError ? (
              <div className="rounded-3xl bg-zinc-900 px-4 py-6 text-sm text-zinc-400" data-w2g-empty>
                No saved W-2Gs for {taxYear} yet. Scan a slip and tap <span className="text-zinc-200">Save to archive</span>.
              </div>
            ) : null}

            {slips.length > 0 ? (
              <ul className="space-y-3">
                {slips.map((slip) => (
                  <li
                    key={slip.id}
                    className="flex gap-3 rounded-3xl bg-zinc-900 p-3"
                    data-w2g-slip
                  >
                    <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-zinc-700">
                      {thumbUrls[slip.id] ? (
                        <img
                          src={thumbUrls[slip.id]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] text-zinc-500">No img</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">
                        {slip.payer_name || 'Unknown payer'}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {formatIsoDate(slip.date_won)}
                        {slip.payer_ein ? ` · EIN ${slip.payer_ein}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-zinc-300">
                        Box 1 {moneyLabel(slip.box1_winnings)} · Box 4 {moneyLabel(slip.box4_federal_withheld)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={deletingId === slip.id}
                      onClick={() => void onDeleteSlip(slip)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 touch-manipulation disabled:opacity-50"
                      aria-label="Delete slip"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {slips.length > 0 ? (
              <div className="rounded-3xl bg-zinc-900 px-4 py-4 space-y-3" data-w2g-collate>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-base font-bold text-white">
                      <Layers size={18} aria-hidden />
                      Collate by EIN
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Sums for TurboTax combine … {taxYear}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!collated.length}
                    onClick={() => void onCopyCollate()}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500/90 px-3 text-xs font-semibold text-zinc-950 touch-manipulation disabled:opacity-50"
                    data-w2g-copy
                  >
                    {collateCopied ? <ClipboardCheck size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                    {collateCopied ? 'Copied' : 'Copy combine'}
                  </button>
                </div>

                <ul className="space-y-3">
                  {collated.map((g, idx) => (
                    <li
                      key={`${g.payerEin || 'missing'}-${idx}`}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-3"
                    >
                      <div className="text-sm font-bold text-white">{g.payerName || 'Unknown payer'}</div>
                      {g.payerAddress ? (
                        <div className="mt-0.5 text-xs text-zinc-500 whitespace-pre-wrap">{g.payerAddress}</div>
                      ) : null}
                      <div className="mt-1 text-xs text-zinc-400">
                        EIN {g.payerEin || '...'} · {g.slipCount} slip{g.slipCount === 1 ? '' : 's'} · latest{' '}
                        {formatIsoDate(g.dateWon)}
                      </div>
                      <div className="mt-1 text-sm text-zinc-200">
                        Box 1 {moneyLabel(g.box1Sum)} · Box 4 {moneyLabel(g.box4Sum)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
