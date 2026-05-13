/**
 * Short, user-safe line for the in-app upload bar `detail` (no tokens/URLs).
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function formatTelemetryBarLine(row) {
  const phase = String(row.phase || '')
  const outcome = String(row.outcome || '')
  if (phase === 'cf_stream_mint_supabase') {
    const st = row.httpStatus != null && row.httpStatus !== '' ? `HTTP ${row.httpStatus}` : 'unknown status'
    if (outcome === 'incomplete_payload') return `Mint failed — incomplete response (${st})`
    if (outcome === 'invalid_response_body') return `Mint failed — bad response (${st})`
    const msg = row.message ? String(row.message).replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    return msg ? `Mint (${st}): ${msg}` : `Mint failed (${st})`
  }
  if (phase === 'cf_stream_direct_multipart_post') {
    const tr = String(row.transport || '')
    const st = row.httpStatus != null && Number(row.httpStatus) > 0 ? `HTTP ${row.httpStatus}` : ''
    let pct = ''
    if (row.uploadProgressApprox != null && Number.isFinite(Number(row.uploadProgressApprox))) {
      pct = ` ~${Math.round(Number(row.uploadProgressApprox) * 100)}%`
    }
    const bl = row.bytesLoaded
    const bt = row.bytesTotal
    const bytes =
      typeof bl === 'number' && typeof bt === 'number' && bt > 0
        ? ` ${(bl / (1024 * 1024)).toFixed(1)}/${(bt / (1024 * 1024)).toFixed(1)} MB`
        : ''
    if (outcome === 'http_error') return `Upload failed${st ? ` ${st}` : ''}${pct}${bytes}`.trim()
    if (outcome === 'xhr_onerror') return `Upload interrupted${pct}${bytes}${tr ? ` (${tr})` : ''}`.trim()
    if (outcome === 'fetch_throw')
      return `Upload failed: ${String(row.message || 'network').replace(/\s+/g, ' ').trim().slice(0, 100)}`
    if (outcome === 'send_throw')
      return `Upload could not start: ${String(row.message || '').replace(/\s+/g, ' ').trim().slice(0, 100)}`
    return `Upload issue: ${outcome || 'unknown'}`
  }
  if (phase === 'cf_stream_tus') {
    const st = row.httpStatus != null && Number(row.httpStatus) > 0 ? `HTTP ${row.httpStatus}` : ''
    let pct = ''
    if (row.uploadProgressApprox != null && Number.isFinite(Number(row.uploadProgressApprox))) {
      pct = ` ~${Math.round(Number(row.uploadProgressApprox) * 100)}%`
    }
    const bl = row.bytesLoaded
    const bt = row.bytesTotal
    const bytes =
      typeof bl === 'number' && typeof bt === 'number' && bt > 0
        ? ` ${(bl / (1024 * 1024)).toFixed(1)}/${(bt / (1024 * 1024)).toFixed(1)} MB`
        : ''
    if (outcome === 'http_error') return `Resumable upload failed${st ? ` ${st}` : ''}${pct}${bytes}`.trim()
    if (outcome === 'missing_uid') return `Upload finished but no video id (${st || 'unknown status'})`.trim()
    if (outcome === 'client_throw')
      return `Upload error: ${String(row.message || '').replace(/\s+/g, ' ').trim().slice(0, 100)}`
    return `Resumable upload: ${outcome || 'unknown'}`
  }
  if (phase === 'cf_stream_manifest_poll' && outcome === 'timeout') {
    const last = row.lastPollHttpStatus != null ? ` Last check: HTTP ${row.lastPollHttpStatus}.` : ''
    return `Still processing (timed out).${last} Try again shortly.`.trim()
  }
  return ''
}

/**
 * Failure telemetry: `console.warn('[lounge-video-upload]', …)`, optional `__onLoungeVideoUploadTelemetry`,
 * and optional `onUploadDiagnostic` for the Lounge upload bar `detail` (no secrets / full URLs).
 * @param {Record<string, unknown>} payload
 * @param {(detail: string) => void} [onUploadDiagnostic]
 */
