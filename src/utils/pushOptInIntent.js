/** Per-user: user wants push on this device (separate from live PushManager / DB row). */

const INTENT_KEY_PREFIX = 'edge_push_opt_in_intent_v1:'
const REENABLE_PENDING_PREFIX = 'edge_push_reenable_pending_v1:'
const REENABLE_COOLDOWN_PREFIX = 'edge_push_reenable_cooldown_v1:'

/** Dismiss "re-enable" sheet for a week so we don't nag every launch. */
export const PUSH_REENABLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function storageGet(key) {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // private mode / quota
  }
}

function storageRemove(key) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function getPushOptInIntentStorageKey(userId) {
  return `${INTENT_KEY_PREFIX}${userId}`
}

/**
 * @returns {'on' | 'off' | 'unknown'}
 */
export function readPushOptInIntent(userId) {
  if (!userId) return 'unknown'
  const v = storageGet(getPushOptInIntentStorageKey(userId))
  if (v === '1') return 'on'
  if (v === '0') return 'off'
  return 'unknown'
}

export function writePushOptInIntent(userId, enabled) {
  if (!userId) return
  storageSet(getPushOptInIntentStorageKey(userId), enabled ? '1' : '0')
}

/**
 * First-run migration: OS already granted + no prior intent → treat as opted in.
 * (Intentional in-app off writes 'off' even when OS permission stays granted.)
 */
export function bootstrapPushOptInIntentIfNeeded(userId, { permission } = {}) {
  if (!userId) return readPushOptInIntent(userId)
  const current = readPushOptInIntent(userId)
  if (current !== 'unknown') return current
  if (permission === 'granted') {
    writePushOptInIntent(userId, true)
    return 'on'
  }
  return 'unknown'
}

export function clearPushOptInIntent(userId) {
  if (!userId) return
  storageRemove(getPushOptInIntentStorageKey(userId))
  storageRemove(`${REENABLE_PENDING_PREFIX}${userId}`)
  storageRemove(`${REENABLE_COOLDOWN_PREFIX}${userId}`)
}

export function setPushReenablePromptPending(userId) {
  if (!userId) return
  if (!canShowPushReenablePrompt(userId)) return
  storageSet(`${REENABLE_PENDING_PREFIX}${userId}`, '1')
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('edge-push-reenable-pending', { detail: { userId } }))
    } catch {
      // ignore
    }
  }
}

/** AppShell Enable on the repair sheet → Lounge hook runs a real (non-silent) subscribe. */
export function requestPushReenableFromUi() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('edge-push-reenable'))
  } catch {
    // ignore
  }
}

export function consumePushReenablePromptPending(userId) {
  if (!userId) return false
  const key = `${REENABLE_PENDING_PREFIX}${userId}`
  const pending = storageGet(key) === '1'
  if (pending) storageRemove(key)
  return pending
}

export function canShowPushReenablePrompt(userId) {
  if (!userId) return false
  const untilRaw = storageGet(`${REENABLE_COOLDOWN_PREFIX}${userId}`)
  const until = untilRaw ? Number(untilRaw) : 0
  if (!Number.isFinite(until) || until <= 0) return true
  return Date.now() >= until
}

export function markPushReenablePromptDismissed(userId) {
  if (!userId) return
  storageSet(`${REENABLE_COOLDOWN_PREFIX}${userId}`, String(Date.now() + PUSH_REENABLE_COOLDOWN_MS))
  storageRemove(`${REENABLE_PENDING_PREFIX}${userId}`)
}
