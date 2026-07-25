/**
 * Extract audio from a local video via browser decode + MediaRecorder.
 * Safari decodes iPhone spatial audio for playback; wasm ffmpeg often cannot demux it.
 */

import { detectAppleWebKitInlineStream } from './loungeAppleWebKit.js'

const DESKTOP_EXTRACT_PLAYBACK_RATE = 4
const EXTRACT_TIMEOUT_PAD_MS = 4000

/**
 * @param {AbortSignal | undefined} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * @param {HTMLMediaElement} el
 * @param {number} sec
 */
function seekMediaElement(el, sec) {
  return new Promise((resolve, reject) => {
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
  })
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
  await new Promise((resolve, reject) => {
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
  })
}

/**
 * @param {HTMLVideoElement} video
 */
async function startVideoPlayback(video) {
  const playResult = video.play()
  if (playResult && typeof playResult.then === 'function') {
    await playResult
  }
  await new Promise((resolve) => {
    if (!video.paused) {
      resolve()
      return
    }
    video.addEventListener('playing', () => resolve(), { once: true })
    window.setTimeout(resolve, 500)
  })
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

  const wallBudgetMs = (dur / Math.max(0.25, playbackRate)) * 1000 + EXTRACT_TIMEOUT_PAD_MS

  await new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null

    const finish = () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.onended = null
      if (timeoutId) clearTimeout(timeoutId)
      resolve()
    }

    const onTimeUpdate = () => {
      throwIfAborted(signal)
      const pos = video.currentTime
      if (typeof onProgress === 'function') {
        onProgress(Math.min(1, Math.max(0, (pos - start) / dur)))
      }
      if (pos >= end - 0.08 || video.ended) finish()
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.onended = finish
    timeoutId = window.setTimeout(finish, wallBudgetMs)

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
 * @param {AbortSignal | undefined} opts.signal
 * @param {(ratio01: number) => void} [opts.onProgress]
 */
async function extractViaWebAudio(opts) {
  const { video, mimeType, start, end, dur, playbackRate, muted, signal, onProgress } = opts
  video.muted = muted

  const audioCtx = new AudioContext()
  try {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    const elementSource = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    elementSource.connect(dest)

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
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video
 * @param {string} opts.mimeType
 * @param {number} opts.start
 * @param {number} opts.end
 * @param {number} opts.dur
 * @param {number} opts.playbackRate
 * @param {boolean} opts.muted
 * @param {AbortSignal | undefined} opts.signal
 * @param {(ratio01: number) => void} [opts.onProgress]
 */
async function extractViaCaptureStream(opts) {
  const { video, mimeType, start, end, dur, playbackRate, muted, signal, onProgress } = opts
  video.muted = muted

  const captureStream =
    typeof video.captureStream === 'function'
      ? video.captureStream.bind(video)
      : typeof video.mozCaptureStream === 'function'
        ? video.mozCaptureStream.bind(video)
        : null
  if (!captureStream) throw new Error('captureStream not supported')

  const captured = captureStream()
  const audioTracks = captured.getAudioTracks?.() || []
  if (!audioTracks.length) throw new Error('captureStream has no audio tracks')

  const audioOnly = new MediaStream(audioTracks)
  return recordStreamSegment({
    video,
    stream: audioOnly,
    mimeType,
    start,
    end,
    dur,
    playbackRate,
    signal,
    onProgress,
  })
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
  /** @type {{ name: string, muted: boolean, playbackRate: number, via: 'web-audio' | 'capture' }[]} */
  const attempts = isApple
    ? [
        { name: 'capture-unmuted-1x', muted: false, playbackRate: 1, via: 'capture' },
        { name: 'web-audio-unmuted-1x', muted: false, playbackRate: 1, via: 'web-audio' },
        { name: 'capture-unmuted-2x', muted: false, playbackRate: 2, via: 'capture' },
        { name: 'web-audio-muted-2x', muted: true, playbackRate: 2, via: 'web-audio' },
      ]
    : [
        { name: 'web-audio-unmuted-4x', muted: false, playbackRate: DESKTOP_EXTRACT_PLAYBACK_RATE, via: 'web-audio' },
        { name: 'capture-unmuted-4x', muted: false, playbackRate: DESKTOP_EXTRACT_PLAYBACK_RATE, via: 'capture' },
        { name: 'web-audio-muted-4x', muted: true, playbackRate: DESKTOP_EXTRACT_PLAYBACK_RATE, via: 'web-audio' },
      ]

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

      const common = {
        video,
        mimeType,
        start,
        end,
        dur,
        playbackRate: attempt.playbackRate,
        muted: attempt.muted,
        signal,
        onProgress,
      }

      const result =
        attempt.via === 'capture'
          ? await extractViaCaptureStream(common)
          : await extractViaWebAudio(common)

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
