import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import { loungeActivityNotificationBadgeKind } from '../../utils/loungeActivityApi.js'

const COMMENT_BUBBLE_D =
  'M4.75 5.75h10.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3.25 2v-2H4.75a1.5 1.5 0 01-1.5-1.5v-5a1.5 1.5 0 011.5-1.5z'

const BOOKMARK_RIBBON_D = 'M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z'

const REPOST_ARROWS_D =
  'M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2'

function BadgeAnchor({ children, className = '' }) {
  return (
    <span
      className={`pointer-events-none absolute -bottom-1 -right-1 z-[1] flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${className}`}
      aria-hidden
    >
      {children}
    </span>
  )
}

function BadgeComment() {
  return (
    <BadgeAnchor>
      <svg className="h-[22px] w-[22px] text-zinc-200" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d={COMMENT_BUBBLE_D} fill="currentColor" />
      </svg>
    </BadgeAnchor>
  )
}

function BadgeReply() {
  return (
    <BadgeAnchor>
      <svg className="h-[22px] w-[22px] text-cyan-300" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M6.5 11.5L4 14v-3.25A4.25 4.25 0 014.75 6.5h10.5a4.25 4.25 0 014.25 4.25v.5"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 11.5H4.5l2.25-2.25"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </BadgeAnchor>
  )
}

function BadgeMention() {
  return (
    <BadgeAnchor>
      <span className="text-[20px] font-bold leading-none text-orange-400">@</span>
    </BadgeAnchor>
  )
}

function BadgeFollow() {
  return (
    <BadgeAnchor>
      <svg className="h-[28px] w-[28px] text-cyan-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <circle cx="10" cy="7.25" r="2.75" />
        <path d="M5.25 15.5v-.75c0-2.07 1.68-3.75 3.75-3.75h1.5c2.07 0 3.75 1.68 3.75 3.75v.75H5.25z" />
      </svg>
    </BadgeAnchor>
  )
}

function BadgeLike() {
  return (
    <BadgeAnchor>
      <LoungeFlameIcon className="h-[24px] w-[24px] text-zinc-200" liked readOnly={false} />
    </BadgeAnchor>
  )
}

function BadgeRepost() {
  return (
    <BadgeAnchor>
      <svg className="h-[22px] w-[22px] text-emerald-400" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d={REPOST_ARROWS_D}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </BadgeAnchor>
  )
}

/** Quote repost — white note with writing lines + cyan repost arrows (no pencil). */
function BadgeQuoteRepost() {
  return (
    <BadgeAnchor>
      <svg className="h-[24px] w-[24px]" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="4.5" y="3.25" width="11" height="13.5" rx="1.35" fill="#fafafa" />
        <path d="M6.75 6.5h6.5M6.75 9.25h6.5M6.75 12h4.5" stroke="#a1a1aa" strokeWidth="0.9" strokeLinecap="round" />
        <path
          d="M11.25 13.75h3.75l-.95-.95M15 13.75l-1.45 1.45M15 13.75l-1.45-1.45"
          stroke="#22d3ee"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </BadgeAnchor>
  )
}

function BadgeBookmark() {
  return (
    <BadgeAnchor>
      <svg className="h-[22px] w-[22px] text-lv-yellow" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d={BOOKMARK_RIBBON_D} fill="currentColor" />
      </svg>
    </BadgeAnchor>
  )
}

const BADGE_BY_KIND = {
  comment: BadgeComment,
  reply: BadgeReply,
  mention: BadgeMention,
  follow: BadgeFollow,
  like: BadgeLike,
  repost: BadgeRepost,
  quote_repost: BadgeQuoteRepost,
  bookmark: BadgeBookmark,
}

/**
 * Interaction glyph on the avatar corner for notification rows.
 * @param {{ eventType?: string, kind?: string|null }} props
 */
export default function LoungeNotificationActionBadge({ eventType, kind: kindProp }) {
  const kind = kindProp ?? loungeActivityNotificationBadgeKind(eventType)
  const Badge = kind ? BADGE_BY_KIND[kind] : null
  if (!Badge) return null
  return <Badge />
}
