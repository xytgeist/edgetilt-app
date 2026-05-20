import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import { LOUNGE_FEED_AVATAR_CLASS } from './loungeFeedAvatar.js'
import { renderRichCaption } from './loungeCaption'

/**
 * X-style overlay chrome for Stream video hero (author, caption snippet, follow, ⋯ menu, interactions).
 * Video plays full-screen behind this layer.
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

  const showFollow = Boolean(
    typeof onFollowUser === 'function' &&
      viewerUserId &&
      userId &&
      userId !== viewerUserId &&
      viewerFollowingUserIds instanceof Set &&
      !viewerFollowingUserIds.has(userId),
  )

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
    <div className="pointer-events-none flex w-full flex-col gap-2">
      <div className="pointer-events-auto flex items-start gap-2.5 pr-1">
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
                className="mt-1 line-clamp-2 w-full text-left text-[14px] leading-snug text-zinc-100/95 touch-manipulation hover:text-white [-webkit-tap-highlight-color:transparent]"
              >
                {renderRichCaption(caption, { onMentionClick, onHashtagClick })}
              </button>
            ) : (
              <div className="mt-1 line-clamp-2 text-left text-[14px] leading-snug text-zinc-100/95">
                {renderRichCaption(caption, { onMentionClick, onHashtagClick })}
              </div>
            )
          ) : null}
        </div>
        {showFollow ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFollowUser(userId)
            }}
            className="shrink-0 rounded-full border border-zinc-500/80 bg-black/40 px-3.5 py-1.5 text-[13px] font-bold text-white touch-manipulation hover:bg-white/10 [-webkit-tap-highlight-color:transparent]"
          >
            Follow
          </button>
        ) : null}
      </div>
      {interactionBar ? (
        <div
          className="pointer-events-auto"
          data-lounge-lightbox-no-swipe
          onClick={(e) => e.stopPropagation()}
        >
          {interactionBar}
        </div>
      ) : null}
    </div>
  )
}
