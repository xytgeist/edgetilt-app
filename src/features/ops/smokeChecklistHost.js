/** True on localhost, Vite dev, or lvslotpro hostnames (test smoke checklist). */
export function isSmokeChecklistHostAllowed() {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'localhost' || host.includes('lvslotpro')
}
