import { sanitizeVideoCropPx } from '../../utils/loungeVideoCropMath.js'
import {
  canPassThroughLoungeVideoOnEncodeFail,
  canSkipLoungeVideoWasmEncode,
  currentLoungeVideoLimits,
  nativeEdgeVideoProgressStep,
  loungeVideoDurationWithinCap,
  loungeVideoFileTooLargeReason,
  loungeVideoTooLongMessage,
  deleteCfStreamOrphanAsset,
  isAndroidBrowser,
  isIOSBrowser,
  isLikelyIphoneScreenRecording,
  isLoungeAndroidBlockedIphoneSpatialDirectUpload,
  isLoungeAndroidBlockedOversizedTrimSource,
  isLoungeCfStreamProcessingError,
  isLoungeVideoQuicktimeMov,
  loungeAndroidIphoneSpatialDirectUploadMessage,
  loungeAndroidOversizedTrimSourceMessage,
  loungeIphoneScreenRecordingEncodeFailMessage,
  probeVideoFileDurationSeconds,
  resolveLoungeVideoForceWasmEncode,
  uploadVideoToCfStreamResumableTus,
  waitForDocumentVisible,
} from '../../utils/loungeVideoUpload'
import {
  attachLoungeVideoPrepStreamUid,
  maybeReportLoungeVideoUploadDebug,
  recordLoungeVideoPrepOutcome,
} from './loungeFeedVideoDebugRegistry.js'
import { shouldPrefetchBrowserVideoAudio } from '../../utils/loungeVideoBrowserAudio.js'
import { prefetchFfmpegCore, trimVideoFileToMp4 } from '../../utils/loungeVideoFfmpegTrim.js'
import {
  cancelEdgeVideo,
  exportEdgeVideo,
  uploadEdgeVideoTus,
} from '../../utils/edgeNative.js'

/** Auto-retries before surfacing a hard failure to the user (Cloudflare mint / upload / manifest only). */
export const COMPOSER_VIDEO_PREP_MAX_ATTEMPTS = 5

/**
 * Classify a media-prep failure for the retry dialog (headline + last-step label).
 *
 * @param {string} message
 * @param {string} [lastStatus] last upload-bar `status` when available
 */
export function loungeMediaPrepFailureDetails(message, lastStatus = '') {
  const msg = String(message || '').trim() || 'Video upload failed after multiple attempts.'
  const msgLower = msg.toLowerCase()
  const stLower = String(lastStatus || '').toLowerCase()
  if (
    msgLower.includes('cannot be posted from android') ||
    msgLower.includes('cannot be posted directly on android')
  ) {
    return {
      phase: 'Preparing video…',
      dialogTitle: 'Video not supported on Android',
      message: msg,
    }
  }
  const encodeLike =
    msgLower.includes('encoding failed') ||
    msgLower.includes('ffmpeg') ||
    msgLower.includes('invalid trim range') ||
    msgLower.includes('could not read video') ||
    msgLower.includes('could not read this video') ||
    msgLower.includes('empty output') ||
    stLower.includes('encoding') ||
    stLower.includes('validating')
  if (encodeLike) {
    return { phase: 'Encoding video…', dialogTitle: 'Video encoding failed.', message: msg }
  }
  if (
    stLower.includes('uploading') ||
    stLower.includes('preparing upload') ||
    stLower.includes('resuming') ||
    msgLower.includes('upload') ||
    msgLower.includes('tus') ||
    msgLower.includes('stream')
  ) {
    return { phase: 'Uploading media…', dialogTitle: 'Media upload failed', message: msg }
  }
  if (
    stLower.includes('finishing') ||
    stLower.includes('waiting for playback') ||
    stLower.includes('processing')
  ) {
    return { phase: 'Processing video…', dialogTitle: 'Video processing failed.', message: msg }
  }
  return { phase: 'Preparing video…', dialogTitle: 'Media upload failed', message: msg }
}

/** @param {string} status @param {string} detail */
function debugComposerVideoProgress(status, detail) {
  const line = detail ? `${status} · ${detail}` : status
  maybeReportLoungeVideoUploadDebug('upload', line)
}

