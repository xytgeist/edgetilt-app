/**
 * Dismissed Start/Sit swaps, per league and lineup period (NFL: the week, NBA daily plans: the ET date).
 * Local to the device. A dismissed swap stays hidden for that period only; a different swap still shows.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'edge.fantasy.dismissed.v1'
let cache = null
let version = 0
const listeners = new Set()

function read() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    cache = {}
  }
  return cache
}

function write(next) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: keep it in memory */
  }
  version += 1
  for (const fn of listeners) fn()
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Re-render when anything is dismissed or restored (pass the value into memo deps). */
export function useFantasyDismissVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}

export function moveDismissKey(move) {
  return `${move?.start?.row?.sleeper_id || ''}>${move?.bench?.row?.sleeper_id || 'open'}`
}

/** NFL lineups are set for the week; NBA daily plans change every day. */
export function dismissPeriod(detail, today = false) {
  if (today) return `d${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}`
  return `w${detail?.week ?? ''}`
}

function keysFor(leagueId, period) {
  const entry = read()[String(leagueId || '')]
  return entry && entry.period === period && Array.isArray(entry.moves) ? entry.moves : []
}

export function dismissMove(leagueId, period, key) {
  const id = String(leagueId || '')
  if (!id || !key) return
  const moves = keysFor(id, period)
  if (moves.includes(key)) return
  write({ ...read(), [id]: { period, moves: [...moves, key] } })
}

export function restoreMoves(leagueId, period) {
  const id = String(leagueId || '')
  if (!keysFor(id, period).length) return
  const next = { ...read() }
  delete next[id]
  write(next)
}

/** The plan without dismissed swaps; `gain` becomes the visible swaps' total, `dismissed` holds the hidden ones. */
export function withoutDismissed(plan, leagueId, period) {
  if (!plan?.moves?.length) return plan
  const hidden = new Set(keysFor(leagueId, period))
  if (!hidden.size) return plan
  const moves = []
  const dismissed = []
  for (const m of plan.moves) (hidden.has(moveDismissKey(m)) ? dismissed : moves).push(m)
  if (!dismissed.length) return plan
  return { ...plan, moves, dismissed, gain: moves.reduce((acc, m) => acc + m.gain, 0) }
}
