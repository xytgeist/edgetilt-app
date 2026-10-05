const STORAGE_KEY = 'lvsp:theme'
const DARK_CLASS = 'dark'
const LIGHT_CLASS = 'light'

/** @returns {'dark'|'light'|'system'} */
export function getTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* storage blocked (private mode) … fall through to system */
  }
  return 'system'
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyClass(isDark) {
  const html = document.documentElement
  if (isDark) {
    html.classList.remove(LIGHT_CLASS)
    html.classList.add(DARK_CLASS)
  } else {
    html.classList.remove(DARK_CLASS)
    html.classList.add(LIGHT_CLASS)
  }
}

/** Read pref + system media query and apply the correct class to <html>. */
export function applyTheme() {
  const pref = getTheme()
  if (pref === 'dark') {
    applyClass(true)
  } else if (pref === 'light') {
    applyClass(false)
  } else {
    applyClass(systemPrefersDark())
  }
}

/** UA hint for Android-only CSS (e.g. stronger chat glass opacity). */
export function applyPlatformClass() {
  const html = document.documentElement
  if (/Android/i.test(navigator.userAgent)) {
    html.classList.add('platform-android')
  } else {
    html.classList.remove('platform-android')
  }
}

/** Persist a new theme preference and apply it immediately. */
export function setTheme(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* storage blocked … theme still applies for this session */
  }
  applyTheme()
}

let _mediaUnlisten = null

/**
 * Start listening for OS-level dark/light changes.
 * When the saved pref is 'system', the UI flips live.
 * Returns a cleanup function.
 */
export function watchSystemTheme() {
  if (_mediaUnlisten) _mediaUnlisten()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (getTheme() === 'system') applyTheme()
  }
  mq.addEventListener('change', handler)
  _mediaUnlisten = () => mq.removeEventListener('change', handler)
  return _mediaUnlisten
}
