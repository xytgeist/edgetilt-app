const RETURN_CONTEXT_STORAGE_KEY = 'lvslotpro-legal-return:v2'
const REOPEN_WELCOME_STORAGE_KEY = 'lvslotpro-reopen-lounge-welcome:v1'
const REOPEN_DOCK_PANEL_STORAGE_KEY = 'lvslotpro-reopen-dock-panel:v1'

/** @typedef {'auth' | 'welcome' | 'settings' | 'acceptance' | 'public'} LegalReturnSource */

/**
 * @typedef {object} LegalReturnContext
 * @property {LegalReturnSource} source
 * @property {'signin' | 'join'} [authTab]
 */

const VALID_RETURN_SOURCES = new Set(['auth', 'welcome', 'settings', 'acceptance', 'public'])

/** @param {LegalReturnContext} context */
export function markLegalReturnContext(context) {
  if (!context?.source || !VALID_RETURN_SOURCES.has(context.source)) return
  try {
    const payload = { source: context.source }
    if (context.source === 'auth') {
      payload.authTab = context.authTab === 'signin' ? 'signin' : 'join'
    }
    window.sessionStorage.setItem(RETURN_CONTEXT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

/** @returns {LegalReturnContext | null} */
export function readLegalReturnContext() {
  try {
    const raw = window.sessionStorage.getItem(RETURN_CONTEXT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!VALID_RETURN_SOURCES.has(parsed.source)) return null
    /** @type {LegalReturnContext} */
    const ctx = { source: parsed.source }
    if (parsed.source === 'auth') {
      ctx.authTab = parsed.authTab === 'signin' ? 'signin' : 'join'
    }
    return ctx
  } catch {
    return null
  }
}

export function clearLegalReturnContext() {
  try {
    window.sessionStorage.removeItem(RETURN_CONTEXT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** @param {string} [search] @returns {LegalReturnContext | null} */
export function parseLegalReturnFromUrl(search) {
  if (typeof window === 'undefined') return null
  try {
    const qs = search ?? window.location.search
    const from = new URLSearchParams(qs).get('from')
    if (!from || !VALID_RETURN_SOURCES.has(from)) return null
    /** @type {LegalReturnContext} */
    const ctx = { source: /** @type {LegalReturnSource} */ (from) }
    if (from === 'auth') ctx.authTab = 'join'
    return ctx
  } catch {
    return null
  }
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug @param {LegalReturnContext | null} ctx */
export function shouldUseLegalReturnContext(_slug, ctx) {
  return Boolean(ctx && VALID_RETURN_SOURCES.has(ctx.source))
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug @returns {LegalReturnContext | null} */
export function resolveLegalReturnContext(slug) {
  const fromStorage = readLegalReturnContext()
  if (shouldUseLegalReturnContext(slug, fromStorage)) return fromStorage

  const fromUrl = parseLegalReturnFromUrl()
  if (!shouldUseLegalReturnContext(slug, fromUrl)) return null

  if (fromUrl.source === 'auth' && fromStorage?.source === 'auth' && fromStorage.authTab) {
    fromUrl.authTab = fromStorage.authTab
  }
  return fromUrl
}

/** @param {LegalReturnContext} ctx */
export function applyLegalReturnReopen(ctx) {
  if (!ctx?.source) return
  try {
    if (ctx.source === 'welcome') {
      window.sessionStorage.setItem(REOPEN_WELCOME_STORAGE_KEY, '1')
    } else if (ctx.source === 'settings') {
      window.sessionStorage.setItem(REOPEN_DOCK_PANEL_STORAGE_KEY, 'settings')
    }
  } catch {
    // ignore
  }
}

export function consumeReopenLoungeWelcome() {
  try {
    const flag = window.sessionStorage.getItem(REOPEN_WELCOME_STORAGE_KEY)
    window.sessionStorage.removeItem(REOPEN_WELCOME_STORAGE_KEY)
    return flag === '1'
  } catch {
    return false
  }
}

/** @returns {'settings' | null} */
export function consumeReopenLoungeDockPanel() {
  try {
    const panel = window.sessionStorage.getItem(REOPEN_DOCK_PANEL_STORAGE_KEY)
    window.sessionStorage.removeItem(REOPEN_DOCK_PANEL_STORAGE_KEY)
    return panel === 'settings' ? 'settings' : null
  } catch {
    return null
  }
}

/** @param {'signin' | 'join'} [tab] */
export function markLegalReturnToAuth(tab = 'join') {
  markLegalReturnContext({ source: 'auth', authTab: tab === 'signin' ? 'signin' : 'join' })
}

/** @returns {{ tab: 'signin' | 'join' } | null} */
export function readLegalReturnToAuth() {
  const ctx = readLegalReturnContext()
  if (!ctx || ctx.source !== 'auth') return null
  return { tab: ctx.authTab === 'signin' ? 'signin' : 'join' }
}

export function clearLegalReturnToAuth() {
  clearLegalReturnContext()
}

export function isLegalFromAuthUrl(search) {
  const ctx = parseLegalReturnFromUrl(search)
  return ctx?.source === 'auth'
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug */
export function shouldReturnLegalToAuth(slug) {
  return Boolean(resolveLegalReturnContext(slug))
}

/** @param {'terms' | 'privacy' | 'guidelines'} slug @param {LegalReturnSource} source */
export function legalDocumentPathFromSource(slug, source) {
  return `/${slug}?from=${source}`
}

/** @param {'terms' | 'privacy'} slug */
export function legalDocumentPathFromAuth(slug) {
  return legalDocumentPathFromSource(slug, 'auth')
}
