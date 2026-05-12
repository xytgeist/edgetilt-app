/** Max length for Lounge video posts (matches Cloudflare direct_upload + product cap). */
export const LOUNGE_VIDEO_MAX_SECONDS = 60

/** Cloudflare Stream basic POST direct upload limit. */
export const LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES = 200 * 1024 * 1024

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

/**
 * Read duration from a local video file (metadata only).
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
    v.src = url
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
    v.onloadedmetadata = () => {
      const d = v.duration
      cleanup()
      resolve(Number.isFinite(d) && d > 0 ? d : NaN)
    }
    v.onerror = () => {
      cleanup()
      reject(new Error('Could not read this video file.'))
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

/**
 * When `functions.invoke` fails with HTTP 4xx/5xx, Supabase sets `error` to `FunctionsHttpError`
 * with message "Edge Function returned a non-2xx status code" — the JSON body from our Edge
 * Function (e.g. `{ "error": "..." }`) is on `error.context` (a `Response`). Some gateways send
 * JSON with a non-JSON Content-Type; use `clone().text()` + parse so we still surface the message.
 * @param {unknown} error
 * @param {Response | undefined} invokeResponse same object as `error.context` when present; kept for clarity
 * @returns {Promise<string>}
 */
async function messageFromFunctionsInvokeError(error, invokeResponse) {
  const fallback = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || 'Could not start video upload.',
  ).trim()
  if (!error || typeof error !== 'object') return fallback || 'Could not start video upload.'

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
      return 'Video upload service is not deployed. Deploy Edge Function `lounge-cf-stream-direct-upload` on this Supabase project.'
    }
    if (status === 401) {
      return 'Sign in again, then retry the video post (session expired or not sent to upload service).'
    }
    if (status === 503) {
      return 'Video uploads are not configured or unavailable (set Edge secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`, then redeploy `lounge-cf-stream-direct-upload`).'
    }
    return fallback || `Video upload service returned HTTP ${status || 'error'}.`
  }

  if (/** @type {{ name?: string }} */ (error).name === 'FunctionsFetchError' && ctx && typeof ctx === 'object') {
    const c = /** @type {{ message?: string }} */ (ctx)
    if (typeof c.message === 'string' && c.message.trim()) return c.message.trim()
  }

  return fallback || 'Could not start video upload.'
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ uploadURL: string, uid: string, maxDurationSeconds: number }>}
 */
export async function requestCfStreamDirectUpload(supabaseClient) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) {
    throw new Error('You must be signed in to post a video.')
  }

  const { data, error, response: invokeResponse } = await supabaseClient.functions.invoke(
    'lounge-cf-stream-direct-upload',
    {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  )
  if (error) {
    const msg = await messageFromFunctionsInvokeError(error, invokeResponse)
    throw new Error(msg)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response from video upload service.')
  }
  const errMsg = data.error != null ? String(data.error).trim() : ''
  if (errMsg) {
    throw new Error(errMsg)
  }
  const uploadURL = String(data.uploadURL || '').trim()
  const uid = String(data.uid || '').trim()
  if (!uploadURL || !uid) {
    throw new Error('Video upload service returned an incomplete response.')
  }
  return {
    uploadURL,
    uid,
    maxDurationSeconds: Number(data.maxDurationSeconds) || LOUNGE_VIDEO_MAX_SECONDS,
  }
}

/**
 * Cloudflare Stream: POST multipart `file` to the one-time upload URL.
 * @param {string} uploadURL
 * @param {File} file
 */
export async function uploadVideoToCfStreamDirectUrl(uploadURL, file) {
  const fd = new FormData()
  fd.append('file', file, file.name || 'video.mp4')
  const res = await fetch(uploadURL, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const hint = t ? ` ${t.slice(0, 200)}` : ''
    throw new Error(`Upload failed (${res.status}).${hint}`)
  }
}

/**
 * Poll until HLS manifest is reachable (encoding finished).
 */
export async function waitForCfStreamManifestReady(uid, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const intervalMs = options.intervalMs ?? 1500
  const manifest = cfStreamManifestUrl(uid)
  if (!manifest) throw new Error('Missing video id.')
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  while (true) {
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
    if (elapsed > timeoutMs) {
      throw new Error('Video is still processing. Wait a bit and try posting again.')
    }
    try {
      const res = await fetch(manifest, { method: 'GET', cache: 'no-store' })
      if (res.ok) {
        const txt = await res.text()
        if (txt.includes('#EXTM3U')) return true
      }
    } catch {
      // network hiccup — retry
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
