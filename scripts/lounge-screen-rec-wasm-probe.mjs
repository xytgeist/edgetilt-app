/**
 * Browser wasm probe for ReplayKit screen recordings (WORKERFS + screen-rec ladder).
 * Usage: node scripts/lounge-screen-rec-wasm-probe.mjs [path-to.mov]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

const root = process.cwd()
const vendorRoots = {
  '/vendor/ffmpeg/': join(root, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm'),
  '/vendor/util/': join(root, 'node_modules', '@ffmpeg', 'util', 'dist', 'esm'),
  '/vendor/core/': join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm'),
}

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.js') return 'text/javascript'
  if (ext === '.wasm') return 'application/wasm'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function tryServeVendor(urlPath, res) {
  for (const [prefix, dir] of Object.entries(vendorRoots)) {
    if (!urlPath.startsWith(prefix)) continue
    const rel = urlPath.slice(prefix.length)
    if (!rel || rel.includes('..')) {
      res.writeHead(400)
      res.end('bad path')
      return true
    }
    const filePath = join(dir, rel)
    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end('missing ' + urlPath)
      return true
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) })
    res.end(readFileSync(filePath))
    return true
  }
  return false
}

const fixturePath = process.argv[2] || join(root, 'test_files', 'ScreenRecording_07-26-2026 17-30-57_1.mov')
if (!existsSync(fixturePath)) {
  console.error('Missing fixture:', fixturePath)
  process.exit(1)
}

const fixtureBytes = readFileSync(fixturePath)
const fixtureName = basename(fixturePath)
const durSec = 15.37

const html = `<!doctype html><html><body><pre id="out">loading...</pre><script type="module">
import { FFmpeg } from '/vendor/ffmpeg/index.js'
import { toBlobURL } from '/vendor/util/index.js'

const out = document.getElementById('out')
const log = (s) => { out.textContent += s + '\\n'; console.log(s) }

const DEMUX = ['-hide_banner','-loglevel','warning','-analyzeduration','100M','-probesize','100M','-err_detect','ignore_err']
const VF = 'format=yuv420p,scale=720:-2:flags=bicubic:in_range=full:out_range=mpeg'

function parseStreams(logs) {
  const streams = []
  for (const raw of logs) {
    const line = String(raw || '').replace(/^\\[[^\\]]+\\]\\s*/, '').trim()
    let m = /Stream #0:(\\d+)(?:\\[\\d+\\])?(?:\\([^)]*\\))?: (Video|Audio|Data|Subtitle): (\\S+)/i.exec(line)
    if (!m) m = /Stream #0:(\\d+)\\([^)]*\\):\\s*(Video|Audio|Data|Subtitle):\\s*(\\S+)/i.exec(line)
    if (!m) continue
    streams.push({ index: Number(m[1]), kind: m[2].toLowerCase(), codec: m[3].toLowerCase().replace(/[,(].*$/, '') })
  }
  return streams
}

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

function mp4BytesLikelyHasVideo(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (u8.byteLength < 64) return false
  const head = u8.subarray(0, Math.min(u8.byteLength, 768 * 1024))
  const hasVide = indexOfAscii(head, 'vide') >= 0
  const hasAvc = indexOfAscii(head, 'avc1') >= 0
  const hasHvc = indexOfAscii(head, 'hvc1') >= 0 || indexOfAscii(head, 'hev1') >= 0
  return hasVide && (hasAvc || hasHvc)
}

function mp4BytesLikelyHasAudio(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (u8.byteLength < 64) return false
  const head = u8.subarray(0, Math.min(u8.byteLength, 768 * 1024))
  const hasMp4a = indexOfAscii(head, 'mp4a') >= 0
  const hasSoun = indexOfAscii(head, 'soun') >= 0
  const hasAacSample = indexOfAscii(head, 'aac ') >= 0
  return hasMp4a && (hasSoun || hasAacSample)
}

async function execLogged(ffmpeg, args) {
  const logs = []
  const onLog = ({ message }) => { if (message) logs.push(String(message).trim()) }
  ffmpeg.on('log', onLog)
  try {
    const code = await ffmpeg.exec(args)
    return { code, logs }
  } finally {
    ffmpeg.off('log', onLog)
  }
}

async function probePath(ffmpeg, inputPath) {
  const { logs } = await execLogged(ffmpeg, [...DEMUX, '-i', inputPath])
  return parseStreams(logs)
}

