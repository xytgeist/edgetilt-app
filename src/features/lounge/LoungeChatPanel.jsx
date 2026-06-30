import { useCallback, useEffect, useState } from 'react'
import { loungeChatInvoke } from '../../utils/loungeChatApi'
import { LOUNGE_CHAT_TOPIC_CHANNELS } from '../../utils/loungeChatConstants'
import ChatGroupHeaderStack from '../chat/ChatGroupHeaderStack.jsx'
import {
  chatGroupHeaderMembersBatch,
  enrichChatRoomRow,
} from '../chat/chatApi.js'

/**
 * Dock slide panel - **conversation list only**.
 * Tapping a room calls `onOpenChatRoom(roomId)` which navigates to the full Chat tab.
 * The full message experience lives in `src/features/chat/ChatConversation.jsx`.
 */
export default function LoungeChatPanel({
  supabaseClient,
  viewerUserId,
  hasActiveSubscription = false,
  isStaff = false,
  initialPeerUserId = null,
  onClearInitialPeer,
  /** Called with roomId when user taps a room - AppShell navigates to the full Chat tab. */
  onOpenChatRoom,
}) {
  const [tab, setTab] = useState('inbox')
  const [rooms, setRooms] = useState([])
  const [roomsErr, setRoomsErr] = useState('')
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [actionErr, setActionErr] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [groupHeaderByRoomId, setGroupHeaderByRoomId] = useState(/** @type {Record<string, any[]>} */ ({}))

  const subscriberOk = Boolean(hasActiveSubscription || isStaff)

  const loadRooms = useCallback(async () => {
    if (!viewerUserId || !supabaseClient) {
      setRooms([])
      setRoomsLoading(false)
      return
    }
    setRoomsErr('')
    setRoomsLoading(true)
    try {
      const { data, error } = await supabaseClient.rpc('chat_rooms_for_user', {
        p_user_id: viewerUserId,
      })
      if (error) throw error

      const enriched = (data || []).map((r) => {
        let listLabel = r.title || r.slug || 'Chat'
        if (r.kind === 'dm') {
          listLabel = r.peer_handle
            ? `@${r.peer_handle}`
            : r.peer_display_name || 'Direct message'
        } else if (r.kind === 'channel') {
          listLabel = r.title ? `#${r.slug} · ${r.title}` : `#${r.slug}`
        } else if (r.kind === 'group') {
          listLabel = r.title || 'Group chat'
        }
        return {
          ...enrichChatRoomRow(r, viewerUserId),
          listLabel,
        }
      })

      setRooms(enriched)
      const groupIds = enriched.filter((r) => r.kind === 'group').map((r) => r.id)
      if (groupIds.length > 0) {
        void chatGroupHeaderMembersBatch(supabaseClient, groupIds)
          .then(setGroupHeaderByRoomId)
          .catch(() => setGroupHeaderByRoomId({}))
      } else {
        setGroupHeaderByRoomId({})
      }
    } catch (e) {
      setRoomsErr(e?.message || 'Could not load chats.')
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => { void loadRooms() }, [loadRooms])

  const openDmWithPeer = useCallback(
    async (peerId) => {
      if (!peerId) return
      setActionErr('')
      setActionBusy(true)
      try {
        const res = await loungeChatInvoke(supabaseClient, { action: 'open_dm', peer_user_id: peerId })
        const rid = res?.room_id
        if (!rid) throw new Error('No room returned.')
        await loadRooms()
        onOpenChatRoom?.(rid)
      } catch (e) {
        setActionErr(e?.message || 'Could not open DM.')
      } finally {
        setActionBusy(false)
      }
    },
    [supabaseClient, loadRooms, onOpenChatRoom],
  )

  useEffect(() => {
    if (!initialPeerUserId) return
    void openDmWithPeer(initialPeerUserId).then(() => onClearInitialPeer?.())
  }, [initialPeerUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  const joinTopic = useCallback(
    async (slug) => {
      setActionErr('')
      setActionBusy(true)
      try {
        const res = await loungeChatInvoke(supabaseClient, { action: 'join_channel', slug })
        const rid = res?.room_id
        if (!rid) throw new Error('Join failed.')
        await loadRooms()
        onOpenChatRoom?.(rid)
      } catch (e) {
        setActionErr(e?.message || 'Could not join channel.')
      } finally {
        setActionBusy(false)
      }
    },
    [supabaseClient, loadRooms, onOpenChatRoom],
  )

  if (!viewerUserId) {
    return (
      <div className="px-3 py-6">
        <p className="text-[15px] leading-relaxed text-zinc-400">Sign in to use chat.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-2 py-2">
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`min-h-10 flex-1 rounded-xl text-[14px] font-bold touch-manipulation ${
            tab === 'inbox' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setTab('topics')}
          className={`min-h-10 flex-1 rounded-xl text-[14px] font-bold touch-manipulation ${
            tab === 'topics' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          Topics
        </button>
      </div>

      {actionErr ? (
        <div className="mx-3 mt-2 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-100">
          {actionErr}
        </div>
      ) : null}

      {tab === 'topics' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="mb-3 text-[13px] leading-relaxed text-zinc-500">
            Topic rooms are for subscribers. Join opens the full thread.
          </p>
          <ul className="space-y-2">
            {LOUNGE_CHAT_TOPIC_CHANNELS.map((c) => (
              <li key={c.slug}>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-zinc-100">{c.title}</div>
                    <div className="truncate text-[12px] text-zinc-500">#{c.slug}</div>
                  </div>
                  <button
                    type="button"
                    disabled={!subscriberOk || actionBusy}
                    onClick={() => void joinTopic(c.slug)}
                    className="shrink-0 rounded-xl bg-violet-600 px-3 py-2 text-[13px] font-bold text-white touch-manipulation hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {subscriberOk ? (actionBusy ? '…' : 'Join') : 'Locked'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : roomsLoading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="text-[14px] text-zinc-500">Loading…</p>
        </div>
      ) : roomsErr ? (
        <div className="mx-3 mt-3 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-100">
          {roomsErr}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <p className="text-center text-[14px] leading-relaxed text-zinc-500">
            No conversations yet.{' '}
            Open someone&apos;s profile and tap <span className="text-zinc-300">Message</span>, or join a topic.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-zinc-800/50 overflow-y-auto">
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenChatRoom?.(r.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left touch-manipulation hover:bg-zinc-900/60 active:bg-zinc-900"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                  {r.kind === 'dm' && r.peerAvatarUrl ? (
                    <img src={r.peerAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : r.kind === 'group' ? (
                    <ChatGroupHeaderStack
                      groupAvatarUrl={r.avatar_url}
                      members={groupHeaderByRoomId[r.id] || []}
                      size={40}
                    />
                  ) : (
                    <div className={`grid h-10 w-10 place-items-center rounded-full text-[16px] font-bold ${
                      r.kind === 'channel' ? 'bg-violet-900/60 text-violet-300' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      {r.kind === 'channel' ? '#' : r.listLabel?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  {r.hasUnread && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-cyan-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[14px] font-semibold ${r.hasUnread ? 'text-zinc-100' : 'text-zinc-300'}`}>
                    {r.listLabel}
                  </div>
                  {r.last_message_preview ? (
                    <div className={`truncate text-[12px] ${r.hasUnread ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {r.last_message_preview}
                    </div>
                  ) : null}
                </div>
                <span aria-hidden className="shrink-0 text-zinc-600 text-sm">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {rooms.length > 0 && onOpenChatRoom ? (
        <div className="shrink-0 border-t border-zinc-800 px-3 py-2">
          <p className="text-center text-[12px] text-zinc-600">
            Tap a conversation to open the full Chat tab
          </p>
        </div>
      ) : null}
    </div>
  )
}
