import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { uploadProfileAvatar } from '../profiles/profileGate.js'
import ProfileAvatarCropModal from '../lounge/ProfileAvatarCropModal.jsx'
import {
  chatAddGroupMembers,
  chatDeleteGroup,
  chatGroupMembersList,
  chatIsGroupOwner,
  chatLeaveRoom,
  chatMuteGroupMember,
  chatMuteRoom,
  chatMuteRoomUntil,
  chatPinnedMessagesPage,
  chatRemoveGroupMember,
  chatStarredMessagesPage,
  chatUnmuteGroupMember,
  chatUnmuteRoom,
  chatUpdateGroup,
} from './chatApi.js'
import ChatGroupHeaderStack from './ChatGroupHeaderStack.jsx'
import {
  ChatGroupMediaSheet,
  ChatGroupPinnedSheet,
  ChatGroupSearchSheet,
  ChatGroupStarredSheet,
} from './ChatGroupAuxSheets.jsx'
import ChatGroupMemberProfileSheet from './ChatGroupMemberProfileSheet.jsx'
import { SectionLabel, SettingsGroup, SettingsToggleRow } from './chatSettingsUi.jsx'

const OWNER_MEMBER_MUTE_OPTS = [
  { label: '5 minutes', minutes: 5 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '24 hours', minutes: 1440 },
  { label: '72 hours', minutes: 4320 },
  { label: 'Permanent', minutes: 0 },
]

const SELF_MUTE_OPTS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 168 },
]

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   room: Record<string, unknown>,
 *   viewerUserId: string,
 *   headerMembers: Array<Record<string, unknown>>,
 *   onRoomUpdated: (patch: Record<string, unknown>) => void,
 *   onLeftGroup: () => void,
 *   onJumpToMessage?: (messageId: string) => void,
 *   onPinsChanged?: () => void,
 *   onViewProfile?: ((userId: string) => void) | null,
 *   onOpenDm?: ((userId: string) => void | Promise<void>) | null,
 *   viewerReadReceiptsEnabled?: boolean,
 *   onViewerReadReceiptsEnabledChange?: ((enabled: boolean) => void | Promise<void>) | null,
 *   readReceiptsBusy?: boolean,
 * }} props
 */
