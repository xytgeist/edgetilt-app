/** Max length for Lounge video posts (product cap; client validation). */
export const LOUNGE_VIDEO_MAX_SECONDS = 60

/** Cloudflare `maxDurationSeconds` is set slightly above the product cap so a clip that measures ~59s in an editor but ~60.1s in the browser/encoder is not rejected at the API. */
export const LOUNGE_CF_STREAM_MAX_DURATION_SECONDS = 75

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
    const msg = await messageFromFunctionsInvokeError(error, invokeResponse, {
      functionName: 'lounge-cf-stream-direct-upload',
      defaultUserMessage: 'Could not start video upload.',
    })
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
    maxDurationSeconds: Number(data.maxDurationSeconds) || LOUNGE_CF_STREAM_MAX_DURATION_SECONDS,
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
  let res
  try {
    res = await fetch(uploadURL, {
      method: 'POST',
      body: fd,
      credentials: 'omit',
    })
  } catch (e) {
    throw new Error(
      mapGenericNetworkErrorMessage(e instanceof Error ? e.message : String(e), 'Video upload failed.'),
    )
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const hint = t ? ` ${t.slice(0, 200)}` : ''
    throw new Error(`Upload failed (${res.status}).${hint}`)
  }
}

/**
 * Same as `uploadVideoToCfStreamDirectUrl` but reports upload byte progress (0–1) and honors `AbortSignal`.
 * @param {string} uploadURL
 * @param {File} file
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void }} [options]
 */
export function uploadVideoToCfStreamDirectUrlWithProgress(uploadURL, file, options = {}) {
  const { signal, onProgress } = options
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
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
      reject(new Error(`Upload failed (${xhr.status}).${hint ? ` ${hint}` : ''}`))
    }
    xhr.onerror = () => {
      detachAbort()
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
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
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
 * @param {{ timeoutMs?: number, intervalMs?: number, signal?: AbortSignal, onPoll?: (args: { elapsed: number }) => void }} [options]
 */
export async function waitForCfStreamManifestReady(uid, options = {}) {
  const timeoutMs = options.timeoutMs ?? 300_000
  const intervalMs = options.intervalMs ?? 1500
  const signal = options.signal
  const manifest = cfStreamManifestUrl(uid)
  if (!manifest) throw new Error('Missing video id.')
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
    if (elapsed > timeoutMs) {
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
      if (res.ok) {
        const txt = await res.text()
        if (txt.includes('#EXTM3U')) return true
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e && /** @type {{ name?: string }} */ (e).name === 'AbortError') {
        throw e
      }
      // network hiccup — retry until timeout
    }
    await sleepWithAbort(intervalMs, signal)
  }
}
