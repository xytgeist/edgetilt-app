import { useMemo } from 'react'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import {
  LOUNGE_FEED_AVATAR_CLASS,
  LOUNGE_FEED_CAPTION_TEXT_CLASS,
  LOUNGE_FEED_CAPTION_TOP_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS,
  LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS,
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_POST_ROW_CLASS,
  LOUNGE_FEED_POST_ROW_INNER_CLASS,
} from './loungeFeedAvatar.js'

const SEARCH_COMMENT_SKIP_CLICK =
  'button, a, textarea, input, select, [data-lounge-image-zoom], [data-lounge-video-zoom]'

/**
 * Search hit for a comment - same body chrome as a plain comment repost (no repost header / parent post).
 */
export default function LoungeSearchCommentResultRow({
  comment,
  post,
  postCardProps = null,
  scrollRootRef = null,
  searchHighlightQuery = '',
}) {
  const pp = postCardProps || {}
  const displayNameFor = pp.displayNameFor
  const handleFor = pp.handleFor
  const postAgeLabel = pp.postAgeLabel
  const displayLabel = pp.displayLabel
  const avatarToneClass = pp.avatarToneClass
  const avatarText = pp.avatarText

  const streamLightboxSurface = useMemo(
    () => ({
      repostMenuPortalClass: pp.repostMenuPortalClass || 'z-[104]',
      repostMenuScrollRootRef: scrollRootRef,
    }),
    [pp.repostMenuPortalClass, scrollRootRef],
  )

  const mediaLightboxProps = {
    lightboxPortalClass: pp.mediaLightboxPortalClass || 'z-[103]',
    visibilityResetRootRef: scrollRootRef,
    streamLightboxHost: comment,
    streamLightboxSurface,
  }

  const openCommentDetail = () => {
    if (pp.openProfileGateIfNeeded?.()) return
    if (typeof pp.onOpenProfileReply === 'function') {
      pp.onOpenProfileReply(comment, post)
      return
    }
    pp.onOpenCommentRepost?.(comment)
  }

  const onAvatar = (e) => {
    e.stopPropagation()
    if (pp.openProfileGateIfNeeded?.()) return
    if (typeof pp.onAvatarClick !== 'function') return
    pp.onAvatarClick(comment)
  }

  const onReplyToProfile = (e) => {
    e.stopPropagation()
    if (pp.openProfileGateIfNeeded?.()) return
    const target = comment?.reply_to_profile
    if (!target?.user_id || typeof pp.onAvatarClick !== 'function') return
    pp.onAvatarClick(target)
  }

  const richCaptionOpts = useMemo(() => {
    const base = {
      onMentionClick: pp.onMentionClick,
      onHashtagClick: pp.onHashtagClick,
      onLinkClick: pp.onLinkClick,
    }
    const hq = String(searchHighlightQuery || '').trim()
    if (hq.length >= 2) return { ...base, highlightQuery: hq }
    return base
  }, [pp.onHashtagClick, pp.onLinkClick, pp.onMentionClick, searchHighlightQuery])

  if (!comment?.id || !post?.id) return null

  const safePostAgeLabel = typeof postAgeLabel === 'function' ? postAgeLabel : () => ''
  const authorRole = comment?.author_profile?.role

  return (
    <article
      tabIndex={0}
      aria-label="View comment in post"
      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer touch-manipulation outline-none [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/35 focus-visible:ring-2 focus-visible:ring-violet-500/40`}
      onClick={(e) => {
        const t = e.target
        if (!(t instanceof Element)) return
        if (t.closest(SEARCH_COMMENT_SKIP_CLICK)) return
        openCommentDetail()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        openCommentDetail()
      }}
    >
      <div className={`flex items-start gap-3 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
        <button
          type="button"
          title="View profile"
          onClick={onAvatar}
          className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
        >
          {comment?.author_profile?.avatar_url ? (
            <img
              src={comment.author_profile.avatar_url}
              alt=""
              className="h-full w-full rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className={`flex h-full w-full items-center justify-center font-bold text-white ${typeof avatarToneClass === 'function' ? avatarToneClass(comment?.author_profile?.user_id || comment?.user_id || (typeof displayLabel === 'function' ? displayLabel(comment) : 'member')) : ''}`}
            >
              {typeof avatarText === 'function' ? avatarText(comment) : '?'}
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className={LOUNGE_FEED_META_ROW_CLASS}>
            <LoungeFeedAuthorMetaBadges
              role={authorRole}
              isOg={comment?.author_profile?.is_og === true}
              displayName={typeof displayNameFor === 'function' ? displayNameFor(comment) : 'Member'}
              displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
            />
            <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
              <span className="min-w-0 truncate">{typeof handleFor === 'function' ? handleFor(comment) : '@member'}</span>
              <span className="shrink-0 text-zinc-600">·</span>
              <span className="shrink-0 whitespace-nowrap font-normal tabular-nums">{safePostAgeLabel(comment?.created_at)}</span>
            </span>
          </div>

          {comment?.reply_to_profile?.handle ? (
            <div className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              <em>…in reply to</em>{' '}
              <button
                type="button"
                onClick={onReplyToProfile}
                className="touch-manipulation font-medium text-orange-400 hover:text-orange-300 [-webkit-tap-highlight-color:transparent]"
              >
                <em>@{comment.reply_to_profile.handle}</em>
              </button>
            </div>
          ) : null}

          {comment?.body ? (
            <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
              <LoungeExpandableRichCaption text={comment.body} captionOpts={richCaptionOpts} />
            </div>
          ) : null}

          <LoungePostFeedImagesAndGif
            post={comment}
            variant="feed"
            feedAutoplayRowId={comment.id}
            feedAutoplaySlot="comment"
            firstMarginTopClass={
              comment?.body ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
            }
            {...mediaLightboxProps}
          />
        </div>
      </div>
    </article>
  )
}
