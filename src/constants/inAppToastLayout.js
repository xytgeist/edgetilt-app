/**
 * Shared layout for top in-app notification toasts (frosted glass pill).
 */

/**
 * Hug short copy (`w-max`); long copy expands to ~3/4 viewport then wraps.
 * Prefer `w-max` over `w-fit` … fit-content shrink-wraps multi-line text into a tall skinny pill.
 */
export const IN_APP_TOAST_SHELL_WIDTH = 'w-max max-w-[min(75vw,calc(100vw-1.5rem))]'

/** Max width for short billing/access notices (legacy 20rem). */
export const IN_APP_TOAST_ACCESS_WIDTH = 'w-[min(calc(100vw-1.5rem),16rem)]'

export const IN_APP_TOAST_TOP = 'max(0.5rem, env(safe-area-inset-top))'

/** Stacked toast offset when one toast is already visible (legacy 4.25rem / 3.25rem). */
export const IN_APP_TOAST_STACKED_TOP =
  'max(3.4rem, calc(0.5rem + 2.6rem + env(safe-area-inset-top)))'

/** Vertical stack step for admin multi-toast previews (title + up to 3 body lines + gap). */
export const IN_APP_TOAST_STACK_STEP_REM = 4.5

/** @param {number} index 0-based stack index */
export function inAppToastStackedTopStyle(index = 0) {
  const i = Math.max(0, Number(index) || 0)
  if (i <= 0) return { top: IN_APP_TOAST_TOP }
  return {
    top: `calc(${IN_APP_TOAST_TOP} + ${IN_APP_TOAST_STACK_STEP_REM * i}rem)`,
  }
}

export const IN_APP_TOAST_SHELL_POSITION = `fixed left-1/2 ${IN_APP_TOAST_SHELL_WIDTH} -translate-x-1/2`

const IN_APP_TOAST_STATUS_PILL_BASE = `pointer-events-none ${IN_APP_TOAST_SHELL_POSITION} rounded-2xl border-0 px-3 py-2 text-center text-[11px] font-medium leading-snug shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150`

/** Lounge queued reply / share flash toasts. */
export const IN_APP_TOAST_STATUS_PILL_CYAN = `${IN_APP_TOAST_STATUS_PILL_BASE} in-app-toast-status-pill in-app-toast-status-pill--cyan bg-zinc-900/55 text-cyan-50`

export const IN_APP_TOAST_STATUS_PILL_EMERALD = `${IN_APP_TOAST_STATUS_PILL_BASE} in-app-toast-status-pill in-app-toast-status-pill--emerald bg-zinc-900/55 text-emerald-50`

/** Rich activity toast card (icon + title + body). */
export const IN_APP_TOAST_ACTIVITY_CARD =
  'in-app-toast-activity-card flex w-full items-center gap-2.5 rounded-2xl border-0 bg-zinc-900/55 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150'

export const IN_APP_TOAST_ACTIVITY_ICON =
  'in-app-toast-activity-icon h-8 w-8 shrink-0 rounded-full bg-zinc-800/80 object-cover ring-1 ring-white/10'

export const IN_APP_TOAST_ACTIVITY_ICON_PX = 32

export const IN_APP_TOAST_ACTIVITY_TITLE =
  'in-app-toast-activity-title block text-[12px] font-semibold leading-snug text-zinc-50'

export const IN_APP_TOAST_ACTIVITY_BODY =
  'in-app-toast-activity-body mt-0.5 block line-clamp-3 text-[11px] font-medium leading-snug text-zinc-300'

export const IN_APP_TOAST_DISMISS_BTN =
  'in-app-toast-activity-dismiss shrink-0 rounded-full px-1.5 py-0.5 text-[15px] leading-none text-zinc-400 touch-manipulation hover:bg-white/10 hover:text-zinc-100'

export const IN_APP_TOAST_ACCESS_BANNER =
  'access-notice-banner rounded-2xl border border-cyan-400/30 bg-cyan-950/55 px-2.5 py-1.5 text-center shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150'

export const IN_APP_TOAST_ACCESS_BANNER_TEXT = 'access-notice-banner-text text-[10px] font-medium leading-snug text-cyan-50'
