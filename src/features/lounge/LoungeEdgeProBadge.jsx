import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

/**
 * Clean X/Twitter-style verified checkmark badge icon.
 * Features an authentic 8-point scalloped verified starburst with a crisp white checkmark.
 */
function VerifiedCheckmarkIcon({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="1.2 1.2 19.6 19.6"
      aria-hidden="true"
      className={className}
    >
      <g>
        <path
          fill="currentColor"
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.136 2.136 5.464-5.464 1.293 1.302-6.757 6.756z"
        />
      </g>
    </svg>
  )
}

/** @type {Record<'feed' | 'detail' | 'modal' | 'embed', { cls: string, yClass?: string }>} */
const BADGE_SIZE = {
  feed: { cls: 'h-[15px] w-[15px]', yClass: 'translate-y-[2px]' },
  detail: { cls: 'h-[17px] w-[17px]', yClass: 'translate-y-[2.5px]' },
  modal: { cls: 'h-[18px] w-[18px]', yClass: 'translate-y-[1.5px]' },
  embed: { cls: 'h-[13px] w-[13px]', yClass: 'translate-y-[1px]' },
}

/**
 * Standard X-style verified subscriber checkmark badge shown on author headers and profiles.
 *
 * @param {{ isEdgePro?: boolean | null, size?: 'feed' | 'detail' | 'modal' | 'embed' }} props
 */
export default function LoungeEdgeProBadge({ isEdgePro, size = 'feed' }) {
  if (isEdgePro !== true) return null
  const s = BADGE_SIZE[size] ?? BADGE_SIZE.feed
  const tipClass = `inline-flex items-center ${s.yClass ?? 'translate-y-[2px]'}`

  return (
    <LoungeBadgeHoverTip tip="Verified Subscriber" tone="pro" className={tipClass}>
      <span
        data-edge-pro-badge=""
        className="inline-flex items-center text-teal-400 hover:brightness-110 transition-[filter]"
        role="img"
        aria-label="Verified Subscriber"
      >
        <VerifiedCheckmarkIcon className={`${s.cls} shrink-0`} />
      </span>
    </LoungeBadgeHoverTip>
  )
}
