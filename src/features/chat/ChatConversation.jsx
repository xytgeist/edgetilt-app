import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatBubble from './ChatBubble.jsx'
import ChatComposer from './ChatComposer.jsx'
import {
  chatSendMessage,
  chatDeleteMessage,
  chatAddReaction,
  chatRemoveReaction,
  chatUpdateLastRead,
  chatMuteRoom,
  chatUnmuteRoom,
  chatRoomIsMuted,
} from './chatApi.js'
import { subscribeToTyping } from './chatTypingBroadcast.js'
import { notifyLoungeDockSuppress } from '../lounge/loungeDockSuppressRegistry.js'

// Glass styles are defined in index.css as .chat-header-glass / .chat-menu-glass
// with html.light overrides — do not use inline styles for these.

const PAGE_SIZE = 50

/**
 * Max messages kept in the DOM at any time.
 * When the user loads older pages, we trim an equal number from the tail to
 * prevent unbounded memory growth in long-lived chat sessions.
 */
const MAX_DOM = 150

/**
 * Fetch a page of chat messages via the server-side RPC.
 * The RPC checks membership ONCE (not per row), avoiding the per-row RLS
 * EXISTS overhead of a direct table query.
 *
 * Falls back to a direct table query if the RPC doesn't exist yet
 * (migration not yet applied on this environment).
 */
