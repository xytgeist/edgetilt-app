import { isQuoteRepostPost } from './communityFeedPost.js'

/** Staff-seeded category slugs stored on `community_feed_posts.category_pills`. */
export const LOUNGE_POST_CATEGORY_PILL_SLUGS = Object.freeze([
  'ap_slots',
  'ap_tables',
  'poker',
  'gaming',
  'tabletop',
  'investing',
  'trading',
  'stocks',
  'crypto',
  'collectibles',
])

const LOUNGE_POST_CATEGORY_PILL_LABEL_BY_SLUG = Object.freeze({
  ap_slots: 'AP Slots',
  ap_tables: 'AP Tables',
  poker: 'Poker',
  gaming: 'Gaming',
  tabletop: 'Tabletop',
  investing: 'Investing',
  trading: 'Trading',
  stocks: 'Stocks',
  crypto: 'Crypto',
  collectibles: 'Collectibles',
})

/** Map v1 slug names → current slugs (localStorage + legacy rows). */
const LOUNGE_POST_CATEGORY_PILL_LEGACY_SLUG_MAP = Object.freeze({
  slots: 'ap_slots',
  tables: 'ap_tables',
  games: 'gaming',
  video_games: 'tabletop',
})

const ALLOWED = new Set(LOUNGE_POST_CATEGORY_PILL_SLUGS)

/** Tailwind chip classes per slug - shared by feed/detail row + compose picker. */
const LOUNGE_POST_CATEGORY_PILL_CHIP_PALETTE = Object.freeze({
  ap_slots: {
    display: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
    selected: 'border-amber-400/50 bg-amber-500/20 text-amber-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-amber-500/35 hover:text-amber-200',
  },
  ap_tables: {
    display: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
    selected: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-emerald-500/35 hover:text-emerald-200',
  },
  poker: {
    display: 'border-rose-500/35 bg-rose-500/10 text-rose-300',
    selected: 'border-rose-400/50 bg-rose-500/20 text-rose-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-rose-500/35 hover:text-rose-200',
  },
  gaming: {
    display: 'border-violet-500/35 bg-violet-500/10 text-violet-300',
    selected: 'border-violet-400/50 bg-violet-500/20 text-violet-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-violet-500/35 hover:text-violet-200',
  },
  tabletop: {
    display: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
    selected: 'border-sky-400/50 bg-sky-500/20 text-sky-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-sky-500/35 hover:text-sky-200',
  },
  investing: {
    display: 'border-teal-500/35 bg-teal-500/10 text-teal-300',
    selected: 'border-teal-400/50 bg-teal-500/20 text-teal-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-teal-500/35 hover:text-teal-200',
  },
  trading: {
    display: 'border-orange-500/35 bg-orange-500/10 text-orange-300',
    selected: 'border-orange-400/50 bg-orange-500/20 text-orange-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-orange-500/35 hover:text-orange-200',
  },
  stocks: {
    display: 'border-lime-500/35 bg-lime-500/10 text-lime-300',
    selected: 'border-lime-400/50 bg-lime-500/20 text-lime-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-lime-500/35 hover:text-lime-200',
  },
  crypto: {
    display: 'border-[#F7931A]/40 bg-[#F7931A]/12 text-[#FBB040]',
    selected: 'border-[#F7931A]/55 bg-[#F7931A]/22 text-[#FFE4B8]',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-[#F7931A]/40 hover:text-[#FBB040]',
  },
  collectibles: {
    display: 'border-pink-500/35 bg-pink-500/10 text-pink-300',
    selected: 'border-pink-400/50 bg-pink-500/20 text-pink-100',
    idle: 'border-zinc-600/70 bg-zinc-900/50 text-zinc-400 hover:border-pink-500/35 hover:text-pink-200',
  },
})

const DEFAULT_CHIP_PALETTE = LOUNGE_POST_CATEGORY_PILL_CHIP_PALETTE.ap_slots

function resolveCategoryPillSlug(raw) {
  const slug = String(raw ?? '').trim()
  if (!slug) return ''
  if (ALLOWED.has(slug)) return slug
  return LOUNGE_POST_CATEGORY_PILL_LEGACY_SLUG_MAP[slug] || ''
}

/** @returns {{ slug: string, label: string }[]} */
export function loungePostCategoryPillOptions() {
  return LOUNGE_POST_CATEGORY_PILL_SLUGS.map((slug) => ({
    slug,
    label: LOUNGE_POST_CATEGORY_PILL_LABEL_BY_SLUG[slug] || slug,
  }))
}

/**
 * Compose picker order: selected first, then most-used slugs, then catalog order.
 *
 * @param {string[]} selected
 * @param {Record<string, number>} [usageCounts]
 * @returns {{ slug: string, label: string }[]}
 */
export function loungePostCategoryPillOptionsForPicker(selected = [], usageCounts = {}) {
  const selectedSet = new Set(
    (Array.isArray(selected) ? selected : [])
      .map((s) => resolveCategoryPillSlug(s))
      .filter(Boolean),
  )
  const slugIndex = (slug) => {
    const i = LOUNGE_POST_CATEGORY_PILL_SLUGS.indexOf(slug)
    return i >= 0 ? i : 999
  }
  return loungePostCategoryPillOptions().sort((a, b) => {
    const aSel = selectedSet.has(a.slug) ? 1 : 0
    const bSel = selectedSet.has(b.slug) ? 1 : 0
    if (bSel !== aSel) return bSel - aSel
    const aUse = Number(usageCounts[a.slug]) || 0
    const bUse = Number(usageCounts[b.slug]) || 0
    if (bUse !== aUse) return bUse - aUse
    return slugIndex(a.slug) - slugIndex(b.slug)
  })
}

/** Human label for a stored slug; falls back to the slug. */
export function loungePostCategoryPillLabel(slug) {
  const resolved = resolveCategoryPillSlug(slug)
  return LOUNGE_POST_CATEGORY_PILL_LABEL_BY_SLUG[resolved] || String(slug ?? '').trim()
}

/** @param {'display' | 'selected' | 'idle'} variant */
export function loungePostCategoryPillChipClass(slug, variant = 'display') {
  const resolved = resolveCategoryPillSlug(slug)
  const palette = LOUNGE_POST_CATEGORY_PILL_CHIP_PALETTE[resolved] || DEFAULT_CHIP_PALETTE
  return palette[variant] || palette.display
}

/** Dedupe, filter invalid, preserve order, cap at 3. */
export function normalizeLoungePostCategoryPills(value) {
  const raw = Array.isArray(value) ? value : []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const slug = resolveCategoryPillSlug(item)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
    if (out.length >= 3) break
  }
  return out
}

