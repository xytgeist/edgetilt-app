import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  BadgeCheck,
  AlertTriangle,
  X,
  ChevronLeft,
} from 'lucide-react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import {
  APP_MODAL_OVERLAY_CLASS,
  APP_MODAL_SHEET_PANEL_CLASS,
  Z_APP_ALERT,
} from '../../constants/appZIndex.js'
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
  rotateCanvas90Cw,
  rotateCorners90Cw,
  shareOrDownloadScan,
} from './w2gScanPipeline.js'
import {
  W2G_FIELD_DEFS,
  fieldsToList,
  ocrW2G,
  taxYearFromDate,
} from './w2gOcr.js'
import {
  collateW2GSlips,
  dbRowToFields,
  deleteW2GSlip,
  formatAllCombineSummaries,
  isW2GSlipNeedsAttention,
  isW2GSlipVerified,
  listW2GSlips,
  saveW2GSlip,
  signedW2GImageUrl,
  updateW2GSlip,
} from './w2gArchiveApi.js'
import { processW2GImageForArchive } from './w2gBulkImport.js'
import { enhanceScanicCornerToolbar } from './w2gScanicToolbar.js'
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
  titleBarCenterSlot = null,
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
  const ocrJobIdRef = useRef(0)
  const uiExtractJobIdRef = useRef(0)
  /** @type {{ current: Map<number, { slipId: string | null, alive: boolean }> }} */
  const extractJobsRef = useRef(new Map())
  const ocrConfidenceRef = useRef(null)
  const bulkAbortRef = useRef(/** @type {AbortController | null} */ (null))
  /** @type {{ current: { source: HTMLCanvasElement, corners: any } | null }} */
  const pendingAdjustRef = useRef(null)
  const finishPrettyRef = useRef(/** @type {any} */ (null))
  const resetAllRef = useRef(/** @type {any} */ (null))
  const attnEditorHostRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const attnEditorRef = useRef(/** @type {any} */ (null))
  const attnSourceCanvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null))
  /** @type {{ current: import('scanic').CornerPoints | null }} */
  const attnPendingCornersRef = useRef(null)
  const rotateAdjustRef = useRef(/** @type {null | (() => void)} */ (null))
  const rotateAttnRef = useRef(/** @type {null | (() => void)} */ (null))

  const [mainTab, setMainTab] = useState('scan') // scan | archive
  const [archivePane, setArchivePane] = useState('list') // list | collate | collateDetail
  /** EIN key for collate drill-down (`'(missing EIN)'` when blank). */
  const [collateDetailEin, setCollateDetailEin] = useState(/** @type {string | null} */ (null))
  const [phase, setPhase] = useState('idle') // idle | scanning | adjust | result
  /** Bumps when re-opening adjust (e.g. Rotate) so the corner editor remounts. */
  const [adjustEpoch, setAdjustEpoch] = useState(0)
  const [resultCanvas, setResultCanvas] = useState(null)
  const [resultPreviewUrl, setResultPreviewUrl] = useState(null)
  const [statusNote, setStatusNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('') // '', loading, ready, error
  const [ocrProgress, setOcrProgress] = useState(0)
  const [fieldList, setFieldList] = useState(() => fieldsToList({}))
  const [saving, setSaving] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(/** @type {{ index: number, total: number, fileName: string } | null} */ (null))
  const [bulkSummary, setBulkSummary] = useState(
    /** @type {{ saved: number, needsAttention: number, failed: Array<{ fileName: string, error: string }> } | null} */ (
      null
    ),
  )
  const [processingSlipIds, setProcessingSlipIds] = useState(/** @type {string[]} */ ([]))

  const currentYear = new Date().getFullYear()
  const [taxYear, setTaxYear] = useState(currentYear)
  const [slips, setSlips] = useState([])
  const [thumbUrls, setThumbUrls] = useState(/** @type {Record<string, string>} */ ({}))
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [collateCopied, setCollateCopied] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [verifySlip, setVerifySlip] = useState(null)
  const [verifyFieldList, setVerifyFieldList] = useState(() => fieldsToList({}))
  const [verifySaving, setVerifySaving] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [verifyReprocessing, setVerifyReprocessing] = useState(false)
  const [verifyImageExpanded, setVerifyImageExpanded] = useState(false)
  const [attnSourceReady, setAttnSourceReady] = useState(false)
  const [attnLoading, setAttnLoading] = useState(false)
  const [attnApplying, setAttnApplying] = useState(false)
  const attnApplyingRef = useRef(false)
  attnApplyingRef.current = attnApplying

  const collated = useMemo(() => collateW2GSlips(slips), [slips])
  const collateDetailGroup = useMemo(() => {
    if (!collateDetailEin) return null
    return (
      collated.find((g) => (String(g.payerEin || '').trim() || '(missing EIN)') === collateDetailEin) ||
      null
    )
  }, [collated, collateDetailEin])
  const verifyImageUrl = verifySlip?.id ? thumbUrls[verifySlip.id] || '' : ''
  const verifyAlreadyDone = isW2GSlipVerified(verifySlip)
  const verifyNeedsAttention = isW2GSlipNeedsAttention(verifySlip)
  const processingSlipIdSet = useMemo(() => new Set(processingSlipIds), [processingSlipIds])

  const markSlipProcessing = useCallback((slipId, on) => {
    if (!slipId) return
    setProcessingSlipIds((prev) => {
      const has = prev.includes(slipId)
      if (on && !has) return [...prev, slipId]
      if (!on && has) return prev.filter((id) => id !== slipId)
      return prev
    })
  }, [])

  const cancelUnattachedExtractJobs = useCallback(() => {
    for (const job of extractJobsRef.current.values()) {
      if (!job.slipId) job.alive = false
    }
    uiExtractJobIdRef.current = 0
  }, [])

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
      for (const job of extractJobsRef.current.values()) job.alive = false
      extractJobsRef.current.clear()
      uiExtractJobIdRef.current = 0
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
      rows.sort((a, b) => {
        const aAttn = isW2GSlipNeedsAttention(a) ? 0 : 1
        const bAttn = isW2GSlipNeedsAttention(b) ? 0 : 1
        if (aAttn !== bAttn) return aAttn - bAttn
        return 0
      })
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
    if (mainTab !== 'archive') {
      setArchivePane('list')
      setCollateDetailEin(null)
      return
    }
    void refreshArchive()
  }, [mainTab, refreshArchive])

  // If the open casino group vanishes (delete / tax-year change), return to the collate list.
  useEffect(() => {
    if (archivePane !== 'collateDetail') return
    if (!collateDetailEin) {
      setArchivePane('collate')
      return
    }
    if (!collateDetailGroup) {
      setCollateDetailEin(null)
      setArchivePane('collate')
    }
  }, [archivePane, collateDetailEin, collateDetailGroup])

  const clearEditor = useCallback(() => {
    editorRef.current?.destroy?.()
    editorRef.current = null
    if (editorHostRef.current) editorHostRef.current.innerHTML = ''
  }, [])

  const destroyAttnEditor = useCallback(() => {
    try {
      attnEditorRef.current?.destroy?.()
    } catch {
      /* ignore */
    }
    attnEditorRef.current = null
    if (attnEditorHostRef.current) attnEditorHostRef.current.innerHTML = ''
  }, [])

  const dismissScanUi = useCallback(() => {
    clearEditor()
    ocrConfidenceRef.current = null
    sourceCanvasRef.current = null
    // Keep flatCanvasRef until extract jobs that need it finish; cleared when idle + no jobs.
    setResultCanvas(null)
    setStatusNote('')
    setError('')
    setBusy(false)
    setPhase('idle')
    setOcrStatus('')
    setOcrProgress(0)
    setFieldList(fieldsToList({}))
  }, [clearEditor])

  const resetAll = useCallback(() => {
    cancelUnattachedExtractJobs()
    flatCanvasRef.current = null
    dismissScanUi()
  }, [cancelUnattachedExtractJobs, dismissScanUi])

  const patchSlipFieldsSilent = useCallback(
    async (slipId, fields, confidence) => {
      if (!supabaseClient || !slipId) return
      try {
        const updated = await updateW2GSlip({
          supabase: supabaseClient,
          slipId,
          fields,
          ocrConfidence: confidence ?? null,
        })
        setSlips((prev) => {
          const idx = prev.findIndex((s) => s.id === slipId)
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = updated
          return next
        })
        setVerifySlip((prev) => {
          if (prev?.id !== slipId) return prev
          setVerifyFieldList(fieldsToList(fields))
          return updated
        })
      } catch {
        /* silent — user can re-process on Verify */
      } finally {
        markSlipProcessing(slipId, false)
      }
    },
    [markSlipProcessing, supabaseClient],
  )

  const runExtractJob = useCallback(
    async (flatCanvas, { forUi = true, slipId = null } = {}) => {
      if (!flatCanvas) return 0
      const jobId = ++ocrJobIdRef.current
      extractJobsRef.current.set(jobId, { slipId: slipId || null, alive: true })
      if (forUi) {
        uiExtractJobIdRef.current = jobId
        setOcrStatus('loading')
        setOcrProgress(0)
        ocrConfidenceRef.current = null
        setError('')
      }
      if (slipId) markSlipProcessing(slipId, true)

      const jobAlive = () => {
        const job = extractJobsRef.current.get(jobId)
        return Boolean(job?.alive)
      }
      const attachedSlipId = () => extractJobsRef.current.get(jobId)?.slipId || null

      const deliver = async (fields, confidence, engineLabel) => {
        if (!jobAlive()) return
        const targetSlipId = attachedSlipId()
        if (targetSlipId) {
          await patchSlipFieldsSilent(targetSlipId, fields || {}, confidence ?? null)
          extractJobsRef.current.delete(jobId)
          return
        }
        if (forUi && uiExtractJobIdRef.current === jobId) {
          setFieldList(fieldsToList(fields || {}))
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
        extractJobsRef.current.delete(jobId)
      }

      const failSilent = () => {
        if (!jobAlive()) return
        const targetSlipId = attachedSlipId()
        if (targetSlipId) {
          markSlipProcessing(targetSlipId, false)
        } else if (forUi && uiExtractJobIdRef.current === jobId) {
          setOcrStatus('ready')
          setOcrProgress(0)
        }
        extractJobsRef.current.delete(jobId)
      }

      try {
        if (canUseVisionExtract && supabaseClient) {
          try {
            if (forUi && uiExtractJobIdRef.current === jobId) {
              setOcrProgress(12)
              setStatusNote((prev) => {
                const base = String(prev || '')
                  .replace(/\s*·\s*(AI|OCR).*$/i, '')
                  .trim()
                return base ? `${base} · AI extract…` : 'AI extract…'
              })
            }
            const imageBlob = await canvasToVisionJpegBlob(flatCanvas)
            if (!jobAlive()) return jobId
            if (forUi && uiExtractJobIdRef.current === jobId) setOcrProgress(45)
            const vision = await extractW2GFieldsWithVision({
              supabase: supabaseClient,
              imageBlob,
            })
            if (!jobAlive()) return jobId
            if (forUi && uiExtractJobIdRef.current === jobId) setOcrProgress(100)
            await deliver(vision.fields, vision.confidence, 'AI')
            return jobId
          } catch (err) {
            if (!jobAlive()) return jobId
            if (err?.code === 'subscribe_required' && forUi && !attachedSlipId()) {
              onRequireSubscribe?.(PRODUCT_SLOTS_EDGE_STARTER)
            }
            // Fall through to local OCR; still silent if attached to archive slip.
          }
        }

        const { fields, confidence } = await ocrW2G(flatCanvas, {
          onProgress: (pct) => {
            if (forUi && uiExtractJobIdRef.current === jobId && jobAlive()) setOcrProgress(pct)
          },
        })
        if (!jobAlive()) return jobId
        await deliver(fields, confidence, 'OCR')
      } catch {
        failSilent()
      }
      return jobId
    },
    [
      canUseVisionExtract,
      markSlipProcessing,
      onRequireSubscribe,
      patchSlipFieldsSilent,
      supabaseClient,
    ],
  )

  const finishPretty = useCallback(
    async (docCanvas, note) => {
      setStatusNote('Preparing…')
      const flat = await flattenCroppedDocument(docCanvas)
      flatCanvasRef.current = flat
      const pretty = presentPrettyScan(flat)
      setResultCanvas(pretty)
      setStatusNote(note || 'Ready')
      setPhase('result')
      setBusy(false)
      try {
        const file = await canvasToPngFile(pretty, 'probe-share.png')
        setCanNativeShare(Boolean(navigator.canShare?.({ files: [file] })))
      } catch {
        /* keep prior */
      }
      void runExtractJob(flat, { forUi: true })
    },
    [runExtractJob],
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
    setAdjustEpoch((n) => n + 1)
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
            labels: { reset: 'Reset corners', cancel: 'Cancel', apply: 'Apply' },
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
        enhanceScanicCornerToolbar(host, {
          onRotate: () => rotateAdjustRef.current?.(),
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
  }, [phase, adjustEpoch, clearEditor])

  const processFile = useCallback(
    async (file) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
        setError('Pick a photo of the W-2G.')
        return
      }
      clearEditor()
      cancelUnattachedExtractJobs()
      setError('')
      setResultCanvas(null)
      setFieldList(fieldsToList({}))
      setOcrStatus('')
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
    [cancelUnattachedExtractJobs, clearEditor, finishPretty, openAdjust],
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
      cancelUnattachedExtractJobs()

      let saved = 0
      let needsAttention = 0
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
            if (result.ok) {
              await saveW2GSlip({
                supabase: supabaseClient,
                fields: result.fields,
                imageBlob: result.imageBlob,
                ocrConfidence: result.ocrConfidence,
              })
              saved += 1
              continue
            }
            // Corner / extract issues still land in My W-2Gs as ATTN slips.
            if (result.needsAttention && result.imageBlob) {
              await saveW2GSlip({
                supabase: supabaseClient,
                fields: result.fields || {},
                imageBlob: result.imageBlob,
                ocrConfidence: null,
                attentionReason: result.error,
                taxYear,
              })
              saved += 1
              needsAttention += 1
              continue
            }
            failed.push({ fileName: result.fileName, error: result.error })
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
        setBulkSummary({ saved, needsAttention, failed })
        if (saved > 0) void refreshArchive()
      }
    },
    [
      canUseBulkImport,
      canUseVisionExtract,
      cancelUnattachedExtractJobs,
      clearEditor,
      onOpenAuth,
      onRequireSubscribe,
      refreshArchive,
      supabaseClient,
      taxYear,
    ],
  )

  const onPickBulkFiles = (event) => {
    // Snapshot before clearing … input.files is a live FileList and value='' empties it.
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length) void runBulkImport(files)
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

  const onRotateAdjustImage = () => {
    const source = sourceCanvasRef.current || pendingAdjustRef.current?.source
    if (!source) return
    const currentCorners =
      editorRef.current?.getCorners?.() || pendingAdjustRef.current?.corners || null
    const rotated = rotateCanvas90Cw(source)
    const nextCorners = currentCorners
      ? rotateCorners90Cw(currentCorners, source.width, source.height)
      : defaultInsetCorners(rotated.width, rotated.height)
    sourceCanvasRef.current = rotated
    openAdjust(rotated, nextCorners, 'Rotated… drag the corners onto the form edges, then Apply.')
  }
  rotateAdjustRef.current = onRotateAdjustImage

  const onRotateAttnImage = () => {
    const source = attnSourceCanvasRef.current
    if (!source || attnApplyingRef.current) return
    const currentCorners = attnEditorRef.current?.getCorners?.() || null
    const rotated = rotateCanvas90Cw(source)
    const nextCorners = currentCorners
      ? rotateCorners90Cw(currentCorners, source.width, source.height)
      : defaultInsetCorners(rotated.width, rotated.height)
    destroyAttnEditor()
    attnSourceCanvasRef.current = rotated
    attnPendingCornersRef.current = nextCorners
    setAttnSourceReady(false)
    // Remount editor on the rotated canvas (next paint).
    requestAnimationFrame(() => setAttnSourceReady(true))
  }
  rotateAttnRef.current = onRotateAttnImage

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
  }

  const fieldsObject = useMemo(() => {
    /** @type {Record<string, string>} */
    const o = {}
    for (const f of fieldList) o[f.key] = f.value
    return o
  }, [fieldList])

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
    const extractStillRunning = ocrStatus === 'loading'
    const uiJobId = uiExtractJobIdRef.current
    const flatForLater = flatCanvasRef.current
    try {
      const imageBlob = await canvasToJpegBlob(resultCanvas)
      const slip = await saveW2GSlip({
        supabase: supabaseClient,
        fields: fieldsObject,
        imageBlob,
        ocrConfidence: extractStillRunning ? null : ocrConfidenceRef.current,
      })
      const year = taxYearFromDate(fieldsObject.dateWon) || Number(slip.tax_year) || new Date().getFullYear()
      setTaxYear(year)

      // Prefer attaching the in-flight extract to this slip (no second AI call).
      const liveJob = uiJobId ? extractJobsRef.current.get(uiJobId) : null
      if (extractStillRunning && liveJob?.alive) {
        liveJob.slipId = slip.id
        markSlipProcessing(slip.id, true)
        uiExtractJobIdRef.current = 0
        dismissScanUi()
      } else if (
        flatForLater &&
        !fieldsObject.payerName &&
        !fieldsObject.box1Winnings
      ) {
        // Fields empty and no live job … start archive-bound extract.
        dismissScanUi()
        void runExtractJob(flatForLater, { forUi: false, slipId: slip.id })
      } else {
        cancelUnattachedExtractJobs()
        flatCanvasRef.current = null
        dismissScanUi()
      }

      setSlips((prev) => {
        if (prev.some((s) => s.id === slip.id)) return prev
        return [slip, ...prev]
      })
      if (slip.image_path) {
        try {
          const url = await signedW2GImageUrl(supabaseClient, slip.image_path)
          if (url) setThumbUrls((prev) => ({ ...prev, [slip.id]: url }))
        } catch {
          /* thumb later on refresh */
        }
      }
      setMainTab('archive')
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
      for (const job of extractJobsRef.current.values()) {
        if (job.slipId === slip.id) job.alive = false
      }
      markSlipProcessing(slip.id, false)
      setSlips((prev) => prev.filter((s) => s.id !== slip.id))
      setThumbUrls((prev) => {
        const next = { ...prev }
        delete next[slip.id]
        return next
      })
      if (verifySlip?.id === slip.id) {
        destroyAttnEditor()
        attnSourceCanvasRef.current = null
        setAttnSourceReady(false)
        setAttnLoading(false)
        setAttnApplying(false)
        setVerifySlip(null)
        setVerifyError('')
        setVerifyReprocessing(false)
      }
    } catch (err) {
      setArchiveError(err?.message || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  const openVerifySlip = (slip) => {
    if (!slip) return
    destroyAttnEditor()
    attnSourceCanvasRef.current = null
    attnPendingCornersRef.current = null
    setAttnSourceReady(false)
    setAttnLoading(false)
    setAttnApplying(false)
    setVerifyError('')
    setVerifyReprocessing(false)
    setVerifyImageExpanded(false)
    setVerifySlip(slip)
    setVerifyFieldList(fieldsToList(dbRowToFields(slip)))
  }

  const closeVerifySlip = () => {
    if (verifySaving || verifyReprocessing || attnApplyingRef.current) return
    destroyAttnEditor()
    attnSourceCanvasRef.current = null
    setAttnSourceReady(false)
    setAttnLoading(false)
    setVerifySlip(null)
    setVerifyError('')
    setVerifyReprocessing(false)
    setVerifyImageExpanded(false)
  }

  const closeVerifySlipRef = useRef(closeVerifySlip)
  closeVerifySlipRef.current = closeVerifySlip
  const verifySlipRef = useRef(verifySlip)
  verifySlipRef.current = verifySlip
  const taxYearRef = useRef(taxYear)
  taxYearRef.current = taxYear
  const canUseVisionExtractRef = useRef(canUseVisionExtract)
  canUseVisionExtractRef.current = canUseVisionExtract
  const supabaseClientRef = useRef(supabaseClient)
  supabaseClientRef.current = supabaseClient

  // Load original photo into a canvas when opening an ATTN slip (for corner guide).
  useEffect(() => {
    const slipId = verifySlip?.id
    const imagePath = verifySlip?.image_path
    const needsAttn = isW2GSlipNeedsAttention(verifySlip)
    if (!slipId || !needsAttn || !supabaseClient || !imagePath) {
      return undefined
    }
    let cancelled = false
    setAttnLoading(true)
    setAttnSourceReady(false)
    attnSourceCanvasRef.current = null
    void (async () => {
      try {
        const url = await signedW2GImageUrl(supabaseClient, imagePath)
        if (cancelled) return
        if (!url) throw new Error('Could not load slip image.')
        setThumbUrls((prev) => (prev[slipId] ? prev : { ...prev, [slipId]: url }))
        const res = await fetch(url)
        if (!res.ok) throw new Error('Could not load slip image.')
        const blob = await res.blob()
        const canvas = await loadImageCanvasFromFile(blob)
        if (cancelled) return
        attnSourceCanvasRef.current = canvas
        setAttnSourceReady(true)
        setVerifyError('')
      } catch (err) {
        if (!cancelled) {
          setVerifyError(err?.message || 'Could not load slip for corner fix.')
          setAttnSourceReady(false)
        }
      } finally {
        if (!cancelled) setAttnLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient, verifySlip?.id, verifySlip?.image_path, verifySlip?.attention_reason])

  // Mount scanic corner editor inside the ATTN sheet.
  useEffect(() => {
    const slip = verifySlipRef.current
    if (!slip || !isW2GSlipNeedsAttention(slip) || !attnSourceReady) {
      return undefined
    }
    const source = attnSourceCanvasRef.current
    if (!source) return undefined

    let cancelled = false

    const mountEditor = async () => {
      let host = attnEditorHostRef.current
      for (let i = 0; i < 45 && !host && !cancelled; i++) {
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        host = attnEditorHostRef.current
      }
      if (cancelled || !host) return

      try {
        const { createCornerEditor } = await import('scanic')
        if (cancelled || !attnEditorHostRef.current) return
        destroyAttnEditor()
        host = attnEditorHostRef.current
        host.innerHTML = ''
        const initial =
          attnPendingCornersRef.current || defaultInsetCorners(source.width, source.height)
        attnPendingCornersRef.current = null
        attnEditorRef.current = createCornerEditor({
          container: host,
          image: source,
          corners: initial,
          magnifier: { enabled: true, zoom: 2.2, size: 112 },
          toolbar: {
            enabled: true,
            labels: { reset: 'Reset corners', cancel: 'Close', apply: 'Apply' },
          },
          theme: {
            accent: '#f59e0b',
            mask: 'rgba(9, 9, 11, 0.55)',
            surface: '#18181b',
            surfaceColor: '#fafafa',
            radius: '14px',
          },
          onCancel: () => {
            closeVerifySlipRef.current?.()
          },
          onConfirm: (nextCorners) => {
            void (async () => {
              const liveSlip = verifySlipRef.current
              const client = supabaseClientRef.current
              if (!client || !liveSlip?.id) return
              setAttnApplying(true)
              setVerifyError('')
              try {
                const { result: extracted } = await extractWithCorners(source, nextCorners)
                if (!extracted?.success || !extracted.output) {
                  throw new Error(extracted?.message || 'Could not crop that frame.')
                }
                const flat = await flattenCroppedDocument(
                  /** @type {HTMLCanvasElement} */ (extracted.output),
                )
                const pretty = presentPrettyScan(flat)
                const imageBlob = await canvasToJpegBlob(pretty)

                /** @type {Record<string, string>} */
                let fields = {}
                /** @type {number | null} */
                let confidence = null
                if (canUseVisionExtractRef.current) {
                  try {
                    const visionBlob = await canvasToVisionJpegBlob(flat)
                    const vision = await extractW2GFieldsWithVision({
                      supabase: client,
                      imageBlob: visionBlob,
                    })
                    fields = vision.fields || {}
                    confidence = vision.confidence ?? null
                  } catch {
                    const local = await ocrW2G(flat)
                    fields = local.fields || {}
                    confidence = local.confidence ?? null
                  }
                } else {
                  const local = await ocrW2G(flat)
                  fields = local.fields || {}
                  confidence = local.confidence ?? null
                }

                const updated = await updateW2GSlip({
                  supabase: client,
                  slipId: liveSlip.id,
                  fields,
                  ocrConfidence: confidence,
                  attentionReason: null,
                  imageBlob,
                  existingImagePath: liveSlip.image_path || null,
                  taxYear:
                    taxYearFromDate(fields.dateWon) || liveSlip.tax_year || taxYearRef.current,
                })

                destroyAttnEditor()
                attnSourceCanvasRef.current = null
                setAttnSourceReady(false)

                setSlips((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                setVerifySlip(updated)
                setVerifyFieldList(fieldsToList(fields))

                try {
                  const url = await signedW2GImageUrl(client, updated.image_path)
                  if (url) {
                    setThumbUrls((prev) => ({
                      ...prev,
                      [updated.id]: `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`,
                    }))
                  }
                } catch {
                  /* thumb refresh on next archive load */
                }
              } catch (err) {
                setVerifyError(err?.message || 'Corner fix failed.')
              } finally {
                setAttnApplying(false)
              }
            })()
          },
        })
        enhanceScanicCornerToolbar(host, {
          onRotate: () => rotateAttnRef.current?.(),
        })
      } catch (err) {
        if (!cancelled) {
          setVerifyError(err?.message || 'Could not open corner editor.')
        }
      }
    }

    void mountEditor()
    return () => {
      cancelled = true
      destroyAttnEditor()
    }
  }, [attnSourceReady, destroyAttnEditor, verifySlip?.id, verifySlip?.attention_reason])

  const onVerifyFieldChange = (key, value) => {
    setVerifyFieldList((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)))
  }

  const onReprocessVerify = async () => {
    if (!supabaseClient || !verifySlip?.image_path) return
    setVerifyReprocessing(true)
    setVerifyError('')
    try {
      let url = thumbUrls[verifySlip.id]
      if (!url) {
        url = await signedW2GImageUrl(supabaseClient, verifySlip.image_path)
        if (url) setThumbUrls((prev) => ({ ...prev, [verifySlip.id]: url }))
      }
      if (!url) throw new Error('Could not load slip image.')
      const res = await fetch(url)
      if (!res.ok) throw new Error('Could not load slip image.')
      const blob = await res.blob()
      const canvas = await loadImageCanvasFromFile(blob)

      /** @type {Record<string, string>} */
      let fields = {}
      let confidence = null
      if (canUseVisionExtract) {
        try {
          const visionBlob = await canvasToVisionJpegBlob(canvas)
          const vision = await extractW2GFieldsWithVision({
            supabase: supabaseClient,
            imageBlob: visionBlob,
          })
          fields = vision.fields || {}
          confidence = vision.confidence ?? null
        } catch {
          const local = await ocrW2G(canvas)
          fields = local.fields || {}
          confidence = local.confidence ?? null
        }
      } else {
        const local = await ocrW2G(canvas)
        fields = local.fields || {}
        confidence = local.confidence ?? null
      }
      setVerifyFieldList(fieldsToList(fields))
      ocrConfidenceRef.current = confidence
    } catch (err) {
      setVerifyError(err?.message || 'Re-process failed. Edit fields manually.')
    } finally {
      setVerifyReprocessing(false)
    }
  }

  const onConfirmVerified = async () => {
    if (!supabaseClient || !verifySlip?.id) return
    setVerifySaving(true)
    setVerifyError('')
    /** @type {Record<string, string>} */
    const fields = {}
    for (const f of verifyFieldList) fields[f.key] = f.value
    try {
      const updated = await updateW2GSlip({
        supabase: supabaseClient,
        slipId: verifySlip.id,
        fields,
        markVerified: true,
      })
      setSlips((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setVerifySlip(null)
    } catch (err) {
      setVerifyError(err?.message || 'Could not save verification.')
    } finally {
      setVerifySaving(false)
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

  const openCollateGroup = (group) => {
    const key = String(group?.payerEin || '').trim() || '(missing EIN)'
    setCollateDetailEin(key)
    setArchivePane('collateDetail')
  }

  const renderArchiveSlipCard = (slip) => {
    const verified = isW2GSlipVerified(slip)
    const needsAttn = isW2GSlipNeedsAttention(slip)
    const extracting = processingSlipIdSet.has(slip.id)
    return (
      <li key={slip.id} className="flex gap-3 rounded-3xl bg-zinc-900 p-3" data-w2g-slip>
        <button
          type="button"
          onClick={() => openVerifySlip(slip)}
          className="flex min-w-0 flex-1 gap-3 text-left touch-manipulation"
        >
          <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-zinc-700">
            {thumbUrls[slip.id] ? (
              <img src={thumbUrls[slip.id]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-[10px] text-zinc-500">No img</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">
              {slip.payer_name ||
                (needsAttn ? 'Needs attention' : extracting ? 'Extracting fields…' : 'Unknown payer')}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {needsAttn
                ? 'Fix corners to extract fields'
                : `${formatIsoDate(slip.date_won)}${
                    slip.payer_ein ? ` · EIN ${slip.payer_ein}` : ''
                  }${extracting ? ' · Extracting…' : ''}`}
            </div>
            {!needsAttn ? (
              <div className="mt-1 text-xs text-zinc-300">
                Box 1 {moneyLabel(slip.box1_winnings)} · Box 4 {moneyLabel(slip.box4_federal_withheld)}
              </div>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {needsAttn ? (
            <button
              type="button"
              onClick={() => openVerifySlip(slip)}
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white touch-manipulation"
              data-w2g-attn-btn
            >
              <AlertTriangle size={14} aria-hidden />
              ATTN
            </button>
          ) : verified ? (
            <span
              className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30"
              data-w2g-verified-badge
            >
              <BadgeCheck size={14} aria-hidden />
              Verified
            </span>
          ) : (
            <button
              type="button"
              onClick={() => openVerifySlip(slip)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-500/90 px-3 text-xs font-semibold text-zinc-950 touch-manipulation"
              data-w2g-verify-btn
            >
              Verify
            </button>
          )}
          <button
            type="button"
            disabled={deletingId === slip.id}
            onClick={() => void onDeleteSlip(slip)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 touch-manipulation disabled:opacity-50"
            aria-label="Delete slip"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </li>
    )
  }

  return (
    <>
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarToolCloseVisible={titleBarToolCloseVisible}
      contentClassName="px-3 py-6 pb-[calc(6rem+max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]"
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
                {bulkSummary.needsAttention
                  ? ` · ${bulkSummary.needsAttention} need attention`
                  : ''}
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-emerald-200/90 touch-manipulation"
                onClick={() => setBulkSummary(null)}
              >
                Dismiss
              </button>
            </div>
            {bulkSummary.needsAttention ? (
              <div className="text-xs text-emerald-200/80">
                Open the ATTN slips in My W-2Gs to fix corners, then verify.
              </div>
            ) : null}
            {bulkSummary.failed.length ? (
              <ul className="text-xs text-emerald-200/80 space-y-1 max-h-28 overflow-auto">
                {bulkSummary.failed.slice(0, 8).map((f) => (
                  <li key={`${f.fileName}-${f.error}`}>
                    Skipped {f.fileName}: {f.error}
                  </li>
                ))}
                {bulkSummary.failed.length > 8 ? (
                  <li>+{bulkSummary.failed.length - 8} more skipped</li>
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
                    disabled={busy || saving}
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
                  <div>
                    <div className="text-base font-bold text-white">Tax fields</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {ocrStatus === 'loading'
                        ? 'Extracting… you can save now and finish in My W-2Gs.'
                        : 'Edit if needed, then save. Or save now and verify later.'}
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
              {archivePane === 'collateDetail' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCollateDetailEin(null)
                    setArchivePane('collate')
                  }}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 touch-manipulation"
                  data-w2g-collate-back
                >
                  <ChevronLeft size={16} aria-hidden />
                  Casinos
                </button>
              ) : archivePane === 'collate' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCollateDetailEin(null)
                    setArchivePane('list')
                  }}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-zinc-200 touch-manipulation"
                  data-w2g-collate-back
                >
                  <ChevronLeft size={16} aria-hidden />
                  Slips
                </button>
              ) : null}
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
              {archivePane === 'list' ? (
                <button
                  type="button"
                  disabled={!slips.length || archiveLoading}
                  onClick={() => {
                    setCollateDetailEin(null)
                    setArchivePane('collate')
                  }}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500/90 px-3 text-xs font-semibold text-zinc-950 touch-manipulation disabled:opacity-50"
                  data-w2g-collate-open
                >
                  <Layers size={14} aria-hidden />
                  Collate
                </button>
              ) : (
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
              )}
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

            {archivePane === 'list' ? (
              <>
                {archiveLoading ? (
                  <div className="text-sm text-zinc-400">Loading archive…</div>
                ) : slips.length === 0 && !archiveError ? (
                  <div className="rounded-3xl bg-zinc-900 px-4 py-6 text-sm text-zinc-400" data-w2g-empty>
                    No saved W-2Gs for {taxYear} yet. Scan a slip and tap{' '}
                    <span className="text-zinc-200">Save to archive</span>.
                  </div>
                ) : null}

                {slips.length > 0 ? <ul className="space-y-3">{slips.map(renderArchiveSlipCard)}</ul> : null}
              </>
            ) : archivePane === 'collateDetail' && collateDetailGroup ? (
              <div className="space-y-4" data-w2g-collate-detail>
                <div className="rounded-3xl bg-zinc-900 px-4 py-4 space-y-2" data-w2g-collate-card>
                  <div className="text-xl font-black tracking-tight text-white">
                    {collateDetailGroup.payerName || 'Unknown casino'}
                  </div>
                  <div className="text-xs font-semibold text-zinc-400">
                    EIN {collateDetailGroup.payerEin || 'missing'}
                  </div>
                  {collateDetailGroup.payerAddress ? (
                    <div className="text-xs text-zinc-500 whitespace-pre-wrap">
                      {collateDetailGroup.payerAddress}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-2xl bg-zinc-950/70 px-3 py-2.5" data-w2g-collate-stat>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Box 1 winnings
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-white">
                        {moneyLabel(collateDetailGroup.box1Sum)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-zinc-950/70 px-3 py-2.5" data-w2g-collate-stat>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Box 4 withheld
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-white">
                        {moneyLabel(collateDetailGroup.box4Sum)}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-zinc-300">
                    {collateDetailGroup.slipCount} slip
                    {collateDetailGroup.slipCount === 1 ? '' : 's'} in this group
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Tap Verify on any slip to check the image against the TurboTax fields.
                  </div>
                </div>

                {(collateDetailGroup.slips || []).length ? (
                  <ul className="space-y-3">{collateDetailGroup.slips.map(renderArchiveSlipCard)}</ul>
                ) : (
                  <div className="rounded-3xl bg-zinc-900 px-4 py-6 text-sm text-zinc-400" data-w2g-empty>
                    No slips left in this group.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4" data-w2g-collate-screen>
                <div>
                  <div className="text-xl font-black tracking-tight text-white">Collate by casino</div>
                  <div className="text-sm text-zinc-400 mt-0.5">
                    Combined Box 1 / Box 4 totals for {taxYear}. Tap a casino to review each W-2G.
                  </div>
                </div>

                {archiveLoading ? (
                  <div className="text-sm text-zinc-400">Loading…</div>
                ) : !collated.length ? (
                  <div className="rounded-3xl bg-zinc-900 px-4 py-6 text-sm text-zinc-400" data-w2g-empty>
                    No slips to collate for {taxYear}.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {collated.map((g, idx) => (
                      <li key={`${g.payerEin || 'missing'}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => openCollateGroup(g)}
                          className="w-full rounded-3xl bg-zinc-900 px-4 py-4 space-y-2 text-left touch-manipulation"
                          data-w2g-collate-card
                        >
                          <div className="text-base font-bold text-white">
                            {g.payerName || 'Unknown casino'}
                          </div>
                          <div className="text-xs font-semibold text-zinc-400">
                            EIN {g.payerEin || 'missing'}
                          </div>
                          {g.payerAddress ? (
                            <div className="text-xs text-zinc-500 whitespace-pre-wrap">{g.payerAddress}</div>
                          ) : null}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="rounded-2xl bg-zinc-950/70 px-3 py-2.5" data-w2g-collate-stat>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Box 1 winnings
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-white">
                                {moneyLabel(g.box1Sum)}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-zinc-950/70 px-3 py-2.5" data-w2g-collate-stat>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Box 4 withheld
                              </div>
                              <div className="mt-0.5 text-sm font-bold text-white">
                                {moneyLabel(g.box4Sum)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                            <span>
                              {g.slipCount} slip{g.slipCount === 1 ? '' : 's'}
                              {g.dateWon ? ` · latest ${formatIsoDate(g.dateWon)}` : ''}
                            </span>
                            <span className="font-semibold text-amber-400/90">Review slips →</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ScrollLinkedEdgeTitleBarShell>

    {verifySlip && typeof document !== 'undefined'
      ? createPortal(
          <>
          <div
            className={APP_MODAL_OVERLAY_CLASS}
            role="dialog"
            aria-modal="true"
            aria-label={verifyNeedsAttention ? 'Fix W-2G slip' : 'Verify W-2G slip'}
            data-w2g-verify-modal
            onClick={(e) => {
              if (e.target === e.currentTarget && !attnApplying) closeVerifySlip()
            }}
          >
            <div className={`${APP_MODAL_SHEET_PANEL_CLASS} space-y-4`} data-w2g-verify-sheet>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-white">
                    {verifyNeedsAttention
                      ? 'Needs attention'
                      : verifyAlreadyDone
                        ? 'Verified slip'
                        : 'Verify slip'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {verifyNeedsAttention
                      ? 'Fix the corners, then we’ll extract the TurboTax fields.'
                      : verifyAlreadyDone
                        ? 'Review or correct fields, then confirm again.'
                        : 'Check the image against the fields, then confirm.'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={verifySaving || attnApplying}
                  onClick={closeVerifySlip}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200 touch-manipulation disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              {verifyError ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
                  data-w2g-alert
                >
                  {verifyError}
                </div>
              ) : null}

              {verifyNeedsAttention ? (
                <div className="space-y-3" data-w2g-attn-panel>
                  <div
                    className="rounded-2xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-100"
                    data-w2g-attn-reason
                  >
                    <div className="inline-flex items-center gap-1.5 font-semibold">
                      <AlertTriangle size={15} aria-hidden />
                      Issue
                    </div>
                    <div className="mt-1 text-rose-100/90">
                      {String(verifySlip?.attention_reason || 'This slip needs a manual corner fix.')}
                    </div>
                  </div>
                  {attnLoading ? (
                    <div className="text-sm text-zinc-400">Loading photo…</div>
                  ) : (
                    <div
                      ref={attnEditorHostRef}
                      className="min-h-[min(52vh,420px)] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
                      data-w2g-attn-editor
                    />
                  )}
                  {attnApplying ? (
                    <div className="text-sm text-zinc-400">Cropping + extracting fields…</div>
                  ) : (
                    <div className="text-xs text-zinc-500">
                      Use Rotate if sideways, drag each handle to a corner, then Apply.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-zinc-800" data-w2g-preview>
                    {verifyImageUrl ? (
                      <button
                        type="button"
                        onClick={() => setVerifyImageExpanded(true)}
                        className="block w-full touch-manipulation"
                        aria-label="Expand slip image"
                      >
                        <img
                          src={verifyImageUrl}
                          alt="W-2G slip"
                          className="mx-auto max-h-[min(40vh,360px)] w-full object-contain"
                        />
                        <div className="mt-1 text-center text-[11px] font-semibold text-zinc-500">
                          Tap to enlarge
                        </div>
                      </button>
                    ) : (
                      <div className="grid min-h-[140px] place-items-center text-sm text-zinc-500">
                        No image preview
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5" data-w2g-ocr>
                    {verifyFieldList.map((field) => {
                      const def = W2G_FIELD_DEFS.find((d) => d.key === field.key)
                      return (
                        <label key={field.key} className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {def?.label || field.label}
                          </span>
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => onVerifyFieldChange(field.key, e.target.value)}
                            disabled={verifyReprocessing}
                            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 disabled:opacity-60"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                      )
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={verifySaving || verifyReprocessing || !verifySlip?.image_path}
                      onClick={() => void onReprocessVerify()}
                      className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-semibold text-zinc-100 touch-manipulation disabled:opacity-60"
                      data-w2g-reprocess
                    >
                      <RefreshCw size={16} aria-hidden className={verifyReprocessing ? 'animate-spin' : undefined} />
                      {verifyReprocessing ? 'Re-processing…' : 'Re-process image'}
                    </button>
                    <button
                      type="button"
                      disabled={verifySaving || verifyReprocessing}
                      onClick={() => void onConfirmVerified()}
                      className="inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-zinc-950 touch-manipulation disabled:opacity-60"
                      data-w2g-verify-confirm
                    >
                      <BadgeCheck size={18} aria-hidden />
                      {verifySaving
                        ? 'Saving…'
                        : verifyAlreadyDone
                          ? 'Save & keep verified'
                          : 'Confirm verified'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {verifyImageExpanded && verifyImageUrl ? (
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/92 px-3 py-[max(1rem,max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))] pb-[max(1rem,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))]"
              style={{ zIndex: Z_APP_ALERT + 10 }}
              role="dialog"
              aria-modal="true"
              aria-label="Expanded W-2G slip"
              data-w2g-verify-lightbox
              onClick={() => setVerifyImageExpanded(false)}
            >
              <button
                type="button"
                onClick={() => setVerifyImageExpanded(false)}
                className="absolute right-3 top-[max(0.75rem,max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))] inline-flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800/90 text-white touch-manipulation"
                aria-label="Close enlarged image"
              >
                <X size={20} aria-hidden />
              </button>
              <img
                src={verifyImageUrl}
                alt="W-2G slip enlarged"
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : null}
          </>,
          document.body,
        )
      : null}
    </>
  )
}
