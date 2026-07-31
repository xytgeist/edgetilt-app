import { useCallback, useEffect, useRef, useState } from 'react'
import ProfileAvatarCropModal from '../lounge/ProfileAvatarCropModal.jsx'
import { uploadProfileAvatar } from '../profiles/profileGate.js'
import { saveCreatorFanPrivateSubsRoom } from './creatorFanSubsApi.js'

/**
 * Creator edits Private Subs fan room metadata (name, description, keywords, avatar).
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   fanRoomId?: string | null,
 *   initialTitle?: string,
 *   initialDescription?: string,
 *   initialTopicKeywords?: string,
 *   initialAvatarUrl?: string | null,
 *   onSaved?: (row: Record<string, unknown> | null) => void,
 *   compact?: boolean,
 * }} props
 */
export default function CreatorFanPrivateSubsRoomPanel({
  supabaseClient,
  fanRoomId = null,
  initialTitle = '',
  initialDescription = '',
  initialTopicKeywords = '',
  initialAvatarUrl = null,
  onSaved,
  compact = false,
}) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [topicKeywords, setTopicKeywords] = useState(initialTopicKeywords)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const avatarInputRef = useRef(null)
  const [avatarCropFile, setAvatarCropFile] = useState(/** @type {File | null} */ (null))

  useEffect(() => {
    setTitle(initialTitle)
    setDescription(initialDescription)
    setTopicKeywords(initialTopicKeywords)
    setAvatarUrl(initialAvatarUrl)
  }, [initialTitle, initialDescription, initialTopicKeywords, initialAvatarUrl, fanRoomId])

  const save = useCallback(async (avatarOverride) => {
    if (!supabaseClient || !fanRoomId) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const row = await saveCreatorFanPrivateSubsRoom(supabaseClient, {
        title: title.trim(),
        description: description.trim(),
        topicKeywords: topicKeywords.trim(),
        avatarUrl: avatarOverride !== undefined ? avatarOverride : undefined,
      })
      setStatus('Saved.')
      onSaved?.(row && typeof row === 'object' ? row : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, fanRoomId, title, description, topicKeywords, onSaved])

  const onAvatarCropped = useCallback(async (file) => {
    setAvatarCropFile(null)
    if (!file || !supabaseClient) return
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) throw new Error('Not signed in.')
      const { data: url, error: upErr } = await uploadProfileAvatar({
        supabaseClient,
        user: session.user,
        file,
      })
      if (upErr) throw upErr
      if (!url) throw new Error('Upload succeeded but no URL returned.')
      setAvatarUrl(url)
      await save(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo.')
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, save])

  if (!fanRoomId) {
    return (
      <p className="text-[13px] leading-relaxed text-zinc-500">
        Go live with fan subscriptions to set up your Private Subs chat room.
      </p>
    )
  }

  const labelClass = compact
    ? 'text-[12px] font-semibold uppercase tracking-wide text-zinc-500'
    : 'text-[13px] font-semibold uppercase tracking-wide text-zinc-400'

  return (
    <div className="space-y-3" data-creator-fan-private-subs-room>
      <div>
        <div className={labelClass}>Private Subs room</div>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          Shown in Chat → Private Subs. Comma-separated keywords help people find your room.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={busy}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 touch-manipulation"
        >
          {avatarUrl ? (
            <img src={String(avatarUrl)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[22px] text-zinc-500">💬</span>
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => avatarInputRef.current?.click()}
          className="text-[14px] font-semibold text-cyan-400 touch-manipulation hover:text-cyan-300"
        >
          {avatarUrl ? 'Change photo' : 'Add photo'}
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) setAvatarCropFile(f)
          }}
        />
      </div>

      <label className="block">
        <span className={labelClass}>Room name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-[16px] text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          placeholder="@you fan room"
        />
      </label>

      <label className="block">
        <span className={labelClass}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={compact ? 2 : 3}
          className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-[15px] text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          placeholder="What subscribers talk about here…"
        />
      </label>

      <label className="block">
        <span className={labelClass}>Topic keywords</span>
        <input
          value={topicKeywords}
          onChange={(e) => setTopicKeywords(e.target.value)}
          maxLength={500}
          className="mt-1 w-full min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-[16px] text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          placeholder="slots, vegas, high-limit"
        />
      </label>

      {error ? (
        <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}
      {status ? <p className="text-[13px] font-medium text-cyan-300">{status}</p> : null}

      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={() => void save()}
        className="w-full min-h-11 rounded-xl bg-cyan-700 text-[15px] font-bold text-white touch-manipulation hover:bg-cyan-600 disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {busy ? 'Saving…' : 'Save room'}
      </button>

      <ProfileAvatarCropModal
        open={Boolean(avatarCropFile)}
        file={avatarCropFile}
        cropShape="square"
        onCancel={() => setAvatarCropFile(null)}
        onApply={(file) => void onAvatarCropped(file)}
      />
    </div>
  )
}
