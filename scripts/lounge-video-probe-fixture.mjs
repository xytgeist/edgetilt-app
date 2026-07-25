/**
 * Probe + strategy smoke for a local Lounge video fixture using wasm ffmpeg.
 * Usage: node scripts/lounge-video-probe-fixture.mjs [path-to.mov]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const fixturePath = process.argv[2] || join(process.cwd(), 'IMG_1425.MOV')
if (!existsSync(fixturePath)) {
  console.error('Fixture not found:', fixturePath)
  process.exit(1)
}

const CORE_VERSION = '0.12.6'
const CORE_BASE = join(process.cwd(), 'node_modules', '@ffmpeg/core', 'dist', 'esm')

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

const DECODABLE = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'alac', 'mp4a'])

function parseStreams(logs) {
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

function decodableAudio(streams) {
  return streams
    .filter(
      (s) =>
        s.kind === 'audio'
        && s.codec !== 'none'
        && s.codec !== 'apac'
        && (DECODABLE.has(s.codec) || s.codec.startsWith('aac')),
    )
    .map((s) => s.index)
}

async function execLogged(ffmpeg, args) {
  const logs = []
  const onLog = ({ message }) => {
    if (message) logs.push(String(message).trim())
  }
  ffmpeg.on('log', onLog)
  try {
    const code = await ffmpeg.exec(args)
    return { code, logs }
  } finally {
    ffmpeg.off('log', onLog)
  }
}

async function probeInput(ffmpeg, inputPath) {
  const { logs } = await execLogged(ffmpeg, [...DEMUX_LOGGING, '-i', inputPath])
  return parseStreams(logs)
}

async function outputHasAudio(ffmpeg, outName) {
  const streams = await probeInput(ffmpeg, outName)
  return decodableAudio(streams).length > 0
}

const STRATEGIES = [
  {
    label: 'aac-by-codec',
    maps: ['-map', '0:v:0', '-map', '0:a:m:codec_name:aac?'],
  },
  {
    label: 'aac-by-mp4a',
    maps: ['-map', '0:v:0', '-map', '0:a:m:codec_name:mp4a?'],
  },
  {
    label: 'video-only',
    maps: ['-map', '0:v:0'],
    videoOnly: true,
  },
  {
    label: 'aac-mapped-0',
    maps: ['-map', '0:v:0', '-map', '0:a:0?'],
  },
  {
    label: 'exclude-a1',
    maps: ['-map', '0:v:0', '-map', '0:a', '-map', '-0:a:1'],
  },
  {
    label: 'exclude-a0',
    maps: ['-map', '0:v:0', '-map', '0:a', '-map', '-0:a:0'],
  },
]

function buildArgs(inputPath, strategy, outName, durSec) {
  const movHints = /\.mov$/i.test(inputPath) ? ['-ignore_editlist', '1'] : []
  const vf = 'format=yuv420p,scale=720:-2:flags=bicubic'
  const audio = strategy.videoOnly
    ? ['-an']
    : strategy.audioCopy
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100']
  return [
    ...DEMUX_LOGGING,
    ...movHints,
    '-i',
    inputPath,
    '-t',
    String(durSec),
    ...strategy.maps,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    vf,
    ...audio,
    '-movflags',
    '+faststart',
    '-y',
    outName,
  ]
}

async function main() {
  const bytes = readFileSync(fixturePath)
  console.log('Fixture:', fixturePath)
  console.log('Size MB:', (bytes.length / (1024 * 1024)).toFixed(2))

  const ffmpeg = new FFmpeg()
  console.log('Loading wasm ffmpeg...')
  await ffmpeg.load({
    coreURL: await toBlobURL(join(CORE_BASE, 'ffmpeg-core.js'), 'text/javascript'),
    wasmURL: await toBlobURL(join(CORE_BASE, 'ffmpeg-core.wasm'), 'application/wasm'),
  })

  const inName = basename(fixturePath)
  console.log('Writing input to MEMFS (may take a moment)...')
  await ffmpeg.writeFile(inName, await fetchFile(new Blob([bytes])))

  const streams = await probeInput(ffmpeg, inName)
  console.log('\n=== STREAM PROBE ===')
  for (const s of streams) {
    console.log(`  #0:${s.index} ${s.kind} codec=${s.codec}`)
  }
  const dec = decodableAudio(streams)
  console.log('Decodable audio indices:', dec.length ? dec.join(',') : '(none)')

  const durSec = 46.35
  console.log('\n=== ENCODE STRATEGIES (first', durSec, 's) ===')
  /** @type {{ label: string, ok: boolean, outAudio: boolean, tail: string }[]} */
  const results = []

  for (const strategy of STRATEGIES) {
    const outName = `out_${strategy.label}.mp4`
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // ignore
    }
    process.stdout.write(`Trying ${strategy.label}... `)
    const { code, logs } = await execLogged(ffmpeg, buildArgs(inName, strategy, outName, durSec))
    const tail = logs.slice(-4).join(' | ')
    if (code !== 0) {
      console.log('FAIL exit', code)
      console.log('  ', tail)
      results.push({ label: strategy.label, ok: false, outAudio: false, tail })
      continue
    }
    const outAudio = strategy.videoOnly ? false : await outputHasAudio(ffmpeg, outName)
    let outBytes = 0
    try {
      const out = await ffmpeg.readFile(outName)
      outBytes = out.length
      writeFileSync(join(process.cwd(), `.tmp-${strategy.label}.mp4`), out)
    } catch {
      // ignore
    }
    console.log(outAudio ? 'OK + audio' : strategy.videoOnly ? 'OK video-only' : 'OK but NO audio', `(${Math.round(outBytes / 1024)}KB)`)
    results.push({ label: strategy.label, ok: true, outAudio, tail: `${Math.round(outBytes / 1024)}KB` })
  }

  console.log('\n=== SUMMARY ===')
  for (const r of results) {
    console.log(`${r.ok ? 'pass' : 'fail'} ${r.label}${r.outAudio ? ' +audio' : ''} ${r.tail}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
