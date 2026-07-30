import { ensureGeoLocationAccess } from '../../utils/geoLocationConsent.js'
import {
  currencyFromCountryCode as currencyFromCountryCodeCore,
  currencyFromCountryName,
  currencyFromNearbyCasinoName,
  currencyFromOnlineSiteId,
  resolveCatalogCurrency,
} from '../../../scripts/lib/pokerTournamentCurrency.mjs'

export {
  currencyFromCountryName,
  currencyFromNearbyCasinoName,
  currencyFromOnlineSiteId,
  resolveCatalogCurrency,
}

/** Common poker currencies for the session Currency dropdown. */
export const POKER_CURRENCIES = [
  { id: 'USD', label: 'USD ($)' },
  { id: 'EUR', label: 'EUR (€)' },
  { id: 'GBP', label: 'GBP (£)' },
  { id: 'CAD', label: 'CAD (C$)' },
  { id: 'AUD', label: 'AUD (A$)' },
  { id: 'NZD', label: 'NZD (NZ$)' },
  { id: 'MXN', label: 'MXN (MX$)' },
  { id: 'BRL', label: 'BRL (R$)' },
  { id: 'JPY', label: 'JPY (¥)' },
  { id: 'KRW', label: 'KRW (₩)' },
  { id: 'CNY', label: 'CNY (¥)' },
  { id: 'HKD', label: 'HKD (HK$)' },
  { id: 'SGD', label: 'SGD (S$)' },
  { id: 'INR', label: 'INR (₹)' },
  { id: 'PHP', label: 'PHP (₱)' },
  { id: 'THB', label: 'THB (฿)' },
  { id: 'VND', label: 'VND (₫)' },
  { id: 'CZK', label: 'CZK (Kč)' },
  { id: 'PLN', label: 'PLN (zł)' },
  { id: 'SEK', label: 'SEK (kr)' },
  { id: 'NOK', label: 'NOK (kr)' },
  { id: 'DKK', label: 'DKK (kr)' },
  { id: 'CHF', label: 'CHF' },
  { id: 'TRY', label: 'TRY (₺)' },
  { id: 'ZAR', label: 'ZAR (R)' },
  { id: 'RUB', label: 'RUB (₽)' },
  { id: 'UAH', label: 'UAH (₴)' },
  { id: 'ILS', label: 'ILS (₪)' },
  { id: 'AED', label: 'AED (د.إ)' },
  { id: 'SAR', label: 'SAR' },
]

const CURRENCY_IDS = new Set(POKER_CURRENCIES.map((c) => c.id))

/** @param {string | null | undefined} code @returns {string} */
export function currencyFromCountryCode(code) {
  return currencyFromCountryCodeCore(code)
}

/** @param {string | null | undefined} code @returns {string} */
export function normalizePokerCurrency(code) {
  const c = String(code || '')
    .trim()
    .toUpperCase()
  return CURRENCY_IDS.has(c) ? c : 'USD'
}

/**
 * Resolve session currency from device geolocation (reverse-geocode country).
 * Falls back to USD when geo is unavailable or lookup fails.
 * @param {string | null | undefined} userId
 * @returns {Promise<string>}
 */
export async function resolveCurrencyFromGeolocation(userId) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'USD'
  try {
    const allowed = await ensureGeoLocationAccess(userId)
    if (!allowed) return 'USD'

    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 8000,
        maximumAge: 60000,
      })
    })
    const { latitude, longitude } = pos.coords
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'USD'

    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(String(latitude))}` +
      `&longitude=${encodeURIComponent(String(longitude))}` +
      `&localityLanguage=en`
    const res = await fetch(url)
    if (!res.ok) return 'USD'
    const data = await res.json()
    return currencyFromCountryCode(data?.countryCode)
  } catch {
    return 'USD'
  }
}
