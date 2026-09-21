import { createPortal } from 'react-dom'
import { APP_MODAL_OVERLAY_CLASS } from '../constants/appZIndex.js'

/**
 * Full-viewport app sheet/dialog backdrop. Portals to `document.body` so overlays
 * escape keep-alive landscape pane covers (`z-index: 40`) and nested traps
 * (title-bar hamburger `z-[55]`, hub pin `z-[2]`, etc.).
 */
export default function AppModalOverlay({ children, className = '', onClick, ...rest }) {
  return createPortal(
    <div
      className={className ? `${APP_MODAL_OVERLAY_CLASS} ${className}` : APP_MODAL_OVERLAY_CLASS}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  )
}
