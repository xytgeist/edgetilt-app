/**
 * Machine Pro alphabetical index discovery + canonical title matching.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

export const CANONICAL_TITLES_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'machinepro-canonical-index-titles.txt',
)

const BASE = 'https://www.machinepro.club'

/** @param {string} href */
export function normalizeMachineProUrl(href) {
  try {
    const u = new URL(href, BASE)
    if (!u.hostname.includes('machinepro.club')) return null
    u.protocol = 'https:'
    u.hostname = 'www.machinepro.club'
    u.hash = ''
    u.search = ''
    u.pathname = u.pathname.replace(/^\/view\/courses\//, '/p/courses/')
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** @param {string | null | undefined} url */
export function isGuideIndexUrl(url) {
  return /alphabetical-list-of-all-strategy-guides-with-links/i.test(url || '')
}

/** @param {string | null | undefined} url */
export function isWeekContainerUrl(url) {
  if (!url) return false
  if (/\/\d+-week-\d+(\/|$)/i.test(url)) return true
  try {
    const last = new URL(url, BASE).pathname.split('/').filter(Boolean).pop() || ''
    return /^\d+-week-\d+$/i.test(last)
  } catch {
    return false
  }
}

/** @param {string | null | undefined} url */
export function isMachineProLessonUrl(url) {
  if (!url) return false
  if (isGuideIndexUrl(url)) return false
  if (isWeekContainerUrl(url)) return false
  if (/\/(login|sign_in|sign_up|checkout|password|completions)/i.test(url)) return false
  try {
    const segments = new URL(url, BASE).pathname.split('/').filter(Boolean)
    const coursesIdx = segments.indexOf('courses')
    if (coursesIdx === -1) return false
    const afterCourses = segments.slice(coursesIdx + 1)
    if (afterCourses.length < 3) return false
    const last = afterCourses[afterCourses.length - 1] || ''
    return /^\d+-/.test(last)
  } catch {
    return false
  }
}

/** @param {string} href */
export function hrefLooksLikeLesson(href) {
  try {
    let url = href
    if (url.startsWith('/')) url = new URL(url, BASE).href
    url = url.replace(/\/view\/courses\//, '/p/courses/')
    return isMachineProLessonUrl(url)
  } catch {
    return false
  }
}

/** @param {string} url */
export function machineProLessonIdFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() || ''
    const m = seg.match(/^(\d+)-/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** @param {string} url @returns {string} */
export function machineProUrlPathSegment(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || 'post'
  } catch {
    return 'post'
  }
}

/** Slug from display title (canonical index label or lesson title). */
export function machineProTitleSlug(title) {
  return (
    String(title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '') || 'post'
  )
}

/** Stable export folder name: URL segment for direct lessons; title slug for week containers. */
export function machineProExportSlug(title, url) {
  if (isWeekContainerUrl(url) && title?.trim()) {
    return machineProTitleSlug(title)
  }
  return (
    machineProUrlPathSegment(url)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '') || 'post'
  )
}

/** @param {string} text */
export function cleanIndexAnchorTitle(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\d{1,3}$/, '')
    .trim()
}

/** @param {string} text */
export function normalizeIndexTitle(text) {
  return cleanIndexAnchorTitle(text)
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** @param {string} lessonTitle @param {string} norm canonical normalized title */
export function lessonTitleMatchesNorm(lessonTitle, norm) {
  if (!norm) return false
  const full = normalizeIndexTitle(lessonTitle)
  if (full === norm) return true
  const parts = cleanIndexAnchorTitle(lessonTitle)
    .split(/\s*[,/]\s*/)
    .flatMap((part) => {
      const bits = [part.trim()]
      if (part.includes(':')) bits.push(part.split(':').slice(1).join(':').trim())
      return bits
    })
    .map((p) => normalizeIndexTitle(p))
    .filter(Boolean)
  return parts.includes(norm)
}

/** @param {string} [filePath] */
export function loadCanonicalIndexTitles(filePath = CANONICAL_TITLES_PATH) {
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Prefer the URL from the alphabetical index / lifetime membership over duplicate section links.
 * @param {string} a
 * @param {string} b
 */
function urlPreferenceScore(url) {
  let score = 0
  if (/alphabetical-list-of-all-strategy-guides-with-links/i.test(url)) score -= 100
  if (/1645978-default-section/i.test(url)) score += 90
  if (/lifetime-membership\/1645978/i.test(url)) score += 70
  if (/1841179-30-exclusive-strategy-guides/i.test(url)) score -= 40
  if (/lifetime-membership/i.test(url)) score += 50
  if (/booster-pack/i.test(url)) score += 10
  if (/machine-pro-club-subscription/i.test(url)) score += 5
  score -= url.length / 200
  return score
}

/**
 * @param {Array<{ title: string, url: string }>} raw
 * @returns {Array<{ title: string, url: string, lessonId: string | null }>}
 */
export function dedupeLessonsById(raw) {
  /** @type {Map<string, { title: string, url: string, lessonId: string | null }>} */
  const byId = new Map()

  for (const row of raw) {
    const url = normalizeMachineProUrl(row.url)
    if (!url || !isMachineProLessonUrl(url)) continue
    const lessonId = machineProLessonIdFromUrl(url)
    const key = lessonId || url
    const entry = { title: row.title.trim(), url, lessonId }
    const prev = byId.get(key)
    if (!prev || urlPreferenceScore(url) > urlPreferenceScore(prev.url)) {
      byId.set(key, entry)
    }
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * Scroll the alphabetical index lecture until lesson links stop growing.
 * The full A–Z list lives in a scrollable lecture body; window scroll alone only hits the sidebar (~30 links).
 * @param {import('playwright').Page} page
 * @param {{ minLessonLinks?: number, maxRounds?: number, pauseMs?: number }} [opts]
 */
export async function scrollAlphabeticalIndex(page, { minLessonLinks = 280, maxRounds = 140, pauseMs = 400 } = {}) {
  await page
    .waitForSelector(
      '.lecture-content, [class*="lecture-content"], .course-main, [role="main"]',
      { timeout: 90_000 },
    )
    .catch(() => {})

  await page.evaluate(() => {
    document.querySelector('[data-mp-scroll-target]')?.removeAttribute('data-mp-scroll-target')
    const candidates = [
      ...document.querySelectorAll(
        '.lecture-content, [class*="lecture-content"], .course-main, main, [role="main"]',
      ),
    ]
    let best = null
    let bestScore = 0
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue
      const linkCount = el.querySelectorAll('a[href]').length
      const score = el.scrollHeight + linkCount * 500
      if (score > bestScore) {
        bestScore = score
        best = el
      }
    }
    best?.setAttribute('data-mp-scroll-target', '1')
  })

  let lastCount = 0
  let stablePasses = 0
  let bestCount = 0

  for (let i = 0; i < maxRounds; i += 1) {
    await page.evaluate(() => {
      const step = Math.max(320, Math.floor(window.innerHeight * 0.82))
      const primary = document.querySelector('[data-mp-scroll-target]')
      if (primary instanceof HTMLElement) {
        primary.scrollTop += step
      }
      window.scrollBy(0, step)
      for (const el of document.querySelectorAll('*')) {
        if (!(el instanceof HTMLElement)) continue
        const style = getComputedStyle(el)
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 80
        ) {
          el.scrollTop += Math.floor(el.clientHeight * 0.75)
        }
      }
    })

    if (i % 6 === 5) {
      await page.keyboard.press('PageDown').catch(() => {})
    }
    if (i % 12 === 11) {
      await page.keyboard.press('End').catch(() => {})
    }

    await page.waitForTimeout(pauseMs)

    const linkCount = await countLessonLinksOnPage(page)
    bestCount = Math.max(bestCount, linkCount)

    if (linkCount >= minLessonLinks) {
      stablePasses += 1
      if (stablePasses >= 3) return linkCount
    } else if (linkCount === lastCount) {
      stablePasses += 1
      if (stablePasses >= 4 && linkCount < 80) {
        // Stuck on sidebar-only counts — keep trying until maxRounds
        stablePasses = 0
      } else if (stablePasses >= 6) {
        return linkCount
      }
    } else {
      stablePasses = 0
      lastCount = linkCount
    }
  }

  return bestCount
}

/** @param {import('playwright').Page} page */
export async function countLessonLinksOnPage(page) {
  let total = 0
  for (const frame of [page, ...page.frames()]) {
    try {
      total += await frame.evaluate(() => {
        const isLesson = (href) => {
          try {
            const u = new URL(href, window.location.origin)
            if (!u.hostname.includes('machinepro.club')) return false
            if (/alphabetical-list-of-all-strategy-guides-with-links/i.test(u.pathname)) return false
            const segs = u.pathname.split('/').filter(Boolean)
            const ci = segs.indexOf('courses')
            if (ci === -1) return false
            const after = segs.slice(ci + 1)
            if (after.length < 3) return false
            return /^\d+-/.test(after[after.length - 1] || '')
          } catch {
            return false
          }
        }
        let n = 0
        for (const a of document.querySelectorAll('a[href]')) {
          const href = a.href || a.getAttribute('href') || ''
          if (href && isLesson(href)) n += 1
        }
        return n
      })
    } catch {
      // detached frame
    }
  }
  return total
}

/**
 * @param {import('playwright').Page} page
 * @param {{ maxRounds?: number, pauseMs?: number }} [opts]
 * @deprecated Prefer scrollAlphabeticalIndex for the guide index page.
 */
export async function scrollUntilStable(page, { maxRounds = 48, pauseMs = 450 } = {}) {
  return scrollAlphabeticalIndex(page, { minLessonLinks: 280, maxRounds, pauseMs })
}

/**
 * Extract guide links + anchor text from the page DOM (all frames).
 * @param {import('playwright').Page} page
 */
export async function extractGuideLinksFromDom(page) {
  /** @type {Array<{ title: string, url: string }>} */
  const out = []
  const seen = new Set()

  const collect = async (frame) => {
    return frame.evaluate(() => {
      const isLesson = (href) => {
        try {
          let raw = href
          if (raw.startsWith('/')) raw = new URL(raw, window.location.origin).href
          const u = new URL(raw)
          if (!u.hostname.includes('machinepro.club')) return false
          if (/alphabetical-list-of-all-strategy-guides-with-links/i.test(u.pathname)) return false
          const segs = u.pathname.replace(/^\/view\/courses\//, '/p/courses/').split('/').filter(Boolean)
          const ci = segs.indexOf('courses')
          if (ci === -1) return false
          const after = segs.slice(ci + 1)
          if (after.length < 3) return false
          const last = after[after.length - 1] || ''
          if (/^\d+-week-\d+$/i.test(last)) return false
          return /^\d+-/.test(last)
        } catch {
          return false
        }
      }

      /** @type {Array<{ title: string, url: string }>} */
      const rows = []
      const seenLocal = new Set()

      for (const a of document.querySelectorAll('a[href]')) {
        let href = a.href || a.getAttribute('href') || ''
        if (!href) continue
        if (href.startsWith('/')) href = new URL(href, window.location.origin).href
        if (!href.includes('machinepro.club')) continue
        if (!isLesson(href)) continue

        const normalized = href.split('#')[0].replace(/\/$/, '')
        const normalizedPath = normalized.replace(/\/view\/courses\//, '/p/courses/')
        if (seenLocal.has(normalizedPath)) continue

        let title = (a.textContent || '').replace(/\s+/g, ' ').trim()
        title = title.replace(/\d{1,3}$/, '').trim()
        if (!title || title.length < 2) continue
        if (/^(login|sign up|home|back|next|buy now|learn more)$/i.test(title)) continue

        seenLocal.add(normalizedPath)
        rows.push({ title, url: normalizedPath })
      }

      return rows
    })
  }

  for (const frame of [page, ...page.frames()]) {
    try {
      const chunk = await collect(frame)
      for (const row of chunk) {
        const url = normalizeMachineProUrl(row.url)
        if (!url || seen.has(url)) continue
        seen.add(url)
        out.push({ title: cleanIndexAnchorTitle(row.title), url })
      }
    } catch {
      // skip detached / cross-origin frames
    }
  }

  return out
}

/**
 * Match each canonical index line to its clickable link on the alphabetical index page.
 * @param {import('playwright').Page} page
 * @param {string[]} [canonicalTitles]
 */
export async function extractLinksByCanonicalTitles(page, canonicalTitles = loadCanonicalIndexTitles()) {
  const BATCH = 40
  /** @type {Array<{ title: string, url: string, anchorText: string }>} */
  const found = []
  /** @type {Set<string>} */
  const resolved = new Set()

  for (let i = 0; i < canonicalTitles.length; i += BATCH) {
    const batch = canonicalTitles.slice(i, i + BATCH)
    const rows = await page.evaluate((titles) => {
      const clean = (s) =>
        String(s ?? '')
          .replace(/[\u2018\u2019\u2032`]/g, "'")
          .replace(/\s+/g, ' ')
          .replace(/\d{1,3}$/, '')
          .trim()
      const norm = (s) =>
        clean(s)
          .replace(/&/g, ' and ')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()

      const anchorParts = (text) => {
        /** @type {string[]} */
        const parts = []
        for (const bit of clean(text).split(/\s*\/\s*/)) {
          parts.push(bit.trim())
          if (bit.includes(':')) parts.push(bit.split(':').slice(1).join(':').trim())
        }
        return [...new Set(parts.map(norm).filter(Boolean))]
      }

      const matchesTitle = (anchorText, canonical) => {
        const want = norm(canonical)
        if (!want) return false
        if (norm(anchorText) === want) return true
        return anchorParts(anchorText).includes(want)
      }

      const isIndexLink = (href) => {
        try {
          let raw = href
          if (raw.startsWith('/')) raw = new URL(raw, window.location.origin).href
          const u = new URL(raw)
          if (!u.hostname.includes('machinepro.club')) return false
          if (/alphabetical-list-of-all-strategy-guides-with-links/i.test(u.pathname)) return false
          const segs = u.pathname.split('/').filter(Boolean)
          const ci = segs.indexOf('courses')
          if (ci === -1) return false
          const after = segs.slice(ci + 1)
          if (after.length < 3) return false
          return /^\d+-/.test(after[after.length - 1] || '')
        } catch {
          return false
        }
      }

      const isWeekLink = (href) => {
        try {
          let raw = href
          if (raw.startsWith('/')) raw = new URL(raw, window.location.origin).href
          const last = new URL(raw).pathname.split('/').filter(Boolean).pop() || ''
          return /^\d+-week-\d+$/i.test(last)
        } catch {
          return false
        }
      }

      const anchors = [...document.querySelectorAll('a[href]')]
      /** @type {Array<{ title: string, url: string, anchorText: string }>} */
      const out = []

      for (const title of titles) {
        /** @type {Array<{ url: string, anchorText: string, isWeek: boolean }>} */
        const matches = []
        for (const a of anchors) {
          let href = a.href || a.getAttribute('href') || ''
          if (!href || !isIndexLink(href)) continue
          const anchorText = clean(a.textContent || '')
          if (!anchorText || !matchesTitle(anchorText, title)) continue
          const url = href.split('#')[0].replace(/\/$/, '')
          matches.push({ url, anchorText, isWeek: isWeekLink(href) })
        }
        const best = matches.find((m) => !m.isWeek) ?? matches[0]
        if (best) out.push({ title, url: best.url, anchorText: best.anchorText })
      }
      return out
    }, batch)

    for (const row of rows) {
      const url = normalizeMachineProUrl(row.url)
      if (!url) continue
      found.push({ title: row.title, url, anchorText: row.anchorText })
      resolved.add(row.title)
    }
  }

  const missing = canonicalTitles.filter((t) => !resolved.has(t))
  for (const title of missing) {
    try {
      const link = page
        .locator('a[href]')
        .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(title)}\\s*$`, 'i') })
        .first()
      if ((await link.count()) === 0) continue
      let href = await link.getAttribute('href')
      if (!href) continue
      if (href.startsWith('/')) href = new URL(href, page.url()).href
      const url = normalizeMachineProUrl(href)
      if (!url || !isMachineProLessonUrl(url)) continue
      const anchorText = cleanIndexAnchorTitle(await link.innerText())
      found.push({ title, url, anchorText })
      resolved.add(title)
    } catch {
      // locator miss
    }
  }

  return found
}

/**
 * Week index links land on a container page — resolve to the actual strategy guide URL.
 * @param {import('playwright').Page} page
 * @param {string} weekUrl
 * @param {string} canonicalTitle
 */
export async function resolveWeekPageToLessonUrl(page, weekUrl, canonicalTitle) {
  const direct = normalizeMachineProUrl(weekUrl)
  if (!direct || !isWeekContainerUrl(direct)) return direct

  await page.goto(direct, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(2000)
  await scrollAlphabeticalIndex(page, { minLessonLinks: 3, maxRounds: 40, pauseMs: 350 })

  const hits = await extractLinksByCanonicalTitles(page, [canonicalTitle])
  for (const hit of hits) {
    const url = normalizeMachineProUrl(hit.url)
    if (url && isMachineProLessonUrl(url) && !isWeekContainerUrl(url)) return url
  }

  const raw = await extractGuideLinksFromDom(page)
  const want = normalizeIndexTitle(canonicalTitle)
  for (const row of raw) {
    if (!lessonTitleMatchesNorm(row.title, want)) continue
    const url = normalizeMachineProUrl(row.url)
    if (url && isMachineProLessonUrl(url) && !isWeekContainerUrl(url)) return url
  }

  const slugHint = want.replace(/\s+/g, '-')
  const loose = await page.evaluate(({ wantNorm, slugHint }) => {
    const clean = (s) =>
      String(s ?? '')
        .replace(/[\u2018\u2019\u2032`]/g, "'")
        .replace(/\s+/g, ' ')
        .replace(/\d{1,3}$/, '')
        .trim()
        .toLowerCase()
    for (const a of document.querySelectorAll('a[href]')) {
      let href = a.getAttribute('href') || a.href || ''
      if (!href || !href.includes('courses')) continue
      if (href.startsWith('/')) href = new URL(href, window.location.origin).href
      const last = new URL(href).pathname.split('/').filter(Boolean).pop() || ''
      if (/^\d+-week-\d+$/i.test(last)) continue
      if (!/^\d+-/.test(last)) continue
      const text = clean(a.textContent || '')
      const slug = last.toLowerCase()
      if (text === wantNorm || text.includes(wantNorm) || slug.includes(slugHint)) {
        return href.split('#')[0].replace(/\/$/, '')
      }
    }
    return null
  }, { wantNorm: want, slugHint })

  if (loose) {
    const url = normalizeMachineProUrl(loose)
    if (url && isMachineProLessonUrl(url) && !isWeekContainerUrl(url)) return url
  }

  try {
    const link = page.getByRole('link', { name: new RegExp(escapeRegExp(cleanIndexAnchorTitle(canonicalTitle)), 'i') })
    if ((await link.count()) > 0) {
      let href = await link.first().getAttribute('href')
      if (href?.startsWith('/')) href = new URL(href, page.url()).href
      const url = href ? normalizeMachineProUrl(href) : null
      if (url && isMachineProLessonUrl(url) && !isWeekContainerUrl(url)) return url
    }
  } catch {
    // ignore locator errors
  }

  return null
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {Array<{ title: string, url: string, lessonId?: string | null }>} lessons
 * @param {string[]} [canonicalTitles]
 * @param {Array<{ title: string, url: string }>} [canonicalLinks]
 */
export function matchLessonsToCanonical(
  lessons,
  canonicalTitles = loadCanonicalIndexTitles(),
  canonicalLinks = null,
) {
  if (canonicalLinks?.length) {
    /** @type {string[]} */
    const missingFromDiscover = []
    /** @type {Array<{ canonical: string, lesson: { title: string, url: string } }>} */
    const matched = []
    for (const raw of canonicalTitles) {
      const hit = canonicalLinks.find((l) => l.title === raw)
      if (hit) matched.push({ canonical: raw, lesson: { title: hit.title, url: hit.url } })
      else missingFromDiscover.push(raw)
    }
    const linkedUrls = new Set(canonicalLinks.map((l) => l.url))
    const extraDiscover = lessons.filter((l) => !linkedUrls.has(l.url))
    return {
      canonicalCount: canonicalTitles.length,
      discoveredCount: lessons.length,
      matchedCount: matched.length,
      missingFromDiscover,
      extraDiscover,
      matched,
    }
  }

  const canonicalNorm = canonicalTitles.map((t) => ({
    raw: t,
    norm: normalizeIndexTitle(t),
  }))

  /** @type {Map<string, { title: string, url: string, lessonId?: string | null }>} */
  const byNorm = new Map()
  for (const lesson of lessons) {
    const norm = normalizeIndexTitle(lesson.title)
    if (norm && !byNorm.has(norm)) byNorm.set(norm, lesson)
  }

  /** @type {Array<{ canonical: string, lesson: typeof lessons[0] | null }>} */
  const matched = []
  /** @type {string[]} */
  const missingFromDiscover = []

  for (const { raw, norm } of canonicalNorm) {
    let lesson = byNorm.get(norm) ?? null
    if (!lesson) {
      lesson = lessons.find((l) => lessonTitleMatchesNorm(l.title, norm)) ?? null
    }
    if (lesson) {
      matched.push({ canonical: raw, lesson })
      byNorm.delete(normalizeIndexTitle(lesson.title))
    } else {
      missingFromDiscover.push(raw)
    }
  }

  /** @type {Array<{ title: string, url: string }>} */
  const extraDiscover = [...byNorm.values()]

  return {
    canonicalCount: canonicalTitles.length,
    discoveredCount: lessons.length,
    matchedCount: matched.length,
    missingFromDiscover,
    extraDiscover,
    matched,
  }
}

/**
 * @param {{
 *   discoveredAt?: string,
 *   indexUrl: string,
 *   lessons: Array<{ title: string, url: string, lessonId: string | null }>,
 *   canonicalLinks?: Array<{ title: string, url: string, anchorText?: string }>,
 *   match?: ReturnType<typeof matchLessonsToCanonical>,
 * }} payload
 */
export function serializeDiscoverPayload(payload) {
  return {
    discoveredAt: payload.discoveredAt ?? new Date().toISOString(),
    indexUrl: payload.indexUrl,
    lessonCount: payload.lessons.length,
    canonicalLinkCount: payload.canonicalLinks?.length ?? 0,
    lessons: payload.lessons,
    canonicalLinks: payload.canonicalLinks,
    urls: payload.lessons.map((l) => l.url),
    canonicalMatch: payload.match
      ? {
          canonicalCount: payload.match.canonicalCount,
          matchedCount: payload.match.matchedCount,
          missingFromDiscover: payload.match.missingFromDiscover,
          extraDiscover: payload.match.extraDiscover.map((e) => ({
            title: e.title,
            url: e.url,
          })),
        }
      : undefined,
  }
}

/** @param {unknown} raw */
export function parseDiscoverFile(raw) {
  if (Array.isArray(raw)) {
    return raw.filter((u) => typeof u === 'string')
  }
  if (raw && typeof raw === 'object') {
    /** @type {Record<string, unknown>} */
    const obj = /** @type {Record<string, unknown>} */ (raw)
    if (Array.isArray(obj.lessons)) {
      return obj.lessons
        .filter((l) => l && typeof l === 'object' && typeof l.url === 'string')
        .map((l) => /** @type {{ url: string }} */ (l).url)
    }
    if (Array.isArray(obj.urls)) {
      return obj.urls.filter((u) => typeof u === 'string')
    }
  }
  return []
}
