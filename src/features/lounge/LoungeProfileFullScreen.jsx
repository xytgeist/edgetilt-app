import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// LOUNGE_DOCK_FOOTER_BAR_DISABLED - classic dock icon row on profile sheet. Re-enable import + JSX below to restore.
// import LoungeDockFooterBar from '../../components/LoungeDockFooterBar.jsx'
import {
  checkProfileHandleAvailability,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  isProfileHandleUniqueViolation,
  normalizeHandle,
  profileAvatarInitials,
  profileAvatarToneClass,
  saveProfileWithHandleFallback,
  suggestAvailableProfileHandle,
  uploadProfileAvatar,
  uploadProfileBanner,
} from '../profiles/profileGate'
import ProfileHandleConflictDialog from '../profiles/ProfileHandleConflictDialog.jsx'
import { normalizeProfileLocation } from '../profiles/profileLocation.js'
import ProfileLocationPicker from '../profiles/ProfileLocationPicker.jsx'
import { prepareAvatarImageForUpload, isProbablyImageFile } from '../../utils/compressImageForUpload'
import { collectLoungePostInteractionHydrateIds, feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import { loungeFeedPostRowPerfStyle } from '../../utils/loungeFeedPostRowPerfStyle.js'
import { feedCommentRowHasMedia } from '../../utils/communityFeedComment.js'
import LoungePostArticle from './LoungePostArticle'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import LoungePostCategoryPillRow from './LoungePostCategoryPillRow.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
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
  LOUNGE_FEED_POST_INTERACTIONS_CLASS,
  loungeFeedAuthorHasStaffBadge,
} from './loungeFeedAvatar.js'
import LoungePostDetailCommentHierarchy from './LoungePostDetailCommentHierarchy.jsx'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import {
  LoungeFeedAutoplayPostsKick,
  LoungeFeedCoordinatorSuspendBinder,
  LoungeFeedVideoAutoplayProvider,
} from './LoungeFeedVideoAutoplayContext.jsx'
import LoungeOgBadge from './LoungeOgBadge'
import ProfileAvatarCropModal from './ProfileAvatarCropModal'
import LoungeProfileFollowList from './LoungeProfileFollowList.jsx'
import {
  fetchLoungeProfilePosts,
  fetchLoungeProfileRow,
  loadLoungeProfileScreenPostsRemainder,
  LOUNGE_PROFILE_POST_INITIAL_LIMIT,
} from './loungeProfileScreenLoad.js'
import { formatCompactStatCount, fullStatCountTitle } from '../../utils/formatCompactStatCount.js'
import { LOUNGE_DOCK_FAB_SIZE_PX } from '../../utils/loungeDockFabPosition.js'
import {
  normalizeLoungeProfileCategoryPills,
  profileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'
import { chatBlockUser, chatGetBlockStatus, chatUnblockUser } from '../chat/chatApi.js'

const PROFILE_TAB_IDS = ['posts', 'replies', 'likes', 'bookmarks']

const PROFILE_BANNER_CHROME_BTN_CLASS =
  'grid h-9 w-9 place-items-center rounded-full bg-black/32 text-white shadow-[0_1px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm touch-manipulation outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] hover:bg-black/44 active:bg-black/50'

const PROFILE_BANNER_CHROME_DOTS_CLASS =
  'block pb-0.5 text-2xl font-bold leading-none tracking-tight -translate-y-px [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_8px_rgba(0,0,0,0.55)]'

const PROFILE_BANNER_CHROME_BACK_CLASS =
  'block leading-none text-2xl -translate-y-px [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_8px_rgba(0,0,0,0.55)]'

function ProfileHeaderBadges({ role, isOg }) {
  const hasStaff = loungeFeedAuthorHasStaffBadge(role)
  if (!hasStaff && isOg !== true) return null
  return (
    <span className="inline-flex shrink-0 items-baseline gap-x-1">
      {hasStaff ? <LoungeStaffRoleBadge role={role} size="modal" /> : null}
      {isOg === true ? (
        <span className={hasStaff ? 'shrink-0 -ml-0.5' : 'shrink-0'}>
          <LoungeOgBadge isOg size="modal" />
        </span>
      ) : null}
    </span>
  )
}

function ProfileLocationPinIcon({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2.25a4.75 4.75 0 00-4.75 4.75c0 3.17 4.75 10.75 4.75 10.75s4.75-7.58 4.75-10.75A4.75 4.75 0 0010 2.25z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="7" r="1.5" fill="currentColor" />
    </svg>
  )
}

const PROFILE_LIKED_POST_SELECT =
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url'

const PROFILE_COMMENT_SELECT =
  'id,body,created_at,user_id,parent_id,post_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at'

const PROFILE_REPLY_POST_SELECT = PROFILE_LIKED_POST_SELECT

async function hydrateFeedCommentsWithProfiles(supabaseClient, rows) {
  const list = rows || []
  const authorIds = [...new Set(list.map((r) => String(r.user_id || '')).filter(Boolean))]
  let profileBy = {}
  if (authorIds.length > 0) {
    const pr = await supabaseClient
      .from('profiles')
      .select('user_id,handle,display_name,avatar_url,role,is_og')
      .in('user_id', authorIds)
    if (!pr.error && pr.data) {
      profileBy = Object.fromEntries(pr.data.map((p) => [p.user_id, p]))
    }
  }
  return list.map((r) => ({ ...r, author_profile: profileBy[r.user_id] || null }))
}

async function expandFeedCommentsWithAncestors(supabaseClient, seedRows) {
  const byId = new Map()
  for (const row of seedRows || []) {
    if (row?.id) byId.set(String(row.id), row)
  }
  for (;;) {
    const missing = new Set()
    for (const c of byId.values()) {
      const pid = c.parent_id ? String(c.parent_id) : ''
      if (pid && !byId.has(pid)) missing.add(pid)
    }
    if (missing.size === 0) break
    const { data, error } = await supabaseClient
      .from('feed_comments')
      .select(PROFILE_COMMENT_SELECT)
      .in('id', [...missing])
      .is('hidden_at', null)
    if (error) throw error
    for (const row of data || []) {
      byId.set(String(row.id), row)
    }
  }
  return [...byId.values()]
}

function feedCommentPathIds(comment, commentById) {
  const chain = []
  const seen = new Set()
  let cur = comment
  while (cur?.id && !seen.has(String(cur.id))) {
    seen.add(String(cur.id))
    chain.unshift(cur.id)
    const pid = cur.parent_id ? String(cur.parent_id) : ''
    cur = pid ? commentById.get(pid) : null
  }
  return chain
}

const PROFILE_HANDLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function profileTabLabel(id) {
  if (id === 'posts') return 'Posts'
  if (id === 'replies') return 'Replies'
  if (id === 'likes') return 'Likes'
  if (id === 'bookmarks') return 'Bookmarks'
  return id
}

/** Clicks on these targets keep their own action (avatars → profile, @links). */
const PROFILE_REPLY_ROW_SKIP_CLICK =
  'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-badge-tip], [data-lounge-post-interaction-bar], [data-lounge-image-zoom], [data-lounge-video-zoom]'

function patchProfileReplyItemsCount(items, commentId, field, delta) {
  const cid = String(commentId)
  return items.map((item) => ({
    ...item,
    comment:
      String(item.comment?.id) === cid
        ? { ...item.comment, [field]: Math.max(0, (Number(item.comment[field]) || 0) + delta) }
        : item.comment,
    threadComments: (item.threadComments || []).map((row) =>
      String(row?.id) === cid ? { ...row, [field]: Math.max(0, (Number(row[field]) || 0) + delta) } : row,
    ),
  }))
}

export function ProfileReplyRow({ item, postCardProps, onOpenProfileReply, profileBodyScrollRef, onNavigateToProfile }) {
  const { comment, post, pathIds = [], threadComments = [] } = item || {}
  const displayNameFor = postCardProps?.displayNameFor
  const handleFor = postCardProps?.handleFor
  const postAgeLabel = postCardProps?.postAgeLabel
  const postCaption = feedPostDisplayCaption(post)
  const postAvatarRef = useRef(null)
  const connectorRootRef = useRef(null)
  const focusCommentId = String(comment?.id || '')
  const openReplyThread = () => {
    const openFn =
      onOpenProfileReply ||
      postCardProps?.onOpenProfileReply ||
      (postCardProps?.onPostBodyClick && post?.id
        ? () => postCardProps.onPostBodyClick(post, { focusCommentId: comment.id })
        : null)
    if (typeof openFn === 'function') openFn(comment, post)
  }
  const resolveOpenProfile = () =>
    typeof onNavigateToProfile === 'function'
      ? onNavigateToProfile
      : typeof postCardProps?.onAvatarClick === 'function'
        ? postCardProps.onAvatarClick
        : null

  const openProfileFromEntity = (e, entity) => {
    e.stopPropagation()
    if (postCardProps?.openProfileGateIfNeeded?.()) return
    const uid = String(entity?.user_id || '').trim()
    if (!uid) return
    resolveOpenProfile()?.({
      user_id: uid,
      ...(entity?.author_profile && typeof entity.author_profile === 'object'
        ? { author_profile: entity.author_profile }
        : {}),
    })
  }

  const pp = postCardProps || {}
  const safePostAgeLabel = typeof postAgeLabel === 'function' ? postAgeLabel : () => ''
  const hierarchyCardProps = {
    postAgeLabel: safePostAgeLabel,
    displayNameFor,
    handleFor,
    loungeReadOnly: pp.loungeReadOnly,
    viewerUserId: pp.viewerUserId,
    requireLoungeAuth: pp.requireLoungeAuth,
    openProfileGateIfNeeded: pp.openProfileGateIfNeeded,
    onCommentReplyInteraction: (c) => {
      if (pp.openProfileGateIfNeeded?.()) return
      const target = c?.id ? c : comment
      if (typeof onOpenProfileReply === 'function') {
        onOpenProfileReply(target, post, { focusComposer: true })
        return
      }
      if (typeof pp.onOpenProfileReply === 'function') {
        pp.onOpenProfileReply(target, post, { focusComposer: true })
        return
      }
      pp.onCommentReplyInteraction?.(target)
    },
    interactionStateFor:
      typeof pp.interactionStateForComment === 'function' ? pp.interactionStateForComment : () => ({}),
    toggleInteraction:
      typeof pp.commentToggleInteraction === 'function' ? pp.commentToggleInteraction : async () => undefined,
    onPlainRepost: pp.onCommentPlainRepost,
    onUndoPlainRepost: pp.onCommentUndoPlainRepost,
    toggleBookmark: pp.commentToggleInteraction,
    bookmarkedByPost: pp.bookmarkedByPost,
    onToggleCommentLike: pp.onToggleCommentLike,
    onToggleCommentBookmark: pp.onToggleCommentBookmark,
    getCommentBookmarked: pp.getCommentBookmarked,
    repostActionBusy: pp.repostActionBusy,
    onCommentMenuEdit:
      typeof pp.onCommentMenuEdit === 'function' ? (c) => pp.onCommentMenuEdit(c, post) : undefined,
    onCommentMenuDelete:
      typeof pp.onCommentMenuDelete === 'function' ? (c) => pp.onCommentMenuDelete(c, post) : undefined,
    onCommentMenuBlock: pp.onCommentMenuBlock,
    onCommentMenuReport: pp.onCommentMenuReport,
    busyDeletingCommentId: pp.busyDeletingCommentId,
    onAvatarClickProfile: (c) => {
      if (pp.openProfileGateIfNeeded?.()) return
      const uid = String(c?.user_id || '').trim()
      if (!uid) return
      resolveOpenProfile()?.({
        user_id: uid,
        ...(c?.author_profile && typeof c.author_profile === 'object' ? { author_profile: c.author_profile } : {}),
      })
    },
    positionScrollRootRef: profileBodyScrollRef,
    lightboxPortalClass: pp.mediaLightboxPortalClass || 'z-[103]',
    repostMenuPortalClass: pp.repostMenuPortalClass || 'z-[104]',
    resolveMediaFeedVariant: (c) => (String(c?.id) === focusCommentId ? 'detail' : 'commentInline'),
    onMentionClick: pp.onMentionClick,
    onHashtagClick: pp.onHashtagClick,
    onLinkClick: pp.onLinkClick,
    onLinkPreviewOpen: pp.onLinkPreviewOpen,
  }

  if (!post?.id || !comment?.id) return null

  return (
    <article
      tabIndex={0}
      aria-label="View reply in post"
      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer touch-manipulation outline-none [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/35 focus-visible:ring-2 focus-visible:ring-violet-500/40`}
      onClick={(e) => {
        const t = e.target
        if (!(t instanceof Element)) return
        if (t.closest(PROFILE_REPLY_ROW_SKIP_CLICK)) return
        openReplyThread()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        openReplyThread()
      }}
    >
      <div className={`min-w-0 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
        <div ref={connectorRootRef} className="relative min-w-0">
          <div className="flex items-start gap-3">
            <button
              ref={postAvatarRef}
              type="button"
              onClick={(e) => openProfileFromEntity(e, post)}
              className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center font-bold text-white touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent] ${profileAvatarToneClass(
                post?.author_profile?.user_id || post?.user_id || post?.author_profile?.handle || 'member',
              )}`}
              aria-label={`Open profile for ${typeof displayNameFor === 'function' ? displayNameFor(post) : 'member'}`}
              title="View profile"
            >
              {post?.author_profile?.avatar_url ? (
                <img
                  src={post.author_profile.avatar_url}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span>
                  {profileAvatarInitials(
                    post?.author_profile?.display_name,
                    post?.author_profile?.handle || post?.author_profile?.user_id,
                  )}
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => openProfileFromEntity(e, post)}
                className="block w-full min-w-0 text-left hover:text-cyan-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                <div className={LOUNGE_FEED_META_ROW_CLASS}>
                  <LoungeFeedAuthorMetaBadges
                    role={post?.author_profile?.role}
                    isOg={post?.author_profile?.is_og}
                    displayName={typeof displayNameFor === 'function' ? displayNameFor(post) : 'Member'}
                    displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
                  />
                  <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                    <span className="min-w-0 truncate">
                      {typeof handleFor === 'function' ? handleFor(post) : '@member'}
                    </span>
                  </span>
                </div>
              </button>
              {postCaption ? (
                <div
                  className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}
                >
                  <LoungeExpandableRichCaption
                    text={postCaption}
                    captionOpts={{
                      onMentionClick: pp.onMentionClick,
                      onHashtagClick: pp.onHashtagClick,
                      onLinkClick: pp.onLinkClick,
                    }}
                  />
                </div>
              ) : null}
              {feedCommentRowHasMedia(post) ? (
                <LoungePostFeedImagesAndGif
                  post={post}
                  variant="feed"
                  enableLightbox
                  lightboxPortalClass={pp.mediaLightboxPortalClass || 'z-[103]'}
                  firstMarginTopClass={
                    postCaption ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
                  }
                  visibilityResetRootRef={profileBodyScrollRef}
                  streamLightboxHost={post}
                  streamLightboxSurface={{
                    repostMenuPortalClass: pp.repostMenuPortalClass || 'z-[104]',
                    repostMenuScrollRootRef: profileBodyScrollRef,
                  }}
                />
              ) : null}
              {typeof pp.interactionStateFor === 'function' && post?.id ? (
                <LoungePostInteractionBar
                  post={post}
                  variant="feed"
                  rootClassName={LOUNGE_FEED_POST_INTERACTIONS_CLASS}
                  repostMenuPortalClass={pp.repostMenuPortalClass || 'z-[104]'}
                  loungeReadOnly={pp.loungeReadOnly}
                  interactionStateFor={pp.interactionStateFor}
                  toggleInteraction={pp.toggleInteraction}
                  onPlainRepost={pp.onPlainRepost}
                  onUndoPlainRepost={pp.onUndoPlainRepost}
                  onRemoveQuoteRepost={pp.onRemoveQuoteRepost}
                  onQuoteRepost={pp.onQuoteRepost}
                  toggleBookmark={pp.toggleBookmark}
                  bookmarkedByPost={pp.bookmarkedByPost}
                  onOpenComments={pp.onOpenComments}
                  requireLoungeAuth={pp.requireLoungeAuth}
                  openProfileGateIfNeeded={pp.openProfileGateIfNeeded}
                  repostMenuScrollRootRef={profileBodyScrollRef}
                />
              ) : null}
            </div>
          </div>

          {pathIds.length > 0 && threadComments.length > 0 ? (
            <div className="mt-3.5">
              <LoungePostDetailCommentHierarchy
                pathIds={pathIds}
                comments={threadComments}
                postAvatarRef={postAvatarRef}
                connectorRootRef={connectorRootRef}
                isCommentPostDetail
                betweenRowClassName="mt-3.5"
                cardProps={hierarchyCardProps}
              />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default function LoungeProfileFullScreen({
  open,
  panelVisible,
  profileUserId,
  viewerUserId,
  supabaseClient,
  profile,
  posts,
  loading,
  error,
  isOwnProfile,
  onClose,
  onAfterTransitionOut,
  postCardProps,
  onProfileUpdated,
  /** Hydrate `community_feed_posts` rows (repost targets, author profiles); required for Likes/Bookmarks tabs. */
  hydratePosts,
  /** Optional Lounge shell dock (Home / Search / Alerts / Chat) - same actions as main feed dock. */
  shellDock = null,
  /** Open DM with this profile user (Lounge dock Chat). */
  onOpenChatWithUser = null,
  /** Viewer has handle + display and can call chat Edge actions. */
  viewerCanUseLoungeChat = false,
  /** Scroll-linked FAB reveal while profile is open (arc carousel dock). */
  onDockRevealChange = null,
  onShareProfile = null,
  onBlockProfile = null,
  /** Open another member profile from feed rows (replaces modal). */
  onNavigateToProfile = null,
  /** Stacked profile opened from a parent sheet (follow list); uses absolute overlay. */
  stackedOverlay = false,
  /** Root profile opened while Stream video lightbox is up - paint above hero stack before close. */
  stackAboveStreamLightbox = false,
  /** Pause profile scroll-root autoplay when post detail (or other overlay) owns video budget. */
  suspendVideoCoordinator = false,
  /** Settings → Video debug HUD while this profile sheet is the active surface. */
  showVideoDebugHud = false,
  /** Logged-in viewer is profiles.role = admin (may promote/demote moderators). */
  viewerIsAdmin = false,
  /** `(targetUserId, nextRole) => Promise<{ ok: boolean, error?: string }>` */
  onAdminSetProfileRole = null,
  /** `(userId, isFollowing) => void` - sync feed session when follow toggles on profile / follow list. */
  onViewerFollowChange = null,
  /** Settings → Edit profile: open own sheet already in edit mode. */
  requestOwnProfileEditing = false,
  /** Open follow list overlay on mount (`'following'` | `'followers'`). */
  requestFollowListTab = null,
  /** Follower user ids to glow briefly on the Followers tab. */
  highlightFollowerUserIds = [],
  /** Parent reads `{ tab, scrollTop }` for caption navigation return stack. */
  navSnapshotRef = null,
  /** One-shot restore after caption @/# navigation (tab + scroll). */
  navRestore = null,
  onNavRestoreApplied = null,
}) {
  const [tab, setTab] = useState('posts')
  const [adminRoleBusy, setAdminRoleBusy] = useState(false)
  const [adminRoleErr, setAdminRoleErr] = useState('')
  const [interactionPosts, setInteractionPosts] = useState([])
  const [interactionLoading, setInteractionLoading] = useState(false)
  const [interactionErr, setInteractionErr] = useState('')
  const [profileReplies, setProfileReplies] = useState([])
  const [profileRepliesLoading, setProfileRepliesLoading] = useState(false)
  const [profileRepliesErr, setProfileRepliesErr] = useState('')
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [profileFollowsViewer, setProfileFollowsViewer] = useState(false)
  const [iBlockingThem, setIBlockingThem] = useState(false)
  const [theyBlockMe, setTheyBlockMe] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [socialBusy, setSocialBusy] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [locationDraft, setLocationDraft] = useState('')
  const [categoryPillsDraft, setCategoryPillsDraft] = useState([])
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [handleSlugDraft, setHandleSlugDraft] = useState('')
  const [aboutBusy, setAboutBusy] = useState(false)
  const [aboutErr, setAboutErr] = useState('')
  const [bannerBusy, setBannerBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  /** Picked image file awaiting crop modal (own profile). */
  const [avatarCropFile, setAvatarCropFile] = useState(null)
  /** Confirm handle change (7-day rule) or explain cooldown. */
  const [handleChangeDialog, setHandleChangeDialog] = useState(null)
  const [handleConflictDialog, setHandleConflictDialog] = useState(null)
  /** Own profile: overflow menu on banner (⋯). */
  const [ownProfileMenuOpen, setOwnProfileMenuOpen] = useState(false)
  /** Other member profile: Share / Block overflow menu. */
  const [otherProfileMenuOpen, setOtherProfileMenuOpen] = useState(false)
  /** Own profile: after "Edit", show Photo / Banner / About editor. */
  const [ownProfileEditing, setOwnProfileEditing] = useState(false)
  const showOwnEditControls = isOwnProfile && ownProfileEditing
  const bannerInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const ownProfileBannerMenuRef = useRef(null)
  const ownProfileMenuButtonRef = useRef(null)
  const ownProfileMenuPanelRef = useRef(null)
  const otherProfileMenuWrapRef = useRef(null)
  const otherProfileMenuButtonRef = useRef(null)
  const otherProfileMenuPanelRef = useRef(null)
  const profileTopChromeRef = useRef(null)
  const [profileTopChromeHeight, setProfileTopChromeHeight] = useState(52)
  const profileBodyScrollRef = useRef(null)
  const profileDockScrollPrevTopRef = useRef(0)
  const profileDockRevealRef = useRef(1)
  const profileDockScrollRafRef = useRef(0)
  const [profileDockReveal, setProfileDockReveal] = useState(1)
  const [profileDockFooterMeasured, setProfileDockFooterMeasured] = useState(44)
  const wasOwnProfileEditingRef = useRef(false)
  /** @type {['following' | 'followers'] | null} */
  const [followListTab, setFollowListTab] = useState(null)
  /** Profiles opened from a follow list without dismissing the list (back returns to list). */
  const [nestedProfileStack, setNestedProfileStack] = useState([])

  useEffect(() => {
    if (!open || !isOwnProfile) return
    if (requestFollowListTab === 'following' || requestFollowListTab === 'followers') {
      setFollowListTab(requestFollowListTab)
    }
  }, [isOwnProfile, open, profileUserId, requestFollowListTab])

  const navRestoreAppliedRef = useRef(false)
  useLayoutEffect(() => {
    if (!open || !navRestore || navRestoreAppliedRef.current) return
    navRestoreAppliedRef.current = true
    if (navRestore.tab) setTab(navRestore.tab)
    const top = navRestore.scrollTop
    const applyScroll = () => {
      const el = profileBodyScrollRef.current
      if (el && typeof top === 'number') el.scrollTop = top
    }
    applyScroll()
    requestAnimationFrame(() => requestAnimationFrame(applyScroll))
    onNavRestoreApplied?.()
  }, [navRestore, onNavRestoreApplied, open])

  useEffect(() => {
    if (!open) navRestoreAppliedRef.current = false
  }, [open])

  useEffect(() => {
    if (!open || !navSnapshotRef) return
    const el = profileBodyScrollRef.current
    const sync = () => {
      navSnapshotRef.current = { tab, scrollTop: el?.scrollTop ?? 0 }
    }
    sync()
    el?.addEventListener('scroll', sync, { passive: true })
    return () => el?.removeEventListener('scroll', sync)
  }, [navSnapshotRef, open, tab])

  const profilePostRowPerfStyle = useMemo(() => loungeFeedPostRowPerfStyle(), [])

  const displayName = String(profile?.display_name || profile?.handle || 'Member').trim() || 'Member'
  const handle = profile?.handle ? `@${String(profile.handle).trim()}` : '@member'
  const aboutDisplay = String(profile?.about_me || profile?.bio || '').trim()
  const locationDisplay = normalizeProfileLocation(profile?.location)
  const profileInterestPills = profileCategoryPills(profile)
  const profileTabsVisible = isOwnProfile ? PROFILE_TAB_IDS : PROFILE_TAB_IDS.slice(0, 2)
  const targetProfileRole = String(profile?.role || 'user').trim().toLowerCase()
  const canAdminPromoteModerator =
    Boolean(viewerIsAdmin && !isOwnProfile && onAdminSetProfileRole && targetProfileRole === 'user')
  const canAdminDemoteModerator =
    Boolean(viewerIsAdmin && !isOwnProfile && onAdminSetProfileRole && targetProfileRole === 'moderator')

  useEffect(() => {
    setAdminRoleErr('')
    setAdminRoleBusy(false)
  }, [profileUserId])

  const runAdminProfileRoleChange = useCallback(
    async (nextRole) => {
      if (!onAdminSetProfileRole || !profileUserId || adminRoleBusy) return
      const label =
        nextRole === 'moderator'
          ? `Promote ${displayName} to moderator? They can pin posts and staff-delete in Lounge.`
          : `Remove moderator role from ${displayName}?`
      if (!window.confirm(label)) return
      setAdminRoleBusy(true)
      setAdminRoleErr('')
      setOtherProfileMenuOpen(false)
      try {
        const result = await onAdminSetProfileRole(profileUserId, nextRole)
        if (!result?.ok) {
          setAdminRoleErr(result?.error || 'Could not update role.')
        }
      } catch (e) {
        setAdminRoleErr(e instanceof Error ? e.message : 'Could not update role.')
      } finally {
        setAdminRoleBusy(false)
      }
    },
    [adminRoleBusy, displayName, onAdminSetProfileRole, profileUserId],
  )
  const profileTabBtnClass =
    profileTabsVisible.length > 2 ? 'min-h-11 px-1 text-[13px]' : 'min-h-11 px-2 text-[15px]'
  const profileAutoplayPostCount =
    tab === 'posts'
      ? posts.length
      : tab === 'likes' || tab === 'bookmarks'
        ? interactionPosts.length
        : tab === 'replies'
          ? profileReplies.length
          : 0
  const profileFabBottomPadPx =
    shellDock && !showOwnEditControls ? LOUNGE_DOCK_FAB_SIZE_PX + 28 : 0

  /** Drop rows from Likes/Bookmarks lists after successful unlike / un-bookmark on that tab. */
  const postCardPropsForLists = useMemo(() => {
    const base = postCardProps
    if (!base) return base
    const wrapBm =
      typeof base.toggleBookmark === 'function'
        ? async (postId) => {
            const r = await base.toggleBookmark(postId)
            if (r?.ok && tab === 'bookmarks' && r.bookmarked === false) {
              setInteractionPosts((prev) => prev.filter((p) => p.id !== postId))
            }
            return r
          }
        : base.toggleBookmark
    const wrapLike =
      typeof base.toggleInteraction === 'function'
        ? async (postId, key) => {
            const r = await base.toggleInteraction(postId, key)
            if (r?.ok && tab === 'likes' && key === 'liked' && r.liked === false) {
              setInteractionPosts((prev) => prev.filter((p) => p.id !== postId))
            }
            return r
          }
        : base.toggleInteraction
    const wrapCommentLike =
      typeof base.onToggleCommentLike === 'function' && typeof base.interactionStateForComment === 'function'
        ? async (commentId) => {
            const was = !!base.interactionStateForComment(commentId)?.liked
            setProfileReplies((prev) => patchProfileReplyItemsCount(prev, commentId, 'like_count', was ? -1 : 1))
            await base.onToggleCommentLike(commentId)
          }
        : base.onToggleCommentLike
    const wrapCommentBookmark =
      typeof base.onToggleCommentBookmark === 'function' && typeof base.getCommentBookmarked === 'function'
        ? async (commentId) => {
            const was = !!base.getCommentBookmarked(commentId)
            setProfileReplies((prev) =>
              patchProfileReplyItemsCount(prev, commentId, 'bookmark_count', was ? -1 : 1),
            )
            await base.onToggleCommentBookmark(commentId)
          }
        : base.onToggleCommentBookmark
    const wrapCommentPlainRepost =
      typeof base.onCommentPlainRepost === 'function' && typeof base.interactionStateForComment === 'function'
        ? (p) => {
            const was = !!base.interactionStateForComment(p?.id)?.reposted
            if (!was) setProfileReplies((prev) => patchProfileReplyItemsCount(prev, p.id, 'repost_count', 1))
            base.onCommentPlainRepost(p)
          }
        : base.onCommentPlainRepost
    const wrapCommentUndoRepost =
      typeof base.onCommentUndoPlainRepost === 'function' && typeof base.interactionStateForComment === 'function'
        ? (p) => {
            const was = !!base.interactionStateForComment(p?.id)?.reposted
            if (was) setProfileReplies((prev) => patchProfileReplyItemsCount(prev, p.id, 'repost_count', -1))
            base.onCommentUndoPlainRepost(p)
          }
        : base.onCommentUndoPlainRepost
    return {
      ...base,
      toggleBookmark: wrapBm,
      toggleInteraction: wrapLike,
      onToggleCommentLike: wrapCommentLike,
      onToggleCommentBookmark: wrapCommentBookmark,
      onCommentPlainRepost: wrapCommentPlainRepost,
      onCommentUndoPlainRepost: wrapCommentUndoRepost,
    }
  }, [postCardProps, tab])

  useEffect(() => {
    if (!open || tab !== 'replies') {
      return
    }
    if (profileReplies.length === 0) return
    const hydrate = postCardProps?.hydrateCommentInteractionsForIds
    if (typeof hydrate !== 'function') return
    const ids = []
    for (const item of profileReplies) {
      for (const row of item.threadComments || []) {
        if (row?.id) ids.push(row.id)
      }
    }
    void hydrate(ids)
  }, [open, tab, profileReplies, postCardProps?.hydrateCommentInteractionsForIds])

  useEffect(() => {
    if (!open || !profileUserId) return
    setTab('posts')
    setOwnProfileMenuOpen(false)
    setOwnProfileEditing(false)
    setDisplayNameDraft('')
    setHandleSlugDraft('')
    setHandleChangeDialog(null)
    setHandleConflictDialog(null)
    setAvatarCropFile(null)
    setInteractionPosts([])
    setInteractionErr('')
    setInteractionLoading(false)
    setProfileReplies([])
    setProfileRepliesErr('')
    setProfileRepliesLoading(false)
  }, [open, profileUserId])

  useEffect(() => {
    if (!open || !isOwnProfile || !requestOwnProfileEditing) return
    setAboutErr('')
    setOwnProfileEditing(true)
  }, [open, isOwnProfile, requestOwnProfileEditing, profileUserId])

  useEffect(() => {
    if (!ownProfileEditing || !isOwnProfile || profile?.user_id == null) return
    setDisplayNameDraft(String(profile.display_name ?? '').trim().slice(0, 24))
    setHandleSlugDraft(String(profile.handle ?? '').trim())
  }, [ownProfileEditing, isOwnProfile, open, profile?.user_id, profile?.display_name, profile?.handle])

  useEffect(() => {
    if (!open || !profileUserId) return
    setAboutDraft(String(profile?.about_me ?? profile?.bio ?? '').slice(0, 140))
    setLocationDraft(normalizeProfileLocation(profile?.location))
    setCategoryPillsDraft(profileCategoryPills(profile))
  }, [open, profileUserId, profile?.about_me, profile?.bio, profile?.location, profile?.category_pills])

  useEffect(() => {
    if (!ownProfileEditing || !isOwnProfile || profile?.user_id == null) return
    setLocationDraft(normalizeProfileLocation(profile?.location))
    setCategoryPillsDraft(profileCategoryPills(profile))
  }, [ownProfileEditing, isOwnProfile, profile?.user_id, profile?.location, profile?.category_pills])

  useEffect(() => {
    if (!open || !isOwnProfile || !profileUserId || (tab !== 'likes' && tab !== 'bookmarks')) {
      setInteractionLoading(false)
      return
    }
    if (typeof hydratePosts !== 'function') {
      setInteractionErr('Could not load saved posts.')
      setInteractionPosts([])
      setInteractionLoading(false)
      return
    }
    let cancelled = false
    setInteractionLoading(true)
    setInteractionErr('')
    ;(async () => {
      try {
        const linkTable = tab === 'likes' ? 'post_likes' : 'post_bookmarks'
        const { data: links, error: le } = await supabaseClient
          .from(linkTable)
          .select('post_id, created_at')
          .eq('user_id', profileUserId)
          .order('created_at', { ascending: false })
          .limit(80)
        if (le) throw le
        const orderedIds = []
        const seen = new Set()
        for (const row of links || []) {
          const pid = row.post_id
          if (pid == null || pid === '') continue
          const key = String(pid)
          if (seen.has(key)) continue
          seen.add(key)
          orderedIds.push(pid)
        }
        if (orderedIds.length === 0) {
          if (!cancelled) setInteractionPosts([])
          return
        }
        const { data: postRows, error: pe } = await supabaseClient
          .from('community_feed_posts')
          .select(PROFILE_LIKED_POST_SELECT)
          .in('id', orderedIds)
          .is('hidden_at', null)
        if (pe) throw pe
        const rank = new Map(orderedIds.map((id, i) => [String(id), i]))
        const sorted = (postRows || []).slice().sort((a, b) => {
          const ia = rank.get(String(a.id)) ?? 9999
          const ib = rank.get(String(b.id)) ?? 9999
          return ia - ib
        })
        const hydrated = await hydratePosts(sorted)
        if (!cancelled) setInteractionPosts(hydrated || [])
        const refreshFn = postCardProps?.refreshPostInteractions
        if (!cancelled && typeof refreshFn === 'function' && hydrated?.length) {
          void refreshFn([...collectLoungePostInteractionHydrateIds(hydrated)])
        }
      } catch (e) {
        if (!cancelled) {
          setInteractionErr(e?.message || 'Could not load.')
          setInteractionPosts([])
        }
      } finally {
        if (!cancelled) setInteractionLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tab, isOwnProfile, profileUserId, supabaseClient, hydratePosts, postCardProps?.refreshPostInteractions])

  useEffect(() => {
    if (!open || !profileUserId || tab !== 'replies') {
      setProfileRepliesLoading(false)
      return
    }
    if (typeof hydratePosts !== 'function') {
      setProfileRepliesErr('Could not load replies.')
      setProfileReplies([])
      setProfileRepliesLoading(false)
      return
    }
    let cancelled = false
    setProfileRepliesLoading(true)
    setProfileRepliesErr('')
    ;(async () => {
      try {
        const { data: commentRows, error: ce } = await supabaseClient
          .from('feed_comments')
          .select(PROFILE_COMMENT_SELECT)
          .eq('user_id', profileUserId)
          .is('hidden_at', null)
          .order('created_at', { ascending: false })
          .limit(50)
        if (ce) throw ce
        const comments = commentRows || []
        if (comments.length === 0) {
          if (!cancelled) setProfileReplies([])
          return
        }
        const postIds = []
        const seenPostIds = new Set()
        for (const row of comments) {
          const pid = row.post_id
          if (pid == null || pid === '') continue
          const key = String(pid)
          if (seenPostIds.has(key)) continue
          seenPostIds.add(key)
          postIds.push(pid)
        }
        if (postIds.length === 0) {
          if (!cancelled) setProfileReplies([])
          return
        }
        const { data: postRows, error: pe } = await supabaseClient
          .from('community_feed_posts')
          .select(PROFILE_REPLY_POST_SELECT)
          .in('id', postIds)
          .is('hidden_at', null)
        if (pe) throw pe
        const hydratedPosts = await hydratePosts(postRows || [])
        const postById = new Map((hydratedPosts || []).map((p) => [String(p.id), p]))
        const expandedRows = await expandFeedCommentsWithAncestors(supabaseClient, comments)
        const hydratedComments = await hydrateFeedCommentsWithProfiles(supabaseClient, expandedRows)
        const commentById = new Map(hydratedComments.map((c) => [String(c.id), c]))
        const authorProfile =
          profile && typeof profile === 'object'
            ? {
                user_id: profile.user_id,
                display_name: profile.display_name,
                handle: profile.handle,
                avatar_url: profile.avatar_url,
                role: profile.role,
                is_og: profile.is_og,
              }
            : null
        const items = []
        for (const comment of comments) {
          const post = postById.get(String(comment.post_id))
          if (!post?.id) continue
          const focusComment = authorProfile
            ? { ...(commentById.get(String(comment.id)) || comment), author_profile: authorProfile }
            : commentById.get(String(comment.id)) || comment
          const pathIds = feedCommentPathIds(focusComment, commentById)
          const threadComments = pathIds
            .map((id) => commentById.get(String(id)))
            .filter(Boolean)
            .map((row) =>
              String(row.id) === String(focusComment.id) && authorProfile
                ? { ...row, author_profile: authorProfile }
                : row,
            )
          items.push({
            comment: focusComment,
            post,
            pathIds,
            threadComments,
          })
        }
        if (!cancelled) setProfileReplies(items)
      } catch (e) {
        if (!cancelled) {
          setProfileRepliesErr(e?.message || 'Could not load replies.')
          setProfileReplies([])
        }
      } finally {
        if (!cancelled) setProfileRepliesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tab, profileUserId, supabaseClient, hydratePosts, profile])

  useEffect(() => {
    if (!open) {
      setOwnProfileMenuOpen(false)
      setOtherProfileMenuOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!ownProfileMenuOpen) return
    const onDown = (e) => {
      const wrap = ownProfileBannerMenuRef.current
      const panel = ownProfileMenuPanelRef.current
      const t = e.target
      if (t instanceof Node) {
        if (wrap?.contains(t)) return
        if (panel?.contains(t)) return
      }
      setOwnProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [ownProfileMenuOpen])

  useEffect(() => {
    if (!otherProfileMenuOpen) return
    const onDown = (e) => {
      const wrap = otherProfileMenuWrapRef.current
      const panel = otherProfileMenuPanelRef.current
      const t = e.target
      if (t instanceof Node) {
        if (wrap?.contains(t)) return
        if (panel?.contains(t)) return
      }
      setOtherProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [otherProfileMenuOpen])

  const placeOwnProfileMenu = useCallback(() => {
    const btn = ownProfileMenuButtonRef.current
    const panel = ownProfileMenuPanelRef.current
    if (!btn || !panel) return
    const r = btn.getBoundingClientRect()
    const margin = 6
    const vh = window.innerHeight
    const vw = document.documentElement.clientWidth
    const panelH = panel.offsetHeight || 52
    let top = r.bottom + margin
    if (top + panelH > vh - margin) {
      top = Math.max(margin, r.top - margin - panelH)
    }
    if (top + panelH > vh - margin) {
      top = Math.max(margin, vh - panelH - margin)
    }
    panel.style.position = 'fixed'
    panel.style.zIndex = '200'
    panel.style.top = `${top}px`
    panel.style.bottom = 'auto'
    panel.style.right = `${Math.max(margin, vw - r.right)}px`
    panel.style.left = 'auto'
    panel.style.minWidth = '11.5rem'
    panel.style.maxWidth = `min(18rem, calc(100vw - ${margin * 2}px))`
  }, [])

  useLayoutEffect(() => {
    if (!ownProfileMenuOpen) return
    const panel = ownProfileMenuPanelRef.current
    const run = () => {
      requestAnimationFrame(() => placeOwnProfileMenu())
    }
    run()
    const onRe = () => run()
    window.addEventListener('resize', onRe)
    window.addEventListener('scroll', onRe, true)
    return () => {
      window.removeEventListener('resize', onRe)
      window.removeEventListener('scroll', onRe, true)
      if (panel) {
        panel.style.position = ''
        panel.style.zIndex = ''
        panel.style.top = ''
        panel.style.bottom = ''
        panel.style.right = ''
        panel.style.left = ''
        panel.style.minWidth = ''
        panel.style.maxWidth = ''
      }
    }
  }, [ownProfileMenuOpen, placeOwnProfileMenu])

  const placeOtherProfileMenu = useCallback(() => {
    const btn = otherProfileMenuButtonRef.current
    const panel = otherProfileMenuPanelRef.current
    if (!btn || !panel) return
    const r = btn.getBoundingClientRect()
    const margin = 6
    const vh = window.innerHeight
    const vw = document.documentElement.clientWidth
    const panelH = panel.offsetHeight || 96
    let top = r.bottom + margin
    if (top + panelH > vh - margin) {
      top = Math.max(margin, r.top - margin - panelH)
    }
    if (top + panelH > vh - margin) {
      top = Math.max(margin, vh - panelH - margin)
    }
    panel.style.position = 'fixed'
    panel.style.zIndex = '200'
    panel.style.top = `${top}px`
    panel.style.bottom = 'auto'
    panel.style.right = `${Math.max(margin, vw - r.right)}px`
    panel.style.left = 'auto'
    panel.style.minWidth = '11rem'
    panel.style.maxWidth = `min(18rem, calc(100vw - ${margin * 2}px))`
  }, [])

  useLayoutEffect(() => {
    if (!otherProfileMenuOpen) return
    const panel = otherProfileMenuPanelRef.current
    const run = () => {
      requestAnimationFrame(() => placeOtherProfileMenu())
    }
    run()
    const onRe = () => run()
    window.addEventListener('resize', onRe)
    window.addEventListener('scroll', onRe, true)
    return () => {
      window.removeEventListener('resize', onRe)
      window.removeEventListener('scroll', onRe, true)
      if (panel) {
        panel.style.position = ''
        panel.style.zIndex = ''
        panel.style.top = ''
        panel.style.bottom = ''
        panel.style.right = ''
        panel.style.left = ''
        panel.style.minWidth = ''
        panel.style.maxWidth = ''
      }
    }
  }, [otherProfileMenuOpen, placeOtherProfileMenu])

  const profileTopChromeSlidePx =
    (1 - profileDockReveal) * (profileTopChromeHeight > 0 ? profileTopChromeHeight : 52)

  /** After edit mode (keyboard / overflow-hidden), scroll position or iOS visual viewport can leave the banner chrome clipped. */
  useLayoutEffect(() => {
    const was = wasOwnProfileEditingRef.current
    wasOwnProfileEditingRef.current = showOwnEditControls
    if (!was || showOwnEditControls) return
    const el = profileBodyScrollRef.current
    const reset = () => {
      if (el) el.scrollTop = 0
      try {
        window.scrollTo(0, 0)
        const vv = window.visualViewport
        if (vv && typeof vv.scrollTo === 'function') {
          vv.scrollTo({ left: 0, top: 0, behavior: 'instant' })
        }
      } catch {
        // ignore
      }
    }
    reset()
    requestAnimationFrame(reset)
    const t = window.setTimeout(reset, 120)
    return () => window.clearTimeout(t)
  }, [showOwnEditControls])

  const exitOwnProfileEditing = useCallback((opts) => {
    setOwnProfileMenuOpen(false)
    setOwnProfileEditing(false)
    const fromProfile = String(profile?.about_me ?? profile?.bio ?? '').slice(0, 140)
    setAboutDraft(
      opts?.nextAboutDraft !== undefined ? String(opts.nextAboutDraft).slice(0, 140) : fromProfile
    )
    setDisplayNameDraft(
      opts?.nextDisplayName !== undefined
        ? String(opts.nextDisplayName).trim().slice(0, 24)
        : String(profile?.display_name || '').trim().slice(0, 24)
    )
    setHandleSlugDraft(
      opts?.nextHandle !== undefined ? String(opts.nextHandle || '').trim() : String(profile?.handle || '').trim()
    )
    if (opts?.nextLocation !== undefined) {
      setLocationDraft(normalizeProfileLocation(opts.nextLocation))
    } else {
      setLocationDraft(normalizeProfileLocation(profile?.location))
    }
    if (opts?.nextCategoryPills !== undefined) {
      setCategoryPillsDraft(normalizeLoungeProfileCategoryPills(opts.nextCategoryPills))
    } else {
      setCategoryPillsDraft(profileCategoryPills(profile))
    }
    setAboutErr('')
    if (typeof document !== 'undefined') {
      try {
        const el = document.activeElement
        if (el && typeof el.blur === 'function') el.blur()
      } catch {
        // ignore
      }
    }
  }, [profile?.about_me, profile?.bio, profile?.display_name, profile?.handle, profile?.location, profile?.category_pills])

  const refreshSocial = useCallback(async () => {
    if (!profileUserId || !viewerUserId) {
      setFollowerCount(0)
      setFollowingCount(0)
      setIsFollowing(false)
      setIsSubscribed(false)
      setProfileFollowsViewer(false)
      setIBlockingThem(false)
      setTheyBlockMe(false)
      return
    }
    try {
      const [followersRes, followingRes, followRow, subRow, reverseFollow, blockStatus] = await Promise.all([
        supabaseClient
          .from('profile_follows')
          .select('follower_id', { count: 'exact', head: true })
          .eq('following_id', profileUserId),
        supabaseClient
          .from('profile_follows')
          .select('following_id', { count: 'exact', head: true })
          .eq('follower_id', profileUserId),
        supabaseClient
          .from('profile_follows')
          .select('follower_id')
          .eq('follower_id', viewerUserId)
          .eq('following_id', profileUserId)
          .maybeSingle(),
        supabaseClient
          .from('profile_post_subscriptions')
          .select('subscriber_id')
          .eq('subscriber_id', viewerUserId)
          .eq('publisher_id', profileUserId)
          .maybeSingle(),
        supabaseClient
          .from('profile_follows')
          .select('follower_id')
          .eq('follower_id', profileUserId)
          .eq('following_id', viewerUserId)
          .maybeSingle(),
        chatGetBlockStatus(supabaseClient, viewerUserId, profileUserId),
      ])
      setFollowerCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setIsFollowing(!!followRow.data)
      setIsSubscribed(!!subRow.data)
      setProfileFollowsViewer(!!reverseFollow.data)
      setIBlockingThem(blockStatus.iBlockThem)
      setTheyBlockMe(blockStatus.theyBlockMe)
    } catch {
      setFollowerCount(0)
      setFollowingCount(0)
    }
  }, [profileUserId, supabaseClient, viewerUserId])

  useEffect(() => {
    if (!open || !panelVisible) return
    const raf = window.requestAnimationFrame(() => {
      void refreshSocial()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [open, panelVisible, refreshSocial])

  useEffect(() => {
    if (!open || !panelVisible) return
    profileDockRevealRef.current = 1
    setProfileDockReveal(1)
    onDockRevealChange?.(1)
    const el = profileBodyScrollRef.current
    if (el) profileDockScrollPrevTopRef.current = el.scrollTop
  }, [open, panelVisible, onDockRevealChange])

  useEffect(() => {
    const el = profileBodyScrollRef.current
    if (!el || typeof window === 'undefined') return
    if (showOwnEditControls || !open || !panelVisible) return
    profileDockScrollPrevTopRef.current = el.scrollTop
    const titleRevealPerScrollPx = 220
    const titleHidePerScrollPx = 190
    const maxAbsScrollStepPx = 180
    const minScrollStepPx = 0.35
    const queueFlush = () => {
      if (profileDockScrollRafRef.current) return
      profileDockScrollRafRef.current = window.requestAnimationFrame(() => {
        profileDockScrollRafRef.current = 0
        const r = profileDockRevealRef.current
        setProfileDockReveal(r)
        onDockRevealChange?.(r)
      })
    }
    const onScroll = () => {
      const st = el.scrollTop
      const prev = profileDockScrollPrevTopRef.current
      const rawDelta = st - prev
      profileDockScrollPrevTopRef.current = st
      const eff =
        rawDelta === 0 ? 0 : Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxAbsScrollStepPx)
      let r = profileDockRevealRef.current
      if (st <= 2) {
        r = 1
      } else if (eff < -minScrollStepPx) {
        r = Math.min(1, r + (-eff) / titleRevealPerScrollPx)
      } else if (eff > minScrollStepPx) {
        r = Math.max(0, r - eff / titleHidePerScrollPx)
      }
      if (r !== profileDockRevealRef.current) {
        profileDockRevealRef.current = r
        queueFlush()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (profileDockScrollRafRef.current) window.cancelAnimationFrame(profileDockScrollRafRef.current)
    }
  }, [onDockRevealChange, showOwnEditControls, open, panelVisible])

  useEffect(() => {
    if (!showOwnEditControls) return
    profileDockRevealRef.current = 1
    setProfileDockReveal(1)
    onDockRevealChange?.(1)
  }, [showOwnEditControls, onDockRevealChange])

  useLayoutEffect(() => {
    const bar = profileTopChromeRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setProfileTopChromeHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [open, panelVisible, isOwnProfile])

  const toggleFollow = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || socialBusy) return
    setSocialBusy(true)
    const wasFollowing = isFollowing
    try {
      if (wasFollowing) {
        await supabaseClient
          .from('profile_follows')
          .delete()
          .eq('follower_id', viewerUserId)
          .eq('following_id', profileUserId)
      } else {
        await supabaseClient.from('profile_follows').insert({
          follower_id: viewerUserId,
          following_id: profileUserId,
        })
      }
      const nowFollowing = !wasFollowing
      setIsFollowing(nowFollowing)
      onViewerFollowChange?.(profileUserId, nowFollowing)
      await refreshSocial()
    } finally {
      setSocialBusy(false)
    }
  }

  const toggleSubscribe = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || socialBusy) return
    setSocialBusy(true)
    try {
      if (isSubscribed) {
        await supabaseClient
          .from('profile_post_subscriptions')
          .delete()
          .eq('subscriber_id', viewerUserId)
          .eq('publisher_id', profileUserId)
      } else {
        await supabaseClient.from('profile_post_subscriptions').insert({
          subscriber_id: viewerUserId,
          publisher_id: profileUserId,
        })
      }
      setIsSubscribed((v) => !v)
    } finally {
      setSocialBusy(false)
    }
  }

  const toggleBlock = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || blockBusy) return
    const confirmed = iBlockingThem
      ? window.confirm('Unblock this member? They will be able to message you again.')
      : window.confirm('Block this member? They will not be able to send you messages.')
    if (!confirmed) return
    setBlockBusy(true)
    try {
      if (iBlockingThem) {
        await chatUnblockUser(supabaseClient, profileUserId)
        setIBlockingThem(false)
      } else {
        await chatBlockUser(supabaseClient, profileUserId)
        setIBlockingThem(true)
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not update block status.')
    } finally {
      setBlockBusy(false)
    }
  }

  const saveProfileEdits = async (opts) => {
    if (!isOwnProfile || !viewerUserId || aboutBusy) return
    const nextAbout = String(aboutDraft || '').trim().slice(0, 140)
    const nextLocation = normalizeProfileLocation(locationDraft)
    const nextCategoryPills = normalizeLoungeProfileCategoryPills(categoryPillsDraft)
    const dn = String(displayNameDraft || '').trim().slice(0, 24)
    if (!dn) {
      setAboutErr('Display name is required.')
      return
    }
    const nextHandle = normalizeHandle(opts?.forcedHandle ?? handleSlugDraft)
    if (!nextHandle) {
      setAboutErr('Handle must be at least 2 characters (letters, numbers, underscore).')
      return
    }
    const serverHandle = normalizeHandle(String(profile?.handle || ''))
    const handleChanging = Boolean(serverHandle) && nextHandle !== serverHandle
    const lastAt = profile?.handle_changed_at ? new Date(profile.handle_changed_at) : null
    const inCooldown =
      lastAt != null &&
      !Number.isNaN(lastAt.getTime()) &&
      Date.now() - lastAt.getTime() < PROFILE_HANDLE_COOLDOWN_MS

    if (!opts?.skipHandlePrompts && handleChanging) {
      if (inCooldown) {
        setHandleChangeDialog({
          kind: 'cooldown',
          unlockAt: new Date(lastAt.getTime() + PROFILE_HANDLE_COOLDOWN_MS).toISOString(),
        })
        return
      }
      setHandleChangeDialog({ kind: 'confirm' })
      return
    }

    const handleForSave = opts?.preserveServerHandle ? serverHandle : nextHandle
    if (!handleForSave) {
      setAboutErr('Handle must be at least 2 characters (letters, numbers, underscore).')
      return
    }

    if (!opts?.preserveServerHandle && !opts?.skipHandleConflictCheck && !opts?.forcedHandle) {
      const availability = await checkProfileHandleAvailability({
        supabaseClient,
        requestedHandle: handleForSave,
        excludeUserId: viewerUserId,
      })
      if (!availability.ok && availability.reason !== 'invalid') {
        setHandleConflictDialog({
          requestedHandle: availability.handle,
          reason: availability.reason,
          suggestedHandle: availability.suggestedHandle,
          resumeSaveOpts: opts,
        })
        return
      }
      if (!availability.ok) {
        setAboutErr('Handle must be at least 2 characters (letters, numbers, underscore).')
        return
      }
    }

    setAboutErr('')
    setAboutBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setAboutErr('You must be signed in.')
        return
      }
      const { data: identityRow, error: idErr } = await saveProfileWithHandleFallback({
        supabaseClient,
        user: session.user,
        displayName: dn,
        requestedHandle: handleForSave,
        strictHandle: true,
      })
      if (idErr || !identityRow) {
        if (isProfileHandleUniqueViolation(idErr) && !opts?.preserveServerHandle) {
          const suggestedHandle = await suggestAvailableProfileHandle(
            supabaseClient,
            handleForSave,
            viewerUserId,
          )
          setHandleConflictDialog({
            requestedHandle: handleForSave,
            reason: 'taken',
            suggestedHandle,
            resumeSaveOpts: opts,
          })
          return
        }
        const raw = formatProfileSaveDebugError(idErr, 'Save profile')
        if (/PROFILE_HANDLE_CHANGE_COOLDOWN|once every 7 days|handle change cooldown/i.test(raw)) {
          setAboutErr('You can only change your handle once every 7 days. Try again later.')
          return
        }
        setAboutErr(raw)
        return
      }
      const { error: upErr } = await supabaseClient
        .from('profiles')
        .update({
          about_me: nextAbout || null,
          location: nextLocation || null,
          category_pills: nextCategoryPills,
        })
        .eq('user_id', viewerUserId)
      if (upErr) {
        const raw = String(upErr.message || '')
        if (/about_me|location|category_pills|schema cache/i.test(raw)) {
          setAboutErr(
            'Profile fields need the latest SQL. In Supabase → SQL Editor, run supabase/profile_lounge_fullscreen.sql and supabase/profile_category_pills.sql, then save again.'
          )
          return
        }
        setAboutErr(raw || 'Could not save profile.')
        return
      }
      try {
        const ae = document.activeElement
        if (ae && typeof ae.blur === 'function') ae.blur()
      } catch {
        // ignore
      }
      try {
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
        const vv = window.visualViewport
        if (vv && typeof vv.scrollTo === 'function') {
          vv.scrollTo({ left: 0, top: 0, behavior: 'instant' })
        }
      } catch {
        // ignore
      }
      onProfileUpdated?.({
        ...profile,
        ...identityRow,
        about_me: nextAbout || null,
        location: nextLocation || null,
        category_pills: nextCategoryPills,
      })
      exitOwnProfileEditing({
        nextAboutDraft: nextAbout,
        nextLocation: nextLocation || null,
        nextCategoryPills: nextCategoryPills,
        nextDisplayName: identityRow.display_name,
        nextHandle: identityRow.handle,
      })
    } finally {
      setAboutBusy(false)
    }
  }

  const onPickBanner = async (e) => {
    const file = e.target?.files?.[0]
    try {
      e.target.value = ''
    } catch {
      // ignore
    }
    if (!file || !isOwnProfile || !viewerUserId || bannerBusy) return
    setBannerBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) return
      const { data: url, error: up } = await uploadProfileBanner({ supabaseClient, user: session.user, file })
      if (up) {
        const raw = String(up.message || '')
        if (/bucket not found|404/i.test(raw) || String(up.statusCode || up.code || '') === '404') {
          window.alert(
            'The profile-banners storage bucket is missing. In Supabase → SQL Editor, run supabase/profile_lounge_fullscreen.sql (includes the bucket at the end), then try again.'
          )
          return
        }
        window.alert(formatProfileSaveDebugError(up, 'Banner upload'))
        return
      }
      const { error: dbErr } = await supabaseClient
        .from('profiles')
        .update({ banner_url: url || null })
        .eq('user_id', viewerUserId)
      if (dbErr) {
        const raw = String(dbErr.message || '')
        if (/banner_url|schema cache/i.test(raw)) {
          window.alert(
            'Banner needs the profiles.banner_url column. In Supabase → SQL Editor, run supabase/profile_lounge_fullscreen.sql (after feed_phase_a), then try again.'
          )
          return
        }
        window.alert(raw || 'Could not save banner.')
        return
      }
      onProfileUpdated?.({ ...profile, banner_url: url || null })
    } finally {
      setBannerBusy(false)
    }
  }

  const finalizeAvatarUpload = useCallback(
    async (file) => {
      if (!file || !isOwnProfile || !viewerUserId) return
      setAvatarBusy(true)
      try {
        const { file: ready, error: compressErr } = await prepareAvatarImageForUpload(file)
        if (compressErr) {
          window.alert(compressErr.message || 'Could not process that image.')
          return
        }
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        if (!session?.user) return
        const { data: url, error: up } = await uploadProfileAvatar({ supabaseClient, user: session.user, file: ready })
        if (up) {
          window.alert(formatProfileSaveDebugError(up, 'Avatar upload'))
          return
        }
        const { error: dbErr } = await supabaseClient
          .from('profiles')
          .update({ avatar_url: url || null })
          .eq('user_id', viewerUserId)
        if (dbErr) {
          window.alert(dbErr.message || 'Could not save profile photo.')
          return
        }
        onProfileUpdated?.({ ...profile, avatar_url: url || null })
      } finally {
        setAvatarBusy(false)
      }
    },
    [isOwnProfile, viewerUserId, supabaseClient, profile, onProfileUpdated]
  )

  const onPickAvatar = (e) => {
    const raw = e.target?.files?.[0]
    try {
      e.target.value = ''
    } catch {
      // ignore
    }
    if (!raw || !isOwnProfile || !viewerUserId || avatarBusy) return
    if (!isProbablyImageFile(raw)) {
      window.alert('Please choose an image file.')
      return
    }
    setAvatarCropFile(raw)
  }

  const onAvatarCropCancel = useCallback(() => {
    setAvatarCropFile(null)
  }, [])

  const onAvatarCropApply = useCallback(
    async (croppedFile) => {
      setAvatarCropFile(null)
      await finalizeAvatarUpload(croppedFile)
    },
    [finalizeAvatarUpload]
  )

  useEffect(() => {
    if (!open) {
      setFollowListTab(null)
      setNestedProfileStack([])
    }
  }, [open])

  const openNestedProfileFromFollowList = useCallback(
    (entity) => {
      const uid = String(entity?.user_id || '').trim()
      if (!uid || !hydratePosts) return
      const stub =
        entity?.author_profile && typeof entity.author_profile === 'object'
          ? entity.author_profile
          : {}
      setNestedProfileStack((prev) => [
        ...prev,
        {
          userId: uid,
          profile: { user_id: uid, ...stub },
          posts: [],
          loading: true,
          error: '',
        },
      ])
      void (async () => {
        try {
          const { profile, profileErr } = await fetchLoungeProfileRow(supabaseClient, uid, stub)
          setNestedProfileStack((prev) =>
            prev.map((layer) =>
              layer.userId === uid
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    error: profileErr || layer.error,
                  }
                : layer,
            ),
          )

          const { posts, postsErr } = await fetchLoungeProfilePosts(supabaseClient, uid, hydratePosts, {
            limit: LOUNGE_PROFILE_POST_INITIAL_LIMIT,
          })
          setNestedProfileStack((prev) =>
            prev.map((layer) =>
              layer.userId === uid
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    posts,
                    loading: false,
                    error: postsErr || profileErr || '',
                  }
                : layer,
            ),
          )

          void (async () => {
            const { posts: morePosts, postsErr: moreErr } = await loadLoungeProfileScreenPostsRemainder(
              supabaseClient,
              uid,
              hydratePosts,
              posts.length,
            )
            if (moreErr || morePosts.length === 0) return
            setNestedProfileStack((prev) =>
              prev.map((layer) => {
                if (layer.userId !== uid) return layer
                const seen = new Set((layer.posts || []).map((p) => p.id))
                const merged = [...(layer.posts || [])]
                for (const row of morePosts) {
                  if (row?.id && !seen.has(row.id)) {
                    seen.add(row.id)
                    merged.push(row)
                  }
                }
                return { ...layer, posts: merged }
              }),
            )
          })()
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not load profile.'
          setNestedProfileStack((prev) =>
            prev.map((layer) =>
              layer.userId === uid ? { ...layer, loading: false, error: msg } : layer,
            ),
          )
        }
      })()
    },
    [hydratePosts, supabaseClient],
  )

  const popNestedProfile = useCallback(() => {
    setNestedProfileStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  const rootShellClass = stackedOverlay
    ? 'absolute inset-0 z-40 bg-zinc-950'
    : stackAboveStreamLightbox
      ? 'fixed inset-0 z-[110] sm:bg-black/85'
      : 'fixed inset-0 z-[101] sm:bg-black/85'

  return (
    <div className={rootShellClass} role="dialog" aria-modal="true" aria-label="Profile">
      {!stackedOverlay ? (
        <button
          type="button"
          className="absolute inset-0 z-0 hidden cursor-default sm:block"
          aria-label="Close profile"
          onClick={onClose}
        />
      ) : null}
      <div
        className={`${
          stackedOverlay ? 'absolute' : 'fixed'
        } inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-800/90 bg-zinc-950 shadow-[-12px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
          stackedOverlay || panelVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        onTransitionEnd={(e) => {
          if (e.propertyName !== 'transform') return
          if (!panelVisible) onAfterTransitionOut?.()
        }}
        onTransitionCancel={(e) => {
          if (e.propertyName !== 'transform') return
          if (!panelVisible) onAfterTransitionOut?.()
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={profileTopChromeRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 will-change-transform"
          style={{
            transform: `translate3d(0, ${-profileTopChromeSlidePx}px, 0)`,
            pointerEvents: profileDockReveal > 0.12 ? 'auto' : 'none',
          }}
        >
          <div className="flex items-start justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-3">
            <button
              type="button"
              onClick={showOwnEditControls ? () => exitOwnProfileEditing() : onClose}
              className={
                showOwnEditControls
                  ? 'pointer-events-auto rounded-full bg-black/32 px-3.5 py-1.5 text-[14px] font-semibold text-white shadow-[0_1px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm touch-manipulation outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] hover:bg-black/44 active:bg-black/50 [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_8px_rgba(0,0,0,0.55)]'
                  : `${PROFILE_BANNER_CHROME_BTN_CLASS} pointer-events-auto`
              }
              aria-label={showOwnEditControls ? 'Cancel editing' : 'Back'}
            >
              {showOwnEditControls ? (
                'Cancel'
              ) : (
                <span aria-hidden className={PROFILE_BANNER_CHROME_BACK_CLASS}>
                  ←
                </span>
              )}
            </button>
            {isOwnProfile ? (
              <div ref={ownProfileBannerMenuRef} className="pointer-events-auto shrink-0">
                <button
                  ref={ownProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOwnProfileMenuOpen((v) => !v)}
                  aria-expanded={ownProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  className={PROFILE_BANNER_CHROME_BTN_CLASS}
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <circle cx="4" cy="10" r="1.65" />
                    <circle cx="10" cy="10" r="1.65" />
                    <circle cx="16" cy="10" r="1.65" />
                  </svg>
                </button>
                {ownProfileMenuOpen
                  ? createPortal(
                      <div
                        ref={ownProfileMenuPanelRef}
                        className="min-w-[11.5rem] rounded-xl border border-zinc-600/90 bg-zinc-900/98 py-1 shadow-xl backdrop-blur-sm"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full px-4 py-2.5 text-left text-[15px] font-semibold text-zinc-100 hover:bg-zinc-800/90 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                          onClick={() => {
                            setOwnProfileMenuOpen(false)
                            if (ownProfileEditing) {
                              exitOwnProfileEditing()
                            } else {
                              setAboutErr('')
                              setOwnProfileEditing(true)
                            }
                          }}
                        >
                          {ownProfileEditing ? 'Done editing' : 'Edit'}
                        </button>
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            ) : typeof onShareProfile === 'function' || typeof onBlockProfile === 'function' ? (
              <div ref={otherProfileMenuWrapRef} className="pointer-events-auto shrink-0">
                <button
                  ref={otherProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOtherProfileMenuOpen((o) => !o)}
                  aria-expanded={otherProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  className={PROFILE_BANNER_CHROME_BTN_CLASS}
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <circle cx="4" cy="10" r="1.65" />
                    <circle cx="10" cy="10" r="1.65" />
                    <circle cx="16" cy="10" r="1.65" />
                  </svg>
                </button>
                {otherProfileMenuOpen
                  ? createPortal(
                      <div
                        ref={otherProfileMenuPanelRef}
                        className="min-w-[11rem] rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                        role="menu"
                      >
                        {typeof onShareProfile === 'function' ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-4 py-3 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                            onClick={() => {
                              setOtherProfileMenuOpen(false)
                              onShareProfile(profile)
                            }}
                          >
                            Share
                          </button>
                        ) : null}
                        {canAdminPromoteModerator ? (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={adminRoleBusy}
                            className="block w-full px-4 py-3 text-left text-[15px] font-medium text-fuchsia-200 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                            onClick={() => void runAdminProfileRoleChange('moderator')}
                          >
                            Promote to moderator
                          </button>
                        ) : null}
                        {canAdminDemoteModerator ? (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={adminRoleBusy}
                            className="block w-full px-4 py-3 text-left text-[15px] font-medium text-fuchsia-200 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                            onClick={() => void runAdminProfileRoleChange('user')}
                          >
                            Remove moderator role
                          </button>
                        ) : null}
                        {typeof onBlockProfile === 'function' ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-4 py-3 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                            onClick={() => {
                              setOtherProfileMenuOpen(false)
                              onBlockProfile(profile)
                            }}
                          >
                            Block
                          </button>
                        ) : null}
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            ) : null}
          </div>
        </div>
        {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED: was style paddingBottom Math.max(56, profileDockFooterMeasured) + 8 when shellDock */}
        <div
          ref={profileBodyScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            paddingBottom: `max(${
              !showOwnEditControls && profileFabBottomPadPx > 0 ? `${profileFabBottomPadPx}px` : '0.5rem'
            }, env(safe-area-inset-bottom))`,
          }}
        >
          <div className="relative z-10 w-full shrink-0">
            <div className="relative h-28 w-full shrink-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 sm:h-36">
              {profile?.banner_url ? (
                <img src={profile.banner_url} alt="" className="relative z-0 h-full w-full object-cover" />
              ) : null}
              {isOwnProfile ? (
                <>
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onPickBanner} />
                  {showOwnEditControls ? (
                    <button
                      type="button"
                      disabled={bannerBusy}
                      onClick={() => bannerInputRef.current?.click()}
                      className="absolute bottom-2 right-2 z-10 rounded-full border border-zinc-600/90 bg-zinc-950/90 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 shadow hover:bg-zinc-900 disabled:opacity-50 touch-manipulation"
                    >
                      {bannerBusy ? 'Uploading…' : 'Banner'}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="relative px-4">
            <div className="pointer-events-none relative z-20 -mt-12 flex flex-wrap items-end justify-between gap-3 sm:-mt-14">
              <div className="relative shrink-0 pointer-events-auto">
                <div className="flex h-24 w-24 overflow-hidden rounded-full border-4 border-zinc-950 bg-zinc-900 text-[28px] font-bold text-zinc-200 shadow-lg sm:h-[5.5rem] sm:w-[5.5rem] sm:text-[32px]">
                  {profile?.avatar_url ? (
                    <img
                      key={profile.avatar_url}
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className={`grid h-full w-full place-items-center font-bold text-white ${profileAvatarToneClass(
                        profile?.user_id || profile?.handle || 'member'
                      )}`}
                    >
                      {profileAvatarInitials(profile?.display_name, profile?.handle)}
                    </span>
                  )}
                </div>
                {showOwnEditControls ? (
                  <>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(ev) => onPickAvatar(ev)}
                    />
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label={avatarBusy ? 'Uploading avatar' : 'Change avatar'}
                      className="absolute bottom-0 right-0 z-10 rounded-full border border-zinc-600/90 bg-zinc-950/95 px-2 py-0.5 text-[10px] font-semibold leading-tight text-zinc-200 shadow-md hover:bg-zinc-900 disabled:opacity-50 touch-manipulation sm:px-2.5 sm:py-1 sm:text-[11px]"
                    >
                      {avatarBusy ? '…' : 'Avatar'}
                    </button>
                  </>
                ) : null}
              </div>
              {!isOwnProfile && viewerUserId ? (
                <div className="pointer-events-auto mb-1 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={socialBusy}
                    onClick={() => void toggleFollow()}
                    className={`min-h-9 rounded-full px-4 text-[14px] font-bold touch-manipulation disabled:opacity-50 ${
                      isFollowing
                        ? 'border border-zinc-600 bg-zinc-900 text-zinc-100'
                        : 'bg-white text-zinc-950 hover:bg-zinc-200'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  {onOpenChatWithUser && profileUserId ? (
                    <button
                      type="button"
                      disabled={socialBusy || !viewerCanUseLoungeChat || iBlockingThem || theyBlockMe}
                      onClick={() => onOpenChatWithUser(profileUserId)}
                      title={
                        iBlockingThem
                          ? 'Unblock to message'
                          : theyBlockMe
                            ? 'This member is unavailable'
                            : viewerCanUseLoungeChat
                              ? 'Message'
                              : 'Complete your profile to message'
                      }
                      aria-label={
                        iBlockingThem
                          ? 'Unblock to message'
                          : theyBlockMe
                            ? 'This member is unavailable'
                            : viewerCanUseLoungeChat
                              ? 'Message'
                              : 'Complete your profile to message'
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 touch-manipulation hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                          d="M4 5.5h12a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0116 14.5H8.5l-3.2 2.4a.6.6 0 01-.95-.48V14.5H4A1.5 1.5 0 012.5 13V7A1.5 1.5 0 014 5.5z"
                          stroke="currentColor"
                          strokeWidth="1.35"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={socialBusy}
                    onClick={() => void toggleSubscribe()}
                    title="Notify me about their posts"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border touch-manipulation disabled:opacity-50 ${
                      isSubscribed
                        ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200'
                        : 'border-zinc-600 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                    }`}
                    aria-label={isSubscribed ? 'Subscribed to notifications' : 'Subscribe to notifications'}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path
                        d="M10 2.5a5 5 0 015 5v2.5l1.5 2v.5H3.5V10L5 7.5V7.5a5 5 0 015-5z"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                      />
                      <path d="M7.5 14.5h5a2 2 0 01-4 0z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                    </svg>
                  </button>
                  {/* Block / Unblock */}
                  <button
                    type="button"
                    disabled={blockBusy}
                    onClick={() => void toggleBlock()}
                    title={iBlockingThem ? 'Unblock member' : 'Block member'}
                    aria-label={iBlockingThem ? 'Unblock member' : 'Block member'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border touch-manipulation disabled:opacity-50 ${
                      iBlockingThem
                        ? 'border-red-700/60 bg-red-950/40 text-red-300'
                        : 'border-zinc-600 bg-zinc-900 text-zinc-400 hover:border-red-700/50 hover:text-red-400'
                    }`}
                  >
                    {/* Ban / no-entry circle icon */}
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.35" />
                      <line x1="4.5" y1="15.5" x2="15.5" y2="4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 space-y-1">
              {showOwnEditControls ? (
                <div className="space-y-3" data-lounge-profile-edit>
                  <label className="block">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                        Display name
                      </span>
                      <ProfileHeaderBadges role={profile?.role} isOg={profile?.is_og} />
                    </div>
                    <input
                      type="text"
                      value={displayNameDraft}
                      onChange={(e) => setDisplayNameDraft(e.target.value.slice(0, 24))}
                      maxLength={24}
                      autoComplete="name"
                      data-profile-edit-display-name
                      className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 text-[16px] font-semibold text-zinc-100 outline-none focus:border-cyan-600/60 touch-manipulation sm:text-[17px]"
                      placeholder="Your name"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Handle</span>
                    <input
                      type="text"
                      value={handleSlugDraft ? `@${handleSlugDraft}` : '@'}
                      onChange={(e) => setHandleSlugDraft(handleSlugFromAtInput(e.target.value))}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-profile-edit-handle
                      className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[16px] text-cyan-200 outline-none focus:border-cyan-600/60 touch-manipulation"
                      placeholder="@your_handle"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Location</span>
                    <ProfileLocationPicker
                      value={locationDraft}
                      onChange={setLocationDraft}
                      disabled={aboutBusy}
                    />
                    {locationDraft ? (
                      <button
                        type="button"
                        className="mt-2 text-[13px] font-semibold text-zinc-500 hover:text-zinc-300 touch-manipulation"
                        onClick={() => setLocationDraft('')}
                      >
                        Clear location
                      </button>
                    ) : null}
                  </label>
                  <div className="block">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Tribes</span>
                    <LoungePostCategoryPillPicker
                      value={categoryPillsDraft}
                      onChange={setCategoryPillsDraft}
                      disabled={aboutBusy}
                      maxPills={null}
                      hint="Choose your tribes - helps us to deliver you better results."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-xl font-bold leading-none text-white sm:text-2xl">{displayName}</span>
                    <ProfileHeaderBadges role={profile?.role} isOg={profile?.is_og} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[15px] text-cyan-300">
                    <span>{handle}</span>
                    {profileFollowsViewer && viewerUserId && profileUserId !== viewerUserId ? (
                      <span className="rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        Follows you
                      </span>
                    ) : null}
                  </div>
                  {locationDisplay ? (
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[14px] leading-snug text-zinc-400">
                      <ProfileLocationPinIcon />
                      <span className="min-w-0 truncate">{locationDisplay}</span>
                    </div>
                  ) : null}
                  {profileInterestPills.length > 0 ? (
                    <LoungePostCategoryPillRow pills={profileInterestPills} className="mt-2" />
                  ) : null}
                </>
              )}
            </div>

            {!showOwnEditControls ? (
              <div className="mt-4 flex gap-6 text-[15px]">
                <button
                  type="button"
                  onClick={() => setFollowListTab('following')}
                  className="touch-manipulation text-left [-webkit-tap-highlight-color:transparent] hover:opacity-90 active:opacity-80"
                >
                  <span className="font-bold text-white" title={fullStatCountTitle(followingCount)}>
                    {formatCompactStatCount(followingCount)}
                  </span>{' '}
                  <span className="text-zinc-500">Following</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFollowListTab('followers')}
                  className="touch-manipulation text-left [-webkit-tap-highlight-color:transparent] hover:opacity-90 active:opacity-80"
                >
                  <span className="font-bold text-white" title={fullStatCountTitle(followerCount)}>
                    {formatCompactStatCount(followerCount)}
                  </span>{' '}
                  <span className="text-zinc-500">Followers</span>
                </button>
              </div>
            ) : null}

            <div className="mt-4">
              {showOwnEditControls ? (
                <div className="space-y-2">
                  <div className="relative">
                    <textarea
                      value={aboutDraft}
                      onChange={(e) => setAboutDraft(e.target.value.slice(0, 140))}
                      rows={3}
                      maxLength={140}
                      placeholder="Tell people about you (max 140 characters)"
                      className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 pb-8 pr-14 text-[16px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-600/60"
                    />
                    <span
                      className="pointer-events-none absolute bottom-2 right-3 text-[12px] tabular-nums text-zinc-500"
                      aria-hidden
                    >
                      {aboutDraft.length}/140
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={aboutBusy}
                      onClick={() => void saveProfileEdits()}
                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50 touch-manipulation"
                    >
                      {aboutBusy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {aboutErr ? <div className="text-[13px] text-rose-300">{aboutErr}</div> : null}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-300">
                  {aboutDisplay || '-'}
                </p>
              )}
            </div>
          </div>

          {!showOwnEditControls ? (
          <div className="w-full min-w-0">
            <div className="mt-6 border-b border-zinc-800">
              <div className="flex gap-0">
                {profileTabsVisible.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`relative flex-1 touch-manipulation font-semibold capitalize [-webkit-tap-highlight-color:transparent] ${profileTabBtnClass} ${
                      tab === id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {profileTabLabel(id)}
                    {tab === id ? (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-cyan-500 sm:left-3 sm:right-3" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[12rem] pb-4">
              {adminRoleErr ? (
                <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                  {adminRoleErr}
                </div>
              ) : null}
              <LoungeFeedVideoAutoplayProvider
                scrollRootRef={profileBodyScrollRef}
                showDebugHud={showVideoDebugHud}
              >
                <LoungeFeedCoordinatorSuspendBinder suspended={suspendVideoCoordinator} />
                <LoungeFeedAutoplayPostsKick postCount={profileAutoplayPostCount} />
              {error ? (
                <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">{error}</div>
              ) : tab === 'posts' ? (
                loading ? (
                  <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
                ) : posts.length === 0 ? (
                  <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">No Lounge posts yet.</div>
                ) : (
                  posts.map((post) => (
                    <article
                      key={post.id}
                      style={profilePostRowPerfStyle}
                      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer`}
                      onClick={(e) => {
                        const t = e.target
                        if (!(t instanceof Element)) return
                        const origHost = t.closest('[data-lounge-original-embed]')
                        if (origHost && post.reposted_post?.id && !post.repost_of_comment_id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        if (
                          t.closest(
                            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                          )
                        )
                          return
                        // Plain repost of a comment → open comment detail
                        if (post.repost_of_comment_id && post.reposted_comment?.post_id) {
                          postCardPropsForLists.onOpenCommentRepost?.(post.reposted_comment)
                          return
                        }
                        // Plain repost of a post → open the original
                        if (post.is_plain_repost && post.reposted_post?.id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        postCardPropsForLists.onPostBodyClick?.(post)
                      }}
                    >
                      <LoungePostArticle
                        post={post}
                        suppressAvatarProfileNavigation
                        profileOwnerUserId={profileUserId}
                        {...postCardPropsForLists}
                        repostMenuScrollRootRef={profileBodyScrollRef}
                      />
                    </article>
                  ))
                )
              ) : tab === 'replies' ? (
                profileRepliesLoading ? (
                  <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
                ) : profileRepliesErr ? (
                  <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                    {profileRepliesErr}
                  </div>
                ) : profileReplies.length === 0 ? (
                  <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">
                    {isOwnProfile ? 'Replies you post will show up here.' : 'No replies yet.'}
                  </div>
                ) : (
                  profileReplies.map((item) => (
                    <ProfileReplyRow
                      key={item.comment.id}
                      item={item}
                      postCardProps={postCardPropsForLists}
                      onOpenProfileReply={postCardPropsForLists?.onOpenProfileReply}
                      profileBodyScrollRef={profileBodyScrollRef}
                      onNavigateToProfile={onNavigateToProfile}
                    />
                  ))
                )
              ) : tab === 'likes' || tab === 'bookmarks' ? (
                interactionLoading ? (
                  <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
                ) : interactionErr ? (
                  <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                    {interactionErr}
                  </div>
                ) : interactionPosts.length === 0 ? (
                  <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">
                    {tab === 'likes'
                      ? 'Posts you like will show up here.'
                      : 'Posts you bookmark will show up here.'}
                  </div>
                ) : (
                  interactionPosts.map((post) => (
                    <article
                      key={post.id}
                      style={profilePostRowPerfStyle}
                      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer`}
                      onClick={(e) => {
                        const t = e.target
                        if (!(t instanceof Element)) return
                        const origHost = t.closest('[data-lounge-original-embed]')
                        if (origHost && post.reposted_post?.id && !post.repost_of_comment_id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        if (
                          t.closest(
                            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                          )
                        )
                          return
                        // Plain repost of a comment → open comment detail
                        if (post.repost_of_comment_id && post.reposted_comment?.post_id) {
                          postCardPropsForLists.onOpenCommentRepost?.(post.reposted_comment)
                          return
                        }
                        // Plain repost of a post → open the original
                        if (post.is_plain_repost && post.reposted_post?.id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        postCardPropsForLists.onPostBodyClick?.(post)
                      }}
                    >
                      <LoungePostArticle
                        post={post}
                        suppressAvatarProfileNavigation
                        profileOwnerUserId={profileUserId}
                        {...postCardPropsForLists}
                        repostMenuScrollRootRef={profileBodyScrollRef}
                      />
                    </article>
                  ))
                )
              ) : null}
              </LoungeFeedVideoAutoplayProvider>
            </div>
          </div>
          ) : null}
        </div>
        {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED - see import above
        {shellDock && !showOwnEditControls ? (
          <LoungeDockFooterBar
            layout="sheet"
            reveal={profileDockReveal}
            barHeightPx={profileDockFooterMeasured}
            onHeightChange={(h) => {
              if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return
              setProfileDockFooterMeasured((cur) => (cur === h ? cur : h))
            }}
            onHome={shellDock.onHome}
            onSearch={shellDock.onSearch}
            onFollowingFilterToggle={shellDock.onFollowingFilterToggle}
            followingFilterOn={shellDock.followingFilterOn ?? false}
            followingFilterDisabled={shellDock.followingFilterDisabled ?? false}
            onNotifications={shellDock.onNotifications}
            onChat={shellDock.onChat}
            activePanel={shellDock.activePanel}
          />
        ) : null}
        */}
        {followListTab ? (
          <LoungeProfileFollowList
            tab={followListTab}
            onTabChange={setFollowListTab}
            profileUserId={profileUserId}
            profileDisplayName={displayName}
            viewerUserId={viewerUserId}
            supabaseClient={supabaseClient}
            onClose={() => setFollowListTab(null)}
            onViewerFollowChange={onViewerFollowChange}
            highlightUserIds={highlightFollowerUserIds}
            onOpenProfile={(entity) => {
              const uid = String(entity?.user_id || '').trim()
              if (!uid) return
              if (uid === profileUserId) {
                setFollowListTab(null)
                return
              }
              openNestedProfileFromFollowList(entity)
            }}
          />
        ) : null}
        {nestedProfileStack.map((layer, index) => {
          const isTop = index === nestedProfileStack.length - 1
          if (!isTop) return null
          return (
            <LoungeProfileFullScreen
              key={layer.userId}
              stackedOverlay
              open
              panelVisible
              profileUserId={layer.userId}
              viewerUserId={viewerUserId}
              supabaseClient={supabaseClient}
              profile={layer.profile}
              posts={layer.posts}
              loading={layer.loading}
              error={layer.error}
              isOwnProfile={Boolean(viewerUserId && layer.userId === viewerUserId)}
              onClose={popNestedProfile}
              onAfterTransitionOut={popNestedProfile}
              postCardProps={postCardProps}
              onProfileUpdated={onProfileUpdated}
              hydratePosts={hydratePosts}
              onNavigateToProfile={(entity) => {
                const uid = String(entity?.user_id || '').trim()
                if (!uid) return
                openNestedProfileFromFollowList(entity)
              }}
              onShareProfile={onShareProfile}
              onBlockProfile={onBlockProfile}
              onViewerFollowChange={onViewerFollowChange}
              suspendVideoCoordinator={suspendVideoCoordinator}
              showVideoDebugHud={showVideoDebugHud}
              viewerIsAdmin={viewerIsAdmin}
              onAdminSetProfileRole={onAdminSetProfileRole}
            />
          )
        })}
        </div>
      </div>

      <ProfileAvatarCropModal
        open={Boolean(avatarCropFile)}
        file={avatarCropFile}
        onCancel={onAvatarCropCancel}
        onApply={onAvatarCropApply}
      />

      <ProfileHandleConflictDialog
        open={Boolean(handleConflictDialog)}
        busy={aboutBusy}
        requestedHandle={handleConflictDialog?.requestedHandle}
        reason={handleConflictDialog?.reason}
        suggestedHandle={handleConflictDialog?.suggestedHandle}
        onCancel={() => setHandleConflictDialog(null)}
        onUseSuggested={(next) => {
          if (!next) return
          const resume = handleConflictDialog?.resumeSaveOpts || {}
          setHandleSlugDraft(String(next))
          setHandleConflictDialog(null)
          void saveProfileEdits({
            ...resume,
            skipHandlePrompts: true,
            forcedHandle: next,
          })
        }}
      />

      {handleChangeDialog && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="profile-handle-dialog-title"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-default touch-manipulation"
                aria-label="Dismiss"
                disabled={aboutBusy}
                onClick={() => {
                  if (aboutBusy) return
                  setHandleChangeDialog(null)
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
                <h2 id="profile-handle-dialog-title" className="text-[16px] font-bold text-white">
                  {handleChangeDialog.kind === 'confirm' ? 'Change handle?' : 'Handle change limit'}
                </h2>
                {handleChangeDialog.kind === 'confirm' ? (
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                    You can change your handle at most once every 7 days. After you save, you will not be able to change
                    it again until a full week has passed.
                  </p>
                ) : (
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">
                    You already changed your handle within the last 7 days. The next change is allowed after{' '}
                    <span className="font-semibold text-zinc-100">
                      {new Date(handleChangeDialog.unlockAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                    . Continue saves your display name, photo, and About - your handle will stay{' '}
                    <span className="font-semibold text-cyan-200">@{String(profile?.handle || '').trim()}</span>.
                  </p>
                )}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={aboutBusy}
                    onClick={() => setHandleChangeDialog(null)}
                    className="min-h-11 w-full rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-700 disabled:opacity-50 sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={aboutBusy}
                    onClick={() => {
                      setHandleChangeDialog(null)
                      if (handleChangeDialog.kind === 'confirm') {
                        void saveProfileEdits({ skipHandlePrompts: true })
                      } else {
                        void saveProfileEdits({ preserveServerHandle: true, skipHandlePrompts: true })
                      }
                    }}
                    className="min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white touch-manipulation hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
