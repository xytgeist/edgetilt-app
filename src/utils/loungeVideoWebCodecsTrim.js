/**
 * Android Chrome trim: hardware WebCodecs H.264 (+ AAC when available) into MP4.
 * Falls back to silent MediaRecorder segment capture via loungeVideoBrowserAudio.js.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'
import { captureBrowserVideoTrimSegment } from './loungeVideoBrowserAudio.js'
import { isAndroidBrowser } from './loungeVideoUpload.js'

const LOUNGE_ENCODE_MAX_WIDTH = 720
const TARGET_FPS = 30
const VIDEO_BITRATE = 2_500_000
const AUDIO_BITRATE = 128_000
const AUDIO_SAMPLE_RATE = 48_000
const AUDIO_CHANNELS = 2
const PLAY_START_TIMEOUT_MS = 3500
const PLAYBACK_STALL_MS = 4500
const MAX_TRIM_MS = 65_000
const MIN_TRIM_VIDEO_BYTES_PER_SEC = 45000
const MIN_TRIM_VIDEO_BYTES_FLOOR = 180000

const H264_CODEC_CANDIDATES = ['avc1.42001E', 'avc1.4d001e', 'avc1.42001f']

/**
 * @param {AbortSignal | undefined} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * Keep decode/captureStream audio while staying silent to the user (speakers off).
 * @param {HTMLVideoElement} video
 */
function applySilentPlayback(video) {
  video.muted = false
  video.volume = 0
}

/**
 * @param {number} durSec
 */
function minWebCodecsTrimBytes(durSec) {
  const dur = Math.max(0.5, Number(durSec) || 0)
  return Math.max(MIN_TRIM_VIDEO_BYTES_FLOOR, Math.round(dur * MIN_TRIM_VIDEO_BYTES_PER_SEC))
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
        reject(new Error('Could not seek video for WebCodecs trim'))
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
    'webcodecs trim seek',
  )
}

/**
 * @param {File} file
 */
function createHiddenVideoForTrim(file) {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', 'true')
  video.volume = 0
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
        reject(new Error('Could not load video for WebCodecs trim'))
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
    'webcodecs trim metadata',
  )
}

/**
 * @param {HTMLVideoElement} video
 */
async function startVideoPlayback(video) {
  const playResult = video.play()
  if (playResult && typeof playResult.then === 'function') {
    await withTimeout(playResult, PLAY_START_TIMEOUT_MS, 'webcodecs trim play')
  }
}

/**
 * @param {number} srcW
 * @param {number} srcH
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} cropRect
 */
function computeOutputSize(srcW, srcH, cropRect) {
  let w = cropRect?.w > 0 ? cropRect.w : srcW
  let h = cropRect?.h > 0 ? cropRect.h : srcH
  if (w > LOUNGE_ENCODE_MAX_WIDTH) {
    h = Math.round((h * LOUNGE_ENCODE_MAX_WIDTH) / w)
    w = LOUNGE_ENCODE_MAX_WIDTH
  }
  w = Math.floor(w / 2) * 2
  h = Math.floor(h / 2) * 2
  return { width: Math.max(2, w), height: Math.max(2, h) }
}

/**
 * @param {number} width
 * @param {number} height
 */