export default function ChatGroupSettingsSheet({
  open,
  onClose,
  supabaseClient,
  room,
  viewerUserId,
  headerMembers,
  onRoomUpdated,
  onLeftGroup,
  onJumpToMessage,
  onPinsChanged,
  onViewProfile = null,
  onOpenDm = null,
  viewerReadReceiptsEnabled = true,
  onViewerReadReceiptsEnabledChange = null,
  readReceiptsBusy = false,
}) {
  const isOwner = chatIsGroupOwner(room, viewerUserId)

  const [title, setTitle] = useState(String(room.title || ''))
  const [description, setDescription] = useState(String(room.description || ''))
  const [editMode, setEditMode] = useState(false)

  const [members, setMembers] = useState(/** @type {any[]} */ ([]))
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')

  const [starred, setStarred] = useState(/** @type {any[]} */ ([]))
  const [pinnedCount, setPinnedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [addExpanded, setAddExpanded] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState(/** @type {any[]} */ ([]))

  const [muteUntilLocal, setMuteUntilLocal] = useState('')
  const [muteSheetOpen, setMuteSheetOpen] = useState(false)
  const [customMuteVisible, setCustomMuteVisible] = useState(false)

  const [auxView, setAuxView] = useState(/** @type {null | 'search' | 'pinned' | 'media' | 'starred'} */ (null))
  const [memberProfile, setMemberProfile] = useState(/** @type {null | Record<string, unknown>} */ (null))
  const [memberActionTarget, setMemberActionTarget] = useState(/** @type {null | { user_id: string, label: string, isMuted: boolean }} */ (null))
  const [muteTarget, setMuteTarget] = useState(/** @type {null | { user_id: string, label: string }} */ (null))

  const avatarInputRef = useRef(null)
  const searchTimerRef = useRef(null)
  const scrollBodyRef = useRef(null)
  const heroTitleRef = useRef(null)
  const topChromeRef = useRef(null)
  const titleRevealRafRef = useRef(0)
  const [avatarCropFile, setAvatarCropFile] = useState(/** @type {File | null} */ (null))
  const [titleBarReveal, setTitleBarReveal] = useState(0)

  const reload = useCallback(async () => {
    if (!room?.id) return
    setMembersLoading(true)
    setMembersError('')
    try {
      const mems = await chatGroupMembersList(supabaseClient, room.id)
      setMembers(mems)
    } catch (e) {
      setMembers([])
      setMembersError(e?.message || 'Could not load members.')
    } finally {
      setMembersLoading(false)
    }
    try {
      const stars = await chatStarredMessagesPage(supabaseClient, room.id, 40)
      setStarred(stars)
    } catch {
      setStarred([])
    }
    try {
      const pins = await chatPinnedMessagesPage(supabaseClient, room.id, 50)
      setPinnedCount(pins.length)
    } catch {
      setPinnedCount(0)
    }
  }, [room?.id, supabaseClient])

  useEffect(() => {
    if (!open) return
    setTitle(String(room.title || ''))
    setDescription(String(room.description || ''))
    setErr('')
    setEditMode(false)
    setAuxView(null)
    setAddExpanded(false)
    setAddSearch('')
    void reload()
  }, [open, room.title, room.description, reload])

  useEffect(() => {
    if (!open || !addExpanded) return undefined
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = addSearch.trim()
    if (q.length < 2) { setAddResults([]); return undefined }
    searchTimerRef.current = setTimeout(async () => {
      const exclude = new Set([viewerUserId, ...members.map((m) => m.user_id)])
      const { data } = await supabaseClient
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url')
        .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(12)
      setAddResults((data || []).filter((p) => p.user_id && !exclude.has(p.user_id)))
    }, 200)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [addSearch, addExpanded, members, open, supabaseClient, viewerUserId])

  const saveMeta = async () => {
    setBusy(true)
    setErr('')
    try {
      await chatUpdateGroup(supabaseClient, {
        roomId: room.id,
        title: title.trim(),
        description: description.trim(),
      })
      onRoomUpdated({ title: title.trim(), description: description.trim() })
      setEditMode(false)
    } catch (e) {
      setErr(e?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const doAvatarUpload = useCallback(async (file) => {
    setBusy(true)
    setErr('')
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) throw new Error('Not signed in.')
      const { data: url, error: upErr } = await uploadProfileAvatar({ supabaseClient, user: session.user, file })
      if (upErr) throw upErr
      if (!url) throw new Error('Upload succeeded but no URL returned.')
      onRoomUpdated({ avatar_url: url })
      try {
        await chatUpdateGroup(supabaseClient, { roomId: room.id, avatarUrl: url })
      } catch (saveErr) {
        setErr(`Photo uploaded but could not save to group: ${saveErr?.message || 'unknown error'}. Try again.`)
      }
    } catch (ex) {
      setErr(ex?.message || 'Could not update photo.')
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, room.id, onRoomUpdated])

  const groupDisplayName = String(room.title || title || 'Group chat').trim() || 'Group chat'

  const updateTitleBarReveal = useCallback(() => {
    if (editMode) {
      setTitleBarReveal(0)
      return
    }
    const hero = heroTitleRef.current
    const chrome = topChromeRef.current
    if (!hero || !chrome) {
      setTitleBarReveal(0)
      return
    }
    const chromeBottom = chrome.getBoundingClientRect().bottom
    const heroRect = hero.getBoundingClientRect()
    const overlap = chromeBottom - heroRect.top
    const heroH = Math.max(heroRect.height, 1)
    setTitleBarReveal(Math.max(0, Math.min(1, overlap / heroH)))
  }, [editMode])

  useEffect(() => {
    if (!open) return undefined
    setTitleBarReveal(0)
    if (scrollBodyRef.current) scrollBodyRef.current.scrollTop = 0

    const queueReveal = () => {
      if (titleRevealRafRef.current) return
      titleRevealRafRef.current = window.requestAnimationFrame(() => {
        titleRevealRafRef.current = 0
        updateTitleBarReveal()
      })
    }

    queueReveal()
    const el = scrollBodyRef.current
    if (!el) return undefined
    el.addEventListener('scroll', queueReveal, { passive: true })
    window.addEventListener('resize', queueReveal)
    return () => {
      el.removeEventListener('scroll', queueReveal)
      window.removeEventListener('resize', queueReveal)
      if (titleRevealRafRef.current) window.cancelAnimationFrame(titleRevealRafRef.current)
    }
  }, [open, editMode, updateTitleBarReveal, groupDisplayName])

  useLayoutEffect(() => {
    if (!open) return
    updateTitleBarReveal()
  }, [open, editMode, groupDisplayName, updateTitleBarReveal])

  const onPickAvatar = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isOwner) return
    const isGif = file.type === 'image/gif'
    const maxBytes = isGif ? 8 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxBytes) {
      setErr(isGif ? 'GIF must be under 8 MB.' : 'Image must be under 10 MB.')
      return
    }
    if (isGif) {
      void doAvatarUpload(file)
    } else {
      setAvatarCropFile(file)
    }
  }

  if (typeof document === 'undefined') return null

  const jump = onJumpToMessage || (() => {})
  const roomIsMuted = room.muted_until && new Date(room.muted_until) > new Date()
  const mutedLabel = roomIsMuted
    ? `Until ${new Date(room.muted_until).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Off'

  const scrollTopInset = 'calc(env(safe-area-inset-top, 0px) + 3.75rem)'

  const settingsPortal = open ? createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-zinc-950" data-chat-feature>

      {/* Fixed glass chrome - back + scroll-reveal title + edit */}
      <div
        ref={topChromeRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="relative flex items-center justify-between gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="chat-header-glass pointer-events-auto relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <p
            className="pointer-events-none absolute inset-x-14 top-0 h-10 truncate text-center text-[17px] font-semibold leading-10 text-zinc-100"
            style={{ opacity: titleBarReveal }}
            aria-hidden={titleBarReveal < 0.08}
          >
            {groupDisplayName}
          </p>

          <div className="pointer-events-auto flex shrink-0 justify-end">
            {isOwner && !editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="chat-header-glass rounded-full px-4 py-2 text-[14px] font-semibold text-zinc-100 touch-manipulation active:opacity-75"
              >
                Edit
              </button>
            ) : isOwner && editMode ? (
              <button
                type="button"
                onClick={() => {
                  setEditMode(false)
                  setTitle(String(room.title || ''))
                  setDescription(String(room.description || ''))
                }}
                className="chat-header-glass rounded-full px-4 py-2 text-[14px] font-semibold text-zinc-100 touch-manipulation active:opacity-75"
              >
                Cancel
              </button>
            ) : (
              <div className="h-10 w-10 shrink-0" aria-hidden />
            )}
          </div>
        </div>
      </div>

      {/* Scroll body - content slides under fixed chrome + top fade */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="chat-info-top-fade pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{ height: scrollTopInset }}
        />
        <div
          ref={scrollBodyRef}
          className="min-h-0 h-full overflow-y-auto overscroll-y-contain pb-10"
          style={{ paddingTop: scrollTopInset }}
        >

        {err ? (
          <div className="mx-4 mt-3 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2.5 text-[13px] text-rose-300">
            {err}
          </div>
        ) : null}

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="flex flex-col items-center px-4 pb-5 pt-6">
          {/* Avatar */}
          <div>
            {isOwner && (
              <input ref={avatarInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickAvatar} />
            )}
            <ChatGroupHeaderStack
              groupAvatarUrl={room.avatar_url}
              members={headerMembers}
              size={84}
            />
          </div>

          {/* Photo action links - always visible to owner, no edit mode required */}
          {isOwner ? (
            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => avatarInputRef.current?.click()}
                className="text-[13px] font-semibold text-cyan-400 touch-manipulation active:opacity-70 disabled:opacity-40"
              >
                {busy ? 'Uploading…' : room.avatar_url ? 'Change photo' : 'Set photo'}
              </button>
            </div>
          ) : null}

          {editMode ? (
            <div className="mt-4 w-full space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Group name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-center text-[16px] font-semibold text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Description (optional)"
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-center text-[14px] text-zinc-300 placeholder:text-zinc-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !title.trim()}
                onClick={() => void saveMeta()}
                className="w-full rounded-xl bg-cyan-600 py-2.5 text-[15px] font-semibold text-zinc-950 touch-manipulation active:opacity-80 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <div className="mt-3 text-center">
              <p
                ref={heroTitleRef}
                className="text-[20px] font-bold leading-tight text-zinc-100"
              >
                {groupDisplayName}
              </p>
              {(room.description || description) ? (
                <p className="mt-1.5 text-[14px] leading-snug text-zinc-400">
                  {room.description || description}
                </p>
              ) : null}
              {!membersLoading && members.length > 0 ? (
                <p className="mt-2 text-[12px] text-zinc-600">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Quick actions ─────────────────────────────────────── */}
        <SettingsGroup>
          <SettingsRow
            icon={<IconSearch />}
            label="Search messages"
            onPress={() => setAuxView('search')}
          />
          <SettingsRow
            icon={<IconPin />}
            label="Pinned messages"
            badge={pinnedCount > 0 ? String(pinnedCount) : null}
            onPress={() => setAuxView('pinned')}
          />
          <SettingsRow
            icon={<IconMedia />}
            label="Media, links & docs"
            onPress={() => setAuxView('media')}
          />
          <SettingsRow
            icon={<IconStar />}
            label="Starred messages"
            badge={starred.length > 0 ? String(starred.length) : null}
            onPress={starred.length > 0 ? () => setAuxView('starred') : null}
            dim={starred.length === 0}
          />
        </SettingsGroup>

        {/* ── Members ───────────────────────────────────────────── */}
        <SectionLabel>
          {membersLoading ? 'Members' : members.length > 0 ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Members'}
        </SectionLabel>
        <div className="mx-4 overflow-hidden rounded-2xl bg-zinc-900/60">
          {membersLoading ? (
            <div className="px-4 py-3.5 text-[13px] text-zinc-500">Loading…</div>
          ) : membersError ? (
            <div className="px-4 py-3.5 text-[13px] leading-snug text-amber-400/90">{membersError}</div>
          ) : members.length === 0 ? (
            <div className="px-4 py-3.5 text-[13px] text-zinc-500">No members found.</div>
          ) : members.map((m, i) => {
            const memberIsMuted = m.moderation_muted_until && new Date(m.moderation_muted_until) > new Date()
            const isMe = m.user_id === viewerUserId
            return (
              <div
                key={m.user_id}
                className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-zinc-800/50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setMemberProfile(m)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left touch-manipulation active:opacity-80"
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-700 text-[14px] font-bold text-zinc-300">
                      {(m.display_name || m.handle || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-zinc-100">
                        {m.display_name || m.handle || 'Member'}
                      </span>
                      {isMe && <span className="shrink-0 text-[11px] text-zinc-500">you</span>}
                    </div>
                    {m.handle && m.display_name ? (
                      <div className="truncate text-[12px] text-zinc-500">@{m.handle}</div>
                    ) : null}
                    {memberIsMuted && !isMe ? (
                      <div className="text-[11px] text-amber-400/80">Muted · cannot send</div>
                    ) : null}
                  </div>
                </button>
                {isOwner && !isMe ? (
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 touch-manipulation active:bg-zinc-800"
                    onClick={() => setMemberActionTarget({
                      user_id: m.user_id,
                      label: m.display_name || m.handle || 'Member',
                      isMuted: !!memberIsMuted,
                    })}
                    aria-label="Member options"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                ) : null}
              </div>
            )
          })}

          {/* Add member row */}
          {!addExpanded ? (
            <button
              type="button"
              onClick={() => setAddExpanded(true)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 touch-manipulation active:bg-zinc-800 ${members.length > 0 ? 'border-t border-zinc-800/50' : ''}`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-500/10 text-cyan-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-[14px] font-semibold text-cyan-400">Add member</span>
            </button>
          ) : (
            <div className={`px-3 pb-3 pt-2.5 ${members.length > 0 ? 'border-t border-zinc-800/50' : ''}`}>
              <div className="flex items-center gap-2">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search name or handle…"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-[14px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { setAddExpanded(false); setAddSearch(''); setAddResults([]) }}
                  className="shrink-0 text-[13px] font-medium text-zinc-400 touch-manipulation active:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
              {addResults.length > 0 ? (
                <ul className="mt-2 space-y-0.5">
                  {addResults.map((p) => (
                    <li key={p.user_id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 touch-manipulation active:bg-zinc-800"
                        onClick={async () => {
                          try {
                            await chatAddGroupMembers(supabaseClient, room.id, [p.user_id])
                            setAddSearch('')
                            setAddExpanded(false)
                            setAddResults([])
                            await reload()
                          } catch (ex) {
                            setErr(ex?.message || 'Could not add member.')
                          }
                        }}
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-700 text-[12px] font-bold text-zinc-300">
                            {(p.display_name || p.handle || '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-left">
                          <div className="truncate text-[14px] font-semibold text-zinc-100">
                            {p.display_name || p.handle}
                          </div>
                          {p.handle && p.display_name ? (
                            <div className="text-[12px] text-zinc-500">@{p.handle}</div>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold text-cyan-400">Add</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : addSearch.trim().length >= 2 ? (
                <p className="mt-2 px-1 text-[13px] text-zinc-500">No results for "{addSearch.trim()}"</p>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Privacy ───────────────────────────────────────────── */}
        <SectionLabel>Privacy</SectionLabel>
        <SettingsGroup>
          <SettingsToggleRow
            label="Read receipts"
            hint="When off, you won't send or see read receipts."
            enabled={viewerReadReceiptsEnabled}
            busy={readReceiptsBusy}
            onToggle={() => onViewerReadReceiptsEnabledChange?.(!viewerReadReceiptsEnabled)}
          />
        </SettingsGroup>

        {/* ── Notifications ─────────────────────────────────────── */}
        <SectionLabel>Notifications</SectionLabel>
        <SettingsGroup>
          <SettingsRow
            icon={<IconBell />}
            label="Mute notifications"
            value={mutedLabel}
            valueHighlight={!!roomIsMuted}
            onPress={() => setMuteSheetOpen(true)}
          />
        </SettingsGroup>

        {/* ── Delete / leave group ──────────────────────────────── */}
        <div className="mx-4 mt-5 flex flex-col gap-3 pb-10">
          {isOwner ? (
            <button
              type="button"
              className="w-full rounded-2xl border border-rose-600/50 bg-rose-950/40 py-3.5 text-[15px] font-semibold text-rose-300 touch-manipulation active:bg-rose-950/70"
              onClick={async () => {
                if (
                  !window.confirm(
                    'Delete this group for all members? All messages will be removed. This cannot be undone.',
                  )
                ) {
                  return
                }
                try {
                  await chatDeleteGroup(supabaseClient, room.id)
                  onLeftGroup()
                } catch (ex) {
                  setErr(ex?.message || 'Could not delete group.')
                }
              }}
            >
              Delete Group for Everyone
            </button>
          ) : null}
          <button
            type="button"
            className="w-full rounded-2xl border border-rose-500/30 bg-rose-950/20 py-3.5 text-[15px] font-semibold text-rose-400 touch-manipulation active:bg-rose-950/50"
            onClick={async () => {
              if (!window.confirm('Leave this group?')) return
              try {
                await chatLeaveRoom(supabaseClient, room.id)
                onLeftGroup()
              } catch (ex) {
                setErr(ex?.message || 'Could not leave group.')
              }
            }}
          >
            Leave Group
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      {/* ── Mute notifications sheet ─────────────────────────── */}
      {muteSheetOpen ? createPortal(
        <BottomSheet onDismiss={() => { setMuteSheetOpen(false); setCustomMuteVisible(false) }}>
          <SheetTitle>Mute notifications</SheetTitle>
          {SELF_MUTE_OPTS.map((o) => (
            <SheetRow key={o.label} onClick={async () => {
              try {
                await chatMuteRoom(supabaseClient, room.id, o.hours)
                onRoomUpdated({ muted_until: new Date(Date.now() + o.hours * 3600000).toISOString() })
              } catch (ex) { setErr(ex?.message || 'Mute failed.') }
              setMuteSheetOpen(false)
              setCustomMuteVisible(false)
            }}>
              {o.label}
            </SheetRow>
          ))}
          <SheetRow onClick={() => setCustomMuteVisible((v) => !v)}>
            Custom time…
          </SheetRow>
          {customMuteVisible ? (
            <div className="flex gap-2 border-b border-zinc-800/60 px-4 pb-3 pt-2">
              <input
                type="datetime-local"
                value={muteUntilLocal}
                onChange={(e) => setMuteUntilLocal(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2 text-[14px] text-zinc-100"
              />
              <button
                type="button"
                disabled={!muteUntilLocal}
                className="shrink-0 rounded-xl bg-zinc-700 px-3 py-2 text-[13px] font-semibold text-zinc-100 disabled:opacity-40"
                onClick={async () => {
                  try {
                    const iso = new Date(muteUntilLocal).toISOString()
                    await chatMuteRoomUntil(supabaseClient, room.id, iso)
                    onRoomUpdated({ muted_until: iso })
                  } catch (ex) { setErr(ex?.message || 'Mute failed.') }
                  setMuteSheetOpen(false)
                  setCustomMuteVisible(false)
                }}
              >
                Apply
              </button>
            </div>
          ) : null}
          {roomIsMuted ? (
            <SheetRow accent="amber" onClick={async () => {
              try {
                await chatUnmuteRoom(supabaseClient, room.id)
                onRoomUpdated({ muted_until: null })
              } catch (ex) { setErr(ex?.message || 'Unmute failed.') }
              setMuteSheetOpen(false)
            }}>
              Unmute group
            </SheetRow>
          ) : null}
          <SheetCancel onClick={() => { setMuteSheetOpen(false); setCustomMuteVisible(false) }} />
        </BottomSheet>,
        document.body,
      ) : null}

      {/* ── Owner: member action sheet ───────────────────────── */}
      {memberActionTarget ? createPortal(
        <BottomSheet onDismiss={() => setMemberActionTarget(null)}>
          <SheetTitle>{memberActionTarget.label}</SheetTitle>
          <SheetRow onClick={() => {
            setMuteTarget({ user_id: memberActionTarget.user_id, label: memberActionTarget.label })
            setMemberActionTarget(null)
          }}>
            Mute from sending…
          </SheetRow>
          {memberActionTarget.isMuted ? (
            <SheetRow accent="amber" onClick={async () => {
              try {
                await chatUnmuteGroupMember(supabaseClient, room.id, memberActionTarget.user_id)
                await reload()
              } catch (ex) { setErr(ex?.message || 'Unmute failed.') }
              setMemberActionTarget(null)
            }}>
              Remove mute
            </SheetRow>
          ) : null}
          <SheetRow accent="rose" onClick={async () => {
            if (!window.confirm(`Remove ${memberActionTarget.label} from the group?`)) return
            try {
              await chatRemoveGroupMember(supabaseClient, room.id, memberActionTarget.user_id)
              await reload()
            } catch (ex) { setErr(ex?.message || 'Remove failed.') }
            setMemberActionTarget(null)
          }}>
            Remove from group
          </SheetRow>
          <SheetCancel onClick={() => setMemberActionTarget(null)} />
        </BottomSheet>,
        document.body,
      ) : null}

      {/* ── Owner: mute member duration picker ───────────────── */}
      {muteTarget ? createPortal(
        <BottomSheet zIndex={98} onDismiss={() => setMuteTarget(null)}>
          <SheetTitle>Mute {muteTarget.label}</SheetTitle>
          {OWNER_MEMBER_MUTE_OPTS.map((o) => (
            <SheetRow key={o.label} onClick={async () => {
              try {
                await chatMuteGroupMember(supabaseClient, room.id, muteTarget.user_id, o.minutes)
                await reload()
              } catch (ex) { setErr(ex?.message || 'Mute failed.') }
              setMuteTarget(null)
            }}>
              {o.label}
            </SheetRow>
          ))}
          <SheetCancel onClick={() => setMuteTarget(null)} />
        </BottomSheet>,
        document.body,
      ) : null}

      {settingsPortal}

      {/* ── Aux sheets ───────────────────────────────────────── */}
      <ChatGroupSearchSheet
        open={open && auxView === 'search'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={(id) => { jump(id); onClose() }}
      />
      <ChatGroupPinnedSheet
        open={open && auxView === 'pinned'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        room={room}
        viewerUserId={viewerUserId}
        onJumpToMessage={(id) => { jump(id); onClose() }}
        onPinsChanged={onPinsChanged}
      />
      <ChatGroupMediaSheet
        open={open && auxView === 'media'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={(id) => { jump(id); onClose() }}
      />

      <ChatGroupStarredSheet
        open={open && auxView === 'starred'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={(id) => { jump(id); onClose() }}
      />

      <ChatGroupMemberProfileSheet
        open={open && Boolean(memberProfile)}
        onBack={() => setMemberProfile(null)}
        member={memberProfile}
        roomId={String(room.id)}
        supabaseClient={supabaseClient}
        viewerUserId={viewerUserId}
        onJumpToMessage={jump}
        onOpenDm={onOpenDm}
        onViewProfile={onViewProfile}
        onCloseAll={() => { setMemberProfile(null); onClose() }}
      />

      <ProfileAvatarCropModal
        open={Boolean(avatarCropFile)}
        file={avatarCropFile}
        onCancel={() => setAvatarCropFile(null)}
        onApply={async (croppedFile) => {
          setAvatarCropFile(null)
          await doAvatarUpload(croppedFile)
        }}
      />
    </>
  )
}

/* ── Primitives ───────────────────────────────────────────────────── */

function SettingsRow({ icon, label, value, valueHighlight, badge, onPress, dim = false }) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag
      type={onPress ? 'button' : undefined}
      onClick={onPress || undefined}
      className={`flex w-full items-center gap-3 border-b border-zinc-800/50 px-4 py-3 last:border-b-0 ${onPress ? 'touch-manipulation active:bg-zinc-800' : ''}`}
    >
      <span className={`shrink-0 ${dim ? 'text-zinc-600' : 'text-zinc-400'}`}>{icon}</span>
      <span className={`flex-1 text-left text-[14px] font-medium ${dim ? 'text-zinc-500' : 'text-zinc-100'}`}>{label}</span>
      {badge ? (
        <span className="shrink-0 min-w-[20px] rounded-full bg-zinc-700 px-1.5 py-0.5 text-center text-[11px] font-semibold text-zinc-300">
          {badge}
        </span>
      ) : null}
      {value != null ? (
        <span className={`shrink-0 text-[13px] ${valueHighlight ? 'text-amber-400' : 'text-zinc-500'}`}>
          {value}
        </span>
      ) : null}
      {onPress ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-zinc-600">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : null}
    </Tag>
  )
}

function BottomSheet({ children, onDismiss, zIndex = 97 }) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/60"
      style={{ zIndex, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      onClick={onDismiss}
    >
      <div
        className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-700/40 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function SheetTitle({ children }) {
  return (
    <div className="border-b border-zinc-800 px-5 py-3 text-center text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </div>
  )
}

function SheetRow({ children, onClick, accent }) {
  const color = accent === 'rose' ? 'text-rose-400' : accent === 'amber' ? 'text-amber-400' : 'text-zinc-100'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center border-b border-zinc-800/60 px-5 py-3.5 text-left text-[15px] last:border-b-0 touch-manipulation active:bg-zinc-800 ${color}`}
    >
      {children}
    </button>
  )
}

function SheetCancel({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full justify-center px-5 py-3.5 text-[15px] font-semibold text-zinc-400 touch-manipulation active:bg-zinc-800"
    >
      Cancel
    </button>
  )
}

/* ── Icons ────────────────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function IconMedia() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
