import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// LOUNGE_DOCK_FOOTER_BAR_DISABLED — classic dock icon row on profile sheet. Re-enable import + JSX below to restore.
// import LoungeDockFooterBar from '../../components/LoungeDockFooterBar.jsx'
import {
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  normalizeHandle,
  profileAvatarInitials,
  profileAvatarToneClass,
  saveProfileWithHandleFallback,
  uploadProfileAvatar,
  uploadProfileBanner,
} from '../profiles/profileGate'
import { prepareAvatarImageForUpload, isProbablyImageFile } from '../../utils/compressImageForUpload'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import { feedCommentRowHasMedia } from '../../utils/communityFeedComment.js'
import LoungePostArticle from './LoungePostArticle'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import { renderRichCaption } from './loungeCaption'
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
} from './loungeFeedAvatar.js'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import ProfileAvatarCropModal from './ProfileAvatarCropModal'
import LoungeProfileFollowList from './LoungeProfileFollowList.jsx'
import { loadLoungeProfileScreenData } from './loungeProfileScreenLoad.js'
import { formatCompactStatCount, fullStatCountTitle } from '../../utils/formatCompactStatCount.js'
import { LOUNGE_DOCK_FAB_SIZE_PX } from '../../utils/loungeDockFabPosition.js'

const PROFILE_TAB_IDS = ['posts', 'replies', 'likes', 'bookmarks']

const PROFILE_LIKED_POST_SELECT =
  'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,is_plain_repost,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'

const PROFILE_COMMENT_SELECT =
  'id,body,created_at,user_id,parent_id,post_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at'

const PROFILE_REPLY_POST_SELECT = PROFILE_LIKED_POST_SELECT

const PROFILE_HANDLE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function profileTabLabel(id) {
  if (id === 'posts') return 'Posts'
  if (id === 'replies') return 'Replies'
  if (id === 'likes') return 'Likes'
  if (id === 'bookmarks') return 'Bookmarks'
  return id
}

