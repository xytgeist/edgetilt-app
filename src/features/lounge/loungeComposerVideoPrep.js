import { sanitizeVideoCropPx } from '../../utils/loungeVideoCropMath.js'
import {
  LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES,
  LOUNGE_VIDEO_MAX_SECONDS,
  deleteCfStreamOrphanAsset,
  probeVideoFileDurationSeconds,
  uploadVideoToCfStreamResumableTus,
  waitForCfStreamManifestReady,
} from '../../utils/loungeVideoUpload'

/** Auto-retries before surfacing a hard failure to the user (Cloudflare mint / upload / manifest only). */
export const COMPOSER_VIDEO_PREP_MAX_ATTEMPTS = 5

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * On-device encode (trim) or pass-through file — once per logical clip.
 *
 * @param {object} opts
 * @param {AbortSignal} opts.signal
 * @param {{ kind: 'direct', file: File } | { kind: 'trim', sourceFile: File, startSec: number, endSec: number, cropPx: { x: number, y: number, w: number, h: number } | null, intrinsicWidth: number, intrinsicHeight: number }} opts.spec
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @returns {Promise<File>}
 */
export async function encodeComposerVideoFileFromSpec({ signal, spec, onProgress }) {
  const report = (progress, status, detail, attempt) => {
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status: String(status || ''),
      detail: detail ? String(detail) : '',
      attempt,
    })
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  /** @type {File} */
  let uploadFile
  if (spec.kind === 'direct') {
    uploadFile = spec.file
    report(0.08, 'Validating video', '', 1)
  } else {
    report(0.05, 'Encoding clip', 'On-device…', 1)
    const { trimVideoFileToMp4 } = await import('../../utils/loungeVideoFfmpegTrim')
    const c =
      spec.cropPx && spec.intrinsicWidth > 0 && spec.intrinsicHeight > 0
        ? sanitizeVideoCropPx(spec.intrinsicWidth, spec.intrinsicHeight, spec.cropPx)
        : null
    uploadFile = await trimVideoFileToMp4(spec.sourceFile, spec.startSec, spec.endSec, {
      signal,
      crop: c,
      intrinsicWidth: spec.intrinsicWidth,
      intrinsicHeight: spec.intrinsicHeight,
      onProgress: (r) => report(0.05 + r * 0.34, 'Encoding clip', `${Math.round(r * 100)}%`, 1),
    })
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (uploadFile.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
    throw new Error('Video must be 200 MB or smaller for upload.')
  }
  report(0.4, 'Reading video metadata', '', 1)
  const dur = await probeVideoFileDurationSeconds(uploadFile)
  if (!Number.isFinite(dur) || dur > LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
    throw new Error(`Video must be ${LOUNGE_VIDEO_MAX_SECONDS} seconds or shorter.`)
  }

  return uploadFile
}

/**
 * Mint → resumable tus upload → manifest retries only (caller supplies the encoded `File`).
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseClient
 * @param {AbortSignal} opts.signal
 * @param {File} opts.uploadFile
 * @param {(info: { progress: number, status: string, detail?: string, attempt: number }) => void} [opts.onProgress]
 * @param {(detail: string) => void} [opts.onUploadDiagnostic] Last error line for the upload bar
 * @returns {Promise<{ streamVideoUid: string }>}
 */
export async function uploadEncodedVideoToCfStreamWithRetries({
  supabaseClient,
  signal,
  uploadFile,
  onProgress,
  onUploadDiagnostic,
}) {
  const report = (progress, status, detail, attempt) => {
    if (typeof onProgress !== 'function') return
    onProgress({
      progress: Math.max(0, Math.min(1, progress)),
      status: String(status || ''),
      detail: detail ? String(detail) : '',
      attempt,
    })
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
        onUploadDiagnostic,
        onStreamUidAvailable: (id) => {
          pendingUid = id
        },
        onProgress: (r) =>
          report(0.44 + r * 0.46, 'Uploading to Ether', `${Math.round(r * 100)}%`, attempt),
      })
      pendingUid = uid
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      report(0.92, 'Finishing upload', 'Waiting for playback…', attempt)
      await waitForCfStreamManifestReady(uid, {
        signal,
        onUploadDiagnostic,
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
      if (pendingUid) {
        await deleteCfStreamOrphanAsset(supabaseClient, pendingUid)
      }
      lastErr = e instanceof Error ? e : new Error(String(e))
      report(
        0.42,
        'Retrying',
        'Ether goblins ate your shit...trying again...',
        attempt,
      )
      if (attempt < COMPOSER_VIDEO_PREP_MAX_ATTEMPTS) {
        await sleep(500 + attempt * 350)
      }
    }
  }

  throw lastErr || new Error('Video upload failed after multiple attempts.')
}

/**
 * Encode (when trim), upload to Cloudflare Stream (tus), wait for manifest — with retries on failure.
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
  const uploadFile = await encodeComposerVideoFileFromSpec({ signal, spec, onProgress })
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
