import {
  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,
  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,
} from '../features/offers/offerStorageKeys'

export function isIosDevice() {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent || '')
}

export function isAndroidDevice() {
  if (typeof window === 'undefined') return false
  return /Android/i.test(window.navigator.userAgent || '')
}

export function isSafariBrowser() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  const isIos = isIosDevice()
  return (
    isIos &&
    /Safari/i.test(ua) &&
    !/CriOS/i.test(ua) &&
    !/FxiOS/i.test(ua) &&
    !/EdgiOS/i.test(ua) &&
    !/OPiOS/i.test(ua)
  )
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  const standaloneViaMedia = window.matchMedia?.('(display-mode: standalone)')?.matches === true
  const standaloneViaNavigator = window.navigator.standalone === true
  return standaloneViaMedia || standaloneViaNavigator
}

export function getPwaNotifPromptStorageKey(userId) {
  return `${OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX}${userId}`
}

export function getPwaNotifEnablePendingStorageKey(userId) {
  return `${OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX}${userId}`
}

export function hasSeenPwaNotifPrompt(userId) {
  if (!userId || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(getPwaNotifPromptStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

/** Call as soon as we commit to showing the prompt (prevents duplicate dialogs). */
export function markPwaNotifPromptSeen(userId) {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getPwaNotifPromptStorageKey(userId), '1')
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

export function setPwaNotifEnablePending(userId) {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getPwaNotifEnablePendingStorageKey(userId), '1')
  } catch {
    // Ignore storage failures.
  }
}

export function consumePwaNotifEnablePending(userId) {
  if (!userId || typeof window === 'undefined') return false
  try {
    const key = getPwaNotifEnablePendingStorageKey(userId)
    const pending = window.localStorage.getItem(key) === '1'
    if (pending) window.localStorage.removeItem(key)
    return pending
  } catch {
    return false
  }
}

/** Auth events where we may show the one-time PWA notification prompt. */
export function isPwaNotifPromptAuthEvent(event) {
  return event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
}

export const LOUNGE_IOS_PWA_SETUP_SEEN_KEY = 'lounge_ios_pwa_setup_seen:v1'

export function hasSeenLoungeIosPwaSetup() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(LOUNGE_IOS_PWA_SETUP_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markLoungeIosPwaSetupSeen() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOUNGE_IOS_PWA_SETUP_SEEN_KEY, '1')
  } catch {
    /* quota / private mode */
  }
}

/** Copy for the ios-setup.png helper (Safari vs other iOS browsers). */
export function iosPwaInstallHelpMessage(isSafariBrowser) {
  return isSafariBrowser
    ? "On iPhone, push alerts only work from the Home Screen app. Don't blame me, blame Apple. 🤷‍♂️\n\nTo enable alerts:\n1) Tap Share → Add to Home Screen\n2) Open Edge from the Home Screen icon\n3) Turn on Push notifications in Settings"
    : "On iPhone, push alerts only work from the Home Screen app.\n\nTo enable alerts:\n1) Open Edge in Safari (blame Apple 🤷‍♂️)\n2) Tap Share → Add to Home Screen\n3) Open Edge from the Home Screen icon\n4) Turn on Push notifications in Settings"
}

export function iosPwaInstallRequired() {
  return isIosDevice() && !isStandalonePwa()
}

export const PWA_INSTALL_BANNER_DISMISS_KEY = 'lvslotpro-pwa-install-banner-dismiss:v1'

export function isPwaInstallBannerDismissed() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(PWA_INSTALL_BANNER_DISMISS_KEY) === '1'
  } catch {
    return true
  }
}

export function dismissPwaInstallBanner() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PWA_INSTALL_BANNER_DISMISS_KEY, '1')
  } catch {
    /* quota / private mode */
  }
}

/** Short inline steps for the install chip modal (Safari vs other iOS browsers). */
export function iosPwaInstallBannerSteps(isSafariBrowser) {
  if (isSafariBrowser) {
    return [
      { id: 'share', lead: 'Tap the', emphasis: 'Share', tail: 'button in Safari', showShareIcon: true },
      { id: 'add', lead: 'Select', emphasis: 'Add to Home Screen', tail: null, showShareIcon: false },
      { id: 'confirm', lead: 'Tap', emphasis: 'Add', tail: null, showShareIcon: false },
    ]
  }
  return [
    { id: 'safari', lead: 'Open this page in', emphasis: 'Safari', tail: null, showShareIcon: false },
    { id: 'share', lead: 'Tap the', emphasis: 'Share', tail: 'button', showShareIcon: true },
    { id: 'add', lead: 'Select', emphasis: 'Add to Home Screen', tail: null, showShareIcon: false },
    { id: 'confirm', lead: 'Tap', emphasis: 'Add', tail: null, showShareIcon: false },
  ]
}

function androidPwaInstallBannerSteps() {
  return [
    { id: 'menu', lead: 'Tap the', emphasis: '⋮ menu', tail: 'in Chrome (top-right)', showShareIcon: false },
    { id: 'install', lead: 'Tap', emphasis: 'Install app', tail: 'or Add to Home screen', showShareIcon: false },
    { id: 'confirm', lead: 'Confirm', emphasis: 'Install', tail: null, showShareIcon: false },
  ]
}

function desktopPwaInstallBannerSteps() {
  return [
    {
      id: 'install',
      lead: 'Use your browser',
      emphasis: 'Install',
      tail: 'control (address bar icon or browser menu)',
      showShareIcon: false,
    },
    {
      id: 'open',
      lead: 'Launch Edge from your',
      emphasis: 'installed app',
      tail: 'or dock shortcut',
      showShareIcon: false,
    },
  ]
}

/** Platform-aware install steps for the title-bar chip modal. */
export function pwaInstallBannerSteps(isSafariBrowserFlag = isSafariBrowser()) {
  if (isIosDevice()) return iosPwaInstallBannerSteps(isSafariBrowserFlag)
  if (isAndroidDevice()) return androidPwaInstallBannerSteps()
  return desktopPwaInstallBannerSteps()
}

/** Show install chip whenever the app is open in a browser tab, not the installed PWA. */
export function shouldShowPwaInstallBanner() {
  return !isStandalonePwa()
}
