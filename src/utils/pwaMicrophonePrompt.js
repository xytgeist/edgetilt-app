import { isAndroidDevice, isStandalonePwa } from './pwaNotificationPrompt.js'

/**
 * Mic helpers for chat calling. Do **not** prompt on sign-in / first open...
 * OS mic permission should only be requested when a call is made or received
 * (`getUserMedia` / LiveKit on the call path). Kept for call-side priming if needed.
 */
export const PWA_MIC_PROMPT_KEY_PREFIX = 'edge_pwa_mic_prompt_v2:'

export function getPwaMicPromptStorageKey(userId) {
  return `${PWA_MIC_PROMPT_KEY_PREFIX}${userId}`
}

/** Installed Android PWA only (positive platform gate... never `!iOS`). */
export function isInstalledPwaMicPromptEligible() {
  return isStandalonePwa() && isAndroidDevice()
}

export function hasSeenPwaMicPrompt(userId) {
  if (!userId || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(getPwaMicPromptStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markPwaMicPromptSeen(userId) {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getPwaMicPromptStorageKey(userId), '1')
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

/** Auth events where we may show the one-time PWA mic prompt. */
export function isPwaMicPromptAuthEvent(event) {
  return event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
}

/**
 * Best-effort Permissions API read. iOS often lacks `microphone` here → `unknown`.
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unknown'>}
 */
export async function queryMicrophonePermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: /** @type {PermissionName} */ ('microphone') })
    const state = String(status?.state || '')
    if (state === 'granted' || state === 'denied' || state === 'prompt') return state
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Trigger the OS mic prompt from a user gesture, then release the track immediately.
 * Does not leave the mic hot between calls.
 */
export async function requestPwaMicrophoneAccess() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone is not available in this browser.')
  }
  // Unlock Web Audio for later in-app ring/ringback on the same gesture path.
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      const ctx = new AC()
      void ctx.resume().catch(() => {})
      void ctx.close().catch(() => {})
    }
  } catch {
    /* ignore */
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  try {
    for (const track of stream.getTracks()) {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
