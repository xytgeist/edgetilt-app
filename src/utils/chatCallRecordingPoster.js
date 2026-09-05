import { uploadChatPosterToR2 } from './chatVideoR2Upload.js'
import { chatAttachRecordingPoster } from './chatCallsApi.js'

const READY_PROBE_TIMEOUT_MS = 9000

/**
 * True when the public MP4 exists and the browser can decode a video frame.
 * HEAD/range can succeed while Chrome still has no picture (empty moov / 404 race).
 *
 * @param {string} videoUrl
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<boolean>}
 */
export async function probeCallRecordingPlayable(videoUrl, opts = {}) {
  const url = String(videoUrl || '').trim()
  if (!url) return false
  const signal = opts.signal
  if (signal?.aborted) return false

  try {
    const head = await fetch(url, { method: 'HEAD', signal, cache: 'no-store' })
    if (head.status === 404 || head.status === 403) return false
    if (!head.ok && head.status !== 206) {
      const get = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
        signal,
        cache: 'no-store',
      })
      if (get.status === 404 || get.status === 403) return false
    }
  } catch {
    // CORS on HEAD is common on R2. Decode probe is the real ready check.
  }
  if (signal?.aborted) return false
  return canDecodeCallRecordingFrame(url, signal)
}

/**
 * @param {string} url
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<boolean>}
 */
function canDecodeCallRecordingFrame(url, signal) {
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'

    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      try {
        signal?.removeEventListener('abort', onAbort)
      } catch {
        /* ignore */
      }
      window.clearTimeout(tm)
      try {
        video.pause()
      } catch {
        /* ignore */
      }
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        /* ignore */
      }
      resolve(Boolean(ok))
    }
    const onAbort = () => finish(false)
    const tm = window.setTimeout(() => finish(false), READY_PROBE_TIMEOUT_MS)
    signal?.addEventListener('abort', onAbort, { once: true })
    video.addEventListener(
      'loadeddata',
      () => finish(video.videoWidth > 0 && video.videoHeight > 0),
      { once: true },
    )
    video.addEventListener('error', () => finish(false), { once: true })
    video.src = url.includes('#') ? url : `${url}#t=0.1`
  })
}

/** @type {Set<string>} */
const inFlightMessageIds = new Set()
/** @type {Set<string>} */
const doneMessageIds = new Set()

/**
 * Capture a JPEG poster frame from a public call-recording MP4.
 * Primes with muted play() so iOS WebKit actually decodes a frame before canvas.
 *
 * @param {string} videoUrl
 * @returns {Promise<{ blob: Blob, width: number, height: number } | null>}
 */
export async function captureCallRecordingPosterFrame(videoUrl) {
  const url = String(videoUrl || '').trim()
  if (!url) return null

  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'

  const cleanup = () => {
    try {
      video.pause()
    } catch {
      /* ignore */
    }
    video.removeAttribute('src')
    video.load()
  }

  try {
    await new Promise((resolve, reject) => {
      let settled = false
      const ok = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const fail = (err) => {
        if (settled) return
        settled = true
        reject(err instanceof Error ? err : new Error('Video failed to load'))
      }
      video.addEventListener('loadeddata', ok, { once: true })
      video.addEventListener('error', () => fail(new Error('Video error')), { once: true })
      // Media fragment nudges Safari to decode near t=0.1
      video.src = url.includes('#') ? url : `${url}#t=0.1`
      window.setTimeout(() => fail(new Error('Video load timeout')), 12000)
    })

    await primePosterFrameForCanvas(video)

    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const target = Math.min(0.35, Math.max(0.08, dur * 0.02))
    await waitSeeked(video, target, 2000)
    await waitPaintTick(video)
    await primePosterFrameForCanvas(video)

    if (!video.videoWidth || !video.videoHeight) return null

    const maxW = 960
    const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
    })
    if (!blob) return null
    return { blob, width: canvas.width, height: canvas.height }
  } catch {
    return null
  } finally {
    cleanup()
  }
}

/**
 * Capture a poster (if needed), upload to R2, and persist stream_poster_url via Edge.
 * Idempotent across remounts / concurrent viewers.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string, video_url?: string | null, stream_poster_url?: string | null }} message
 * @returns {Promise<{ posterUrl: string, width?: number, height?: number } | null>}
 */
export async function ensureCallRecordingPosterPersisted(supabase, message) {
  const messageId = String(message?.id || '').trim()
  const videoUrl = String(message?.video_url || '').trim()
  const existing = String(message?.stream_poster_url || '').trim()
  if (!supabase || !messageId || messageId.startsWith('opt-') || !videoUrl) return null
  if (existing) {
    doneMessageIds.add(messageId)
    return { posterUrl: existing }
  }
  if (doneMessageIds.has(messageId) || inFlightMessageIds.has(messageId)) return null

  inFlightMessageIds.add(messageId)
  try {
    const frame = await captureCallRecordingPosterFrame(videoUrl)
    if (!frame?.blob) return null

    const objectUrl = URL.createObjectURL(frame.blob)
    let publicUrl = null
    try {
      publicUrl = await uploadChatPosterToR2(supabase, objectUrl)
    } finally {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        /* ignore */
      }
    }
    if (!publicUrl) return null

    const res = await chatAttachRecordingPoster(supabase, {
      messageId,
      posterUrl: publicUrl,
      width: frame.width,
      height: frame.height,
    })
    const saved = String(res?.stream_poster_url || publicUrl).trim()
    if (!saved) return null
    doneMessageIds.add(messageId)
    return {
      posterUrl: saved,
      width: frame.width,
      height: frame.height,
    }
  } catch {
    return null
  } finally {
    inFlightMessageIds.delete(messageId)
  }
}

/** @param {HTMLVideoElement} video */
async function primePosterFrameForCanvas(video) {
  if (!video) return
  video.muted = true
  try {
    try {
      const p = video.play()
      if (p && typeof p.then === 'function') await p
    } catch {
      /* ignore */
    }
    await waitPaintTick(video)
    try {
      video.pause()
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

/** @param {HTMLVideoElement} video @param {number} targetT @param {number} timeoutMs */
function waitSeeked(video, targetT, timeoutMs) {
  return new Promise((resolve) => {
    if (!video) {
      resolve()
      return
    }
    const cap =
      Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.02) : 1e9
    const target = Math.min(Math.max(0, targetT), cap)
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      video.removeEventListener('seeked', onSeeked)
      window.clearTimeout(tm)
      resolve()
    }
    const onSeeked = () => done()
    const tm = window.setTimeout(done, timeoutMs)
    if (Math.abs(video.currentTime - target) < 0.028) {
      done()
      return
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = target
    } catch {
      done()
    }
  })
}

/** @param {HTMLVideoElement} video */
function waitPaintTick(video) {
  if (!video) return Promise.resolve()
  if (typeof video.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      try {
        video.requestVideoFrameCallback(() => finish())
      } catch {
        finish()
      }
      window.setTimeout(finish, 320)
    })
  }
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}
