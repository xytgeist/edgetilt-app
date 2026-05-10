import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatProfileSaveDebugError,
  profileAvatarInitials,
  profileAvatarToneClass,
  uploadProfileAvatar,
  uploadProfileBanner,
} from '../profiles/profileGate'
import { compressImageFileUnderMaxBytes } from '../../utils/compressImageForUpload'
import LoungePostArticle from './LoungePostArticle'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'

function formatCount(n) {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${Math.round(n / 1000)}K`
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
}) {
  const [tab, setTab] = useState('posts')
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [profileFollowsViewer, setProfileFollowsViewer] = useState(false)
  const [socialBusy, setSocialBusy] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [aboutBusy, setAboutBusy] = useState(false)
  const [aboutErr, setAboutErr] = useState('')
  const [bannerBusy, setBannerBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  /** Own profile: overflow menu on banner (⋯). */
  const [ownProfileMenuOpen, setOwnProfileMenuOpen] = useState(false)
  /** Own profile: after "Edit", show Photo / Banner / About editor. */
  const [ownProfileEditing, setOwnProfileEditing] = useState(false)
  const bannerInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const ownProfileBannerMenuRef = useRef(null)
  const ownProfileMenuButtonRef = useRef(null)
  const ownProfileMenuPanelRef = useRef(null)

  const displayName = String(profile?.display_name || profile?.handle || 'Member').trim() || 'Member'
  const handle = profile?.handle ? `@${String(profile.handle).trim()}` : '@member'
  const aboutDisplay = String(profile?.about_me || profile?.bio || '').trim()

  useEffect(() => {
    if (!open || !profileUserId) return
    setTab('posts')
    setOwnProfileMenuOpen(false)
    setOwnProfileEditing(false)
  }, [open, profileUserId])

  useEffect(() => {
    if (!open || !profileUserId) return
    setAboutDraft(String(profile?.about_me ?? profile?.bio ?? '').slice(0, 140))
  }, [open, profileUserId, profile?.about_me, profile?.bio])

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
      const panel = ownProfileMenuPanelRef.current
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

  const showOwnEditControls = isOwnProfile && ownProfileEditing

  const exitOwnProfileEditing = useCallback((opts) => {
    setOwnProfileMenuOpen(false)
    setOwnProfileEditing(false)
    const fromProfile = String(profile?.about_me ?? profile?.bio ?? '').slice(0, 140)
    setAboutDraft(
      opts?.nextAboutDraft !== undefined ? String(opts.nextAboutDraft).slice(0, 140) : fromProfile
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
  }, [profile?.about_me, profile?.bio])

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

  const saveAbout = async () => {
    if (!isOwnProfile || !viewerUserId || aboutBusy) return
    const next = String(aboutDraft || '').trim().slice(0, 140)
    setAboutErr('')
    setAboutBusy(true)
    try {
      const { error: upErr } = await supabaseClient
        .from('profiles')
        .update({ about_me: next || null })
        .eq('user_id', viewerUserId)
      if (upErr) {
        const raw = String(upErr.message || '')
        if (/about_me|schema cache/i.test(raw)) {
          setAboutErr(
            'The About field needs the profiles.about_me column. In Supabase → SQL Editor, run supabase/profile_lounge_fullscreen.sql (after feed_phase_a), then save again.'
          )
          return
        }
        setAboutErr(raw || 'Could not save.')
        return
      }
      onProfileUpdated?.({ ...profile, about_me: next || null })
      exitOwnProfileEditing({ nextAboutDraft: next })
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

  const onPickAvatar = async (e) => {
    const raw = e.target?.files?.[0]
    try {
      e.target.value = ''
    } catch {
      // ignore
    }
    if (!raw || !isOwnProfile || !viewerUserId || avatarBusy) return
    setAvatarBusy(true)
    try {
      const { file, error: compressErr } = await compressImageFileUnderMaxBytes(raw)
      if (compressErr) {
        window.alert(compressErr.message || 'Could not process that image.')
        return
      }
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) return
      const { data: url, error: up } = await uploadProfileAvatar({ supabaseClient, user: session.user, file })
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
  }

  return (
    <div className="fixed inset-0 z-[94] sm:bg-black/85" role="dialog" aria-modal="true" aria-label="Profile">
      <button
        type="button"
        className="absolute inset-0 z-0 hidden cursor-default sm:block"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-800/90 bg-zinc-950 shadow-[-12px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
          panelVisible ? 'translate-x-0' : 'translate-x-full'
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* Banner; ⋯ is a sibling strip with sticky top while editing so only that control pins (banner image scrolls). */}
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
                className={
                  showOwnEditControls
                    ? 'pointer-events-none sticky top-0 z-20 -mt-28 flex h-28 w-full shrink-0 justify-end pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:-mt-36 sm:h-36 sm:pr-3'
                    : 'absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 sm:right-3'
                }
              >
                <button
                  ref={ownProfileMenuButtonRef}
                  type="button"
                  onClick={() => setOwnProfileMenuOpen((v) => !v)}
                  aria-expanded={ownProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Profile options"
                  className={`grid h-9 w-9 place-items-center rounded-full bg-black/32 text-white shadow-[0_1px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm touch-manipulation outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] hover:bg-black/44 active:bg-black/50 ${
                    showOwnEditControls ? 'pointer-events-auto' : ''
                  }`}
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
                      onChange={(ev) => void onPickAvatar(ev)}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold text-white sm:text-2xl">{displayName}</span>
                <LoungeStaffRoleBadge role={profile?.role} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[15px] text-cyan-300">
                <span>{handle}</span>
                {profileFollowsViewer && viewerUserId && profileUserId !== viewerUserId ? (
                  <span className="rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Follows you
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex gap-6 text-[15px]">
              <div>
                <span className="font-bold text-white">{formatCount(followingCount)}</span>{' '}
                <span className="text-zinc-500">Following</span>
              </div>
              <div>
                <span className="font-bold text-white">{formatCount(followerCount)}</span>{' '}
                <span className="text-zinc-500">Followers</span>
              </div>
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
                    className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-600/60"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-zinc-500 tabular-nums">{aboutDraft.length}/140</span>
                    <button
                      type="button"
                      disabled={aboutBusy}
                      onClick={() => void saveAbout()}
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
                {['posts', 'replies'].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`relative min-h-11 flex-1 touch-manipulation px-2 text-[15px] font-semibold capitalize [-webkit-tap-highlight-color:transparent] ${
                      tab === id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {id}
                    {tab === id ? (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-cyan-500" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[12rem]">
              {loading ? (
                <div className="px-3 py-6 text-center text-zinc-500 text-[15px]">Loading…</div>
              ) : error ? (
                <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">{error}</div>
              ) : tab === 'posts' ? (
                posts.length === 0 ? (
                  <div className="px-3 py-8 text-center text-zinc-500 text-[15px]">No Lounge posts yet.</div>
                ) : (
                  posts.map((post) => (
                    <article
                      key={post.id}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                      className="border-t border-zinc-800 bg-zinc-950/35 px-3 py-4 transition-colors active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                      onClick={(e) => {
                        const t = e.target
                        if (t instanceof Element && t.closest('button, a, textarea, input, select')) return
                        postCardProps.onPostBodyClick?.(post)
                      }}
                    >
                      <LoungePostArticle
                        post={post}
                        suppressAvatarProfileNavigation
                        profileOwnerUserId={profileUserId}
                        {...postCardProps}
                      />
                    </article>
                  ))
                )
              ) : (
                <div className="px-4 py-8 text-center text-[15px] leading-relaxed text-zinc-500">
                  <p className="font-semibold text-zinc-400">Replies</p>
                  <p className="mt-2">
                    Threaded replies are not available yet. When they are, this tab will show the parent post and each
                    reply together.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
