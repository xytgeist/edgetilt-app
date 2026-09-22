import { useCallback, useSyncExternalStore } from 'react'
import {
  isNavRailLayout,
  isQuickLinkId,
  QUICK_LINK_MAX,
  QUICK_LINK_MAX_IPAD,
  QUICK_LINKS_STORAGE_KEY,
  QUICK_LINKS_STORAGE_KEY_IPAD,
  IPAD_NAV_RAIL_QUERY,
  IPAD_SHELL_QUERY,
  quickLinkCap,
} from './quickLinkDestinations.js'

/** @typedef {import('./quickLinkDestinations.js').QuickLinkId} QuickLinkId */

/** @type {Set<(ids: QuickLinkId[]) => void>} */
const listeners = new Set()

/**
 * Portrait phone title-bar pins and rail pins stay on separate keys so rotate
 * (or a later account sync) cannot merge phone-cap lists into the rail list.
 * @type {{ key: string, ids: QuickLinkId[] } | null}
 */
let cached = null

function activeStorageKey() {
  return isNavRailLayout() ? QUICK_LINKS_STORAGE_KEY_IPAD : QUICK_LINKS_STORAGE_KEY
}

function activeCap() {
  return isNavRailLayout() ? QUICK_LINK_MAX_IPAD : QUICK_LINK_MAX
}

/**
 * @param {string | null} raw
 * @param {number} cap
 * @returns {QuickLinkId[]}
 */
function parseIds(raw, cap) {
  if (!raw) return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(id => isQuickLinkId(id)).slice(0, cap)
}

/** @returns {QuickLinkId[]} */
function readFromStorage() {
  if (typeof window === 'undefined') return []
  const key = activeStorageKey()
  const cap = activeCap()
  try {
    let raw = window.localStorage.getItem(key)
    if (key === QUICK_LINKS_STORAGE_KEY_IPAD && raw == null) {
      const legacy = window.localStorage.getItem(QUICK_LINKS_STORAGE_KEY)
      if (legacy) {
        const migrated = parseIds(legacy, cap)
        window.localStorage.setItem(key, JSON.stringify(migrated))
        return migrated
      }
    }
    return parseIds(raw, cap)
  } catch {
    return []
  }
}

/** @param {QuickLinkId[]} ids */
function writeToStorage(ids) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(activeStorageKey(), JSON.stringify(ids.slice(0, activeCap())))
  } catch {
    /* ignore quota */
  }
}

/** @param {QuickLinkId[]} ids */
function remember(ids) {
  cached = { key: activeStorageKey(), ids }
}

/** @returns {QuickLinkId[]} */
export function getQuickLinkIds() {
  const key = typeof window === 'undefined' ? QUICK_LINKS_STORAGE_KEY : activeStorageKey()
  if (!cached || cached.key !== key) {
    remember(readFromStorage())
  }
  return cached.ids
}

function notify() {
  const ids = getQuickLinkIds()
  for (const fn of listeners) fn([...ids])
}

function onLayoutGateChange() {
  cached = null
  notify()
}

if (typeof window !== 'undefined') {
  window.matchMedia(IPAD_SHELL_QUERY).addEventListener('change', onLayoutGateChange)
  window.matchMedia(IPAD_NAV_RAIL_QUERY).addEventListener('change', onLayoutGateChange)
  window.addEventListener('orientationchange', onLayoutGateChange)
  window.addEventListener('resize', onLayoutGateChange)
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
    if (current.length >= quickLinkCap()) {
      return { ok: false, reason: 'at_cap', ids: current }
    }
    const next = [...current, id]
    remember(next)
    writeToStorage(next)
    notify()
    return { ok: true, ids: next }
  }

  if (!has) return { ok: true, ids: current }
  const next = current.filter(x => x !== id)
  remember(next)
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
