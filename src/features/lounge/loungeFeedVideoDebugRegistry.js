import { readLoungeFeedVideoDebugEnabled } from '../../utils/loungeFeedVideoDebugPref.js'

/** @typedef {{ ts: number, clientId: string | null, kind: string, detail: string }} LoungeVideoDebugEvent */

/**
 * Survives HUD event-ring eviction — included in debug JSON export so upload prep can be diagnosed
 * after scrolling the feed (attach spam otherwise pushes out encode · lines).
 *
 * @typedef {{
 *   ts: number,
 *   outcome: string,
 *   sourceMb: number,
 *   outputMb: number,
 *   durSec: number | null,
 *   streamVideoUid: string | null,
 *   detail: string,
 * }} LoungeVideoPrepOutcomeRecord
 */

/** @type {Map<string, () => Record<string, unknown>>} */
const tileGetters = new Map()
/** @type {LoungeVideoDebugEvent[]} */
const events = []
/** @type {LoungeVideoPrepOutcomeRecord[]} */
const prepOutcomes = []
const MAX_EVENTS = 96
const MAX_PREP_OUTCOMES = 12
/** Throttle tus percent spam so encode lines are not evicted from the HUD ring. */
let lastUploadDebugLine = ''
let lastUploadDebugPct = -1

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

/** Composer upload / encode progress (Settings → Video debug HUD). */
export function maybeReportLoungeVideoUploadDebug(kind, detail) {
  if (!readLoungeFeedVideoDebugEnabled()) return
  const line = String(detail || '')
  const k = String(kind || 'upload')
  if (k === 'upload' && line.includes('Uploading to Ether')) {
    const m = /(\d+)%/.exec(line)
    const pct = m ? Number(m[1]) : NaN
    if (Number.isFinite(pct) && pct < 100 && pct % 10 !== 0) return
    if (Number.isFinite(pct) && pct === lastUploadDebugPct && line === lastUploadDebugLine) return
    lastUploadDebugPct = Number.isFinite(pct) ? pct : lastUploadDebugPct
    lastUploadDebugLine = line
  } else if (k === 'encode') {
    lastUploadDebugLine = ''
    lastUploadDebugPct = -1
  }
  reportLoungeVideoDebugEvent(null, k, line)
}

/**
 * Record a definitive composer video prep outcome (fast-path, wasm, pass-through, wasm-failed).
 *
 * @param {Omit<LoungeVideoPrepOutcomeRecord, 'ts' | 'streamVideoUid'> & { streamVideoUid?: string | null }} record
 */
export function recordLoungeVideoPrepOutcome(record) {
  const sourceMb = Number(record.sourceMb) || 0
  const outputMb = Number(record.outputMb) || 0
  const durSec = record.durSec == null ? null : Number(record.durSec)
  const outcome = String(record.outcome || 'unknown').trim() || 'unknown'
  const detail = String(record.detail || '').trim().slice(0, 240)
  const streamVideoUid = String(record.streamVideoUid || '').trim() || null
  /** @type {LoungeVideoPrepOutcomeRecord} */
  const row = {
    ts: Date.now(),
    outcome,
    sourceMb,
    outputMb,
    durSec: Number.isFinite(durSec) ? durSec : null,
    streamVideoUid,
    detail,
  }
  prepOutcomes.unshift(row)
  if (prepOutcomes.length > MAX_PREP_OUTCOMES) prepOutcomes.length = MAX_PREP_OUTCOMES
  reportLoungeVideoDebugEvent(
    null,
    'prep',
    `${outcome} src=${sourceMb}MB out=${outputMb}MB${streamVideoUid ? ` uid=${streamVideoUid.slice(0, 8)}` : ''}${detail ? ` · ${detail}` : ''}`,
  )
  emit()
}

/** Attach Stream uid to the most recent prep row (after tus mint). */
export function attachLoungeVideoPrepStreamUid(streamVideoUid, outputFile) {
  const uid = String(streamVideoUid || '').trim()
  if (!uid || prepOutcomes.length === 0) return
  const head = prepOutcomes[0]
  if (head.streamVideoUid) return
  head.streamVideoUid = uid
  if (outputFile instanceof File && outputFile.size > 0) {
    head.outputMb = Math.round(outputFile.size / (1024 * 1024))
  }
  emit()
}

/** @returns {LoungeVideoPrepOutcomeRecord[]} */
export function getLoungeVideoPrepOutcomes() {
  return prepOutcomes
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
