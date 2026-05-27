import { resolveRequiresSlotsEdge } from '../billing/contentAccessGates.js'

/** @typedef {'phoenix'|'buffalo'|'stackup'|'mhb'} CalculatorKey */

export const CALCULATOR_KEYS = /** @type {CalculatorKey[]} */ (['phoenix', 'buffalo', 'stackup', 'mhb'])

/**
 * Calculators available to free (logged-in) users without Slots Edge.
 * Toggle access here: add a key to offer free, remove to require subscribe.
 * Admin UI overrides (when migration applied) take precedence.
 */
export const FREE_CALCULATOR_KEYS = new Set(
  /** @type {CalculatorKey[]} */ (['stackup', 'phoenix']),
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

export const CALCULATOR_CATALOG = [
  {
    key: 'phoenix',
    title: 'Phoenix Link EV Calc',
    subtitle: 'Must-hit counter bonus analyzer',
    iconSrc: '/guides/phoenix-link/phoenix-link-calculator-icon.webp',
    iconAlt: 'Phoenix',
    iconWrapClassName: 'h-16 w-16 flex-shrink-0 rounded-xl',
    buttonClassName:
      'w-full bg-gray-900 hover:bg-gray-800 transition-colors p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation active:scale-[0.99]',
    titleClassName: 'line-clamp-2 font-semibold text-2xl leading-snug text-orange-400',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-gray-400 sm:line-clamp-2',
  },
  {
    key: 'buffalo',
    title: 'Buffalo Link EV Calc',
    subtitle: 'Midpoint-based counter analyzer',
    iconSrc: '/guides/buffalo-link/buffalo-link-calculator-icon.webp',
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
    key: 'stackup',
    title: 'Stack Up Pays',
    subtitle: 'Ascending Fortunes • 5-meter analyzer',
    subtitleTitle: 'Ascending Fortunes • 5-meter analyzer',
    iconSrc: '/guides/stack-up-pays/stack-up-pays-calculator-icon.webp',
    iconAlt: 'Stack Up Pays',
    iconWrapClassName: 'h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg',
    buttonClassName:
      'w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]',
    titleClassName: 'line-clamp-2 font-semibold text-2xl leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
  {
    key: 'mhb',
    title: 'Must Hit By Jackpot',
    subtitle: 'Progressive must-hit analyzer',
    iconSrc: '/guides/mhb/mhb-calculator-icon.webp',
    iconAlt: '',
    iconWrapClassName: 'h-16 w-16 shrink-0 rounded-2xl object-cover shadow-lg',
    buttonClassName:
      'mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-cyan-700 p-6 text-left shadow-lg shadow-black/30 transition-all hover:from-indigo-600 hover:via-violet-600 hover:to-cyan-600 active:scale-[0.985] sm:gap-5 sm:p-8',
    titleClassName: 'line-clamp-2 text-2xl font-semibold leading-snug text-[#fff]',
    subtitleClassName: 'mt-0.5 line-clamp-1 text-base leading-snug text-[rgba(255,255,255,0.82)] sm:line-clamp-2',
  },
]
