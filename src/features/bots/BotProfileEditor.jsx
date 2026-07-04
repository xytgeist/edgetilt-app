import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { DEFAULT_PROFILE_BANNER_PATHS } from '../profiles/defaultProfileBanners.js'
import { uploadProfileAvatar, uploadProfileBanner } from '../profiles/profileGate.js'
import { isProbablyImageFile, prepareAvatarImageForUpload } from '../../utils/compressImageForUpload.js'
import { saveBotSettings } from './botPortalApi.js'

const ProfileAvatarCropModal = lazy(() => import('../lounge/ProfileAvatarCropModal.jsx'))

function profileInitials(name, handle) {
  const raw = String(name || handle || '?').trim()
  return raw.slice(0, 2).toUpperCase()
}

export default function BotProfileEditor({ bot, supabaseClient, onReload, setToast, busy, setBusy }) {
  const bannerInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const [avatarCropFile, setAvatarCropFile] = useState(null)
  const [draft, setDraft] = useState({
    handle: '',
    bio: '',
    aboutMe: '',
  })

  useEffect(() => {
    if (!bot) return
    setDraft({
      handle: bot.handle || '',
      bio: bot.bio || '',
      aboutMe: bot.about_me || '',
    })
  }, [bot?.user_id, bot?.handle, bot?.bio, bot?.about_me])

  if (!bot) return null

  const avatarUrl = bot.avatar_url || null
  const bannerUrl = bot.banner_url || null
  const displayName = bot.display_name || bot.slug

  const patchProfile = async (patch, successMsg) => {
    setBusy('profile')
    const { error } = await saveBotSettings(supabaseClient, bot.user_id, patch)
    setBusy('')
    if (error) {
      const msg = String(error.message || '')
      if (/duplicate|unique|profiles_handle/i.test(msg)) {
        setToast?.('That handle is already taken.')
        return
      }
      setToast?.(error.message || 'Profile save failed.')
      return
    }
    setToast?.(successMsg)
    void onReload?.()
  }

  const onPickBanner = async (e) => {
    const file = e.target?.files?.[0]
    try {
      e.target.value = ''
    } catch {
      // ignore
    }
    if (!file || busy) return
    setBusy('banner-up')
    try {
      const { data: url, error } = await uploadProfileBanner({
        supabaseClient,
        user: { id: bot.user_id },
        file,
      })
      if (error) {
        setToast?.(error.message || 'Banner upload failed.')
        return
      }
      await patchProfile({ banner_url: url || '' }, 'Banner updated.')
    } finally {
      setBusy('')
    }
  }

  const finalizeAvatar = async (file) => {
    setBusy('avatar-up')
    try {
      const { file: ready, error: compressErr } = await prepareAvatarImageForUpload(file)
      if (compressErr) {
        setToast?.(compressErr.message || 'Could not process image.')
        return
      }
      const { data: url, error } = await uploadProfileAvatar({
        supabaseClient,
        user: { id: bot.user_id },
        file: ready,
      })
      if (error) {
        setToast?.(error.message || 'Avatar upload failed.')
        return
      }
      await patchProfile({ avatar_url: url || '' }, 'Avatar updated.')
    } finally {
      setBusy('')
    }
  }

  const onPickAvatar = (e) => {
    const raw = e.target?.files?.[0]
    try {
      e.target.value = ''
    } catch {
      // ignore
    }
    if (!raw || busy) return
    if (!isProbablyImageFile(raw)) {
      setToast?.('Please choose an image file.')
      return
    }
    setAvatarCropFile(raw)
  }

  const saveTextFields = async () => {
    const handle = draft.handle.trim().toLowerCase().replace(/^@/, '')
    if (handle && !/^[a-z0-9_]{2,30}$/.test(handle)) {
      setToast?.('Handle must be 2-30 chars: letters, numbers, underscore.')
      return
    }
    await patchProfile(
      {
        handle,
        bio: draft.bio.trim(),
        about_me: draft.aboutMe.trim(),
      },
      'Profile saved.',
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-4 overflow-hidden">
      <div className="text-white font-bold text-sm mb-3">Lounge profile</div>

      <div className="rounded-xl border border-zinc-800/70 overflow-hidden mb-4">
        <div className="relative h-24 sm:h-28 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
          {bannerUrl ? (
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => bannerInputRef.current?.click()}
              className="rounded-full border border-zinc-600/90 bg-zinc-950/90 px-3 py-1 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
            >
              {busy === 'banner-up' ? 'Uploading…' : 'Upload banner'}
            </button>
            {bannerUrl ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void patchProfile({ banner_url: '' }, 'Banner removed.')}
                className="rounded-full border border-zinc-600/90 bg-zinc-950/90 px-3 py-1 text-[11px] font-semibold text-zinc-400 disabled:opacity-50"
              >
                Clear
              </button>
            ) : null}
          </div>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onPickBanner} />
        </div>

        <div className="relative px-4 pb-4 pt-10">
          <div className="absolute -top-10 left-4">
            <div className="relative h-20 w-20 rounded-full ring-4 ring-zinc-900 overflow-hidden bg-zinc-800">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400 text-lg font-bold">
                  {profileInitials(displayName, bot.handle)}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 rounded-full bg-cyan-700 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-50"
            >
              {busy === 'avatar-up' ? '…' : 'Photo'}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </div>

          <div className="min-w-0 pt-1">
            <div className="text-white font-bold truncate">{displayName}</div>
            <div className="text-zinc-500 text-xs truncate">@{bot.handle || 'no-handle'}</div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
          Banner presets
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DEFAULT_PROFILE_BANNER_PATHS.slice(0, 8).map((path) => (
            <button
              key={path}
              type="button"
              disabled={Boolean(busy)}
              title="Use preset banner"
              onClick={() => void patchProfile({ banner_url: path }, 'Banner preset applied.')}
              className={`shrink-0 h-10 w-16 rounded-lg overflow-hidden ring-2 ${
                bannerUrl === path ? 'ring-cyan-500' : 'ring-transparent hover:ring-zinc-600'
              }`}
            >
              <img src={path} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Handle</div>
          <input
            value={draft.handle}
            onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Bio (gate, max 160)</div>
          <textarea
            value={draft.bio}
            maxLength={160}
            rows={2}
            onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm resize-none focus:border-cyan-500/50 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            About (profile, max 140)
          </div>
          <textarea
            value={draft.aboutMe}
            maxLength={140}
            rows={3}
            onChange={(e) => setDraft((d) => ({ ...d, aboutMe: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-white text-sm resize-y focus:border-cyan-500/50 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy === 'profile'}
        onClick={() => void saveTextFields()}
        className="mt-4 min-h-9 rounded-xl bg-zinc-800 px-4 text-zinc-100 text-xs font-semibold hover:bg-zinc-700 disabled:opacity-50"
      >
        {busy === 'profile' ? 'Saving…' : 'Save profile text'}
      </button>

      {avatarCropFile ? (
        <Suspense fallback={null}>
          <ProfileAvatarCropModal
            open
            file={avatarCropFile}
            onCancel={() => setAvatarCropFile(null)}
            onApply={async (cropped) => {
              setAvatarCropFile(null)
              await finalizeAvatar(cropped)
            }}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
