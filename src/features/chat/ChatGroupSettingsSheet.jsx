import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { uploadProfileAvatar } from '../profiles/profileGate.js'
import {
  chatAddGroupMembers,
  chatGroupMembersList,
  chatIsGroupOwner,
  chatLeaveRoom,
  chatMuteGroupMember,
  chatMuteRoom,
  chatMuteRoomUntil,
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
} from './ChatGroupAuxSheets.jsx'

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
}) {
  const isOwner = chatIsGroupOwner(room, viewerUserId)
  const [title, setTitle] = useState(String(room.title || ''))
  const [description, setDescription] = useState(String(room.description || ''))
  const [members, setMembers] = useState(/** @type {any[]} */ ([]))
  const [starred, setStarred] = useState(/** @type {any[]} */ ([]))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState(/** @type {any[]} */ ([]))
  const [muteUntilLocal, setMuteUntilLocal] = useState('')
  const avatarInputRef = useRef(null)
  const searchTimerRef = useRef(null)
  const [auxView, setAuxView] = useState(/** @type {null | 'search' | 'pinned' | 'media'} */ (null))
  const [muteTarget, setMuteTarget] = useState(/** @type {null | { user_id: string, label: string } } */ (null))

  const reload = useCallback(async () => {
    if (!room?.id) return
    const [mems, stars] = await Promise.all([
      chatGroupMembersList(supabaseClient, room.id),
      chatStarredMessagesPage(supabaseClient, room.id, 40),
    ])
    setMembers(mems)
    setStarred(stars)
  }, [room?.id, supabaseClient])

  useEffect(() => {
    if (!open) return
    setTitle(String(room.title || ''))
    setDescription(String(room.description || ''))
    setErr('')
    setAuxView(null)
    void reload()
  }, [open, room.title, room.description, reload])

  useEffect(() => {
    if (!open) return undefined
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = addSearch.trim()
    if (q.length < 2) {
      setAddResults([])
      return undefined
    }
    searchTimerRef.current = setTimeout(async () => {
      const exclude = new Set([viewerUserId, ...members.map((m) => m.user_id)])
      const { data } = await supabaseClient
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url')
        .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(12)
      setAddResults((data || []).filter((p) => p.user_id && !exclude.has(p.user_id)))
    }, 200)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [addSearch, isOwner, members, open, supabaseClient, viewerUserId])

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
    } catch (e) {
      setErr(e?.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isOwner) return
    setBusy(true)
    setErr('')
    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) throw new Error('Not signed in.')
      const { data: url, error: upErr } = await uploadProfileAvatar({
        supabaseClient,
        user: session.user,
        file,
      })
      if (upErr) throw upErr
      await chatUpdateGroup(supabaseClient, { roomId: room.id, avatarUrl: url })
      onRoomUpdated({ avatar_url: url })
    } catch (ex) {
      setErr(ex?.message || 'Could not update photo.')
    } finally {
      setBusy(false)
    }
  }

  if (typeof document === 'undefined') return null

  const jump = onJumpToMessage || (() => {})

  const settingsPortal = open ? createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-zinc-950" data-chat-feature>
      <div
        className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="chat-header-glass flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70"
          aria-label="Close group settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-zinc-50">Group settings</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-8">
        {err ? (
          <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[13px] text-rose-200">
            {err}
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-2 pb-6">
          <ChatGroupHeaderStack
            groupAvatarUrl={room.avatar_url}
            members={headerMembers}
            size={72}
          />
          {isOwner ? (
            <>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
              <button
                type="button"
                disabled={busy}
                onClick={() => avatarInputRef.current?.click()}
                className="text-[13px] font-semibold text-cyan-400 touch-manipulation active:opacity-70"
              >
                Change group photo
              </button>
              {room.avatar_url ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-[12px] font-medium text-zinc-500 touch-manipulation active:text-zinc-300"
                  onClick={async () => {
                    setBusy(true)
                    setErr('')
                    try {
                      await chatUpdateGroup(supabaseClient, { roomId: room.id, avatarUrl: '' })
                      onRoomUpdated({ avatar_url: null })
                    } catch (ex) {
                      setErr(ex?.message || 'Could not remove photo.')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Use member avatars instead
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        {isOwner ? (
          <Section title="Group info">
            <label className="block text-[12px] font-medium text-zinc-500">Name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100"
            />
            <label className="mt-3 block text-[12px] font-medium text-zinc-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100"
            />
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={() => void saveMeta()}
              className="mt-3 w-full rounded-xl bg-cyan-600 py-2.5 text-[15px] font-semibold text-zinc-950 touch-manipulation active:opacity-80 disabled:opacity-50"
            >
              Save
            </button>
          </Section>
        ) : (
          <Section title="Group info">
            <p className="text-[16px] font-bold text-zinc-100">{title || 'Group chat'}</p>
            {description ? <p className="mt-2 text-[14px] text-zinc-400">{description}</p> : null}
          </Section>
        )}

        <Section title={isOwner ? 'Members (you can mute or remove)' : 'Members'}>
          {members.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Could not load members. Apply chat migrations on Supabase test, then reload.
            </p>
          ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.user_id} className="rounded-xl bg-zinc-900/80 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-700 text-[13px] font-bold text-zinc-300">
                      {(m.display_name || m.handle || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-zinc-100">
                      {m.display_name || m.handle || 'Member'}
                      {m.user_id === viewerUserId ? (
                        <span className="ml-1 text-[12px] font-normal text-zinc-500">(you)</span>
                      ) : null}
                    </div>
                    {m.moderation_muted_until && new Date(m.moderation_muted_until) > new Date() ? (
                      <div className="text-[11px] text-amber-400/90">Muted in group — cannot send</div>
                    ) : null}
                  </div>
                </div>
                {isOwner && m.user_id !== viewerUserId ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-600 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-800"
                      onClick={() => setMuteTarget({
                        user_id: m.user_id,
                        label: m.display_name || m.handle || 'Member',
                      })}
                    >
                      Mute…
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-600 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 touch-manipulation active:bg-zinc-800"
                      onClick={async () => {
                        try {
                          await chatUnmuteGroupMember(supabaseClient, room.id, m.user_id)
                          await reload()
                        } catch (ex) {
                          setErr(ex?.message || 'Unmute failed.')
                        }
                      }}
                    >
                      Unmute
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-[12px] font-semibold text-rose-400 touch-manipulation active:bg-rose-950/40"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${m.display_name || m.handle || 'this member'} from the group?`)) return
                        try {
                          await chatRemoveGroupMember(supabaseClient, room.id, m.user_id)
                          await reload()
                        } catch (ex) {
                          setErr(ex?.message || 'Remove failed.')
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          )}
          <div className="mt-3">
              <input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search handle to add…"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500"
              />
              {addResults.length > 0 ? (
                <ul className="mt-2 overflow-hidden rounded-xl border border-zinc-700/80">
                  {addResults.map((p) => (
                    <li key={p.user_id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left touch-manipulation active:bg-zinc-800"
                        onClick={async () => {
                          try {
                            await chatAddGroupMembers(supabaseClient, room.id, [p.user_id])
                            setAddSearch('')
                            await reload()
                          } catch (ex) {
                            setErr(ex?.message || 'Could not add member.')
                          }
                        }}
                      >
                        <span className="text-[14px] font-semibold text-zinc-100">
                          {p.display_name || p.handle}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
        </Section>

        <Section title="Mute notifications">
          <div className="flex flex-wrap gap-2">
            {SELF_MUTE_OPTS.map((o) => (
              <button
                key={o.label}
                type="button"
                className="rounded-full border border-zinc-600 px-3 py-1.5 text-[13px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-800"
                onClick={async () => {
                  try {
                    await chatMuteRoom(supabaseClient, room.id, o.hours)
                    onRoomUpdated({ muted_until: new Date(Date.now() + o.hours * 3600000).toISOString() })
                  } catch (ex) {
                    setErr(ex?.message || 'Mute failed.')
                  }
                }}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-zinc-600 px-3 py-1.5 text-[13px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-800"
              onClick={async () => {
                try {
                  await chatUnmuteRoom(supabaseClient, room.id)
                  onRoomUpdated({ muted_until: null })
                } catch (ex) {
                  setErr(ex?.message || 'Unmute failed.')
                }
              }}
            >
              Unmute group
            </button>
          </div>
          <label className="mt-3 block text-[12px] text-zinc-500">Mute until (local time)</label>
          <div className="mt-1 flex gap-2">
            <input
              type="datetime-local"
              value={muteUntilLocal}
              onChange={(e) => setMuteUntilLocal(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-2 py-2 text-[14px] text-zinc-100"
            />
            <button
              type="button"
              disabled={!muteUntilLocal}
              className="shrink-0 rounded-xl bg-zinc-700 px-3 py-2 text-[13px] font-semibold text-zinc-100 touch-manipulation active:opacity-80 disabled:opacity-40"
              onClick={async () => {
                try {
                  const iso = new Date(muteUntilLocal).toISOString()
                  await chatMuteRoomUntil(supabaseClient, room.id, iso)
                  onRoomUpdated({ muted_until: iso })
                } catch (ex) {
                  setErr(ex?.message || 'Mute failed.')
                }
              }}
            >
              Apply
            </button>
          </div>
        </Section>

        <Section title="Starred messages">
          {starred.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Long-press a message and tap Star.</p>
          ) : (
            <ul className="space-y-2">
              {starred.map((s) => (
                <li key={s.message_id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-zinc-900/80 px-3 py-2 text-left text-[14px] text-zinc-200 touch-manipulation active:bg-zinc-800"
                    onClick={() => {
                      onJumpToMessage?.(s.message_id)
                      onClose()
                    }}
                  >
                    <div className="line-clamp-2">{s.body || '[media]'}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {new Date(s.created_at).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="More">
          <MoreRow label="Search messages" onClick={() => setAuxView('search')} />
          <MoreRow label="Pinned messages" onClick={() => setAuxView('pinned')} />
          <MoreRow label="Media, links & docs" onClick={() => setAuxView('media')} />
        </Section>

        <button
          type="button"
          className="mt-6 w-full rounded-xl border border-rose-500/50 py-3 text-[15px] font-semibold text-rose-300 touch-manipulation active:bg-rose-950/40"
          onClick={async () => {
            try {
              await chatLeaveRoom(supabaseClient, room.id)
              onLeftGroup()
            } catch (ex) {
              setErr(ex?.message || 'Could not leave group.')
            }
          }}
        >
          Leave group
        </button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      {muteTarget && createPortal(
        <div
          className="fixed inset-0 z-[97] flex items-end justify-center bg-black/50 pb-6"
          onClick={() => setMuteTarget(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700/50 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-800 px-5 py-3 text-[14px] font-semibold text-zinc-200">
              Mute {muteTarget.label} from sending
            </div>
            {OWNER_MEMBER_MUTE_OPTS.map((o) => (
              <button
                key={o.label}
                type="button"
                className="flex w-full px-5 py-3.5 text-left text-[15px] font-semibold text-zinc-100 touch-manipulation active:bg-zinc-800"
                onClick={async () => {
                  try {
                    await chatMuteGroupMember(supabaseClient, room.id, muteTarget.user_id, o.minutes)
                    setMuteTarget(null)
                    await reload()
                  } catch (ex) {
                    setErr(ex?.message || 'Mute failed.')
                    setMuteTarget(null)
                  }
                }}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              className="flex w-full justify-center border-t border-zinc-800 px-5 py-3.5 text-[15px] text-zinc-400 touch-manipulation active:bg-zinc-800"
              onClick={() => setMuteTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
      {settingsPortal}
      <ChatGroupSearchSheet
        open={open && auxView === 'search'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={(id) => {
          jump(id)
          onClose()
        }}
      />
      <ChatGroupPinnedSheet
        open={open && auxView === 'pinned'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        room={room}
        viewerUserId={viewerUserId}
        onJumpToMessage={(id) => {
          jump(id)
          onClose()
        }}
        onPinsChanged={onPinsChanged}
      />
      <ChatGroupMediaSheet
        open={open && auxView === 'media'}
        onBack={() => setAuxView(null)}
        supabaseClient={supabaseClient}
        roomId={String(room.id)}
        onJumpToMessage={(id) => {
          jump(id)
          onClose()
        }}
      />
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function MoreRow({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 flex w-full items-center justify-between rounded-xl bg-zinc-900/80 px-3 py-3 touch-manipulation active:bg-zinc-800"
    >
      <span className="text-[14px] font-medium text-zinc-200">{label}</span>
      <span className="text-[15px] text-zinc-400">›</span>
    </button>
  )
}
