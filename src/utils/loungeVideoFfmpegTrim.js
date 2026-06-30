import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'

/** Must match the ESM build served for `ffmpeg.load` (see @ffmpeg/ffmpeg 0.12 docs). */
const CORE_VERSION = '0.12.6'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

/** Mount point for WORKERFS-backed trim input (see `installTrimInput`). */
const WORKERFS_INPUT_MOUNT = '/lwfs_in'

/**
 * Above ~**4 MiB**, loading the whole file with `writeFile` + `fetchFile` duplicates it in WASM
 * heap and commonly **crashes the tab** on long clips (e.g. 4+ minute sources). WORKERFS mounts
 * the browser `File` so ffmpeg reads from the backing store without a full in-memory copy.
 */
const MEMFS_INPUT_MAX_BYTES = 4 * 1024 * 1024

let ffmpegSingleton = null
let loadPromise = null

async function getFfmpeg() {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()
  return loadPromise
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {File} file
 * @param {string} inName virtual filename (e.g. `in.mp4`)
 * @returns {Promise<{ inputPath: string, mode: 'memfs' | 'workerfs' }>}
 */
async function installTrimInput(ffmpeg, file, inName) {
  const n = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0
  if (n >= MEMFS_INPUT_MAX_BYTES) {
    try {
      await ffmpeg.unmount(WORKERFS_INPUT_MOUNT)
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteDir(WORKERFS_INPUT_MOUNT)
    } catch {
      // ignore
    }
    try {
      await ffmpeg.createDir(WORKERFS_INPUT_MOUNT)
      await ffmpeg.mount('WORKERFS', { blobs: [{ name: inName, data: file }] }, WORKERFS_INPUT_MOUNT)
      return { inputPath: `${WORKERFS_INPUT_MOUNT}/${inName}`, mode: 'workerfs' }
    } catch (e) {
      try {
        await ffmpeg.unmount(WORKERFS_INPUT_MOUNT)
      } catch {
        // ignore
      }
      try {
        await ffmpeg.deleteDir(WORKERFS_INPUT_MOUNT)
      } catch {
        // ignore
      }
      throw e instanceof Error ? e : new Error(String(e))
    }
  }
  await ffmpeg.writeFile(inName, await fetchFile(file))
  return { inputPath: inName, mode: 'memfs' }
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {'memfs' | 'workerfs'} mode
 * @param {string} inName
 */
async function uninstallTrimInput(ffmpeg, mode, inName) {
  if (mode === 'workerfs') {
    try {
      await ffmpeg.unmount(WORKERFS_INPUT_MOUNT)
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteDir(WORKERFS_INPUT_MOUNT)
    } catch {
      // ignore
    }
  } else {
    try {
      await ffmpeg.deleteFile(inName)
    } catch {
      // ignore
    }
  }
}

/** Warm ffmpeg core in the background (first open of trim modal). */
export function prefetchFfmpegCore() {
  return getFfmpeg().then(() => {})
}

/**
 * Re-encode a full video file to a chat-optimised MP4.
 * Targets ≤ 720p height, H.264 CRF 30, 900 kbps bitrate cap, 64 kbps AAC audio.
 * Produces roughly 5 MB for a 60-second 1080p source (vs 50-100 MB raw pass-through).
 *
 * @param {File} file
 * @param {{ onProgress?: (ratio01: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<File>}
 */
export async function encodeVideoForChat(file, opts = {}) {
  const { onProgress, signal } = opts

  const TAG = '[chat-video-encode]'
  console.log(TAG, 'start', { name: file.name, sizeMb: +(file.size / 1e6).toFixed(2), type: file.type })

  let ffmpeg
  try {
    ffmpeg = await getFfmpeg()
    console.log(TAG, 'ffmpeg ready')
  } catch (loadErr) {
    console.error(TAG, 'ffmpeg load failed', String(loadErr))
    throw loadErr
  }

  const extMatch = /\.[a-z0-9]+$/i.exec(file.name || '')
  const ext = extMatch ? extMatch[0].toLowerCase() : '.mp4'
  const inName = `chat_in${ext}`
  const outName = 'chat_out.mp4'

  const onProg = ({ progress }) => {
    if (typeof onProgress !== 'function') return
    const p = typeof progress === 'number' ? progress : 0
    onProgress(p <= 1 ? p : p / 100)
  }
  ffmpeg.on('progress', onProg)

  let mode, inputPath
  try {
    ;({ inputPath, mode } = await installTrimInput(ffmpeg, file, inName))
    console.log(TAG, 'input mounted', { mode, inputPath })
  } catch (mountErr) {
    ffmpeg.off('progress', onProg)
    console.error(TAG, 'input mount failed', String(mountErr))
    throw mountErr
  }

  // Clean up any stale output from a previous failed run.
  try { await ffmpeg.deleteFile(outName) } catch { /* ignore */ }

  /**
   * Chat encode groups:
   * - Demux / logging: -hide_banner -loglevel error -analyzeduration 1500000 -probesize 5242880
   * - Input: -i <path>
   * - Video: H.264 ultrafast, CRF 27 (matches lounge post quality), no hard bitrate cap, yuv420p
   * - Video filter: fit within 1280×720 box (handles portrait + landscape; no expression evaluator needed)
   * - Audio: AAC 128 kbps
   * - Mux: +faststart for instant web playback
   */
  const demuxLogging = ['-hide_banner', '-loglevel', 'error', '-analyzeduration', '1500000', '-probesize', '5242880']
  const input = ['-i', inputPath]
  const video = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p']
  const videoFilters = ['-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2']
  const audio = ['-c:a', 'aac', '-b:a', '128k']
  const mux = ['-movflags', '+faststart', '-y', outName]

  const args = [...demuxLogging, ...input, ...video, ...videoFilters, ...audio, ...mux]
  console.log(TAG, 'exec args', args.join(' '))

  let code
  try {
    code = await ffmpeg.exec(args, undefined, { signal })
    console.log(TAG, 'exec done', { code })
    if (code !== 0) throw new Error(`Chat video encoding failed (exit ${code}).`)
  } catch (execErr) {
    console.error(TAG, 'exec error', String(execErr))
    throw execErr
  } finally {
    ffmpeg.off('progress', onProg)
    await uninstallTrimInput(ffmpeg, mode, inName)
  }

  const data = await ffmpeg.readFile(outName)
  try { await ffmpeg.deleteFile(outName) } catch { /* ignore */ }

  const buf = data instanceof Uint8Array ? data : new Uint8Array(data)
  console.log(TAG, 'encoded', { outSizeMb: +(buf.byteLength / 1e6).toFixed(2) })

  const base = String(file.name || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '_')
    .slice(0, 80)
  const outFile = new File([buf], `${base || 'clip'}-chat.mp4`, { type: 'video/mp4' })
  if (typeof onProgress === 'function') onProgress(1)
  return outFile
}

/**
 * Re-encode a segment to MP4 (browser-safe).
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {{ onProgress?: (ratio01: number) => void, signal?: AbortSignal, crop?: { x: number, y: number, w: number, h: number } | null, intrinsicWidth?: number, intrinsicHeight?: number }} [opts]
 * `crop` - pixel rect on decoded source frames; requires `intrinsicWidth` / `intrinsicHeight` (element `videoWidth` / `videoHeight`).
 * @returns {Promise<File>}
 */
export async function trimVideoFileToMp4(file, startSec, endSec, opts = {}) {
  const { onProgress, signal, crop: cropIn, intrinsicWidth: iw, intrinsicHeight: ih } = opts
  const start = Math.max(0, Number(startSec) || 0)
  const end = Math.max(start, Number(endSec) || 0)
  const dur = end - start
  if (!(dur > 0)) throw new Error('Invalid trim range.')

  const ffmpeg = await getFfmpeg()
  const extMatch = /\.[a-z0-9]+$/i.exec(file.name || '')
  const ext = extMatch ? extMatch[0].toLowerCase() : '.mp4'
  const inName = `in${ext}`
  const outName = 'out.mp4'

  const onProg = ({ progress }) => {
    if (typeof onProgress !== 'function') return
    const p = typeof progress === 'number' ? progress : 0
    onProgress(p <= 1 ? p : p / 100)
  }
  ffmpeg.on('progress', onProg)

  const { inputPath, mode } = await installTrimInput(ffmpeg, file, inName)

  /**
   * Optional crop (source pixels), then scale width to 1280 (height -2, bicubic).
   * With crop: crop=w:h:x:y,scale=1280:-2:flags=bicubic
   * No crop: scale=1280:-2:flags=bicubic
   */
  let vf = 'scale=1280:-2:flags=bicubic'
  if (cropIn && cropIn.w > 0 && cropIn.h > 0 && iw > 0 && ih > 0) {
    const c = sanitizeVideoCropPx(iw, ih, cropIn)
    if (c) vf = `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=1280:-2:flags=bicubic`
  }

  /**
   * Lounge trim (WASM intermediate). Groups:
   * - Demux / logging: -hide_banner -loglevel error -analyzeduration 1500000 -probesize 5242880
   * - Trim: -ss start -i input -t duration
   * - Video: -c:v libx264 -preset ultrafast -crf 27 -pix_fmt yuv420p
   * - Video filters: -vf (crop+,)scale=1280:-2:flags=bicubic
   * - Audio: -c:a aac -b:a 128k
   * - Mux: -movflags +faststart -y output.mp4
   */
  const demuxLogging = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-analyzeduration',
    '1500000',
    '-probesize',
    '5242880',
  ]
  const trim = ['-ss', String(start), '-i', inputPath, '-t', String(dur)]
  const video = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p']
  const videoFilters = ['-vf', vf]
  const audio = ['-c:a', 'aac', '-b:a', '128k']
  const mux = ['-movflags', '+faststart', '-y', outName]

  const args = [...demuxLogging, ...trim, ...video, ...videoFilters, ...audio, ...mux]

  try {
    const code = await ffmpeg.exec(args, undefined, { signal })
    if (code !== 0) throw new Error('Video encoding failed.')
  } finally {
    ffmpeg.off('progress', onProg)
    await uninstallTrimInput(ffmpeg, mode, inName)
  }

  const data = await ffmpeg.readFile(outName)
  try {
    await ffmpeg.deleteFile(outName)
  } catch {
    // ignore
  }

  const buf = data instanceof Uint8Array ? data : new Uint8Array(data)
  const base = String(file.name || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '_')
    .slice(0, 80)
  const outFile = new File([buf], `${base || 'clip'}-trimmed.mp4`, { type: 'video/mp4' })
  if (typeof onProgress === 'function') onProgress(1)
  return outFile
}
