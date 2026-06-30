/**
 * App-wide stacking (low → high). Keep Lounge viewport dock below modal/sheet layers.
 *
 * Lounge detail/profile/lightbox use their own 97–111 band inside feed chrome.
 * Dock menu click-shield uses z-200 *inside* the dock layer (still capped by this root).
 */

/** Draggable cyan menu FAB + wheel (SocialFeed viewport dock). */
export const Z_LOUNGE_DOCK_VIEWPORT = 48

/**
 * Search / notifications / settings slide panels (`LoungeDockSlidePanels` z-[99]).
 */
export const Z_LOUNGE_DOCK_ABOVE_SLIDE_PANEL = 100

/**
 * Post detail (z 98–102) and profile (z 101–102). Below detail media lightbox (103+) and quote layers.
 */
export const Z_LOUNGE_DOCK_ABOVE_DETAIL_PROFILE = 102

/** Default floor for full-screen app sheets/dialogs (bankroll, logbook, offers, lounge prompts). */
export const Z_APP_MODAL = 120

/** Centered alert above app sheets (e.g. logbook save validation). */
export const Z_APP_ALERT = 130

/** Bottom sheet overlay (above EDGE title bar z-50). */
export const APP_MODAL_OVERLAY_CLASS = `fixed inset-0 z-[${Z_APP_MODAL}] bg-black/60 backdrop-blur-sm flex items-end justify-center`

/**
 * Scrollable sheet panel - max height clears EDGE title bar + safe-area top.
 * Render outside ScrollLinkedEdgeTitleBarShell (sibling), not inside scroll content.
 */
export const APP_MODAL_SHEET_PANEL_CLASS =
  'w-full max-w-lg rounded-t-3xl bg-zinc-900 border-t border-zinc-700/50 px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] min-h-0 max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top,0px)-4.5rem))] overflow-y-auto'