export function logLoungeVideoUploadTelemetry(payload, onUploadDiagnostic) {
  const row = {
    ts: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 280) : '',
    ...payload,
  }
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.__onLoungeVideoUploadTelemetry === 'function') {
      globalThis.__onLoungeVideoUploadTelemetry(row)
    }
  } catch {
    // ignore third-party hook failures
  }
  console.warn('[lounge-video-upload]', row)
  const barLine = formatTelemetryBarLine(row)
  if (barLine && typeof onUploadDiagnostic === 'function') {
    try {
      onUploadDiagnostic(barLine.slice(0, 280))
    } catch {
      // ignore UI hook failures
    }
  }
}

/** Origin + pathname only (no query — may contain short-lived tokens). */
function telemetryUploadUrlShape(uploadURL) {
  const s = String(uploadURL || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    return `${u.host}${u.pathname}`
  } catch {
    return 'invalid-url'
  }
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Max length for Lounge video posts (product cap; client validation). */
export const LOUNGE_VIDEO_MAX_SECONDS = 60

/** Cloudflare `maxDurationSeconds` is set slightly above the product cap so a clip that measures ~59s in an editor but ~60.1s in the browser/encoder is not rejected at the API. */
export const LOUNGE_CF_STREAM_MAX_DURATION_SECONDS = 75

/** Cloudflare Stream basic POST direct upload limit. */
export const LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/** Same window as `lounge-cf-stream-direct-upload` / tus-create Edge (`expiry` metadata). */
export const LOUNGE_CF_STREAM_UPLOAD_EXPIRY_MS = 6 * 60 * 60 * 1000

/** Cloudflare Stream vod uid (32 hex). */
const CF_STREAM_VIDEO_UID_RE = /^[0-9a-f]{32}$/i

export function cfStreamManifestUrl(uid) {
  const id = String(uid || '').trim()
  if (!id) return ''
  return `https://videodelivery.net/${id}/manifest/video.m3u8`
}

export function cfStreamPosterUrl(uid, height = 720) {
  const id = String(uid || '').trim()
  if (!id) return ''
  return `https://videodelivery.net/${id}/thumbnails/thumbnail.jpg?height=${encodeURIComponent(String(height))}&fit=crop`
}

/** Max wait for local file duration (iOS can delay `loadedmetadata` on long clips). */
const PROBE_DURATION_TIMEOUT_MS = 45000

/**
 * Read duration from a local video file (metadata only).
 * Safari/iOS often fires `durationchange` after (or instead of) `loadedmetadata` for camera MOV/HEVC.
 * @returns {Promise<number>} seconds (>0) or NaN if unknown
 */
export function probeVideoFileDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof URL === 'undefined' || typeof document === 'undefined') {
      resolve(NaN)
      return
    }
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.src = url
    let settled = false
    const cleanup = () => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
      try {
        v.removeAttribute('src')
        v.load()
      } catch {
        // ignore
      }
    }
    const finishOk = () => {
      if (settled) return
      const d = v.duration
      if (!Number.isFinite(d) || d <= 0) return
      settled = true
      window.clearTimeout(tid)
      cleanup()
      resolve(d)
    }
    const finishErr = (msg) => {
      if (settled) return
      settled = true
      window.clearTimeout(tid)
      cleanup()
      reject(new Error(msg || 'Could not read this video file.'))
    }
    const tid = window.setTimeout(() => {
      finishErr(
        'This video is taking too long to read on device. Try a shorter clip, Wi‑Fi, or export as MP4 (H.264) in Photos before posting.',
      )
    }, PROBE_DURATION_TIMEOUT_MS)
    v.onloadedmetadata = () => finishOk()
    v.onloadeddata = () => finishOk()
    v.ondurationchange = () => finishOk()
    v.onerror = () => finishErr('Could not read this video file.')
    try {
      v.load()
    } catch {
      // ignore
    }
  })
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function messageFromEdgeFunctionResponseBody(res) {
  if (!res || typeof res.clone !== 'function') return ''
  let raw = ''
  try {
    raw = (await res.clone().text()).trim()
  } catch {
    return ''
  }
  if (!raw) return ''
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const body = JSON.parse(raw)
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        if (body.error != null) {
          const m = String(body.error).trim()
          if (m) return m
        }
        if (body.message != null) {
          const m = String(body.message).trim()
          if (m) return m
        }
      }
    } catch {
      // non-JSON despite leading brace — show snippet
    }
  }
  return raw.slice(0, 400)
}

