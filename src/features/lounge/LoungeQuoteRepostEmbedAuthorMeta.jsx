import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import {
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
} from './loungeFeedAvatar.js'

/** Quote-repost OP inset - same meta row layout as feed post cards. */
export default function LoungeQuoteRepostEmbedAuthorMeta({
  post,
  displayNameFor,
  handleFor,
  postAgeLabel,
  onDisplayNameClick,
}) {
  if (!post) return null

  return (
    <div className={LOUNGE_FEED_META_TEXT_COLUMN_CLASS}>
      <div className={LOUNGE_FEED_META_ROW_CLASS}>
        <LoungeFeedAuthorMetaBadges
          role={post?.author_profile?.role}
          isOg={post?.author_profile?.is_og === true}
          displayName={displayNameFor(post)}
          displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
          onDisplayNameClick={onDisplayNameClick}
        />
        <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
          <span className="min-w-0 truncate">{handleFor(post)}</span>
          <span className="shrink-0 text-zinc-600">·</span>
          <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
            {postAgeLabel(post?.created_at)}
          </span>
        </span>
      </div>
      {post.pinned ? (
        <div className="mt-1">
          <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
            Pinned
          </span>
        </div>
      ) : null}
    </div>
  )
}
