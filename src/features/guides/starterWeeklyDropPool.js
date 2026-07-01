import {
  FREE_GUIDE_SLUGS,
  isGuideInWeeklyDropPoolByReleaseYear,
  normalizeGuideAccessSlug,
} from './guideAccess.js'
import { machineForGuideRow } from './guideCalculatorKey.js'

/**
 * Published guide slugs eligible for the Starter weekly drop pool (2020+ premium catalog).
 * Excludes free-tier slugs so rolls never "grant" something already unlocked for everyone.
 *
 * @param {Array<{ slug?: string | null, machines?: unknown, published?: boolean }>} guideRows
 */
export function buildWeeklyDropEligibleSlugs(guideRows) {
  /** @type {Set<string>} */
  const slugs = new Set()
  for (const row of guideRows || []) {
    if (row?.published === false) continue
    const m = machineForGuideRow(row)
    if (!isGuideInWeeklyDropPoolByReleaseYear(m?.release_year)) continue
    const slug = normalizeGuideAccessSlug(m?.slug || row.slug)
    if (!slug || FREE_GUIDE_SLUGS.has(slug)) continue
    slugs.add(slug)
  }
  return slugs
}

/**
 * Per-user remaining pool = eligible 2020+ slugs minus slugs this user already earned via weekly drops.
 *
 * @param {Iterable<string>} eligibleSlugs
 * @param {Set<string> | null | undefined} alreadyGrantedSlugs
 */
export function remainingWeeklyDropPool(eligibleSlugs, alreadyGrantedSlugs = null) {
  const granted =
    alreadyGrantedSlugs instanceof Set ? alreadyGrantedSlugs : new Set(alreadyGrantedSlugs || [])
  return [...eligibleSlugs].filter((slug) => !granted.has(normalizeGuideAccessSlug(slug)))
}

/**
 * Uniform random pick for cron / Edge weekly job. Returns `null` when pool is exhausted.
 *
 * @param {Iterable<string>} remainingSlugs
 * @param {() => number} [random] unit interval [0, 1) — inject for tests
 */
export function pickRandomWeeklyDropSlug(remainingSlugs, random = Math.random) {
  const list = [...remainingSlugs].map((s) => normalizeGuideAccessSlug(s)).filter(Boolean)
  if (list.length === 0) return null
  const idx = Math.floor(random() * list.length)
  return list[idx] ?? null
}