/** Safari often surfaces failed `fetch` as "Load failed" with no HTTP body. */
export function mapGenericNetworkErrorMessage(raw, fallback) {
  const s = String(raw || '').trim()
  if (/load failed|failed to fetch|networkerror|network request failed/i.test(s)) {
    return (
      'Connection was interrupted (common on cellular Safari or large uploads). Try Wi‑Fi, post again, or export a smaller MP4 (H.264 + AAC).'
    )
  }
  return s || String(fallback || '').trim()
}

/**
 * When `functions.invoke` fails with HTTP 4xx/5xx, Supabase sets `error` to `FunctionsHttpError`
 * with message "Edge Function returned a non-2xx status code" — the JSON body from our Edge
 * Function (e.g. `{ "error": "..." }`) is on `error.context` (a `Response`). Some gateways send
 * JSON with a non-JSON Content-Type; use `clone().text()` + parse so we still surface the message.
 * @param {unknown} error
 * @param {Response | undefined} invokeResponse same object as `error.context` when present; kept for clarity
 * @param {{ functionName?: string, defaultUserMessage?: string }} [opts]
 * @returns {Promise<string>}
 */
async function messageFromFunctionsInvokeError(error, invokeResponse, opts = {}) {
  const functionName =
    typeof opts.functionName === 'string' && opts.functionName.trim()
      ? opts.functionName.trim()
      : 'lounge-cf-stream-direct-upload'
  const defaultUserMessage =
    typeof opts.defaultUserMessage === 'string' && opts.defaultUserMessage.trim()
      ? opts.defaultUserMessage.trim()
      : 'Could not start video upload.'
  const fallback = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || defaultUserMessage,
  ).trim()
  if (!error || typeof error !== 'object') return fallback || defaultUserMessage

  const ctx = /** @type {{ context?: unknown; name?: string }} */ (error).context
  const res =
    ctx && typeof ctx === 'object' && typeof /** @type {Response} */ (ctx).status === 'number'
      ? /** @type {Response} */ (ctx)
      : invokeResponse && typeof invokeResponse.status === 'number'
        ? invokeResponse
        : null

  if (res) {
    const fromBody = await messageFromEdgeFunctionResponseBody(res)
    if (fromBody) return fromBody
    const status = typeof res.status === 'number' ? res.status : 0
    if (status === 404) {
      return `That service is not deployed. Deploy Edge Function \`${functionName}\` on this Supabase project.`
    }
    if (status === 401) {
      return 'Sign in again, then retry (session expired or not sent to the service).'
    }
    if (status === 503) {
      return `Cloudflare Stream is not configured on the server (set Edge secrets \`CLOUDFLARE_ACCOUNT_ID\` and \`CLOUDFLARE_STREAM_API_TOKEN\`, then deploy \`${functionName}\`).`
    }
    return fallback || `Service returned HTTP ${status || 'error'}.`
  }

  if (/** @type {{ name?: string }} */ (error).name === 'FunctionsFetchError' && ctx && typeof ctx === 'object') {
    const c = /** @type {{ message?: string }} */ (ctx)
    if (typeof c.message === 'string' && c.message.trim()) {
      return mapGenericNetworkErrorMessage(c.message.trim(), fallback || defaultUserMessage)
    }
  }

  return mapGenericNetworkErrorMessage(fallback, defaultUserMessage)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ onUploadDiagnostic?: (detail: string) => void }} [options]
 * @returns {Promise<{ uploadURL: string, uid: string, maxDurationSeconds: number }>}
 */
