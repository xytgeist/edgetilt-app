import LoungeBadgeHoverTip from './LoungeBadgeHoverTip.jsx'

/**
 * Staff icons from `profiles.role` (Lounge; public profile read).
 *
 * @param {{ role?: string | null, size?: 'feed' | 'detail' | 'modal' | 'embed' }} props
 */
function CrownIcon({ className }) {  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <g transform="translate(12,12) scale(1.45, 1.5) translate(-12,-12)">
        <path d="M6 17L5 9l3 2L12 4l4 7l3-2L18 17H6z" />
      </g>
    </svg>
  )
}

function ShieldIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  )
}

/** @type {Record<'feed' | 'detail' | 'modal' | 'embed', { wrap: string, crown: string, shield: string, modInner: string }>} */
const STAFF_BADGE_LAYOUT = {
  feed: {
    wrap: 'translate-y-[1.5px]',
    crown: 'translate-y-0',
    shield: '-translate-y-[2px]',
    modInner: 'translate-y-0',
  },
  detail: {
    wrap: 'translate-y-[0.5px]',
    crown: 'translate-y-[1.5px]',
    shield: 'translate-y-0',
    modInner: 'translate-y-0.5',
  },
  modal: {
    wrap: 'translate-y-[2px]',
    crown: 'translate-y-[1px]',
    shield: 'translate-y-0',
    modInner: 'translate-y-0',
  },
  embed: {
    wrap: 'inline-flex items-center',
    crown: 'inline-flex items-center',
    shield: 'inline-flex items-center',
    modInner: 'inline-flex items-center',
  },
}

export default function LoungeStaffRoleBadge({ role, size = 'feed' }) {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()

  if (r !== 'admin' && r !== 'moderator') return null

  const layout = STAFF_BADGE_LAYOUT[size] ?? STAFF_BADGE_LAYOUT.feed
  const shieldClass =
    size === 'modal'
      ? 'h-5 w-5'
      : size === 'embed'
        ? 'h-[14px] w-[14px]'
        : size === 'detail'
          ? 'h-4 w-4'
          : 'h-[16px] w-[16px]'

  const crownClass =
    size === 'modal'
      ? 'h-5 w-5'
      : size === 'embed'
        ? 'h-[14px] w-[14px]'
        : size === 'detail'
          ? 'h-4 w-4'
          : 'h-[18px] w-[18px]'

  const adminIconRowClass = size === 'embed' ? 'inline-flex items-center gap-x-0.5' : 'inline-flex items-baseline gap-x-0.5'

  if (r === 'admin') {
    return (
      <LoungeBadgeHoverTip tip="Admin" tone="admin" className={`inline-flex items-center ${layout.wrap}`}>
        <span className={adminIconRowClass} role="img" aria-label="Admin">
          <span className={`inline-flex ${layout.crown}`}>
            <CrownIcon className={`${crownClass} text-amber-400`} />
          </span>
          <span className={`inline-flex ${layout.shield}`}>
            <ShieldIcon className={`${shieldClass} text-blue-500`} />
          </span>
        </span>
      </LoungeBadgeHoverTip>
    )
  }

  return (
    <LoungeBadgeHoverTip tip="Mod" tone="mod" className={layout.wrap}>
      <span
        className={`inline-flex items-center justify-center ${layout.modInner}`}
        role="img"
        aria-label="Mod"
      >
        <ShieldIcon className={`${shieldClass} text-blue-500`} />
      </span>
    </LoungeBadgeHoverTip>
  )
}