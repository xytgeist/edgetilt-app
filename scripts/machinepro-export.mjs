/**
 * Bulk-export Machine Pro strategy guide lessons (local Playwright crawl).
 *
 * You log in once in real Chrome; session is saved to .machinepro-auth.json (gitignored).
 * Output (default): machinepro-export/<slug>.md + manifest.json (gitignored).
 * Output (--html):  machinepro-export/pages/<slug>/index.html + images/ + meta.json
 *
 * Canonical link index (log in, then this page lists every strategy guide):
 *   https://www.machinepro.club/p/courses/lifetime-membership/1645978-default-section/5267227-alphabetical-list-of-all-strategy-guides-with-links
 *
 * Usage:
 *   npm run machinepro:export
 *   npm run machinepro:export -- --html              (mirror pages + images + comments)
 *   npm run machinepro:export -- --discover-only
 *   npm run machinepro:export -- --delay=6000          (base pause; jitter on by default)
 *   npm run machinepro:export -- --no-jitter           (fixed delay, no randomness)
 *   npm run machinepro:export -- --limit=10          (smoke test)
 *   npm run machinepro:export -- --login             (force fresh login)
 *   npm run machinepro:export -- --also-crawl-weeks  (optional extra seeds)
 *   npm run machinepro:export -- --html --only-missing-from=machinepro-export-2026-06-08
 *
 * Discover reads the full alphabetical index once (fast). --only-missing-from exports
 * each missing title using the index anchor href from canonicalLinks (no week re-resolve).
 * After discover: node scripts/machinepro-gap-report.mjs
 *
 * First run: npx playwright install chrome
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  buildMirrorDocument,
  extractLessonMirrorHtml,
  guessImageExtension,
  rewriteImageSources,
} from './lib/machineproMirrorHtml.mjs'
import {
  dedupeLessonsById,
  extractGuideLinksFromDom,
  loadCanonicalIndexTitles,
  matchLessonsToCanonical,
  machineProExportSlug,
  scrollAlphabeticalIndex,
  scrollUntilStable,
  countLessonLinksOnPage,
  extractLinksByCanonicalTitles,
  serializeDiscoverPayload,
  parseDiscoverFile,
  machineProLessonIdFromUrl,
  normalizeMachineProUrl,
} from './lib/machineproDiscover.mjs'
import {
  filterLessonsForMissingCanonical,
  missingCanonicalTitlesFromArchive,
} from './lib/machineproExportMatch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const BASE = 'https://www.machinepro.club'
/** Teachable login — /sign_in is 404 on this site. */
const LOGIN_URL = `${BASE}/login`
const AUTH_PATH = path.join(REPO_ROOT, '.machinepro-auth.json')
const OUT_DIR = path.join(REPO_ROOT, 'machinepro-export')
const HTML_DIR = path.join(OUT_DIR, 'pages')
const LINKS_PATH = path.join(OUT_DIR, 'discovered-links.json')
const GAPS_PATH = path.join(OUT_DIR, 'discover-gaps.json')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')

/** Master alphabetical index — all strategy guide links (member-only). */
const GUIDE_INDEX_URL =
  `${BASE}/p/courses/lifetime-membership/1645978-default-section/5267227-alphabetical-list-of-all-strategy-guides-with-links`

/** Optional extras if the index alone misses links. */
const OPTIONAL_SEED_URLS = [`${BASE}/p/courses/machine-pro-club-subscription`]

const CONTENT_SELECTORS = [
  '.lecture-content',
  '[class*="lecture-content"]',
  '[data-test="lecture-content"]',
  '.course-main .main-content',
  '.course-main',
  'article',
  'main',
]

function parseArgs(argv) {
  const opts = {
    discoverOnly: false,
    exportOnly: false,
    forceLogin: false,
    alsoCrawlWeeks: false,
    indexUrl: GUIDE_INDEX_URL,
    loginUrl: LOGIN_URL,
    html: false,
    delayMs: 3500,
    jitter: true,
    limit: Infinity,
    onlyMissingFrom: null,
  }
  for (const arg of argv) {
    if (arg === '--discover-only') opts.discoverOnly = true
    else if (arg === '--html') opts.html = true
    else if (arg === '--export-only') opts.exportOnly = true
    else if (arg === '--login') opts.forceLogin = true
    else if (arg === '--no-jitter') opts.jitter = false
    else if (arg === '--also-crawl-weeks') opts.alsoCrawlWeeks = true
    else if (arg.startsWith('--only-missing-from=')) {
      opts.onlyMissingFrom = arg.slice('--only-missing-from='.length).trim()
    }
    else if (arg.startsWith('--index-url=')) opts.indexUrl = arg.slice('--index-url='.length).trim()
    else if (arg.startsWith('--login-url=')) opts.loginUrl = arg.slice('--login-url='.length).trim()
    else if (arg.startsWith('--delay=')) opts.delayMs = Math.max(1000, Number(arg.slice(8)) || 3500)
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(1, Number(arg.slice(8)) || 1)
  }
  return opts
}

