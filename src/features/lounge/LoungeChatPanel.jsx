import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loungeChatInvoke } from '../../utils/loungeChatApi'
import { LOUNGE_CHAT_TOPIC_CHANNELS } from '../../utils/loungeChatConstants'

/** DM rooms store `dm_key` as the two user ids sorted lexically, joined with `::` (see Edge `dmKey`). */
function peerUserIdFromDmKey(dmKey, viewerUserId) {
  if (!dmKey || !viewerUserId) return null
  const parts = String(dmKey).split('::').map((s) => s.trim())
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (a === viewerUserId) return b
  if (b === viewerUserId) return a
  return null
}

/**
 * Lounge dock **Chat** panel: DMs + small groups + subscriber topic channels.
 */
export default function LoungeChatPanel({
  supabaseClient,
  viewerUserId,
  hasActiveSubscription = false,
  isStaff = false,
  initialPeerUserId = null,
  onClearInitialPeer,
}) {
  const [tab, setTab] = useState('inbox')
  const [rooms, setRooms] = useState([])
  const [roomsErr, setRoomsErr] = useState('')
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [activeRoomId, setActiveRoomId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesErr, setMessagesErr] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const channelRef = useRef(null)

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
      const { data: mems, error: mErr } = await supabaseClient
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', viewerUserId)
      if (mErr) throw mErr
      const ids = [...new Set((mems || []).map((r) => r.room_id).filter(Boolean))]
      if (ids.length === 0) {
        setRooms([])
        return
      }
      const { data: roomRows, error: rErr } = await supabaseClient
        .from('chat_rooms')
        .select('id, kind, slug, title, dm_key, subscriber_only, max_members')
        .in('id', ids)
      if (rErr) throw rErr
      const dmRooms = (roomRows || []).filter((r) => r.kind === 'dm')
      let peerByRoom = {}
      if (dmRooms.length > 0) {
        const peerIds = []
        const roomToPeer = {}
        for (const r of dmRooms) {
          const pid = peerUserIdFromDmKey(r.dm_key, viewerUserId)
          if (pid) {
            roomToPeer[r.id] = pid
            peerIds.push(pid)
          }
        }
        const uniqPeers = [...new Set(peerIds)]
        if (uniqPeers.length > 0) {
          const { data: profs } = await supabaseClient
            .from('profiles')
            .select('user_id, handle, display_name')
            .in('user_id', uniqPeers)
          const profById = Object.fromEntries((profs || []).map((p) => [p.user_id, p]))
          peerByRoom = Object.fromEntries(
            Object.entries(roomToPeer).map(([rid, uid]) => {
              const p = profById[uid]
              const label = p?.handle ? `@${String(p.handle).trim()}` : p?.display_name || 'Member'
              return [rid, label]
            })
          )
        }
      }
      const enriched = (roomRows || []).map((r) => {
        let label = r.title || r.slug || 'Chat'
        if (r.kind === 'dm') label = peerByRoom[r.id] ? `DM · ${peerByRoom[r.id]}` : 'Direct message'
        if (r.kind === 'channel') label = r.title ? `#${r.slug} · ${r.title}` : `#${r.slug}`
        if (r.kind === 'group') label = r.title || 'Group chat'
        return { ...r, listLabel: label }
      })
      enriched.sort((a, b) => String(a.listLabel).localeCompare(String(b.listLabel)))
      setRooms(enriched)
    } catch (e) {
      setRoomsErr(e?.message || 'Could not load chats.')
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  const loadMessages = useCallback(
    async (roomId) => {
      if (!roomId || !supabaseClient) {
        setMessages([])
        return
      }
      setMessagesErr('')
      setMessagesLoading(true)
      try {
        const { data, error } = await supabaseClient
          .from('chat_messages')
          .select('id, body, image_urls, sender_id, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        setMessages([...(data || [])].reverse())
      } catch (e) {
        setMessagesErr(e?.message || 'Could not load messages.')
        setMessages([])
      } finally {
        setMessagesLoading(false)
      }
    },
    [supabaseClient]
  )

  useEffect(() => {
    if (!activeRoomId) {
      setMessages([])
      return
    }
    void loadMessages(activeRoomId)
  }, [activeRoomId, loadMessages])

  useEffect(() => {
    if (!supabaseClient || !activeRoomId) return
    const ch = supabaseClient
      .channel(`chat-room-${activeRoomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })
        }
      )
      .subscribe()
    channelRef.current = ch
    return () => {
      void supabaseClient.removeChannel(ch)
      channelRef.current = null
    }
  }, [supabaseClient, activeRoomId])

  const openDmWithPeer = useCallback(
    async (peerId) => {
      if (!peerId) return
      setActionErr('')
      try {
        const res = await loungeChatInvoke(supabaseClient, { action: 'open_dm', peer_user_id: peerId })
        const rid = res?.room_id
        if (!rid) throw new Error('No room returned.')
        await loadRooms()
        setActiveRoomId(rid)
        setTab('inbox')
      } catch (e) {
        setActionErr(e?.message || 'Could not open DM.')
      }
    },
    [supabaseClient, loadRooms]
  )

  useEffect(() => {
    if (!initialPeerUserId) return
    void (async () => {
      await openDmWithPeer(initialPeerUserId)
      onClearInitialPeer?.()
    })()
  }, [initialPeerUserId, openDmWithPeer, onClearInitialPeer])

  const joinTopic = useCallback(
    async (slug) => {
      setActionErr('')
      try {
        const res = await loungeChatInvoke(supabaseClient, { action: 'join_channel', slug })
        const rid = res?.room_id
        if (!rid) throw new Error('Join failed.')
        await loadRooms()
        setActiveRoomId(rid)
        setTab('inbox')
      } catch (e) {
        setActionErr(e?.message || 'Could not join channel.')
      }
    },
    [supabaseClient, loadRooms]
  )

  const sendMessage = useCallback(async () => {
    const t = draft.trim()
    if (!activeRoomId || !t || sendBusy) return
    setSendBusy(true)
    setActionErr('')
    try {
      await loungeChatInvoke(supabaseClient, {
        action: 'send_message',
        room_id: activeRoomId,
        body: t,
      })
      setDraft('')
      await loadMessages(activeRoomId)
    } catch (e) {
      setActionErr(e?.message || 'Send failed.')
    } finally {
      setSendBusy(false)
    }
  }, [activeRoomId, draft, sendBusy, supabaseClient, loadMessages])

  const activeRoom = useMemo(() => rooms.find((r) => r.id === activeRoomId) || null, [rooms, activeRoomId])

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
            Topic rooms are for subscribers. Join opens the thread in Inbox.
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
                    disabled={!subscriberOk}
                    onClick={() => void joinTopic(c.slug)}
                    className="shrink-0 rounded-xl bg-violet-600 px-3 py-2 text-[13px] font-bold text-white touch-manipulation hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {subscriberOk ? 'Join' : 'Locked'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 max-h-[40vh] shrink-0 overflow-y-auto border-b border-zinc-800 px-2 py-2">
            {roomsLoading ? (
              <p className="px-2 py-2 text-[14px] text-zinc-500">Loading…</p>
            ) : roomsErr ? (
              <p className="px-2 py-2 text-[14px] text-rose-300">{roomsErr}</p>
            ) : rooms.length === 0 ? (
              <p className="px-2 py-2 text-[14px] leading-relaxed text-zinc-500">
                No conversations yet. Open someone&apos;s profile and tap Message, or join a topic.
              </p>
            ) : (
              <ul className="space-y-1">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setActiveRoomId(r.id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold touch-manipulation ${
                        activeRoomId === r.id ? 'bg-zinc-800 text-white' : 'text-zinc-200 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="line-clamp-2">{r.listLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {!activeRoomId ? (
              <div className="flex flex-1 items-center justify-center px-4 py-8">
                <p className="text-center text-[14px] text-zinc-500">Pick a chat or join a topic.</p>
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
                  <div className="text-[13px] font-bold text-zinc-300">{activeRoom?.listLabel || 'Chat'}</div>
                  {activeRoom?.subscriber_only ? (
                    <div className="text-[11px] text-amber-200/90">Subscriber room</div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {messagesLoading ? (
                    <p className="text-[14px] text-zinc-500">Loading messages…</p>
                  ) : messagesErr ? (
                    <p className="text-[14px] text-rose-300">{messagesErr}</p>
                  ) : messages.length === 0 ? (
                    <p className="text-[14px] text-zinc-500">No messages yet. Say hi.</p>
                  ) : (
                    <ul className="space-y-2">
                      {messages.map((m) => {
                        const mine = m.sender_id === viewerUserId
                        return (
                          <li
                            key={m.id}
                            className={`max-w-[92%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${
                              mine ? 'ml-auto bg-cyan-900/50 text-cyan-50' : 'mr-auto bg-zinc-800/90 text-zinc-100'
                            }`}
                          >
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 border-t border-zinc-800 p-2">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                      rows={2}
                      placeholder="Message…"
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-[16px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/45"
                    />
                    <button
                      type="button"
                      disabled={sendBusy || !draft.trim()}
                      onClick={() => void sendMessage()}
                      className="min-h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-[14px] font-bold text-white touch-manipulation hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
