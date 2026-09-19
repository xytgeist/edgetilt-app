/**
 * Countries the OTP profile can text without a pre-registered sender name.
 * US and Canada stay on the 10DLC number. Everyone else uses the name EdgeTilt.
 * France, Spain, India, Singapore, and Russia are left off on purpose.
 * Those carriers reject an unregistered name. Australia still sends. The name may show as Unverified until it is registered.
 */

const CA_AREA_CODES = new Set([
  '204', '226', '236', '249', '250', '263', '289', '306', '343', '354', '365', '367', '368', '382',
  '403', '416', '418', '428', '431', '437', '438', '450', '468', '474', '506', '514', '519', '548',
  '579', '581', '584', '587', '604', '613', '639', '647', '672', '683', '705', '709', '742', '753',
  '778', '780', '782', '807', '819', '825', '867', '873', '879', '902', '905', '942',
])

export const PHONE_COUNTRIES = [
  { id: 'US', name: 'United States', dial: '1', min: 10, max: 10 },
  { id: 'CA', name: 'Canada', dial: '1', min: 10, max: 10 },
  { id: 'MX', name: 'Mexico', dial: '52', min: 10, max: 10 },
  { id: 'GB', name: 'United Kingdom', dial: '44', min: 9, max: 10 },
  { id: 'IE', name: 'Ireland', dial: '353', min: 7, max: 9 },
  { id: 'DE', name: 'Germany', dial: '49', min: 7, max: 13 },
  { id: 'NL', name: 'Netherlands', dial: '31', min: 9, max: 9 },
  { id: 'BE', name: 'Belgium', dial: '32', min: 8, max: 9 },
  { id: 'IT', name: 'Italy', dial: '39', min: 8, max: 11 },
  { id: 'PT', name: 'Portugal', dial: '351', min: 9, max: 9 },
  { id: 'CH', name: 'Switzerland', dial: '41', min: 9, max: 9 },
  { id: 'AT', name: 'Austria', dial: '43', min: 7, max: 13 },
  { id: 'SE', name: 'Sweden', dial: '46', min: 7, max: 10 },
  { id: 'NO', name: 'Norway', dial: '47', min: 8, max: 8 },
  { id: 'DK', name: 'Denmark', dial: '45', min: 8, max: 8 },
  { id: 'FI', name: 'Finland', dial: '358', min: 6, max: 10 },
  { id: 'PL', name: 'Poland', dial: '48', min: 9, max: 9 },
  { id: 'CZ', name: 'Czech Republic', dial: '420', min: 9, max: 9 },
  { id: 'GR', name: 'Greece', dial: '30', min: 10, max: 10 },
  { id: 'HU', name: 'Hungary', dial: '36', min: 8, max: 9 },
  { id: 'RO', name: 'Romania', dial: '40', min: 9, max: 9 },
  { id: 'BG', name: 'Bulgaria', dial: '359', min: 8, max: 9 },
  { id: 'HR', name: 'Croatia', dial: '385', min: 8, max: 9 },
  { id: 'SK', name: 'Slovakia', dial: '421', min: 9, max: 9 },
  { id: 'SI', name: 'Slovenia', dial: '386', min: 8, max: 8 },
  { id: 'LT', name: 'Lithuania', dial: '370', min: 8, max: 8 },
  { id: 'LV', name: 'Latvia', dial: '371', min: 8, max: 8 },
  { id: 'EE', name: 'Estonia', dial: '372', min: 7, max: 8 },
  { id: 'LU', name: 'Luxembourg', dial: '352', min: 6, max: 9 },
  { id: 'IS', name: 'Iceland', dial: '354', min: 7, max: 7 },
  { id: 'MT', name: 'Malta', dial: '356', min: 8, max: 8 },
  { id: 'CY', name: 'Cyprus', dial: '357', min: 8, max: 8 },
  { id: 'UA', name: 'Ukraine', dial: '380', min: 9, max: 9 },
  { id: 'RS', name: 'Serbia', dial: '381', min: 8, max: 9 },
  { id: 'BA', name: 'Bosnia and Herzegovina', dial: '387', min: 8, max: 8 },
  { id: 'ME', name: 'Montenegro', dial: '382', min: 8, max: 8 },
  { id: 'MK', name: 'North Macedonia', dial: '389', min: 8, max: 8 },
  { id: 'AL', name: 'Albania', dial: '355', min: 8, max: 9 },
  { id: 'XK', name: 'Kosovo', dial: '383', min: 8, max: 8 },
  { id: 'MD', name: 'Moldova', dial: '373', min: 8, max: 8 },
  { id: 'NZ', name: 'New Zealand', dial: '64', min: 8, max: 10 },
  { id: 'AU', name: 'Australia', dial: '61', min: 9, max: 9 },
  { id: 'BR', name: 'Brazil', dial: '55', min: 10, max: 11 },
  { id: 'AR', name: 'Argentina', dial: '54', min: 10, max: 10 },
  { id: 'CL', name: 'Chile', dial: '56', min: 9, max: 9 },
  { id: 'CO', name: 'Colombia', dial: '57', min: 10, max: 10 },
  { id: 'PE', name: 'Peru', dial: '51', min: 8, max: 9 },
  { id: 'UY', name: 'Uruguay', dial: '598', min: 8, max: 8 },
  { id: 'EC', name: 'Ecuador', dial: '593', min: 8, max: 9 },
  { id: 'BO', name: 'Bolivia', dial: '591', min: 8, max: 8 },
  { id: 'PY', name: 'Paraguay', dial: '595', min: 9, max: 9 },
  { id: 'VE', name: 'Venezuela', dial: '58', min: 10, max: 10 },
  { id: 'PH', name: 'Philippines', dial: '63', min: 10, max: 10 },
  { id: 'MY', name: 'Malaysia', dial: '60', min: 9, max: 10 },
  { id: 'TH', name: 'Thailand', dial: '66', min: 8, max: 9 },
  { id: 'ID', name: 'Indonesia', dial: '62', min: 9, max: 12 },
  { id: 'VN', name: 'Vietnam', dial: '84', min: 9, max: 10 },
  { id: 'LK', name: 'Sri Lanka', dial: '94', min: 9, max: 9 },
  { id: 'KH', name: 'Cambodia', dial: '855', min: 8, max: 9 },
  { id: 'NP', name: 'Nepal', dial: '977', min: 8, max: 10 },
]