function buildOutputArgs(vf, strategy, outName) {
  const videoOnly = Boolean(strategy.videoOnly)
  const videoCopy = Boolean(strategy.videoCopy)
  let maps = strategy.maps || (videoOnly ? ['-map', '0:v:0'] : strategy.useMaps ? ['-map', '0:v:0', '-map', '0:a:0?'] : [])
  let audio
  if (videoOnly) audio = ['-an']
  else if (strategy.audioCopy) audio = ['-c:a', 'copy']
  else audio = ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100']
  const mux = ['-movflags', '+faststart', '-y', outName]
  if (videoCopy) return [...maps, '-c:v', 'copy', ...audio, ...mux]
  const vfChain = vf.includes('format=') ? vf : 'format=yuv420p,' + vf
  return [...maps, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-vf', vfChain, ...audio, ...mux]
}

const STRATEGIES = [
  { label: 'screen-rec-vcopy-acopy', maps: ['-map','0:v:0','-map','0:a:0?'], videoCopy: true, audioCopy: true },
  { label: 'screen-rec-vcopy-aac', maps: ['-map','0:v:0','-map','0:a:0?'], videoCopy: true },
  { label: 'screen-rec-a0', maps: ['-map','0:v:0','-map','0:a:0?'] },
  { label: 'screen-rec-mapped', useMaps: true },
  { label: 'screen-rec-video-only', videoOnly: true, useMaps: true },
]

const ffmpeg = new FFmpeg()
ffmpeg.on('log', ({ message }) => { if (message && /error|warning|Stream #/i.test(message)) log(message.trim()) })

log('load wasm...')
await ffmpeg.load({
  classWorkerURL: '/vendor/ffmpeg/worker.js',
  coreURL: await toBlobURL('/vendor/core/ffmpeg-core.js', 'text/javascript'),
  wasmURL: await toBlobURL('/vendor/core/ffmpeg-core.wasm', 'application/wasm'),
})

const resp = await fetch('/fixture.mov')
const blob = await resp.blob()
const file = new File([blob], ${JSON.stringify(fixtureName)}, { type: 'video/quicktime' })
log('fixture bytes=' + file.size)

const mount = '/lwfs_in'
const inName = ${JSON.stringify(fixtureName)}
await ffmpeg.createDir(mount)
await ffmpeg.mount('WORKERFS', { blobs: [{ name: inName, data: file }] }, mount)
const inputPath = mount + '/' + inName

log('--- INPUT PROBE (WORKERFS) ---')
const inStreams = await probePath(ffmpeg, inputPath)
log('streams: ' + (inStreams.length ? inStreams.map(s => s.index + ':' + s.codec).join(',') : 'none'))

for (const strategy of STRATEGIES) {
  const outName = 'out_' + strategy.label + '.mp4'
  try { await ffmpeg.deleteFile(outName) } catch {}
  log('--- TRY ' + strategy.label + ' ---')
  const args = [
    ...DEMUX,
    '-ignore_editlist', '1',
    '-i', inputPath,
    '-t', String(${durSec}),
    ...buildOutputArgs(VF, strategy, outName),
  ]
  const t0 = performance.now()
  const { code, logs } = await execLogged(ffmpeg, args)
  const elapsed = Math.round(performance.now() - t0)
  if (code !== 0) {
    log('FAIL exit ' + code + ' (' + elapsed + 'ms) tail: ' + logs.slice(-3).join(' | '))
    continue
  }
  const data = await ffmpeg.readFile(outName)
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  const outStreams = await probePath(ffmpeg, outName)
  const hasVideoProbe = outStreams.some(s => s.kind === 'video')
  const hasAudioProbe = outStreams.some(s => s.kind === 'audio')
  log('OK ' + elapsed + 'ms bytes=' + u8.byteLength + ' probeV=' + hasVideoProbe + ' probeA=' + hasAudioProbe + ' atomV=' + mp4BytesLikelyHasVideo(u8) + ' atomA=' + mp4BytesLikelyHasAudio(u8))
}

window.__done = true
</script></body></html>`

const server = createServer((req, res) => {
  const urlPath = String(req.url || '/').split('?')[0]
  if (urlPath === '/fixture.mov') {
    res.writeHead(200, { 'Content-Type': 'video/quicktime' })
    res.end(fixtureBytes)
    return
  }
  if (tryServeVendor(urlPath, res)) return
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
})

await new Promise((r) => server.listen(0, r))
const port = server.address().port
console.log('Fixture:', fixturePath, `(${(fixtureBytes.length / (1024 * 1024)).toFixed(2)} MB)`)
console.log('Serving on', port)

let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (m) => console.log('[page]', m.text()))
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://127.0.0.1:${port}`, { timeout: 900000 })
  await page.waitForFunction(() => window.__done, { timeout: 900000 })
  console.log('\n=== RESULT ===\n')
  console.log(await page.locator('#out').innerText())
} catch (err) {
  if (browser) {
    for (const p of browser.contexts().flatMap((c) => c.pages())) {
      try {
        console.log('\n=== PARTIAL ===\n')
        console.log(await p.locator('#out').innerText())
      } catch {
        // ignore
      }
    }
  }
  throw err
} finally {
  server.close()
  if (browser) await browser.close()
}
