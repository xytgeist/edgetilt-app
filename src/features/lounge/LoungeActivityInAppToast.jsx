import {
  IN_APP_TOAST_ACTIVITY_BODY,
  IN_APP_TOAST_ACTIVITY_CARD,
  IN_APP_TOAST_ACTIVITY_ICON,
  IN_APP_TOAST_ACTIVITY_ICON_PX,
  IN_APP_TOAST_ACTIVITY_TITLE,
  IN_APP_TOAST_DISMISS_BTN,
  IN_APP_TOAST_SHELL_POSITION,
  inAppToastStackedTopStyle,
} from '../../constants/inAppToastLayout.js'

/**
 * Foreground Lounge activity alert - shown instead of an OS push when the app tab is focused.
 */
export default function LoungeActivityInAppToast({
  toast,
  onDismiss,
  onOpen,
  /** 0-based stack index when previewing multiple toasts. */
  stackIndex = 0,
  className = '',
}) {
  if (!toast?.body) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-in-app-toast
      className={`${IN_APP_TOAST_SHELL_POSITION} z-[120] ${className}`.trim()}
      style={inAppToastStackedTopStyle(stackIndex)}
    >
      <div className={IN_APP_TOAST_ACTIVITY_CARD}>
        <button
          type="button"
          onClick={() => onOpen?.(toast)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-0.5 py-0.5 text-left touch-manipulation active:scale-[0.99]"
        >
          <img
            src={toast.icon || '/android-icon-192x192.png'}
            alt=""
            className={IN_APP_TOAST_ACTIVITY_ICON}
            width={IN_APP_TOAST_ACTIVITY_ICON_PX}
            height={IN_APP_TOAST_ACTIVITY_ICON_PX}
          />
          <span className="min-w-0 flex-1">
            <span className={IN_APP_TOAST_ACTIVITY_TITLE}>{toast.title || 'Edge Lounge'}</span>
            <span className={IN_APP_TOAST_ACTIVITY_BODY}>{toast.body}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss?.()}
          className={IN_APP_TOAST_DISMISS_BTN}
        >
          ×
        </button>
      </div>
    </div>
  )
}