export async function requestCfStreamDirectUpload(supabaseClient, options = {}) {
  const onUploadDiagnostic =
    typeof options.onUploadDiagnostic === 'function' ? options.onUploadDiagnostic : undefined
  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) {
    throw new Error('You must be signed in to post a video.')
  }

  const t0 = nowMs()
  const { data, error, response: invokeResponse } = await supabaseClient.functions.invoke(
    'lounge-cf-stream-direct-upload',
    {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  )
  if (error) {
    const msg = await messageFromFunctionsInvokeError(error, invokeResponse, {
      functionName: 'lounge-cf-stream-direct-upload',
      defaultUserMessage: 'Could not start video upload.',
    })
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_mint_supabase',
        outcome: 'functions_invoke_error',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: invokeResponse && typeof invokeResponse.status === 'number' ? invokeResponse.status : null,
        errorName: error && typeof error === 'object' && 'name' in error ? String(error.name) : '',
        message: msg.slice(0, 500),
      },
      onUploadDiagnostic,
    )
    throw new Error(msg)
  }
  if (!data || typeof data !== 'object') {
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_mint_supabase',
        outcome: 'invalid_response_body',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: invokeResponse && typeof invokeResponse.status === 'number' ? invokeResponse.status : null,
      },
      onUploadDiagnostic,
    )
    throw new Error('Invalid response from video upload service.')
  }
  const errMsg = data.error != null ? String(data.error).trim() : ''
  if (errMsg) {
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_mint_supabase',
        outcome: 'edge_error_field',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: invokeResponse && typeof invokeResponse.status === 'number' ? invokeResponse.status : null,
        message: errMsg.slice(0, 500),
      },
      onUploadDiagnostic,
    )
    throw new Error(errMsg)
  }
  const uploadURL = String(data.uploadURL || '').trim()
  const uid = String(data.uid || '').trim()
  if (!uploadURL || !uid) {
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_mint_supabase',
        outcome: 'incomplete_payload',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: invokeResponse && typeof invokeResponse.status === 'number' ? invokeResponse.status : null,
        hasUploadUrl: Boolean(uploadURL),
        hasUid: Boolean(uid),
      },
      onUploadDiagnostic,
    )
    throw new Error('Video upload service returned an incomplete response.')
  }
  return {
    uploadURL,
    uid,
    maxDurationSeconds: Number(data.maxDurationSeconds) || LOUNGE_CF_STREAM_MAX_DURATION_SECONDS,
  }
}

/**
 * Cloudflare Stream: POST multipart `file` to the one-time upload URL.
 * @param {string} uploadURL
 * @param {File} file
 * @param {{ onUploadDiagnostic?: (detail: string) => void }} [options]
 */
export async function uploadVideoToCfStreamDirectUrl(uploadURL, file, options = {}) {
  const onUploadDiagnostic =
    typeof options.onUploadDiagnostic === 'function' ? options.onUploadDiagnostic : undefined
  const fd = new FormData()
  fd.append('file', file, file.name || 'video.mp4')
  const t0 = nowMs()
  const bytesTotal = typeof file?.size === 'number' ? file.size : null
  let res
  try {
    res = await fetch(uploadURL, {
      method: 'POST',
      body: fd,
      credentials: 'omit',
    })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_direct_multipart_post',
        transport: 'fetch',
        outcome: 'fetch_throw',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: null,
        bytesLoaded: null,
        bytesTotal,
        uploadUrlShape: telemetryUploadUrlShape(uploadURL),
        message: raw.slice(0, 400),
      },
      onUploadDiagnostic,
    )
    throw new Error(
      mapGenericNetworkErrorMessage(e instanceof Error ? e.message : String(e), 'Video upload failed.'),
    )
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const hint = t ? ` ${t.slice(0, 200)}` : ''
    logLoungeVideoUploadTelemetry(
      {
        phase: 'cf_stream_direct_multipart_post',
        transport: 'fetch',
        outcome: 'http_error',
        durationMs: Math.round(nowMs() - t0),
        httpStatus: res.status,
        bytesLoaded: null,
        bytesTotal,
        uploadUrlShape: telemetryUploadUrlShape(uploadURL),
        responseSnippet: t.slice(0, 240),
      },
      onUploadDiagnostic,
    )
    throw new Error(`Upload failed (${res.status}).${hint}`)
  }
}

