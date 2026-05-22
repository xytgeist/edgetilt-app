import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import { LOUNGE_NOTIFICATION_STACK_AVATAR_CLASS } from './loungeFeedAvatar.js'

/**
 * Overlapping actor avatars for grouped like/bookmark notification rows.
 */
export default function LoungeNotificationActorStack({
  actors = [],
  maxVisible = 12,
  onOpenProfile,
}) {
  const shown = actors.slice(0, maxVisible)
  if (shown.length === 0) return null

  return (
    <span className="inline-flex min-w-0 items-center">
      {shown.map((actor, index) => {
        const avatarUrl = String(actor?.avatar_url || '').trim()
        const avatarTone = profileAvatarToneClass(actor?.user_id)
        const avatarText = profileAvatarInitials(actor?.display_name, actor?.handle)
        const displayName =
          String(actor?.display_name || '').trim() ||
          (actor?.handle ? `@${String(actor.handle).trim()}` : 'Member')

        return (
          <button
            key={String(actor?.user_id || index)}
            type="button"
            title={`View ${displayName}'s profile`}
            aria-label={`View ${displayName}'s profile`}
            onClick={(e) => {
              e.stopPropagation()
              onOpenProfile?.(actor)
            }}
            style={{ zIndex: shown.length - index }}
            className={`${LOUNGE_NOTIFICATION_STACK_AVATAR_CLASS} ${
              index > 0 ? '-ml-2.5' : ''
            } relative touch-manipulation hover:border-zinc-500 [-webkit-tap-highlight-color:transparent]`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span
                className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarTone}`}
              >
                {avatarText}
              </span>
            )}
          </button>
        )
      })}
    </span>
  )
}