function ProfileReplyRow({ item, profile, postCardProps, onOpenProfileReply, profileBodyScrollRef }) {
  const { comment, post } = item
  const displayNameFor = postCardProps?.displayNameFor
  const handleFor = postCardProps?.handleFor
  const postAgeLabel = postCardProps?.postAgeLabel
  const displayName =
    typeof displayNameFor === 'function'
      ? displayNameFor({ author_profile: profile, user_id: profile?.user_id })
      : profile?.display_name || profile?.handle || 'Member'
  const handleLabel =
    typeof handleFor === 'function'
      ? handleFor({ author_profile: profile, user_id: profile?.user_id })
      : '@member'
  const postAuthorName = typeof displayNameFor === 'function' ? displayNameFor(post) : 'Member'
  const postCaption = feedPostDisplayCaption(post)
  const bodyText = String(comment.body || '').trim()
  const open = () => onOpenProfileReply?.(comment, post)

  return (
    <article
      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer`}
      onClick={(e) => {
        const t = e.target
        if (!(t instanceof Element)) return
        if (
          t.closest(
            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
          )
        ) {
          return
        }
        open()
      }}
    >
      <div className="min-w-0 px-3 pt-1 pb-0">
        <div className="flex items-start gap-3">
          <div
            className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center font-bold text-white ${profileAvatarToneClass(
              profile?.user_id || profile?.handle || 'member',
            )}`}
            aria-hidden
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
              <span>{profileAvatarInitials(profile?.display_name, profile?.handle)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className={LOUNGE_FEED_META_ROW_CLASS}>
              <LoungeFeedAuthorMetaBadges
                role={profile?.role}
                isOg={profile?.is_og}
                displayName={displayName}
                displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
              />
              <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                <span className="min-w-0 truncate">{handleLabel}</span>
                <span className="shrink-0 text-zinc-600">·</span>
                <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
                  {typeof postAgeLabel === 'function' ? postAgeLabel(comment.created_at) : ''}
                </span>
              </span>
            </div>
            {bodyText ? (
              <div
                className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}
              >
                {renderRichCaption(bodyText)}
              </div>
            ) : null}
            {feedCommentRowHasMedia(comment) ? (
              <LoungePostFeedImagesAndGif
                post={comment}
                variant="commentInline"
                firstMarginTopClass={
                  bodyText ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
                }
                visibilityResetRootRef={profileBodyScrollRef}
              />
            ) : null}
            {comment.edited_at ? (
              <div className="mt-1 text-left text-[14px] leading-tight text-zinc-500">Edited</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          data-lounge-original-embed
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
          aria-label="View post and thread"
        >
          <p className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">
            {comment.parent_id ? 'Reply in thread' : 'Replying to'}
          </p>
          <div className="mt-1 flex min-w-0 flex-nowrap items-center justify-start gap-x-1.5 text-[14px] leading-snug">
            <span className="min-w-0 truncate font-semibold text-zinc-200">{postAuthorName}</span>
            <span className="shrink-0">
              <LoungeStaffRoleBadge role={post?.author_profile?.role} size="detail" />
            </span>
            <span className="shrink-0">
              <LoungeOgBadge isOg={post?.author_profile?.is_og} size="detail" />
            </span>
            <span className="inline-flex min-w-0 max-w-[min(10rem,48vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[14px] text-zinc-500 sm:max-w-[12rem]">
              <span className="min-w-0 truncate">
                {typeof handleFor === 'function' ? handleFor(post) : '@member'}
              </span>
            </span>
          </div>
          {postCaption ? (
            <div className="mt-1 line-clamp-3 text-left text-[15px] leading-snug text-zinc-400 whitespace-pre-wrap break-words">
              {renderRichCaption(postCaption)}
            </div>
          ) : (
            <p className="mt-1 text-[14px] text-zinc-500">Post</p>
          )}
        </button>
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
  /** Optional Lounge shell dock (Home / Search / Alerts / Chat) — same actions as main feed dock. */
  shellDock = null,
  /** Open DM with this profile user (Lounge dock Chat). */
  onOpenChatWithUser = null,
  /** Viewer has handle + display and can call chat Edge actions. */
  viewerCanUseLoungeChat = false,
  /** Scroll-linked FAB reveal while profile is open (arc carousel dock). */
  onDockRevealChange = null,
  /** Open another member profile from feed rows (replaces modal). */
  onNavigateToProfile = null,
  /** Stacked profile opened from a parent sheet (follow list); uses absolute overlay. */
  stackedOverlay = false,
}) {
  const [tab, setTab] = useState('posts')
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
  const [socialBusy, setSocialBusy] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
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
  /** Own profile: overflow menu on banner (⋯). */
  const [ownProfileMenuOpen, setOwnProfileMenuOpen] = useState(false)
  /** Own profile: after "Edit", show Photo / Banner / About editor. */
  const [ownProfileEditing, setOwnProfileEditing] = useState(false)
  const showOwnEditControls = isOwnProfile && ownProfileEditing
  const bannerInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const ownProfileBannerMenuRef = useRef(null)
  const ownProfileMenuButtonRef = useRef(null)
  const ownProfileMenuPanelRef = useRef(null)
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

  const displayName = String(profile?.display_name || profile?.handle || 'Member').trim() || 'Member'
  const handle = profile?.handle ? `@${String(profile.handle).trim()}` : '@member'
  const aboutDisplay = String(profile?.about_me || profile?.bio || '').trim()
  const profileTabsVisible = isOwnProfile ? PROFILE_TAB_IDS : PROFILE_TAB_IDS.slice(0, 2)
  const profileTabBtnClass =
    profileTabsVisible.length > 2 ? 'min-h-11 px-1 text-[13px]' : 'min-h-11 px-2 text-[15px]'
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
    return { ...base, toggleBookmark: wrapBm, toggleInteraction: wrapLike }
  }, [postCardProps, tab])

  useEffect(() => {
    if (!open || !profileUserId) return
    setTab('posts')
    setOwnProfileMenuOpen(false)
    setOwnProfileEditing(false)
    setDisplayNameDraft('')
    setHandleSlugDraft('')
    setHandleChangeDialog(null)
    setAvatarCropFile(null)
    setInteractionPosts([])
    setInteractionErr('')
    setInteractionLoading(false)
    setProfileReplies([])
    setProfileRepliesErr('')
    setProfileRepliesLoading(false)
  }, [open, profileUserId])

  useEffect(() => {
    if (!ownProfileEditing || !isOwnProfile || profile?.user_id == null) return
    setDisplayNameDraft(String(profile.display_name ?? '').trim().slice(0, 24))
    setHandleSlugDraft(String(profile.handle ?? '').trim())
  }, [ownProfileEditing, isOwnProfile, open, profile?.user_id, profile?.display_name, profile?.handle])

  useEffect(() => {
    if (!open || !profileUserId) return
    setAboutDraft(String(profile?.about_me ?? profile?.bio ?? '').slice(0, 140))
  }, [open, profileUserId, profile?.about_me, profile?.bio])

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
  }, [open, tab, isOwnProfile, profileUserId, supabaseClient, hydratePosts])

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
          items.push({
            comment: authorProfile ? { ...comment, author_profile: authorProfile } : comment,
            post,
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
    setAboutErr('')
    if (typeof document !== 'undefined') {
      try {
        const el = document.activeElement
        if (el && typeof el.blur === 'function') el.blur()
      } catch {
        // ignore
      }
    }
  }, [profile?.about_me, profile?.bio, profile?.display_name, profile?.handle])

  const refreshSocial = useCallback(async () => {
    if (!profileUserId || !viewerUserId) {
      setFollowerCount(0)
      setFollowingCount(0)
      setIsFollowing(false)
      setIsSubscribed(false)
      setProfileFollowsViewer(false)
      return
    }
    try {
      const [followersRes, followingRes, followRow, subRow, reverseFollow] = await Promise.all([
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
      ])
      setFollowerCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setIsFollowing(!!followRow.data)
      setIsSubscribed(!!subRow.data)
      setProfileFollowsViewer(!!reverseFollow.data)
    } catch {
      setFollowerCount(0)
      setFollowingCount(0)
    }
  }, [profileUserId, supabaseClient, viewerUserId])

  useEffect(() => {
    if (!open || !panelVisible) return
    void refreshSocial()
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
    if ((!shellDock && !onDockRevealChange) || showOwnEditControls || !open || !panelVisible) return
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
  }, [shellDock, onDockRevealChange, showOwnEditControls, open, panelVisible])

  const toggleFollow = async () => {
    if (!viewerUserId || !profileUserId || isOwnProfile || socialBusy) return
    setSocialBusy(true)
    try {
      if (isFollowing) {
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
      setIsFollowing((v) => !v)
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

  const saveProfileEdits = async (opts) => {
    if (!isOwnProfile || !viewerUserId || aboutBusy) return
    const nextAbout = String(aboutDraft || '').trim().slice(0, 140)
    const dn = String(displayNameDraft || '').trim().slice(0, 24)
    if (!dn) {
      setAboutErr('Display name is required.')
      return
    }
    const nextHandle = normalizeHandle(handleSlugDraft)
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
      })
      if (idErr || !identityRow) {
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
        .update({ about_me: nextAbout || null })
        .eq('user_id', viewerUserId)
      if (upErr) {
        const raw = String(upErr.message || '')
        if (/about_me|schema cache/i.test(raw)) {
          setAboutErr(
            'The About field needs the profiles.about_me column. In Supabase → SQL Editor, run supabase/profile_lounge_fullscreen.sql (after feed_phase_a), then save again.'
          )
          return
        }
        setAboutErr(raw || 'Could not save About.')
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
      })
      exitOwnProfileEditing({
        nextAboutDraft: nextAbout,
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
          const { profile, posts, postsErr } = await loadLoungeProfileScreenData(
            supabaseClient,
            uid,
            stub,
            hydratePosts,
          )
          setNestedProfileStack((prev) =>
            prev.map((layer) =>
              layer.userId === uid
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    posts,
                    loading: false,
                    error: postsErr || '',
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

  const popNestedProfile = useCallback(() => {
    setNestedProfileStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  const rootShellClass = stackedOverlay
    ? 'absolute inset-0 z-40 bg-zinc-950'
    : 'fixed inset-0 z-[99] sm:bg-black/85'

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
        {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED: was style paddingBottom Math.max(56, profileDockFooterMeasured) + 8 when shellDock */}
        <div
          ref={profileBodyScrollRef}
          className={
            showOwnEditControls
              ? 'min-h-0 flex-1 overflow-hidden overscroll-y-none pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain'
          }
          style={
            showOwnEditControls
              ? undefined
              : {
                  paddingBottom: `max(${
                    profileFabBottomPadPx > 0 ? `${profileFabBottomPadPx}px` : '0.5rem'
                  }, env(safe-area-inset-bottom))`,
                }
          }
        >
          {/* Banner; ⋯ in corner (edit mode: sheet does not scroll, so absolute only). */}
          <div className="relative z-10 w-full shrink-0">
            <div className="relative h-28 w-full shrink-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 sm:h-36">
              <button
                type="button"
                onClick={onClose}
                className="absolute left-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 grid h-9 w-9 place-items-center rounded-full bg-black/32 text-white shadow-[0_1px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm touch-manipulation outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] hover:bg-black/44 active:bg-black/50 sm:left-3"
                aria-label="Back"
              >
                <span
                  aria-hidden
                  className="block leading-none text-2xl -translate-y-px [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_8px_rgba(0,0,0,0.55)]"
                >
                  ←
                </span>
              </button>
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
            {isOwnProfile ? (
              <div
                ref={ownProfileBannerMenuRef}
                className="absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 sm:right-3"
              >
                <button
                  ref={ownProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOwnProfileMenuOpen((v) => !v)}
                  aria-expanded={ownProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  className="grid h-9 w-9 place-items-center rounded-full bg-black/32 text-white shadow-[0_1px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm touch-manipulation outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] hover:bg-black/44 active:bg-black/50"
                >
                  <span
                    aria-hidden
                    className="block pb-0.5 text-2xl font-bold leading-none tracking-tight -translate-y-px [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_8px_rgba(0,0,0,0.55)]"
                  >
                    ···
                  </span>
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
            ) : null}
          </div>

          <div className="relative px-4 pb-4">
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
                      className="hidden"
                      onChange={(ev) => onPickAvatar(ev)}
                    />
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label={avatarBusy ? 'Uploading profile photo' : 'Change profile photo'}
                      className="absolute bottom-0 right-0 z-10 rounded-full border border-zinc-600/90 bg-zinc-950/95 px-2 py-0.5 text-[10px] font-semibold leading-tight text-zinc-200 shadow-md hover:bg-zinc-900 disabled:opacity-50 touch-manipulation sm:px-2.5 sm:py-1 sm:text-[11px]"
                    >
                      {avatarBusy ? '…' : 'Photo'}
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
                      disabled={socialBusy || !viewerCanUseLoungeChat}
                      onClick={() => onOpenChatWithUser(profileUserId)}
                      title={viewerCanUseLoungeChat ? 'Message' : 'Complete your profile to message'}
                      aria-label={viewerCanUseLoungeChat ? 'Message' : 'Complete your profile to message'}
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
                </div>
              ) : null}
            </div>

            <div className="mt-3 space-y-1">
              {showOwnEditControls ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <label className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Display name</span>
                      <input
                        type="text"
                        value={displayNameDraft}
                        onChange={(e) => setDisplayNameDraft(e.target.value.slice(0, 24))}
                        maxLength={24}
                        autoComplete="name"
                        className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 text-[16px] font-semibold text-white outline-none focus:border-cyan-600/60 touch-manipulation sm:text-[17px]"
                        placeholder="Your name"
                      />
                    </label>
                    <div className="flex shrink-0 items-center gap-1.5 pt-6 sm:pt-7">
                      <LoungeStaffRoleBadge role={profile?.role} />
                      <LoungeOgBadge isOg={profile?.is_og} size="modal" />
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Handle</span>
                    <input
                      type="text"
                      value={handleSlugDraft ? `@${handleSlugDraft}` : '@'}
                      onChange={(e) => setHandleSlugDraft(handleSlugFromAtInput(e.target.value))}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[16px] text-cyan-200 outline-none focus:border-cyan-600/60 touch-manipulation"
                      placeholder="@your_handle"
                    />
                    <span className="mt-1 block text-[12px] text-zinc-500">
                      Lowercase letters, numbers, underscore. Shown as @
                      {handleSlugDraft || 'your_handle'} in Lounge.
                    </span>
                  </label>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl font-bold text-white sm:text-2xl">{displayName}</span>
                    <LoungeStaffRoleBadge role={profile?.role} />
                    <LoungeOgBadge isOg={profile?.is_og} size="modal" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[15px] text-cyan-300">
                    <span>{handle}</span>
                    {profileFollowsViewer && viewerUserId && profileUserId !== viewerUserId ? (
                      <span className="rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                        Follows you
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>

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

            <div className="mt-4">
              {showOwnEditControls ? (
                <div className="space-y-2">
                  <textarea
                    value={aboutDraft}
                    onChange={(e) => setAboutDraft(e.target.value.slice(0, 140))}
                    rows={3}
                    maxLength={140}
                    placeholder="Tell people about you (max 140 characters)"
                    className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[16px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-600/60"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-zinc-500 tabular-nums">{aboutDraft.length}/140</span>
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
                  {aboutDisplay || '—'}
                </p>
              )}
            </div>

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

            <div className="min-h-[12rem]">
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
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer`}
                      onClick={(e) => {
                        const t = e.target
                        if (!(t instanceof Element)) return
                        const origHost = t.closest('[data-lounge-original-embed]')
                        if (origHost && post.reposted_post?.id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        if (
                          t.closest(
                            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                          )
                        )
                          return
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
                      profile={profile}
                      postCardProps={postCardPropsForLists}
                      onOpenProfileReply={postCardPropsForLists?.onOpenProfileReply}
                      profileBodyScrollRef={profileBodyScrollRef}
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
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                      className={`${LOUNGE_FEED_POST_ROW_CLASS} cursor-pointer`}
                      onClick={(e) => {
                        const t = e.target
                        if (!(t instanceof Element)) return
                        const origHost = t.closest('[data-lounge-original-embed]')
                        if (origHost && post.reposted_post?.id) {
                          postCardPropsForLists.onPostBodyClick?.(post.reposted_post)
                          return
                        }
                        if (
                          t.closest(
                            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                          )
                        )
                          return
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
            </div>
          </div>
        </div>
        {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED — see import above
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
                    . Continue saves your display name, photo, and About — your handle will stay{' '}
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
            document.body
          )
        : null}
    </div>
  )
}
