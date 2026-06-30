/** Feed / comment / detail post row avatar (+20% vs former h-10 / 2.75rem). No top margin - cap-align with meta row. */
export const LOUNGE_FEED_AVATAR_CLASS =
  'h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 font-bold text-zinc-200 text-[18px] sm:h-[3.3rem] sm:w-[3.3rem] sm:text-[19px]'

/** Notifications panel - actor avatar in the left column. */
export const LOUNGE_NOTIFICATION_AUTHOR_AVATAR_CLASS =
  'h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 font-bold text-zinc-200 text-[15px] sm:h-11 sm:w-11 sm:text-[16px]'

/** Notifications panel - stacked avatars on grouped like/bookmark meta rows. */
export const LOUNGE_NOTIFICATION_STACK_AVATAR_CLASS =
  'h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 border-zinc-950 bg-zinc-900 font-bold text-zinc-200 text-[11px] sm:h-8 sm:w-8 sm:text-[12px]'

/** Notifications panel - left-column action icon (grouped like/bookmark); matches author avatar footprint. */
export const LOUNGE_NOTIFICATION_ACTION_AVATAR_SLOT_CLASS =
  'flex h-10 w-10 shrink-0 items-center justify-center self-center sm:h-11 sm:w-11'

/** Grouped like/bookmark - tint rail from panel edge through icon column to caption start. */
export const LOUNGE_NOTIFICATION_GROUPED_TINT_RAIL_CLASS =
  'pointer-events-none absolute inset-y-0 -left-3 z-0 w-[calc(0.75rem+2.5rem+0.75rem)] sm:w-[calc(0.75rem+2.75rem+0.75rem)]'

/** Glyph size inside grouped like/bookmark left column - matches notification author avatar. */
export const LOUNGE_NOTIFICATION_ACTION_AVATAR_GLYPH_CLASS = 'h-10 w-10 sm:h-11 sm:w-11'

/** @deprecated Lead slot - unused in notification rows. */
export const LOUNGE_NOTIFICATION_ACTION_SLOT_CLASS =
  'flex h-12 w-12 shrink-0 items-center justify-center sm:h-[3.3rem] sm:w-[3.3rem]'

/** Lounge feed + post/comment detail title bar row padding (`SocialFeed`, `ScrollLinkedEdgeTitleBarShell`). */
export const LOUNGE_FEED_TITLE_BAR_ROW_CLASS = 'px-3 py-2'

/** Title bar back / menu / balance slot - matches AppShell `titleBarNavSlot` (`h-10 w-10`). */
export const LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS = 'h-10 w-10 shrink-0'

/** Feed / profile / search post row - same rule gaps as post-detail comment `<li>` items. */
export const LOUNGE_FEED_POST_ROW_CLASS =
  'border-t border-zinc-800/70 bg-zinc-950/35 px-3 pt-2 pb-2 transition-colors active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]'

/** `LoungePostArticle` root - `pt-1` below rule (pairs with row `pt-2`). */
export const LOUNGE_FEED_POST_ROW_INNER_CLASS = 'min-w-0 pt-1 pb-0'

/** Feed post interaction row - same caption→bar gap as post-detail comments. */
export const LOUNGE_FEED_POST_INTERACTIONS_CLASS = 'mt-1.5 w-full -mb-1'

/** Post detail comments - same avatar alignment as feed cards (`LoungePostArticle`). */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_AVATAR_CLASS = LOUNGE_FEED_AVATAR_CLASS

/** Comment row - `pt-1` below rule only; no bottom pad (list `pb-3` owns space above next rule). */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_ROW_CLASS = 'min-w-0 pt-1 pb-0'

/** Post detail comment list - no UA list indent (`padding-inline-start`). */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_CLASS = 'mt-0 list-none space-y-0 p-0'

/** Inter-comment lines - `pt-2` below rule; `pb-2` above next rule (article has no bottom pad). */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_ITEM_CLASS =
  'min-w-0 border-t border-zinc-800/70 pb-2 pt-2 first:border-t-0 last:pb-0'

/** Nudge meta line up to cap-align with avatar top (name, badges, handle, menu). */
export const LOUNGE_FEED_META_ROW_CAP_ALIGN_CLASS = '-translate-y-0.5'

/** Display name + badges + handle row; top-align with avatar (not items-center). */
export const LOUNGE_FEED_META_ROW_CLASS = `flex min-w-0 flex-nowrap items-start justify-start gap-x-1.5 text-[17px] leading-none ${LOUNGE_FEED_META_ROW_CAP_ALIGN_CLASS}`

/** Feed + post-detail comment ⋯ menu anchor. */
export const LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS =
  'absolute right-0 top-0 z-10 -translate-y-1.5'

