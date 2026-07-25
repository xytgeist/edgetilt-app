import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'
import { probeVideoFileDurationSeconds } from './loungeVideoUpload.js'

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

const DEMUX_LOGGING = [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-analyzeduration',
  '100M',
  '-probesize',
  '100M',
]

/**
 * @param {string} inputPath
 * @param {number} startSec
 * @param {number} durSec
 * @param {{ forceSsBeforeInput?: boolean }} [opts]
 */
function buildInputArgs(inputPath, startSec, durSec, opts = {}) {
  const start = Math.max(0, Number(startSec) || 0)
  const dur = Math.max(0.001, Number(durSec) || 0)
  if (opts.forceSsBeforeInput || start > 0.05) {
    return ['-ss', String(start), '-i', inputPath, '-t', String(dur)]
  }
  return ['-i', inputPath, '-t', String(dur)]
}

/**
 * @param {string} vf scale/crop filter chain without leading format=
 * @param {boolean} videoOnly
 * @param {string} outName
 */
function buildOutputArgs(vf, videoOnly, outName) {
  const vfChain = vf.includes('format=') ? vf : `format=yuv420p,${vf}`
  const video = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p']
  const videoFilters = ['-vf', vfChain]
  const audio = videoOnly ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k']
  const mux = ['-movflags', '+faststart', '-y', outName]
  return [...video, ...videoFilters, ...audio, ...mux]
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string[]} args
 * @param {AbortSignal | undefined} signal
 */
async function execFfmpegLogged(ffmpeg, args, signal) {
  /** @type {string[]} */
  const logs = []
  const onLog = ({ message }) => {
    if (message) logs.push(String(message).trim())
  }
  ffmpeg.on('log', onLog)
  try {
    const code = await ffmpeg.exec(args, undefined, { signal })
    return { code, logs }
  } finally {
    ffmpeg.off('log', onLog)
  }
}

/**
 * @param {string[]} logs
 */
function formatFfmpegLogTail(logs) {
  const tail = logs.filter(Boolean).slice(-4).join(' | ')
  return tail.length > 240 ? `${tail.slice(0, 237)}…` : tail
}

/**
 * @param {object} opts
 * @param {File} opts.file
 * @param {number} opts.startSec
 * @param {number} opts.endSec
 * @param {string} opts.outName
 * @param {string} opts.inName
 * @param {string} opts.vf
 * @param {AbortSignal | undefined} opts.signal
 * @param {(ratio01: number) => void} [opts.onProgress]
 * @param {string} opts.outBaseName
 * @param {string} opts.outSuffix
 */
