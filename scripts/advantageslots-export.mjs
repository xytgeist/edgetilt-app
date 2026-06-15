/**
 * Bulk-export advantageslots.com posts (local Playwright HTML mirror).
 *
 * Public WordPress site — no login required. Optional --login for saved session.
 * Output: advantageslots-export/pages/<slug>/index.html + images/ + meta.json
 *
 * Usage:
 *   npm run advantageslots:export
 *   npm run advantageslots:export -- --discover-only
 *   npm run advantageslots:export -- --limit=5
 *   npm run advantageslots:export -- --headed
 *   npm run advantageslots:export -- --login
 *   npm run advantageslots:export -- --delay=6000
 *   npm run advantageslots:export -- --also-fyi
 *   npm run advantageslots:export -- --force          (re-export even if manifest + files exist)
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  advantageSlotsMirrorCss,
  extractAdvantageSlotsMirrorHtml,
} from './lib/advantageslotsMirrorHtml.mjs'
import { slotNameSlug } from './lib/exportSlotSlug.mjs'
import {
  buildMirrorDocument,
  guessImageExtension,
  rewriteImageSources,
} from './lib/machineproMirrorHtml.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const BASE = 'https://www.advantageslots.com'
const LOGIN_URL = `${BASE}/login`
const AUTH_PATH = path.join(REPO_ROOT, '.advantageslots-auth.json')
const OUT_DIR = path.join(REPO_ROOT, 'advantageslots-export')
const HTML_DIR = path.join(OUT_DIR, 'pages')
const LINKS_PATH = path.join(OUT_DIR, 'discovered-links.json')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')

const CATEGORY_SEEDS = [`${BASE}/category/advantage-machines/`]
const FYI_SEED = `${BASE}/category/fyi/`

const SKIP_SLUGS = new Set([
  'category',
  'tag',
  'author',
  'login',
  'wp-content',
  'feed',
  'comments',
  'page',
  'about-me',
])

function parseArgs(argv) {
  const opts = {
    discoverOnly: false,
    exportOnly: false,
    force: false,
    forceLogin: false,
    alsoFyi: false,
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
    else if (arg === '--also-fyi') opts.alsoFyi = true
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
    .slice(0, 120) || 'post'
}

function normalizeUrl(href) {
  try {
    const u = new URL(href, BASE)
    if (!u.hostname.includes('advantageslots.com')) return null
    u.hash = ''
    u.search = ''
    if (!u.pathname.endsWith('/')) u.pathname += '/'
    return u.toString()
  } catch {
    return null
  }
}

function isPostUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length !== 1) return false
    return !SKIP_SLUGS.has(segs[0])
  } catch {
    return false
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
  if (!jitter) return `${baseMs}ms between posts (fixed)`
  const { min, max } = jitterRange(baseMs)
  return `${baseMs}ms base between posts (random ${min}–${max}ms)`
}

async function ensureOutDir() {
  await fsp.mkdir(HTML_DIR, { recursive: true })
}

async function launchContext({ forceLogin, loginUrl, headed }) {
  const browser = await chromium.launch({ headless: !headed, channel: 'chrome' })

  if (forceLogin) {
    const context = await browser.newContext()
    const page = await context.newPage()
    console.log('\nOpening Advantage Slots login — sign in in the browser window.')
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    console.log(`  Login page: ${page.url()}`)
    await waitForEnter('\nWhen you are logged in, press Enter here… ')
    await context.storageState({ path: AUTH_PATH })
    console.log(`Session saved → ${path.relative(REPO_ROOT, AUTH_PATH)}`)
    await page.close()
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

async function collectPostsFromCategory(page, categoryUrl, found) {
  console.log(`  Discover category: ${categoryUrl}`)
  let url = categoryUrl
  let pageNum = 0
  let added = 0

  while (url && pageNum < 60) {
    pageNum += 1
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await sleep(800)

    const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href).filter(Boolean))
    for (const href of hrefs) {
      const normalized = normalizeUrl(href)
      if (normalized && isPostUrl(normalized) && !found.has(normalized)) {
        found.add(normalized)
        added += 1
      }
    }

    const nextUrl = await page.evaluate(() => {
      const next =
        document.querySelector('.nav-next a')?.href ||
        document.querySelector('a.next')?.href ||
        document.querySelector('.pagination a.next')?.href
      return next || null
    })
    url = nextUrl
  }

  console.log(`    +${added} posts (total ${found.size}, ${pageNum} listing pages)`)
}

async function discoverLinks(context, { alsoFyi }) {
  const found = new Set()
  const page = await context.newPage()
  const seeds = [...CATEGORY_SEEDS]
  if (alsoFyi) seeds.push(FYI_SEED)

  try {
    for (const seed of seeds) {
      await collectPostsFromCategory(page, seed, found)
    }
  } finally {
    await page.close()
  }

  if (found.size < 10) {
    console.warn(`\n  Only ${found.size} posts discovered — check category URLs or site layout.`)
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

    if (/impactradius|7eer\.net|doubleclick|affiliate/i.test(imageUrl)) continue

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
      // WordPress Photon may appear with different query strings in HTML vs resolved href
      urlToLocal.set(raw, localRel)
    } catch (err) {
      console.warn(`    image skip: ${imageUrl} (${err instanceof Error ? err.message : err})`)
      index -= 1
    }
  }

  return urlToLocal
}

async function exportPostMirror(context, url, { delayMs, jitter }) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
    await scrollUntilStable(page)
    await sleep(600)

    const extracted = await page.evaluate(extractAdvantageSlotsMirrorHtml)
    const title =
      extracted.title?.replace(/\s*\|\s*Advantage Slots.*$/i, '').trim() ||
      (await page.title()).replace(/\s*\|\s*Advantage Slots.*$/i, '').trim() ||
      'Untitled'

    if (/password protected|members only|log in to view/i.test(extracted.html) && extracted.textLen < 400) {
      throw new Error('Post looks gated — try --login if this site has member-only posts')
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
      'Advantage Slots',
      advantageSlotsMirrorCss(),
    )

    await fsp.mkdir(pageDir, { recursive: true })
    const htmlPath = path.join(pageDir, 'index.html')
    await fsp.writeFile(htmlPath, html, 'utf8')

    const commentChars = await page.evaluate(() => {
      const el = document.querySelector('#comments, .comments-area')
      return el ? el.innerText.replace(/\s+/g, ' ').trim().length : 0
    })

    await fsp.writeFile(
      path.join(pageDir, 'meta.json'),
      JSON.stringify(
        {
          title,
          url,
          slug,
          exported: exportedAt,
          imageCount: urlToLocal.size,
          commentChars,
          textChars: extracted.textLen,
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
      commentChars,
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

  console.log('Advantage Slots export (HTML mirror, public site)')
  console.log(`  browser: ${opts.headed || opts.forceLogin ? 'headed Chrome' : 'headless Chrome'}`)
  console.log(`  delay: ${formatDelayLabel(opts.delayMs, opts.jitter)}`)
  if (opts.limit !== Infinity) console.log(`  limit: ${opts.limit} posts`)
  if (opts.alsoFyi) console.log('  including: category/fyi')

  const { browser, context } = await launchContext({
    forceLogin: opts.forceLogin,
    loginUrl: opts.loginUrl,
    headed: opts.headed || opts.forceLogin,
  })

  try {
    let links = []
    if (opts.exportOnly && fs.existsSync(LINKS_PATH)) {
      links = JSON.parse(await fsp.readFile(LINKS_PATH, 'utf8'))
      console.log(`Loaded ${links.length} links from discovered-links.json`)
    } else {
      console.log('\nDiscovering post URLs from category listings…')
      links = await discoverLinks(context, { alsoFyi: opts.alsoFyi })
      await fsp.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf8')
      console.log(`Found ${links.length} post URLs → ${path.relative(REPO_ROOT, LINKS_PATH)}`)
    }

    if (opts.discoverOnly) {
      console.log('\nDiscover-only — done.')
      return
    }

    const manifest = await loadManifest()
    let exported = 0

    console.log('\nExporting post mirrors…')
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
        const row = await exportPostMirror(context, url, {
          delayMs: opts.delayMs,
          jitter: opts.jitter,
        })
        manifest.exported = manifest.exported.filter((e) => e.url !== url || e.format !== 'html')
        manifest.exported.push(row)
        exported += 1
        console.log(
          `OK (${row.chars} chars, ${row.imageCount} imgs, ${row.commentChars} comment chars) → ${row.file}`,
        )
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