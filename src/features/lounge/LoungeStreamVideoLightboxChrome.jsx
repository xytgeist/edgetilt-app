import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import { LOUNGE_FEED_AVATAR_CLASS, LOUNGE_FEED_META_ROW_CLASS } from './loungeFeedAvatar.js'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'

/** Stream video hero overlay only - hardcoded light text (survives html.light zinc + text-white flips). */
const LOUNGE_LIGHTBOX_DISPLAY_NAME_CLASS =
  'min-w-0 truncate font-semibold text-[17px] leading-none text-[#fff]'
const LOUNGE_LIGHTBOX_HANDLE_CLASS = 'text-[#d4d4d8]'
const LOUNGE_LIGHTBOX_CAPTION_CLASS = 'text-[#fff]'

/** Top-bar icon buttons - white frost glass (no stroke / rim shadow). */
export const LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS =
  'flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 text-white shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 [-webkit-tap-highlight-color:transparent]'

/** Image/GIF lightbox top chrome - same size as Stream top circles (`h-10`). */
export const LOUNGE_IMAGE_LIGHTBOX_TOP_BTN_CLASS =
  'flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 text-white shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 [-webkit-tap-highlight-color:transparent]'

export const LOUNGE_IMAGE_LIGHTBOX_NAV_BTN_CLASS =
  `${LOUNGE_IMAGE_LIGHTBOX_TOP_BTN_CLASS} media-lightbox-nav-btn`

export const LOUNGE_IMAGE_LIGHTBOX_TOP_FOLLOW_BTN_CLASS =
  'media-lightbox-nav-btn flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 px-4 text-[13px] font-bold text-white shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 [-webkit-tap-highlight-color:transparent]'

/** Horizontal inset for hero / image lightbox chrome (10% side margins in landscape). */
export const LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD = 'px-3 landscape:px-[10vw]'

/** Top-bar Follow pill - same height as mute / ⋯ controls. */
export const LOUNGE_HERO_LIGHTBOX_TOP_FOLLOW_BTN_CLASS =
  'flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 px-3.5 text-[13px] font-bold text-white shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 [-webkit-tap-highlight-color:transparent]'

/** Portrait author-row Follow - aligned with display name / handle. */
export const LOUNGE_HERO_LIGHTBOX_AUTHOR_FOLLOW_BTN_CLASS =
  'shrink-0 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-bold text-white shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 touch-manipulation [-webkit-tap-highlight-color:transparent]'

export function LoungeStreamLightboxFollowButton({
  author,
  viewerUserId,
  viewerFollowingUserIds,
  onFollowUser,
  /** @type {'topBar' | 'authorRow'} */
  placement = 'topBar',
  topBarBtnClass,
}) {
  const userId = author?.user_id
  const showFollow = Boolean(
    typeof onFollowUser === 'function' &&
      viewerUserId &&
      userId &&
      userId !== viewerUserId &&
      viewerFollowingUserIds instanceof Set &&
      !viewerFollowingUserIds.has(userId),
  )
  if (!showFollow) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onFollowUser(userId)
      }}
      className={
        placement === 'authorRow'
          ? LOUNGE_HERO_LIGHTBOX_AUTHOR_FOLLOW_BTN_CLASS
          : topBarBtnClass || LOUNGE_HERO_LIGHTBOX_TOP_FOLLOW_BTN_CLASS
      }
    >
      Follow
    </button>
  )
}

/**
 * X-style overlay chrome for Stream video hero (author, caption snippet, interactions).
 * Portrait: Follow sits on the author row; landscape: Follow is in the top bar (mute-adjacent).
 * Image lightbox may pass `showAuthorMeta={false}` for tall slides (interaction pills only).
 */