function isGuideIndexUrl(url) {
  return /alphabetical-list-of-all-strategy-guides-with-links/i.test(url || '')
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
  if (!jitter) return `${baseMs}ms between lessons (fixed)`
  const { min, max } = jitterRange(baseMs)
  return `${baseMs}ms base between lessons (random ${min}–${max}ms)`
}

async function ensureOutDir() {
  await fsp.mkdir(OUT_DIR, { recursive: true })
}

async function launchContext({ forceLogin, loginUrl, indexUrl }) {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  })

  const hasAuth = !forceLogin && fs.existsSync(AUTH_PATH)
  const context = hasAuth
    ? await browser.newContext({ storageState: AUTH_PATH })
    : await browser.newContext()

  if (!hasAuth || forceLogin) {
    const page = await context.newPage()
    console.log('\nOpening Machine Pro login — sign in with your member account in the browser window.')
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })

    const landedUrl = page.url()
    if (/\/404\b/i.test(landedUrl) || /page not found/i.test(await page.title())) {
      console.warn(`\n  Login URL looks wrong (${landedUrl}). Try --login-url= or open the index manually:`)
      console.warn(`  ${indexUrl}`)
    } else {
      console.log(`  Login page: ${landedUrl}`)
    }

    console.log('\nAfter login, open the alphabetical guide index (if you are not already there):')
    console.log(`  ${indexUrl}`)
    await waitForEnter('\nWhen that index page loads with the full link list, press Enter here… ')

    const currentUrl = page.url()
    if (!isGuideIndexUrl(currentUrl)) {
      console.log('  Navigating to alphabetical index…')
      await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    }

    await context.storageState({ path: AUTH_PATH })
    console.log(`Session saved → ${path.relative(REPO_ROOT, AUTH_PATH)}`)
    await page.close()
  }

  return { browser, context }
}

async function discoverLinks(context, { indexUrl, alsoCrawlWeeks }) {
  const page = await context.newPage()
  const canonicalTitles = loadCanonicalIndexTitles()

  try {
    console.log(`  Discover index: ${indexUrl}`)
    await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await sleep(3000)
    const afterScroll = await scrollAlphabeticalIndex(page, { minLessonLinks: 280, maxRounds: 140, pauseMs: 400 })
    console.log(`    Lesson link anchors after scroll: ${afterScroll}`)

    let raw = await extractGuideLinksFromDom(page)
    console.log(`    Raw guide anchors on index: ${raw.length}`)

    console.log(`    Matching ${canonicalTitles.length} canonical index titles to links…`)
    const canonicalLinks = await extractLinksByCanonicalTitles(page, canonicalTitles)
    console.log(`    Canonical title → link: ${canonicalLinks.length}/${canonicalTitles.length}`)

    raw = canonicalLinks
      .map((r) => ({ title: r.title, url: r.url }))
      .concat(raw)

    if (alsoCrawlWeeks) {
      for (const seed of OPTIONAL_SEED_URLS) {
        try {
          console.log(`  Discover seed: ${seed}`)
          await page.goto(seed, { waitUntil: 'networkidle', timeout: 120_000 })
          await sleep(1200)
          await scrollUntilStable(page, { maxRounds: 24, pauseMs: 400 })
          raw = raw.concat(await extractGuideLinksFromDom(page))
        } catch (err) {
          console.warn(`  Optional seed failed (${seed}):`, err instanceof Error ? err.message : err)
        }
      }
    }

    const lessons = dedupeLessonsById(raw)
    const match = matchLessonsToCanonical(lessons, canonicalTitles, canonicalLinks)

    console.log(`    Unique lesson IDs: ${lessons.length}`)
    if (canonicalTitles.length) {
      console.log(
        `    Canonical index titles: ${canonicalTitles.length} · linked: ${canonicalLinks.length} · unique lessons: ${lessons.length} · missing link: ${match.missingFromDiscover.length}`,
      )
      if (match.missingFromDiscover.length) {
        console.warn('\n  Missing from discover (first 10):')
        for (const t of match.missingFromDiscover.slice(0, 10)) console.warn(`    - ${t}`)
      }
    }

    if (lessons.length < 100) {
      console.warn(
        `\n  Only ${lessons.length} lessons — index lecture may not have scrolled fully.`,
      )
      console.warn(`  Scroll the main lesson body manually in Chrome, then re-run with --login.`)
      console.warn(`  Index URL:\n  ${indexUrl}\n`)
      try {
        const debugDir = path.join(OUT_DIR, 'discover-debug')
        await fsp.mkdir(debugDir, { recursive: true })
        await page.screenshot({ path: path.join(debugDir, 'index.png'), fullPage: true })
        const html = await page.content()
        await fsp.writeFile(path.join(debugDir, 'index.html'), html, 'utf8')
        console.warn(`  Debug snapshot → ${path.relative(REPO_ROOT, debugDir)}/`)
      } catch {
        // ignore debug write failures
      }
    }

    const payload = serializeDiscoverPayload({
      indexUrl,
      lessons,
      canonicalLinks,
      match,
    })
    await fsp.writeFile(LINKS_PATH, JSON.stringify(payload, null, 2), 'utf8')
    await fsp.writeFile(
      GAPS_PATH,
      JSON.stringify(
        {
          generatedAt: payload.discoveredAt,
          missingFromDiscover: match.missingFromDiscover,
          extraDiscover: match.extraDiscover,
        },
        null,
        2,
      ),
      'utf8',
    )

    return lessons.map((l) => l.url)
  } catch (err) {
    console.warn(`  Index discover failed:`, err instanceof Error ? err.message : err)
    return []
  } finally {
    await page.close()
  }
}

