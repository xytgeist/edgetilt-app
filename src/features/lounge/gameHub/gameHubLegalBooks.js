/**
 * Legal-books mode for the game hub. Most books in the odds feed are licensed in only some states (and the
 * offshore ones in none), so with it on, best lines shop only books licensed in the viewer's state and
 * `{state}` link templates fill with that state.
 * State = viewer pick, else IP geo (`/api/geo`). On by default only for Nevada (the original Nevada-books
 * mode); everyone else opts in from the hub "..." menu. Choices are stored per device.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { bookKey } from './sportsbookLinks.js'

export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

const states = (list) => new Set(list.split(' '))

/**
 * States where each feed book runs a licensed online/mobile app. Hand-kept from operator state lists;
 * recheck when a state launches or a book exits. Offshore books (Bovada, BetOnline, MyBookie, BetUS,
 * LowVig, BookMaker), Pinnacle, and sweepstakes apps (Fliff, Rebet) hold no US sportsbook license, so
 * they never appear here.
 */
const BOOK_STATES = {
  draftkings: states('AZ CO CT DC IL IN IA KS KY LA ME MD MA MI MO NH NJ NY NC OH OR PA TN VT VA WV WY'),
  fanduel: states('AZ CO CT DC IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VT VA WV WY'),
  betmgm: states('AZ CO DC IL IN IA KS KY LA MD MA MI MO NV NJ NY NC OH PA TN VA WV WY'),
  caesars: states('AZ CO DC IL IN IA KS KY LA ME MD MA MI MO NV NJ NY NC OH PA TN VA WV WY'),
  fanatics: states('AZ CO CT DC IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VT VA WV WY'),
  betrivers: states('AZ DE IL IN IA LA MD MI NJ NY OH PA VA WV'),
  espnbet: states('AZ CO IL IN IA KS KY LA MD MA MI NJ NY NC OH PA TN VA WV'),
  hardrock: states('AZ FL IL IN IA MI NJ OH TN VA'),
  bet365: states('AZ CO IL IN IA KS KY LA MO NJ NC OH PA TN VA'),
  ballybet: states('AZ IN IA NY OH VA'),
  circasports: states('CO IL IA KY NV WY'),
}
const BOOK_ALIASES = { williamhill: 'caesars', williamhillus: 'caesars', hardrockbet: 'hardrock', circa: 'circasports' }

function licensedStates(name) {
  const key = bookKey(name)
  return BOOK_STATES[BOOK_ALIASES[key] || key] || null
}

/** True when `name` is licensed in `state` (two-letter code). */
export function isLegalBook(name, state) {
  const code = String(state || '').toUpperCase()
  return Boolean(code && licensedStates(name)?.has(code))
}

/** Any feed book licensed in `state`? False for CA / TX / etc. */
export function stateHasLegalBooks(state) {
  const code = String(state || '').toUpperCase()
  return Object.values(BOOK_STATES).some((set) => set.has(code))
}

export function stateName(state) {
  return US_STATES[String(state || '').toUpperCase()] || ''
}

/** Fill a `{state}` link template (BetMGM, Caesars); without a state it stays unusable. */
export function fillBookLinkState(link, state) {
  const s = String(link || '')
  const code = String(state || '').toLowerCase()
  return /^[a-z]{2}$/.test(code) ? s.replace(/\{state\}/gi, code) : s
}

const PREFS_KEY = 'edgeLegalBooks:v1'
const LEGACY_NEVADA_KEY = 'edgeNevadaBooks:v1'
const GEO_KEY = 'edgeGeoRegion:v1'
const GEO_TTL_MS = 12 * 60 * 60 * 1000
const CHANGE_EVENT = 'edge-legal-books-change'

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

/** `{ on: 'on'|'off'|null, state: 'NJ'|null }` … null fields follow geo. Carries over the old Nevada toggle. */
function readPrefs() {
  const row = readJson(PREFS_KEY)
  if (row && typeof row === 'object') {
    return {
      on: row.on === 'on' || row.on === 'off' ? row.on : null,
      state: US_STATES[row.state] ? row.state : null,
    }
  }
  const legacy = readJson(LEGACY_NEVADA_KEY)
  if (legacy === 'on') return { on: 'on', state: 'NV' }
  if (legacy === 'off') return { on: 'off', state: null }
  return { on: null, state: null }
}

let snapshot = null
function computeSnapshot() {
  const prefs = readPrefs()
  const geo = readGeoRegion()
  const geoState = geo && US_STATES[geo] ? geo : null
  const state = prefs.state || geoState
  const on = prefs.on ? prefs.on === 'on' : state === 'NV'
  return {
    /** Two-letter state to filter by, or null when the mode is off / no state is known. */
    legalState: on && state ? state : null,
    on,
    state,
    geoState,
    statePicked: Boolean(prefs.state),
  }
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

function savePrefs(next) {
  try {
    if (!next.on && !next.state) localStorage.removeItem(PREFS_KEY)
    else writeJson(PREFS_KEY, next)
    localStorage.removeItem(LEGACY_NEVADA_KEY)
  } catch {
    /* ignore */
  }
  notify()
}

/** Toggle legal-only. Matching the geo default clears the override so travel re-detects. */
export function setLegalBooksOn(on) {
  const prefs = readPrefs()
  const geo = readGeoRegion()
  const defaultOn = (prefs.state || (geo && US_STATES[geo] ? geo : null)) === 'NV'
  savePrefs({ ...prefs, on: on === defaultOn ? null : on ? 'on' : 'off' })
}

/** Pick a state (two-letter code) and turn the mode on, or null to follow IP geo. */
export function setLegalBooksState(state) {
  const code = US_STATES[String(state || '').toUpperCase()] ? String(state).toUpperCase() : null
  const prefs = readPrefs()
  savePrefs({ on: code ? 'on' : prefs.on, state: code })
}

/** `{ legalState, on, state, geoState, statePicked }` … re-renders on changes or when geo lands. */
export function useLegalBooks() {
  useEffect(() => {
    ensureGeo()
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