export default function LoungeStreamVideoLightboxChrome({
  post,
  displayEntity,
  captionText = '',
  displayNameFor,
  handleFor,
  avatarText,
  avatarToneClass,
  onAvatarClick,
  openProfileGateIfNeeded,
  dismissLightbox,
  viewerUserId,
  viewerFollowingUserIds,
  onFollowUser,
  interactionBar,
  onMentionClick,
  onHashtagClick,
  onCashtagClick,
  onLinkClick,
  /** @deprecated Lightbox captions expand in-place; detail open is no longer wired from caption taps. */
  onCaptionClick: _onCaptionClick,
  showAuthorMeta = true,
}) {
  void _onCaptionClick
  const author = displayEntity || post
  const userId = author?.user_id
  const profile = author?.author_profile
  const displayName = displayNameFor?.(author) || profile?.display_name || 'Member'
  const handle = handleFor?.(author) || (profile?.handle ? `@${profile.handle}` : '')
  const avatarUrl = profile?.avatar_url
  const caption = captionText

  const openProfile = (e) => {
    e.stopPropagation()
    if (openProfileGateIfNeeded?.()) return
    onAvatarClick?.(author)
    // Profile reveal uses double rAF; wait for elevated shell to paint before hero shrink.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dismissLightbox?.()
        })
      })
    })
  }

  if (!showAuthorMeta) {
    if (!interactionBar) return null
    return (
      <div
        data-lounge-stream-lightbox-chrome
        data-lounge-stream-lightbox-chrome-compact=""
        className="pointer-events-none flex w-full flex-col"
      >
        <div
          className="pointer-events-auto shrink-0 [&_[data-lounge-post-interaction-bar]]:w-auto"
          data-lounge-lightbox-no-swipe
          onClick={(e) => e.stopPropagation()}
        >
          {interactionBar}
        </div>
      </div>
    )
  }

  const captionBlock = caption ? (
    <div
      className={`w-full text-left text-[14px] leading-snug ${LOUNGE_LIGHTBOX_CAPTION_CLASS}`}
      data-lounge-lightbox-no-swipe=""
      onClick={(e) => e.stopPropagation()}
    >
      <LoungeExpandableRichCaption
        text={caption}
        collapsedLines={3}
        expandedMaxLines={8}
        expandOnTap
        captionOpts={{ onMentionClick, onHashtagClick, onCashtagClick, onLinkClick }}
      />
    </div>
  ) : null

  return (
    <div
      data-lounge-stream-lightbox-chrome
      className="pointer-events-none flex w-full flex-col gap-3.5 landscape:flex-row landscape:items-end landscape:justify-between landscape:gap-4"
    >
      {/* X-style: author row, then full-width caption under avatar (not indented beside it). */}
      <div className="pointer-events-auto flex min-w-0 flex-1 flex-col gap-1.5 pr-1 landscape:pr-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={openProfile}
            className={`${LOUNGE_FEED_AVATAR_CLASS} shrink-0 overflow-hidden rounded-full bg-zinc-900 touch-manipulation [-webkit-tap-highlight-color:transparent]`}
            aria-label={`Open ${displayName} profile`}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarToneClass?.(
                  userId || displayName,
                )}`}
              >
                {avatarText?.(author)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openProfile}
            className="min-w-0 flex-1 text-left touch-manipulation"
          >
            <div className="flex min-w-0 flex-col gap-0">
              <div className={LOUNGE_FEED_META_ROW_CLASS}>
                <LoungeFeedAuthorMetaBadges
                  role={profile?.role}
                  isOg={profile?.is_og === true}
                  displayName={displayName}
                  displayNameClassName={LOUNGE_LIGHTBOX_DISPLAY_NAME_CLASS}
                />
              </div>
              {handle ? (
                <span className={`-mt-1 block truncate text-[13px] leading-tight ${LOUNGE_LIGHTBOX_HANDLE_CLASS}`}>
                  {handle}
                </span>
              ) : null}
            </div>
          </button>
          <div className="shrink-0 landscape:hidden">
            <LoungeStreamLightboxFollowButton
              author={author}
              viewerUserId={viewerUserId}
              viewerFollowingUserIds={viewerFollowingUserIds}
              onFollowUser={onFollowUser}
              placement="authorRow"
            />
          </div>
        </div>
        {captionBlock}
      </div>
      {interactionBar ? (
        <div
          className="pointer-events-auto shrink-0 landscape:max-w-[46vw] [&_[data-lounge-post-interaction-bar]]:landscape:w-auto [&_[data-lounge-post-interaction-bar]]:landscape:justify-end [&_[data-lounge-post-interaction-bar]]:landscape:gap-1.5"
          data-lounge-lightbox-no-swipe
          onClick={(e) => e.stopPropagation()}
        >
          {interactionBar}
        </div>
      ) : null}
    </div>
  )
}