async function extractLessonBody(page) {
  for (const sel of CONTENT_SELECTORS) {
    const loc = page.locator(sel).first()
    if ((await loc.count()) === 0) continue
    const text = (await loc.innerText()).trim()
    if (text.length > 80) return text
  }
  const fallback = page.locator('body')
  return (await fallback.innerText()).trim()
}

async function exportLessonMarkdown(context, url, { delayMs, jitter, preferredTitle }) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await sleep(1200)

    const pageTitle = (await page.title()).replace(/\s*\|\s*Machine Pro.*$/i, '').trim() || 'Untitled'
    const title = preferredTitle?.trim() || pageTitle
    const body = await extractLessonBody(page)

    if (/preview unavailable|sign in|log in to view/i.test(body) && body.length < 400) {
      throw new Error('Lesson looks gated — session may have expired. Re-run with --login')
    }

    const slug = machineProExportSlug(title, url)
    const outPath = path.join(OUT_DIR, `${slug}.md`)
    const md = `# ${title}

Source: ${url}
Exported: ${new Date().toISOString()}

---

${body}
`

    await fsp.writeFile(outPath, md, 'utf8')
    return {
      ok: true,
      format: 'md',
      title,
      url,
      slug,
      file: path.relative(REPO_ROOT, outPath),
      chars: body.length,
    }
  } finally {
    await page.close()
    await sleep(betweenPageDelayMs(delayMs, jitter))
  }
}

