import { useSyncExternalStore } from 'react'

/** @type {number} */
let reveal = 1

/** @type {Set<() => void>} */
const listeners = new Set()

/** @param {number} next 0–1 scroll-linked title bar / dock reveal */
export function setEdgeTitleBarReveal(next) {
  const r =
    typeof next === 'number' && Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 1
  if (reveal === r) return
  reveal = r
  listeners.forEach((fn) => fn())
}

export function getEdgeTitleBarReveal() {
  return reveal
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Portaled lounge dock on slot tool screens - mirrors active `ScrollLinkedEdgeTitleBarShell`. */
export function useEdgeTitleBarReveal() {
  return useSyncExternalStore(subscribe, getEdgeTitleBarReveal, () => 1)
}
