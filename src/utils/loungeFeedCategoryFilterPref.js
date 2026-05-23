import { normalizeLoungePostCategoryPills } from './loungePostCategoryPills.js'

/** Persisted home-feed category exclusions (unchecked pills). Empty = all categories visible. */
export const LOUNGE_FEED_CATEGORY_FILTER_STORAGE_KEY = 'loungeFeedCategoryFilter:v2'

/** @returns {string[]} excluded category slugs (unchecked in feed filter UI) */
export function readLoungeFeedCategoryFilter() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOUNGE_FEED_CATEGORY_FILTER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeLoungePostCategoryPills(parsed)
  } catch {
    return []
  }
}

/** @param {string[]} excludedSlugs */
export function writeLoungeFeedCategoryFilter(excludedSlugs) {
  if (typeof window === 'undefined') return
  try {
    const next = normalizeLoungePostCategoryPills(excludedSlugs)
    if (!next.length) {
      window.localStorage.removeItem(LOUNGE_FEED_CATEGORY_FILTER_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LOUNGE_FEED_CATEGORY_FILTER_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