const BY_ID = new Map(PHONE_COUNTRIES.map((row) => [row.id, row]))

export function phoneCountryById(id) {
  return BY_ID.get(id) || BY_ID.get('US')
}

export function phoneCountryOptions() {
  const rest = PHONE_COUNTRIES.filter((row) => row.id !== 'US' && row.id !== 'CA')
  rest.sort((a, b) => a.name.localeCompare(b.name))
  return [BY_ID.get('US'), BY_ID.get('CA'), ...rest]
}

export function countryFromE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return 'US'
  if (digits.startsWith('1') && digits.length === 11) {
    return CA_AREA_CODES.has(digits.slice(1, 4)) ? 'CA' : 'US'
  }
  let best = null
  for (const row of PHONE_COUNTRIES) {
    if (row.dial === '1') continue
    if (!digits.startsWith(row.dial)) continue
    if (!best || row.dial.length > best.dial.length) best = row
  }
  return best?.id || 'US'
}

export function nationalFromE164(raw, countryId) {
  const country = phoneCountryById(countryId)
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits.startsWith(country.dial)) return ''
  return digits.slice(country.dial.length)
}

export function toE164ForCountry(raw, countryId = 'US') {
  const s = String(raw || '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  if (s.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15) return ''
    return `+${digits}`
  }
  const country = phoneCountryById(countryId)
  if ((country.id === 'US' || country.id === 'CA') && digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  const national = digits.replace(/^0+/, '')
  if (national.length < country.min || national.length > country.max) return ''
  const e164Digits = `${country.dial}${national}`
  if (e164Digits.length < 8 || e164Digits.length > 15) return ''
  return `+${e164Digits}`
}

export function formatUsCaPhone(e164) {
  const digits = String(e164 || '').replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10) return e164 || ''
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
}

export function formatPhoneDisplay(e164) {
  const id = countryFromE164(e164)
  if (id === 'US' || id === 'CA') return formatUsCaPhone(e164)
  const country = phoneCountryById(id)
  const national = nationalFromE164(e164, id)
  if (!national) return e164 || ''
  return `+${country.dial} ${national}`
}
