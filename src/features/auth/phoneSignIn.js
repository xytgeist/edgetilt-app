import { toE164ForCountry } from './phoneCountries.js'

export {
  countryFromE164,
  formatPhoneDisplay,
  formatUsCaPhone,
  nationalFromE164,
  phoneCountryById,
  phoneCountryOptions,
  toE164ForCountry,
} from './phoneCountries.js'

/** US/CA mobile. 10-digit national numbers become +1. */
export function toE164UsCa(raw) {
  return toE164ForCountry(raw, 'US')
}
