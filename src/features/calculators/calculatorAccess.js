import { resolveRequiresSlotsEdge } from '../billing/contentAccessGates.js'

/** @typedef {'phoenix'|'buffalo-link'|'buffalo-diamond'|'stackup'|'mhb'|'wof-collectors-edition'} CalculatorKey */

export const CALCULATOR_KEYS = /** @type {CalculatorKey[]} */ ([
  'phoenix',
  'buffalo-link',
  'buffalo-diamond',
  'stackup',
  'mhb',
  'wof-collectors-edition',
])

/** Static calculator chrome - served from `public/calculators/` (not guide R2 assets). */
export const CALCULATOR_ICON_SRC = {
  phoenix: '/calculators/phoenix-link.webp',
  'buffalo-link': '/calculators/buffalo-link.webp',
  'buffalo-diamond': '/calculators/buffalo-diamond.webp',
  stackup: '/calculators/stack-up-pays.webp',
  mhb: '/calculators/mhb.webp',
  'wof-collectors-edition': '/calculators/wof-collectors-edition.webp',
}

/**
 * Calculators available to free (logged-in) users without Slots Edge.
 * Toggle access here: add a key to offer free, remove to require subscribe.
 * Admin UI overrides (when migration applied) take precedence.
 */
export const FREE_CALCULATOR_KEYS = new Set(
  /** @type {CalculatorKey[]} */ (['stackup', 'phoenix', 'buffalo-diamond']),
)

function codeDefaultCalculatorRequiresSlotsEdge(key) {
  if (!key || !CALCULATOR_KEYS.includes(/** @type {CalculatorKey} */ (key))) return true
  return !FREE_CALCULATOR_KEYS.has(/** @type {CalculatorKey} */ (key))
}

/** @param {string | null | undefined} key @param {Map<string, boolean> | null | undefined} [gatesMap] */
export function calculatorRequiresSlotsEdge(key, gatesMap = null) {
  const calcKey = String(key || '').trim().toLowerCase()
  return resolveRequiresSlotsEdge(
    'calculator',
    calcKey,
    gatesMap,
    codeDefaultCalculatorRequiresSlotsEdge(calcKey),
  )
}

/** @param {string | null | undefined} key @param {{ isStaff?: boolean, hasSlotsEdge?: boolean, gatesMap?: Map<string, boolean> | null }} [access] */
export function canOpenCalculator(key, { isStaff = false, hasSlotsEdge = false, gatesMap = null } = {}) {
  if (isStaff || hasSlotsEdge) return true
  return !calculatorRequiresSlotsEdge(key, gatesMap)
}

/** @param {Map<string, boolean> | null | undefined} [gatesMap] */
export function calculatorsTabFullyGated(gatesMap = null) {
  return CALCULATOR_KEYS.every((key) => calculatorRequiresSlotsEdge(key, gatesMap))
}

/** @param {string | null | undefined} key @param {{ browseMode?: string, isStaff?: boolean, hasSlotsEdge?: boolean, gatesMap?: Map<string, boolean> | null }} [access] */
export function showCalculatorLock(
  key,
  { browseMode = 'member', isStaff = false, hasSlotsEdge = false, gatesMap = null } = {},
) {
  if (browseMode !== 'member' || isStaff || hasSlotsEdge) return false
  return calculatorRequiresSlotsEdge(key, gatesMap)
}

export const CALCULATOR_CATALOG_ENTRIES = [
  {
    key: 'phoenix',
    title: 'Phoenix Link',
    subtitle: 'Must-hit counter bonus analyzer',
    iconSrc: CALCULATOR_ICON_SRC.phoenix,
    iconAlt: 'Phoenix',
    iconWrapClassName: 'h-16 w-16 flex-shrink-0 rounded-2xl object-cover object-center',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-black to-orange-950 p-6 text-left ring-1 ring-orange-950/40 transition-all hover:from-black hover:to-orange-900 hover:ring-orange-900/45 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-orange-400',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-orange-200/70 sm:line-clamp-2',
  },
  {
    key: 'buffalo-link',
    title: 'Buffalo Link',
    subtitle: 'Midpoint-based counter analyzer',
    iconSrc: CALCULATOR_ICON_SRC['buffalo-link'],
    iconAlt: 'Buffalo',
    iconWrapClassName:
      'relative flex h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600/90 to-orange-800 shadow-inner ring-1 ring-orange-900/45',
    iconImgClassName: 'h-full w-full object-cover object-center',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-700 via-orange-700 to-red-800 p-6 text-left ring-1 ring-orange-800/45 transition-all hover:from-amber-600 hover:via-orange-600 hover:to-red-700 hover:ring-orange-700/50 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
  {
    key: 'buffalo-diamond',
    title: 'Buffalo Diamond',
    subtitle: '4× / 3× / 2× free-games meter analyzer',
    iconSrc: CALCULATOR_ICON_SRC['buffalo-diamond'],
    iconAlt: 'Buffalo Diamond',
    iconWrapClassName:
      'relative flex h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/90 via-violet-600/90 to-emerald-700/90 shadow-inner ring-1 ring-violet-900/45',
    iconImgClassName: 'h-full w-full object-cover object-center',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-700 via-violet-700 via-sky-700 to-emerald-800 p-6 text-left ring-1 ring-violet-800/45 transition-all hover:from-amber-600 hover:via-violet-600 hover:via-sky-600 hover:to-emerald-700 hover:ring-violet-700/50 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
  {
    key: 'stackup',
    title: 'Stack Up Pays',
    subtitle: 'Ascending Fortunes • 5-meter analyzer',
    subtitleTitle: 'Ascending Fortunes • 5-meter analyzer',
    iconSrc: CALCULATOR_ICON_SRC.stackup,
    iconAlt: 'Stack Up Pays',
    iconWrapClassName: 'h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg',
    buttonClassName:
      'w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]',
    titleClassName: 'line-clamp-2 font-semibold text-2xl leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
  {
    key: 'wof-collectors-edition',
    title: 'Wheel of Fortune 4D CE',
    subtitle: 'Column credit prize · 45× weighted threshold',
    iconSrc: CALCULATOR_ICON_SRC['wof-collectors-edition'],
    iconAlt: 'Wheel of Fortune',
    iconWrapClassName:
      'relative flex h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#145a2f] via-[#228e4e] to-[#0d3d20] shadow-inner ring-1 ring-[#145a2f]/45',
    iconImgClassName: 'h-full w-full object-cover object-center',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-[#145a2f] via-[#228e4e] to-[#0d3d20] p-6 text-left ring-1 ring-[#145a2f]/45 transition-all hover:from-[#1a7340] hover:via-[#2dab5f] hover:to-[#145a2f] hover:ring-[#228e4e]/50 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
  {
    key: 'mhb',
    title: 'Must Hit By Jackpot',
    subtitle: 'Progressive must-hit analyzer',
    iconSrc: CALCULATOR_ICON_SRC.mhb,
    iconAlt: '',
    iconWrapClassName: 'h-16 w-16 shrink-0 rounded-2xl object-cover shadow-lg',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-cyan-700 p-6 text-left shadow-lg shadow-black/30 transition-all hover:from-indigo-600 hover:via-violet-600 hover:to-cyan-600 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
]

/** Calculators hub list - A–Z by display title. */
export const CALCULATOR_CATALOG = CALCULATOR_CATALOG_ENTRIES.slice().sort((a, b) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
)
