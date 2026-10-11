/**
 * Fantasy Watch pins for a game hub … remembered per device.
 * Roles: `mine` (blue Watch) · `enemy` (rose opponent).
 * Legacy string-id arrays migrate to `{ id, role: 'mine' }`.
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'edgetilt:gameHubFantasyPins'
const CHANGE_EVENT = 'edgetilt:game-hub-fantasy-pins'

const ROLES = new Set(['mine', 'enemy'])

function normalizePin(raw) {
  if (raw == null) return null
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = String(raw).trim()
    return id ? { id, role: 'mine', source: 'manual' } : null
  }
  if (typeof raw === 'object') {
    const id = String(raw.id || raw.sleeper_id || '').trim()
    if (!id) return null
    const role = ROLES.has(raw.role) ? raw.role : 'mine'
    const source = raw.source === 'league' ? 'league' : 'manual'
    return { id, role, source }
  }
  return null
}

function readPins() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out = []
    const seen = new Set()
    for (const item of parsed) {
      const pin = normalizePin(item)
      if (!pin || seen.has(pin.id)) continue
      seen.add(pin.id)
      out.push(pin)
    }
    return out
  } catch {
    return []
  }
}

function writePins(pins) {
  const next = []
  const seen = new Set()
  for (const item of pins || []) {
    const pin = normalizePin(item)
    if (!pin || seen.has(pin.id)) continue
    seen.add(pin.id)
    next.push(pin)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
  }
  return next
}

/** @returns {{ id: string, role: 'mine'|'enemy', source: 'manual'|'league' }[]} */
export function getFantasyPins() {
  return readPins()
}

/** Flat sleeper ids (any role) … for Set membership checks. */
export function getFantasyPinIds(pins = readPins()) {
  return (pins || []).map((p) => String(p.id))
}

export function getFantasyPinRole(sleeperId, pins = readPins()) {
  const id = String(sleeperId || '').trim()
  if (!id) return null
  const hit = (pins || []).find((p) => p.id === id)
  return hit?.role || null
}

export function isFantasyPinned(sleeperId, pins = readPins()) {
  return Boolean(getFantasyPinRole(sleeperId, pins))
}

/**
 * Manual Watch toggle … mine on/off.
 * If the pin was an enemy (or league) pin, first tap clears it.
 */
export function toggleFantasyPin(sleeperId) {
  const id = String(sleeperId || '').trim()
  if (!id) return readPins()
  const cur = readPins()
  const existing = cur.find((p) => p.id === id)
  if (existing) return writePins(cur.filter((p) => p.id !== id))
  return writePins([{ id, role: 'mine', source: 'manual' }, ...cur])
}

/**
 * Apply primary-league mine/enemy starters that appear in this game's fantasy board.
 * Replaces prior `source: 'league'` pins; keeps manual Watch pins.
 */
export function applyFantasyPinsFromLeague({ mine = [], enemy = [] }, presentIds = []) {
  const present = new Set(
    [...(presentIds || [])].map((x) => String(x || '').trim()).filter(Boolean),
  )
  const cur = readPins()
  const keptManual = cur.filter((p) => p.source !== 'league')
  const manualIds = new Set(keptManual.map((p) => p.id))
  const league = []
  const leagueIds = new Set()

  for (const raw of mine || []) {
    const id = String(raw || '').trim()
    if (!id || (present.size && !present.has(id))) continue
    if (manualIds.has(id) || leagueIds.has(id)) continue
    leagueIds.add(id)
    league.push({ id, role: 'mine', source: 'league' })
  }
  for (const raw of enemy || []) {
    const id = String(raw || '').trim()
    if (!id || (present.size && !present.has(id))) continue
    if (manualIds.has(id) || leagueIds.has(id)) continue
    leagueIds.add(id)
    league.push({ id, role: 'enemy', source: 'league' })
  }

  return writePins([...league, ...keptManual])
}

export function useFantasyPins() {
  const [pins, setPins] = useState(readPins)
  useEffect(() => {
    const sync = () => setPins(readPins())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return pins
}