async function pickH264VideoEncoderConfig(width, height) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('VideoEncoder unavailable')
  }
  /** @type {Error | null} */
  let lastErr = null
  for (const codec of H264_CODEC_CANDIDATES) {
    /** @type {VideoEncoderConfig} */
    const config = {
      codec,
      width,
      height,
      bitrate: VIDEO_BITRATE,
      framerate: TARGET_FPS,
      hardwareAcceleration: 'prefer-hardware',
    }
    try {
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        return { ...config, codec: support.config?.codec || codec }
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr || new Error('WebCodecs H.264 not supported on this device')
}

/** @returns {boolean} */
export function shouldUseAndroidChromeNativeTrimPath() {
  return isAndroidBrowser()
}

/**
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {object} [opts]
 * @param {AbortSignal | undefined} [opts.signal]
 * @param {{ x: number, y: number, w: number, h: number } | null} [opts.crop]
 * @param {number} [opts.intrinsicWidth]
 * @param {number} [opts.intrinsicHeight]
 * @param {(ratio01: number) => void} [opts.onProgress]
 * @param {(detail: string) => void} [opts.onDebug]
 * @returns {Promise<{ file: File, method: string }>}
 */
export async function trimVideoFileWithWebCodecs(file, startSec, endSec, opts = {}) {
  const { signal, crop, intrinsicWidth, intrinsicHeight, onProgress, onDebug } = opts
  if (!file || typeof document === 'undefined' || typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs trim unavailable')
  }

  const start = Math.max(0, Number(startSec) || 0)
  const end = Math.max(start, Number(endSec) || 0)
  const dur = end - start
  if (!(dur > 0)) throw new Error('Invalid WebCodecs trim range')
  if (dur > 60.35) throw new Error('WebCodecs trim range must be 60 seconds or shorter.')

  throwIfAborted(signal)

  const { video, url } = createHiddenVideoForTrim(file)
  /** @type {HTMLCanvasElement | null} */
  let canvas = null
  /** @type {CanvasRenderingContext2D | null} */
  let ctx = null

  try {
    document.body?.appendChild(video)
    await waitForVideoReady(video)
    throwIfAborted(signal)

    const srcW = Number(intrinsicWidth) || video.videoWidth
    const srcH = Number(intrinsicHeight) || video.videoHeight
    if (!(srcW > 1) || !(srcH > 1)) {
      throw new Error('Could not read video dimensions for WebCodecs trim')
    }

    const cropRect =
      crop && srcW > 0 && srcH > 0 ? sanitizeVideoCropPx(srcW, srcH, crop) : null
    const { width, height } = computeOutputSize(srcW, srcH, cropRect)

    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable for WebCodecs trim')

    const videoConfig = await pickH264VideoEncoderConfig(width, height)
    onDebug?.(`webcodecs video ${videoConfig.codec} ${width}x${height} hw=${videoConfig.hardwareAcceleration}`)

    applySilentPlayback(video)
    if (start > 0.05) await seekMediaElement(video, start)
    throwIfAborted(signal)

    let includeAudio = false
    if (typeof AudioEncoder !== 'undefined' && typeof MediaStreamTrackProcessor !== 'undefined') {
      try {
        const audioSupport = await AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2',
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: AUDIO_CHANNELS,
          bitrate: AUDIO_BITRATE,
        })
        const stream = video.captureStream()
        includeAudio = Boolean(audioSupport.supported && stream.getAudioTracks()[0])
        if (!includeAudio) onDebug?.('webcodecs audio skipped (unsupported or no track)')
      } catch {
        includeAudio = false
        onDebug?.('webcodecs audio probe failed, video-only mux')
      }
    }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
        frameRate: TARGET_FPS,
      },
      audio: includeAudio
        ? {
            codec: 'aac',
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfChannels: AUDIO_CHANNELS,
          }
        : undefined,
      fastStart: 'in-memory',
    })

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta)
      },
      error: (e) => {
        throw e instanceof Error ? e : new Error(String(e))
      },
    })
    videoEncoder.configure(videoConfig)

    /** @type {AudioEncoder | null} */
    let audioEncoder = null
    /** @type {Promise<void> | null} */
    let audioPumpPromise = null

    if (includeAudio) {
      const stream = video.captureStream()
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta)
          },
          error: (e) => {
            throw e instanceof Error ? e : new Error(String(e))
          },
        })
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: AUDIO_CHANNELS,
          bitrate: AUDIO_BITRATE,
        })

        const processor = new MediaStreamTrackProcessor({ track: audioTrack })
        const reader = processor.readable.getReader()
        audioPumpPromise = (async () => {
          try {
            while (true) {
              throwIfAborted(signal)
              const { done, value } = await reader.read()
              if (done) break
              if (!value) continue
              try {
                if (video.currentTime >= start - 0.05 && video.currentTime <= end + 0.15) {
                  audioEncoder?.encode(value)
                }
              } finally {
                value.close()
              }
              if (video.currentTime >= end - 0.05 || video.ended) break
            }
          } finally {
            try {
              reader.releaseLock()
            } catch {
              // ignore
            }
          }
        })()
        onDebug?.('webcodecs audio pump started')
      }
    }

    await startVideoPlayback(video)
    throwIfAborted(signal)

    let frameIndex = 0
    let maxProgress = 0

    await withTimeout(
      new Promise((resolve, reject) => {
        /** @type {ReturnType<typeof setTimeout> | null} */
        let timeoutId = null
        /** @type {ReturnType<typeof setTimeout> | null} */
        let stallId = null
        let lastPos = video.currentTime

        const finish = () => {
          if (timeoutId) window.clearTimeout(timeoutId)
          if (stallId) window.clearTimeout(stallId)
          resolve()
        }

        const armStallWatch = () => {
          if (stallId) window.clearTimeout(stallId)
          stallId = window.setTimeout(() => {
            if (Math.abs(video.currentTime - lastPos) < 0.02) {
              reject(new Error('WebCodecs trim playback stalled'))
            }
          }, PLAYBACK_STALL_MS)
        }

        const drawFrame = () => {
          throwIfAborted(signal)
          const pos = video.currentTime
          if (Math.abs(pos - lastPos) >= 0.02) {
            lastPos = pos
            armStallWatch()
          }

          if (cropRect) {
            ctx.drawImage(
              video,
              cropRect.x,
              cropRect.y,
              cropRect.w,
              cropRect.h,
              0,
              0,
              width,
              height,
            )
          } else {
            ctx.drawImage(video, 0, 0, width, height)
          }

          const tsUs = Math.max(0, Math.round((pos - start) * 1_000_000))
          /** @type {VideoFrameInit} */
          const frameInit = { timestamp: tsUs }
          const frame = new VideoFrame(canvas, frameInit)
          const keyFrame = frameIndex % (TARGET_FPS * 2) === 0
          videoEncoder.encode(frame, { keyFrame })
          frame.close()
          frameIndex += 1

          maxProgress = Math.max(maxProgress, Math.min(1, (pos - start) / dur))
          onProgress?.(maxProgress)

          if (pos >= end - 0.05 || video.ended) {
            finish()
            return
          }

          if (typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(drawFrame)
          } else {
            window.requestAnimationFrame(drawFrame)
          }
        }

        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true },
        )

        timeoutId = window.setTimeout(finish, MAX_TRIM_MS)
        armStallWatch()

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(drawFrame)
        } else {
          window.requestAnimationFrame(drawFrame)
        }
      }),
      MAX_TRIM_MS + 5000,
      'webcodecs trim encode',
    )

    try {
      video.pause()
    } catch {
      // ignore
    }

    if (audioPumpPromise) {
      await audioPumpPromise
    }
    await videoEncoder.flush()
    if (audioEncoder) {
      await audioEncoder.flush()
    }
    muxer.finalize()

    const buffer = muxer.target.buffer
    if (!buffer?.byteLength) throw new Error('WebCodecs trim produced empty output')
    if (buffer.byteLength < minWebCodecsTrimBytes(dur)) {
      throw new Error(`WebCodecs trim output too small (${Math.round(buffer.byteLength / 1024)}KB)`)
    }

    const baseName = String(file.name || 'video').replace(/\.[^.]+$/, '') || 'video'
    const outFile = new File([buffer], `${baseName}-trim.mp4`, { type: 'video/mp4' })
    onDebug?.(`webcodecs trim ok ${Math.round(outFile.size / 1024)}KB ${frameIndex} frames`)
    return { file: outFile, method: videoConfig.codec || 'webcodecs-h264' }
  } finally {
    disposeHiddenVideo(video, url)
  }
}

