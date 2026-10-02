/**
 * Selected (pinned) Fantasy-tab players for a game hub … remembered per device.
 * Pinned players sort to the top of the Fantasy board; play toasts for them use a blue cue.
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'edgetilt:gameHubFantasyPins'
const CHANGE_EVENT = 'edgetilt:game-hub-fantasy-pins'

function readPins() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => String(id || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function writePins(ids) {
  const next = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
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

export function getFantasyPins() {
  return readPins()
}

export function isFantasyPinned(sleeperId) {
  const id = String(sleeperId || '').trim()
  if (!id) return false
  return readPins().includes(id)
}

export function toggleFantasyPin(sleeperId) {
  const id = String(sleeperId || '').trim()
  if (!id) return readPins()
  const cur = readPins()
  if (cur.includes(id)) return writePins(cur.filter((x) => x !== id))
  // Most-recently selected first so multi-pin order matches tap order.
  return writePins([id, ...cur])
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
