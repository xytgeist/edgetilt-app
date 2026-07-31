/** Bookmarkable admin ops dashboard (desktop-first). */
export const EDGE_MONITOR_PATH = '/monitor'

/** @typedef {'overview' | 'health' | 'people' | 'product'} EdgeMonitorSectionId */

/** @type {{ id: EdgeMonitorSectionId, label: string, hint: string }[]} */
export const EDGE_MONITOR_SECTIONS = [
  { id: 'overview', label: 'Overview', hint: 'KPIs · alerts · pulse' },
  { id: 'health', label: 'Health', hint: 'Jobs · billing drift · vendors' },
  { id: 'people', label: 'People', hint: 'Signups · roster · revenue' },
  { id: 'product', label: 'Product', hint: 'Lounge · chat · tools' },
]

/** @type {EdgeMonitorSectionId} */
export const EDGE_MONITOR_DEFAULT_SECTION = 'overview'

/** @param {string} [pathname] */
export function parseMonitorPathname(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/'
  return path === EDGE_MONITOR_PATH
}

/** @param {string} [search] @returns {EdgeMonitorSectionId} */
export function parseMonitorSection(search = '') {
  const raw = String(search || '')
    .replace(/^\?/, '')
    .split('&')
    .map((part) => part.split('='))
    .find(([key]) => key === 'section')?.[1]

  const section = decodeURIComponent(String(raw || ''))
    .trim()
    .toLowerCase()

  if (EDGE_MONITOR_SECTIONS.some((item) => item.id === section)) {
    return /** @type {EdgeMonitorSectionId} */ (section)
  }
  return EDGE_MONITOR_DEFAULT_SECTION
}

/**
 * @param {EdgeMonitorSectionId | string} section
 * @param {{ layout?: 'mobile' | 'desktop' }} [opts]
 */
export function buildMonitorSectionHref(section, { layout = 'mobile' } = {}) {
  const id = String(section || EDGE_MONITOR_DEFAULT_SECTION).trim().toLowerCase()
  const isDefault = !id || id === EDGE_MONITOR_DEFAULT_SECTION

  if (layout === 'desktop') {
    return isDefault ? EDGE_MONITOR_PATH : `${EDGE_MONITOR_PATH}?section=${encodeURIComponent(id)}`
  }

  const params = new URLSearchParams()
  params.set('tab', 'monitor')
  if (!isDefault) params.set('section', id)
  return `/?${params.toString()}`
}
