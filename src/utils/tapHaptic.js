import { isIosDevice } from './pwaNotificationPrompt.js'

const TAP_TARGET_SELECTOR = [
  'button:not(:disabled)',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  'input[type="button"]:not(:disabled)',
  'input[type="submit"]:not(:disabled)',
  'input[type="reset"]:not(:disabled)',
  'input[type="checkbox"]:not(:disabled)',
  'input[type="radio"]:not(:disabled)',
  'select:not(:disabled)',
  'summary',
  'label[for]',
  '[data-tap-haptic]',
  '.touch-manipulation',
].join(',')

const TEXT_INPUT_TYPES = new Set([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'color',
  'file',
  'hidden',
])

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

function hasCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true
}

function hasVibrationApi() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** True when this device can fire tap haptics (touch-first environments). */
export function isTapHapticSupported() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!hasCoarsePointer()) return false
  return hasVibrationApi() || isIosDevice()
}

function fireIosSwitchHaptic() {
  if (typeof document === 'undefined' || !document.body) return
  try {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.body.appendChild(label)
    label.click()
    document.body.removeChild(label)
  } catch {
    // no-op
  }
}

/** Light impact for standard button taps (X.com-style). Must run inside the user gesture. */
export function triggerTapHapticLight() {
  if (!isTapHapticSupported() || prefersReducedMotion()) return

  if (hasVibrationApi()) {
    try {
      const ms = /Android/i.test(navigator.userAgent || '') ? 15 : 10
      navigator.vibrate(ms)
      return
    } catch {
      // fall through to iOS switch fallback
    }
  }

  if (isIosDevice()) {
    fireIosSwitchHaptic()
  }
}

function isTextEntryElement(el) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (el.isContentEditable) return true
  if (tag !== 'INPUT') return false
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  if (type === 'range') return true
  return TEXT_INPUT_TYPES.has(type)
}

function findTapHapticTarget(node) {
  if (!(node instanceof Element)) return null
  if (node.closest('[data-no-tap-haptic]')) return null

  const el = node.closest(TAP_TARGET_SELECTOR)
  if (!el || !(el instanceof HTMLElement)) return null
  if (isTextEntryElement(el)) return null
  if (el.matches('button:disabled, input:disabled, select:disabled, [aria-disabled="true"]')) return null
  return el
}

function shouldHapticForPointerEvent(event) {
  if (!event.isPrimary || event.button !== 0) return false
  if (prefersReducedMotion() || !isTapHapticSupported()) return false
  if (event.pointerType === 'touch') return true
  return hasCoarsePointer()
}

/**
 * Document-level tap haptics for buttons and other touch targets.
 * Returns a cleanup function (for tests or future teardown).
 */
export function installGlobalTapHaptic() {
  if (typeof document === 'undefined' || !isTapHapticSupported()) return () => {}

  const onPointerDown = (event) => {
    if (!shouldHapticForPointerEvent(event)) return
    if (!findTapHapticTarget(event.target)) return
    triggerTapHapticLight()
  }

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
  return () => document.removeEventListener('pointerdown', onPointerDown, true)
}