function warmLoungeVideoUploadPipeline(supabaseClient) {
  return Promise.all([
    prefetchFfmpegCore(),
    supabaseClient ? supabaseClient.auth.getSession() : Promise.resolve(null),
    import('tus-js-client').catch(() => null),
  ])
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Backoff only while the tab is foregrounded (iOS freezes timers when locked). */
async function sleepWhileVisible(ms, signal) {
  await waitForDocumentVisible(signal)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const end = Date.now() + Math.max(0, Number(ms) || 0)
  while (Date.now() < end) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await waitForDocumentVisible(signal)
      continue
    }
    const remaining = end - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(remaining, 500))
  }
}

/**
 * On-device encode (trim or full clip) - once per logical clip. Compresses before Stream upload when needed.
 *
 * @param {object} opts
 * @param {AbortSignal} opts.signal
 * @param {{ kind: 'direct', file: File } | { kind: 'trim', sourceFile: File, startSec: number, endSec: number, cropPx: { x: number, y: number, w: number, h: number } | null, intrinsicWidth: number, intrinsicHeight: number }} opts.spec
 * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabaseClient] warms tus session while encoding
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @returns {Promise<File>}
 */
export async function encodeComposerVideoFileFromSpec({ signal, spec, supabaseClient, onProgress }) {
  const report = (progress, status, detail, attempt) => {
    debugComposerVideoProgress(status, detail)
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status: String(status || ''),
      detail: detail ? String(detail) : '',
      attempt,
    })
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const limits = currentLoungeVideoLimits()
  maybeReportLoungeVideoUploadDebug('encode', 'encode start')
  report(0.02, 'Opening encoder', '', 1)

  void warmLoungeVideoUploadPipeline(supabaseClient)

  /** @type {File} */
  let uploadFile
  /** @type {number} */
  let validatedDurSec
  if (spec.kind === 'direct') {
    const source = spec.file
    const sourceMb = Math.round((source.size || 0) / (1024 * 1024))
    maybeReportLoungeVideoUploadDebug('encode', `prep direct ${source.name || 'video'} ${sourceMb}MB`)
    report(0.03, 'Reading video metadata', '', 1)
    const sourceDur = await probeVideoFileDurationSeconds(source)
    if (!Number.isFinite(sourceDur) || sourceDur <= 0) {
      throw new Error('Could not read this video file.')
    }
    if (!loungeVideoDurationWithinCap(sourceDur, limits)) {
      throw new Error(loungeVideoTooLongMessage(limits.maxSeconds))
    }
    validatedDurSec = sourceDur
    if (isLoungeAndroidBlockedIphoneSpatialDirectUpload(source)) {
      throw new Error(loungeAndroidIphoneSpatialDirectUploadMessage())
    }
    const forceWasmEncode = await resolveLoungeVideoForceWasmEncode(source)
    if (forceWasmEncode) {
      const forceReason = isLikelyIphoneScreenRecording(source)
        ? 'screen-recording name'
        : isIOSBrowser() && isLoungeVideoQuicktimeMov(source)
          ? 'ios mov'
          : 'ios screen dimensions'
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `force wasm (${forceReason}) ${source.name || 'video'} ${sourceMb}MB`,
      )
    }
    if (!forceWasmEncode && canSkipLoungeVideoWasmEncode(source, sourceDur, 'direct', limits)) {
      const androidDirect = isAndroidBrowser()
      maybeReportLoungeVideoUploadDebug(
        'encode',
        androidDirect
          ? `fast-path android direct ${sourceMb}MB (CF Stream transcode)`
          : `fast-path ${source.name || 'video'} ${sourceMb}MB`,
      )
      recordLoungeVideoPrepOutcome({
        outcome: 'fast-path',
        sourceMb,
        outputMb: sourceMb,
        durSec: validatedDurSec,
        detail: androidDirect ? 'android direct' : source.name || 'video',
      })
      report(
        0.39,
        'Upload ready',
        '',
        1,
      )
      uploadFile = source
    } else {
      const needsBrowserAudio = shouldPrefetchBrowserVideoAudio(source)
      const encodePhaseLabel = (r) =>
        needsBrowserAudio && r < 0.12 ? 'Capturing audio…' : 'Encoding…'
      report(0.05, encodePhaseLabel(0), '', 1)
      maybeReportLoungeVideoUploadDebug('encode', `start direct ${source.name || 'video'} ${sourceMb}MB`)
      try {
        uploadFile = await trimVideoFileToMp4(source, 0, sourceDur, {
          signal,
          onProgress: (r) =>
            report(0.05 + r * 0.34, encodePhaseLabel(r), '', 1),
        })
        const outMb = Math.round((uploadFile.size || 0) / (1024 * 1024))
        maybeReportLoungeVideoUploadDebug('encode', `done direct → ${outMb}MB`)
        recordLoungeVideoPrepOutcome({
          outcome: 'wasm',
          sourceMb,
          outputMb: outMb,
          durSec: validatedDurSec,
          detail: source.name || 'video',
        })
      } catch (encodeErr) {
        const msg = encodeErr instanceof Error ? encodeErr.message : String(encodeErr)
        maybeReportLoungeVideoUploadDebug('encode', `failed direct: ${msg}`)
        if (canPassThroughLoungeVideoOnEncodeFail(source)) {
          maybeReportLoungeVideoUploadDebug(
            'encode',
            'fallback pass-through original (CF Stream transcode)',
          )
          recordLoungeVideoPrepOutcome({
            outcome: 'pass-through',
            sourceMb,
            outputMb: sourceMb,
            durSec: validatedDurSec,
            detail: msg.slice(0, 200),
          })
          report(0.39, 'Compress skipped', '', 1)
          uploadFile = source
        } else {
          recordLoungeVideoPrepOutcome({
            outcome: 'wasm-failed',
            sourceMb,
            outputMb: 0,
            durSec: validatedDurSec,
            detail: msg.slice(0, 200),
          })
          if (forceWasmEncode) {
            throw new Error(loungeIphoneScreenRecordingEncodeFailMessage())
          }
          throw encodeErr
        }
      }
    }
  } else {
    validatedDurSec = Math.max(0, spec.endSec - spec.startSec)
    const c =
      spec.cropPx && spec.intrinsicWidth > 0 && spec.intrinsicHeight > 0
        ? sanitizeVideoCropPx(spec.intrinsicWidth, spec.intrinsicHeight, spec.cropPx)
        : null
    const trimSourceMb = Math.round((spec.sourceFile.size || 0) / (1024 * 1024))
    const trimForceWasmEncode = await resolveLoungeVideoForceWasmEncode(spec.sourceFile)
    if (trimForceWasmEncode) {
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `screen-recording trim → force wasm (${spec.sourceFile?.name || 'video'} ${trimSourceMb}MB)`,
      )
    }

    if (isLoungeAndroidBlockedOversizedTrimSource(spec.sourceFile)) {
      throw new Error(loungeAndroidOversizedTrimSourceMessage())
    }

    if (isAndroidBrowser()) {
      maybeReportLoungeVideoUploadDebug('encode', `start android trim ${spec.sourceFile?.name || 'video'}`)
      let androidTrimStatus = 'Encoding…'
      report(0.05, androidTrimStatus, '', 1)
      try {
        const { prepAndroidChromeTrimUploadFile } = await import('../../utils/loungeVideoWebCodecsTrim.js')
        const androidTrim = await prepAndroidChromeTrimUploadFile(
          spec.sourceFile,
          spec.startSec,
          spec.endSec,
          {
            signal,
            crop: c,
            intrinsicWidth: spec.intrinsicWidth,
            intrinsicHeight: spec.intrinsicHeight,
            onProgress: (r) => {
              report(0.05 + r * 0.34, androidTrimStatus, '', 1)
            },
            onStatus: (status) => {
              androidTrimStatus = String(status || 'Encoding…')
            },
            onDebug: (detail) => maybeReportLoungeVideoUploadDebug('encode', detail),
          },
        )
        uploadFile = androidTrim.file
        const outMb = Math.round((uploadFile.size || 0) / (1024 * 1024))
        maybeReportLoungeVideoUploadDebug(
          'encode',
          `done android ${androidTrim.outcome} → ${outMb}MB`,
        )
        recordLoungeVideoPrepOutcome({
          outcome: androidTrim.outcome,
          sourceMb: trimSourceMb,
          outputMb: outMb,
          durSec: validatedDurSec,
          detail: androidTrim.detail,
        })
      } catch (trimErr) {
        const msg = trimErr instanceof Error ? trimErr.message : String(trimErr)
        maybeReportLoungeVideoUploadDebug('encode', `failed android trim: ${msg}`)
        recordLoungeVideoPrepOutcome({
          outcome: 'wasm-failed',
          sourceMb: trimSourceMb,
          outputMb: 0,
          durSec: validatedDurSec,
          detail: msg.slice(0, 200),
        })
        if (trimForceWasmEncode) {
          throw new Error(loungeIphoneScreenRecordingEncodeFailMessage())
        }
        throw trimErr
      }
    } else {
      report(0.05, 'Encoding…', '', 1)
      maybeReportLoungeVideoUploadDebug('encode', `start trim ${spec.sourceFile?.name || 'video'}`)
      try {
        uploadFile = await trimVideoFileToMp4(spec.sourceFile, spec.startSec, spec.endSec, {
          signal,
          crop: c,
          intrinsicWidth: spec.intrinsicWidth,
          intrinsicHeight: spec.intrinsicHeight,
          onProgress: (r) =>
            report(0.05 + r * 0.34, 'Encoding…', '', 1),
        })
        const outMb = Math.round((uploadFile.size || 0) / (1024 * 1024))
        maybeReportLoungeVideoUploadDebug('encode', `done trim → ${outMb}MB`)
        recordLoungeVideoPrepOutcome({
          outcome: 'wasm',
          sourceMb: trimSourceMb,
          outputMb: outMb,
          durSec: validatedDurSec,
          detail: `trim ${spec.sourceFile?.name || 'video'}`,
        })
      } catch (encodeErr) {
        const msg = encodeErr instanceof Error ? encodeErr.message : String(encodeErr)
        maybeReportLoungeVideoUploadDebug('encode', `failed trim: ${msg}`)
        recordLoungeVideoPrepOutcome({
          outcome: 'wasm-failed',
          sourceMb: trimSourceMb,
          outputMb: 0,
          durSec: validatedDurSec,
          detail: msg.slice(0, 200),
        })
        if (trimForceWasmEncode) {
          throw new Error(loungeIphoneScreenRecordingEncodeFailMessage())
        }
        throw encodeErr
      }
    }
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const tooLarge = loungeVideoFileTooLargeReason(uploadFile, limits)
  if (tooLarge) throw new Error(tooLarge)
  if (!loungeVideoDurationWithinCap(validatedDurSec, limits)) {
    throw new Error(loungeVideoTooLongMessage(limits.maxSeconds))
  }

  return uploadFile
}

