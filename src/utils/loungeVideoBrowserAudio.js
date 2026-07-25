/**
 * Extract audio from a local video via browser decode + MediaRecorder.
 * Safari decodes iPhone spatial audio for playback; wasm ffmpeg often cannot demux it.
 */

import { detectAppleWebKitInlineStream } from './loungeAppleWebKit.js'

const DESKTOP_EXTRACT_PLAYBACK_RATE = 4
const APPLE_EXTRACT_PLAYBACK_RATE = 8
const EXTRACT_TIMEOUT_PAD_MS = 3000
const PLAY_START_TIMEOUT_MS = 3500
const PLAYBACK_STALL_MS = 4500
const MAX_ATTEMPT_MS = 55000
const MIN_CAPTURE_BYTES_PER_SEC = 4000
const MIN_CAPTURE_BYTES_FLOOR = 16000

/**
 * @param {AbortSignal | undefined} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** @returns {boolean} */
function hasUserActivation() {
  try {
    return Boolean(typeof navigator !== 'undefined' && navigator.userActivation?.isActive)
  } catch {
    return false
  }
}

/** @returns {boolean} */
export function hasBrowserVideoAudioUserActivation() {
  return hasUserActivation()
}

/** Minimum blob size for a captured audio track to be worth muxing. */
export function minBrowserVideoAudioCaptureBytes(durSec) {
  const dur = Math.max(0.5, Number(durSec) || 0)
  return Math.max(MIN_CAPTURE_BYTES_FLOOR, Math.round(dur * MIN_CAPTURE_BYTES_PER_SEC))
}

/**
 * @param {Blob} blob
 * @param {number} durSec
 * @param {number} [progressRatio01]
 */
export function isViableBrowserVideoAudioCapture(blob, durSec, progressRatio01 = 1) {
  if (!blob?.size) return false
  if (blob.size < minBrowserVideoAudioCaptureBytes(durSec)) return false
  if (typeof progressRatio01 === 'number' && progressRatio01 < 0.75) return false
  return true
}

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const tid = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(tid)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(tid)
        reject(err)
      },
    )
  })
}

/**
 * @param {HTMLMediaElement} el
 * @param {number} sec
 */
function seekMediaElement(el, sec) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const onSeeked = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Could not seek video for audio extract'))
      }
      const cleanup = () => {
        el.removeEventListener('seeked', onSeeked)
        el.removeEventListener('error', onError)
      }
      el.addEventListener('seeked', onSeeked, { once: true })
      el.addEventListener('error', onError, { once: true })
      try {
        el.currentTime = sec
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }),
    8000,
    'audio extract seek',
  )
}

/**
 * @param {HTMLVideoElement} video
 * @param {number} rate
 */
function setPlaybackRate(video, rate) {
  video.playbackRate = rate
  if ('preservesPitch' in video) video.preservesPitch = true
  else if ('mozPreservesPitch' in video) video.mozPreservesPitch = true
  else if ('webkitPreservesPitch' in video) video.webkitPreservesPitch = true
}

/**
 * @returns {string}
 */
function pickAudioRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
  ]
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      // ignore
    }
  }
  return ''
}

/**
 * @param {Blob} blob
 * @param {string} mimeType
 */
function browserAudioExt(blob, mimeType) {
  const type = String(mimeType || blob.type || '').toLowerCase()
  if (type.includes('webm')) return '.webm'
  if (type.includes('mp4') || type.includes('m4a')) return '.m4a'
  return '.webm'
}

/**
 * @param {File} file
 */
function createHiddenVideoForExtract(file) {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', 'true')
  video.volume = 1
  video.src = url
  video.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
  return { video, url }
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 */
function disposeHiddenVideo(video, url) {
  try {
    video.pause()
  } catch {
    // ignore
  }
  try {
    video.removeAttribute('src')
    video.load()
  } catch {
    // ignore
  }
  try {
    video.remove()
  } catch {
    // ignore
  }
  try {
    URL.revokeObjectURL(url)
  } catch {
    // ignore
  }
}

/**
 * @param {HTMLVideoElement} video
 */
async function waitForVideoReady(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return
  await withTimeout(
    new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Could not load video for audio extract'))
      }
      const cleanup = () => {
        video.removeEventListener('canplay', onReady)
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('canplay', onReady, { once: true })
      video.addEventListener('loadeddata', onReady, { once: true })
      video.addEventListener('error', onError, { once: true })
      try {
        video.load()
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }),
    12000,
    'audio extract metadata',
  )
}

/**
 * @param {HTMLVideoElement} video
 */
async function startVideoPlayback(video) {
  const playResult = video.play()
  if (playResult && typeof playResult.then === 'function') {
    await withTimeout(playResult, PLAY_START_TIMEOUT_MS, 'audio extract play')
  }
  await withTimeout(
    new Promise((resolve, reject) => {
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve()
        return
      }
      const onPlaying = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Video playback failed during audio extract'))
      }
      const cleanup = () => {
        video.removeEventListener('playing', onPlaying)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('playing', onPlaying, { once: true })
      video.addEventListener('error', onError, { once: true })
    }),
    PLAY_START_TIMEOUT_MS,
    'audio extract playing',
  )
}

