import { isAndroidDevice, isIosDevice } from './pwaNotificationPrompt.js'

/** Opt-in only — global listener does not haptic every button. */
const TAP_TARGET_SELECTOR = '[data-tap-haptic]'

function hasVibrationApi() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Touch-first phone/tablet ... UA + touch surface, not `(pointer: coarse)` alone. */
function isMobileTapEnvironment() {
  if (typeof window === 'undefined') return false
  if (isIosDevice() || isAndroidDevice()) return true
  return (
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 0 &&
    window.matchMedia?.('(hover: none)')?.matches === true
  )
}

/** True when this device can fire tap haptics. */
export function isTapHapticSupported() {
  if (typeof document === 'undefined') return false
  if (!isMobileTapEnvironment()) return false
  return hasVibrationApi() || isIosDevice()
}

const IOS_HAPTIC_HIDDEN_STYLE =
  'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;'

function fireIosSwitchHaptic() {
  if (typeof document === 'undefined' || !document.body) return
  try {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.style.cssText = IOS_HAPTIC_HIDDEN_STYLE
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = IOS_HAPTIC_HIDDEN_STYLE
    label.appendChild(input)
    document.body.appendChild(label)
    label.click()
    document.body.removeChild(label)
  } catch {
    // no-op
  }
}

function fireAndroidVibrate() {
  if (!hasVibrationApi()) return
  try {
    navigator.vibrate(40)
  } catch {
    // no-op
  }
}

/** Light impact for standard button taps (X.com-style). Must run inside the user gesture. */
export function triggerTapHapticLight() {
  if (!isTapHapticSupported()) return

  if (isIosDevice()) {
    fireIosSwitchHaptic()
    return
  }

  fireAndroidVibrate()
}

function findTapHapticTarget(node) {
  if (!(node instanceof Element)) return null
  if (node.closest('[data-no-tap-haptic]')) return null

  const el = node.closest(TAP_TARGET_SELECTOR)
  if (!el || !(el instanceof HTMLElement)) return null
  if (el.matches('button:disabled, input:disabled, select:disabled, [aria-disabled="true"]')) return null
  return el
}

function shouldHapticForTapEvent(event) {
  if (!isMobileTapEnvironment() || !isTapHapticSupported()) return false
  // Ignore synthetic keyboard activations; touch/pointer taps have detail >= 1.
  if (event.detail === 0) return false
  return true
}

/**
 * Document-level tap haptics for buttons and other touch targets.
 * Uses trusted click (iOS switch trick needs user activation).
 * Returns a cleanup function (for tests or future teardown).
 */
export function installGlobalTapHaptic() {
  if (typeof document === 'undefined' || !isMobileTapEnvironment()) return () => {}

  const onTap = (event) => {
    if (!shouldHapticForTapEvent(event)) return
    if (!findTapHapticTarget(event.target)) return
    triggerTapHapticLight()
  }

  document.addEventListener('click', onTap, { capture: true, passive: true })

  return () => {
    document.removeEventListener('click', onTap, true)
  }
}
