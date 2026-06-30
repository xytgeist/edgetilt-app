import { useRef } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import { LoungeCommentCard } from './LoungePostCommentThread.jsx'
import {
  LOUNGE_THREAD_PART_NUMBER_BADGE_CLASS,
  LOUNGE_THREAD_PART_NUMBER_BADGE_LAST_CLASS,
} from './LoungePostDetailCommentHierarchy.jsx'
import { LOUNGE_FEED_POST_DETAIL_COMMENT_AVATAR_CLASS } from './loungeFeedAvatar.js'
import { feedThreadPartDisplayNumber } from '../../utils/loungePostThreadApi.js'

const AVATAR_RAIL_W = 'w-12 sm:w-[3.3rem]'
const THREAD_LINE_CLASS = 'w-[2px] flex-1 min-h-[10px] rounded-b-full bg-zinc-700/90'

function ThreadPartAvatarButton({ comment, avatarButtonRef, onAvatarClickProfile, openProfileGateIfNeeded }) {
  const profile = comment?.author_profile
  const displayName = profile?.display_name || profile?.handle || 'Member'

  return (
    <button
      ref={avatarButtonRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (openProfileGateIfNeeded?.()) return
        onAvatarClickProfile?.(comment)
      }}
      className={`${LOUNGE_FEED_POST_DETAIL_COMMENT_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
      aria-label={`Open profile for ${displayName}`}
    >
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-bold text-white ${profileAvatarToneClass(
            profile?.user_id || profile?.handle || comment?.user_id || 'member',
          )}`}
        >
          {profileAvatarInitials(profile?.display_name, profile?.handle)}
        </span>
      )}
    </button>
  )
}

function ThreadPartRow({
  comment,
  partNumber,
  isLast,
  avatarRef,
  cardProps,
  descendantFallback,
  onOpenCommentThread,
}) {
  const openProfileGateIfNeeded = cardProps.openProfileGateIfNeeded

  return (
    <div className="relative mt-3.5 flex items-start gap-3">
      <div className={`flex ${AVATAR_RAIL_W} shrink-0 flex-col items-center self-stretch`}>
        <ThreadPartAvatarButton
          comment={comment}
          avatarButtonRef={avatarRef}
          onAvatarClickProfile={cardProps.onAvatarClickProfile}
          openProfileGateIfNeeded={openProfileGateIfNeeded}
        />
        {!isLast ? (
          <div className="mb-2 mt-2 flex min-h-0 w-full flex-1 flex-col items-center">
            <span className={LOUNGE_THREAD_PART_NUMBER_BADGE_CLASS} aria-hidden>
              {partNumber}
            </span>
            <div aria-hidden className={THREAD_LINE_CLASS} />
          </div>
        ) : (
          <div className="mt-2 flex flex-col items-center">
            <span
              className={LOUNGE_THREAD_PART_NUMBER_BADGE_LAST_CLASS}
              title="Last part"
              aria-hidden
            >
              {partNumber}
            </span>
          </div>
        )}
      </div>
      <div className="relative z-[1] min-w-0 flex-1">
        <LoungeCommentCard
          comment={comment}
          hideAvatar
          avatarButtonRef={avatarRef}
          descendantFallback={descendantFallback}
          {...cardProps}
          navigable={Boolean(onOpenCommentThread)}
          onOpenCommentThread={
            onOpenCommentThread ? () => onOpenCommentThread(comment) : undefined
          }
        />
      </div>
    </div>
  )
}

/**
 * Post detail - thread parts 2+ with the same flex avatar rail as `LoungeThreadComposeSheet`.
 * Connector lines live in the left rail (`flex-1`) so they stay aligned on mobile WebKit.
 */
export default function LoungePostThreadPartsHierarchy({
  threadParts = [],
  descendantCountByCommentId,
  onOpenCommentThread,
  cardProps = {},
}) {
  const avatarRefs = useRef([])

  if (!threadParts.length) return null

  avatarRefs.current = threadParts.map((c, i) => avatarRefs.current[i] || { current: null })

  return (
    <section aria-label="Thread">
      {threadParts.map((comment, idx) => (
        <ThreadPartRow
          key={comment.id}
          comment={comment}
          partNumber={feedThreadPartDisplayNumber(comment)}
          isLast={idx === threadParts.length - 1}
          avatarRef={avatarRefs.current[idx]}
          cardProps={cardProps}
          descendantFallback={descendantCountByCommentId?.get(comment.id) ?? 0}
          onOpenCommentThread={onOpenCommentThread}
        />
      ))}
    </section>
  )
}