/**
 * Mint → resumable tus upload → (optional) manifest wait - with retries on failure.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {AbortSignal} opts.signal
 * @param {File} opts.uploadFile
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @param {(detail: string) => void} [opts.onUploadDiagnostic] Last error line for the upload bar
 * @param {(uid: string) => void} [opts.onStreamUidAvailable] Called as soon as the CF Stream uid is
 *   captured from the tus first-chunk header - before the rest of the file is uploaded.
 *   Fired on every attempt so callers should be idempotent (first call wins in most use-cases).
 * @param {boolean} [opts.skipManifestWait=true] When true, resolve after tus upload (feed tile handles CF processing).
 * @returns {Promise<{ streamVideoUid: string }>}
 */
export async function uploadEncodedVideoToCfStreamWithRetries({
  supabaseClient,
  signal,
  uploadFile,
  onProgress,
  onUploadDiagnostic,
  onStreamUidAvailable,
  skipManifestWait = true,
}) {
  const report = (progress, status, detail, attempt) => {
    debugComposerVideoProgress(status, detail)
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status: String(status || ''),
      detail: detail ? String(detail) : '',
      attempt,
    })
  }

  const uploadDiagnostic = (detail) => {
    const d = String(detail || '').trim()
    if (d) maybeReportLoungeVideoUploadDebug('upload', d)
    onUploadDiagnostic?.(d)
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  /** @type {Error | null} */
  let lastErr = null

  for (let attempt = 1; attempt <= COMPOSER_VIDEO_PREP_MAX_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    let pendingUid = null
    try {
      report(
        0.42,
        'Preparing upload',
        '',
        attempt,
      )

      report(0.44, 'Starting resumable upload', '', attempt)
      const { uid } = await uploadVideoToCfStreamResumableTus(supabaseClient, uploadFile, {
        signal,
        onUploadDiagnostic: uploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingUid = id
          onStreamUidAvailable?.(id)
        },
        onProgress: (r) =>
          report(0.44 + r * 0.46, 'Uploading to Ether', '', attempt),
        onVisibilityPause: () =>
          report(0.44, 'Waiting until you are back', '', attempt),
        onVisibilityResume: () => report(0.44, 'Resuming upload', '', attempt),
      })
      pendingUid = uid
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      if (skipManifestWait) {
        report(0.92, 'Upload complete', '', attempt)
        report(1, 'Ready', '', attempt)
        return { streamVideoUid: uid }
      }

      const { waitForCfStreamManifestReady } = await import('../../utils/loungeVideoUpload')
      report(0.92, 'Finishing upload', '', attempt)
      await waitForDocumentVisible(signal)
      await waitForCfStreamManifestReady(uid, {
        signal,
        supabaseClient,
        onUploadDiagnostic: uploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.92 + t * 0.06, 'Finishing upload', '', attempt)
        },
      })

      report(1, 'Ready', '', attempt)
      return { streamVideoUid: uid }
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e && /** @type {{ name?: string }} */ (e).name === 'AbortError') {
        if (pendingUid) {
          await deleteCfStreamOrphanAsset(supabaseClient, pendingUid)
        }
        throw e
      }
      if (isLoungeCfStreamProcessingError(e)) throw e
      lastErr = e instanceof Error ? e : new Error(String(e))
      report(0.42, 'Retrying…', '', attempt)
      // Do NOT delete the CF asset on intermediate failures.
      // Fingerprint resume (findPreviousUploads) continues from the last ACK'd byte.
      // Critical on iOS where background network drops can happen at 98%+.
      // The CF upload URL stays valid for 6 hours; the orphan purge cron handles
      // any assets that are truly abandoned after all attempts fail.
      if (attempt >= COMPOSER_VIDEO_PREP_MAX_ATTEMPTS && pendingUid) {
        await deleteCfStreamOrphanAsset(supabaseClient, pendingUid)
      }
      if (attempt < COMPOSER_VIDEO_PREP_MAX_ATTEMPTS) {
        // Back off only while foregrounded so iOS timers aren't frozen mid-wait.
        await sleepWhileVisible(2000 + attempt * 3500, signal)
      }
    }
  }

  throw lastErr || new Error('Video upload failed after multiple attempts.')
}

