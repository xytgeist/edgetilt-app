import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'

/** Must match the ESM build served for `ffmpeg.load` (see @ffmpeg/ffmpeg 0.12 docs). */
const CORE_VERSION = '0.12.6'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

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

/** Warm ffmpeg core in the background (first open of trim modal). */
export function prefetchFfmpegCore() {
  return getFfmpeg().then(() => {})
}

/**
 * Re-encode a segment to MP4 (browser-safe).
 *
 * @param {File} file
 * @param {number} startSec
 * @param {number} endSec
 * @param {{ onProgress?: (ratio01: number) => void, signal?: AbortSignal, crop?: { x: number, y: number, w: number, h: number } | null, intrinsicWidth?: number, intrinsicHeight?: number }} [opts]
 * `crop` — pixel rect on decoded source frames; requires `intrinsicWidth` / `intrinsicHeight` (element `videoWidth` / `videoHeight`).
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

  await ffmpeg.writeFile(inName, await fetchFile(file))

  /** Crop uses caller dimensions so x/y/w/h stay valid for the encoded source size. */
  const vfParts = []
  if (cropIn && cropIn.w > 0 && cropIn.h > 0 && iw > 0 && ih > 0) {
    const c = sanitizeVideoCropPx(iw, ih, cropIn)
    if (c) vfParts.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`)
  }

  const args = [
    '-ss',
    String(start),
    '-i',
    inName,
    '-t',
    String(dur),
  ]
  if (vfParts.length) args.push('-vf', vfParts.join(','))
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '26',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outName,
  )

  try {
    const code = await ffmpeg.exec(args, undefined, { signal })
    if (code !== 0) throw new Error('Video encoding failed.')
  } finally {
    ffmpeg.off('progress', onProg)
    try {
      await ffmpeg.deleteFile(inName)
    } catch {
      // ignore
    }
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
