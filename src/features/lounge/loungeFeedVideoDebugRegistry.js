/** @typedef {{ ts: number, clientId: string | null, kind: string, detail: string }} LoungeVideoDebugEvent */

/** @type {Map<string, () => Record<string, unknown>>} */
const tileGetters = new Map()
/** @type {LoungeVideoDebugEvent[]} */
const events = []
const MAX_EVENTS = 48

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
 * @param {string} clientId
 * @param {() => Record<string, unknown>} getSnapshot
 * @returns {() => void}
 */
export function registerLoungeVideoDebugTile(clientId, getSnapshot) {
  if (!clientId) return () => {}
  tileGetters.set(clientId, getSnapshot)
  emit()
  return () => {
    tileGetters.delete(clientId)
    emit()
  }
}

/**
 * @param {string | null | undefined} clientId
 * @param {string} kind
 * @param {string} detail
 */
export function reportLoungeVideoDebugEvent(clientId, kind, detail) {
  events.unshift({
    ts: Date.now(),
    clientId: clientId ? String(clientId) : null,
    kind: String(kind || 'event'),
    detail: String(detail || '').slice(0, 280),
  })
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS
  emit()
}

export function clearLoungeVideoDebugEvents() {
  events.length = 0
  emit()
}

export function getLoungeVideoDebugRevision() {
  return revision
}

/** @returns {LoungeVideoDebugEvent[]} */
export function getLoungeVideoDebugEvents() {
  return events
}

/** @returns {Record<string, Record<string, unknown>>} */
export function getLoungeVideoDebugTileSnapshots() {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {}
  for (const [id, getSnapshot] of tileGetters) {
    try {
      out[id] = getSnapshot() ?? {}
    } catch (err) {
      out[id] = { snapshotError: err instanceof Error ? err.message : String(err) }
    }
  }
  return out
}

/** @param {() => void} listener */
export function subscribeLoungeVideoDebug(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const VIDEO_ERROR_LABEL = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

/** @param {HTMLVideoElement | null | undefined} video */
export function readLoungeVideoElementDebug(video) {
  if (!video) {
    return {
      present: false,
      paused: null,
      muted: null,
      readyState: null,
      networkState: null,
      currentTime: null,
      errorCode: null,
      errorLabel: null,
    }
  }
  const code = video.error?.code ?? null
  return {
    present: true,
    paused: video.paused,
    muted: video.muted,
    readyState: video.readyState,
    networkState: video.networkState,
    currentTime: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 10) / 10 : null,
    errorCode: code,
    errorLabel: code != null ? VIDEO_ERROR_LABEL[code] ?? `code_${code}` : null,
  }
}