async function fetchPage(supabaseClient, roomId, { beforeCreatedAt = null, beforeId = null, limit = PAGE_SIZE } = {}) {
  // Prefer the RPC — membership check once, no per-row RLS overhead
  const { data, error } = await supabaseClient.rpc('chat_messages_page', {
    p_room_id: roomId,
    p_limit: limit,
    p_before_created_at: beforeCreatedAt,
    p_before_id: beforeId,
  })
  if (!error) return data || []

  // RPC not yet available — fall back to direct table query (Phase 2 columns first)
  const buildDirect = (q) => {
    q = q.eq('room_id', roomId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    if (beforeCreatedAt) {
      q = q.or(`created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`)
    }
    return q
  }
  const { data: d2, error: e2 } = await buildDirect(
    supabaseClient.from('chat_messages').select('id, body, image_urls, sender_id, created_at, deleted_at, reply_to_message_id, reply_to_preview, reply_to_sender_id')
  )
  if (!e2) return d2 || []
  const { data: d3, error: e3 } = await buildDirect(
    supabaseClient.from('chat_messages').select('id, body, image_urls, sender_id, created_at')
  )
  if (e3) throw e3
  return d3 || []
}

/**
 * Full-screen conversation view for a single chat room.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   room: {
 *     id: string,
 *     kind: string,
 *     title?: string | null,
 *     slug?: string | null,
 *     dm_key?: string | null,
 *     peerLabel?: string | null,
 *     muted_until?: string | null,
 *   },
 *   viewerUserId: string,
 *   viewerProfile: { display_name?: string | null, handle?: string | null, avatar_url?: string | null } | null,
 *   profilesById: Record<string, { display_name?: string | null, handle?: string | null, avatar_url?: string | null }>,
 *   onBack: () => void,
 *   onViewProfile?: ((userId: string) => void) | null,
 * }} props
 */
export default function ChatConversation({
  supabaseClient,
  room,
  viewerUserId,
  viewerProfile,
  profilesById,
  onBack,
  onViewProfile = null,
}) {
  const [messages, setMessages] = useState(/** @type {any[]} */ ([]))
  // Aggregated reactions per message: { [messageId]: { emoji, count, viewerReacted }[] }
  const [reactions, setReactions] = useState(/** @type {Record<string, { emoji: string, count: number, viewerReacted: boolean }[]>} */ ({}))
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // hasMore: there are older messages to page back through
  const [hasMore, setHasMore] = useState(false)
  // hasNewer: the DOM tail was trimmed — user is viewing history, not live end
  const [hasNewer, setHasNewer] = useState(false)
  // newMsgCount: messages that arrived via Realtime while not at the live end
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [error, setError] = useState('')
  const [replyTarget, setReplyTarget] = useState(/** @type {any | null} */ (null))
  const [typingUsers, setTypingUsers] = useState(/** @type {{ userId: string, displayName: string }[]} */ ([]))
  const [muted, setMuted] = useState(() => chatRoomIsMuted(room.muted_until))
  const [muteMenuOpen, setMuteMenuOpen] = useState(false)
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false)

  // DOM refs
  const listRef = useRef(null)
  const atBottomRef = useRef(true)
  const typingRef = useRef(null)
  const lastReadDebounceRef = useRef(null)
  const composerBarRef = useRef(null)
  /** Android: bottom gap (px) to restore after swipe keyboard dismiss — shared with RO. */
  const keyboardDismissPreserveRef = useRef(/** @type {number | null} */ (null))
  const [composerBarH, setComposerBarH] = useState(80)

  // Swipe-to-reveal timestamps
  const translateLayerRef = useRef(null)
  const swipeGestureRef = useRef({ startX: 0, startY: 0, active: false, axis: /** @type {'x'|'y'|null} */ (null) })

  // Sync-refs — keep current values accessible in Realtime callbacks and
  // scroll handlers without capturing stale closures.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const hasMoreRef = useRef(false)
  const hasNewerRef = useRef(false)
  const loadingMoreRef = useRef(false)

  // Scroll position restoration after prepend.
  // Set didPrependRef = true + capture scrollHeight BEFORE calling setMessages,
  // then useLayoutEffect restores scrollTop after the DOM commits.
  const didPrependRef = useRef(false)
  const prependPrevScrollHeightRef = useRef(0)

  // Lazy sender profile cache — batch-fetches unknown sender_ids that aren't
  // in the profilesById prop (e.g. channel members beyond the room list load).
  const [localProfiles, setLocalProfiles] = useState(/** @type {Record<string, any>} */ ({}))
  const localProfilesRef = useRef(localProfiles)
  localProfilesRef.current = localProfiles
  const pendingProfileIdsRef = useRef(/** @type {Set<string>} */ (new Set()))
  const profileFetchTimerRef = useRef(null)

  // Realtime first-subscribe flag — used to distinguish initial connect from reconnect.
  const realtimeSubscribedOnceRef = useRef(false)

  useLayoutEffect(() => {
    if (didPrependRef.current && listRef.current) {
      const delta = listRef.current.scrollHeight - prependPrevScrollHeightRef.current
      listRef.current.scrollTop += delta
      didPrependRef.current = false
    }
  }, [messages])

  const viewerDisplayName = viewerProfile?.display_name || viewerProfile?.handle || 'You'

  // ── Reaction loader ───────────────────────────────────────────────────────

  const loadReactionsForMessages = useCallback(async (ids) => {
    if (!ids.length) return
    const { data } = await supabaseClient.rpc('chat_message_reactions_agg', {
      p_message_ids: ids,
      p_viewer_id: viewerUserId,
    })
    setReactions((prev) => {
      const next = { ...prev }
      for (const r of data || []) {
        if (!next[r.message_id]) next[r.message_id] = []
        const idx = next[r.message_id].findIndex((x) => x.emoji === r.emoji)
        const entry = { emoji: r.emoji, count: Number(r.reaction_count), viewerReacted: Boolean(r.viewer_reacted) }
        if (idx === -1) {
          next[r.message_id] = [...next[r.message_id], entry]
        } else {
          next[r.message_id] = next[r.message_id].map((x, i) => i === idx ? entry : x)
        }
      }
      return next
    })
  }, [supabaseClient, viewerUserId])

  // ── Suppress the Lounge dock FAB while this conversation is on screen ────
  // The dock portals to document.body and would otherwise float over the chat.
  // The title-bar nav icon calls temporaryRevealLoungeDock() to briefly surface it.
  useEffect(() => {
    notifyLoungeDockSuppress(true)
    return () => notifyLoungeDockSuppress(false)
  }, [])

  // ── Lazy sender profile resolution ───────────────────────────────────────
  // When messages arrive with a sender_id not in profilesById (e.g. channel
  // members beyond the room list), queue a batched profiles fetch (150ms window).

  useEffect(() => {
    const unknown = messages
      .map((m) => m.sender_id)
      .filter(
        (id) =>
          id &&
          id !== viewerUserId &&
          !profilesById[id] &&
          !localProfilesRef.current[id] &&
          !pendingProfileIdsRef.current.has(id)
      )
    if (unknown.length === 0) return

    for (const id of unknown) pendingProfileIdsRef.current.add(id)

    if (profileFetchTimerRef.current) clearTimeout(profileFetchTimerRef.current)
    profileFetchTimerRef.current = setTimeout(async () => {
      const ids = [...pendingProfileIdsRef.current]
      pendingProfileIdsRef.current.clear()
      if (!ids.length) return
      const { data } = await supabaseClient
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url')
        .in('user_id', [...new Set(ids)])
      if (data?.length) {
        setLocalProfiles((prev) => {
          const next = { ...prev }
          for (const p of data) next[p.user_id] = p
          return next
        })
      }
    }, 150)
  }, [messages, viewerUserId, profilesById, supabaseClient])

  // ── Initial load (and reload-to-latest) ──────────────────────────────────

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchPage(supabaseClient, room.id)
      const ordered = [...rows].reverse()
      setMessages(ordered)
      const hm = rows.length === PAGE_SIZE
      setHasMore(hm)
      hasMoreRef.current = hm
      hasNewerRef.current = false
      setHasNewer(false)
      setNewMsgCount(0)
      if (ordered.length > 0) {
        await loadReactionsForMessages(ordered.map((m) => m.id))
      }
    } catch (e) {
      setError(e?.message || 'Could not load messages.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, room.id, loadReactionsForMessages])

  useEffect(() => { void loadMessages() }, [loadMessages])

  // Scroll to bottom once initial load resolves
  useEffect(() => {
    if (!loading) scrollToBottom('instant')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load older messages (prepend) ─────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || messagesRef.current.length === 0) return

    const oldest = messagesRef.current[0]
    if (!oldest?.created_at) return

    loadingMoreRef.current = true
    setLoadingMore(true)

    // Capture scroll height before mutation so we can restore position after prepend
    if (listRef.current) {
      prependPrevScrollHeightRef.current = listRef.current.scrollHeight
      didPrependRef.current = true
    }

    try {
      // Composite cursor: (created_at, id) prevents skipping messages at identical timestamps
      const rows = await fetchPage(supabaseClient, room.id, {
        beforeCreatedAt: oldest.created_at,
        beforeId: oldest.id,
      })

      const ordered = [...rows].reverse()
      const newHasMore = rows.length === PAGE_SIZE
      setHasMore(newHasMore)
      hasMoreRef.current = newHasMore

      if (ordered.length === 0) {
        didPrependRef.current = false
        return
      }

      // Deduplicate against what's already in the DOM
      const existingIds = new Set(messagesRef.current.map((m) => m.id))
      const fresh = ordered.filter((r) => !existingIds.has(r.id))

      if (fresh.length === 0) {
        didPrependRef.current = false
        return
      }

      const combined = [...fresh, ...messagesRef.current]

      if (combined.length > MAX_DOM) {
        // Cap the DOM — trim from the tail (newest end) since we just loaded older
        if (!hasNewerRef.current) {
          hasNewerRef.current = true
          setHasNewer(true)
        }
        setMessages(combined.slice(0, MAX_DOM))
      } else {
        setMessages(combined)
      }

      await loadReactionsForMessages(fresh.map((m) => m.id))
    } catch {
      didPrependRef.current = false
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [supabaseClient, room.id, loadReactionsForMessages])

  // ── Jump to live end ──────────────────────────────────────────────────────
  // Called from the "N new messages ↓" banner when hasNewer is true.

  const jumpToLatest = useCallback(() => {
    setNewMsgCount(0)
    void loadMessages()
  }, [loadMessages])

  // ── Realtime subscription + reconnect gap recovery ────────────────────────

  useEffect(() => {
    const ch = supabaseClient
      .channel(`chat-messages-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const row = payload.new
          if (!row?.id) return

          if (hasNewerRef.current) {
            // User is viewing old history — tail was trimmed. Don't append,
            // just bump the "jump to latest" banner count.
            setNewMsgCount((n) => n + 1)
            return
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })

          if (atBottomRef.current) {
            requestAnimationFrame(() => scrollToBottom('smooth'))
          } else {
            setNewMsgCount((n) => n + 1)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          setMessages((prev) => prev.map((m) => m.id === row.id ? { ...m, ...row } : m))
        }
      )
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return

        if (!realtimeSubscribedOnceRef.current) {
          // First connect — initial loadMessages already covers this.
          realtimeSubscribedOnceRef.current = true
          return
        }

        // ── Reconnect: fetch messages we missed while the socket was down ──
        // Skip if user is viewing trimmed history — the banner already handles it.
        if (hasNewerRef.current) return

        const msgs = messagesRef.current
        const last = msgs.filter((m) => !m.id.startsWith('opt-')).at(-1)
        if (!last?.id) return

        try {
          const { data } = await supabaseClient.rpc('chat_messages_page', {
            p_room_id: room.id,
            p_limit: 50,
            p_after_created_at: last.created_at,
            p_after_id: last.id,
          })
          const missed = (data || []).filter(
            (r) => !messagesRef.current.some((m) => m.id === r.id)
          )
          if (missed.length === 0) return

          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const fresh = missed.filter((r) => !existingIds.has(r.id))
            return fresh.length > 0 ? [...prev, ...fresh] : prev
          })

          if (atBottomRef.current) {
            requestAnimationFrame(() => scrollToBottom('smooth'))
          } else {
            setNewMsgCount((n) => n + missed.length)
          }
        } catch {
          // Reconnect catchup failure is non-fatal — user can manually refresh.
        }
      })
    return () => {
      supabaseClient.removeChannel(ch)
      realtimeSubscribedOnceRef.current = false
    }
  }, [supabaseClient, room.id])

  // ── Typing broadcast ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!viewerUserId) return
    const { emit, cleanup } = subscribeToTyping(
      supabaseClient,
      room.id,
      viewerUserId,
      setTypingUsers
    )
    typingRef.current = emit
    return cleanup
  }, [supabaseClient, room.id, viewerUserId])

  // ── Read receipt — debounced, never for optimistic ids ───────────────────

  const scheduleMarkLastRead = useCallback(() => {
    const msgs = messagesRef.current
    if (!viewerUserId || msgs.length === 0 || !atBottomRef.current) return
    const last = msgs[msgs.length - 1]
    if (!last?.id || last.id.startsWith('opt-')) return
    if (lastReadDebounceRef.current) clearTimeout(lastReadDebounceRef.current)
    lastReadDebounceRef.current = setTimeout(() => {
      void chatUpdateLastRead(supabaseClient, room.id, last.id).catch(() => {})
    }, 2000)
  }, [supabaseClient, room.id, viewerUserId])

  useEffect(() => { scheduleMarkLastRead() }, [messages, scheduleMarkLastRead])

  // Flush on unmount so we don't lose read position
  useEffect(() => {
    return () => {
      if (lastReadDebounceRef.current) {
        clearTimeout(lastReadDebounceRef.current)
        const msgs = messagesRef.current
        const last = msgs[msgs.length - 1]
        if (last?.id && !last.id.startsWith('opt-') && viewerUserId) {
          void chatUpdateLastRead(supabaseClient, room.id, last.id).catch(() => {})
        }
      }
    }
  }, [supabaseClient, room.id, viewerUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll helpers ────────────────────────────────────────────────────────

  const scrollToBottom = (behavior = 'instant') => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    // Trigger older-message load when within 200px of the top
    if (el.scrollTop < 200) void loadMore()
    if (atBottomRef.current) {
      setNewMsgCount(0)
      scheduleMarkLastRead()
    }
  }, [loadMore, scheduleMarkLastRead])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(async ({ body, imageUrls, replyToMessageId }) => {
    // If user is viewing history, jump to live end before sending
    if (hasNewerRef.current) {
      await new Promise((resolve) => {
        hasNewerRef.current = false
        setHasNewer(false)
        setNewMsgCount(0)
        void loadMessages().then(resolve)
      })
    }

    const origMsg = replyToMessageId
      ? messagesRef.current.find((m) => m.id === replyToMessageId)
      : null
    const replyPreview = origMsg?.body
      ? origMsg.body.slice(0, 80) + (origMsg.body.length > 80 ? '…' : '')
      : origMsg?.image_urls?.length > 0 ? '[image]' : null

    const tempId = `opt-${Date.now()}`
    const optimistic = {
      id: tempId,
      body,
      image_urls: imageUrls,
      sender_id: viewerUserId,
      created_at: new Date().toISOString(),
      deleted_at: null,
      reply_to_message_id: replyToMessageId || null,
      reply_to_preview: replyPreview,
      reply_to_sender_id: origMsg?.sender_id || null,
    }
    setMessages((prev) => [...prev, optimistic])
    requestAnimationFrame(() => scrollToBottom('smooth'))

    try {
      const res = await chatSendMessage(supabaseClient, { roomId: room.id, body, imageUrls, replyToMessageId })
      if (res?.message_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message_id)) {
            return prev.filter((m) => m.id !== tempId)
          }
          return prev.map((m) => m.id === tempId ? { ...optimistic, id: res.message_id } : m)
        })
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    }
  }, [supabaseClient, room.id, viewerUserId, loadMessages])

  const handleDelete = useCallback(async (messageId) => {
    await chatDeleteMessage(supabaseClient, messageId)
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, deleted_at: new Date().toISOString(), body: '' } : m)
    )
  }, [supabaseClient])

  const handleAddReaction = useCallback(async (messageId, emoji) => {
    setReactions((prev) => {
      const list = prev[messageId] || []
      const existing = list.find((r) => r.emoji === emoji)
      if (existing?.viewerReacted) return prev
      if (existing) {
        return { ...prev, [messageId]: list.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, viewerReacted: true } : r) }
      }
      return { ...prev, [messageId]: [...list, { emoji, count: 1, viewerReacted: true }] }
    })
    await chatAddReaction(supabaseClient, messageId, emoji).catch(() => {
      setReactions((prev) => {
        const list = prev[messageId] || []
        const existing = list.find((r) => r.emoji === emoji)
        if (!existing) return prev
        if (existing.count <= 1) return { ...prev, [messageId]: list.filter((r) => r.emoji !== emoji) }
        return { ...prev, [messageId]: list.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, viewerReacted: false } : r) }
      })
    })
  }, [supabaseClient])

  const handleRemoveReaction = useCallback(async (messageId, emoji) => {
    setReactions((prev) => {
      const list = prev[messageId] || []
      return {
        ...prev,
        [messageId]: list
          .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, viewerReacted: false } : r)
          .filter((r) => r.count > 0),
      }
    })
    await chatRemoveReaction(supabaseClient, messageId, emoji).catch(() => {
      setReactions((prev) => {
        const list = prev[messageId] || []
        const existing = list.find((r) => r.emoji === emoji)
        if (existing) {
          return { ...prev, [messageId]: list.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, viewerReacted: true } : r) }
        }
        return { ...prev, [messageId]: [...list, { emoji, count: 1, viewerReacted: true }] }
      })
    })
  }, [supabaseClient])

  const handleToggleMute = useCallback(async () => {
    if (muted) {
      setMuted(false)
      setMuteMenuOpen(false)
      await chatUnmuteRoom(supabaseClient, room.id).catch(() => setMuted(true))
    } else {
      setMuteMenuOpen(true)
    }
  }, [muted, supabaseClient, room.id])

  const handleMuteFor = useCallback(async (hours) => {
    setMuted(true)
    setMuteMenuOpen(false)
    await chatMuteRoom(supabaseClient, room.id, hours).catch(() => setMuted(false))
  }, [supabaseClient, room.id])

  // ── Sender label helpers ──────────────────────────────────────────────────

  const senderLabel = useCallback((senderId) => {
    if (senderId === viewerUserId) return 'You'
    const p = profilesById[senderId] || localProfiles[senderId]
    return p?.handle ? `@${p.handle}` : p?.display_name || 'Member'
  }, [profilesById, localProfiles, viewerUserId])

  const senderAvatarUrl = useCallback((senderId) => {
    if (senderId === viewerUserId) return viewerProfile?.avatar_url || null
    return (profilesById[senderId] || localProfiles[senderId])?.avatar_url || null
  }, [profilesById, localProfiles, viewerUserId, viewerProfile])

  const roomTitle = room.peerLabel || room.title || (room.slug ? `#${room.slug}` : 'Chat')

  // ── Swipe-to-reveal timestamps ────────────────────────────────────────────
  // Direct DOM manipulation — no React re-renders during the gesture.
  // iOS-style: drag the message list left to slide timestamps in from the right.
  const MAX_SWIPE_PX = 76 // must match `right: -76px` in ChatBubble

  const handleSwipeTouchStart = useCallback((e) => {
    const t = e.touches[0]
    swipeGestureRef.current = { startX: t.clientX, startY: t.clientY, active: true, axis: null }
    if (translateLayerRef.current) {
      translateLayerRef.current.style.transition = ''
    }
  }, [])

  const handleSwipeTouchMove = useCallback((e) => {
    const g = swipeGestureRef.current
    if (!g.active) return
    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY

    if (!g.axis) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        g.axis = 'x'
      } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
        g.axis = 'y'
        g.active = false
      }
      return
    }

    if (g.axis !== 'x') return

    // Left-only swipe, clamp to max reveal distance
    const clamped = Math.max(-MAX_SWIPE_PX, Math.min(0, dx))
    if (translateLayerRef.current) {
      translateLayerRef.current.style.transform = `translateX(${clamped}px)`
    }
  }, [])

  const handleSwipeTouchEnd = useCallback(() => {
    swipeGestureRef.current.active = false
    swipeGestureRef.current.axis = null
    if (translateLayerRef.current) {
      translateLayerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.33,1,0.45,1)'
      translateLayerRef.current.style.transform = 'translateX(0)'
    }
  }, [])

  // ── Peer info for DM header ───────────────────────────────────────────────
  const peerUserId      = room.kind === 'dm' ? (room.peer_user_id ?? null) : null
  const peerProfile     = peerUserId ? (profilesById[peerUserId] || localProfiles[peerUserId] || null) : null
  const peerAvatar      = peerProfile?.avatar_url || room.peer_avatar_url || null
  const peerDisplayName = peerProfile?.display_name || room.peer_display_name || roomTitle
  const peerHandle      = peerProfile?.handle ? `@${peerProfile.handle}` : null
  const peerInitial     = (peerDisplayName || '?').replace(/^@/, '')[0]?.toUpperCase() || '?'
  // Extra top padding for DM header (tall: avatar + pill); channel is shorter
  // Track composer bar height so the scroll list can pad its bottom
  useEffect(() => {
    const el = composerBarRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setComposerBarH(entry.contentRect.height + 16)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Android + resizes-content: when the keyboard opens/closes the list height
  // changes — keep newest messages pinned above the composer (iOS unchanged).
  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent)) return
    const container = listRef.current
    if (!container) return
    let prevH = container.clientHeight

    const ro = new ResizeObserver(() => {
      const h = container.clientHeight
      const growing = h > prevH
      const tag = document.activeElement?.tagName
      const inputFocused = tag === 'TEXTAREA' || tag === 'INPUT'
      const preservedGap = keyboardDismissPreserveRef.current
      if (growing && preservedGap != null) {
        container.scrollTop = container.scrollHeight - container.clientHeight - preservedGap
      } else if (growing || (h < prevH && (atBottomRef.current || inputFocused))) {
        container.scrollTop = container.scrollHeight
      }
      prevH = h
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Swipe-down-to-dismiss keyboard — independent of the timestamp-swipe logic.
  // Android: lock scroll at thread tail during dismiss + preserve reading position.
  // iOS: block list scroll on downward drag, blur early on touchmove (first swipe dismisses).
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const isAndroid = /Android/i.test(navigator.userAgent)
    /** Touchend fallback when touchmove did not already blur (quick flick). */
    const dismissDyPx = isAndroid ? 50 : 18
    let startY = 0
    let startX = 0
    let startScrollTop = 0
    let keyboardWasOpen = false
    let dismissActive = false
    let dismissedThisGesture = false

    const bottomGap = () => el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = () => bottomGap() < 80

    const restorePreservedScroll = () => {
      const gap = keyboardDismissPreserveRef.current
      if (gap == null) return
      el.scrollTop = el.scrollHeight - el.clientHeight - gap
    }

    /** Android: re-apply preserved gap while the keyboard animates closed. */
    const schedulePreserveRestore = () => {
      const vv = window.visualViewport
      let timer = null
      const run = () => {
        clearTimeout(timer)
        timer = setTimeout(restorePreservedScroll, 50)
      }
      run()
      if (vv) {
        vv.addEventListener('resize', run)
        setTimeout(() => {
          vv.removeEventListener('resize', run)
          clearTimeout(timer)
          restorePreservedScroll()
          keyboardDismissPreserveRef.current = null
        }, 400)
      } else {
        setTimeout(() => { keyboardDismissPreserveRef.current = null }, 400)
      }
    }

    /** iOS: instant snap after keyboard close — smooth scroll while keyboard is up causes jank. */
    const snapBottomAfterKeyboardCloseIOS = () => {
      atBottomRef.current = true
      const vv = window.visualViewport
      const snap = () => { el.scrollTop = el.scrollHeight }
      if (vv) {
        vv.addEventListener('resize', snap)
        snap()
        setTimeout(() => {
          vv.removeEventListener('resize', snap)
          snap()
        }, 400)
      } else {
        requestAnimationFrame(snap)
      }
    }

    const onStart = (e) => {
      dismissActive = false
      dismissedThisGesture = false
      startScrollTop = el.scrollTop
      startY = e.touches[0]?.clientY ?? 0
      startX = e.touches[0]?.clientX ?? 0
      const tag = document.activeElement?.tagName
      keyboardWasOpen = tag === 'TEXTAREA' || tag === 'INPUT'
    }

    const onMove = (e) => {
      if (!keyboardWasOpen) return
      const t = e.touches[0]
      if (!t) return
      const dy = t.clientY - startY
      const dx = t.clientX - startX

      if (isAndroid) {
        if (!dismissActive) {
          if (dy > 10 && dy > Math.abs(dx) && nearBottom()) {
            dismissActive = true
          } else {
            return
          }
        }
        e.preventDefault()
        el.scrollTop = startScrollTop
        return
      }

      // iOS: downward drag while keyboard is open → dismiss, not list scroll
      if (dy <= 8 || dy <= Math.abs(dx)) return
      e.preventDefault()
      el.scrollTop = startScrollTop
      if (!dismissedThisGesture && dy > 10) {
        dismissedThisGesture = true
        document.activeElement?.blur?.()
      }
    }

    const onEnd = (e) => {
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startY
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX
      const downwardDismiss = isAndroid
        ? dy > dismissDyPx
        : dy > dismissDyPx && dy > Math.abs(dx)

      if (isAndroid && downwardDismiss && keyboardWasOpen) {
        document.activeElement?.blur?.()
        keyboardDismissPreserveRef.current = bottomGap()
        schedulePreserveRestore()
      } else if (!isAndroid && keyboardWasOpen && (dismissedThisGesture || downwardDismiss)) {
        if (!dismissedThisGesture) document.activeElement?.blur?.()
        snapBottomAfterKeyboardCloseIOS()
      }

      dismissActive = false
      dismissedThisGesture = false
      keyboardWasOpen = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const listPaddingTop  = room.kind === 'dm'
    ? 'calc(env(safe-area-inset-top, 0px) + 11rem)'
    : 'calc(env(safe-area-inset-top, 0px) + 4.5rem)'
  return (
    <div className="relative overflow-hidden bg-zinc-950" style={{ height: '100dvh' }} data-chat-feature>

      {/* ── Floating overlay header ─────────────────────────────────────────── */}
      {/* Single flex row — items-start so button tops align with avatar top */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-3 pb-4 pt-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="chat-header-glass shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Center — avatar + pill for DMs; plain title for channels */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          {room.kind === 'dm' ? (
            <>
              {peerAvatar ? (
                <img
                  src={peerAvatar}
                  alt={peerDisplayName}
                  className="relative z-10 h-16 w-16 rounded-full object-cover shadow-lg ring-2 ring-white/20"
                />
              ) : (
                <div className="relative z-10 grid h-16 w-16 place-items-center rounded-full bg-zinc-700 text-[22px] font-bold text-zinc-300 shadow-lg ring-2 ring-white/15">
                  {peerInitial}
                </div>
              )}
              <button
                type="button"
                onClick={() => peerUserId && onViewProfile?.(peerUserId)}
                disabled={!peerUserId || !onViewProfile}
              className="chat-header-glass -mt-1 flex items-center gap-1 rounded-full px-4 py-1.5 touch-manipulation transition-opacity active:opacity-75"
              aria-label={peerUserId ? `View ${peerDisplayName}'s profile` : undefined}
            >
              <span className="text-[16px] font-bold text-zinc-50">{peerDisplayName}</span>
              {peerUserId && <span className="text-[15px] font-normal text-zinc-300">›</span>}
              </button>
            </>
          ) : (
            <div className="flex h-10 items-center">
              <span className="text-[15px] font-semibold text-zinc-100">{roomTitle}</span>
            </div>
          )}
        </div>

        {/* Options button */}
        <button
          type="button"
          onClick={() => setOptionsMenuOpen(true)}
          aria-label="Chat options"
          className="chat-header-glass shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5"  r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {/* ── Options menu (portal so it escapes stacking context) ───────────── */}
      {optionsMenuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[118]" onClick={() => setOptionsMenuOpen(false)} />
          <div
            className="chat-menu-glass fixed z-[119] w-[220px] overflow-hidden rounded-2xl"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)', right: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* View profile — DMs only */}
            {peerUserId && onViewProfile && (
              <>
                <OptionsRow
                  label="View Profile"
                  icon={<PersonIcon />}
                  onClick={() => { setOptionsMenuOpen(false); onViewProfile(peerUserId) }}
                />
                <OptionsDivider />
              </>
            )}

            {/* Mute / Unmute */}
            <OptionsRow
              label={muted ? 'Unmute' : 'Mute'}
              icon={muted ? <UnmuteIcon /> : <MuteIcon />}
              onClick={() => { setOptionsMenuOpen(false); handleToggleMute() }}
            />

            <OptionsDivider />

            {/* Report (stub) */}
            <OptionsRow
              label="Report"
              icon={<FlagOptionsIcon />}
              dim
              onClick={() => setOptionsMenuOpen(false)}
            />
          </div>
        </>,
        document.body
      )}

      {/* ── Main content: full-screen scroll area + floating composer overlay ── */}
      <div className="absolute inset-0">

      {/* Mute duration picker */}
      {muteMenuOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center pb-6"
          onClick={() => setMuteMenuOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700/50 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pb-1 pt-4 text-[13px] font-semibold text-zinc-500">Mute notifications for</div>
            {[
              { label: '1 hour', hours: 1 },
              { label: '8 hours', hours: 8 },
              { label: '24 hours', hours: 24 },
              { label: 'Indefinitely', hours: 0 },
            ].map(({ label, hours }) => (
              <button
                key={label}
                type="button"
                onClick={() => void handleMuteFor(hours)}
                className="flex w-full items-center px-5 py-4 text-[15px] font-semibold text-zinc-100 touch-manipulation hover:bg-zinc-800/60"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMuteMenuOpen(false)}
              className="flex w-full items-center justify-center rounded-b-2xl border-t border-zinc-800 px-5 py-4 text-[15px] text-zinc-400 touch-manipulation hover:bg-zinc-800/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message list — fills the full screen; bottom padding tracks composer height */}
      <div className="absolute inset-0">
        {/* Top gradient — fades/darkens messages toward the header so floating UI pops */}
        <div
          className="chat-top-gradient pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{ height: listPaddingTop }}
        />

        <div
          ref={listRef}
          onScroll={handleScroll}
          onTouchStart={handleSwipeTouchStart}
          onTouchMove={handleSwipeTouchMove}
          onTouchEnd={handleSwipeTouchEnd}
          onTouchCancel={handleSwipeTouchEnd}
          className="h-full overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3"
          style={{ touchAction: 'pan-y', paddingTop: listPaddingTop, paddingBottom: composerBarH }}
        >
          {loadingMore && (
            <div className="py-2 text-center text-[12px] text-zinc-600">Loading older messages…</div>
          )}

          {loading ? (
            <div className="flex h-full items-center justify-center text-[14px] text-zinc-500">Loading…</div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-[14px] text-rose-400">{error}</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-zinc-500">
              No messages yet. Say hi! 👋
            </div>
          ) : (
            <div ref={translateLayerRef} className="space-y-3 pb-2 will-change-transform">
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  senderLabel={senderLabel(msg.sender_id)}
                  senderAvatarUrl={senderAvatarUrl(msg.sender_id)}
                  isMine={msg.sender_id === viewerUserId}
                  reactions={reactions[msg.id] || []}
                  viewerUserId={viewerUserId}
                  hideSenderInfo={room.kind === 'dm'}
                  onReply={setReplyTarget}
                  onDeleteMessage={handleDelete}
                  onAddReaction={handleAddReaction}
                  onRemoveReaction={handleRemoveReaction}
                />
              ))}
            </div>
          )}
        </div>

        {/* "N new messages ↓" banner — shown when scrolled up or viewing trimmed history */}
        {(newMsgCount > 0 || hasNewer) && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-cyan-500/40 bg-zinc-900/95 px-4 py-2 text-[13px] font-semibold text-cyan-300 shadow-lg backdrop-blur-sm touch-manipulation hover:bg-zinc-800 active:scale-95 transition-transform"
          >
            {newMsgCount > 0 ? `↓ ${newMsgCount} new message${newMsgCount === 1 ? '' : 's'}` : '↓ Jump to latest'}
          </button>
        )}
      </div>

      </div>{/* end main scroll area */}

      {/* ── Floating composer overlay — no background, sits above the message list ── */}
      <div
        ref={composerBarRef}
        className="absolute inset-x-0 bottom-0 z-20 pointer-events-none"
      >
        <div className="pointer-events-auto">
          {typingUsers.length > 0 && (
            <div className="px-6 pb-1 text-[12px] text-zinc-500">
              {typingUsers.length === 1
                ? `${typingUsers[0].displayName} is typing…`
                : `${typingUsers.map((u) => u.displayName).join(', ')} are typing…`}
            </div>
          )}
          <ChatComposer
            supabaseClient={supabaseClient}
            viewerUserId={viewerUserId}
            replyTarget={replyTarget}
            onClearReply={() => setReplyTarget(null)}
            onSend={handleSend}
            onTyping={(name) => typingRef.current?.(name)}
            viewerDisplayName={viewerDisplayName}
          />
        </div>
      </div>
    </div>
  )
}

// ── Options menu helpers ────────────────────────────────────────────────────

function OptionsRow({ label, icon, onClick, dim = false, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-[15px] font-semibold touch-manipulation transition-colors active:bg-white/10 ${
        danger ? 'text-rose-400' : dim ? 'text-zinc-500' : 'text-zinc-100'
      }`}
    >
      <span className="shrink-0 opacity-75">{icon}</span>
      {label}
    </button>
  )
}

function OptionsDivider() {
  return <div className="mx-4 h-px bg-white/10" />
}

const OS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }

function PersonIcon()    { return <svg {...OS}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function MuteIcon()      { return <svg {...OS}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
function UnmuteIcon()    { return <svg {...OS}><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> }
function FlagOptionsIcon() { return <svg {...OS}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> }
