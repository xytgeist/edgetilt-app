import { resolveRequiresSlotsEdge } from '../billing/contentAccessGates.js'

/** Retired slugs → current slug (markdown `guide:` links, admin gate keys). */
export const GUIDE_SLUG_CANONICAL = {
  'legends-of-the-phoenix': 'legend-of-the-phoenix',
}

/**
 * Guides available to free (logged-in) users without Slots Edge.
 * Toggle access here; admin UI overrides take precedence when DB migration is applied.
 */
export const FREE_GUIDE_SLUGS = new Set(['phoenix-link', 'stack-up-pays'])

/** @param {string | null | undefined} rawSlug */
export function normalizeGuideAccessSlug(rawSlug) {
  let slug = String(rawSlug || '').trim().toLowerCase()
  if (!slug) return ''
  slug = GUIDE_SLUG_CANONICAL[slug] || slug
  return slug
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

/** @param {string | null | undefined} slug @param {{ isStaff?: boolean, hasSlotsEdge?: boolean, gatesMap?: Map<string, boolean> | null }} [access] */
export function canOpenGuide(slug, { isStaff = false, hasSlotsEdge = false, gatesMap = null } = {}) {
  if (isStaff || hasSlotsEdge) return true
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

/** @param {string | null | undefined} slug @param {{ browseMode?: string, isStaff?: boolean, hasSlotsEdge?: boolean, gatesMap?: Map<string, boolean> | null }} [access] */
export function showGuideLock(
  slug,
  { browseMode = 'member', isStaff = false, hasSlotsEdge = false, gatesMap = null } = {},
) {
  if (browseMode !== 'member' || isStaff || hasSlotsEdge) return false
  return guideRequiresSlotsEdge(slug, gatesMap)
}
