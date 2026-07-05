/**
 * Safe locale for Lounge market charts.
 * Lightweight Charts calls Date.toLocaleString with navigator.language in formatTickmark;
 * malformed browser locales throw RangeError: Incorrect locale information provided.
 */

export const MARKET_CHART_FALLBACK_LOCALE = 'en-US'

/** @param {string} locale */
function isValidIntlLocale(locale) {
  try {
    new Intl.DateTimeFormat(locale)
    return true
  } catch {
    return false
  }
}

/** BCP 47 locale for LWC localization + our formatters. */
export function resolveMarketChartLocale() {
  if (typeof navigator === 'undefined') return MARKET_CHART_FALLBACK_LOCALE

  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ]
    .map((row) => String(row || '').trim().replace(/_/g, '-'))
    .filter(Boolean)

  for (const locale of candidates) {
    if (isValidIntlLocale(locale)) return locale
    const base = locale.split('-')[0]
    if (base && base !== locale && isValidIntlLocale(base)) return base
  }

  return MARKET_CHART_FALLBACK_LOCALE
}

/** Base localization block for createChart (always set explicit locale). */
export function marketChartLocalizationBase() {
  return { locale: resolveMarketChartLocale() }
}

/**
 * @param {Date} date
 * @param {(date: Date, locale: string) => string} format
 */
export function safeChartDateFormat(date, format) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''

  for (const locale of [resolveMarketChartLocale(), MARKET_CHART_FALLBACK_LOCALE]) {
    try {
      return format(date, locale)
    } catch {
      /* try fallback locale */
    }
  }

  return ''
}
