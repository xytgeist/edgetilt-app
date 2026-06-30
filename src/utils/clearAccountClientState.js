import { clearPendingLegalAcceptance } from '../features/legal/legalAcceptance.js'
import {
  clearLoungeComposerDraft,
  clearLoungeWelcomeAck,
  clearLoungeSlotsMenuHintAck,
  clearProfileGateAck,
  LOUNGE_PROFILE_CACHE_KEY,
} from '../features/lounge/loungeStorage.js'
import {
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,
  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,
} from '../features/offers/offerStorageKeys.js'
import { LOUNGE_DOCK_MENU_LAYOUT_INTRO_KEY } from './loungeDockFabPosition.js'
import {
  getPwaNotifEnablePendingStorageKey,
  getPwaNotifPromptStorageKey,
  LOUNGE_IOS_PWA_SETUP_SEEN_KEY,
} from './pwaNotificationPrompt.js'

const OFFERS_USER_KEY_PREFIXES = [
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,
  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,
]

function removeLocalStorageKey(key) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function removeSessionStorageKey(key) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Wipe per-user and first-run browser state after account deletion so a re-signup on the
 * same device gets profile gate, welcome modal, dock menu intro, legal nudge, etc. again.
 */
export function clearAccountClientState(userId) {
  if (typeof window === 'undefined') return

  if (userId) {
    clearProfileGateAck(userId)
    clearLoungeWelcomeAck(userId)
    clearLoungeSlotsMenuHintAck(userId)
    for (const prefix of OFFERS_USER_KEY_PREFIXES) {
      removeLocalStorageKey(`${prefix}${userId}`)
    }
    removeLocalStorageKey(getPwaNotifPromptStorageKey(userId))
    removeLocalStorageKey(getPwaNotifEnablePendingStorageKey(userId))
  }

  removeLocalStorageKey(LOUNGE_DOCK_MENU_LAYOUT_INTRO_KEY)
  removeLocalStorageKey(LOUNGE_IOS_PWA_SETUP_SEEN_KEY)
  clearPendingLegalAcceptance()

  removeSessionStorageKey(LOUNGE_PROFILE_CACHE_KEY)
  clearLoungeComposerDraft()
}