/**
 * Android Chrome trim ladder: WebCodecs → silent MediaRecorder segment capture.
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {object} opts
 * @param {AbortSignal | undefined} opts.signal
 * @param {{ x: number, y: number, w: number, h: number } | null} [opts.crop]
 * @param {number} [opts.intrinsicWidth]
 * @param {number} [opts.intrinsicHeight]
 * @param {(ratio01: number) => void} [opts.onProgress]
 * @param {(status: string) => void} [opts.onStatus]
 * @param {(detail: string) => void} [opts.onDebug]
 * @returns {Promise<{ file: File, outcome: 'webcodecs-trim' | 'browser-trim', detail: string }>}
 */
export async function prepAndroidChromeTrimUploadFile(file, startSec, endSec, opts) {
  /** @type {string[]} */
  const failures = []

  try {
    const { file: outFile, method } = await trimVideoFileWithWebCodecs(file, startSec, endSec, opts)
    return { file: outFile, outcome: 'webcodecs-trim', detail: method }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`webcodecs: ${msg}`)
    opts.onDebug?.(`webcodecs trim failed: ${msg}`)
  }

  try {
    opts.onStatus?.('Recording clip…')
    opts.onDebug?.('browser trim capture start (webcodecs fallback)')
    const captured = await captureBrowserVideoTrimSegment(
      file,
      startSec,
      endSec,
      opts.signal,
      opts.onProgress,
      opts.onDebug,
    )
    const baseName = String(file.name || 'video').replace(/\.[^.]+$/, '') || 'video'
    const outFile = new File([captured.blob], `${baseName}-trim${captured.ext}`, {
      type: captured.mimeType || captured.blob.type || 'video/webm',
    })
    return {
      file: outFile,
      outcome: 'browser-trim',
      detail: `${captured.method} after webcodecs fail`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`mediarecorder: ${msg}`)
    opts.onDebug?.(`browser trim failed: ${msg}`)
  }

  throw new Error(
    failures.length
      ? `Android trim failed (${failures.slice(0, 2).join(' | ')})`
      : 'Android trim failed',
  )
}