/** @deprecated Use `LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS`. */
export const LOUNGE_FEED_POST_ROW_MENU_ANCHOR_CLASS = LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS

export const LOUNGE_FEED_COMMENT_ROW_MENU_CLASS = `shrink-0 self-start ${LOUNGE_FEED_META_ROW_CAP_ALIGN_CLASS}`

export const LOUNGE_FEED_DISPLAY_NAME_CLASS =
  'min-w-0 truncate font-semibold text-[17px] leading-none text-zinc-100'

/** Post detail OP display name (same 17px as feed; slight vertical nudge). */
export const LOUNGE_FEED_DISPLAY_NAME_DETAIL_CLASS =
  'min-w-0 truncate font-semibold text-[17px] leading-none text-zinc-100 translate-y-px'

/** Post / comment caption body (not quote-repost embed cards). */
export const LOUNGE_FEED_CAPTION_TEXT_CLASS =
  'text-[17px] leading-snug whitespace-pre-wrap break-words [overflow-wrap:anywhere]'

/** Display name + in-cluster badge(s): gap-x-1 (staff crown or OG-only). */
export function loungeFeedAuthorIdentityClusterClass(hasStaffBadge, showOgBadge) {
  const gap =
    hasStaffBadge || (showOgBadge && !hasStaffBadge) ? 'gap-x-1' : 'gap-x-0.5'
  return `inline-flex min-w-0 max-w-full flex-nowrap items-start ${gap}`
}

export function loungeFeedAuthorHasStaffBadge(role) {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'moderator'
}

/**
 * Meta column beside ⋯ menu - avoid `overflow-hidden` here; feed badges use
 * negative translate-Y and get a dark clip line against the row background.
 */
export const LOUNGE_FEED_META_TEXT_COLUMN_CLASS = 'min-w-0 text-left'

/** Staff / OG icons - slight lift vs display name on the meta row. */
export const LOUNGE_FEED_META_BADGE_WRAP_CLASS = 'shrink-0 -translate-y-px'

/** OG after staff icons on the meta row (pulls toward shield; meta row still gap-x-1.5). */
export const LOUNGE_FEED_OG_AFTER_STAFF_CLASS = 'shrink-0 -ml-0.5 -translate-y-px'

/** Handle · time on the meta row - cap-align with name/badges (feed cards + comments). */
export const LOUNGE_FEED_META_HANDLE_TIME_CLASS =
  'inline-flex min-w-0 max-w-[min(11rem,52vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[17px] leading-none text-zinc-500 sm:max-w-[13rem]'

/** Post detail OP - stacked header (name + badges, then handle · time). */
export const LOUNGE_FEED_POST_DETAIL_AUTHOR_BLOCK_CLASS =
  'flex min-w-0 flex-col items-start leading-none translate-y-1'

export const LOUNGE_FEED_POST_DETAIL_NAME_BADGE_ROW_CLASS =
  'flex min-w-0 max-w-full flex-wrap items-start gap-x-1.5'

export const LOUNGE_FEED_POST_DETAIL_HANDLE_TIME_CLASS =
  'mt-1 -translate-y-px inline-flex min-w-0 max-w-full items-center gap-x-1 overflow-hidden text-[17px] leading-none text-zinc-500'

/** Space between meta row and caption - no transform (Android mis-hit-tests transformed caption text). */
export const LOUNGE_FEED_CAPTION_TOP_CLASS = 'mt-0.5'

/** Media directly under a caption, or first block when there is no caption. */
export const LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS = 'mt-1'
export const LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS = 'mt-0.5'

/** Indents detail-thread body beside avatar (`LOUNGE_FEED_AVATAR_CLASS` width + `gap-3`). */
export const LOUNGE_COMMENT_DETAIL_THREAD_PAD = 'pl-[3.75rem] sm:pl-[4.05rem]'

/** Post detail - interaction row below date/time stamp. */
export const LOUNGE_FEED_POST_DETAIL_INTERACTIONS_WRAP_CLASS = '-mt-1'

/** Post detail - sort row + rule (`pt-2` on separator = space above rule). */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_SECTION_CLASS = ''

export const LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_ROW_CLASS = 'flex justify-start pt-0 pb-0'

export const LOUNGE_FEED_POST_DETAIL_COMMENT_SEPARATOR_CLASS =
  'border-b border-zinc-800/90 pt-2'

/** Comment interaction row - pull bottom margin so gap to next rule matches `pt-2` below rule. */
export const LOUNGE_FEED_POST_DETAIL_COMMENT_INTERACTIONS_CLASS = 'mt-0.5 w-full -mb-1'
