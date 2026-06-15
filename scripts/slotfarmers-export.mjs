/**
 * Bulk-export slotfarmers.club strategy guides (local Playwright HTML mirror).
 *
 * Discovery: /advantage-play-slots listing → /advantage-play/{slug} guides.
 * Subscriber "When to Play" sections need login — use --login once.
 *
 * Output: slotfarmers-export/pages/<slug>/index.html + images/ + meta.json
 *
 * Usage:
 *   npm run slotfarmers:export
 *   npm run slotfarmers:export:discover
 *   npm run slotfarmers:export:login
 *   npm run slotfarmers:export -- --export-only
 *   npm run slotfarmers:export -- --limit=5
 *   npm run slotfarmers:export -- --force
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { slotFarmersSlotNameSlug } from './lib/exportSlotSlug.mjs'
import {
  buildMirrorDocument,
  guessImageExtension,
  rewriteImageSources,
} from './lib/machineproMirrorHtml.mjs'
import {
  extractSlotFarmersMirrorHtml,
  slotFarmersMirrorCss,
} from './lib/slotfarmersMirrorHtml.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const BASE = 'https://slotfarmers.club'
const LIST_URL = `${BASE}/advantage-play-slots`
const LOGIN_URL = `${BASE}/Account/Login`
const AUTH_PATH = path.join(REPO_ROOT, '.slotfarmers-auth.json')
const OUT_DIR = path.join(REPO_ROOT, 'slotfarmers-export')
const HTML_DIR = path.join(OUT_DIR, 'pages')
const LINKS_PATH = path.join(OUT_DIR, 'discovered-links.json')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')

function parseArgs(argv) {
  const opts = {
    discoverOnly: false,
    exportOnly: false,
    force: false,
    forceLogin: false,
    loginOnly: false,
    headed: false,
    loginUrl: LOGIN_URL,
    delayMs: 6000,
    jitter: true,
    limit: Infinity,
    urlFilter: '',
  }
  for (const arg of argv) {
    if (arg === '--discover-only') opts.discoverOnly = true
    else if (arg === '--export-only') opts.exportOnly = true
    else if (arg === '--force') opts.force = true
    else if (arg === '--login') opts.forceLogin = true
    else if (arg === '--login-only') {
      opts.forceLogin = true
      opts.loginOnly = true
    } else if (arg === '--headed') opts.headed = true
    else if (arg === '--no-jitter') opts.jitter = false
    else if (arg.startsWith('--login-url=')) opts.loginUrl = arg.slice('--login-url='.length).trim()
    else if (arg.startsWith('--delay=')) opts.delayMs = Math.max(1000, Number(arg.slice(8)) || 6000)
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(1, Number(arg.slice(8)) || 1)
    else if (arg.startsWith('--url=')) opts.urlFilter = arg.slice('--url='.length).trim()
  }
  return opts
}

function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** @returns {{ min: number, max: number }} */
function jitterRange(baseMs) {
  const min = Math.max(1000, Math.round(baseMs * 0.75))
  const max = Math.max(min + 1, Math.round(baseMs * 1.5))
  return { min, max }
}

function betweenPageDelayMs(baseMs, jitter) {
  if (!jitter) return baseMs
  const { min, max } = jitterRange(baseMs)
  return min + Math.floor(Math.random() * (max - min + 1))
}

function formatDelayLabel(baseMs, jitter) {
  if (!jitter) return `${baseMs}ms between guides (fixed)`
  const { min, max } = jitterRange(baseMs)
  return `${baseMs}ms base between guides (random ${min}–${max}ms)`
}

function normalizeGuideUrl(href) {
  try {
    const u = new URL(href, BASE)
    if (!u.hostname.includes('slotfarmers.club')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length !== 2 || parts[0] !== 'advantage-play') return null
    u.hash = ''
    u.search = ''
    if (!u.pathname.endsWith('/')) u.pathname += '/'
    return u.toString()
  } catch {
    return null
  }
}

async function ensureOutDir() {
  await fsp.mkdir(HTML_DIR, { recursive: true })
}

async function launchContext({ forceLogin, loginUrl, headed }) {
  const showBrowser = headed || forceLogin
  const browser = await chromium.launch({ headless: !showBrowser, channel: 'chrome' })

  if (forceLogin) {
    const context = await browser.newContext()
    const page = await context.newPage()
    console.log('\nOpening SlotFarmers.club login in Chrome — sign in there.')
    console.log('  (If you do not see a window, check the taskbar or Alt+Tab.)')
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.bringToFront()
    console.log(`  Login page: ${page.url()}`)
    await waitForEnter('\nWhen you are logged in, press Enter here… ')
    await context.storageState({ path: AUTH_PATH })
    console.log(`Session saved → ${path.relative(REPO_ROOT, AUTH_PATH)}`)
    await page.close()
    await context.close()
    return { browser, context: await browser.newContext({ storageState: AUTH_PATH }) }
  }

  const context = fs.existsSync(AUTH_PATH)
    ? await browser.newContext({ storageState: AUTH_PATH })
    : await browser.newContext()

  return { browser, context }
}