async function downloadLessonImages(request, imageUrls, imagesDir) {
  await fsp.mkdir(imagesDir, { recursive: true })
  /** @type {Map<string, string>} */
  const urlToLocal = new Map()
  let index = 0

  for (const imageUrl of imageUrls) {
    index += 1
    let ext = path.extname(new URL(imageUrl).pathname)
    if (!ext || ext.length > 5) {
      ext = await guessImageExtension(request, imageUrl)
    }
    const filename = `${String(index).padStart(2, '0')}${ext}`
    const localRel = `images/${filename}`
    const localAbs = path.join(imagesDir, filename)

    try {
      const res = await request.get(imageUrl, { timeout: 60_000 })
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`)
      await fsp.writeFile(localAbs, Buffer.from(await res.body()))
      urlToLocal.set(imageUrl, localRel)
    } catch (err) {
      console.warn(`    image skip: ${imageUrl} (${err instanceof Error ? err.message : err})`)
    }
  }

  return urlToLocal
}

async function exportLessonHtmlMirror(context, url, { delayMs, jitter, preferredTitle }) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
    await scrollUntilStable(page, { maxRounds: 8, pauseMs: 400 })
    await sleep(800)

    const extracted = await page.evaluate(extractLessonMirrorHtml)
    const pageTitle =
      extracted.title?.replace(/\s*\|\s*Machine Pro.*$/i, '').trim() ||
      (await page.title()).replace(/\s*\|\s*Machine Pro.*$/i, '').trim() ||
      'Untitled'
    const title = preferredTitle?.trim() || pageTitle

    if (/preview unavailable|sign in|log in to view/i.test(extracted.html) && extracted.textLen < 400) {
      throw new Error('Lesson looks gated — session may have expired. Re-run with --login')
    }

    const slug = machineProExportSlug(title, url)
    const pageDir = path.join(HTML_DIR, slug)
    const imagesDir = path.join(pageDir, 'images')
    const urlToLocal = await downloadLessonImages(context.request, extracted.imageUrls, imagesDir)

    const bodyHtml = rewriteImageSources(extracted.html, urlToLocal)
    const exportedAt = new Date().toISOString()
    const html = buildMirrorDocument(title, bodyHtml, url, exportedAt)

    await fsp.mkdir(pageDir, { recursive: true })
    const htmlPath = path.join(pageDir, 'index.html')
    await fsp.writeFile(htmlPath, html, 'utf8')

    const commentTextLen = await page.evaluate(() => {
      const el = document.querySelector('.comment-feed-wrapper')
      return el ? el.innerText.replace(/\s+/g, ' ').trim().length : 0
    })

    const meta = {
      title,
      url,
      slug,
      exported: exportedAt,
      imageCount: urlToLocal.size,
      commentChars: commentTextLen,
      textChars: extracted.textLen,
    }
    await fsp.writeFile(path.join(pageDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

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
      commentChars: commentTextLen,
    }
  } finally {
    await page.close()
    await sleep(betweenPageDelayMs(delayMs, jitter))
  }
}

async function loadManifest() {
  try {
    const raw = await fsp.readFile(MANIFEST_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { exported: [], failed: [] }
  }
}

async function loadDiscoverLessonsFromFile() {
  const raw = JSON.parse(await fsp.readFile(LINKS_PATH, 'utf8'))
  const normalizeRow = (l) => ({
    title: l.title,
    url: normalizeMachineProUrl(l.url) ?? l.url,
    lessonId: machineProLessonIdFromUrl(normalizeMachineProUrl(l.url) ?? l.url),
  })
  if (Array.isArray(raw?.canonicalLinks) && raw.canonicalLinks.length) {
    const canonicalLinks = raw.canonicalLinks.map((l) => normalizeRow(l))
    return {
      lessons: canonicalLinks,
      canonicalLinks,
    }
  }
  if (Array.isArray(raw?.lessons) && raw.lessons.length) {
    return {
      lessons: raw.lessons.filter((l) => l && typeof l.url === 'string').map(normalizeRow),
      canonicalLinks: Array.isArray(raw.canonicalLinks)
        ? raw.canonicalLinks.map((l) => normalizeRow(l))
        : null,
    }
  }
  return {
    lessons: parseDiscoverFile(raw).map((url) => ({
      title: '',
      url: normalizeMachineProUrl(url) ?? url,
      lessonId: machineProLessonIdFromUrl(normalizeMachineProUrl(url) ?? url),
    })),
    canonicalLinks: null,
  }
}

function resolveArchiveDir(relOrAbs) {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(REPO_ROOT, relOrAbs)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  await ensureOutDir()

  console.log('Machine Pro bulk export (local Chrome, polite delays)')
  console.log(`  mode: ${opts.html ? 'HTML mirror (images + comments)' : 'markdown text'}`)
  console.log(`  index: ${opts.indexUrl}`)
  console.log(`  delay: ${formatDelayLabel(opts.delayMs, opts.jitter)}`)
  if (opts.limit !== Infinity) console.log(`  limit: ${opts.limit} lessons`)
  if (opts.onlyMissingFrom) {
    console.log(`  only-missing-from: ${opts.onlyMissingFrom}`)
  }

  const { browser, context } = await launchContext({
    forceLogin: opts.forceLogin,
    loginUrl: opts.loginUrl,
    indexUrl: opts.indexUrl,
  })

  try {
    if (opts.exportOnly && fs.existsSync(LINKS_PATH)) {
      console.log(`Using discover file: ${path.relative(REPO_ROOT, LINKS_PATH)}`)
    } else {
      console.log('\nDiscovering lesson URLs from alphabetical index…')
      const discovered = await discoverLinks(context, {
        indexUrl: opts.indexUrl,
        alsoCrawlWeeks: opts.alsoCrawlWeeks,
      })
      console.log(`Found ${discovered.length} lesson URLs → ${path.relative(REPO_ROOT, LINKS_PATH)}`)
      if (fs.existsSync(GAPS_PATH)) {
        console.log(`Discover gaps → ${path.relative(REPO_ROOT, GAPS_PATH)}`)
      }
    }

    if (opts.discoverOnly) {
      console.log('\nDiscover-only — done. Run: node scripts/machinepro-gap-report.mjs')
      return
    }

    const { lessons, canonicalLinks } = await loadDiscoverLessonsFromFile()
    /** @type {Array<{ title: string, url: string }>} */
    let exportItems = lessons.map((l) => ({ title: l.title, url: l.url }))

    if (opts.onlyMissingFrom) {
      const archiveDir = resolveArchiveDir(opts.onlyMissingFrom)
      const missingTitles = missingCanonicalTitlesFromArchive(archiveDir)
      if (!canonicalLinks?.length) {
        console.warn('\n  No canonicalLinks in discovered-links.json — re-run discover first.')
        return
      }
      const filtered = filterLessonsForMissingCanonical(lessons, missingTitles, canonicalLinks)
      exportItems = filtered.lessons

      console.log(`\nIncremental export (archive gap fill)`)
      console.log(`  Archive: ${path.relative(REPO_ROOT, archiveDir)}`)
      console.log(`  Missing canonical titles: ${missingTitles.length}`)
      console.log(`  Index label → href pairs to export: ${exportItems.length}`)

      if (filtered.unresolved.length) {
        console.warn(`  No index link for ${filtered.unresolved.length} missing titles (first 10):`)
        for (const t of filtered.unresolved.slice(0, 10)) console.warn(`    - ${t}`)
      }
      if (!exportItems.length) {
        console.log('\nNothing to export — no index links for missing titles.')
        return
      }
    }

    const manifest = await loadManifest()
    const exportFormat = opts.html ? 'html' : 'md'
    const doneUrls = new Set(
      manifest.exported
        .filter((e) => (e.format || 'md') === exportFormat)
        .map((e) => e.url),
    )
    const doneLessonIds = new Set(
      manifest.exported
        .filter((e) => (e.format || 'md') === exportFormat && e.url)
        .map((e) => machineProLessonIdFromUrl(e.url))
        .filter(Boolean),
    )
    let exported = 0
    const exportLesson = opts.html ? exportLessonHtmlMirror : exportLessonMarkdown
    const delayOpts = { delayMs: opts.delayMs, jitter: opts.jitter }

    console.log(`\nExporting lesson ${opts.html ? 'mirrors' : 'bodies'}…`)
    for (const item of exportItems) {
      if (exported >= opts.limit) break

      let url = normalizeMachineProUrl(item.url) ?? item.url
      const lessonId = machineProLessonIdFromUrl(url)

      if (doneUrls.has(url) || (lessonId && doneLessonIds.has(lessonId))) {
        console.log(`  skip (manifest): ${item.title || url}`)
        continue
      }

      process.stdout.write(`  ${item.title || url} … `)
      try {
        const row = await exportLesson(context, url, {
          ...delayOpts,
          preferredTitle: item.title,
        })
        if (item.title && !row.title) row.title = item.title
        manifest.exported = manifest.exported.filter(
          (e) => e.url !== url || (e.format || 'md') !== exportFormat,
        )
        manifest.exported.push(row)
        if (lessonId) doneLessonIds.add(lessonId)
        doneUrls.add(url)
        exported += 1
        if (opts.html) {
          console.log(
            `OK (${row.chars} chars, ${row.imageCount} imgs, ${row.commentChars} comment chars) → ${row.file}`,
          )
        } else {
          console.log(`OK (${row.chars} chars) → ${row.file}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        manifest.failed = manifest.failed.filter((e) => e.url !== url)
        manifest.failed.push({ url, error: msg, at: new Date().toISOString() })
        console.log(`FAIL — ${msg}`)
      }

      await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    }

    console.log(`\nDone. Exported ${exported} this run.`)
    console.log(`  Output: ${path.relative(REPO_ROOT, OUT_DIR)}/`)
    console.log(`  Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`)
    if (manifest.failed.length) {
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
