/** US/CA mobile only. 10-digit national numbers become +1. */
export function toE164UsCa(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return ''
}

export function formatUsCaPhone(e164) {
  const digits = String(e164 || '').replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10) return e164 || ''
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
}
