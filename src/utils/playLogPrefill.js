/** @typedef {{ calculatorSlug?: string, templateSlug?: string, values?: Record<string, number | string>, notes?: string | null, casinoName?: string, at?: number }} PlayLogPrefillPayload */

const STORAGE_KEY = 'lvsp:playLogPrefill:v1'
const MAX_AGE_MS = 30 * 60 * 1000

/**
 * Stash calculator → logbook field prefill (sessionStorage; consumed on Logbook mount).
 * @param {Omit<PlayLogPrefillPayload, 'at'>} payload
 */
export function stashPlayLogPrefill(payload) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        calculatorSlug: payload.calculatorSlug || null,
        templateSlug: payload.templateSlug || null,
        values: payload.values || {},
        notes: payload.notes?.trim() || null,
        casinoName: payload.casinoName || null,
        at: Date.now(),
      }),
    )
  } catch {
    /* quota / private mode */
  }
}

/** @returns {PlayLogPrefillPayload | null} */
export function consumePlayLogPrefill() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    if (Date.now() - (p.at || 0) > MAX_AGE_MS) return null
    return p
  } catch {
    return null
  }
}