async function wasmReencodeToMp4({
  file,
  startSec,
  endSec,
  outName,
  inName,
  vf,
  signal,
  onProgress,
  outBaseName,
  outSuffix,
}) {
  const start = Math.max(0, Number(startSec) || 0)
  const end = Math.max(start, Number(endSec) || 0)
  const dur = end - start
  if (!(dur > 0)) throw new Error('Invalid trim range.')

  const ffmpeg = await getFfmpeg()

  const onProg = ({ progress }) => {
    if (typeof onProgress !== 'function') return
    const p = typeof progress === 'number' ? progress : 0
    onProgress(p <= 1 ? p : p / 100)
  }
  ffmpeg.on('progress', onProg)

  let mode
  let inputPath
  try {
    ;({ inputPath, mode } = await installTrimInput(ffmpeg, file, inName))
  } catch (mountErr) {
    ffmpeg.off('progress', onProg)
    throw mountErr instanceof Error ? mountErr : new Error(String(mountErr))
  }

  try {
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }

    const strategies = [
      { label: 'aac', videoOnly: false, forceSsBeforeInput: false },
      { label: 'video-only', videoOnly: true, forceSsBeforeInput: false },
      { label: 'video-only-ss', videoOnly: true, forceSsBeforeInput: true },
    ]

    /** @type {string[]} */
    let lastLogs = []
    let lastCode = 1

    for (const strategy of strategies) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      try {
        await ffmpeg.deleteFile(outName)
      } catch {
        // ignore
      }
      const inputPart = buildInputArgs(inputPath, start, dur, {
        forceSsBeforeInput: strategy.forceSsBeforeInput,
      })
      const outputPart = buildOutputArgs(vf, strategy.videoOnly, outName)
      const args = [...DEMUX_LOGGING, ...inputPart, ...outputPart]
      const { code, logs } = await execFfmpegLogged(ffmpeg, args, signal)
      lastCode = code
      lastLogs = logs
      if (code === 0) break
      console.warn('[lounge-video-encode]', strategy.label, 'exit', code, formatFfmpegLogTail(logs))
    }

    if (lastCode !== 0) {
      const tail = formatFfmpegLogTail(lastLogs)
      throw new Error(tail ? `Video encoding failed. ${tail}` : `Video encoding failed (exit ${lastCode}).`)
    }

    const data = await ffmpeg.readFile(outName)
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }

    const buf = data instanceof Uint8Array ? data : new Uint8Array(data)
    if (!buf.byteLength) throw new Error('Video encoding failed (empty output).')

    const outFile = new File([buf], `${outBaseName || 'clip'}-${outSuffix}.mp4`, { type: 'video/mp4' })
    if (typeof onProgress === 'function') onProgress(1)
    return outFile
  } finally {
    ffmpeg.off('progress', onProg)
    await uninstallTrimInput(ffmpeg, mode, inName)
  }
}

function fileBaseName(file) {
  return String(file?.name || 'video')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '_')
    .slice(0, 80)
}

function inputExt(file) {
  const extMatch = /\.[a-z0-9]+$/i.exec(file?.name || '')
  return extMatch ? extMatch[0].toLowerCase() : '.mp4'
}

/**
 * Re-encode a full video file to a chat-optimised MP4.
 *
 * @param {File} file
 * @param {{ onProgress?: (ratio01: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<File>}
 */
export async function encodeVideoForChat(file, opts = {}) {
  const { onProgress, signal } = opts
  const TAG = '[chat-video-encode]'
  console.log(TAG, 'start', { name: file.name, sizeMb: +(file.size / 1e6).toFixed(2), type: file.type })

  const dur = await probeVideoFileDurationSeconds(file)
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error('Could not read video duration.')
  }

  const ext = inputExt(file)
  return wasmReencodeToMp4({
    file,
    startSec: 0,
    endSec: dur,
    outName: 'chat_out.mp4',
    inName: `chat_in${ext}`,
    vf: 'scale=1280:-2:flags=bicubic',
    signal,
    onProgress,
    outBaseName: fileBaseName(file),
    outSuffix: 'chat',
  })
}

/**
 * Re-encode a segment to MP4 (browser-safe).
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {{ onProgress?: (ratio01: number) => void, signal?: AbortSignal, crop?: { x: number, y: number, w: number, h: number } | null, intrinsicWidth?: number, intrinsicHeight?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function trimVideoFileToMp4(file, startSec, endSec, opts = {}) {
  const { onProgress, signal, crop: cropIn, intrinsicWidth: iw, intrinsicHeight: ih } = opts
  const start = Math.max(0, Number(startSec) || 0)
  const end = Math.max(start, Number(endSec) || 0)
  const dur = end - start
  if (!(dur > 0)) throw new Error('Invalid trim range.')

  let vf = 'scale=1280:-2:flags=bicubic'
  if (cropIn && cropIn.w > 0 && cropIn.h > 0 && iw > 0 && ih > 0) {
    const c = sanitizeVideoCropPx(iw, ih, cropIn)
    if (c) vf = `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=1280:-2:flags=bicubic`
  }

  const ext = inputExt(file)
  return wasmReencodeToMp4({
    file,
    startSec: start,
    endSec: end,
    outName: 'out.mp4',
    inName: `in${ext}`,
    vf,
    signal,
    onProgress,
    outBaseName: fileBaseName(file),
    outSuffix: 'trimmed',
  })
}
