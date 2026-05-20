import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import { LOUNGE_FEED_AVATAR_CLASS } from './loungeFeedAvatar.js'
import { renderRichCaption } from './loungeCaption'

/** Top-bar icon buttons — matches lightbox interaction pill overlay. */
export const LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS =
  'flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-[2px] hover:bg-black/55 active:bg-black/60 [-webkit-tap-highlight-color:transparent]'

/** Top-bar Follow pill — same height as mute / ⋯ controls. */
export const LOUNGE_HERO_LIGHTBOX_TOP_FOLLOW_BTN_CLASS =
  'flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full border border-zinc-500/80 bg-black/40 px-3.5 text-[13px] font-bold text-white backdrop-blur-[2px] hover:bg-black/55 active:bg-black/60 [-webkit-tap-highlight-color:transparent]'

/** Portrait author-row Follow — aligned with display name / handle. */
export const LOUNGE_HERO_LIGHTBOX_AUTHOR_FOLLOW_BTN_CLASS =
  'shrink-0 rounded-full border border-zinc-500/80 bg-black/40 px-3.5 py-1.5 text-[13px] font-bold text-white backdrop-blur-[2px] hover:bg-black/55 active:bg-black/60 touch-manipulation [-webkit-tap-highlight-color:transparent]'

export function LoungeStreamLightboxFollowButton({
  author,
  viewerUserId,
  viewerFollowingUserIds,
  onFollowUser,
  /** @type {'topBar' | 'authorRow'} */
  placement = 'topBar',
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
          : LOUNGE_HERO_LIGHTBOX_TOP_FOLLOW_BTN_CLASS
      }
    >
      Follow
    </button>
  )
}

/**
 * X-style overlay chrome for Stream video hero (author, caption snippet, interactions).
 * Portrait: Follow sits on the author row; landscape: Follow is in the top bar (mute-adjacent).
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
  onCaptionClick,
}) {
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

  return (
    <div className="pointer-events-none flex w-full flex-col gap-2 landscape:flex-row landscape:items-center landscape:justify-between landscape:gap-4">
      <div className="pointer-events-auto flex min-w-0 flex-1 items-start gap-2.5 pr-1 landscape:pr-0">
        <button
          type="button"
          onClick={openProfile}
          className={`${LOUNGE_FEED_AVATAR_CLASS} shrink-0 overflow-hidden rounded-full border border-white/20 bg-zinc-900 touch-manipulation [-webkit-tap-highlight-color:transparent]`}
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
        <div className="min-w-0 flex-1 pt-0.5">
          <button type="button" onClick={openProfile} className="block max-w-full text-left touch-manipulation">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <LoungeFeedAuthorMetaBadges
                role={profile?.role}
                isOg={profile?.is_og === true}
                displayName={displayName}
                displayNameClassName="truncate text-[15px] font-bold leading-tight text-white"
              />
            </div>
            {handle ? (
              <span className="mt-0.5 block truncate text-[13px] text-zinc-300/90">{handle}</span>
            ) : null}
          </button>
          {caption ? (
            typeof onCaptionClick === 'function' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (openProfileGateIfNeeded?.()) return
                  onCaptionClick()
                }}
                className="mt-1 line-clamp-2 w-full text-left text-[14px] leading-snug text-zinc-100/95 touch-manipulation hover:text-white landscape:line-clamp-3 [-webkit-tap-highlight-color:transparent]"
              >
                {renderRichCaption(caption, { onMentionClick, onHashtagClick })}
              </button>
            ) : (
              <div className="mt-1 line-clamp-2 text-left text-[14px] leading-snug text-zinc-100/95 landscape:line-clamp-3">
                {renderRichCaption(caption, { onMentionClick, onHashtagClick })}
              </div>
            )
          ) : null}
        </div>
        <div className="shrink-0 self-start pt-0.5 landscape:hidden">
          <LoungeStreamLightboxFollowButton
            author={author}
            viewerUserId={viewerUserId}
            viewerFollowingUserIds={viewerFollowingUserIds}
            onFollowUser={onFollowUser}
            placement="authorRow"
          />
        </div>
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