async function scrollUntilStable(page, { maxRounds = 16, pauseMs = 400 } = {}) {
  let lastHeight = 0
  for (let i = 0; i < maxRounds; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(pauseMs)
    const height = await page.evaluate(() => document.body.scrollHeight)
    if (height === lastHeight) return
    lastHeight = height
  }
}

async function discoverLinks(context) {
  const page = await context.newPage()
  const found = new Set()

  try {
    console.log(`  Discover guides: ${LIST_URL}`)
    await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 120_000 })
    await scrollUntilStable(page)

    const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href).filter(Boolean))
    for (const href of hrefs) {
      const normalized = normalizeGuideUrl(href)
      if (normalized) found.add(normalized)
    }

    console.log(`    ${found.size} strategy guide URLs`)
  } finally {
    await page.close()
  }

  if (found.size < 20) {
    console.warn(`\n  Only ${found.size} guides discovered — check list page or login.`)
  }

  return [...found].sort()
}

async function downloadImages(request, imageUrls, imagesDir) {
  await fsp.mkdir(imagesDir, { recursive: true })
  /** @type {Map<string, string>} */
  const urlToLocal = new Map()
  let index = 0

  for (const raw of imageUrls) {
    let imageUrl
    try {
      const src = String(raw ?? '').trim()
      if (!src || src.startsWith('data:')) continue
      imageUrl = src.startsWith('//') ? new URL(`https:${src}`).href : new URL(src, BASE).href
    } catch {
      continue
    }

    if (/cookieyes|revisit\.svg|close\.svg|slotfarmers_icon/i.test(imageUrl)) continue

    index += 1
    let ext = ''
    try {
      ext = path.extname(new URL(imageUrl).pathname.split('?')[0])
    } catch {
      ext = ''
    }
    if (!ext || ext.length > 5) {
      try {
        ext = await guessImageExtension(request, imageUrl)
      } catch {
        ext = '.jpg'
      }
    }
    const filename = `${String(index).padStart(2, '0')}${ext}`
    const localRel = `images/${filename}`
    const localAbs = path.join(imagesDir, filename)

    try {
      const res = await request.get(imageUrl, { timeout: 60_000 })
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`)
      await fsp.writeFile(localAbs, Buffer.from(await res.body()))
      urlToLocal.set(imageUrl, localRel)
      urlToLocal.set(raw, localRel)
    } catch (err) {
      console.warn(`    image skip: ${imageUrl} (${err instanceof Error ? err.message : err})`)
      index -= 1
    }
  }

  return urlToLocal
}

async function extractGuidePage(page, url, { attempt = 1 } = {}) {
  if (attempt > 1) {
    await page.reload({ waitUntil: 'networkidle', timeout: 120_000 })
  } else {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  }
  await scrollUntilStable(page)
  await sleep(attempt > 1 ? 1500 : 800)

  const extracted = await page.evaluate(extractSlotFarmersMirrorHtml)
  const title =
    extracted.title?.replace(/\s*Guide\s*$/i, '').trim() ||
    (await page.title()).replace(/\s*Advantage Play Strategy.*$/i, '').trim() ||
    'Untitled'

  if (extracted.pageError) {
    throw new Error('Blazor error page — site returned "Something went wrong" (transient)')
  }
  if (extracted.textLen < 500) {
    throw new Error('Page looks empty or too short — try --login if this guide is subscriber-only')
  }
  if (title === 'Untitled' || /something went wrong/i.test(title)) {
    throw new Error(`Bad page title: "${title}"`)
  }

  return { ...extracted, title }
}

async function exportGuideMirror(context, url, { delayMs, jitter }) {
  const page = await context.newPage()
  try {
    let extracted
    let title
    let lastErr
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await extractGuidePage(page, url, { attempt })
        extracted = result
        title = result.title
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        if (attempt < 3) {
          console.warn(`    retry ${attempt}/2: ${err instanceof Error ? err.message : err}`)
          await sleep(2000)
        }
      }
    }
    if (lastErr) throw lastErr

    const slug = slotFarmersSlotNameSlug(title, url)
    const pageDir = path.join(HTML_DIR, slug)
    const imagesDir = path.join(pageDir, 'images')

    const urlToLocal = await downloadImages(context.request, extracted.imageUrls, imagesDir)
    const bodyHtml = rewriteImageSources(extracted.html, urlToLocal)
    const exportedAt = new Date().toISOString()
    const html = buildMirrorDocument(
      title,
      bodyHtml,
      url,
      exportedAt,
      'SlotFarmers.club',
      slotFarmersMirrorCss(),
    )

    await fsp.mkdir(pageDir, { recursive: true })
    const htmlPath = path.join(pageDir, 'index.html')
    await fsp.writeFile(htmlPath, html, 'utf8')

    await fsp.writeFile(
      path.join(pageDir, 'meta.json'),
      JSON.stringify(
        {
          title,
          url,
          slug,
          exported: exportedAt,
          imageCount: urlToLocal.size,
          textChars: extracted.textLen,
          subscriberGated: extracted.subscriberGated,
        },
        null,
        2,
      ),
      'utf8',
    )

    return {
      ok: true,
      format: 'html',
      title,
      url,
      slug,
      file: path.relative(REPO_ROOT, htmlPath),
      dir: path.relative(REPO_ROOT, pageDir),
      chars: extracted.textLen,
      imageCount: urlToLocal.size,
      subscriberGated: extracted.subscriberGated,
    }
  } finally {
    await page.close()
    await sleep(betweenPageDelayMs(delayMs, jitter))
  }
}

async function loadManifest() {
  try {
    return JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    return { exported: [], failed: [] }
  }
}

/** @param {{ file?: string } | undefined} entry */
function manifestEntryOnDisk(entry) {
  if (!entry?.file) return false
  return fs.existsSync(path.join(REPO_ROOT, entry.file))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  await ensureOutDir()

  console.log('SlotFarmers.club export (HTML mirror)')
  console.log(`  browser: ${opts.headed || opts.forceLogin ? 'headed Chrome' : 'headless Chrome'}`)
  console.log(`  delay: ${formatDelayLabel(opts.delayMs, opts.jitter)}`)
  if (opts.limit !== Infinity) console.log(`  limit: ${opts.limit} guides`)
  if (!fs.existsSync(AUTH_PATH) && !opts.forceLogin) {
    console.log('  auth: none ("When to Play" sections need login — use --login once)')
  } else if (fs.existsSync(AUTH_PATH)) {
    console.log(`  auth: ${path.relative(REPO_ROOT, AUTH_PATH)}`)
  }

  const { browser, context } = await launchContext({
    forceLogin: opts.forceLogin,
    loginUrl: opts.loginUrl,
    headed: opts.headed || opts.forceLogin,
  })

  if (opts.loginOnly) {
    await context.close()
    await browser.close()
    console.log('\nLogin-only — done. Run export with: npm run slotfarmers:export -- --export-only')
    return
  }

  try {
    let links = []
    if (opts.exportOnly && fs.existsSync(LINKS_PATH)) {
      links = JSON.parse(await fsp.readFile(LINKS_PATH, 'utf8'))
      console.log(`Loaded ${links.length} links from discovered-links.json`)
    } else {
      console.log('\nDiscovering strategy guide URLs…')
      links = await discoverLinks(context)
      await fsp.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf8')
      console.log(`Found ${links.length} guide URLs → ${path.relative(REPO_ROOT, LINKS_PATH)}`)
    }

    if (opts.discoverOnly) {
      console.log('\nDiscover-only — done.')
      return
    }

    const manifest = await loadManifest()
    let exported = 0
    let gatedCount = 0

    if (opts.urlFilter) {
      const needle = opts.urlFilter.replace(/\/$/, '')
      links = links.filter((u) => u.includes(needle))
      console.log(`  url filter: ${opts.urlFilter} (${links.length} match)`)
    }

    console.log('\nExporting guide mirrors…')
    for (const url of links) {
      if (exported >= opts.limit) break

      if (!opts.force) {
        const existing = manifest.exported.find((e) => e.format === 'html' && e.url === url)
        if (existing && manifestEntryOnDisk(existing)) {
          console.log(`  skip (manifest): ${url}`)
          continue
        }
      }

      process.stdout.write(`  ${url} … `)
      try {
        const row = await exportGuideMirror(context, url, {
          delayMs: opts.delayMs,
          jitter: opts.jitter,
        })
        manifest.exported = manifest.exported.filter((e) => e.url !== url || e.format !== 'html')
        manifest.exported.push(row)
        exported += 1
        if (row.subscriberGated) gatedCount += 1
        const gateNote = row.subscriberGated ? ', subscriber gated' : ''
        console.log(`OK (${row.chars} chars, ${row.imageCount} imgs${gateNote}) → ${row.file}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        manifest.failed = manifest.failed.filter((e) => e.url !== url)
        manifest.failed.push({ url, error: msg, at: new Date().toISOString(), format: 'html' })
        console.log(`FAIL — ${msg}`)
      }

      await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    }

    console.log(`\nDone. Exported ${exported} this run.`)
    console.log(`  Output: ${path.relative(REPO_ROOT, OUT_DIR)}/`)
    console.log(`  Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`)
    if (gatedCount) {
      console.log(`  Subscriber gated: ${gatedCount} (run --login then --force to refresh with member content)`)
    }
    if (manifest.failed?.length) {
      console.log(`  Failed: ${manifest.failed.length} (see manifest.json)`)
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
