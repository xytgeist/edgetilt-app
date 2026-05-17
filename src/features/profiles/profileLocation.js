/** Select value when the member types a location not in {@link PROFILE_LOCATION_PRESETS}. */
export const PROFILE_LOCATION_CUSTOM = '__custom__'

/** Quick-pick cities for profile location (stored value = label). */
export const PROFILE_LOCATION_PRESETS = [
  'Las Vegas, NV',
  'Henderson, NV',
  'North Las Vegas, NV',
  'Boulder City, NV',
  'Laughlin, NV',
  'Reno, NV',
  'Atlantic City, NJ',
  'Biloxi, MS',
  'Phoenix, AZ',
  'Los Angeles, CA',
]

export const PROFILE_LOCATION_MAX_LEN = 80

const PRESET_SET = new Set(PROFILE_LOCATION_PRESETS)

/**
 * @param {string | null | undefined} raw
 * @returns {{ selectValue: string, customText: string, display: string }}
 */
export function profileLocationDraftFromStored(raw) {
  const display = normalizeProfileLocation(raw)
  if (!display) return { selectValue: '', customText: '', display: '' }
  if (PRESET_SET.has(display)) return { selectValue: display, customText: '', display }
  return { selectValue: PROFILE_LOCATION_CUSTOM, customText: display, display }
}

/**
 * @param {string} selectValue — preset label, `PROFILE_LOCATION_CUSTOM`, or empty
 * @param {string} customText — used when select is custom
 */
export function profileLocationStoredFromDraft(selectValue, customText) {
  const sel = String(selectValue || '').trim()
  if (!sel) return ''
  if (sel === PROFILE_LOCATION_CUSTOM) {
    return normalizeProfileLocation(customText)
  }
  if (PRESET_SET.has(sel)) return sel
  return normalizeProfileLocation(sel)
}

/** @param {string | null | undefined} raw */
export function normalizeProfileLocation(raw) {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, PROFILE_LOCATION_MAX_LEN)
}
