import { APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'

/** Shared bottom sheet panel class for Poker Bankroll modals. */
export const POKER_SHEET_PANEL_CLASS = `${APP_MODAL_SHEET_PANEL_CLASS} !max-h-[min(96dvh,calc(100dvh-max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px))-0.75rem))] max-w-[100vw] min-w-0 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y px-4 pb-[calc(1.25rem+max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))] pt-4`

/** Extra height for cash Start / Log / Edit (Game + Currency pickers need room). */
export const POKER_SHEET_PANEL_TALL_CLASS =
  'min-h-[min(92dvh,calc(100dvh-max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px))-1.25rem))]'
