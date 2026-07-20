import { LEGAL_CONTACT_EMAIL } from './legalPolicyVersion.js'

export { LEGAL_CONTACT_EMAIL }

export const SUPPORT_BILLING_NO_ACCESS_SUBJECT = 'Billing: no access after checkout'

/** @param {{ subject?: string, body?: string }} [options] */
export function supportMailtoHref(options = {}) {
  const subject = String(options.subject ?? 'Edge support').trim()
  const body = String(options.body ?? '').trim()
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const q = params.toString()
  return q ? `mailto:${LEGAL_CONTACT_EMAIL}?${q}` : `mailto:${LEGAL_CONTACT_EMAIL}`
}

export async function copySupportEmailToClipboard() {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(LEGAL_CONTACT_EMAIL)
    return true
  }
  return false
}
