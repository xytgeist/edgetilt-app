/**
 * Browser wasm probe for IMG_1425.MOV (WORKERFS for large files)
 * Usage: node scripts/lounge-video-wasm-browser-probe.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const fixturePath = join(root, 'IMG_1425.MOV')
if (!existsSync(fixturePath)) {
  console.error('Missing fixture:', fixturePath)
  process.exit(1)
}

const fixtureBytes = readFileSync(fixturePath)

const html = `<!doctype html><html><body><pre id="out">loading...</pre><script type="module">
import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm'
import { fetchFile, toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm'
const out = document.getElementById('out')
const log = (s) => { out.textContent += s + '\\n'; console.log(s) }
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
const ffmpeg = new FFmpeg()
ffmpeg.on('log', ({ message }) => { if (message) log(message.trim()) })
log('load wasm...')
await ffmpeg.load({
  coreURL: await toBlobURL(CORE + '/ffmpeg-core.js', 'text/javascript'),
  wasmURL: await toBlobURL(CORE + '/ffmpeg-core.wasm', 'application/wasm'),
})
log('fetch fixture...')
const resp = await fetch('/fixture.mov')
const blob = await resp.blob()
const file = new File([blob], 'in.mov', { type: 'video/quicktime' })
log('mount WORKERFS ' + file.size)
const mount = '/lwfs_in'
await ffmpeg.createDir(mount)
await ffmpeg.mount('WORKERFS', { blobs: [{ name: 'in.mov', data: file }] }, mount)
const inputPath = mount + '/in.mov'
log('--- PROBE ---')
await ffmpeg.exec(['-hide_banner','-loglevel','warning','-analyzeduration','100M','-probesize','100M','-ignore_editlist','1','-i',inputPath])
log('--- TRY exclude-apac ---')
await ffmpeg.exec(['-hide_banner','-y','-ignore_editlist','1','-i',inputPath,'-t','5','-map','0:v:0','-map','0:a','-map','-0:1','-c:v','libx264','-preset','ultrafast','-crf','30','-vf','scale=720:-2','-c:a','aac','out.mp4'])
const data = await ffmpeg.readFile('out.mp4')
log('OUT BYTES ' + data.length)
log('--- OUT PROBE ---')
await ffmpeg.exec(['-hide_banner','-i','out.mp4'])
window.__done = true
</script></body></html>`

const server = createServer((req, res) => {
  if (req.url === '/fixture.mov') {
    res.writeHead(200, { 'Content-Type': 'video/quicktime' })
    res.end(fixtureBytes)
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
})

await new Promise((r) => server.listen(0, r))
const port = server.address().port
console.log('Serving on', port)

let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (m) => console.log('[page]', m.text()))
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://127.0.0.1:${port}`, { timeout: 600000 })
  await page.waitForFunction(() => window.__done, { timeout: 600000 })
  console.log('\n=== RESULT ===\n')
  console.log(await page.locator('#out').innerText())
} catch (err) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages())
    for (const p of pages) {
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
