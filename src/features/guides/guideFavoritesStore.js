import { useCallback, useSyncExternalStore } from 'react'

export const GUIDE_FAVORITES_STORAGE_KEY = 'lvsp:guideFavorites:v1'

/** @type {Set<() => void>} */
const listeners = new Set()

/** @type {string[] | null} */
let cachedSlugs = null

/** @param {string | null | undefined} slug */
function normalizeSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
}

/** @returns {string[]} most-recently favorited first */
function readFromStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(GUIDE_FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out = []
    const seen = new Set()
    for (const item of parsed) {
      const s = normalizeSlug(item)
      if (!s || seen.has(s)) continue
      seen.add(s)
      out.push(s)
    }
    return out
  } catch {
    return []
  }
}

/** @param {string[]} slugs */
function writeToStorage(slugs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GUIDE_FAVORITES_STORAGE_KEY, JSON.stringify(slugs))
  } catch {
    /* ignore quota */
  }
}

/** @returns {string[]} */
export function getGuideFavoriteSlugs() {
  if (cachedSlugs === null) cachedSlugs = readFromStorage()
  return cachedSlugs
}

function notify() {
  for (const fn of listeners) fn()
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return getGuideFavoriteSlugs()
}

/** Server snapshot for SSR / first paint. */
function getServerSnapshot() {
  return EMPTY_SLUGS
}

const EMPTY_SLUGS = Object.freeze([])

/**
 * @param {string | null | undefined} slug
 * @returns {boolean}
 */
export function isGuideFavorite(slug) {
  const s = normalizeSlug(slug)
  if (!s) return false
  return getGuideFavoriteSlugs().includes(s)
}

/**
 * @param {string | null | undefined} slug
 * @param {boolean} enabled
 * @returns {string[]}
 */
export function setGuideFavorite(slug, enabled) {
  const s = normalizeSlug(slug)
  if (!s) return getGuideFavoriteSlugs()
  const current = getGuideFavoriteSlugs().filter((x) => x !== s)
  const next = enabled ? [s, ...current] : current
  cachedSlugs = next
  writeToStorage(next)
  notify()
  return next
}

/** Toggle favorite; returns whether it is now favorited. */
export function toggleGuideFavorite(slug) {
  const nextEnabled = !isGuideFavorite(slug)
  setGuideFavorite(slug, nextEnabled)
  return nextEnabled
}

/** React hook: favorite slugs (most recent first) + toggle helper. */
export function useGuideFavorites() {
  const slugs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggle = useCallback((slug) => toggleGuideFavorite(slug), [])
  const isFavorite = useCallback((slug) => {
    const s = normalizeSlug(slug)
    return Boolean(s && slugs.includes(s))
  }, [slugs])

  return { favoriteSlugs: slugs, isFavorite, toggleFavorite: toggle }
}