/**
 * Encode (when trim), upload to Cloudflare Stream (tus), wait for manifest - with retries on failure.
 * On-device encode and duration checks run once; retries repeat only tus creation/upload → manifest.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {AbortSignal} opts.signal
 * @param {{ kind: 'direct', file: File } | { kind: 'trim', sourceFile: File, startSec: number, endSec: number, cropPx: { x: number, y: number, w: number, h: number } | null, intrinsicWidth: number, intrinsicHeight: number }} opts.spec
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @param {(file: File) => void} [opts.onEncodedFileReady] Called once after encode + validation, before Cloudflare attempts (for post-job reuse without re-encoding).
 * @param {(detail: string) => void} [opts.onUploadDiagnostic] Shown in the Lounge upload bar `detail` on mint/upload/manifest failures.
 * @returns {Promise<{ encodedFile: File, streamVideoUid: string }>}
 */
/**
 * After encode/upload, swap the composer slot to the finished clip.
 * A native upload has no `File` ... keep the poster still already on the slot.
 *
 * @param {object | null | undefined} prev
 * @param {File | null | undefined} encodedFile
 * @param {string} streamVideoUid
 * @param {number} jobId
 */
export function loungeVideoSlotAfterPrep(prev, encodedFile, streamVideoUid, jobId) {
  if (!prev || prev.prepJobId !== jobId) return prev
  const hasFile = encodedFile instanceof File && encodedFile.size > 0
  if (!hasFile) {
    return {
      ...prev,
      file: null,
      streamVideoUid,
      preview: prev.preview || prev.posterUrl || '',
      posterUrl: prev.posterUrl || prev.preview || null,
      prepStatus: 'ready',
      prepError: '',
    }
  }
  const oldPreview = prev.preview
  const oldPoster = prev.posterUrl
  const vidUrl = URL.createObjectURL(encodedFile)
  const posterToKeep =
    typeof oldPoster === 'string' && oldPoster && oldPoster !== vidUrl
      ? oldPoster
      : typeof oldPreview === 'string' && oldPreview && oldPreview !== vidUrl
        ? oldPreview
        : null
  const revoke = (url) => {
    if (typeof url !== 'string' || !url.startsWith('blob:') || url === posterToKeep) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
  revoke(oldPreview)
  if (oldPoster && oldPoster !== posterToKeep) revoke(oldPoster)
  return {
    ...prev,
    file: encodedFile,
    streamVideoUid,
    preview: vidUrl,
    posterUrl: posterToKeep,
    prepStatus: 'ready',
    prepError: '',
  }
}

async function runNativeEdgeVideoStreamPrep({ supabaseClient, signal, spec, onProgress, onEncodeFinished }) {
  const report = (progress, status) => {
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status,
      detail: '',
      attempt: 1,
    })
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  maybeReportLoungeVideoUploadDebug('encode', 'native export')
  report(0.05, 'Checking video…')

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  const accessToken = session?.access_token || ''
  if (!accessToken) throw new Error('You must be signed in to post a video.')

  const sourceId = String(spec.assetId || '')
  const watchedIds = new Set([sourceId])
  const onNativeProgress = (event) => {
    const detail = event?.detail || {}
    const id = String(detail.assetId || '')
    if (id && !watchedIds.has(id)) return
    const step = nativeEdgeVideoProgressStep(detail)
    if (step.step === 'uploading') report(0.42 + step.progress * 0.56, 'Uploading…')
    else if (step.step === 'encoding') report(0.08 + step.progress * 0.32, 'Encoding…')
    else report(0.05, 'Checking video…')
  }
  window.addEventListener('edge-native-video-progress', onNativeProgress)
  let cancelId = sourceId
  const onAbort = () => {
    void cancelEdgeVideo(cancelId)
  }
  signal?.addEventListener('abort', onAbort)

  try {
    const limits = currentLoungeVideoLimits()
    const exported = await exportEdgeVideo({
      assetId: sourceId,
      startSec: spec.startSec,
      endSec: spec.endSec,
      cropPx: spec.cropPx || null,
      intrinsicWidth: spec.intrinsicWidth,
      intrinsicHeight: spec.intrinsicHeight,
      maxClipSeconds: limits.maxSeconds + limits.slackSeconds,
      maxUploadBytes: limits.maxBytes,
    })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!exported?.ok || !exported.assetId) {
      throw new Error(exported?.error || 'Could not prepare that video.')
    }
    watchedIds.add(String(exported.assetId))
    cancelId = String(exported.assetId)
    onEncodeFinished?.()
    maybeReportLoungeVideoUploadDebug('encode', 'native upload')
    report(0.42, 'Uploading…')
    const uploaded = await uploadEdgeVideoTus({
      assetId: exported.assetId,
      accessToken,
      supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || ''),
      anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || ''),
      streamMaxDurationSeconds: limits.streamMaxDurationSeconds,
      maxUploadBytes: limits.maxBytes,
    })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const uid = String(uploaded?.streamVideoUid || '').trim()
    if (!uploaded?.ok || !uid) {
      throw new Error('Video upload finished but the service did not return a video id.')
    }
    maybeReportLoungeVideoUploadDebug('encode', 'native ready')
    report(1, 'Upload ready')
    return { encodedFile: null, streamVideoUid: uid }
  } catch (err) {
    if (err?.name === 'AbortError' || /cancelled/i.test(String(err?.message || ''))) {
      throw new DOMException('Aborted', 'AbortError')
    }
    throw err instanceof Error ? err : new Error(String(err || 'Video upload failed.'))
  } finally {
    window.removeEventListener('edge-native-video-progress', onNativeProgress)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function runComposerStreamVideoPrepWithRetries({
  supabaseClient,
  signal,
  spec,
  onProgress,
  onEncodedFileReady,
  onEncodeFinished,
  onUploadDiagnostic,
}) {
  if (spec?.kind === 'native' && spec.assetId) {
    return runNativeEdgeVideoStreamPrep({ supabaseClient, signal, spec, onProgress, onEncodeFinished })
  }
  const uploadFile = await encodeComposerVideoFileFromSpec({ signal, spec, supabaseClient, onProgress })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  onEncodedFileReady?.(uploadFile)
  onEncodeFinished?.()
  const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
    supabaseClient,
    signal,
    uploadFile,
    onProgress,
    onUploadDiagnostic,
  })
  attachLoungeVideoPrepStreamUid(streamVideoUid, uploadFile)
  return { encodedFile: uploadFile, streamVideoUid }
}
