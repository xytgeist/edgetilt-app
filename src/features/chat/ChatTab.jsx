import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import QuickLinkPageToggle from '../../components/QuickLinkPageToggle.jsx'
import ChatConversation from './ChatConversation.jsx'
import {
  chatOpenDm,
  chatRoomLabel,
  chatRoomIsMuted,
} from './chatApi.js'
import { LOUNGE_CHAT_TOPIC_CHANNELS } from '../../utils/loungeChatConstants.js'
import { loungeChatInvoke } from '../../utils/loungeChatApi.js'

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   hasActiveSubscription?: boolean,
 *   isStaff?: boolean,
 *   browseMode?: string,
 *   onRequireAuth?: () => void,
 *   titleBarNavSlot?: import('react').ReactNode,
 *   initialPeerUserId?: string | null,
 *   onInitialPeerConsumed?: () => void,
 *   initialRoomId?: string | null,
 *   onInitialRoomConsumed?: () => void,
 * }} props
 */
export default function ChatTab({
  supabaseClient,
  hasActiveSubscription = false,
  isStaff = false,
  browseMode = 'member',
  onRequireAuth,
  titleBarNavSlot = null,
  initialPeerUserId = null,
  onInitialPeerConsumed,
  initialRoomId = null,
  onInitialRoomConsumed,
}) {
  const [viewerUserId, setViewerUserId] = useState('')
  const [viewerProfile, setViewerProfile] = useState(null)
  const [rooms, setRooms] = useState(/** @type {any[]} */ ([]))
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsErr, setRoomsErr] = useState('')
  const [activeRoomId, setActiveRoomId] = useState(/** @type {string | null} */ (null))
  const [tab, setTab] = useState(/** @type {'inbox' | 'topics'} */ ('inbox'))
  const [actionErr, setActionErr] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const profilesCacheRef = useRef({})

  const subscriberOk = Boolean(hasActiveSubscription || isStaff)

  // ── Resolve viewer session + profile ─────────────────────────────────────

  useEffect(() => {
    if (!supabaseClient) return
    void (async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      const uid = session?.user?.id || ''
      setViewerUserId(uid)
      if (!uid) return
      const { data: prof } = await supabaseClient
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url')
        .eq('user_id', uid)
        .maybeSingle()
      if (prof) setViewerProfile(prof)
    })()
  }, [supabaseClient])

  // ── Load conversation list ────────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    if (!viewerUserId || !supabaseClient) {
      setRooms([])
      setRoomsLoading(false)
      return
    }
    setRoomsErr('')
    setRoomsLoading(true)
    try {
      // Single RPC — replaces 3 sequential client-side queries
      const { data, error } = await supabaseClient.rpc('chat_rooms_for_user', {
        p_user_id: viewerUserId,
      })
      if (error) throw error

      const enriched = (data || []).map((r) => {
        // Cache profiles for ChatConversation lookup
        if (r.peer_user_id) {
          profilesCacheRef.current[r.peer_user_id] = {
            user_id: r.peer_user_id,
            handle: r.peer_handle,
            display_name: r.peer_display_name,
            avatar_url: r.peer_avatar_url,
          }
        }
        if (r.last_message_sender_id && r.sender_handle) {
          profilesCacheRef.current[r.last_message_sender_id] = {
            user_id: r.last_message_sender_id,
            handle: r.sender_handle,
            display_name: r.sender_display_name,
          }
        }

        const peerLabel = r.peer_handle
          ? `@${r.peer_handle}`
          : r.peer_display_name || null

        const senderName = r.last_message_sender_id === viewerUserId
          ? 'You'
          : r.sender_handle
          ? `@${r.sender_handle}`
          : r.sender_display_name || ''

        const previewText = r.last_message_preview
          ? (senderName ? `${senderName}: ${r.last_message_preview}` : r.last_message_preview)
          : null

        return {
          ...r,
          peerLabel,
          peerAvatarUrl: r.peer_avatar_url || null,
          previewText,
          memberRole: r.member_role || 'member',
          hasUnread: Boolean(r.has_unread),
          isMuted: chatRoomIsMuted(r.muted_until),
        }
      })

      setRooms(enriched)
    } catch (e) {
      setRoomsErr(e?.message || 'Could not load conversations.')
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  // ── Handle initialPeerUserId (from profile Message tap) ──────────────────

  useEffect(() => {
    if (!initialPeerUserId || !viewerUserId || !supabaseClient) return
    const consumed = onInitialPeerConsumed
    void (async () => {
      setActionErr('')
      setActionBusy(true)
      try {
        const res = await chatOpenDm(supabaseClient, initialPeerUserId)
        if (res?.room_id) {
          await loadRooms()
          setActiveRoomId(res.room_id)
          setTab('inbox')
        }
      } catch (e) {
        setActionErr(e?.message || 'Could not open conversation.')
      } finally {
        setActionBusy(false)
        consumed?.()
      }
    })()
  }, [initialPeerUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle initialRoomId (from deep link / push tap) ─────────────────────

  useEffect(() => {
    if (!initialRoomId) return
    setActiveRoomId(initialRoomId)
    onInitialRoomConsumed?.()
  }, [initialRoomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join topic channel ────────────────────────────────────────────────────

  const joinTopic = useCallback(async (slug) => {
    setActionErr('')
    setActionBusy(true)
    try {
      const res = await loungeChatInvoke(supabaseClient, { action: 'join_channel', slug })
      const rid = res?.room_id
      if (!rid) throw new Error('Join failed.')
      await loadRooms()
      setActiveRoomId(rid)
      setTab('inbox')
    } catch (e) {
      setActionErr(e?.message || 'Could not join channel.')
    } finally {
      setActionBusy(false)
    }
  }, [supabaseClient, loadRooms])

  // ── Active room data ──────────────────────────────────────────────────────

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || null,
    [rooms, activeRoomId]
  )

  // ── Profiles map for ChatConversation ─────────────────────────────────────

  const profilesById = profilesCacheRef.current

  // ── Anon gate ─────────────────────────────────────────────────────────────

  if (browseMode === 'anonymous') {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="text-4xl">💬</div>
          <div className="text-xl font-bold text-zinc-100">Chat</div>
          <p className="text-[15px] leading-relaxed text-zinc-400">
            Sign in to message other members.
          </p>
          <button
            type="button"
            onClick={() => onRequireAuth?.()}
            className="min-h-12 rounded-2xl bg-cyan-700 px-6 text-[15px] font-bold text-white touch-manipulation hover:bg-cyan-600"
          >
            Sign in
          </button>
        </div>
      </ScrollLinkedEdgeTitleBarShell>
    )
  }

  // ── Conversation view (full-screen within this tab) ───────────────────────

  if (activeRoomId && (activeRoom || !roomsLoading)) {
    const room = activeRoom || { id: activeRoomId, kind: 'dm' }
    return (
      <ChatConversation
        supabaseClient={supabaseClient}
        room={room}
        viewerUserId={viewerUserId}
        viewerProfile={viewerProfile}
        profilesById={profilesById}
        onBack={() => { setActiveRoomId(null); void loadRooms() }}
      />
    )
  }

  // ── Conversation list ─────────────────────────────────────────────────────

  return (
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      {/* Quick link toggle */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <div>
          <div className="text-2xl font-black tracking-tight text-zinc-100">Chat</div>
          <div className="text-sm text-zinc-500 mt-0.5">Messages &amp; topic rooms</div>
        </div>
        <QuickLinkPageToggle destinationId="chat" />
      </div>

      {/* Inbox / Topics tabs */}
      <div className="flex gap-1 border-b border-zinc-800 px-3 pb-0 pt-1">
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`min-h-10 rounded-t-xl px-4 text-[14px] font-bold touch-manipulation ${
            tab === 'inbox'
              ? 'border-b-2 border-cyan-500 text-cyan-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setTab('topics')}
          className={`min-h-10 rounded-t-xl px-4 text-[14px] font-bold touch-manipulation ${
            tab === 'topics'
              ? 'border-b-2 border-cyan-500 text-cyan-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Topics
        </button>
      </div>

      {actionErr ? (
        <div className="mx-3 mt-3 rounded-2xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[13px] text-rose-200">
          {actionErr}
        </div>
      ) : null}

      {tab === 'topics' ? (
        <div className="px-3 py-4 space-y-2">
          <p className="mb-3 text-[13px] leading-relaxed text-zinc-500">
            Topic rooms are subscriber-only. Join opens the thread in your Inbox.
          </p>
          {LOUNGE_CHAT_TOPIC_CHANNELS.map((c) => (
            <div
              key={c.slug}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-zinc-100">{c.title}</div>
                <div className="text-[12px] text-zinc-500">#{c.slug}</div>
              </div>
              <button
                type="button"
                disabled={!subscriberOk || actionBusy}
                onClick={() => void joinTopic(c.slug)}
                className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-bold text-white touch-manipulation hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {subscriberOk ? (actionBusy ? 'Joining…' : 'Join') : 'Locked'}
              </button>
            </div>
          ))}
        </div>
      ) : roomsLoading ? (
        <div className="flex items-center justify-center py-16 text-[14px] text-zinc-500">
          Loading conversations…
        </div>
      ) : roomsErr ? (
        <div className="mx-3 mt-4 rounded-2xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[13px] text-rose-200">
          {roomsErr}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="text-4xl">💬</div>
          <p className="text-[15px] leading-relaxed text-zinc-400">
            No conversations yet.{' '}
            <span className="text-zinc-300">Open someone&apos;s profile and tap Message</span>
            , or join a topic above.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/50">
          {rooms.map((room) => {
            const label = chatRoomLabel(room)
            return (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation hover:bg-zinc-900/60 active:bg-zinc-900"
                >
                  {/* Avatar / icon */}
                  <div className="relative shrink-0">
                    {room.kind === 'dm' && room.peerAvatarUrl ? (
                      <img
                        src={room.peerAvatarUrl}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className={`grid h-11 w-11 place-items-center rounded-full text-[18px] ${
                        room.kind === 'channel' ? 'bg-violet-900/60' : room.kind === 'group' ? 'bg-amber-900/60' : 'bg-zinc-800'
                      }`}>
                        {room.kind === 'channel' ? '#' : room.kind === 'group' ? '👥' : (room.peerLabel?.[1] || '?').toUpperCase()}
                      </div>
                    )}
                    {room.hasUnread && (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 bg-cyan-500" />
                    )}
                  </div>

                  {/* Labels */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-[15px] font-semibold ${room.hasUnread ? 'text-zinc-100' : 'text-zinc-300'}`}>
                        {label}
                      </span>
                      {room.isMuted && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0 text-zinc-600">
                          <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                        </svg>
                      )}
                    </div>
                    {room.previewText ? (
                      <div className={`truncate text-[13px] ${room.hasUnread ? 'font-medium text-zinc-300' : 'text-zinc-500'}`}>
                        {room.previewText}
                      </div>
                    ) : (
                      <div className="text-[13px] text-zinc-600">No messages yet</div>
                    )}
                  </div>

                  {/* Timestamp */}
                  {room.last_message_at && (
                    <div className="shrink-0 text-[11px] text-zinc-600">
                      {formatChatTimestamp(room.last_message_at)}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </ScrollLinkedEdgeTitleBarShell>
  )
}

/** Short relative timestamp for conversation list rows. */
function formatChatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
