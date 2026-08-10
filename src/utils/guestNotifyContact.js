/**
 * Guest notify contact validation for poker stake + swap.
 * UI is email-only now (guest SMS retired). Phone helpers remain for legacy rows / Edge parity.
 */

export function isValidGuestNotifyEmail(raw) {
  const email = String(raw || '').trim().toLowerCase()
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizeGuestNotifyPhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  if (digits.length < 8) return null
  if (digits.startsWith('+')) return digits
  if (/^\d{10}$/.test(digits)) return `+1${digits}`
  if (/^\d{11}$/.test(digits) && digits.startsWith('1')) return `+${digits}`
  return digits.startsWith('+') ? digits : `+${digits}`
}

/**
 * Normalize optional guest notify contact. Throws when a non-empty field is invalid.
 * @param {{ email?: string, phone?: string, label?: string }} args
 * @returns {{ email?: string, phone?: string }}
 */
export function parseGuestNotifyContact({ email, phone, label = 'Contact' } = {}) {
  const emailRaw = String(email || '').trim()
  const phoneRaw = String(phone || '').trim()
  const out = {}

  if (emailRaw) {
    const normalized = emailRaw.toLowerCase()
    if (!isValidGuestNotifyEmail(normalized)) {
      throw new Error(`${label}: enter a valid email address (name@example.com).`)
    }
    out.email = normalized
  }

  if (phoneRaw) {
    const normalized = normalizeGuestNotifyPhone(phoneRaw)
    if (!normalized) {
      throw new Error(
        `${label}: enter a valid phone number (at least 10 digits; country code optional).`,
      )
    }
    out.phone = normalized
  }

  return out
}

/** Inline field errors for optional guest notify inputs (empty = ok). */
export function guestNotifyContactFieldErrors({ email, phone } = {}) {
  const emailTrim = String(email || '').trim()
  const phoneTrim = String(phone || '').trim()
  return {
    email:
      emailTrim && !isValidGuestNotifyEmail(emailTrim) ? 'Enter a valid email address.' : '',
    phone: phoneTrim && !normalizeGuestNotifyPhone(phoneTrim) ? 'Enter a valid phone number.' : '',
  }
}

export function guestNotifyContactFieldsValid({ email, phone } = {}) {
  const { email: emailErr, phone: phoneErr } = guestNotifyContactFieldErrors({ email, phone })
  return !emailErr && !phoneErr
}
