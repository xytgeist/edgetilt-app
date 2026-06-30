import { readLoungeFeedVideoDebugEnabled } from '../../utils/loungeFeedVideoDebugPref.js'

/** @typedef {{ ts: number, tip: string, kind: string, detail: string, gen?: number }} LoungeBadgeTipDebugEvent */

/** @type {LoungeBadgeTipDebugEvent[]} */
const events = []
const MAX_EVENTS = 64

/** @type {Record<string, unknown> | null} */
let liveSnapshot = null

/** @type {Set<() => void>} */
const listeners = new Set()

let revision = 0

const emit = () => {
  revision += 1
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore
    }
  })
}

/**
 * @param {string | null | undefined} tipLabel
 * @param {string} kind
 * @param {string} detail
 * @param {{ gen?: number }} [extra]
 */
export function reportLoungeBadgeTipDebug(tipLabel, kind, detail, extra = {}) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  events.unshift({
    ts: Date.now(),
    tip: tipLabel ? String(tipLabel) : '-',
    kind: String(kind || 'event'),
    detail: String(detail || '').slice(0, 280),
    ...extra,
  })
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS
  emit()
}

/** @param {Record<string, unknown> | null} snapshot */
export function setLoungeBadgeTipDebugSnapshot(snapshot) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  liveSnapshot = snapshot
  emit()
}

export function clearLoungeBadgeTipDebugEvents() {
  if (!readLoungeFeedVideoDebugEnabled()) return
  events.length = 0
  liveSnapshot = null
  emit()
}

export function getLoungeBadgeTipDebugRevision() {
  return revision
}

/** @returns {LoungeBadgeTipDebugEvent[]} */
export function getLoungeBadgeTipDebugEvents() {
  return events
}

/** @returns {Record<string, unknown> | null} */
export function getLoungeBadgeTipDebugSnapshot() {
  return liveSnapshot
}

/** @param {() => void} listener */
export function subscribeLoungeBadgeTipDebug(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * @param {HTMLElement | null | undefined} tipTextEl
 * @param {HTMLElement | null | undefined} tipShellEl
 */
export function readLoungeBadgeTipDomSnapshot(tipTextEl, tipShellEl) {
  if (!tipTextEl) return null
  const cs = getComputedStyle(tipTextEl)
  return {
    className: tipTextEl.className,
    animationName: cs.animationName,
    animationPlayState: cs.animationPlayState,
    animationDuration: cs.animationDuration,
    animationFillMode: cs.animationFillMode,
    opacity: cs.opacity,
    transform: cs.transform,
    shellLeft: tipShellEl?.style?.left ?? '',
    shellTop: tipShellEl?.style?.top ?? '',
    shellVisibility: tipShellEl?.style?.visibility ?? '',
  }
}
