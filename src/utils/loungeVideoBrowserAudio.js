/**
 * Extract audio from a local video via Web Audio + MediaRecorder.
 * Safari decodes iPhone spatial audio for playback; wasm ffmpeg often cannot demux it.
 */

const AUDIO_EXTRACT_PLAYBACK_RATE = 4
const AUDIO_EXTRACT_TIMEOUT_PAD_MS = 3000

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
 */
function setFastPreservingPitch(video) {
  video.playbackRate = AUDIO_EXTRACT_PLAYBACK_RATE
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
 * Record audio from a video segment using Web Audio (muted play is iOS-safe).
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {AbortSignal | undefined} [signal]
 * @param {(ratio01: number) => void} [onProgress]
 * @returns {Promise<{ blob: Blob, ext: string, mimeType: string }>}
 */
export async function extractBrowserVideoAudio(file, startSec, endSec, signal, onProgress) {
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

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.muted = true
  video.volume = 1
  video.src = url
  video.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'

  /** @type {AudioContext | null} */
  let audioCtx = null
  /** @type {MediaRecorder | null} */
  let recorder = null

  const cleanup = () => {
    try {
      recorder?.stop()
    } catch {
      // ignore
    }
    try {
      audioCtx?.close()
    } catch {
      // ignore
    }
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

  const onAbort = () => {
    try {
      video.pause()
    } catch {
      // ignore
    }
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    document.body?.appendChild(video)
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not load video for audio extract'))
      try {
        video.load()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    throwIfAborted(signal)

    if (start > 0.05) await seekMediaElement(video, start)

    setFastPreservingPitch(video)

    audioCtx = new AudioContext()
    const elementSource = audioCtx.createMediaElementSource(video)
    const dest = audioCtx.createMediaStreamDestination()
    elementSource.connect(dest)

    const stream = dest.stream
    const audioTracks = stream.getAudioTracks?.() || []
    if (!audioTracks.length) {
      throw new Error('No audio track from Web Audio tap')
    }

    /** @type {BlobPart[]} */
    const chunks = []
    recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) chunks.push(ev.data)
    }

    const recordDone = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = () => reject(recorder.error || new Error('MediaRecorder failed'))
    })

    recorder.start(200)
    const playResult = video.play()
    if (playResult && typeof playResult.then === 'function') {
      await playResult.catch((err) => {
        throw err instanceof Error ? err : new Error(String(err))
      })
    }

    const wallBudgetMs = (dur / AUDIO_EXTRACT_PLAYBACK_RATE) * 1000 + AUDIO_EXTRACT_TIMEOUT_PAD_MS

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
      timeoutId = setTimeout(finish, wallBudgetMs)

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
    if (recorder.state !== 'inactive') recorder.stop()
    await recordDone

    if (typeof onProgress === 'function') onProgress(1)

    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
    if (!blob.size) throw new Error('Browser audio capture was empty')

    return {
      blob,
      ext: browserAudioExt(blob, recorder.mimeType || mimeType),
      mimeType: recorder.mimeType || mimeType,
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    cleanup()
  }
}
