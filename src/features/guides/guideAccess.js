import { resolveRequiresSlotsEdge } from '../billing/contentAccessGates.js'

/** Retired slugs → current slug (markdown `guide:` links, admin gate keys). */
export const GUIDE_SLUG_CANONICAL = {
  'legends-of-the-phoenix': 'legend-of-the-phoenix',
}

/**
 * Guides available to free (logged-in) users without any paid Slots Edge plan.
 * Toggle access here; admin UI overrides take precedence when DB migration is applied.
 */
export const FREE_GUIDE_SLUGS = new Set([
  '5-coin-frenzy-jackpots',
  '88-fortunes-emperors-coins',
  'ags-must-hit-by',
  'ainsworth-must-hit-by',
  'brian-christophers-world-cruise',
  'buffalo-link',
  'buffalo-cash',
  'lightning-buffalo-link',
  'igt-must-hit-by',
  'cashman-bingo',
  'crush-conquest',
  'crush-dynasty',
  'dancing-phoenix-soaring-dragon',
  'golden-egypt',
])

/**
 * Starter ($14/mo) pack: all guides with `machines.release_year` at or before this year (inclusive).
 * Not included on the free tier — see `docs/access-tiers.md` §5.2.
 */
export const GUIDE_STARTER_PACK_MAX_RELEASE_YEAR = 2019

/**
 * Weekly premium drop pool: published guides with `machines.release_year` at or after this year.
 * Each Starter subscriber gets one random slug per week from their **remaining** pool (see §5.2).
 */
export const GUIDE_WEEKLY_DROP_MIN_RELEASE_YEAR = 2020

/**
 * AP guides (and paired tools) that require Slots Edge Pro — not the Starter pack or weekly drops.
 * Keep in sync with `SLOTS_EDGE_PRO_ONLY_CALCULATOR_KEYS` in calculatorAccess.js when paired.
 */
export const SLOTS_EDGE_PRO_ONLY_GUIDE_SLUGS = new Set(['buffalo-diamond'])

/** @param {number | string | null | undefined} releaseYear */
export function isGuideInStarterPackByReleaseYear(releaseYear) {
  const y = Number(releaseYear)
  if (!Number.isFinite(y)) return false
  return y <= GUIDE_STARTER_PACK_MAX_RELEASE_YEAR
}

/** @param {number | string | null | undefined} releaseYear */
export function isGuideInWeeklyDropPoolByReleaseYear(releaseYear) {
  const y = Number(releaseYear)
  if (!Number.isFinite(y)) return false
  return y >= GUIDE_WEEKLY_DROP_MIN_RELEASE_YEAR
}

/** @param {string | null | undefined} rawSlug */
export function normalizeGuideAccessSlug(rawSlug) {
  let slug = String(rawSlug || '').trim().toLowerCase()
  if (!slug) return ''
  slug = GUIDE_SLUG_CANONICAL[slug] || slug
  return slug
}

/** @param {string | null | undefined} slug */
export function isSlotsEdgeProOnlyGuide(slug) {
  return SLOTS_EDGE_PRO_ONLY_GUIDE_SLUGS.has(normalizeGuideAccessSlug(slug))
}

/**
 * Machine slug for Lounge AP Guide embeds - matches `guide-card-${slug}` ids in GuidesScreen.
 * @param {{ slug?: string | null, machines?: { slug?: string | null } | Array<{ slug?: string | null }> | null } | null | undefined} guideRow
 */
export function resolveGuidePostSlug(guideRow) {
  if (!guideRow) return ''
  const m = guideRow.machines
  if (m != null && !Array.isArray(m)) {
    const s = String(m.slug || '').trim()
    if (s) return s
  }
  if (Array.isArray(m)) {
    const list = m.filter(Boolean)
    const gs = String(guideRow.slug || '').trim().toLowerCase()
    const slugMatch =
      gs && list.find((x) => String(x?.slug || '').trim().toLowerCase() === gs)
    const picked = slugMatch ?? list[0]
    const s = String(picked?.slug || '').trim()
    if (s) return s
  }
  return String(guideRow.slug || '').trim()
}

function codeDefaultGuideRequiresSlotsEdge(slug) {
  const normalized = normalizeGuideAccessSlug(slug)
  if (!normalized) return true
  return !FREE_GUIDE_SLUGS.has(normalized)
}

/** @param {string | null | undefined} slug @param {Map<string, boolean> | null | undefined} [gatesMap] */
export function guideRequiresSlotsEdge(slug, gatesMap = null) {
  const normalized = normalizeGuideAccessSlug(slug)
  return resolveRequiresSlotsEdge(
    'guide',
    normalized,
    gatesMap,
    codeDefaultGuideRequiresSlotsEdge(normalized),
  )
}

/**
 * @param {string | null | undefined} slug
 * @param {{
 *   isStaff?: boolean,
 *   hasSlotsEdge?: boolean,
 *   hasSlotsEdgeStarter?: boolean,
 *   starterUnlockedGuideSlugs?: Set<string> | null,
 *   starterWeeklyDropPoolExhausted?: boolean,
 *   gatesMap?: Map<string, boolean> | null,
 *   releaseYear?: number | string | null,
 * }} [access]
 */
export function canOpenGuide(
  slug,
  {
    isStaff = false,
    hasSlotsEdge = false,
    hasSlotsEdgeStarter = false,
    starterUnlockedGuideSlugs = null,
    starterWeeklyDropPoolExhausted = false,
    gatesMap = null,
    releaseYear = null,
  } = {},
) {
  if (isStaff || hasSlotsEdge) return true

  const normalized = normalizeGuideAccessSlug(slug)

  if (isSlotsEdgeProOnlyGuide(normalized)) return false

  if (hasSlotsEdgeStarter) {
    if (isGuideInStarterPackByReleaseYear(releaseYear)) return true
    if (starterUnlockedGuideSlugs instanceof Set && normalized && starterUnlockedGuideSlugs.has(normalized)) {
      return true
    }
    if (
      starterWeeklyDropPoolExhausted &&
      normalized &&
      isGuideInWeeklyDropPoolByReleaseYear(releaseYear) &&
      !FREE_GUIDE_SLUGS.has(normalized)
    ) {
      return true
    }
  }

  return !guideRequiresSlotsEdge(slug, gatesMap)
}

/** @param {Map<string, boolean> | null | undefined} [gatesMap] */
export function guidesTabFullyGated(gatesMap = null) {
  for (const slug of FREE_GUIDE_SLUGS) {
    if (!guideRequiresSlotsEdge(slug, gatesMap)) return false
  }
  if (gatesMap instanceof Map) {
    for (const [key, requires] of gatesMap.entries()) {
      if (key.startsWith('guide:') && requires === false) return false
    }
  }
  return true
}

/**
 * @param {string | null | undefined} slug
 * @param {{
 *   browseMode?: string,
 *   isStaff?: boolean,
 *   hasSlotsEdge?: boolean,
 *   hasSlotsEdgeStarter?: boolean,
 *   starterUnlockedGuideSlugs?: Set<string> | null,
 *   gatesMap?: Map<string, boolean> | null,
 *   releaseYear?: number | string | null,
 * }} [access]
 */
export function showGuideLock(slug, access = {}) {
  if (access.browseMode !== 'member' || access.isStaff || access.hasSlotsEdge) return false
  return !canOpenGuide(slug, access)
}
