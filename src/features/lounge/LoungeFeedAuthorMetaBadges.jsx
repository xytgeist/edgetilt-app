import LoungeStaffRoleBadge from './LoungeStaffRoleBadge.jsx'
import LoungeOgBadge from './LoungeOgBadge.jsx'
import {
  loungeFeedAuthorHasStaffBadge,
  loungeFeedAuthorIdentityClusterClass,
  LOUNGE_FEED_META_BADGE_WRAP_CLASS,
  LOUNGE_FEED_OG_AFTER_STAFF_CLASS,
} from './loungeFeedAvatar.js'

/**
 * Display name + staff/OG badges - same cluster, wrap nudges, and `feed` icon sizes as
 * `LoungePostArticle` meta row (not `size="detail"` / embed sizing).
 */
export default function LoungeFeedAuthorMetaBadges({
  role,
  isOg = false,
  displayName,
  displayNameClassName,
  onDisplayNameClick,
}) {
  const hasStaffBadge = loungeFeedAuthorHasStaffBadge(role)
  const showOgBadge = isOg === true

  const displayNameNode =
    typeof onDisplayNameClick === 'function' ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDisplayNameClick(e)
        }}
        className={`${displayNameClassName} touch-manipulation hover:text-cyan-300 [-webkit-tap-highlight-color:transparent]`}
      >
        {displayName}
      </button>
    ) : (
      <span className={displayNameClassName}>{displayName}</span>
    )

  return (
    <>
      <span className={loungeFeedAuthorIdentityClusterClass(hasStaffBadge, showOgBadge)}>
        {displayNameNode}
        {hasStaffBadge ? (
          <span className={LOUNGE_FEED_META_BADGE_WRAP_CLASS}>
            <LoungeStaffRoleBadge role={role} />
          </span>
        ) : showOgBadge ? (
          <span className={LOUNGE_FEED_META_BADGE_WRAP_CLASS}>
            <LoungeOgBadge isOg />
          </span>
        ) : null}
      </span>
      {hasStaffBadge && showOgBadge ? (
        <span className={LOUNGE_FEED_OG_AFTER_STAFF_CLASS}>
          <LoungeOgBadge isOg />
        </span>
      ) : null}
    </>
  )
}
