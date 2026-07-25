import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'
import { maybeReportLoungeVideoUploadDebug } from '../features/lounge/loungeFeedVideoDebugRegistry.js'
import { probeVideoFileDurationSeconds, probeVideoFileHasAudio } from './loungeVideoUpload.js'

const LOUNGE_ENCODE_SCALE_VF = 'scale=720:-2:flags=bicubic'
const LOUNGE_ENCODE_CRF = '30'

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
  '-err_detect',
  'ignore_err',
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
  const movHints = /\.mov$/i.test(inputPath) ? ['-ignore_editlist', '1'] : []
  if (opts.forceSsBeforeInput || start > 0.05) {
    return [...movHints, '-ss', String(start), '-i', inputPath, '-t', String(dur)]
  }
  return [...movHints, '-i', inputPath, '-t', String(dur)]
}

const DECODABLE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'alac', 'mp4a'])

/**
 * @param {string[]} logs ffmpeg `-i` demuxer lines
 * @returns {{ index: number, kind: string, codec: string }[]}
 */
function parseFfmpegInputStreams(logs) {
  /** @type {{ index: number, kind: string, codec: string }[]} */
  const streams = []
  for (const raw of logs) {
    const line = String(raw || '')
    const m =
      /Stream #0:(\d+)(?:\[\d+\])?(?:\([^)]*\))?: (Video|Audio|Data|Subtitle): (\S+)/i.exec(line)
    if (!m) continue
    streams.push({
      index: Number(m[1]),
      kind: m[2].toLowerCase(),
      codec: m[3].toLowerCase().replace(/[,(].*$/, ''),
    })
  }
  return streams
}

/**
 * @param {{ index: number, kind: string, codec: string }[]} streams
 * @returns {number[]}
 */
function decodableAudioStreamIndices(streams) {
  return streams
    .filter(
      (s) =>
        s.kind === 'audio'
        && s.codec !== 'none'
        && (DECODABLE_AUDIO_CODECS.has(s.codec) || s.codec.startsWith('aac')),
    )
    .map((s) => s.index)
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string} inputPath
 * @param {AbortSignal | undefined} signal
 */
async function probeFfmpegInputStreams(ffmpeg, inputPath, signal) {
  const { logs } = await execFfmpegLogged(
    ffmpeg,
    [...DEMUX_LOGGING, '-i', inputPath],
    signal,
  )
  return parseFfmpegInputStreams(logs)
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string} outName
 * @param {AbortSignal | undefined} signal
 */
async function probeFfmpegOutputHasAudio(ffmpeg, outName, signal) {
  const streams = await probeFfmpegInputStreams(ffmpeg, outName, signal)
  return decodableAudioStreamIndices(streams).length > 0
}

/**
 * @param {string} vf scale/crop filter chain without leading format=
 * @param {{ videoOnly?: boolean, useMaps?: boolean, audioCopy?: boolean, maps?: string[] }} strategy
 * @param {string} outName
 */
function buildOutputArgs(vf, strategy, outName) {
  const vfChain = vf.includes('format=') ? vf : `format=yuv420p,${vf}`
  const videoOnly = Boolean(strategy.videoOnly)
  /** @type {string[]} */
  let maps = []
  if (Array.isArray(strategy.maps) && strategy.maps.length > 0) {
    maps = strategy.maps
  } else if (videoOnly) {
    maps = ['-map', '0:v:0']
  } else if (strategy.useMaps) {
    maps = ['-map', '0:v:0', '-map', '0:a:0?']
  }
  const video = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', LOUNGE_ENCODE_CRF, '-pix_fmt', 'yuv420p']
  const videoFilters = ['-vf', vfChain]
  let audio
  if (videoOnly) {
    audio = ['-an']
  } else if (strategy.audioCopy) {
    audio = ['-c:a', 'copy']
  } else {
    audio = ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100']
  }
  const mux = ['-movflags', '+faststart', '-y', outName]
  return [...maps, ...video, ...videoFilters, ...audio, ...mux]
}

/**
 * @typedef {{
 *   label: string,
 *   videoOnly?: boolean,
 *   forceSsBeforeInput?: boolean,
 *   useMaps?: boolean,
 *   audioCopy?: boolean,
 *   maps?: string[],
 *   requireOutputAudio?: boolean,
 * }} EncodeStrategy
 */

/** @param {boolean} sourceHasAudio @param {number[]} audioStreamIndices */
function buildEncodeStrategies(sourceHasAudio, audioStreamIndices) {
  const videoOnlyFallback = /** @type {EncodeStrategy[]} */ ([
    { label: 'video-only-mapped', videoOnly: true, forceSsBeforeInput: false, useMaps: true },
    { label: 'video-only-ss', videoOnly: true, forceSsBeforeInput: true, useMaps: true },
  ])

  /** @type {EncodeStrategy[]} */
  const withAudio = [
    {
      label: 'aac-by-codec',
      maps: ['-map', '0:v:0', '-map', '0:a:m:codec_name:aac'],
      requireOutputAudio: true,
    },
    {
      label: 'aac-by-mp4a',
      maps: ['-map', '0:v:0', '-map', '0:a:m:codec_name:mp4a'],
      requireOutputAudio: true,
    },
  ]

  for (const idx of audioStreamIndices) {
    withAudio.push({
      label: `aac-stream-${idx}`,
      maps: ['-map', '0:v:0', '-map', `0:${idx}`],
      requireOutputAudio: true,
    })
    withAudio.push({
      label: `aac-copy-stream-${idx}`,
      maps: ['-map', '0:v:0', '-map', `0:${idx}`],
      audioCopy: true,
    })
  }

  withAudio.push(
    {
      label: 'aac-mapped',
      videoOnly: false,
      forceSsBeforeInput: false,
      useMaps: true,
      requireOutputAudio: true,
    },
    {
      label: 'aac-mapped-ss',
      videoOnly: false,
      forceSsBeforeInput: true,
      useMaps: true,
      requireOutputAudio: true,
    },
    {
      label: 'aac-copy-mapped',
      videoOnly: false,
      forceSsBeforeInput: false,
      useMaps: true,
      audioCopy: true,
      requireOutputAudio: true,
    },
  )

  if (sourceHasAudio) {
    // Never silently strip audio when the source likely has it (iOS always reports unknown → true).
    return withAudio
  }
  return [...withAudio, ...videoOnlyFallback]
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

  const sourceHasAudio = await probeVideoFileHasAudio(file)

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

  let audioStreamIndices = []
  try {
    const streams = await probeFfmpegInputStreams(ffmpeg, inputPath, signal)
    audioStreamIndices = decodableAudioStreamIndices(streams)
    if (audioStreamIndices.length > 0) {
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `probe audio streams [${audioStreamIndices.join(',')}]`,
      )
    } else {
      maybeReportLoungeVideoUploadDebug('encode', 'probe no decodable audio stream index')
    }
  } catch (probeErr) {
    console.warn('[lounge-video-encode] stream probe failed', probeErr)
  }

  const strategies = buildEncodeStrategies(sourceHasAudio, audioStreamIndices)

  try {
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }

    /** @type {string[]} */
    let lastLogs = []
    let lastCode = 1
    /** @type {EncodeStrategy | null} */
    let winningStrategy = null

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
      const outputPart = buildOutputArgs(vf, strategy, outName)
      const args = [...DEMUX_LOGGING, ...inputPart, ...outputPart]
      const { code, logs } = await execFfmpegLogged(ffmpeg, args, signal)
      lastCode = code
      lastLogs = logs
      if (code === 0) {
        const needsOutputAudio =
          sourceHasAudio && !strategy.videoOnly && strategy.requireOutputAudio !== false
        if (needsOutputAudio) {
          let outHasAudio = false
          try {
            outHasAudio = await probeFfmpegOutputHasAudio(ffmpeg, outName, signal)
          } catch (probeOutErr) {
            console.warn('[lounge-video-encode] output audio probe failed', probeOutErr)
          }
          if (!outHasAudio) {
            maybeReportLoungeVideoUploadDebug(
              'encode',
              `try ${strategy.label} no output audio track`,
            )
            continue
          }
        }
        winningStrategy = strategy
        break
      }
      console.warn('[lounge-video-encode]', strategy.label, 'exit', code, formatFfmpegLogTail(logs))
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `try ${strategy.label} failed: ${formatFfmpegLogTail(logs)}`,
      )
    }

    if (lastCode !== 0 || !winningStrategy) {
      const tail = formatFfmpegLogTail(lastLogs)
      throw new Error(tail ? `Video encoding failed. ${tail}` : `Video encoding failed (exit ${lastCode}).`)
    }

    const outputHasAudio = winningStrategy.videoOnly
      ? false
      : await probeFfmpegOutputHasAudio(ffmpeg, outName, signal).catch(() => false)
    console.log('[lounge-video-encode]', 'success', {
      strategy: winningStrategy.label,
      sourceHasAudio,
      outputHasAudio,
    })
    maybeReportLoungeVideoUploadDebug(
      'encode',
      `success ${winningStrategy.label} outAudio=${outputHasAudio ? 'yes' : 'no'}`,
    )

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
    vf: LOUNGE_ENCODE_SCALE_VF,
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

  let vf = LOUNGE_ENCODE_SCALE_VF
  if (cropIn && cropIn.w > 0 && cropIn.h > 0 && iw > 0 && ih > 0) {
    const c = sanitizeVideoCropPx(iw, ih, cropIn)
    if (c) vf = `crop=${c.w}:${c.h}:${c.x}:${c.y},${LOUNGE_ENCODE_SCALE_VF}`
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
