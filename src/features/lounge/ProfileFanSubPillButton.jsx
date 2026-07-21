import { Bell } from 'lucide-react'

/**
 * Neumorphic fan-sub CTA on profile (SUB + red bell knob). Scoped via data-lounge-profile-fan-sub-btn.
 *
 * @param {{
 *   disabled?: boolean,
 *   onClick?: () => void,
 *   title?: string,
 *   'aria-label'?: string,
 * }} props
 */
export default function ProfileFanSubPillButton({
  disabled = false,
  onClick,
  title,
  'aria-label': ariaLabel,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      data-lounge-profile-fan-sub-btn
      className="profile-fan-sub-pill touch-manipulation disabled:opacity-55 disabled:saturate-50"
    >
      <span className="profile-fan-sub-pill-label">sub</span>
      <span className="profile-fan-sub-pill-bell" aria-hidden>
        <Bell className="h-3.5 w-3.5 text-zinc-950" strokeWidth={2.25} fill="currentColor" />
      </span>
    </button>
  )
}
