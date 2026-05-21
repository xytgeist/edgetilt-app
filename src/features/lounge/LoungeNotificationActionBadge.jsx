import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import { loungeActivityNotificationBadgeKind } from '../../utils/loungeActivityApi.js'

const COMMENT_BUBBLE_D =
  'M4.75 5.75h10.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3.25 2v-2H4.75a1.5 1.5 0 01-1.5-1.5v-5a1.5 1.5 0 011.5-1.5z'

const BOOKMARK_RIBBON_D = 'M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z'

const REPOST_ARROWS_D =
  'M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2'

/** Fixed right-rail slot — every notification action glyph uses the same box + 24px art. */
const RAIL_CLASS =
  'pointer-events-none flex h-10 w-10 shrink-0 items-center justify-center self-center'
const GLYPH_CLASS = 'h-6 w-6'

function IconRail({ children }) {
  return (
    <span className={RAIL_CLASS} aria-hidden>
      {children}
    </span>
  )
}

function IconComment() {
  return (
    <IconRail>
      <svg className={`${GLYPH_CLASS} text-zinc-200`} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d={COMMENT_BUBBLE_D} fill="currentColor" />
      </svg>
    </IconRail>
  )
}

function IconReply() {
  return (
    <IconRail>
      <svg className={`${GLYPH_CLASS} text-cyan-300`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
    </IconRail>
  )
}

function IconMention() {
  return (
    <IconRail>
      <span className="text-[24px] font-bold leading-none text-orange-400">@</span>
    </IconRail>
  )
}

function IconFollow() {
  return (
    <IconRail>
      <svg className={`${GLYPH_CLASS} text-cyan-400`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <circle cx="10" cy="7.25" r="2.75" />
        <path d="M5.25 15.5v-.75c0-2.07 1.68-3.75 3.75-3.75h1.5c2.07 0 3.75 1.68 3.75 3.75v.75H5.25z" />
      </svg>
    </IconRail>
  )
}

function IconLike() {
  return (
    <IconRail>
      <LoungeFlameIcon className={`${GLYPH_CLASS} text-zinc-200`} liked readOnly={false} />
    </IconRail>
  )
}

function IconRepost() {
  return (
    <IconRail>
      <svg className={`${GLYPH_CLASS} text-emerald-400`} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d={REPOST_ARROWS_D}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconRail>
  )
}

/** Quote repost — white note with writing lines + cyan repost arrows (no pencil). */
function IconQuoteRepost() {
  return (
    <IconRail>
      <svg className={GLYPH_CLASS} viewBox="0 0 20 20" fill="none" aria-hidden>
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
    </IconRail>
  )
}

function IconBookmark() {
  return (
    <IconRail>
      <svg className={`${GLYPH_CLASS} text-lv-yellow`} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d={BOOKMARK_RIBBON_D} fill="currentColor" />
      </svg>
    </IconRail>
  )
}

const ICON_BY_KIND = {
  comment: IconComment,
  reply: IconReply,
  mention: IconMention,
  follow: IconFollow,
  like: IconLike,
  repost: IconRepost,
  quote_repost: IconQuoteRepost,
  bookmark: IconBookmark,
}

/**
 * Interaction glyph in the notification row right rail.
 * @param {{ eventType?: string, kind?: string|null }} props
 */
export default function LoungeNotificationActionBadge({ eventType, kind: kindProp }) {
  const kind = kindProp ?? loungeActivityNotificationBadgeKind(eventType)
  const Icon = kind ? ICON_BY_KIND[kind] : null
  if (!Icon) return null
  return <Icon />
}
