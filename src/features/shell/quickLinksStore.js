import { useCallback, useSyncExternalStore } from 'react'
import {
  isQuickLinkId,
  QUICK_LINK_MAX,
  QUICK_LINKS_STORAGE_KEY,
} from './quickLinkDestinations.js'

/** @typedef {import('./quickLinkDestinations.js').QuickLinkId} QuickLinkId */

/** @type {Set<(ids: QuickLinkId[]) => void>} */
const listeners = new Set()

/** @type {QuickLinkId[] | null} */
let cachedIds = null

/** @returns {QuickLinkId[]} */
function readFromStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(QUICK_LINKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(id => isQuickLinkId(id)).slice(0, QUICK_LINK_MAX)
  } catch {
    return []
  }
}

/** @param {QuickLinkId[]} ids */
function writeToStorage(ids) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(QUICK_LINKS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota */
  }
}

/** @returns {QuickLinkId[]} */
export function getQuickLinkIds() {
  if (cachedIds === null) cachedIds = readFromStorage()
  return cachedIds
}

function notify() {
  const ids = getQuickLinkIds()
  for (const fn of listeners) fn([...ids])
}

/**
 * @param {QuickLinkId} id
 * @param {boolean} enabled
 * @returns {{ ok: true, ids: QuickLinkId[] } | { ok: false, reason: 'at_cap', ids: QuickLinkId[] }}
 */
export function setQuickLinkEnabled(id, enabled) {
  if (!isQuickLinkId(id)) {
    return { ok: false, reason: 'at_cap', ids: getQuickLinkIds() }
  }
  const current = [...getQuickLinkIds()]
  const has = current.includes(id)

  if (enabled) {
    if (has) return { ok: true, ids: current }
    if (current.length >= QUICK_LINK_MAX) {
      return { ok: false, reason: 'at_cap', ids: current }
    }
    const next = [...current, id]
    cachedIds = next
    writeToStorage(next)
    notify()
    return { ok: true, ids: next }
  }

  if (!has) return { ok: true, ids: current }
  const next = current.filter(x => x !== id)
  cachedIds = next
  writeToStorage(next)
  notify()
  return { ok: true, ids: next }
}

/** @param {(ids: QuickLinkId[]) => void} listener */
function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useQuickLinkIds() {
  return useSyncExternalStore(
    subscribe,
    () => getQuickLinkIds(),
    () => [],
  )
}

/** @param {QuickLinkId} id */
export function useQuickLinkEnabled(id) {
  const ids = useQuickLinkIds()
  return ids.includes(id)
}

/** @param {QuickLinkId} id */
export function useSetQuickLinkEnabled() {
  return useCallback((id, enabled) => setQuickLinkEnabled(id, enabled), [])
}
