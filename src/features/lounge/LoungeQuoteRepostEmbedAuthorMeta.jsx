import { profileAvatarInitials, profileAvatarToneClass } from '../profiles/profileGate.js'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import {
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
  LOUNGE_QUOTE_EMBED_AVATAR_CLASS,
  LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS,
  LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS,
  LOUNGE_QUOTE_EMBED_META_ROW_CLASS,
} from './loungeFeedAvatar.js'

/** Quote-repost OP inset ... X-style avatar + meta row. */
export default function LoungeQuoteRepostEmbedAuthorMeta({
  post,
  displayNameFor,
  handleFor,
  postAgeLabel,
  onDisplayNameClick,
}) {
  if (!post) return null

  const profile = post?.author_profile
  const onAvatarClick =
    typeof onDisplayNameClick === 'function'
      ? (e) => {
          e.stopPropagation()
          onDisplayNameClick(e)
        }
      : undefined

  return (
    <div className="flex min-w-0 items-center gap-2">
      {onAvatarClick ? (
        <button
          type="button"
          onClick={onAvatarClick}
          className={`${LOUNGE_QUOTE_EMBED_AVATAR_CLASS} touch-manipulation [-webkit-tap-highlight-color:transparent]`}
          aria-label={`Open profile for ${typeof displayNameFor === 'function' ? displayNameFor(post) : 'member'}`}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className={`flex h-full w-full items-center justify-center font-bold text-white ${profileAvatarToneClass(
                profile?.user_id || post?.user_id || profile?.handle || 'member',
              )}`}
            >
              {profileAvatarInitials(profile?.display_name, profile?.handle)}
            </span>
          )}
        </button>
      ) : (
        <div className={`${LOUNGE_QUOTE_EMBED_AVATAR_CLASS} pointer-events-none`} aria-hidden>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className={`flex h-full w-full items-center justify-center font-bold text-white ${profileAvatarToneClass(
                profile?.user_id || post?.user_id || profile?.handle || 'member',
              )}`}
            >
              {profileAvatarInitials(profile?.display_name, profile?.handle)}
            </span>
          )}
        </div>
      )}
      <div className={`min-w-0 flex-1 ${LOUNGE_FEED_META_TEXT_COLUMN_CLASS}`}>
        <div className={LOUNGE_QUOTE_EMBED_META_ROW_CLASS}>
          <LoungeFeedAuthorMetaBadges
            role={profile?.role}
            isOg={profile?.is_og === true}
            displayName={displayNameFor(post)}
            displayNameClassName={LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS}
            onDisplayNameClick={onDisplayNameClick}
            metaVariant="quoteEmbed"
          />
          <span className={LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS}>
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
    </div>
  )
}
