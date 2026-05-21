/** @typedef {'latest' | 'popular'} LoungeFeedSortMode */

export const LOUNGE_FEED_SORT_STORAGE_KEY = 'loungeFeedSort:v1'

export const LOUNGE_FEED_SORT = {
  LATEST: 'latest',
  POPULAR: 'popular',
}

const SORT_VALUES = new Set(Object.values(LOUNGE_FEED_SORT))

/** @returns {LoungeFeedSortMode} */
export function readLoungeFeedSort() {
  if (typeof window === 'undefined') return LOUNGE_FEED_SORT.LATEST
  try {
    const v = window.localStorage.getItem(LOUNGE_FEED_SORT_STORAGE_KEY)
    if (SORT_VALUES.has(v)) return /** @type {LoungeFeedSortMode} */ (v)
  } catch {
    // ignore
  }
  return LOUNGE_FEED_SORT.LATEST
}

/** @param {LoungeFeedSortMode} mode */
export function writeLoungeFeedSort(mode) {
  if (typeof window === 'undefined' || !SORT_VALUES.has(mode)) return
  try {
    window.localStorage.setItem(LOUNGE_FEED_SORT_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}
