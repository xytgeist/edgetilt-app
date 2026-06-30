import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import {
  LOUNGE_NOTIFICATION_ACTION_AVATAR_GLYPH_CLASS,
  LOUNGE_NOTIFICATION_ACTION_AVATAR_SLOT_CLASS,
  LOUNGE_NOTIFICATION_ACTION_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import {
  LOUNGE_COMMENT_BUBBLE_D,
  LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS,
} from './loungeCommentGlyph.js'
import { loungeActivityNotificationBadgeKind } from '../../utils/loungeActivityApi.js'

const BOOKMARK_RIBBON_D = 'M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z'

const REPOST_ARROWS_D =
  'M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2'

function glyphClass(slot) {
  if (slot === 'avatar') {
    return LOUNGE_NOTIFICATION_ACTION_AVATAR_GLYPH_CLASS
  }
  return slot === 'lead' ? 'h-7 w-7' : 'h-[18px] w-[18px]'
}

function IconShell({ slot = 'inline', children }) {
  if (slot === 'avatar') {
    return (
      <span
        className={`${LOUNGE_NOTIFICATION_ACTION_AVATAR_SLOT_CLASS} pointer-events-none`}
        aria-hidden
      >
        {children}
      </span>
    )
  }
  if (slot === 'lead') {
    return (
      <span className={`${LOUNGE_NOTIFICATION_ACTION_SLOT_CLASS} pointer-events-none`} aria-hidden>
        {children}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center justify-center self-center" aria-hidden>
      {children}
    </span>
  )
}

function IconComment({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg
        className={`${cls} text-zinc-200 ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path d={LOUNGE_COMMENT_BUBBLE_D} fill="currentColor" />
      </svg>
    </IconShell>
  )
}

function IconReply({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg
        className={`${cls} text-cyan-400 ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path d={LOUNGE_COMMENT_BUBBLE_D} fill="currentColor" />
      </svg>
    </IconShell>
  )
}

function IconMention({ slot }) {
  return (
    <IconShell slot={slot}>
      <span
        className={
          slot === 'lead'
            ? 'text-[26px] font-bold leading-none text-orange-400'
            : 'text-[17px] font-bold leading-none text-orange-400'
        }
      >
        @
      </span>
    </IconShell>
  )
}

function IconFollow({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg className={`${cls} text-cyan-400`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <circle cx="10" cy="6.65" r="3.15" />
        <path d="M4.5 16v-.75c0-2.35 1.9-4.25 4.25-4.25h3.5c2.35 0 4.25 1.9 4.25 4.25V16H4.5z" />
      </svg>
    </IconShell>
  )
}

function IconLike({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <LoungeFlameIcon className={`${cls} text-zinc-200`} liked readOnly={false} />
    </IconShell>
  )
}

function IconRepost({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg className={`${cls} text-emerald-400`} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d={REPOST_ARROWS_D}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconShell>
  )
}

function IconQuoteRepost({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg className={cls} viewBox="0 0 20 20" fill="none" aria-hidden>
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
    </IconShell>
  )
}

/** Bookmark ribbon is inset in 20×20 - tighter crop so inline size matches other notification glyphs. */
const BOOKMARK_NOTIFICATION_VIEWBOX = '5.25 4.5 9.25 11.75'

function IconBookmark({ slot }) {
  const cls =
    slot === 'avatar'
      ? LOUNGE_NOTIFICATION_ACTION_AVATAR_GLYPH_CLASS
      : glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg
        className={`${cls} text-lv-yellow`}
        viewBox={slot === 'inline' || slot === 'lead' ? BOOKMARK_NOTIFICATION_VIEWBOX : '0 0 20 20'}
        fill="none"
        aria-hidden
      >
        <path d={BOOKMARK_RIBBON_D} fill="currentColor" />
      </svg>
    </IconShell>
  )
}

function IconPlayLog({ slot }) {
  const cls = glyphClass(slot)
  return (
    <IconShell slot={slot}>
      <svg className={`${cls} text-cyan-400`} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M5 4.5h10a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </IconShell>
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
  play_log: IconPlayLog,
}

/**
 * Interaction glyph for notification rows.
 * @param {{ eventType?: string, kind?: string|null, slot?: 'inline'|'lead'|'avatar' }} props
 */
export default function LoungeNotificationActionBadge({ eventType, kind: kindProp, slot = 'inline' }) {
  const kind = kindProp ?? loungeActivityNotificationBadgeKind(eventType)
  const Icon = kind ? ICON_BY_KIND[kind] : null
  if (!Icon) return null
  return <Icon slot={slot} />
}
