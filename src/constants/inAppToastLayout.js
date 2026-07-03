/**
 * Shared layout for top in-app notification toasts (~20% narrower/smaller than legacy sizing).
 */

/** Max width cap for wide activity/status toasts (legacy 42rem). */
export const IN_APP_TOAST_SHELL_WIDTH = 'w-[min(calc(100vw-1.5rem),33.6rem)]'

/** Max width for short billing/access notices (legacy 20rem). */
export const IN_APP_TOAST_ACCESS_WIDTH = 'w-[min(calc(100vw-1.5rem),16rem)]'

export const IN_APP_TOAST_TOP = 'max(0.5rem, env(safe-area-inset-top))'

/** Stacked toast offset when one toast is already visible (legacy 4.25rem / 3.25rem). */
export const IN_APP_TOAST_STACKED_TOP =
  'max(3.4rem, calc(0.5rem + 2.6rem + env(safe-area-inset-top)))'

export const IN_APP_TOAST_SHELL_POSITION = `fixed left-1/2 ${IN_APP_TOAST_SHELL_WIDTH} -translate-x-1/2`

const IN_APP_TOAST_STATUS_PILL_BASE = `pointer-events-none ${IN_APP_TOAST_SHELL_POSITION} rounded-lg border px-2.5 py-2 text-center text-[11px] font-medium leading-snug shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md`

/** Lounge queued reply / share flash toasts. */
export const IN_APP_TOAST_STATUS_PILL_CYAN = `${IN_APP_TOAST_STATUS_PILL_BASE} in-app-toast-status-pill in-app-toast-status-pill--cyan border-cyan-500/50 bg-zinc-950/92 text-cyan-100`

export const IN_APP_TOAST_STATUS_PILL_EMERALD = `${IN_APP_TOAST_STATUS_PILL_BASE} in-app-toast-status-pill in-app-toast-status-pill--emerald border-emerald-500/45 bg-zinc-950/92 text-emerald-100`

/** Rich activity toast card (icon + title + body). */
export const IN_APP_TOAST_ACTIVITY_CARD =
  'in-app-toast-activity-card flex w-full items-start gap-2 rounded-lg border border-cyan-500/50 bg-zinc-950/95 px-2 py-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'

export const IN_APP_TOAST_ACTIVITY_ICON =
  'in-app-toast-activity-icon mt-0.5 h-[1.8125rem] w-[1.8125rem] shrink-0 rounded-md bg-zinc-900 object-cover'

export const IN_APP_TOAST_ACTIVITY_ICON_PX = 29

export const IN_APP_TOAST_ACTIVITY_TITLE =
  'in-app-toast-activity-title block text-[11px] font-semibold leading-snug text-cyan-100'

export const IN_APP_TOAST_ACTIVITY_BODY =
  'in-app-toast-activity-body mt-0.5 block text-[11px] font-medium leading-snug text-zinc-100'

export const IN_APP_TOAST_DISMISS_BTN =
  'in-app-toast-activity-dismiss shrink-0 rounded-md px-1.5 py-0.5 text-[14px] leading-none text-zinc-400 touch-manipulation hover:bg-zinc-800/80 hover:text-zinc-200'

export const IN_APP_TOAST_ACCESS_BANNER =
  'access-notice-banner rounded-lg border border-cyan-500/45 bg-cyan-950/95 px-2.5 py-1.5 text-center shadow-[0_6px_22px_rgba(0,0,0,0.35)] backdrop-blur-md'

export const IN_APP_TOAST_ACCESS_BANNER_TEXT = 'access-notice-banner-text text-[10px] font-medium leading-snug text-cyan-100'
