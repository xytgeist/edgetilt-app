import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  invalidateCssSafeAreaTopPxCache,
  readCssSafeAreaTopPx,
} from '../../utils/edgeSafeAreaCss.js'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import {
  prefersReducedMotion,
  profileBannerBlurTuckFrac,
  profileBannerPinScrollRangePx,
  profileBannerStickyTopPx,
  profileChromeCenterNudgePx,
  profileCollapseShellPreset,
  profileCollapseVisuals,
  profileCompactNameReveal,
  profileLiveBannerBlurProgress,
  profileIosWebTitleChromeEnabled,
  profileScrollCollapseEnabled,
  PROFILE_AVATAR_RING_PX,
  PROFILE_BANNER_MEDIA_BLUR_MAX_PX,
  PROFILE_COLLAPSE_RANGE_PX,
  PROFILE_COLLAPSED_CHROME_ROW_PX,
  PROFILE_COMPACT_NAME_SLIDE_PX,
  PROFILE_IOS_WEB_TABS_OVERLAP_PX,
  PROFILE_IOS_WEB_TITLE_BAR_PX,
  PROFILE_PINNED_BANNER_BELOW_CHROME_PX,
} from './loungeProfileScrollCollapse.js'
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
import {
  fetchLoungeCommunityFeedPostsForViewer,
  isLoungeFanOnlyPostLocked,
  loungeProfileReplyItemVisible,
  showLoungeFanOnlyPostUnlockedTint,
} from '../../utils/loungeFanOnlyPost.js'
import LoungeFanOnlyPostRowTint from './LoungeFanOnlyPostRowTint.jsx'
import LoungeEdgeProBadge from './LoungeEdgeProBadge.jsx'
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
  applyLoungeProfilePinToPosts,
  fetchLoungeProfilePosts,
  fetchLoungeProfileRow,
  LOUNGE_PROFILE_POST_INITIAL_LIMIT,
  LOUNGE_PROFILE_POST_PAGE_SIZE,
  LOUNGE_PROFILE_TAB_PAGE_SIZE,
  mergeLoungeProfilePosts,
} from './loungeProfileScreenLoad.js'
import { formatCompactStatCount, fullStatCountTitle } from '../../utils/formatCompactStatCount.js'
import { LOUNGE_DOCK_FAB_SIZE_PX } from '../../utils/loungeDockFabPosition.js'
import {
  normalizeLoungeProfileCategoryPills,
  profileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'
import { chatBlockUser, chatGetBlockStatus, chatUnblockUser } from '../chat/chatApi.js'
import {
  fetchCreatorFanOffer,
} from '../creatorFanSubs/creatorFanSubsApi.js'
import CreatorFanSubscribeModal from '../creatorFanSubs/CreatorFanSubscribeModal.jsx'
import CreatorFanPortalModal from '../creatorFanSubs/CreatorFanPortalModal.jsx'
import OwnProfileFanMonetizationCta from '../creatorFanSubs/OwnProfileFanMonetizationCta.jsx'
import { formatFanTierLabel } from '../creatorFanSubs/fanSubTiers.js'
import LoungeProfileOverflowMenu from './LoungeProfileOverflowMenu.jsx'
import { adminMemberSlotsEntitlements } from '../profiles/adminCompSlotsEdgeLifetime.js'
import {
  profileSocialActionButtonClass,
  ProfileSocialAlertsIcon,
  ProfileSocialFollowIcon,
  ProfileSocialMessageIcon,
} from './profileSocialActionChrome.jsx'
import ProfileFanSubPillButton from './ProfileFanSubPillButton.jsx'
import LoungeBackArrowIcon from './LoungeBackArrowIcon.jsx'

const PROFILE_TAB_IDS = ['posts', 'replies', 'likes', 'bookmarks']

/** Positive Android UA … cheaper paint (no backdrop-blur) on classic title-chrome path. */
const PROFILE_ANDROID_PERF =
  typeof navigator !== 'undefined' && /Android/i.test(String(navigator.userAgent || ''))

const PROFILE_BANNER_CHROME_BTN_CLASS =
  'flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent]'

const PROFILE_BANNER_CHROME_CANCEL_CLASS =
  'pointer-events-auto flex h-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 px-4 text-[14px] font-semibold shadow-none backdrop-blur-xl hover:bg-white/25 active:bg-white/30 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent]'

function ProfileHeaderBadges({ role, isOg, isEdgePro }) {
  const hasStaff = loungeFeedAuthorHasStaffBadge(role)
  if (!hasStaff && isOg !== true && isEdgePro !== true) return null
  return (
    <span className="inline-flex shrink-0 items-baseline gap-x-1">
      {hasStaff ? <LoungeStaffRoleBadge role={role} size="modal" /> : null}
      {isOg === true ? (
        <span className={hasStaff ? 'shrink-0 -ml-0.5' : 'shrink-0'}>
          <LoungeOgBadge isOg size="modal" />
        </span>
      ) : null}
      {isEdgePro === true ? (
        <span className="shrink-0">
          <LoungeEdgeProBadge isEdgePro size="modal" />
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
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url,creator_fan_only'

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
      .select('user_id,handle,display_name,avatar_url,role,is_og,has_active_subscription')
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

async function fetchProfileRepliesPage(
  supabaseClient,
  {
    profileUserId,
    profile,
    offset,
    limit,
    hydratePosts,
    viewerUserId,
    loungeViewerIsStaff,
    fanEntitlements,
  },
) {
  const { data: commentRows, error: ce } = await supabaseClient
    .from('feed_comments')
    .select(PROFILE_COMMENT_SELECT)
    .eq('user_id', profileUserId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (ce) throw ce
  const comments = commentRows || []
  if (comments.length === 0) {
    return { items: [], hasMore: false }
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
    return { items: [], hasMore: comments.length >= limit }
  }
  const postRows = await fetchLoungeCommunityFeedPostsForViewer(supabaseClient, postIds)
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
  const replyCtx = {
    viewerUserId,
    viewerIsStaff: loungeViewerIsStaff,
    fanEntitlements,
  }
  const visibleItems = items.filter((it) => loungeProfileReplyItemVisible(it, profileUserId, replyCtx))
  return { items: visibleItems, hasMore: comments.length >= limit, fetchedCount: comments.length }
}

async function fetchProfileInteractionPostsPage(
  supabaseClient,
  { profileUserId, tab, offset, limit, hydratePosts },
) {
  const linkTable = tab === 'likes' ? 'post_likes' : 'post_bookmarks'
  const { data: links, error: le } = await supabaseClient
    .from(linkTable)
    .select('post_id, created_at')
    .eq('user_id', profileUserId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (le) throw le
  const linkRows = links || []
  if (linkRows.length === 0) {
    return { posts: [], hasMore: false }
  }
  const orderedIds = []
  const seen = new Set()
  for (const row of linkRows) {
    const pid = row.post_id
    if (pid == null || pid === '') continue
    const key = String(pid)
    if (seen.has(key)) continue
    seen.add(key)
    orderedIds.push(pid)
  }
  if (orderedIds.length === 0) {
    return { posts: [], hasMore: linkRows.length >= limit }
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
  return { posts: hydrated || [], hasMore: linkRows.length >= limit, fetchedCount: linkRows.length }
}

const PROFILE_HANDLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function profileTabLabel(id) {
  if (id === 'posts') return 'Posts'
  if (id === 'replies') return 'Replies'
  if (id === 'likes') return 'Likes'
  if (id === 'bookmarks') return 'Bookmarks'
  return id
}

function emptyProfileInteractionTabState() {
  return {
    posts: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    err: '',
  }
}

const PROFILE_TAB_SLIDE_MS = 320
const PROFILE_TAB_SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function ProfileTabPostList({
  posts,
  profileUserId,
  profileFanLockCtx,
  postCardPropsForLists,
  profileBodyScrollRef,
  profilePostRowPerfStyle,
}) {
  return posts.map((post) => {
    const fanOnlyRowTint = showLoungeFanOnlyPostUnlockedTint(post, profileFanLockCtx)
    return (
      <article
        key={post.id}
        style={profilePostRowPerfStyle}
        className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer${fanOnlyRowTint ? ' relative overflow-hidden' : ''}`}
        onClick={(e) => {
          const t = e.target
          if (!(t instanceof Element)) return
          const origHost = t.closest('[data-lounge-original-embed]')
          if (origHost && post.reposted_post?.id && !post.repost_of_comment_id) {
            if (!isLoungeFanOnlyPostLocked(post.reposted_post, profileFanLockCtx)) {
              postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
            }
            return
          }
          if (
            t.closest(
              'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip], [data-lounge-fan-only-cta]',
            )
          )
            return
          if (post.repost_of_comment_id && post.reposted_comment?.post_id) {
            postCardPropsForLists.onOpenCommentRepost?.(post.reposted_comment)
            return
          }
          if (post.is_plain_repost && post.reposted_post?.id) {
            if (isLoungeFanOnlyPostLocked(post.reposted_post, profileFanLockCtx)) {
              postCardPropsForLists.onPostBodyClick?.(post)
            } else {
              postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
            }
            return
          }
          postCardPropsForLists.onPostBodyClick?.(post)
        }}
      >
        {fanOnlyRowTint ? <LoungeFanOnlyPostRowTint /> : null}
        <div className={fanOnlyRowTint ? 'relative z-[1]' : undefined}>
          <LoungePostArticle
            post={post}
            suppressAvatarProfileNavigation
            profileOwnerUserId={profileUserId}
            {...postCardPropsForLists}
            repostMenuScrollRootRef={profileBodyScrollRef}
          />
        </div>
      </article>
    )
  })
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
    onCashtagClick: pp.onCashtagClick,
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
              className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center font-bold text-white touch-manipulation [-webkit-tap-highlight-color:transparent] ${profileAvatarToneClass(
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
                    isEdgePro={post?.author_profile?.has_active_subscription}
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
                      onCashtagClick: pp.onCashtagClick,
                      onLinkClick: pp.onLinkClick,
                    }}
                  />
                </div>
              ) : null}
              {feedCommentRowHasMedia(post) ? (
                <LoungePostFeedImagesAndGif
                  post={post}
                  variant={pathIds.length > 0 && threadComments.length > 0 ? 'detail' : 'feed'}
                  captionColumnMedia={false}
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
  /** Refilter Lounge home feed after mute toggle. */
  onProfileFeedMuteChange = null,
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
  /** `(targetUserId, grant) => Promise<{ ok: boolean, error?: string, entitlements?: object }>` */
  onAdminCompLifetime = null,
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
  /** Open Settings → Subscriptions → Enable fan subscriptions (own profile CTA). */
  onOpenFanSubscriptionSettings = null,
  /** One-shot: open Fan hub modal when own profile is visible (e.g. `?fanPortal=1`). */
  requestOpenFanPortal = false,
  /** One-shot: auto-open creator fan subscribe modal (e.g. `?subscribe=1` from sharpesyndicate.com). */
  requestAutoOpenSubscribe = false,
  onRequestAutoOpenSubscribeConsumed = null,
  onRequireAuth = null,
  /** Posts tab: more pages available (parent-owned list). */
  postsHasMore = false,
  postsLoadingMore = false,
  /** Load next Posts page when sentinel intersects. */
  onLoadMorePosts = null,
}) {
  const [tab, setTab] = useState('posts')
  const [adminRoleBusy, setAdminRoleBusy] = useState(false)
  const [adminRoleErr, setAdminRoleErr] = useState('')
  const [adminCompBusy, setAdminCompBusy] = useState(false)
  const [adminCompErr, setAdminCompErr] = useState('')
  const [targetSlotsEntitlements, setTargetSlotsEntitlements] = useState(/** @type {Record<string, boolean> | null} */ (null))
  const [likesTab, setLikesTab] = useState(emptyProfileInteractionTabState)
  const [bookmarksTab, setBookmarksTab] = useState(emptyProfileInteractionTabState)
  const [profileReplies, setProfileReplies] = useState([])
  const [profileRepliesLoading, setProfileRepliesLoading] = useState(false)
  const [profileRepliesLoadingMore, setProfileRepliesLoadingMore] = useState(false)
  const [profileRepliesHasMore, setProfileRepliesHasMore] = useState(false)
  const [profileRepliesErr, setProfileRepliesErr] = useState('')
  const profileRepliesFetchOffsetRef = useRef(0)
  const profileRepliesFetchedRef = useRef(false)
  const profileRepliesInFlightRef = useRef(false)
  const likesFetchOffsetRef = useRef(0)
  const likesFetchedRef = useRef(false)
  const likesInFlightRef = useRef(false)
  const bookmarksFetchOffsetRef = useRef(0)
  const bookmarksFetchedRef = useRef(false)
  const bookmarksInFlightRef = useRef(false)
  const profileUserIdRef = useRef(profileUserId)
  profileUserIdRef.current = profileUserId
  const profileLoadMoreSentinelRef = useRef(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  /** Author's visible Lounge posts total for collapsed chrome subtitle. */
  const [profilePostsTotal, setProfilePostsTotal] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [profileFollowsViewer, setProfileFollowsViewer] = useState(false)
  const [iBlockingThem, setIBlockingThem] = useState(false)
  const [theyBlockMe, setTheyBlockMe] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [feedMuteBusy, setFeedMuteBusy] = useState(false)
  const [isProfileFeedMuted, setIsProfileFeedMuted] = useState(false)
  const [socialBusy, setSocialBusy] = useState(false)
  const [creatorFanOffer, setCreatorFanOffer] = useState(null)
  const [hasCreatorFanSub, setHasCreatorFanSub] = useState(false)
  const [fanSubCancelAtPeriodEnd, setFanSubCancelAtPeriodEnd] = useState(false)
  const [fanSubPeriodEnd, setFanSubPeriodEnd] = useState(/** @type {string | null} */ (null))
  const [fanSubscribeModalOpen, setFanSubscribeModalOpen] = useState(false)
  const [fanPortalOpen, setFanPortalOpen] = useState(false)
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
  const profileBodyScrollRef = useRef(null)
  const profileBannerMediaRef = useRef(null)
  const profileBannerShellRef = useRef(null)
  const profileBannerLiveScrimRef = useRef(null)
  const profileBannerBlurOverlayRef = useRef(null)
  const profileAvatarMotionRef = useRef(null)
  const profileAvatarRowRef = useRef(null)
  const profileDisplayNameRef = useRef(null)
  const profileCompactNameRef = useRef(null)
  const profileChromeMotionRef = useRef(null)
  const profileChromeCenterNudgePxRef = useRef(36)
  const profileCollapsedScrimRef = useRef(null)
  const profileIosWebStatusPlateRef = useRef(null)
  const profileIosWebTitleBarRef = useRef(null)
  /** Whole iOS web chrome stack (plates + back/menu) slides as one unit. */
  const profileIosWebSlideRef = useRef(null)
  const profileBannerHeightPxRef = useRef(0)
  /** Once the user scrolls past the banner, keep feed title chrome until near the top handoff. */
  const profileIosWebFeedLatchRef = useRef(false)
  const profileIosWebWasPastBannerRef = useRef(false)
  const profileIosWebChromeScrollPrevRef = useRef(0)
  /** Last applied iOS-web / Android title chrome px … skip redundant style writes. */
  const profileIosWebAppliedHideRef = useRef({ title: -1, btn: -1, tabs: -1, inFeed: -1 })
  /** Cached safe-area top for scroll frames (refresh in measure / resize). */
  const profileSatPxRef = useRef(Math.max(8, readCssSafeAreaTopPx()))
  /** True after classic (non-collapse) chrome styles were cleared once. */
  const profileClassicChromeClearedRef = useRef(false)
  const applyProfileCollapseVisualsRef = useRef(/** @type {null | ((n?: number, o?: object) => void)} */ (null))
  const profileNameRevealScrollRef = useRef(80)
  const profileBannerBlurNameGapAtTuckRef = useRef(/** @type {number | null} */ (null))
  const profileBannerBlurStartScrollRef = useRef(/** @type {number | null} */ (null))
  const profileStickyTopPxRef = useRef(PROFILE_COLLAPSED_CHROME_ROW_PX)
  const profileCollapseRangePxRef = useRef(112)
  const profileBannerStickyTopPxRef = useRef(0)
  const profileCollapseReduceMotionRef = useRef(false)
  const profileCollapseEnabledRef = useRef(profileScrollCollapseEnabled())
  const [profileCollapseEnabled, setProfileCollapseEnabled] = useState(() => profileScrollCollapseEnabled())
  const [profileTabsStickyTopPxState, setProfileTabsStickyTopPxState] = useState(
    PROFILE_COLLAPSED_CHROME_ROW_PX,
  )
  /** Latest tabs sticky top … re-applied after paint so React reveal setState cannot clobber it. */
  const profileTabsTopPxRef = useRef(PROFILE_COLLAPSED_CHROME_ROW_PX)
  const profileTabsElRef = useRef(/** @type {HTMLElement | null} */ (null))
  const profileTabsAnchorRef = useRef(/** @type {HTMLElement | null} */ (null))
  const profileDockScrollPrevTopRef = useRef(0)
  const profileDockRevealRef = useRef(1)
  const profileDockScrollRafRef = useRef(0)
  /** Last dock reveal sent to parent (throttle SocialFeed re-renders). */
  const profileDockRevealNotifiedRef = useRef(1)
  /** FAB dock reveal only (header chrome stays pinned for X-style collapse). */
  const [, setProfileDockReveal] = useState(1)
  // LOUNGE_DOCK_FOOTER_BAR_DISABLED — keep setters for commented classic dock restore.
  // eslint-disable-next-line no-unused-vars -- paired with disabled LoungeDockFooterBar JSX
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
  const compactPostsCount =
    profilePostsTotal > 0 ? profilePostsTotal : Array.isArray(posts) ? posts.length : 0
  const compactPostsLabel =
    compactPostsCount === 1
      ? `${formatCompactStatCount(1)} post`
      : `${formatCompactStatCount(compactPostsCount)} posts`
  const handle = profile?.handle ? `@${String(profile.handle).trim()}` : '@member'
  const aboutDisplay = String(profile?.about_me || profile?.bio || '').trim()
  const locationDisplay = normalizeProfileLocation(profile?.location)
  const profileInterestPills = profileCategoryPills(profile)
  const profileTabsVisible = isOwnProfile ? PROFILE_TAB_IDS : PROFILE_TAB_IDS.slice(0, 2)
  const profileTabIndex = Math.max(0, profileTabsVisible.indexOf(tab))
  const profileTabSlideReduce = prefersReducedMotion()
  const selectProfileTab = useCallback((nextId) => {
    if (!nextId || nextId === tab) return
    if (!profileTabsVisible.includes(nextId)) return
    const el = profileBodyScrollRef.current
    const tabsEl = profileTabsElRef.current
    const anchor = profileTabsAnchorRef.current
    let pinScroll = null
    if (el && tabsEl) {
      const tabsRect = tabsEl.getBoundingClientRect()
      const rootRect = el.getBoundingClientRect()
      const stickyTop = profileTabsTopPxRef.current
      if (tabsRect.top <= rootRect.top + stickyTop + 2) {
        const anchorRect = (anchor || tabsEl).getBoundingClientRect()
        pinScroll = Math.max(
          0,
          Math.round(el.scrollTop + (anchorRect.top - rootRect.top) - stickyTop),
        )
      }
    }
    setTab(nextId)
    if (pinScroll == null) return
    const apply = () => {
      if (profileBodyScrollRef.current) profileBodyScrollRef.current.scrollTop = pinScroll
    }
    apply()
    requestAnimationFrame(() => requestAnimationFrame(apply))
  }, [tab, profileTabsVisible])
  const targetProfileRole = String(profile?.role || 'user').trim().toLowerCase()
  const canAdminPromoteModerator =
    Boolean(viewerIsAdmin && !isOwnProfile && onAdminSetProfileRole && targetProfileRole === 'user')
  const canAdminDemoteModerator =
    Boolean(viewerIsAdmin && !isOwnProfile && onAdminSetProfileRole && targetProfileRole === 'moderator')
  const canAdminCompLifetime = Boolean(
    viewerIsAdmin
    && !isOwnProfile
    && onAdminCompLifetime
    && targetSlotsEntitlements
    && !targetSlotsEntitlements.slots_edge_lifetime_active,
  )
  const canAdminRevokeCompLifetime = Boolean(
    viewerIsAdmin
    && !isOwnProfile
    && onAdminCompLifetime
    && targetSlotsEntitlements?.admin_comp_lifetime,
  )

  const refreshTargetSlotsEntitlements = useCallback(async () => {
    if (!viewerIsAdmin || !profileUserId || isOwnProfile || !supabaseClient) {
      setTargetSlotsEntitlements(null)
      return
    }
    const { data, error } = await adminMemberSlotsEntitlements(supabaseClient, profileUserId)
    if (error || !data) {
      setTargetSlotsEntitlements(null)
      return
    }
    setTargetSlotsEntitlements(data)
  }, [viewerIsAdmin, profileUserId, isOwnProfile, supabaseClient])

  useEffect(() => {
    if (!open) return
    void refreshTargetSlotsEntitlements()
  }, [open, refreshTargetSlotsEntitlements])

  useEffect(() => {
    setAdminRoleErr('')
    setAdminRoleBusy(false)
    setAdminCompErr('')
    setAdminCompBusy(false)
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

  const runAdminCompLifetimeChange = useCallback(
    async (grant) => {
      if (!onAdminCompLifetime || !profileUserId || adminCompBusy) return
      const label = grant
        ? `Comp Slots Edge Lifetime for ${displayName}? Full Pro access, no moderator powers.`
        : `Revoke admin-comped Lifetime from ${displayName}?`
      if (!window.confirm(label)) return
      setAdminCompBusy(true)
      setAdminCompErr('')
      setOtherProfileMenuOpen(false)
      try {
        const result = await onAdminCompLifetime(profileUserId, grant)
        if (!result?.ok) {
          setAdminCompErr(result?.error || 'Could not update Lifetime access.')
          return
        }
        if (result.entitlements && typeof result.entitlements === 'object') {
          setTargetSlotsEntitlements(result.entitlements)
        } else {
          await refreshTargetSlotsEntitlements()
        }
      } catch (e) {
        setAdminCompErr(e instanceof Error ? e.message : 'Could not update Lifetime access.')
      } finally {
        setAdminCompBusy(false)
      }
    },
    [
      adminCompBusy,
      displayName,
      onAdminCompLifetime,
      profileUserId,
      refreshTargetSlotsEntitlements,
    ],
  )
  const profileTabBtnClass =
    profileTabsVisible.length > 2
      ? 'min-h-12 px-1 text-[15px] sm:text-[16px]'
      : 'min-h-12 px-2 text-[16px] sm:text-[17px]'
  const profileAutoplayPostCount =
    tab === 'posts'
      ? posts.length
      : tab === 'likes'
        ? likesTab.posts.length
        : tab === 'bookmarks'
          ? bookmarksTab.posts.length
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
              setBookmarksTab((prev) => ({
                ...prev,
                posts: prev.posts.filter((p) => p.id !== postId),
              }))
            }
            return r
          }
        : base.toggleBookmark
    const wrapLike =
      typeof base.toggleInteraction === 'function'
        ? async (postId, key) => {
            const r = await base.toggleInteraction(postId, key)
            if (r?.ok && tab === 'likes' && key === 'liked' && r.liked === false) {
              setLikesTab((prev) => ({
                ...prev,
                posts: prev.posts.filter((p) => p.id !== postId),
              }))
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
    const wrapProfilePin =
      typeof base.setLoungeProfilePostPinned === 'function'
        ? async (postId, nextPinned) => {
            const result = await base.setLoungeProfilePostPinned(postId, nextPinned)
            if (result?.ok) {
              const pinnedAt = result.profile_pinned_at || null
              setNestedProfileStack((prev) =>
                prev.map((layer) => ({
                  ...layer,
                  posts: applyLoungeProfilePinToPosts(layer.posts, postId, pinnedAt),
                })),
              )
            }
            return result
          }
        : base.setLoungeProfilePostPinned
    return {
      ...base,
      toggleBookmark: wrapBm,
      toggleInteraction: wrapLike,
      onToggleCommentLike: wrapCommentLike,
      onToggleCommentBookmark: wrapCommentBookmark,
      onCommentPlainRepost: wrapCommentPlainRepost,
      onCommentUndoPlainRepost: wrapCommentUndoRepost,
      setLoungeProfilePostPinned: wrapProfilePin,
    }
  }, [postCardProps, tab])

  const profileFanLockCtx = useMemo(
    () => ({
      viewerUserId: postCardProps?.viewerUserId,
      viewerIsStaff: postCardProps?.loungeViewerIsStaff,
      fanEntitlements: postCardProps?.fanEntitlements,
    }),
    [postCardProps?.viewerUserId, postCardProps?.loungeViewerIsStaff, postCardProps?.fanEntitlements],
  )

  useEffect(() => {
    if (!open) return
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
  }, [open, profileReplies, postCardProps?.hydrateCommentInteractionsForIds])

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
    setLikesTab(emptyProfileInteractionTabState())
    setBookmarksTab(emptyProfileInteractionTabState())
    setProfileReplies([])
    setProfileRepliesErr('')
    setProfileRepliesLoading(false)
    setProfileRepliesLoadingMore(false)
    setProfileRepliesHasMore(false)
    profileRepliesFetchOffsetRef.current = 0
    profileRepliesFetchedRef.current = false
    profileRepliesInFlightRef.current = false
    likesFetchOffsetRef.current = 0
    likesFetchedRef.current = false
    likesInFlightRef.current = false
    bookmarksFetchOffsetRef.current = 0
    bookmarksFetchedRef.current = false
    bookmarksInFlightRef.current = false
  }, [open, profileUserId])

  useEffect(() => {
    if (!open || !isOwnProfile || !requestOwnProfileEditing) return
    setAboutErr('')
    setOwnProfileEditing(true)
  }, [open, isOwnProfile, requestOwnProfileEditing, profileUserId])

  useEffect(() => {
    if (!open || !isOwnProfile || !requestOpenFanPortal) return
    setFanPortalOpen(true)
  }, [open, isOwnProfile, requestOpenFanPortal, profileUserId])

  useEffect(() => {
    if (!open || !panelVisible || !requestAutoOpenSubscribe || isOwnProfile) return
    if (!viewerUserId) {
      onRequireAuth?.('create')
      onRequestAutoOpenSubscribeConsumed?.()
      return
    }
    if (creatorFanOffer) {
      if (!hasCreatorFanSub) {
        setFanSubscribeModalOpen(true)
      }
      onRequestAutoOpenSubscribeConsumed?.()
    }
  }, [
    open,
    panelVisible,
    requestAutoOpenSubscribe,
    isOwnProfile,
    viewerUserId,
    creatorFanOffer,
    hasCreatorFanSub,
    onRequireAuth,
    onRequestAutoOpenSubscribeConsumed,
  ])

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

  const beginProfileInteractionFetch = useCallback(
    (tabId) => {
      if (!open || !isOwnProfile || !profileUserId) return
      if (tabId !== 'likes' && tabId !== 'bookmarks') return
      const isLikes = tabId === 'likes'
      const fetchedRef = isLikes ? likesFetchedRef : bookmarksFetchedRef
      const inFlightRef = isLikes ? likesInFlightRef : bookmarksInFlightRef
      const offsetRef = isLikes ? likesFetchOffsetRef : bookmarksFetchOffsetRef
      const setBucket = isLikes ? setLikesTab : setBookmarksTab
      if (fetchedRef.current || inFlightRef.current) return
      if (typeof hydratePosts !== 'function') {
        setBucket({
          posts: [],
          loading: false,
          loadingMore: false,
          hasMore: false,
          err: 'Could not load saved posts.',
        })
        return
      }
      const profileAtStart = profileUserId
      inFlightRef.current = true
      offsetRef.current = 0
      setBucket((prev) => ({ ...prev, loading: true, loadingMore: false, err: '', hasMore: false }))
      ;(async () => {
        try {
          const { posts: pagePosts, hasMore, fetchedCount } = await fetchProfileInteractionPostsPage(
            supabaseClient,
            {
              profileUserId: profileAtStart,
              tab: tabId,
              offset: 0,
              limit: LOUNGE_PROFILE_TAB_PAGE_SIZE,
              hydratePosts,
            },
          )
          if (profileAtStart !== profileUserIdRef.current) return
          fetchedRef.current = true
          offsetRef.current = fetchedCount || 0
          setBucket({
            posts: pagePosts,
            loading: false,
            loadingMore: false,
            hasMore,
            err: '',
          })
          const refreshFn = postCardProps?.refreshPostInteractions
          if (typeof refreshFn === 'function' && pagePosts?.length) {
            void refreshFn([...collectLoungePostInteractionHydrateIds(pagePosts)])
          }
        } catch (e) {
          if (profileAtStart !== profileUserIdRef.current) return
          setBucket({
            posts: [],
            loading: false,
            loadingMore: false,
            hasMore: false,
            err: e?.message || 'Could not load.',
          })
        } finally {
          inFlightRef.current = false
        }
      })()
    },
    [open, isOwnProfile, profileUserId, supabaseClient, hydratePosts, postCardProps?.refreshPostInteractions],
  )

  const loadMoreInteractionPosts = useCallback(async () => {
    if (!open || !isOwnProfile || !profileUserId || (tab !== 'likes' && tab !== 'bookmarks')) return
    const isLikes = tab === 'likes'
    const bucket = isLikes ? likesTab : bookmarksTab
    if (!bucket.hasMore || bucket.loading || bucket.loadingMore) return
    if (typeof hydratePosts !== 'function') return
    const offsetRef = isLikes ? likesFetchOffsetRef : bookmarksFetchOffsetRef
    const setBucket = isLikes ? setLikesTab : setBookmarksTab
    setBucket((prev) => ({ ...prev, loadingMore: true }))
    try {
      const offset = offsetRef.current
      const { posts: pagePosts, hasMore, fetchedCount } = await fetchProfileInteractionPostsPage(supabaseClient, {
        profileUserId,
        tab,
        offset,
        limit: LOUNGE_PROFILE_TAB_PAGE_SIZE,
        hydratePosts,
      })
      offsetRef.current = offset + (fetchedCount || 0)
      setBucket((prev) => {
        const seen = new Set(prev.posts.map((p) => String(p.id)))
        const merged = [...prev.posts]
        for (const row of pagePosts || []) {
          if (!row?.id || seen.has(String(row.id))) continue
          seen.add(String(row.id))
          merged.push(row)
        }
        return { ...prev, posts: merged, hasMore, loadingMore: false }
      })
      const refreshFn = postCardProps?.refreshPostInteractions
      if (typeof refreshFn === 'function' && pagePosts?.length) {
        void refreshFn([...collectLoungePostInteractionHydrateIds(pagePosts)])
      }
    } catch (e) {
      setBucket((prev) => ({
        ...prev,
        loadingMore: false,
        err: e?.message || 'Could not load more.',
      }))
    }
  }, [
    open,
    tab,
    isOwnProfile,
    profileUserId,
    likesTab,
    bookmarksTab,
    supabaseClient,
    hydratePosts,
    postCardProps?.refreshPostInteractions,
  ])

  const beginProfileRepliesFetch = useCallback(() => {
    if (!open || !profileUserId) return
    if (profileRepliesFetchedRef.current || profileRepliesInFlightRef.current) return
    if (typeof hydratePosts !== 'function') {
      setProfileRepliesErr('Could not load replies.')
      setProfileReplies([])
      setProfileRepliesHasMore(false)
      setProfileRepliesLoading(false)
      return
    }
    const profileAtStart = profileUserId
    profileRepliesInFlightRef.current = true
    profileRepliesFetchOffsetRef.current = 0
    setProfileRepliesLoading(true)
    setProfileRepliesLoadingMore(false)
    setProfileRepliesErr('')
    setProfileRepliesHasMore(false)
    ;(async () => {
      try {
        const { items, hasMore, fetchedCount } = await fetchProfileRepliesPage(supabaseClient, {
          profileUserId: profileAtStart,
          profile,
          offset: 0,
          limit: LOUNGE_PROFILE_TAB_PAGE_SIZE,
          hydratePosts,
          viewerUserId: viewerUserId || postCardProps?.viewerUserId,
          loungeViewerIsStaff: postCardProps?.loungeViewerIsStaff,
          fanEntitlements: postCardProps?.fanEntitlements,
        })
        if (profileAtStart !== profileUserIdRef.current) return
        profileRepliesFetchedRef.current = true
        setProfileReplies(items)
        setProfileRepliesHasMore(hasMore)
        profileRepliesFetchOffsetRef.current = fetchedCount || 0
      } catch (e) {
        if (profileAtStart !== profileUserIdRef.current) return
        setProfileRepliesErr(e?.message || 'Could not load replies.')
        setProfileReplies([])
        setProfileRepliesHasMore(false)
      } finally {
        profileRepliesInFlightRef.current = false
        if (profileAtStart === profileUserIdRef.current) setProfileRepliesLoading(false)
      }
    })()
  }, [
    open,
    profileUserId,
    supabaseClient,
    hydratePosts,
    profile,
    viewerUserId,
    postCardProps?.viewerUserId,
    postCardProps?.loungeViewerIsStaff,
    postCardProps?.fanEntitlements,
  ])

  const beginProfileRepliesFetchRef = useRef(beginProfileRepliesFetch)
  beginProfileRepliesFetchRef.current = beginProfileRepliesFetch
  const beginProfileInteractionFetchRef = useRef(beginProfileInteractionFetch)
  beginProfileInteractionFetchRef.current = beginProfileInteractionFetch

  useEffect(() => {
    if (!open || !profileUserId) return
    if (tab === 'replies') beginProfileRepliesFetchRef.current()
    if (tab === 'likes' || tab === 'bookmarks') beginProfileInteractionFetchRef.current(tab)
  }, [open, tab, profileUserId])

  useEffect(() => {
    if (!open || !profileUserId) return
    let cancelled = false
    const staggerIds = []
    const start = () => {
      if (cancelled) return
      beginProfileRepliesFetchRef.current()
      if (!isOwnProfile) return
      staggerIds.push(
        window.setTimeout(() => {
          if (!cancelled) beginProfileInteractionFetchRef.current('likes')
        }, 70),
      )
      staggerIds.push(
        window.setTimeout(() => {
          if (!cancelled) beginProfileInteractionFetchRef.current('bookmarks')
        }, 140),
      )
    }
    let idleId = 0
    let timeoutId = 0
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(start, { timeout: 500 })
    } else {
      timeoutId = window.setTimeout(start, 160)
    }
    return () => {
      cancelled = true
      if (idleId && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId) window.clearTimeout(timeoutId)
      for (const id of staggerIds) window.clearTimeout(id)
    }
  }, [open, profileUserId, isOwnProfile])

  const loadMoreProfileReplies = useCallback(async () => {
    if (!open || !profileUserId || tab !== 'replies') return
    if (!profileRepliesHasMore || profileRepliesLoading || profileRepliesLoadingMore) return
    if (typeof hydratePosts !== 'function') return
    setProfileRepliesLoadingMore(true)
    try {
      const offset = profileRepliesFetchOffsetRef.current
      const { items, hasMore, fetchedCount } = await fetchProfileRepliesPage(supabaseClient, {
        profileUserId,
        profile,
        offset,
        limit: LOUNGE_PROFILE_TAB_PAGE_SIZE,
        hydratePosts,
        viewerUserId: viewerUserId || postCardProps?.viewerUserId,
        loungeViewerIsStaff: postCardProps?.loungeViewerIsStaff,
        fanEntitlements: postCardProps?.fanEntitlements,
      })
      profileRepliesFetchOffsetRef.current = offset + (fetchedCount || 0)
      setProfileReplies((prev) => {
        const seen = new Set(prev.map((it) => String(it.comment?.id)))
        const merged = [...prev]
        for (const row of items || []) {
          const cid = row?.comment?.id ? String(row.comment.id) : ''
          if (!cid || seen.has(cid)) continue
          seen.add(cid)
          merged.push(row)
        }
        return merged
      })
      setProfileRepliesHasMore(hasMore)
    } catch (e) {
      setProfileRepliesErr(e?.message || 'Could not load more replies.')
    } finally {
      setProfileRepliesLoadingMore(false)
    }
  }, [
    open,
    tab,
    profileUserId,
    profile,
    profileRepliesHasMore,
    profileRepliesLoading,
    profileRepliesLoadingMore,
    supabaseClient,
    hydratePosts,
    viewerUserId,
    postCardProps?.viewerUserId,
    postCardProps?.loungeViewerIsStaff,
    postCardProps?.fanEntitlements,
  ])

  const profileTabHasMore =
    tab === 'posts'
      ? postsHasMore
      : tab === 'replies'
        ? profileRepliesHasMore
        : tab === 'likes'
          ? likesTab.hasMore
          : tab === 'bookmarks'
            ? bookmarksTab.hasMore
            : false

  const profileTabLoadingMore =
    tab === 'posts'
      ? postsLoadingMore
      : tab === 'replies'
        ? profileRepliesLoadingMore
        : tab === 'likes'
          ? likesTab.loadingMore
          : tab === 'bookmarks'
            ? bookmarksTab.loadingMore
            : false

  const loadMoreActiveProfileTab = useCallback(() => {
    if (tab === 'posts') {
      if (typeof onLoadMorePosts === 'function') void onLoadMorePosts()
      return
    }
    if (tab === 'replies') {
      void loadMoreProfileReplies()
      return
    }
    if (tab === 'likes' || tab === 'bookmarks') {
      void loadMoreInteractionPosts()
    }
  }, [tab, onLoadMorePosts, loadMoreProfileReplies, loadMoreInteractionPosts])

  useEffect(() => {
    if (!open || !profileTabHasMore || profileTabLoadingMore) return
    const root = profileBodyScrollRef.current
    const node = profileLoadMoreSentinelRef.current
    if (!root || !node || typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    const observer = new window.IntersectionObserver(
      (entries) => {
        const first = entries?.[0]
        if (first?.isIntersecting) loadMoreActiveProfileTab()
      },
      { root, rootMargin: '300px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [open, tab, profileTabHasMore, profileTabLoadingMore, loadMoreActiveProfileTab])

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

  const applyProfileCollapseVisuals = useCallback((scrollTop, opts = {}) => {
    const collapseOn = profileCollapseEnabledRef.current
    const iosWebTitle =
      profileIosWebTitleChromeEnabled() && !showOwnEditControls && !opts.forceZero
    const forceZero =
      Boolean(opts.forceZero) || showOwnEditControls || !collapseOn
    const y = forceZero ? 0 : Math.max(0, Number(scrollTop) || 0)
    const reduce = forceZero ? false : profileCollapseReduceMotionRef.current
    const sat = Math.max(8, Number(profileSatPxRef.current) || readCssSafeAreaTopPx())
    profileSatPxRef.current = sat

    // Classic scroll (iOS PWA / Android): skip collapse math + style thrash every frame.
    if (!collapseOn) {
      if (!profileClassicChromeClearedRef.current || opts.forceZero || showOwnEditControls) {
        profileClassicChromeClearedRef.current = true
        profileBannerBlurNameGapAtTuckRef.current = null
        profileBannerBlurStartScrollRef.current = null
        const media = profileBannerMediaRef.current
        if (media) {
          media.style.filter = ''
          media.style.transform = ''
          media.style.top = ''
          media.style.right = ''
          media.style.bottom = ''
          media.style.left = ''
          media.style.width = ''
          media.style.height = ''
        }
        const blurOverlay = profileBannerBlurOverlayRef.current
        if (blurOverlay) {
          blurOverlay.style.opacity = '0'
          blurOverlay.style.background = ''
          blurOverlay.style.backdropFilter = 'none'
          blurOverlay.style.webkitBackdropFilter = 'none'
        }
        const bannerShell = profileBannerShellRef.current
        if (bannerShell) {
          bannerShell.style.zIndex = ''
          bannerShell.style.top = ''
          bannerShell.style.transform = ''
          bannerShell.classList.remove('sticky')
          bannerShell.classList.add('relative')
        }
        const avatarRow = profileAvatarRowRef.current
        if (avatarRow) {
          avatarRow.style.zIndex = ''
          avatarRow.style.clipPath = ''
          avatarRow.style.webkitClipPath = ''
        }
        const liveScrim = profileBannerLiveScrimRef.current
        if (liveScrim) liveScrim.style.opacity = '0.12'
        const collapsedScrim = profileCollapsedScrimRef.current
        if (collapsedScrim) {
          collapsedScrim.style.opacity = '0'
          collapsedScrim.style.height = ''
        }
        const avatar = profileAvatarMotionRef.current
        if (avatar) {
          avatar.style.transformOrigin = ''
          avatar.style.transform = ''
          avatar.style.opacity = ''
          avatar.style.pointerEvents = ''
          avatar.style.willChange = ''
          avatar.style.zIndex = ''
          avatar.style.width = ''
          avatar.style.height = ''
          avatar.style.marginTop = ''
        }
        const compact = profileCompactNameRef.current
        if (compact) {
          compact.style.opacity = '0'
          compact.style.transform = `translate3d(0, ${PROFILE_COMPACT_NAME_SLIDE_PX}px, 0)`
        }
      }
    } else {
      profileClassicChromeClearedRef.current = false
      const pinRange = profileCollapseRangePxRef.current
      const motion = profileCollapseShellPreset(isEdgeiOSShell())
      const v = profileCollapseVisuals(y, pinRange, {
        reduceMotion: reduce,
        scrollLag: motion.scrollLag,
        shrinkEasePower: motion.shrinkEasePower,
        minScale: motion.minScale,
      })
      const nameReveal = forceZero
        ? { progress: 0, opacity: 0, translateYPx: PROFILE_COMPACT_NAME_SLIDE_PX }
        : profileCompactNameReveal(y, profileNameRevealScrollRef.current)

      // Live blur: wait for avatar tuck, ramp until display name enters under the banner.
      // IPA uses scroll-distance ramp (name-gap alone flashed to full).
      let blurT = 0
      if (!forceZero) {
        const scrollEl = profileBodyScrollRef.current
        const avatarEl = profileAvatarMotionRef.current
        const nameEl = profileDisplayNameRef.current
        const bannerEl = profileBannerShellRef.current
        if (scrollEl && avatarEl) {
          const scrollRect = scrollEl.getBoundingClientRect()
          const pinRangeNow = profileCollapseRangePxRef.current
          const pinnedVisible = profileStickyTopPxRef.current
          const bannerBottomY =
            y >= pinRangeNow
              ? scrollRect.top + pinnedVisible
              : bannerEl
                ? bannerEl.getBoundingClientRect().bottom
                : scrollRect.top + pinnedVisible
          const ar = avatarEl.getBoundingClientRect()
          const ring = PROFILE_AVATAR_RING_PX
          const top = ar.top - ring
          const h = Math.max(1, ar.height + ring * 2)
          const underFrac = Math.max(0, Math.min(1, (bannerBottomY - top) / h))
          const nameTop = nameEl ? nameEl.getBoundingClientRect().top : bannerBottomY + 999
          const nameGapPx = nameTop - bannerBottomY
          const nameUnderScroll = Math.max(
            0,
            (Number(profileNameRevealScrollRef.current) || 0) - 8,
          )
          blurT = profileLiveBannerBlurProgress({
            underFrac,
            nameGapPx,
            scrollTop: y,
            nameUnderScrollPx: nameUnderScroll,
            tuckFrac: profileBannerBlurTuckFrac(),
            nameGapAtTuckRef: profileBannerBlurNameGapAtTuckRef,
            blurStartScrollRef: profileBannerBlurStartScrollRef,
            reduceMotion: reduce,
            useScrollRamp: isEdgeiOSShell(),
          })
        }
      } else {
        profileBannerBlurNameGapAtTuckRef.current = null
        profileBannerBlurStartScrollRef.current = null
      }
      const blurPx = blurT * PROFILE_BANNER_MEDIA_BLUR_MAX_PX

      // Keep the photo sharp … CSS filter:blur on the img squeezes edges / seams.
      // Frost is a backdrop-filter overlay so crop and scale never change.
      const media = profileBannerMediaRef.current
      if (media) {
        media.style.filter = ''
        media.style.transform = ''
        media.style.top = ''
        media.style.right = ''
        media.style.bottom = ''
        media.style.left = ''
        media.style.width = ''
        media.style.height = ''
      }
      const blurOverlay = profileBannerBlurOverlayRef.current
      if (blurOverlay) {
        if (blurPx > 0.15) {
          const tint = 0.04 + blurT * 0.1
          blurOverlay.style.opacity = '1'
          blurOverlay.style.background = `rgba(9, 9, 11, ${tint.toFixed(3)})`
          blurOverlay.style.backdropFilter = `blur(${blurPx.toFixed(2)}px)`
          blurOverlay.style.webkitBackdropFilter = `blur(${blurPx.toFixed(2)}px)`
        } else {
          blurOverlay.style.opacity = '0'
          blurOverlay.style.background = ''
          blurOverlay.style.backdropFilter = 'none'
          blurOverlay.style.webkitBackdropFilter = 'none'
        }
      }
      const bannerShell = profileBannerShellRef.current
      if (bannerShell) {
        bannerShell.classList.add('sticky')
        bannerShell.classList.remove('relative')
        // Sticky layer below chrome (z-30). Avatar row beats this only at rest (peek).
        bannerShell.style.zIndex = '28'
        bannerShell.style.transform = 'translateZ(0)'
        bannerShell.style.top = `${profileBannerStickyTopPxRef.current}px`
      }
      const avatarRow = profileAvatarRowRef.current
      if (avatarRow) {
        // Rest: above banner for −mt peek. After a few px: under banner.
        avatarRow.style.zIndex = v.avatarUnderBanner ? '10' : '29'
        avatarRow.style.clipPath = ''
        avatarRow.style.webkitClipPath = ''
      }
      const liveScrim = profileBannerLiveScrimRef.current
      if (liveScrim) {
        liveScrim.style.opacity = String(v.bannerScrim)
      }
      const collapsedScrim = profileCollapsedScrimRef.current
      if (collapsedScrim) {
        // Thin frost under chrome/name … same timing as media blur (not pin settle).
        const frostH = Math.max(
          48,
          Math.round(
            (Number(profileChromeCenterNudgePxRef.current) || 0)
              + sat
              + 40
              + 10,
          ),
        )
        collapsedScrim.style.height = `${frostH}px`
        collapsedScrim.style.top = '0'
        collapsedScrim.style.left = '0'
        collapsedScrim.style.right = '0'
        collapsedScrim.style.bottom = 'auto'
        collapsedScrim.style.opacity = String(blurT)
      }
      const avatar = profileAvatarMotionRef.current
      if (avatar) {
        avatar.style.transformOrigin = '50% 0%'
        avatar.style.transform = `translate3d(0, ${v.avatarTranslateY}px, 0) scale(${v.avatarScale})`
        avatar.style.opacity = String(v.avatarOpacity)
        avatar.style.pointerEvents = v.avatarOpacity < 0.08 ? 'none' : ''
        avatar.style.willChange = v.avatarUnderBanner ? 'auto' : 'transform'
        avatar.style.zIndex = v.avatarUnderBanner ? '1' : ''
        avatar.style.width = ''
        avatar.style.height = ''
        avatar.style.marginTop = ''
      }
      const compact = profileCompactNameRef.current
      if (compact) {
        if (reduce) {
          compact.style.opacity = String(nameReveal.progress)
          compact.style.transform = 'translate3d(0, 0, 0)'
        } else {
          compact.style.opacity = String(nameReveal.opacity)
          compact.style.transform = `translate3d(0, ${nameReveal.translateYPx}px, 0)`
        }
      }
    }

    const chromeMotion = profileChromeMotionRef.current
    const scrollYForChrome = Math.max(0, Number(scrollTop) || 0)
    const bannerHApprox = Math.max(0, profileBannerHeightPxRef.current)
    const iosWebTitleH = sat + PROFILE_IOS_WEB_TITLE_BAR_PX
    const bannerClearY =
      bannerHApprox > 0 ? Math.max(24, bannerHApprox - 8) : Number.POSITIVE_INFINITY
    const pastBanner = iosWebTitle && scrollYForChrome >= bannerClearY
    const scrollDelta = scrollYForChrome - profileIosWebChromeScrollPrevRef.current
    profileIosWebChromeScrollPrevRef.current = scrollYForChrome

    // Latch feed chrome after clearing the banner; clear only near the top so the white
    // plate does not pre-exit mid-profile or hand off to a second button set early.
    if (!iosWebTitle || scrollYForChrome <= 2) {
      profileIosWebFeedLatchRef.current = false
    } else if (pastBanner) {
      profileIosWebFeedLatchRef.current = true
    }
    // Entering the feed with buttons already scrolled away … keep dock chrome hidden
    // so they do not pop back, then slide away again on the next scroll-down.
    if (pastBanner && !profileIosWebWasPastBannerRef.current && scrollYForChrome >= iosWebTitleH) {
      profileDockRevealRef.current = 0
    }
    profileIosWebWasPastBannerRef.current = Boolean(pastBanner)

    const feedLatched = profileIosWebFeedLatchRef.current
    const nearTopHandoff = feedLatched && scrollYForChrome <= iosWebTitleH
    const revealNow = Math.max(0, Math.min(1, Number(profileDockRevealRef.current) || 0))
    const dockHideNow = (1 - revealNow) * iosWebTitleH

    let titleHidePx = 0
    let buttonHidePx = 0
    if (!iosWebTitle) {
      titleHidePx = 0
      buttonHidePx = 0
    } else if (nearTopHandoff) {
      if (scrollDelta > 0.5) {
        // Scrolling down through the handoff band … do not slide the title back in.
        titleHidePx = Math.round(iosWebTitleH)
        buttonHidePx = Math.round(Math.min(iosWebTitleH, scrollYForChrome))
      } else {
        // Scroll-up handoff (signed off): title leaves, same buttons stay.
        titleHidePx = Math.round(iosWebTitleH - scrollYForChrome)
        buttonHidePx = 0
      }
    } else if (feedLatched || pastBanner) {
      buttonHidePx = Math.round(dockHideNow)
      if (scrollDelta > 0.5) {
        // Scroll-down: park the title fully away (no half-pop). Buttons still slide with dock.
        titleHidePx = dockHideNow > 0.5 ? Math.round(iosWebTitleH) : 0
      } else {
        // Scroll-up / idle: title rides dock with the buttons so tabs push down 1:1.
        titleHidePx = Math.round(dockHideNow)
      }
    } else {
      // Fresh open on banner: floating buttons leave with the page; no white plate.
      titleHidePx = Math.round(iosWebTitleH)
      buttonHidePx = Math.round(Math.min(iosWebTitleH, scrollYForChrome))
    }
    const titleOnScreen = iosWebTitle && titleHidePx < iosWebTitleH - 1
    const buttonsOnScreen = iosWebTitle && buttonHidePx < iosWebTitleH - 1
    // Tabs / status use latched-or-past so returning through the banner stays flush.
    const inFeedChrome = pastBanner || feedLatched

    let tabsTop = collapseOn
      ? profileStickyTopPxRef.current
      : Math.max(0, Math.round(sat))
    if (iosWebTitle) {
      if (inFeedChrome) {
        const titleBottom = iosWebTitleH - titleHidePx
        const overlap =
          titleBottom > sat + PROFILE_IOS_WEB_TABS_OVERLAP_PX
            ? PROFILE_IOS_WEB_TABS_OVERLAP_PX
            : 0
        tabsTop = Math.max(sat, Math.min(iosWebTitleH, titleBottom - overlap))
      } else {
        tabsTop = Math.round(sat)
      }
    }

    const applied = profileIosWebAppliedHideRef.current
    const chromeDirty =
      applied.title !== titleHidePx
      || applied.btn !== buttonHidePx
      || applied.tabs !== tabsTop
      || applied.inFeed !== (inFeedChrome ? 1 : 0)
      || Boolean(opts.forceZero)
      || showOwnEditControls

    if (!chromeDirty && iosWebTitle) {
      // Still drive compact title slide every frame (titleHide may be stable while frac stays).
      const compact = profileCompactNameRef.current
      if (compact) {
        const titleFrac = Math.max(0, Math.min(1, 1 - titleHidePx / Math.max(1, iosWebTitleH)))
        const reduceMotion = profileCollapseReduceMotionRef.current
        if (reduceMotion) {
          compact.style.opacity = String(titleFrac)
          compact.style.transform = 'translate3d(0, 0, 0)'
        } else {
          compact.style.opacity = titleFrac > 0.02 ? '1' : '0'
          compact.style.transform = `translate3d(0, ${(1 - titleFrac) * PROFILE_COMPACT_NAME_SLIDE_PX}px, 0)`
        }
      }
      return
    }

    const iosWebSlide = profileIosWebSlideRef.current
    if (iosWebSlide) {
      // Stack stays put … title plate and buttons move independently.
      iosWebSlide.style.transform = ''
      if (iosWebTitle) {
        iosWebSlide.setAttribute('data-lounge-profile-ios-web-title-hide', String(titleHidePx))
        iosWebSlide.setAttribute('data-lounge-profile-ios-web-btn-hide', String(buttonHidePx))
      } else {
        iosWebSlide.removeAttribute('data-lounge-profile-ios-web-title-hide')
        iosWebSlide.removeAttribute('data-lounge-profile-ios-web-btn-hide')
      }
    }

    const statusPlate = profileIosWebStatusPlateRef.current
    if (statusPlate) {
      if (iosWebTitle) {
        statusPlate.hidden = false
        statusPlate.style.height = `${sat}px`
        statusPlate.style.transform = ''
        // Stay opaque for the whole in-feed stretch so tabs can sit flush under status
        // when the white title plate has slid away (no air gap).
        statusPlate.style.opacity = inFeedChrome ? '1' : '0'
      } else {
        statusPlate.hidden = true
        statusPlate.style.opacity = '0'
      }
    }
    const titleBar = profileIosWebTitleBarRef.current
    if (titleBar) {
      if (iosWebTitle) {
        titleBar.hidden = false
        titleBar.style.height = `${iosWebTitleH}px`
        titleBar.style.transform = `translate3d(0, ${-titleHidePx}px, 0)`
        titleBar.style.opacity = titleOnScreen ? '1' : '0'
      } else {
        titleBar.hidden = true
        titleBar.style.opacity = '0'
        titleBar.style.transform = ''
      }
    }

    if (iosWebTitle) {
      const compact = profileCompactNameRef.current
      if (compact) {
        const titleFrac = Math.max(0, Math.min(1, 1 - titleHidePx / Math.max(1, iosWebTitleH)))
        const reduceMotion = profileCollapseReduceMotionRef.current
        if (reduceMotion) {
          compact.style.opacity = String(titleFrac)
          compact.style.transform = 'translate3d(0, 0, 0)'
        } else {
          compact.style.opacity = titleFrac > 0.02 ? '1' : '0'
          compact.style.transform = `translate3d(0, ${(1 - titleFrac) * PROFILE_COMPACT_NAME_SLIDE_PX}px, 0)`
        }
      }
    }

    if (chromeMotion) {
      if (showOwnEditControls || opts.forceZero) {
        chromeMotion.style.transform = ''
        chromeMotion.style.opacity = ''
      } else if (iosWebTitle) {
        chromeMotion.style.transform = `translate3d(0, ${-buttonHidePx}px, 0)`
        chromeMotion.style.opacity = buttonsOnScreen ? '1' : '0'
      } else if (collapseOn) {
        const nudge = profileChromeCenterNudgePxRef.current
        chromeMotion.style.transform =
          reduce ? '' : `translate3d(0, ${nudge}px, 0)`
        chromeMotion.style.opacity = ''
      } else {
        chromeMotion.style.transform = ''
        chromeMotion.style.opacity = ''
      }
    }
    // Tabs track the title plate bottom (not the buttons).
    const tabsEl =
      profileTabsElRef.current
      || profileBodyScrollRef.current?.querySelector?.('[data-lounge-profile-tabs]')
    if (tabsEl) {
      profileTabsElRef.current = tabsEl
      if (iosWebTitle && inFeedChrome) {
        tabsEl.setAttribute('data-lounge-profile-ios-web-tabs', '')
      } else {
        tabsEl.removeAttribute('data-lounge-profile-ios-web-tabs')
      }
      tabsEl.style.top = `${tabsTop}px`
      profileTabsTopPxRef.current = tabsTop
      // Avoid React setState on every scroll frame when title chrome owns `top` via DOM.
      if (!iosWebTitle) {
        setProfileTabsStickyTopPxState((prev) => (prev === tabsTop ? prev : tabsTop))
      }
    }
    applied.title = titleHidePx
    applied.btn = buttonHidePx
    applied.tabs = tabsTop
    applied.inFeed = inFeedChrome ? 1 : 0
  }, [showOwnEditControls])
  applyProfileCollapseVisualsRef.current = applyProfileCollapseVisuals

  const measureProfileCollapseGeometry = useCallback(() => {
    const collapseOn = profileCollapseEnabledRef.current
    const iosWebTitle = profileIosWebTitleChromeEnabled()
    const banner = profileBannerShellRef.current
    const scrollEl = profileBodyScrollRef.current
    const bannerH = banner ? Math.ceil(banner.getBoundingClientRect().height) : 0
    profileBannerHeightPxRef.current = bannerH
    invalidateCssSafeAreaTopPxCache()
    const sat = readCssSafeAreaTopPx()
    profileSatPxRef.current = Math.max(8, sat)
    // Chrome row already has paddingTop ≈ sat; nudge so back/⋯ center on the tuned band.
    const chromePadTop = Math.max(8, sat) // matches max(0.5rem, sat) on the chrome row
    const isIpa = isEdgeiOSShell()
    const chromeNudge = collapseOn
      ? profileChromeCenterNudgePx({
          bannerHeightPx: bannerH,
          chromePadTopPx: chromePadTop,
          isIpaShell: isIpa,
        })
      : 0
    profileChromeCenterNudgePxRef.current = chromeNudge

    const chromeButtonBottom = chromePadTop + chromeNudge + 40

    // Banner rests ~5px below the back/⋯ buttons, then sticks.
    const pinnedVisible = chromeButtonBottom + PROFILE_PINNED_BANNER_BELOW_CHROME_PX

    const bannerStickyTop = collapseOn
      ? profileBannerStickyTopPx(bannerH, pinnedVisible)
      : 0
    const pinRange = collapseOn
      ? profileBannerPinScrollRangePx(bannerH, pinnedVisible)
      : PROFILE_COLLAPSE_RANGE_PX

    profileBannerStickyTopPxRef.current = bannerStickyTop
    profileCollapseRangePxRef.current = pinRange
    profileStickyTopPxRef.current = pinnedVisible
    // iOS web title chrome owns tabs `top` via applyProfileCollapseVisuals.
    // Do NOT reset to sat here … that fought the title bar and recreated the gap.
    if (!iosWebTitle) {
      setProfileTabsStickyTopPxState((prev) => {
        if (!collapseOn) {
          const classicTop = Math.max(0, Math.round(sat))
          return prev === classicTop ? prev : classicTop
        }
        return prev === pinnedVisible ? prev : pinnedVisible
      })
    }

    if (banner) {
      if (collapseOn) {
        banner.style.top = `${bannerStickyTop}px`
        banner.classList.add('sticky')
        banner.classList.remove('relative')
      } else {
        banner.style.top = ''
        banner.style.zIndex = ''
        banner.classList.remove('sticky')
        banner.classList.add('relative')
      }
    }

    const nameEl = profileDisplayNameRef.current
    if (scrollEl && nameEl) {
      const scrollRect = scrollEl.getBoundingClientRect()
      const nameRect = nameEl.getBoundingClientRect()
      const nameDocTop = nameRect.top - scrollRect.top + scrollEl.scrollTop
      const nameUnderScroll = Math.max(36, Math.round(nameDocTop - pinnedVisible))
      // Compact title fades in just after the large name crosses under the pinned strip.
      profileNameRevealScrollRef.current = Math.max(36, nameUnderScroll + 8)
    }

    profileIosWebAppliedHideRef.current = { title: -1, btn: -1, tabs: -1, inFeed: -1 }
    profileClassicChromeClearedRef.current = false
    applyProfileCollapseVisualsRef.current?.(scrollEl?.scrollTop ?? 0)
  }, [])

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
      setIsProfileFeedMuted(false)
      return
    }
    try {
      const [followersRes, followingRes, followRow, subRow, reverseFollow, blockStatus, muteRow] = await Promise.all([
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
        supabaseClient
          .from('profile_feed_mutes')
          .select('muted_user_id')
          .eq('muter_id', viewerUserId)
          .eq('muted_user_id', profileUserId)
          .maybeSingle(),
      ])
      setFollowerCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setIsFollowing(!!followRow.data)
      setIsSubscribed(!!subRow.data)
      setProfileFollowsViewer(!!reverseFollow.data)
      setIBlockingThem(blockStatus.iBlockThem)
      setTheyBlockMe(blockStatus.theyBlockMe)
      setIsProfileFeedMuted(!!muteRow.data && !muteRow.error)
    } catch {
      setFollowerCount(0)
      setFollowingCount(0)
    }
  }, [profileUserId, supabaseClient, viewerUserId])

  const refreshProfilePostsTotal = useCallback(async () => {
    const uid = String(profileUserId || '').trim()
    if (!uid || !supabaseClient) {
      setProfilePostsTotal(0)
      return
    }
    try {
      // Match profile Posts list filters (hidden + thread roots excluded).
      const { count, error } = await supabaseClient
        .from('community_feed_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('hidden_at', null)
        .is('thread_root_id', null)
      if (error) throw error
      setProfilePostsTotal(typeof count === 'number' ? count : 0)
    } catch {
      setProfilePostsTotal(0)
    }
  }, [profileUserId, supabaseClient])

  useEffect(() => {
    if (!open || !panelVisible) return
    const raf = window.requestAnimationFrame(() => {
      void refreshSocial()
      void refreshProfilePostsTotal()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [open, panelVisible, refreshSocial, refreshProfilePostsTotal])

  const reloadCreatorFanSubState = useCallback(async () => {
    if (!open || !panelVisible || !profileUserId || isOwnProfile) {
      setCreatorFanOffer(null)
      setHasCreatorFanSub(false)
      setFanSubCancelAtPeriodEnd(false)
      setFanSubPeriodEnd(null)
      return
    }
    try {
      const offer = await fetchCreatorFanOffer(supabaseClient, profileUserId)
      setCreatorFanOffer(offer)
      if (!viewerUserId || !offer) {
        setHasCreatorFanSub(false)
        setFanSubCancelAtPeriodEnd(false)
        setFanSubPeriodEnd(null)
        return
      }
      const { data, error } = await supabaseClient.rpc('get_my_creator_fan_entitlements')
      if (error) return
      const key = `creator-fan:${profileUserId}`
      const grant = data?.[key]
      setHasCreatorFanSub(Boolean(grant?.active))
      setFanSubCancelAtPeriodEnd(Boolean(grant?.cancel_at_period_end))
      setFanSubPeriodEnd(
        typeof grant?.current_period_end === 'string' ? grant.current_period_end : null,
      )
    } catch {
      setCreatorFanOffer(null)
      setHasCreatorFanSub(false)
      setFanSubCancelAtPeriodEnd(false)
      setFanSubPeriodEnd(null)
    }
  }, [open, panelVisible, profileUserId, isOwnProfile, viewerUserId, supabaseClient])

  useEffect(() => {
    void reloadCreatorFanSubState()
  }, [reloadCreatorFanSubState])

  useEffect(() => {
    if (!open || !panelVisible || !profileUserId || isOwnProfile) return undefined
    const onFanBillingReturn = (ev) => {
      const creatorId = ev?.detail?.creatorUserId
      if (creatorId && String(creatorId) !== String(profileUserId)) return
      void reloadCreatorFanSubState()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadCreatorFanSubState()
    }
    window.addEventListener('edge:creator-fan-billing-return', onFanBillingReturn)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('edge:creator-fan-billing-return', onFanBillingReturn)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [open, panelVisible, profileUserId, isOwnProfile, reloadCreatorFanSubState])

  useEffect(() => {
    if (!open || !panelVisible) return
    profileDockRevealRef.current = 1
    profileDockRevealNotifiedRef.current = 1
    profileIosWebFeedLatchRef.current = false
    profileIosWebWasPastBannerRef.current = false
    profileIosWebChromeScrollPrevRef.current = 0
    setProfileDockReveal(1)
    onDockRevealChange?.(1)
    const el = profileBodyScrollRef.current
    if (el) {
      profileDockScrollPrevTopRef.current = el.scrollTop
      applyProfileCollapseVisuals(el.scrollTop)
    }
  }, [open, panelVisible, onDockRevealChange, applyProfileCollapseVisuals])

  // Reveal setState re-renders can clobber tabs `style.top` with a stale value for a frame.
  // Re-apply the latest measured top after every commit so tabs ride the title plate.
  useLayoutEffect(() => {
    if (!open || !panelVisible) return
    const tabsEl = profileTabsElRef.current
    if (!tabsEl) return
    tabsEl.style.top = `${profileTabsTopPxRef.current}px`
  })

  useLayoutEffect(() => {
    if (!open || !panelVisible) return
    const enabled = profileScrollCollapseEnabled()
    profileCollapseEnabledRef.current = enabled
    setProfileCollapseEnabled(enabled)
    profileCollapseReduceMotionRef.current = prefersReducedMotion()
    measureProfileCollapseGeometry()
    const el = profileBodyScrollRef.current
    applyProfileCollapseVisuals(el?.scrollTop ?? 0)
    const onResize = () => {
      const next = profileScrollCollapseEnabled()
      profileCollapseEnabledRef.current = next
      setProfileCollapseEnabled(next)
      measureProfileCollapseGeometry()
      applyProfileCollapseVisuals(profileBodyScrollRef.current?.scrollTop ?? 0)
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener?.('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener?.('resize', onResize)
    }
  }, [
    open,
    panelVisible,
    measureProfileCollapseGeometry,
    applyProfileCollapseVisuals,
    displayName,
    profile?.banner_url,
    showOwnEditControls,
  ])

  useEffect(() => {
    const el = profileBodyScrollRef.current
    if (!el || typeof window === 'undefined') return
    if (showOwnEditControls || !open || !panelVisible) {
      applyProfileCollapseVisuals(0, { forceZero: true })
      return
    }
    profileDockScrollPrevTopRef.current = el.scrollTop
    applyProfileCollapseVisuals(el.scrollTop)
    const titleRevealPerScrollPx = 200
    const titleHidePerScrollPx = 110
    const maxAbsScrollStepPx = 180
    const minScrollStepPx = 0.5
    // Throttle parent SocialFeed setState … full Lounge re-render per scroll tick was killing Android.
    const dockRevealNotifyStep = 0.08
    const queueFlush = () => {
      if (profileDockScrollRafRef.current) return
      profileDockScrollRafRef.current = window.requestAnimationFrame(() => {
        profileDockScrollRafRef.current = 0
        const r = profileDockRevealRef.current
        const prev = profileDockRevealNotifiedRef.current
        const atEdge = r <= 0.02 || r >= 0.98
        if (!atEdge && Math.abs(r - prev) < dockRevealNotifyStep) return
        const notified = r <= 0.02 ? 0 : r >= 0.98 ? 1 : Math.round(r / dockRevealNotifyStep) * dockRevealNotifyStep
        if (notified === prev) return
        profileDockRevealNotifiedRef.current = notified
        // Local setState only kept the (disabled) sheet dock in sync … skip it.
        onDockRevealChange?.(notified)
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
      applyProfileCollapseVisuals(st)
      // apply may latch dock reveal to 0 when clearing the banner … flush parent FAB.
      const after = profileDockRevealRef.current
      if (
        (after <= 0.02 && profileDockRevealNotifiedRef.current !== 0)
        || (after >= 0.98 && profileDockRevealNotifiedRef.current !== 1)
      ) {
        queueFlush()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (profileDockScrollRafRef.current) window.cancelAnimationFrame(profileDockScrollRafRef.current)
    }
  }, [onDockRevealChange, showOwnEditControls, open, panelVisible, applyProfileCollapseVisuals])

  useEffect(() => {
    if (!showOwnEditControls) return
    profileDockRevealRef.current = 1
    profileDockRevealNotifiedRef.current = 1
    setProfileDockReveal(1)
    onDockRevealChange?.(1)
    applyProfileCollapseVisuals(0, { forceZero: true })
  }, [showOwnEditControls, onDockRevealChange, applyProfileCollapseVisuals])

  useLayoutEffect(() => {
    const bar = profileTopChromeRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      measureProfileCollapseGeometry()
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [open, panelVisible, isOwnProfile, measureProfileCollapseGeometry])

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

  const enableProfilePostAlertsOnly = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || socialBusy) return
    if (isSubscribed) return
    setSocialBusy(true)
    try {
      await supabaseClient.from('profile_post_subscriptions').insert({
        subscriber_id: viewerUserId,
        publisher_id: profileUserId,
      })
      setIsSubscribed(true)
    } finally {
      setSocialBusy(false)
    }
  }

  const supportCreatorFan = () => {
    if (!viewerUserId) {
      onRequireAuth?.('create')
      return
    }
    if (!profileUserId || isOwnProfile) return
    if (!creatorFanOffer) return
    setFanSubscribeModalOpen(true)
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

  const toggleProfileFeedMute = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || feedMuteBusy) return
    setFeedMuteBusy(true)
    const nextMuted = !isProfileFeedMuted
    try {
      if (isProfileFeedMuted) {
        const { error } = await supabaseClient
          .from('profile_feed_mutes')
          .delete()
          .eq('muter_id', viewerUserId)
          .eq('muted_user_id', profileUserId)
        if (error) throw error
      } else {
        const { error } = await supabaseClient.from('profile_feed_mutes').insert({
          muter_id: viewerUserId,
          muted_user_id: profileUserId,
        })
        if (error) throw error
      }
      setIsProfileFeedMuted(nextMuted)
      if (typeof onProfileFeedMuteChange === 'function') {
        await onProfileFeedMuteChange(profileUserId, nextMuted)
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not update mute.')
    } finally {
      setFeedMuteBusy(false)
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
          postsHasMore: false,
          postsLoadingMore: false,
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

          const { posts, postsErr, hasMore } = await fetchLoungeProfilePosts(supabaseClient, uid, hydratePosts, {
            limit: LOUNGE_PROFILE_POST_INITIAL_LIMIT,
          })
          setNestedProfileStack((prev) =>
            prev.map((layer) =>
              layer.userId === uid
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    posts,
                    postsHasMore: hasMore,
                    loading: false,
                    error: postsErr || profileErr || '',
                  }
                : layer,
            ),
          )
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

  const loadMoreNestedProfilePosts = useCallback(
    async (uid) => {
      const targetId = String(uid || '').trim()
      if (!targetId || !hydratePosts) return
      let snapshot = null
      setNestedProfileStack((prev) => {
        const layer = prev.find((l) => l.userId === targetId)
        if (!layer || layer.postsLoadingMore || !layer.postsHasMore) return prev
        snapshot = layer
        return prev.map((l) =>
          l.userId === targetId ? { ...l, postsLoadingMore: true } : l,
        )
      })
      if (!snapshot) return
      try {
        const { posts: morePosts, hasMore, postsErr } = await fetchLoungeProfilePosts(
          supabaseClient,
          targetId,
          hydratePosts,
          {
            limit: LOUNGE_PROFILE_POST_PAGE_SIZE,
            offset: snapshot.posts.length,
          },
        )
        setNestedProfileStack((prev) =>
          prev.map((layer) => {
            if (layer.userId !== targetId) return layer
            return {
              ...layer,
              posts: mergeLoungeProfilePosts(layer.posts, morePosts),
              postsHasMore: hasMore,
              postsLoadingMore: false,
              error: postsErr || layer.error,
            }
          }),
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load more posts.'
        setNestedProfileStack((prev) =>
          prev.map((layer) =>
            layer.userId === targetId
              ? { ...layer, postsLoadingMore: false, error: msg || layer.error }
              : layer,
          ),
        )
      }
    },
    [hydratePosts, supabaseClient],
  )

  const popNestedProfile = useCallback(() => {
    setNestedProfileStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  const renderProfileTabPane = (id) => {
    if (id === 'posts') {
      if (loading) {
        return <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
      }
      if (posts.length === 0) {
        return <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">No Lounge posts yet.</div>
      }
      return (
        <ProfileTabPostList
          posts={posts}
          profileUserId={profileUserId}
          profileFanLockCtx={profileFanLockCtx}
          postCardPropsForLists={postCardPropsForLists}
          profileBodyScrollRef={profileBodyScrollRef}
          profilePostRowPerfStyle={profilePostRowPerfStyle}
        />
      )
    }
    if (id === 'replies') {
      if (profileRepliesErr) {
        return (
          <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
            {profileRepliesErr}
          </div>
        )
      }
      if (profileRepliesLoading || (!profileRepliesFetchedRef.current && profileReplies.length === 0)) {
        return <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
      }
      if (profileReplies.length === 0) {
        return (
          <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">
            {isOwnProfile ? 'Replies you post will show up here.' : 'No replies yet.'}
          </div>
        )
      }
      return profileReplies.map((item) => (
        <ProfileReplyRow
          key={item.comment.id}
          item={item}
          postCardProps={postCardPropsForLists}
          onOpenProfileReply={postCardPropsForLists?.onOpenProfileReply}
          profileBodyScrollRef={profileBodyScrollRef}
          onNavigateToProfile={onNavigateToProfile}
        />
      ))
    }
    if (id === 'likes' || id === 'bookmarks') {
      const bucket = id === 'likes' ? likesTab : bookmarksTab
      const fetched = id === 'likes' ? likesFetchedRef.current : bookmarksFetchedRef.current
      if (bucket.err) {
        return (
          <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
            {bucket.err}
          </div>
        )
      }
      if (bucket.loading || (!fetched && bucket.posts.length === 0)) {
        return <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
      }
      if (bucket.posts.length === 0) {
        return (
          <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">
            {id === 'likes'
              ? 'Posts you like will show up here.'
              : 'Posts you bookmark will show up here.'}
          </div>
        )
      }
      return (
        <ProfileTabPostList
          posts={bucket.posts}
          profileUserId={profileUserId}
          profileFanLockCtx={profileFanLockCtx}
          postCardPropsForLists={postCardPropsForLists}
          profileBodyScrollRef={profileBodyScrollRef}
          profilePostRowPerfStyle={profilePostRowPerfStyle}
        />
      )
    }
    return null
  }

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
        } inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l-0 bg-zinc-950 shadow-[-12px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out motion-reduce:transition-none sm:border-l sm:border-zinc-800/90 ${
          stackedOverlay || panelVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        data-lounge-profile-sheet=""
        {...(PROFILE_ANDROID_PERF ? { 'data-lounge-profile-android-perf': '' } : {})}
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
          className="pointer-events-none absolute inset-x-0 top-0 z-30"
          data-lounge-profile-top-chrome=""
        >
          <div
            ref={profileCollapsedScrimRef}
            aria-hidden
            data-lounge-profile-collapsed-scrim=""
            className="pointer-events-none absolute inset-x-0 top-0 opacity-0"
          />
          {/* iOS Safari/PWA: plates + back/menu slide as one stack. */}
          <div
            ref={profileIosWebSlideRef}
            className="will-change-transform"
            data-lounge-profile-ios-web-slide=""
          >
          <div
            ref={profileIosWebStatusPlateRef}
            aria-hidden
            hidden
            data-lounge-profile-ios-web-status-plate=""
            className="pointer-events-none absolute inset-x-0 top-0 z-0 opacity-0"
          />
          <div
            ref={profileIosWebTitleBarRef}
            aria-hidden
            hidden
            data-lounge-profile-ios-web-title-bar=""
            className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden opacity-0"
          >
            {!showOwnEditControls && !profileCollapseEnabled ? (
              <div
                ref={profileCompactNameRef}
                data-lounge-profile-compact-name=""
                data-lounge-profile-compact-ios-web=""
                className="pointer-events-none absolute inset-x-12 bottom-0 flex h-12 min-w-0 flex-col items-center justify-center text-center text-white opacity-0 sm:inset-x-16"
                style={{ transform: `translate3d(0, ${PROFILE_COMPACT_NAME_SLIDE_PX}px, 0)` }}
              >
                <span className="min-w-0 max-w-full truncate text-[18px] font-bold leading-tight sm:text-[19px]">
                  {displayName}
                </span>
                <span
                  className="min-w-0 max-w-full truncate text-[14px] font-normal leading-tight text-white/90"
                  title={fullStatCountTitle(compactPostsCount)}
                >
                  {compactPostsLabel}
                </span>
              </div>
            ) : null}
          </div>
          <div
            className="relative z-[1] px-2 pb-1 sm:px-3"
            style={{
              // Inline … arbitrary Tailwind max(env, var(--edge-sat)) has broken before.
              paddingTop: 'max(0.5rem, max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))',
            }}
          >
            <div
              ref={profileChromeMotionRef}
              className="relative flex min-h-10 items-center justify-between gap-2 overflow-hidden will-change-transform"
              data-lounge-profile-chrome-motion=""
            >
            <button
              type="button"
              onClick={showOwnEditControls ? () => exitOwnProfileEditing() : onClose}
              data-lounge-profile-banner-chrome=""
              className={
                showOwnEditControls
                  ? PROFILE_BANNER_CHROME_CANCEL_CLASS
                  : `${PROFILE_BANNER_CHROME_BTN_CLASS} pointer-events-auto`
              }
              aria-label={showOwnEditControls ? 'Cancel editing' : 'Back'}
            >
              {showOwnEditControls ? (
                'Cancel'
              ) : (
                <LoungeBackArrowIcon />
              )}
            </button>
            {!showOwnEditControls && profileCollapseEnabled ? (
              <div
                ref={profileCompactNameRef}
                data-lounge-profile-compact-name=""
                data-lounge-profile-compact-collapse=""
                className="pointer-events-none absolute bottom-0 left-12 right-14 top-0 flex min-w-0 flex-col justify-center text-left text-white opacity-0 sm:left-[3.25rem] sm:right-16"
                style={{ transform: `translate3d(0, ${PROFILE_COMPACT_NAME_SLIDE_PX}px, 0)` }}
                aria-hidden
              >
                <span className="min-w-0 truncate text-[16px] font-bold leading-tight sm:text-[17px]">
                  {displayName}
                </span>
                <span
                  className="min-w-0 truncate text-[13px] font-normal leading-tight text-white/90"
                  title={fullStatCountTitle(compactPostsCount)}
                >
                  {compactPostsLabel}
                </span>
              </div>
            ) : null}
            {isOwnProfile ? (
              <div ref={ownProfileBannerMenuRef} className="pointer-events-auto shrink-0">
                <button
                  ref={ownProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOwnProfileMenuOpen((v) => !v)}
                  aria-expanded={ownProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  data-lounge-profile-banner-chrome=""
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
            ) : !isOwnProfile && viewerUserId ? (
              <div ref={otherProfileMenuWrapRef} className="pointer-events-auto shrink-0">
                <button
                  ref={otherProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOtherProfileMenuOpen((o) => !o)}
                  aria-expanded={otherProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  data-lounge-profile-banner-chrome=""
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
                        <LoungeProfileOverflowMenu
                          onShare={
                            typeof onShareProfile === 'function'
                              ? () => {
                                  setOtherProfileMenuOpen(false)
                                  onShareProfile(profile)
                                }
                              : undefined
                          }
                          canAdminPromoteModerator={canAdminPromoteModerator}
                          canAdminDemoteModerator={canAdminDemoteModerator}
                          adminRoleBusy={adminRoleBusy}
                          onAdminPromote={() => {
                            setOtherProfileMenuOpen(false)
                            void runAdminProfileRoleChange('moderator')
                          }}
                          onAdminDemote={() => {
                            setOtherProfileMenuOpen(false)
                            void runAdminProfileRoleChange('user')
                          }}
                          canAdminCompLifetime={canAdminCompLifetime}
                          canAdminRevokeCompLifetime={canAdminRevokeCompLifetime}
                          adminCompBusy={adminCompBusy}
                          onAdminCompLifetime={() => {
                            setOtherProfileMenuOpen(false)
                            void runAdminCompLifetimeChange(true)
                          }}
                          onAdminRevokeCompLifetime={() => {
                            setOtherProfileMenuOpen(false)
                            void runAdminCompLifetimeChange(false)
                          }}
                          onToggleMute={() => {
                            setOtherProfileMenuOpen(false)
                            void toggleProfileFeedMute()
                          }}
                          isFeedMuted={isProfileFeedMuted}
                          muteBusy={feedMuteBusy}
                          onToggleBlock={() => {
                            setOtherProfileMenuOpen(false)
                            void toggleBlock()
                          }}
                          blockBusy={blockBusy}
                          iBlockingThem={iBlockingThem}
                          profileHandle={profile?.handle}
                        />
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            ) : (
              <div className="h-10 w-10 shrink-0" aria-hidden />
            )}
            </div>
          </div>
          </div>
        </div>
        {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED: was style paddingBottom Math.max(56, profileDockFooterMeasured) + 8 when shellDock */}
        <div
          ref={profileBodyScrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain no-scrollbar [-webkit-overflow-scrolling:touch]"
          data-lounge-profile-scroll=""
          style={{
            paddingBottom: `max(${
              !showOwnEditControls && profileFabBottomPadPx > 0 ? `${profileFabBottomPadPx}px` : '0.5rem'
            },max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))`,
          }}
        >
          <div
            ref={profileBannerShellRef}
            className={`${profileCollapseEnabled ? 'sticky z-[28]' : 'relative z-10'} w-full shrink-0`}
            data-lounge-profile-banner=""
            style={{
              // Banner paints under the status bar; spacer below keeps the visible band ~h-28/h-36.
              // Sticky `top` is measured so the pinned strip ends ~5px below chrome buttons (collapse only).
              paddingTop: 'max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px))',
              top: profileCollapseEnabled ? 0 : undefined,
            }}
          >
            <div
              className="absolute inset-x-0 top-0 w-full min-w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950"
              data-lounge-profile-banner-fill=""
              style={{
                // Paint past the layout bottom so sticky / backdrop-filter hairlines
                // sit under the profile body instead of on the visible join.
                bottom: -3,
              }}
            >
              <div
                ref={profileBannerMediaRef}
                className={`h-full w-full min-w-full${profileCollapseEnabled ? ' will-change-transform' : ''}`}
                style={{ transformOrigin: 'center top' }}
                data-lounge-profile-banner-media=""
              >
                {profile?.banner_url ? (
                  <img
                    src={profile.banner_url}
                    alt=""
                    className="h-full w-full min-w-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </div>
              <div
                ref={profileBannerLiveScrimRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-black opacity-[0.12]"
              />
              <div
                ref={profileBannerBlurOverlayRef}
                aria-hidden
                data-lounge-profile-banner-blur=""
                className="pointer-events-none absolute inset-0 opacity-0"
              />
            </div>
            <div className="relative h-28 w-full sm:h-36" data-lounge-profile-banner-band="">
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
            {/* ~1/4 avatar overlap on banner at rest (−mt-5 on 4.8rem ≈ 20/77). */}
            <div
              ref={profileAvatarRowRef}
              className="pointer-events-none relative z-20 -mt-5 flex flex-wrap items-end justify-between gap-3 sm:-mt-5"
              data-lounge-profile-avatar-row=""
            >
              <div className="relative shrink-0 pointer-events-auto">
                <div
                  ref={profileAvatarMotionRef}
                  className={`relative z-[25] flex h-[4.8rem] w-[4.8rem] overflow-hidden rounded-full bg-zinc-900 text-[22px] font-bold text-zinc-200 ring-4 ring-zinc-950 sm:h-[4.4rem] sm:w-[4.4rem] sm:text-[26px]${
                    profileCollapseEnabled ? ' will-change-transform' : ''
                  }`}
                  style={{ transformOrigin: 'center top' }}
                  data-lounge-profile-avatar=""
                >
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
              {isOwnProfile &&
              !showOwnEditControls &&
              typeof onOpenFanSubscriptionSettings === 'function' &&
              supabaseClient ? (
                <div className="pointer-events-auto relative z-20 mb-1 shrink-0">
                  <OwnProfileFanMonetizationCta
                    supabaseClient={supabaseClient}
                    onOpenFanSubscriptionSettings={onOpenFanSubscriptionSettings}
                    onOpenCreatorFanPortal={() => setFanPortalOpen(true)}
                  />
                </div>
              ) : !isOwnProfile && viewerUserId ? (
                <div className="pointer-events-auto relative z-20 mb-1 shrink-0">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                  {isFollowing ? (
                    creatorFanOffer && hasCreatorFanSub ? (
                      <ProfileFanSubPillButton
                        disabled={socialBusy}
                        subscribed
                        onClick={() => supportCreatorFan()}
                        title="View your fan subscription"
                        aria-label="Fan subscription and post alerts"
                      />
                    ) : creatorFanOffer ? (
                      <ProfileFanSubPillButton
                        disabled={socialBusy}
                        postAlertsOn={isSubscribed}
                        onClick={() => supportCreatorFan()}
                        title={
                          isSubscribed
                            ? 'Manage post alerts or subscribe'
                            : `Subscribe or post alerts · ${formatFanTierLabel(creatorFanOffer.fan_tier_key)}`
                        }
                        aria-label={
                          isSubscribed ? 'Manage post alerts or subscribe' : 'Subscribe or turn on post alerts'
                        }
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={socialBusy}
                        onClick={() => void toggleSubscribe()}
                        title={isSubscribed ? 'Turn off post alerts' : 'Notify me about their posts'}
                        data-lounge-profile-alerts-btn
                        data-profile-alerts-colored={isSubscribed ? 'active' : 'false'}
                        className={profileSocialActionButtonClass(
                          isSubscribed ? 'alertsActive' : 'neutral',
                        )}
                        aria-label={
                          isSubscribed ? 'Turn off post alerts' : 'Subscribe to notifications'
                        }
                      >
                        <ProfileSocialAlertsIcon active={isSubscribed} />
                      </button>
                    )
                  ) : null}
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
                      className={profileSocialActionButtonClass('neutral')}
                    >
                      <ProfileSocialMessageIcon />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={socialBusy}
                    onClick={() => void toggleFollow()}
                    title={isFollowing ? 'Following' : 'Follow'}
                    aria-label={isFollowing ? 'Following' : 'Follow'}
                    data-lounge-profile-follow-btn
                    data-following={isFollowing ? 'true' : 'false'}
                    className={profileSocialActionButtonClass(isFollowing ? 'followActive' : 'followInvite')}
                  >
                    <ProfileSocialFollowIcon following={isFollowing} />
                  </button>
                  </div>
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
                  <div ref={profileDisplayNameRef} className="flex flex-wrap items-baseline gap-x-1">
                    <span className="text-xl font-bold leading-none text-white sm:text-2xl">{displayName}</span>
                    <ProfileHeaderBadges role={profile?.role} isOg={profile?.is_og} isEdgePro={profile?.has_active_subscription} />
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
            <div ref={profileTabsAnchorRef} className="h-0 w-full" aria-hidden />
            <div
              ref={(node) => {
                profileTabsElRef.current = node
              }}
              data-lounge-profile-tabs=""
              className="sticky z-20 mt-6 border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/80"
              style={{ top: profileTabsStickyTopPxState }}
            >
              <div className="flex gap-0" role="tablist" aria-label="Profile feeds">
                {profileTabsVisible.map((id) => {
                  const active = tab === id
                  return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectProfileTab(id)}
                    data-lounge-profile-tab=""
                    data-active={active ? 'true' : 'false'}
                    className={`relative flex flex-1 touch-manipulation items-center justify-center capitalize [-webkit-tap-highlight-color:transparent] ${profileTabBtnClass} ${
                      active
                        ? 'font-bold text-white'
                        : 'font-semibold text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span className="relative inline-flex max-w-full items-center justify-center px-0.5 pb-2.5 pt-1">
                      <span className="truncate">{profileTabLabel(id)}</span>
                      {active ? (
                        <span
                          aria-hidden
                          data-lounge-profile-tab-underline=""
                          className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-cyan-500"
                        />
                      ) : null}
                    </span>
                  </button>
                  )
                })}
              </div>
            </div>

            <div className="min-h-[12rem] pb-4">
              {adminRoleErr ? (
                <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                  {adminRoleErr}
                </div>
              ) : null}
              {adminCompErr ? (
                <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                  {adminCompErr}
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
              ) : (
                <div data-lounge-profile-tab-viewport="" className="relative min-h-[12rem]">
                  {profileTabsVisible.map((id, index) => {
                    const active = tab === id
                    const xPct = (index - profileTabIndex) * 100
                    return (
                      <div
                        key={id}
                        role="tabpanel"
                        aria-hidden={!active}
                        inert={!active ? true : undefined}
                        data-lounge-profile-tab-pane=""
                        data-lounge-profile-tab-track=""
                        data-active={active ? 'true' : 'false'}
                        className={`w-full will-change-transform ${
                          active
                            ? 'relative'
                            : 'pointer-events-none absolute left-0 right-0 top-0'
                        }`}
                        style={{
                          transform: `translate3d(${xPct}%, 0, 0)`,
                          transition: profileTabSlideReduce
                            ? 'none'
                            : `transform ${PROFILE_TAB_SLIDE_MS}ms ${PROFILE_TAB_SLIDE_EASE}`,
                        }}
                      >
                        {renderProfileTabPane(id)}
                        {active && profileTabHasMore ? (
                          <div ref={profileLoadMoreSentinelRef} className="h-2 w-full" aria-hidden />
                        ) : null}
                        {active && profileTabLoadingMore ? (
                          <div className="px-3 py-4 text-center text-[13px] text-zinc-500">
                            Loading more…
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
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
              postsHasMore={layer.postsHasMore}
              postsLoadingMore={layer.postsLoadingMore}
              onLoadMorePosts={() => loadMoreNestedProfilePosts(layer.userId)}
              loading={layer.loading}
              error={layer.error}
              isOwnProfile={Boolean(viewerUserId && layer.userId === viewerUserId)}
              onClose={popNestedProfile}
              onAfterTransitionOut={popNestedProfile}
              postCardProps={postCardPropsForLists}
              onProfileUpdated={onProfileUpdated}
              hydratePosts={hydratePosts}
              onNavigateToProfile={(entity) => {
                const uid = String(entity?.user_id || '').trim()
                if (!uid) return
                openNestedProfileFromFollowList(entity)
              }}
              onShareProfile={onShareProfile}
              onProfileFeedMuteChange={onProfileFeedMuteChange}
              onViewerFollowChange={onViewerFollowChange}
              suspendVideoCoordinator={suspendVideoCoordinator}
              showVideoDebugHud={showVideoDebugHud}
              viewerIsAdmin={viewerIsAdmin}
              onAdminSetProfileRole={onAdminSetProfileRole}
              onAdminCompLifetime={onAdminCompLifetime}
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

      <CreatorFanSubscribeModal
        open={fanSubscribeModalOpen}
        onClose={() => setFanSubscribeModalOpen(false)}
        supabaseClient={supabaseClient}
        offer={creatorFanOffer}
        alreadySubscribed={hasCreatorFanSub}
        fanCancelAtPeriodEnd={fanSubCancelAtPeriodEnd}
        fanCurrentPeriodEnd={fanSubPeriodEnd}
        postAlertsEnabled={isSubscribed}
        onEnablePostAlerts={enableProfilePostAlertsOnly}
        onDisablePostAlerts={toggleSubscribe}
      />

      {isOwnProfile && supabaseClient ? (
        <CreatorFanPortalModal
          open={fanPortalOpen}
          onClose={() => setFanPortalOpen(false)}
          supabaseClient={supabaseClient}
          onOpenMonetizationSettings={onOpenFanSubscriptionSettings || undefined}
          onViewSubscriber={
            typeof onNavigateToProfile === 'function'
              ? (userId) => onNavigateToProfile({ userId })
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
