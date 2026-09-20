/**
 * First-create chrome tour: hamburger pointer → open menu 3s → FAB (phone portrait)
 * → Community Guidelines. Incomplete FAB / Wheel-Edge explainer survives across sessions.
 * Returning sign-in does not start this tour.
 */

export const FIRST_RUN_CHROME_TOUR_MENU_HINT_MS = 5000
export const FIRST_RUN_CHROME_TOUR_MENU_HOLD_MS = 5000
export const FIRST_RUN_CHROME_TOUR_FAB_HINT_MS = 5000
export const FIRST_RUN_CHROME_TOUR_FAB_EXPAND_MS = 5000

export const FIRST_RUN_CHROME_TOUR_STEP = {
  MENU_HINT: 'menu-hint',
  MENU_HOLD: 'menu-hold',
  FAB_HINT: 'fab-hint',
  FAB_EXPAND: 'fab-expand',
  GUIDELINES: 'guidelines',
  DONE: 'done',
}

export const CHROME_TOUR_MENU_HOLD_EVENT = 'edge-chrome-tour-menu-hold'
export const CHROME_TOUR_MENU_HOLD_DONE_EVENT = 'edge-chrome-tour-menu-hold-done'

const PENDING_UNSCOPED_KEY = 'edge-first-run-chrome-tour:pending'
const PENDING_USER_PREFIX = 'edge-first-run-chrome-tour:'
const STEP_PREFIX = 'edge-first-run-chrome-tour-step:'

/** Survives Gmail confirm in another browser. Signup writes this onto user_metadata. */
export const FIRST_RUN_CHROME_TOUR_META_KEY = 'edge_first_run_chrome_tour'

/** Same-device email confirm can land hours later; OAuth returning users have old created_at. */
const NEW_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FIRST_SESSION_WINDOW_MS = 10 * 60 * 1000

export function userHasFirstRunChromeTourMeta(user) {
  const v = user?.user_metadata?.[FIRST_RUN_CHROME_TOUR_META_KEY]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function readStorage(storage, key) {
  if (typeof window === 'undefined') return ''
  try {
    return String(storage.getItem(key) || '')
  } catch {
    return ''
  }
}

function writeStorage(storage, key, value) {
  if (typeof window === 'undefined') return
  try {
    if (value == null || value === '') storage.removeItem(key)
    else storage.setItem(key, String(value))
  } catch {
    // ignore
  }
}

function pendingUserKey(userId) {
  return `${PENDING_USER_PREFIX}${userId}`
}

function stepKey(userId) {
  return `${STEP_PREFIX}${userId}`
}

/** Call on email/password create (before they may have a user id). */
export function markFirstRunChromeTourPending() {
  writeStorage(window.localStorage, PENDING_UNSCOPED_KEY, '1')
  writeStorage(window.sessionStorage, PENDING_UNSCOPED_KEY, '1')
}

export function isLikelyNewAuthUser(user) {
  const created = Date.parse(user?.created_at || '')
  if (!Number.isFinite(created)) return false
  const age = Date.now() - created
  if (age < 0 || age > NEW_ACCOUNT_MAX_AGE_MS) return false
  if (userHasFirstRunChromeTourMeta(user)) return true
  const last = Date.parse(user?.last_sign_in_at || '')
  if (!Number.isFinite(last)) return age < FIRST_SESSION_WINDOW_MS
  if (last - created < FIRST_SESSION_WINDOW_MS) return true
  const confirmed = Date.parse(user?.email_confirmed_at || '')
  return Number.isFinite(confirmed) && last - confirmed < FIRST_SESSION_WINDOW_MS
}

export function readFirstRunChromeTourStep(userId) {
  if (!userId) return ''
  return readStorage(window.localStorage, stepKey(userId))
}

export function writeFirstRunChromeTourStep(userId, step) {
  if (!userId || !step) return
  writeStorage(window.localStorage, stepKey(userId), step)
}

export function isFirstRunChromeTourActive(userId) {
  if (!userId) return false
  const step = readFirstRunChromeTourStep(userId)
  if (step === FIRST_RUN_CHROME_TOUR_STEP.DONE) return false
  if (readStorage(window.localStorage, pendingUserKey(userId)) === '1') return true
  if (readStorage(window.localStorage, PENDING_UNSCOPED_KEY) === '1') return true
  if (readStorage(window.sessionStorage, PENDING_UNSCOPED_KEY) === '1') return true
  return Boolean(step) && step !== FIRST_RUN_CHROME_TOUR_STEP.DONE
}

function bindPendingToUser(userId) {
  writeStorage(window.localStorage, pendingUserKey(userId), '1')
  writeStorage(window.localStorage, PENDING_UNSCOPED_KEY, '')
  writeStorage(window.sessionStorage, PENDING_UNSCOPED_KEY, '')
  if (!readFirstRunChromeTourStep(userId)) {
    writeFirstRunChromeTourStep(userId, FIRST_RUN_CHROME_TOUR_STEP.MENU_HINT)
  }
}

/**
 * Bind a first-create tour to this session if signup stamped pending, or the
 * account looks brand new and they have not already acked Community Guidelines.
 * @returns {boolean} true while the chrome tour still has steps left
 */
export function attachFirstRunChromeTour(userId, user, { welcomeAcked = false } = {}) {
  if (!userId) return false
  const step = readFirstRunChromeTourStep(userId)
  if (step === FIRST_RUN_CHROME_TOUR_STEP.DONE) return false
  if (welcomeAcked) {
    markFirstRunChromeTourDone(userId)
    return false
  }
  if (isFirstRunChromeTourActive(userId)) {
    bindPendingToUser(userId)
    return true
  }
  if (isLikelyNewAuthUser(user)) {
    bindPendingToUser(userId)
    return true
  }
  return false
}

export function markFirstRunChromeTourDone(userId) {
  if (userId) {
    writeFirstRunChromeTourStep(userId, FIRST_RUN_CHROME_TOUR_STEP.DONE)
    writeStorage(window.localStorage, pendingUserKey(userId), '')
  }
  writeStorage(window.localStorage, PENDING_UNSCOPED_KEY, '')
  writeStorage(window.sessionStorage, PENDING_UNSCOPED_KEY, '')
}

/** Drop the signup stamp so a later sign-in cannot restart the chrome tour. */
export async function clearFirstRunChromeTourMeta(supabase) {
  if (!supabase?.auth?.updateUser) return
  try {
    await supabase.auth.updateUser({ data: { [FIRST_RUN_CHROME_TOUR_META_KEY]: false } })
  } catch {
    // ignore
  }
}

export function clearFirstRunChromeTour(userId) {
  if (userId) {
    writeStorage(window.localStorage, pendingUserKey(userId), '')
    writeStorage(window.localStorage, stepKey(userId), '')
  }
  writeStorage(window.localStorage, PENDING_UNSCOPED_KEY, '')
  writeStorage(window.sessionStorage, PENDING_UNSCOPED_KEY, '')
}

export function requestChromeTourMenuHold() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHROME_TOUR_MENU_HOLD_EVENT))
}
