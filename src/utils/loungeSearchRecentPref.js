import { LOUNGE_SEARCH_MIN_CHARS } from '../features/lounge/loungeSearchApi.js'

export const LOUNGE_SEARCH_RECENT_STORAGE_KEY = 'loungeSearchRecent:v1'
const MAX_RECENT = 8
/** Wait after the last settled query before persisting to Recent (avoids saving each debounced keystroke). */
export const LOUNGE_SEARCH_RECENT_COMMIT_IDLE_MS = 2000

/** @returns {string[]} */
export function readLoungeSearchRecent() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOUNGE_SEARCH_RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((s) => String(s ?? '').trim())
      .filter((s) => s.length >= LOUNGE_SEARCH_MIN_CHARS)
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

/** @param {string} query */
export function rememberLoungeSearchQuery(query) {
  const q = String(query ?? '').trim()
  if (q.length < LOUNGE_SEARCH_MIN_CHARS) return
  if (typeof window === 'undefined') return
  const prev = readLoungeSearchRecent().filter((s) => s.toLowerCase() !== q.toLowerCase())
  const next = [q, ...prev].slice(0, MAX_RECENT)
  try {
    window.localStorage.setItem(LOUNGE_SEARCH_RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** @param {string} query @returns {string[]} */
export function forgetLoungeSearchQuery(query) {
  const q = String(query ?? '').trim()
  if (!q || typeof window === 'undefined') return readLoungeSearchRecent()
  const next = readLoungeSearchRecent().filter((s) => s.toLowerCase() !== q.toLowerCase())
  try {
    window.localStorage.setItem(LOUNGE_SEARCH_RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  return next
}
