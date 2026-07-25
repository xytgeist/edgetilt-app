import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { sanitizeVideoCropPx } from './loungeVideoCropMath.js'
import { maybeReportLoungeVideoUploadDebug } from '../features/lounge/loungeFeedVideoDebugRegistry.js'
import {
  extractBrowserVideoAudio,
  hasBrowserVideoAudioUserActivation,
} from './loungeVideoBrowserAudio.js'
import { probeVideoFileDurationSeconds, probeVideoFileHasAudio, isLoungeVideoQuicktimeMov } from './loungeVideoUpload.js'

const LOUNGE_ENCODE_SCALE_VF = 'scale=720:-2:flags=bicubic:in_range=full:out_range=mpeg'
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

/** Stream `#0:N` lines are INFO-level; `-loglevel warning` hides them and breaks output audio probes. */
const PROBE_LOGGING = [
  '-hide_banner',
  '-loglevel',
  'info',
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

/** @param {Uint8Array} haystack @param {string} needle */
function indexOfAscii(haystack, needle) {
  const n = needle.length
  if (!n || haystack.length < n) return -1
  outer: for (let i = 0; i <= haystack.length - n; i++) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

/**
 * faststart MP4 keeps `moov` near the front — scan there for AAC sample entry + sound handler.
 * iOS wasm often emits no parseable `Stream #0:N` log lines, so atom scan is the reliable check.
 * @param {Uint8Array | ArrayBuffer} data
 */
function mp4BytesLikelyHasAudio(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (u8.byteLength < 64) return false
  const head = u8.subarray(0, Math.min(u8.byteLength, 768 * 1024))
  const hasMp4a = indexOfAscii(head, 'mp4a') >= 0
  const hasSoun = indexOfAscii(head, 'soun') >= 0
  const hasAacSample = indexOfAscii(head, 'aac ') >= 0
  return hasMp4a && (hasSoun || hasAacSample)
}

/** @param {string[]} logs encode stderr from a completed ffmpeg exec */
function encodeLogsIndicateAudioMux(logs) {
  let inMapping = false
  for (const raw of logs) {
    const line = String(raw || '')
    if (/^Stream mapping:/i.test(line)) {
      inMapping = true
      continue
    }
    if (inMapping) {
      if (!line.trim()) {
        inMapping = false
        continue
      }
      if (/Stream #0:\d+ -> #0:\d+/i.test(line) && /\(aac|\(mp3|\(opus|\(flac|\(alac|\(mp4a/i.test(line)) {
        return true
      }
      if (!line.startsWith('  Stream')) inMapping = false
    }
    if (/Output #0.*,\s*mp4/i.test(line) && /\baudio:/i.test(line)) return true
  }
  return false
}

/**
 * @param {string[]} logs ffmpeg `-i` demuxer lines
 * @returns {{ index: number, kind: string, codec: string }[]}
 */
function parseFfmpegInputStreams(logs) {
  /** @type {{ index: number, kind: string, codec: string }[]} */
  const streams = []
  for (const raw of logs) {
    const line = String(raw || '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim()
    let m =
      /Stream #0:(\d+)(?:\[\d+\])?(?:\([^)]*\))?: (Video|Audio|Data|Subtitle): (\S+)/i.exec(line)
    if (!m) {
      m = /Stream #0:(\d+)\([^)]*\):\s*(Video|Audio|Data|Subtitle):\s*(\S+)/i.exec(line)
    }
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
        && s.codec !== 'apac'
        && (DECODABLE_AUDIO_CODECS.has(s.codec) || s.codec.startsWith('aac')),
    )
    .map((s) => s.index)
}

/** Encoded MP4 output: accept any non-spatial audio track (wasm may label AAC differently). */
function encodedOutputHasAudioStream(streams) {
  return streams.some(
    (s) => s.kind === 'audio' && s.codec !== 'none' && s.codec !== 'apac',
  )
}

/** @param {{ index: number, kind: string, codec: string }[]} streams */
function formatStreamProbeLog(streams) {
  if (!streams.length) return 'probe streams none'
  const parts = streams.map((s) => `${s.index}:${s.codec}`)
  return `probe streams ${parts.join(',')}`
}

/**
 * iPhone spatial / apac tracks wasm cannot decode (often stream #1).
 * @param {{ index: number, kind: string, codec: string }[]} streams
 * @returns {number[]}
 */
function spatialBlockedAudioIndices(streams) {
  return streams
    .filter((s) => s.kind === 'audio' && (s.codec === 'none' || s.codec === 'apac'))
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
    [...PROBE_LOGGING, '-i', inputPath],
    signal,
  )
  return parseFfmpegInputStreams(logs)
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string} outName
 * @param {AbortSignal | undefined} signal
 * @param {{ encodeLogs?: string[] }} [opts]
 * @returns {Promise<{ hasAudio: boolean, via: string }>}
 */
async function probeEncodedOutputHasAudio(ffmpeg, outName, signal, opts = {}) {
  const streams = await probeFfmpegInputStreams(ffmpeg, outName, signal)
  if (encodedOutputHasAudioStream(streams)) {
    return { hasAudio: true, via: 'ffprobe' }
  }
  let bytes = /** @type {Uint8Array | null} */ (null)
  try {
    const data = await ffmpeg.readFile(outName)
    bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    if (mp4BytesLikelyHasAudio(bytes)) {
      return { hasAudio: true, via: 'mp4a-atom' }
    }
  } catch {
    // ignore
  }
  if (Array.isArray(opts.encodeLogs) && encodeLogsIndicateAudioMux(opts.encodeLogs)) {
    return { hasAudio: true, via: 'encode-log' }
  }
  return { hasAudio: false, via: 'none' }
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string} outName
 * @param {AbortSignal | undefined} signal
 */
async function probeFfmpegOutputHasAudio(ffmpeg, outName, signal) {
  const { hasAudio } = await probeEncodedOutputHasAudio(ffmpeg, outName, signal)
  return hasAudio
}

/**
 * @param {Awaited<ReturnType<typeof getFfmpeg>>} ffmpeg
 * @param {string} outName
 * @param {AbortSignal | undefined} signal
 * @param {{ encodeLogs?: string[] }} [opts]
 */
async function probeFfmpegOutputFileMeta(ffmpeg, outName, signal, opts = {}) {
  const streams = await probeFfmpegInputStreams(ffmpeg, outName, signal)
  let bytes = 0
  let mp4a = false
  let verifyVia = 'none'
  try {
    const data = await ffmpeg.readFile(outName)
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
    bytes = u8.byteLength
    mp4a = mp4BytesLikelyHasAudio(u8)
    if (mp4a) verifyVia = 'mp4a-atom'
    else if (encodedOutputHasAudioStream(streams)) verifyVia = 'ffprobe'
    else if (Array.isArray(opts.encodeLogs) && encodeLogsIndicateAudioMux(opts.encodeLogs)) {
      verifyVia = 'encode-log'
    }
  } catch {
    // ignore
  }
  return { streams, bytes, mp4a, verifyVia }
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
 *   browserAudioFile?: string,
 * }} EncodeStrategy
 */

function isLikelyIphoneSpatialMov(file) {
  return isLoungeVideoQuicktimeMov(file)
}

/** @param {boolean} sourceHasAudio @param {number[]} audioStreamIndices @param {{ index: number, kind: string, codec: string }[]} probedStreams @param {{ allowVideoOnlyFallback?: boolean, forceIphoneSpatialGuess?: boolean }} [opts] */
function buildEncodeStrategies(sourceHasAudio, audioStreamIndices, probedStreams, opts = {}) {
  const { allowVideoOnlyFallback = false, forceIphoneSpatialGuess = false } = opts
  const videoOnlyFallback = /** @type {EncodeStrategy[]} */ ([
    { label: 'video-only-mapped', videoOnly: true, forceSsBeforeInput: false, useMaps: true },
    { label: 'video-only-ss', videoOnly: true, forceSsBeforeInput: true, useMaps: true },
  ])

  /** @type {EncodeStrategy[]} */
  const withAudio = []
  const spatialBlocked = spatialBlockedAudioIndices(probedStreams)
  const seenStreamLabels = new Set()

  const pushStreamStrategy = (idx, copy = false) => {
    const label = copy ? `aac-copy-stream-${idx}` : `aac-stream-${idx}`
    if (seenStreamLabels.has(label)) return
    seenStreamLabels.add(label)
    withAudio.push({
      label,
      maps: ['-map', '0:v:0', '-map', `0:${idx}`],
      audioCopy: copy,
      requireOutputAudio: true,
    })
  }

  if (spatialBlocked.includes(1) || forceIphoneSpatialGuess) {
    // Copy AAC from stream #2 before re-encode (lighter; wasm AAC encoder can flake on iOS).
    pushStreamStrategy(2, true)
    pushStreamStrategy(2, false)
    withAudio.push(
      {
        label: 'aac-second-audio-stream',
        maps: ['-map', '0:v:0', '-map', '0:a:1'],
        requireOutputAudio: true,
      },
      {
        label: 'exclude-spatial-a1',
        maps: ['-map', '0:v:0', '-map', '0:a', '-map', '-0:1'],
        requireOutputAudio: true,
      },
    )
  } else if (audioStreamIndices.length === 1) {
    pushStreamStrategy(audioStreamIndices[0], false)
  } else if (audioStreamIndices.length > 1) {
    for (const idx of audioStreamIndices) {
      pushStreamStrategy(idx, false)
    }
  } else {
    withAudio.push({
      label: 'aac-mapped-default',
      videoOnly: false,
      forceSsBeforeInput: false,
      useMaps: true,
      requireOutputAudio: true,
    })
  }

  if (audioStreamIndices.length > 0 && (spatialBlocked.includes(1) || forceIphoneSpatialGuess)) {
    for (const idx of audioStreamIndices) {
      pushStreamStrategy(idx, true)
    }
  }

  if (allowVideoOnlyFallback || !sourceHasAudio) {
    return [...withAudio, ...videoOnlyFallback]
  }
  return withAudio
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
    const r = p <= 1 ? p : p / 100
    onProgress(encodeProgressBase + r * (1 - encodeProgressBase))
  }
  ffmpeg.on('progress', onProg)

  let mode
  let inputPath
  let encodeProgressBase = 0
  try {
    ;({ inputPath, mode } = await installTrimInput(ffmpeg, file, inName))
  } catch (mountErr) {
    ffmpeg.off('progress', onProg)
    throw mountErr instanceof Error ? mountErr : new Error(String(mountErr))
  }

  let audioStreamIndices = []
  /** @type {{ index: number, kind: string, codec: string }[]} */
  let probedStreams = []
  try {
    probedStreams = await probeFfmpegInputStreams(ffmpeg, inputPath, signal)
    audioStreamIndices = decodableAudioStreamIndices(probedStreams)
    maybeReportLoungeVideoUploadDebug('encode', formatStreamProbeLog(probedStreams))
    if (probedStreams.length === 0 && isLikelyIphoneSpatialMov(file)) {
      maybeReportLoungeVideoUploadDebug(
        'encode',
        'input probe no ffmpeg stream lines (iOS wasm); assuming spatial+aac MOV',
      )
    }
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

  /** @type {string | null} */
  let browserAudioFile = null

  /** @param {EncodeStrategy[]} strategies */
  async function runEncodeStrategies(strategies) {
    /** @type {string[]} */
    let lastLogs = []
    let lastCode = 1
    /** @type {string} */
    let lastFailureHint = ''
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
      /** @type {string[]} */
      const args = [...DEMUX_LOGGING, ...inputPart]
      if (strategy.browserAudioFile) {
        args.push('-i', strategy.browserAudioFile)
      }
      args.push(...buildOutputArgs(vf, strategy, outName))
      const { code, logs } = await execFfmpegLogged(ffmpeg, args, signal)
      lastCode = code
      lastLogs = logs
      if (code === 0) {
        const needsOutputAudio =
          sourceHasAudio && !strategy.videoOnly && strategy.requireOutputAudio !== false
        if (needsOutputAudio) {
          let outHasAudio = false
          let verifyVia = 'none'
          try {
            const verified = await probeEncodedOutputHasAudio(ffmpeg, outName, signal, {
              encodeLogs: logs,
            })
            outHasAudio = verified.hasAudio
            verifyVia = verified.via
          } catch (probeOutErr) {
            console.warn('[lounge-video-encode] output audio probe failed', probeOutErr)
          }
          if (!outHasAudio) {
            let probeDetail = 'out probe none'
            try {
              const meta = await probeFfmpegOutputFileMeta(ffmpeg, outName, signal, {
                encodeLogs: logs,
              })
              probeDetail = `${formatStreamProbeLog(meta.streams)} ${Math.round(meta.bytes / 1024)}KB mp4a=${meta.mp4a ? 'yes' : 'no'} via=${meta.verifyVia}`
            } catch {
              // ignore
            }
            lastFailureHint = `${strategy.label}: no output audio (${probeDetail})`
            maybeReportLoungeVideoUploadDebug(
              'encode',
              `try ${strategy.label} no output audio track · ${probeDetail}`,
            )
            continue
          }
          maybeReportLoungeVideoUploadDebug(
            'encode',
            `try ${strategy.label} output audio ok via=${verifyVia}`,
          )
        }
        winningStrategy = strategy
        break
      }
      lastFailureHint = `${strategy.label}: exit ${code}`
      console.warn('[lounge-video-encode]', strategy.label, 'exit', code, formatFfmpegLogTail(logs))
      maybeReportLoungeVideoUploadDebug(
        'encode',
        `try ${strategy.label} failed: ${formatFfmpegLogTail(logs)}`,
      )
    }

    return { winningStrategy, lastCode, lastLogs, lastFailureHint }
  }

  async function maybeExtractBrowserAudio() {
    if (!sourceHasAudio || browserAudioFile) return
    if (isLikelyIphoneSpatialMov(file) && !hasBrowserVideoAudioUserActivation()) {
      maybeReportLoungeVideoUploadDebug(
        'encode',
        'browser audio skipped (activation=no on iOS MOV)',
      )
      return
    }
    try {
      maybeReportLoungeVideoUploadDebug('encode', 'browser audio extract start')
      const extracted = await extractBrowserVideoAudio(
        file,
        start,
        end,
        signal,
        (r) => {
          if (typeof onProgress !== 'function') return
          onProgress(Math.min(0.12, Math.max(0, r) * 0.12))
        },
        (detail) => maybeReportLoungeVideoUploadDebug('encode', detail),
      )
      browserAudioFile = `browser_audio${extracted.ext}`
      await ffmpeg.writeFile(browserAudioFile, await fetchFile(extracted.blob))
      const browserAudioHasStream = await probeFfmpegOutputHasAudio(
        ffmpeg,
        browserAudioFile,
        signal,
      ).catch(() => false)
      if (!browserAudioHasStream) {
        maybeReportLoungeVideoUploadDebug(
          'encode',
          `browser audio file not decodable by wasm (${extracted.method})`,
        )
        try {
          await ffmpeg.deleteFile(browserAudioFile)
        } catch {
          // ignore
        }
        browserAudioFile = null
      } else {
        maybeReportLoungeVideoUploadDebug(
          'encode',
          `browser audio extract ok ${extracted.method} ${Math.round(extracted.blob.size / 1024)}KB`,
        )
      }
    } catch (browserAudioErr) {
      const msg =
        browserAudioErr instanceof Error ? browserAudioErr.message : String(browserAudioErr)
      maybeReportLoungeVideoUploadDebug('encode', `browser audio extract failed: ${msg}`)
    }
  }

  const spatialBlocked = spatialBlockedAudioIndices(probedStreams)
  const forceIphoneSpatialGuess =
    sourceHasAudio
    && audioStreamIndices.length === 0
    && isLikelyIphoneSpatialMov(file)
  if (forceIphoneSpatialGuess) {
    maybeReportLoungeVideoUploadDebug('encode', 'iphone spatial mov guess (no decodable audio in probe)')
  }
  let strategies = buildEncodeStrategies(sourceHasAudio, audioStreamIndices, probedStreams, {
    allowVideoOnlyFallback: !sourceHasAudio,
    forceIphoneSpatialGuess,
  })
  if (spatialBlocked.length > 0) {
    maybeReportLoungeVideoUploadDebug(
      'encode',
      `spatial blocked audio [${spatialBlocked.join(',')}]`,
    )
  }

  try {
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }

    let { winningStrategy, lastCode, lastLogs, lastFailureHint } = await runEncodeStrategies(strategies)

    if (!winningStrategy && sourceHasAudio) {
      await maybeExtractBrowserAudio()
      if (browserAudioFile) {
        strategies = buildEncodeStrategies(sourceHasAudio, audioStreamIndices, probedStreams, {
          allowVideoOnlyFallback: false,
          forceIphoneSpatialGuess,
        })
        strategies.unshift(
          {
            label: 'browser-audio-mux',
            maps: ['-map', '0:v:0', '-map', '1:a:0'],
            browserAudioFile,
            requireOutputAudio: true,
          },
          {
            label: 'browser-audio-copy-mux',
            maps: ['-map', '0:v:0', '-map', '1:a:0'],
            browserAudioFile,
            audioCopy: true,
            requireOutputAudio: true,
          },
        )
        encodeProgressBase = 0.12
        ;({ winningStrategy, lastCode, lastLogs, lastFailureHint } = await runEncodeStrategies(strategies))
      }
    }

    if (lastCode !== 0 || !winningStrategy) {
      const inputProbe = formatStreamProbeLog(probedStreams)
      const hint = lastFailureHint || formatFfmpegLogTail(lastLogs)
      throw new Error(
        hint
          ? `Video encoding failed (${inputProbe}). ${hint}`
          : `Video encoding failed (exit ${lastCode}). ${inputProbe}`,
      )
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

    if (sourceHasAudio && !outputHasAudio) {
      throw new Error(
        `Video encoding finished without an audio track (${winningStrategy.label}).`,
      )
    }

    const data = await ffmpeg.readFile(outName)
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }
    if (browserAudioFile) {
      try {
        await ffmpeg.deleteFile(browserAudioFile)
      } catch {
        // ignore
      }
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
