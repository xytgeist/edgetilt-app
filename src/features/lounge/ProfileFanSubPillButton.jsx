import { Bell, BellPlus } from 'lucide-react'

import { PROFILE_SOCIAL_ACTION_ICON_CLASS } from './profileSocialActionChrome.jsx'

/**
 * Fan-sub CTA: SUB / SUBSCRIBED cap + round bell knob. Scoped via data-lounge-profile-fan-sub-btn.
 *
 * @param {{
 *   disabled?: boolean,
 *   onClick?: () => void,
 *   title?: string,
 *   'aria-label'?: string,
 *   postAlertsOn?: boolean,
 *   subscribed?: boolean,
 * }} props
 */
export default function ProfileFanSubPillButton({
  disabled = false,
  onClick,
  title,
  'aria-label': ariaLabel,
  postAlertsOn = false,
  subscribed = false,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      data-lounge-profile-fan-sub-btn
      data-fan-sub-post-alerts={!subscribed && postAlertsOn ? 'true' : 'false'}
      data-fan-sub-subscribed={subscribed ? 'true' : 'false'}
      className="profile-fan-sub-pill touch-manipulation outline-none ring-0 [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50"
    >
      <span className="profile-fan-sub-pill-label">{subscribed ? 'SUBSCRIBED' : 'SUB'}</span>
      <span className="profile-fan-sub-pill-knob" aria-hidden>
        {subscribed || postAlertsOn ? (
          <Bell
            className={`${PROFILE_SOCIAL_ACTION_ICON_CLASS} profile-fan-sub-bell-glyph`}
            strokeWidth={1.75}
            fill="currentColor"
          />
        ) : (
          <BellPlus className={PROFILE_SOCIAL_ACTION_ICON_CLASS} strokeWidth={1.75} />
        )}
      </span>
    </button>
  )
}
