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
 * On-device encode (trim) or pass-through file - once per logical clip.
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
 * @param {boolean} [opts.skipManifestWait] When true, resolve immediately after upload without
 *   polling the HLS manifest. Use for chat where CF iframe handles the processing state gracefully.
 * @returns {Promise<{ streamVideoUid: string }>}
 */
export async function uploadEncodedVideoToCfStreamWithRetries({
  supabaseClient,
  signal,
  uploadFile,
  onProgress,
  onUploadDiagnostic,
  onStreamUidAvailable,
  skipManifestWait = false,
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
          onStreamUidAvailable?.(id)
        },
        onProgress: (r) =>
          report(0.44 + r * 0.46, 'Uploading to Ether', `${Math.round(r * 100)}%`, attempt),
      })
      pendingUid = uid
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      if (skipManifestWait) {
        report(1, 'Ready', '', attempt)
        return { streamVideoUid: uid }
      }

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
      lastErr = e instanceof Error ? e : new Error(String(e))
      report(
        0.42,
        'Retrying',
        'Ether goblins ate your shit...trying again...',
        attempt,
      )
      // Do NOT delete the CF asset on intermediate failures.
      // tus-js-client stores the TUS URL fingerprint in localStorage; the next attempt
      // will resume from the last ACK'd byte rather than re-uploading the whole file.
      // This is critical on iOS where background network drops can happen at 98%+.
      // The CF upload URL stays valid for 6 hours; the orphan purge cron handles
      // any assets that are truly abandoned after all attempts fail.
      if (attempt >= COMPOSER_VIDEO_PREP_MAX_ATTEMPTS && pendingUid) {
        await deleteCfStreamOrphanAsset(supabaseClient, pendingUid)
      }
      if (attempt < COMPOSER_VIDEO_PREP_MAX_ATTEMPTS) {
        // Back off long enough for iOS to return to foreground after a background drop.
        // Old: 500 + attempt*350 ms (max ~2s). New: ramps from 4s to 16s.
        await sleep(2000 + attempt * 3500)
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
