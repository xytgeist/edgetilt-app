/**
 * Lounge dock FAB - electric blue accent (brand `#06cefc` family).
 */

/** `false` = flat (active state uses thicker border instead). */
export const LOUNGE_DOCK_FAB_GLOW_ENABLED = false

/** @typedef {{ bgIdle: string, bgLit: string, borderIdle: string, borderLit: string, ringLit: string, shadowIdle: string, shadowLit: string, textIdle: string, textLit: string }} LoungeDockItemGlow */

/** @param {LoungeDockItemGlow} glow */
export function loungeDockItemGlowForDisplay(glow) {
  if (LOUNGE_DOCK_FAB_GLOW_ENABLED) return glow
  return { ...glow, shadowIdle: 'shadow-none', shadowLit: 'shadow-none', ringLit: '' }
}

/** @param {boolean} menuOpen */
export function loungeDockFabCenterShadowClass(menuOpen) {
  if (!LOUNGE_DOCK_FAB_GLOW_ENABLED) return 'shadow-none'
  return menuOpen ? LOUNGE_DOCK_FAB_CENTER_GLOW.shadowOpen : LOUNGE_DOCK_FAB_CENTER_GLOW.shadow
}

/** Following filter ON - between idle (1px) and page-active (3px). */
export const LOUNGE_DOCK_BORDER_FILTER_ON =
  'border-2 border-solid border-[#06cefc]/88'

/** Default wheel chrome (feed / idle icons). */
export const NEON_BLUE_ITEM_GLOW_IDLE = {
  bgIdle: 'bg-[#001028]/92',
  bgLit: 'bg-[#001840]/96',
  borderIdle: 'border border-[#06cefc]/70',
  borderLit: 'border-2 border-[#94f3fd]/90',
  ringLit: 'ring-1 ring-[#06cefc]/28',
  shadowIdle: 'shadow-[0_0_8px_rgba(6,206,252,0.22),0_0_14px_rgba(6,206,252,0.1)]',
  shadowLit: 'shadow-[0_0_10px_rgba(6,206,252,0.28),0_0_18px_rgba(6,206,252,0.12)]',
  textIdle: 'text-white',
  textLit: 'text-white',
}

/** Current page / active dock target (search open, following on, composer open, etc.). */
export const NEON_BLUE_ITEM_GLOW_PAGE_ACTIVE = {
  bgIdle: 'bg-[#002038]/94',
  bgLit: 'bg-[#003858]/98',
  borderIdle: 'border border-[#06cefc]/70',
  borderLit: 'border-[3px] border-solid border-[#06cefc]',
  ringLit: 'ring-1 ring-[#06cefc]/40',
  shadowIdle: 'shadow-[0_0_10px_rgba(6,206,252,0.3),0_0_18px_rgba(6,206,252,0.13)]',
  shadowLit: 'shadow-[0_0_12px_rgba(6,206,252,0.36),0_0_22px_rgba(6,206,252,0.15)]',
  textIdle: 'text-white',
  textLit: 'text-white',
}

/** @type {Record<string, LoungeDockItemGlow>} */
export const LOUNGE_DOCK_ITEM_GLOW_BY_ID = {
  compose: NEON_BLUE_ITEM_GLOW_IDLE,
  home: NEON_BLUE_ITEM_GLOW_IDLE,
  search: NEON_BLUE_ITEM_GLOW_IDLE,
  following: NEON_BLUE_ITEM_GLOW_IDLE,
  notifications: NEON_BLUE_ITEM_GLOW_IDLE,
  chat: NEON_BLUE_ITEM_GLOW_IDLE,
  settings: NEON_BLUE_ITEM_GLOW_IDLE,
}

export function loungeDockItemGlow(itemId) {
  return LOUNGE_DOCK_ITEM_GLOW_BY_ID[itemId] ?? NEON_BLUE_ITEM_GLOW_IDLE
}

/** Center menu (+) button - solid electric blue fill, black icon. */
export const LOUNGE_DOCK_FAB_CENTER_GLOW = {
  bg: 'bg-[#06cefc]',
  bgOpen: 'bg-[#51dff9]',
  text: 'text-black',
  shadow: 'shadow-[0_0_12px_rgba(6,206,252,0.35),0_0_20px_rgba(6,206,252,0.14)]',
  shadowOpen: 'shadow-[0_0_14px_rgba(6,206,252,0.42),0_0_24px_rgba(6,206,252,0.18)]',
}
