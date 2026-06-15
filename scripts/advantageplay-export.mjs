/**
 * Bulk-export advantageplay.club slot guides (local Playwright HTML mirror).
 *
 * Discovery: A–Z list at /advantage-play-slot-list/ (~292 `-advantage-play/` URLs).
 * Premium strategy/data sections need a member session — use --login once.
 *
 * Output: advantageplay-export/pages/<slug>/index.html + images/ + meta.json
 *
 * Usage:
 *   npm run advantageplay:export
 *   npm run advantageplay:export -- --discover-only
 *   npm run advantageplay:export -- --export-only
 *   npm run advantageplay:export -- --login
 *   npm run advantageplay:export:login
 *   npm run advantageplay:export -- --limit=5
 *   npm run advantageplay:export -- --headed
 *   npm run advantageplay:export -- --delay=6000
 *   npm run advantageplay:export -- --force
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  advantagePlayMirrorCss,
  extractAdvantagePlayMirrorHtml,
} from './lib/advantageplayMirrorHtml.mjs'
import { slotNameSlug } from './lib/exportSlotSlug.mjs'
import {
  buildMirrorDocument,
  guessImageExtension,
  rewriteImageSources,
} from './lib/machineproMirrorHtml.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const BASE = 'https://advantageplay.club'
const LIST_URL = `${BASE}/advantage-play-slot-list/`
const LOGIN_URL =
  `${BASE}/login/?redirect_to=` +
  encodeURIComponent(`${BASE}/membership-account/`)
const AUTH_PATH = path.join(REPO_ROOT, '.advantageplay-auth.json')
const OUT_DIR = path.join(REPO_ROOT, 'advantageplay-export')
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
  }
  for (const arg of argv) {
    if (arg === '--discover-only') opts.discoverOnly = true
    else if (arg === '--export-only') opts.exportOnly = true
    else if (arg === '--force') opts.force = true
    else if (arg === '--login') opts.forceLogin = true
    else if (arg === '--login-only') {
      opts.forceLogin = true
      opts.loginOnly = true
    }
    else if (arg === '--headed') opts.headed = true
    else if (arg === '--no-jitter') opts.jitter = false
    else if (arg.startsWith('--login-url=')) opts.loginUrl = arg.slice('--login-url='.length).trim()
    else if (arg.startsWith('--delay=')) opts.delayMs = Math.max(1000, Number(arg.slice(8)) || 6000)
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(1, Number(arg.slice(8)) || 1)
  }
  return opts
}

function slugify(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'slot'
}

function normalizeSlotUrl(href) {
  try {
    const u = new URL(href, BASE)
    if (!u.hostname.includes('advantageplay.club')) return null
    u.hash = ''
    u.search = ''
    if (!u.pathname.endsWith('/')) u.pathname += '/'
    if (!/-advantage-play\/$/i.test(u.pathname)) return null
    return u.toString()
  } catch {
    return null
  }
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
  if (!jitter) return `${baseMs}ms between slots (fixed)`
  const { min, max } = jitterRange(baseMs)
  return `${baseMs}ms base between slots (random ${min}–${max}ms)`
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
    console.log('\nOpening AdvantagePlay.club login in Chrome — sign in there.')
    console.log('  (If you do not see a window, check the taskbar or Alt+Tab.)')
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.bringToFront()
    console.log(`  Login page: ${page.url()}`)
    await waitForEnter('\nWhen you are logged in, press Enter here… ')
    await context.storageState({ path: AUTH_PATH })
    console.log(`Session saved → ${path.relative(REPO_ROOT, AUTH_PATH)}`)
    await page.close()
    await context.close()
    return { browser, context: await browser.newContext({ storageState: AUTH_PATH }), loginSaved: true }
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
    console.log(`  Discover slot list: ${LIST_URL}`)
    await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 120_000 })
    await scrollUntilStable(page)

    const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href).filter(Boolean))
    for (const href of hrefs) {
      const normalized = normalizeSlotUrl(href)
      if (normalized) found.add(normalized)
    }

    console.log(`    ${found.size} slot guide URLs`)
  } finally {
    await page.close()
  }

  if (found.size < 50) {
    console.warn(`\n  Only ${found.size} slots discovered — check list page layout.`)
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

    if (/impactradius|7eer\.net|doubleclick|affiliate|logo2\.webp/i.test(imageUrl)) continue

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

async function exportSlotMirror(context, url, { delayMs, jitter }) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
    await scrollUntilStable(page)
    await sleep(800)

    const extracted = await page.evaluate(extractAdvantagePlayMirrorHtml)
    const title =
      extracted.title?.replace(/\s*Advantage Play Slot Status.*$/i, '').trim() ||
      (await page.title()).replace(/\s*Advantage Play Slot Status.*$/i, '').trim() ||
      'Untitled'

    if (extracted.textLen < 200) {
      throw new Error('Page looks empty — try --login if this guide is member-only')
    }

    const slug = slotNameSlug(title, url)
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
      'AdvantagePlay.club',
      advantagePlayMirrorCss(),
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
          premiumGated: extracted.premiumGated,
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
      premiumGated: extracted.premiumGated,
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

  console.log('AdvantagePlay.club export (HTML mirror)')
  console.log(`  browser: ${opts.headed || opts.forceLogin ? 'headed Chrome' : 'headless Chrome'}`)
  console.log(`  delay: ${formatDelayLabel(opts.delayMs, opts.jitter)}`)
  if (opts.limit !== Infinity) console.log(`  limit: ${opts.limit} slots`)
  if (!fs.existsSync(AUTH_PATH) && !opts.forceLogin) {
    console.log('  auth: none (premium strategy sections will show paywall stubs — use --login once)')
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
    console.log('\nLogin-only — done. Run export with: npm run advantageplay:export -- --export-only')
    return
  }

  try {
    let links = []
    if (opts.exportOnly && fs.existsSync(LINKS_PATH)) {
      links = JSON.parse(await fsp.readFile(LINKS_PATH, 'utf8'))
      console.log(`Loaded ${links.length} links from discovered-links.json`)
    } else {
      console.log('\nDiscovering slot guide URLs from A–Z list…')
      links = await discoverLinks(context)
      await fsp.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf8')
      console.log(`Found ${links.length} slot URLs → ${path.relative(REPO_ROOT, LINKS_PATH)}`)
    }

    if (opts.discoverOnly) {
      console.log('\nDiscover-only — done.')
      return
    }

    const manifest = await loadManifest()
    let exported = 0
    let gatedCount = 0

    console.log('\nExporting slot mirrors…')
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
        const row = await exportSlotMirror(context, url, {
          delayMs: opts.delayMs,
          jitter: opts.jitter,
        })
        manifest.exported = manifest.exported.filter((e) => e.url !== url || e.format !== 'html')
        manifest.exported.push(row)
        exported += 1
        if (row.premiumGated) gatedCount += 1
        const gateNote = row.premiumGated ? ', premium gated' : ''
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
      console.log(`  Premium gated: ${gatedCount} (run --login then --force to refresh with member content)`)
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