/**
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video
 * @param {MediaStream} opts.stream
 * @param {string} opts.mimeType
 * @param {number} opts.start
 * @param {number} opts.end
 * @param {number} opts.dur
 * @param {number} opts.playbackRate
 * @param {AbortSignal | undefined} opts.signal
 * @param {(ratio01: number) => void} [opts.onProgress]
 */
async function recordStreamSegment({
  video,
  stream,
  mimeType,
  start,
  end,
  dur,
  playbackRate,
  signal,
  onProgress,
}) {
  const audioTracks = stream.getAudioTracks?.() || []
  if (!audioTracks.length) {
    throw new Error('No audio tracks on capture stream')
  }

  /** @type {BlobPart[]} */
  const chunks = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: 128000,
  })
  recorder.ondataavailable = (ev) => {
    if (ev.data?.size) chunks.push(ev.data)
  }

  const recordDone = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(recorder.error || new Error('MediaRecorder failed'))
  })

  setPlaybackRate(video, playbackRate)
  recorder.start(250)
  await startVideoPlayback(video)

  const wallBudgetMs = Math.min(
    MAX_ATTEMPT_MS,
    (dur / Math.max(0.25, playbackRate)) * 1000 + EXTRACT_TIMEOUT_PAD_MS,
  )

  await new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let stallId = null
    let lastPos = video.currentTime

    const finish = () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.onended = null
      if (timeoutId) window.clearTimeout(timeoutId)
      if (stallId) window.clearTimeout(stallId)
      resolve()
    }

    const armStallWatch = () => {
      if (stallId) window.clearTimeout(stallId)
      stallId = window.setTimeout(() => {
        if (Math.abs(video.currentTime - lastPos) < 0.02) {
          reject(new Error('Audio extract playback stalled'))
        }
      }, PLAYBACK_STALL_MS)
    }

    const onTimeUpdate = () => {
      throwIfAborted(signal)
      const pos = video.currentTime
      if (Math.abs(pos - lastPos) >= 0.02) {
        lastPos = pos
        armStallWatch()
      }
      if (typeof onProgress === 'function') {
        onProgress(Math.min(1, Math.max(0, (pos - start) / dur)))
      }
      if (pos >= end - 0.08 || video.ended) finish()
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.onended = finish
    timeoutId = window.setTimeout(finish, wallBudgetMs)
    armStallWatch()

    signal?.addEventListener(
      'abort',
      () => {
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

  throwIfAborted(signal)

  try {
    video.pause()
  } catch {
    // ignore
  }

  if (recorder.state === 'recording') {
    try {
      recorder.requestData()
    } catch {
      // ignore
    }
    await new Promise((r) => window.setTimeout(r, 120))
    recorder.stop()
  }
  await recordDone

  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
  if (!blob.size) throw new Error('Browser audio capture was empty')

  return {
    blob,
    ext: browserAudioExt(blob, recorder.mimeType || mimeType),
    mimeType: recorder.mimeType || mimeType,
  }
}

/**
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video
 * @param {string} opts.mimeType
 * @param {number} opts.start
 * @param {number} opts.end
 * @param {number} opts.dur
 * @param {number} opts.playbackRate
 * @param {boolean} opts.muted
 * @param {boolean} [opts.silentMonitor]
 * @param {boolean} [opts.silentViaVolume]
 * @param {AbortSignal | undefined} opts.signal
 * @param {(ratio01: number) => void} [opts.onProgress]
 */
async function extractViaWebAudio(opts) {
  const {
    video,
    mimeType,
    start,
    end,
    dur,
    playbackRate,
    muted,
    silentMonitor = false,
    silentViaVolume = false,
    signal,
    onProgress,
  } = opts
  // iOS Web Audio often receives no samples when the element is muted.
  if (silentViaVolume) {
    video.muted = false
    video.volume = 0
  } else {
    video.muted = muted
    video.volume = muted ? 0 : 1
  }

  const audioCtx = new AudioContext()
  try {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    const elementSource = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    elementSource.connect(dest)
    if (silentMonitor) {
      const monitor = audioCtx.createGain()
      monitor.gain.value = 0
      elementSource.connect(monitor)
      monitor.connect(audioCtx.destination)
    }

    return await recordStreamSegment({
      video,
      stream: dest.stream,
      mimeType,
      start,
      end,
      dur,
      playbackRate,
      signal,
      onProgress,
    })
  } finally {
    try {
      await audioCtx.close()
    } catch {
      // ignore
    }
  }
}

/**
 * @param {boolean} isApple
 * @returns {{ name: string, muted: boolean, playbackRate: number, silentMonitor?: boolean, silentViaVolume?: boolean }[]}
 */
function buildExtractAttempts(isApple) {
  const activation = hasUserActivation()
  if (isApple) {
    /** @type {{ name: string, muted: boolean, playbackRate: number, silentMonitor?: boolean, silentViaVolume?: boolean }[]} */
    const attempts = [
      {
        name: 'web-audio-volume0-8x',
        muted: false,
        playbackRate: APPLE_EXTRACT_PLAYBACK_RATE,
        silentViaVolume: true,
        silentMonitor: true,
      },
      {
        name: 'web-audio-volume0-4x',
        muted: false,
        playbackRate: 4,
        silentViaVolume: true,
        silentMonitor: true,
      },
    ]
    if (activation) {
      attempts.push({
        name: 'web-audio-unmuted-8x',
        muted: false,
        playbackRate: APPLE_EXTRACT_PLAYBACK_RATE,
      })
    }
    return attempts
  }
  /** @type {{ name: string, muted: boolean, playbackRate: number, silentMonitor?: boolean, silentViaVolume?: boolean }[]} */
  const attempts = [
    {
      name: 'web-audio-volume0-4x',
      muted: false,
      playbackRate: DESKTOP_EXTRACT_PLAYBACK_RATE,
      silentViaVolume: true,
      silentMonitor: true,
    },
  ]
  if (activation) {
    attempts.unshift({
      name: 'web-audio-unmuted-4x',
      muted: false,
      playbackRate: DESKTOP_EXTRACT_PLAYBACK_RATE,
    })
  }
  return attempts
}

/**
 * Record audio from a video segment. Tries multiple browser strategies.
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {AbortSignal | undefined} [signal]
 * @param {(ratio01: number) => void} [onProgress]
 * @param {(detail: string) => void} [onDebug]
 * @returns {Promise<{ blob: Blob, ext: string, mimeType: string, method: string }>}
 */
export async function extractBrowserVideoAudio(
  file,
  startSec,
  endSec,
  signal,
  onProgress,
  onDebug,
) {
  if (!file || typeof URL === 'undefined' || typeof document === 'undefined') {
    throw new Error('Browser audio extract unavailable')
  }
  const mimeType = pickAudioRecorderMimeType()
  if (!mimeType) throw new Error('MediaRecorder not supported for audio extract')

  const start = Math.max(0, Number(startSec) || 0)
  const end = Math.max(start, Number(endSec) || 0)
  const dur = end - start
  if (!(dur > 0)) throw new Error('Invalid audio extract range')

  throwIfAborted(signal)

  const isApple = detectAppleWebKitInlineStream()
  const attempts = buildExtractAttempts(isApple)
  onDebug?.(
    `browser audio plan ${attempts.map((a) => a.name).join(', ')} activation=${hasUserActivation() ? 'yes' : 'no'}`,
  )

  /** @type {string[]} */
  const failures = []

  for (const attempt of attempts) {
    throwIfAborted(signal)
    const { video, url } = createHiddenVideoForExtract(file)
    const onAbort = () => {
      try {
        video.pause()
      } catch {
        // ignore
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      onDebug?.(`browser audio try ${attempt.name}`)
      document.body?.appendChild(video)
      await waitForVideoReady(video)
      throwIfAborted(signal)
      if (start > 0.05) await seekMediaElement(video, start)

      let maxProgress = 0
      const result = await withTimeout(
        extractViaWebAudio({
          video,
          mimeType,
          start,
          end,
          dur,
          playbackRate: attempt.playbackRate,
          muted: attempt.muted,
          silentMonitor: attempt.silentMonitor,
          silentViaVolume: attempt.silentViaVolume,
          signal,
          onProgress: (r) => {
            maxProgress = Math.max(maxProgress, r)
            onProgress?.(r)
          },
        }),
        MAX_ATTEMPT_MS,
        attempt.name,
      )

      const minBytes = minBrowserVideoAudioCaptureBytes(dur)
      if (!isViableBrowserVideoAudioCapture(result.blob, dur, maxProgress)) {
        throw new Error(
          `Capture too small (${Math.round(result.blob.size / 1024)}KB, need ~${Math.round(minBytes / 1024)}KB, progress ${Math.round(maxProgress * 100)}%)`,
        )
      }

      onDebug?.(`browser audio ok ${attempt.name} ${Math.round(result.blob.size / 1024)}KB`)
      return { ...result, method: attempt.name }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${attempt.name}: ${msg}`)
      onDebug?.(`browser audio ${attempt.name} failed: ${msg}`)
    } finally {
      signal?.removeEventListener('abort', onAbort)
      disposeHiddenVideo(video, url)
    }
  }

  throw new Error(
    failures.length
      ? `Browser audio capture failed (${failures.slice(0, 2).join(' | ')})`
      : 'Browser audio capture failed',
  )
}

/** True for iPhone-style clips where wasm demux often fails but Safari can decode audio. */
export function shouldPrefetchBrowserVideoAudio(file) {
  if (!file || !detectAppleWebKitInlineStream()) return false
  if (!hasUserActivation()) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  return name.endsWith('.mov') || type.includes('quicktime')
}