/** Profile interests - same slug rules as posts, no cardinality cap. */
export function normalizeLoungeProfileCategoryPills(value) {
  const raw = Array.isArray(value) ? value : []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const slug = resolveCategoryPillSlug(item)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
  }
  return out
}

/** Interest tribes on a profile row (empty when missing). */
export function profileCategoryPills(profile) {
  return normalizeLoungeProfileCategoryPills(profile?.category_pills)
}

/** Ordered pills on a hydrated feed row (empty when missing/legacy). */
export function feedPostCategoryPills(row) {
  return normalizeLoungePostCategoryPills(row?.category_pills)
}

/** Pills to render on feed/detail cards - includes plain-repost fallback to OP when row copy is empty. */
export function displayPostCategoryPills(post) {
  if (!post) return []
  const own = feedPostCategoryPills(post)
  if (own.length > 0) return own
  if (post.is_plain_repost === true && post.reposted_post) {
    return feedPostCategoryPills(post.reposted_post)
  }
  return []
}

/** Quote repost compose: inherit pills from the original post (OP), not an intermediate quote shell. */
export function resolveQuoteRepostSourcePost(post) {
  if (!post) return null
  if (post.reposted_post && (post.repost_of_post_id || isQuoteRepostPost(post))) {
    return post.reposted_post
  }
  return post
}

export function resolveQuoteRepostInitialCategoryPills(post) {
  return feedPostCategoryPills(resolveQuoteRepostSourcePost(post))
}

/** Plain repost insert: copy OP pills at insert time (locked on the new row). */
export function resolvePlainRepostCategoryPills(post) {
  if (!post) return []
  if (post.is_plain_repost === true && post.reposted_post) {
    return feedPostCategoryPills(post.reposted_post)
  }
  if (post.is_plain_repost === true && post.repost_of_post_id) {
    return feedPostCategoryPills(post)
  }
  return feedPostCategoryPills(post)
}

/**
 * Client-side category pill typeahead for Lounge search (label + slug substring match).
 * @param {string} query
 * @param {number} [max=3]
 * @returns {{ slug: string, label: string }[]}
 */
export function matchLoungePostCategoryPillsForSearch(query, max = 3) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase()
  if (needle.length < 2) return []
  const limit = Math.max(1, Math.min(Number(max) || 3, LOUNGE_POST_CATEGORY_PILL_SLUGS.length))
  const out = []
  for (const slug of LOUNGE_POST_CATEGORY_PILL_SLUGS) {
    const label = LOUNGE_POST_CATEGORY_PILL_LABEL_BY_SLUG[slug] || slug
    const labelLower = label.toLowerCase()
    const slugSpaced = slug.replace(/_/g, ' ')
    if (
      labelLower.includes(needle) ||
      slugSpaced.includes(needle) ||
      slug.includes(needle)
    ) {
      out.push({ slug, label })
      if (out.length >= limit) break
    }
  }
  return out
}