/**
 * Same as `uploadVideoToCfStreamDirectUrl` but reports upload byte progress (0–1) and honors `AbortSignal`.
 * @param {string} uploadURL
 * @param {File} file
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void, onUploadDiagnostic?: (detail: string) => void }} [options]
 */
export function uploadVideoToCfStreamDirectUrlWithProgress(uploadURL, file, options = {}) {
  const { signal, onProgress, onUploadDiagnostic } = options
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t0 = nowMs()
    const bytesTotal = typeof file?.size === 'number' ? file.size : null
    let lastLoaded = 0
    let lastTotal = 0
    let lastLengthComputable = false

    const xhr = new XMLHttpRequest()
    const detachAbort = () => {
      if (!signal) return
      try {
        signal.removeEventListener('abort', onAbort)
      } catch {
        // ignore
      }
    }
    const onAbort = () => {
      try {
        xhr.abort()
      } catch {
        // ignore
      }
    }
    signal?.addEventListener('abort', onAbort)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        lastLoaded = e.loaded
        lastTotal = e.total
        lastLengthComputable = true
      }
      if (e.lengthComputable && typeof onProgress === 'function') {
        const r = e.total > 0 ? e.loaded / e.total : 0
        onProgress(Math.max(0, Math.min(1, r)))
      }
    }
    xhr.onload = () => {
      detachAbort()
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      const hint = String(xhr.responseText || '').trim().slice(0, 200)
      logLoungeVideoUploadTelemetry(
        {
          phase: 'cf_stream_direct_multipart_post',
          transport: 'xhr',
          outcome: 'http_error',
          durationMs: Math.round(nowMs() - t0),
          httpStatus: xhr.status,
          bytesLoaded: lastLengthComputable ? lastLoaded : null,
          bytesTotal: lastLengthComputable ? lastTotal : bytesTotal,
          uploadProgressApprox:
            lastLengthComputable && lastTotal > 0 ? Math.round((lastLoaded / lastTotal) * 1000) / 1000 : null,
          uploadUrlShape: telemetryUploadUrlShape(uploadURL),
          responseSnippet: hint.slice(0, 240),
        },
        onUploadDiagnostic,
      )
      reject(new Error(`Upload failed (${xhr.status}).${hint ? ` ${hint}` : ''}`))
    }
    xhr.onerror = () => {
      detachAbort()
      logLoungeVideoUploadTelemetry(
        {
          phase: 'cf_stream_direct_multipart_post',
          transport: 'xhr',
          outcome: 'xhr_onerror',
          durationMs: Math.round(nowMs() - t0),
          httpStatus: typeof xhr.status === 'number' ? xhr.status : 0,
          bytesLoaded: lastLengthComputable ? lastLoaded : null,
          bytesTotal: lastLengthComputable ? lastTotal : bytesTotal,
          uploadProgressApprox:
            lastLengthComputable && lastTotal > 0 ? Math.round((lastLoaded / lastTotal) * 1000) / 1000 : null,
          uploadUrlShape: telemetryUploadUrlShape(uploadURL),
          readyState: xhr.readyState,
        },
        onUploadDiagnostic,
      )
      reject(new Error('Video upload failed (network error).'))
    }
    xhr.onabort = () => {
      detachAbort()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    try {
      xhr.open('POST', uploadURL)
      const fd = new FormData()
      fd.append('file', file, file.name || 'video.mp4')
      xhr.send(fd)
    } catch (e) {
      detachAbort()
      const msg = e instanceof Error ? e.message : String(e)
      logLoungeVideoUploadTelemetry(
        {
          phase: 'cf_stream_direct_multipart_post',
          transport: 'xhr',
          outcome: 'send_throw',
          durationMs: Math.round(nowMs() - t0),
          message: msg.slice(0, 400),
          uploadUrlShape: telemetryUploadUrlShape(uploadURL),
        },
        onUploadDiagnostic,
      )
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/**
 * Cloudflare Stream tus: chunk must be ≥ 5 MiB unless the whole file is smaller; multiple of 256 KiB; max 200 MiB.
 * @param {number} fileSize
 * @returns {number}
 */
export function pickTusChunkSizeForCfStream(fileSize) {
  const K256 = 262144
  const MIN_CF = 5242880
  const MAX_CHUNK = Math.floor((200 * 1024 * 1024) / K256) * K256
  const preferred = Math.min(8 * 1024 * 1024, MAX_CHUNK)
  if (!Number.isFinite(fileSize) || fileSize <= 0) return preferred
  if (fileSize < MIN_CF) {
    const rounded = Math.ceil(fileSize / K256) * K256
    return Math.max(K256, Math.min(rounded, MAX_CHUNK))
  }
  return preferred
}

function loungeCfStreamTusCreateEndpointUrl() {
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  if (!base) throw new Error('Missing VITE_SUPABASE_URL.')
  return `${base}/functions/v1/lounge-cf-stream-tus-create`
}

function loungeTusSafeFilename(name) {
  const raw = String(name || '').trim() || 'video.mp4'
  return raw.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180)
}

/**
 * Resumable tus upload: POST creation via Supabase `lounge-cf-stream-tus-create`, then PATCH chunks to Cloudflare.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {File} file
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void, onUploadDiagnostic?: (detail: string) => void, onStreamUidAvailable?: (uid: string) => void }} [options]
 * @returns {Promise<{ uid: string }>}
 */
export function uploadVideoToCfStreamResumableTus(supabaseClient, file, options = {}) {
  const { signal, onProgress, onUploadDiagnostic, onStreamUidAvailable } = options
  return new Promise((resolve, reject) => {
    const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
    if (!anon) {
      reject(new Error('Missing VITE_SUPABASE_ANON_KEY.'))
      return
    }

    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    let uploadRef = /** @type {{ abort: (t?: boolean) => Promise<void> } | null} */ (null)
    const detachAbort = () => {
      if (!signal) return
      try {
        signal.removeEventListener('abort', onAbort)
      } catch {
        // ignore
      }
    }
    const onAbort = () => {
      if (uploadRef) {
        uploadRef.abort(true).catch(() => {})
      }
    }
    signal?.addEventListener('abort', onAbort)

    const t0 = nowMs()
    const bytesTotal = typeof file?.size === 'number' ? file.size : null
    let lastBytesSent = 0

    ;(async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.access_token) {
        detachAbort()
        reject(new Error('You must be signed in to post a video.'))
        return
      }

      const endpoint = loungeCfStreamTusCreateEndpointUrl()
      const accessToken = session.access_token
      const chunkSize = pickTusChunkSizeForCfStream(bytesTotal ?? 0)
      const expiry = new Date(Date.now() + LOUNGE_CF_STREAM_UPLOAD_EXPIRY_MS).toISOString()

      const { Upload } = await import('tus-js-client')

      /** @type {string} */
      let capturedUid = ''
      /** @type {string} */
      let lastReportedUid = ''

      const maybeNotifyUid = (idRaw) => {
        const id = String(idRaw || '').trim()
        if (!id || !CF_STREAM_VIDEO_UID_RE.test(id) || id === lastReportedUid) return
        lastReportedUid = id
        if (typeof onStreamUidAvailable === 'function') {
          try {
            onStreamUidAvailable(id)
          } catch {
            // ignore UI callback failures
          }
        }
      }

      const upload = new Upload(file, {
        endpoint,
        chunkSize,
        retryDelays: [0, 1000, 3000, 5000, 8000],
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          name: loungeTusSafeFilename(file.name),
          maxDurationSeconds: String(LOUNGE_CF_STREAM_MAX_DURATION_SECONDS),
          expiry,
        },
        headers: {},
        onBeforeRequest: (req) => {
          const u = req.getURL()
          if (u.includes('/functions/v1/lounge-cf-stream-tus-create')) {
            req.setHeader('Authorization', `Bearer ${accessToken}`)
            req.setHeader('apikey', anon)
          }
        },
        onAfterResponse: (_req, res) => {
          const id = String(res.getHeader('stream-media-id') || '').trim()
          if (id && CF_STREAM_VIDEO_UID_RE.test(id)) {
            capturedUid = id
            maybeNotifyUid(id)
          }
        },
        onProgress: (bytesSent, total) => {
          lastBytesSent = bytesSent
          if (typeof onProgress === 'function' && total > 0) {
            onProgress(Math.max(0, Math.min(1, bytesSent / total)))
          }
        },
        onSuccess: (payload) => {
          detachAbort()
          const last = payload.lastResponse
          const fromHeader = String(last.getHeader('stream-media-id') || '').trim()
          const uid = (fromHeader && CF_STREAM_VIDEO_UID_RE.test(fromHeader) ? fromHeader : capturedUid).trim()
          maybeNotifyUid(uid)
          if (!uid || !CF_STREAM_VIDEO_UID_RE.test(uid)) {
            logLoungeVideoUploadTelemetry(
              {
                phase: 'cf_stream_tus',
                outcome: 'missing_uid',
                durationMs: Math.round(nowMs() - t0),
                httpStatus: last.getStatus(),
                bytesLoaded: lastBytesSent,
                bytesTotal,
              },
              onUploadDiagnostic,
            )
            reject(new Error('Video upload finished but the service did not return a video id.'))
            return
          }
          resolve({ uid })
        },
        onError: (err) => {
          detachAbort()
          if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          let httpStatus = null
          let bodySnippet = ''
          if (err && typeof err === 'object' && 'originalResponse' in err) {
            const res = /** @type {{ getStatus?: () => number, getBody?: () => string }} */ (
              /** @type {{ originalResponse?: unknown }} */ (err).originalResponse
            )
            if (res && typeof res.getStatus === 'function') httpStatus = res.getStatus()
            if (res && typeof res.getBody === 'function') bodySnippet = String(res.getBody() || '').trim().slice(0, 240)
          }
          const rawMsg = err instanceof Error ? err.message : String(err)
          const userMsg = mapGenericNetworkErrorMessage(rawMsg, 'Video upload failed.')
          logLoungeVideoUploadTelemetry(
            {
              phase: 'cf_stream_tus',
              outcome: 'http_error',
              durationMs: Math.round(nowMs() - t0),
              httpStatus,
              bytesLoaded: lastBytesSent,
              bytesTotal,
              uploadProgressApprox:
                bytesTotal != null && bytesTotal > 0 ? Math.round((lastBytesSent / bytesTotal) * 1000) / 1000 : null,
              message: userMsg.slice(0, 400),
              responseSnippet: bodySnippet,
            },
            onUploadDiagnostic,
          )
          reject(new Error(userMsg))
        },
      })

      uploadRef = upload
      if (signal?.aborted) {
        detachAbort()
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      upload.start()
    })().catch((e) => {
      detachAbort()
      const msg = e instanceof Error ? e.message : String(e)
      logLoungeVideoUploadTelemetry(
        {
          phase: 'cf_stream_tus',
          outcome: 'client_throw',
          durationMs: Math.round(nowMs() - t0),
          message: msg.slice(0, 400),
          bytesLoaded: lastBytesSent,
          bytesTotal,
        },
        onUploadDiagnostic,
      )
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}

/**
 * Best-effort delete of a Stream asset minted via direct upload when the post never committed
 * (upload/manifest/insert failed or user aborted). Ignores invalid uids and invoke errors.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} uid
 */
export async function deleteCfStreamOrphanAsset(supabaseClient, uid) {
  const id = String(uid || '').trim()
  if (!id || !CF_STREAM_VIDEO_UID_RE.test(id)) return

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) return

  try {
    const { data, error } = await supabaseClient.functions.invoke('lounge-cf-stream-delete-orphan', {
      body: { uid: id },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) return
    if (!data || typeof data !== 'object') return
    const errMsg = data.error != null ? String(data.error).trim() : ''
    if (errMsg) return
  } catch {
    // ignore — cleanup must not block UX
  }
}

/**
 * Deletes the Cloudflare Stream asset for a feed post (author or staff). Server resolves `stream_video_uid`.
 * Call **before** deleting the `community_feed_posts` row. No-op when the post has no Stream uid.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} postId
 */
export async function deleteCfStreamForCommunityFeedPost(supabaseClient, postId) {
  const id = String(postId || '').trim()
  if (!id) return

  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) {
    throw new Error('You must be signed in to delete.')
  }

  const { data, error, response: invokeResponse } = await supabaseClient.functions.invoke(
    'lounge-cf-stream-delete-video',
    {
      body: { postId: id },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  )
  if (error) {
    const msg = await messageFromFunctionsInvokeError(error, invokeResponse, {
      functionName: 'lounge-cf-stream-delete-video',
      defaultUserMessage: 'Could not remove hosted video.',
    })
    throw new Error(msg)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response from video cleanup service.')
  }
  const errMsg = data.error != null ? String(data.error).trim() : ''
  if (errMsg) {
    throw new Error(errMsg)
  }
}

function sleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    let tid = 0
    const onAbort = () => {
      if (tid) clearTimeout(tid)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)
    tid = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
  })
}

