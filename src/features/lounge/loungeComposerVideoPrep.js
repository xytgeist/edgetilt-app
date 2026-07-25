import { sanitizeVideoCropPx } from '../../utils/loungeVideoCropMath.js'
import {
  LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES,
  LOUNGE_VIDEO_MAX_SECONDS,
  canSkipLoungeVideoWasmEncode,
  deleteCfStreamOrphanAsset,
  probeVideoFileDurationSeconds,
  uploadVideoToCfStreamResumableTus,
  waitForDocumentVisible,
} from '../../utils/loungeVideoUpload'
import { maybeReportLoungeVideoUploadDebug } from './loungeFeedVideoDebugRegistry.js'

/** Auto-retries before surfacing a hard failure to the user (Cloudflare mint / upload / manifest only). */
export const COMPOSER_VIDEO_PREP_MAX_ATTEMPTS = 5

/** Shown under the upload bar while ffmpeg.wasm runs. */
export function loungeVideoEncodingDetail(sourceFile, progressRatio) {
  const bytes = sourceFile?.size
  const mb = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes / (1024 * 1024) : 0
  const sizeHint =
    mb >= 20
      ? `Large source (~${Math.round(mb)} MB) … often 30–60s on this device`
      : 'On-device … usually under a minute'
  if (typeof progressRatio === 'number' && Number.isFinite(progressRatio)) {
    return `${sizeHint} · ${Math.round(Math.max(0, Math.min(1, progressRatio)) * 100)}%`
  }
  return sizeHint
}

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
    import('../../utils/loungeVideoFfmpegTrim').then((m) => m.prefetchFfmpegCore()),
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

  void warmLoungeVideoUploadPipeline(supabaseClient)

  const { trimVideoFileToMp4 } = await import('../../utils/loungeVideoFfmpegTrim')

  /** @type {File} */
  let uploadFile
  /** @type {number} */
  let validatedDurSec
  if (spec.kind === 'direct') {
    const source = spec.file
    report(0.03, 'Reading video metadata', '', 1)
    const sourceDur = await probeVideoFileDurationSeconds(source)
    if (!Number.isFinite(sourceDur) || sourceDur <= 0) {
      throw new Error('Could not read this video file.')
    }
    if (sourceDur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
      throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
    }
    validatedDurSec = sourceDur
    if (canSkipLoungeVideoWasmEncode(source, sourceDur, 'direct')) {
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `fast-path ${source.name || 'video'} ${Math.round((source.size || 0) / (1024 * 1024))}MB`,
      )
      report(0.39, 'Upload ready', 'Already optimized for upload…', 1)
      uploadFile = source
    } else {
      report(0.05, 'Encoding…', loungeVideoEncodingDetail(source, 0), 1)
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `start direct ${source.name || 'video'} ${Math.round((source.size || 0) / (1024 * 1024))}MB`,
      )
      try {
        uploadFile = await trimVideoFileToMp4(source, 0, sourceDur, {
          signal,
          onProgress: (r) =>
            report(0.05 + r * 0.34, 'Encoding…', loungeVideoEncodingDetail(source, r), 1),
        })
        maybeReportLoungeVideoUploadDebug(
          'encode',
          `done direct → ${Math.round((uploadFile.size || 0) / (1024 * 1024))}MB`,
        )
      } catch (encodeErr) {
        const msg = encodeErr instanceof Error ? encodeErr.message : String(encodeErr)
        maybeReportLoungeVideoUploadDebug('encode', `failed direct: ${msg}`)
        if (source.size <= LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
          maybeReportLoungeVideoUploadDebug('encode', 'fallback pass-through original')
          report(0.39, 'Compress skipped', 'Uploading original…', 1)
          uploadFile = source
        } else {
          throw encodeErr
        }
      }
    }
  } else {
    validatedDurSec = Math.max(0, spec.endSec - spec.startSec)
    report(0.05, 'Encoding…', loungeVideoEncodingDetail(spec.sourceFile, 0), 1)
    maybeReportLoungeVideoUploadDebug('encode', `start trim ${spec.sourceFile?.name || 'video'}`)
    const c =
      spec.cropPx && spec.intrinsicWidth > 0 && spec.intrinsicHeight > 0
        ? sanitizeVideoCropPx(spec.intrinsicWidth, spec.intrinsicHeight, spec.cropPx)
        : null
    uploadFile = await trimVideoFileToMp4(spec.sourceFile, spec.startSec, spec.endSec, {
      signal,
      crop: c,
      intrinsicWidth: spec.intrinsicWidth,
      intrinsicHeight: spec.intrinsicHeight,
      onProgress: (r) =>
        report(
          0.05 + r * 0.34,
          'Encoding…',
          loungeVideoEncodingDetail(spec.sourceFile, r),
          1,
        ),
    })
    maybeReportLoungeVideoUploadDebug(
      'encode',
      `done trim → ${Math.round((uploadFile.size || 0) / (1024 * 1024))}MB`,
    )
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (uploadFile.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
    throw new Error('Video must be 200 MB or smaller for upload.')
  }
  if (!Number.isFinite(validatedDurSec) || validatedDurSec <= 0 || validatedDurSec > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
    throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
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
        `Ether attempt ${attempt} of ${COMPOSER_VIDEO_PREP_MAX_ATTEMPTS}`,
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
          report(0.44 + r * 0.46, 'Uploading to Ether', `${Math.round(r * 100)}%`, attempt),
        onVisibilityPause: () =>
          report(
            0.44,
            'Waiting until you are back',
            'Upload paused while EdgeTilt is in the background',
            attempt,
          ),
        onVisibilityResume: () =>
          report(0.44, 'Resuming upload', 'Picking up where you left off...', attempt),
      })
      pendingUid = uid
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      if (skipManifestWait) {
        report(0.92, 'Upload complete', 'Preparing playback on Cloudflare…', attempt)
        report(1, 'Ready', '', attempt)
        return { streamVideoUid: uid }
      }

      const { waitForCfStreamManifestReady } = await import('../../utils/loungeVideoUpload')
      report(0.92, 'Finishing upload', 'Waiting for playback…', attempt)
      await waitForDocumentVisible(signal)
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic: uploadDiagnostic,
        onPoll: ({ elapsed }) => {
          const cap = 120_000
          const t = Math.min(1, elapsed / cap)
          report(0.92 + t * 0.06, 'Finishing upload', `${Math.round(elapsed / 1000)}s`, attempt)
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
      lastErr = e instanceof Error ? e : new Error(String(e))
      report(
        0.42,
        'Retrying',
        'Ether goblins ate your shit...trying again...',
        attempt,
      )
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
export async function runComposerStreamVideoPrepWithRetries({
  supabaseClient,
  signal,
  spec,
  onProgress,
  onEncodedFileReady,
  onUploadDiagnostic,
}) {
  const uploadFile = await encodeComposerVideoFileFromSpec({ signal, spec, supabaseClient, onProgress })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  onEncodedFileReady?.(uploadFile)
  const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
    supabaseClient,
    signal,
    uploadFile,
    onProgress,
    onUploadDiagnostic,
  })
  return { encodedFile: uploadFile, streamVideoUid }
}
