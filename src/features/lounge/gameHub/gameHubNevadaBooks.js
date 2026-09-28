/**
 * Nevada-books mode for the game hub. Most sportsbooks in the odds feed can't take bets from Nevada, so for
 * Nevada viewers best lines shop only books licensed there and `{state}` link templates fill with "nv".
 * On = IP geo says Nevada (`/api/geo`), unless the viewer flipped the hub "..." toggle (stored override).
 */
import { useEffect, useSyncExternalStore } from 'react'
import { bookKey } from './sportsbookLinks.js'

/** Feed books with a licensed Nevada app (Circa via OddsPapi, pregame). Westgate / Station / South Point aren't fed. */
const NEVADA_BOOK_KEYS = new Set(['betmgm', 'caesars', 'williamhill', 'williamhillus', 'circasports', 'circa'])

const OVERRIDE_KEY = 'edgeNevadaBooks:v1'
const GEO_KEY = 'edgeGeoRegion:v1'
const GEO_TTL_MS = 12 * 60 * 60 * 1000
const CHANGE_EVENT = 'edge-nevada-books-change'

export function isNevadaBook(name) {
  return NEVADA_BOOK_KEYS.has(bookKey(name))
}

/** Fill a `{state}` link template (BetMGM, Caesars) for Nevada; other states stay unusable. */
export function fillBookLinkState(link, nevada) {
  const s = String(link || '')
  return nevada ? s.replace(/\{state\}/gi, 'nv') : s
}

function readJson(key) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function readGeoRegion() {
  const row = readJson(GEO_KEY)
  return row && Date.now() - Number(row.at) < GEO_TTL_MS ? row.region || null : undefined
}

function readOverride() {
  const v = readJson(OVERRIDE_KEY)
  return v === 'on' || v === 'off' ? v : null
}

let snapshot = null
function computeSnapshot() {
  const override = readOverride()
  const geoNevada = readGeoRegion() === 'NV'
  return { nevada: override ? override === 'on' : geoNevada, geoNevada, override }
}
function getSnapshot() {
  if (!snapshot) snapshot = computeSnapshot()
  return snapshot
}
function notify() {
  snapshot = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}
function subscribe(cb) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}

let geoInflight = null
function ensureGeo() {
  if (geoInflight || readGeoRegion() !== undefined || typeof fetch === 'undefined') return
  geoInflight = fetch('/api/geo', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const region = data?.country === 'US' && data?.region ? String(data.region) : null
      writeJson(GEO_KEY, { region, at: Date.now() })
      notify()
    })
    .catch(() => {})
    .finally(() => {
      geoInflight = null
    })
}

/** Viewer toggle; setting it back to what geo says clears the override so travel re-detects. */
export function setNevadaBooks(on) {
  const geoNevada = readGeoRegion() === 'NV'
  try {
    if (on === geoNevada) localStorage.removeItem(OVERRIDE_KEY)
    else writeJson(OVERRIDE_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  notify()
}

/** `{ nevada, geoNevada, override }` … re-renders on toggle or when geo lands. */
export function useNevadaBooks() {
  useEffect(() => {
    ensureGeo()
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