/**
 * Poll until HLS manifest is reachable (encoding finished).
 * @param {string} uid
 * @param {{ timeoutMs?: number, intervalMs?: number, signal?: AbortSignal, onPoll?: (args: { elapsed: number }) => void, onUploadDiagnostic?: (detail: string) => void }} [options]
 */
export async function waitForCfStreamManifestReady(uid, options = {}) {
  const timeoutMs = options.timeoutMs ?? 300_000
  const intervalMs = options.intervalMs ?? 1500
  const signal = options.signal
  const onUploadDiagnostic =
    typeof options.onUploadDiagnostic === 'function' ? options.onUploadDiagnostic : undefined
  const manifest = cfStreamManifestUrl(uid)
  if (!manifest) throw new Error('Missing video id.')
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let lastPollHttpStatus = /** @type {number | null} */ (null)
  let lastPollError = ''
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
    if (elapsed > timeoutMs) {
      logLoungeVideoUploadTelemetry(
        {
          phase: 'cf_stream_manifest_poll',
          outcome: 'timeout',
          elapsedMs: Math.round(elapsed),
          timeoutMs,
          intervalMs,
          lastPollHttpStatus,
          lastPollError: lastPollError.slice(0, 300),
          videoUidPrefix: String(uid || '').trim().slice(0, 8),
        },
        onUploadDiagnostic,
      )
      throw new Error('Video is still processing. Wait a bit and try posting again.')
    }
    options.onPoll?.({ elapsed })
    try {
      const res = await fetch(manifest, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal,
      })
      lastPollHttpStatus = res.status
      lastPollError = ''
      if (res.ok) {
        const txt = await res.text()
        if (txt.includes('#EXTM3U')) return true
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e && /** @type {{ name?: string }} */ (e).name === 'AbortError') {
        throw e
      }
      lastPollError = e instanceof Error ? e.message : String(e)
      // network hiccup — retry until timeout
    }
    await sleepWithAbort(intervalMs, signal)
  }
}
