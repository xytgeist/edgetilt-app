import { BellPlus } from 'lucide-react'

import { PROFILE_SOCIAL_ACTION_ICON_CLASS } from './profileSocialActionChrome.jsx'

/**
 * Fan-sub CTA: outlined SUB capsule + filled orange bell+ knob (profile header). Scoped via data-lounge-profile-fan-sub-btn.
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
      className="profile-fan-sub-pill touch-manipulation outline-none ring-0 [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50"
    >
      <span className="profile-fan-sub-pill-label">SUB</span>
      <span className="profile-fan-sub-pill-knob" aria-hidden>
        <BellPlus className={PROFILE_SOCIAL_ACTION_ICON_CLASS} strokeWidth={1.75} />
      </span>
    </button>
  )
}
