import LoungeStaffRoleBadge from './LoungeStaffRoleBadge.jsx'
import LoungeOgBadge from './LoungeOgBadge.jsx'
import LoungeEdgeProBadge from './LoungeEdgeProBadge.jsx'
import {
  loungeFeedAuthorHasStaffBadge,
  loungeFeedAuthorIdentityClusterClass,
  LOUNGE_FEED_META_BADGE_WRAP_CLASS,
  LOUNGE_FEED_OG_AFTER_STAFF_CLASS,
  LOUNGE_QUOTE_EMBED_META_BADGE_WRAP_CLASS,
  LOUNGE_QUOTE_EMBED_OG_AFTER_STAFF_CLASS,
} from './loungeFeedAvatar.js'

/**
 * Display name + staff/OG/EdgePro badges - same cluster, wrap nudges, and `feed` icon sizes as
 * `LoungePostArticle` meta row (not `size="detail"` / embed sizing).
 */
export default function LoungeFeedAuthorMetaBadges({
  role,
  isOg = false,
  isEdgePro = false,
  displayName,
  displayNameClassName,
  onDisplayNameClick,
  /** @type {'feed' | 'quoteEmbed'} */
  metaVariant = 'feed',
}) {
  const hasStaffBadge = loungeFeedAuthorHasStaffBadge(role)
  const showOgBadge = isOg === true
  const showEdgeProBadge = isEdgePro === true
  const quoteEmbed = metaVariant === 'quoteEmbed'
  const badgeSize = quoteEmbed ? 'embed' : 'feed'
  const badgeWrapClass = quoteEmbed ? LOUNGE_QUOTE_EMBED_META_BADGE_WRAP_CLASS : LOUNGE_FEED_META_BADGE_WRAP_CLASS
  const ogAfterStaffClass = quoteEmbed ? LOUNGE_QUOTE_EMBED_OG_AFTER_STAFF_CLASS : LOUNGE_FEED_OG_AFTER_STAFF_CLASS
  const clusterClass = loungeFeedAuthorIdentityClusterClass(hasStaffBadge, showOgBadge, { quoteEmbed })

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

  const identityBlock = (
    <span className={clusterClass}>
      {displayNameNode}
      {hasStaffBadge ? (
        <span className={badgeWrapClass}>
          <LoungeStaffRoleBadge role={role} size={badgeSize} />
        </span>
      ) : null}
      {showOgBadge ? (
        <span className={hasStaffBadge ? ogAfterStaffClass : badgeWrapClass}>
          <LoungeOgBadge isOg size={badgeSize} />
        </span>
      ) : null}
      {showEdgeProBadge ? (
        <span className={badgeWrapClass}>
          <LoungeEdgeProBadge isEdgePro size={badgeSize} />
        </span>
      ) : null}
    </span>
  )

  if (quoteEmbed) {
    return (
      <span className="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-x-1">
        {identityBlock}
      </span>
    )
  }

  return identityBlock
}
