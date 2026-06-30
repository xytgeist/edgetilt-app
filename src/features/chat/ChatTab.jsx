import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import QuickLinkPageToggle from '../../components/QuickLinkPageToggle.jsx'
import ChatConversation from './ChatConversation.jsx'
import ChatGroupHeaderStack from './ChatGroupHeaderStack.jsx'
import {
  chatOpenDm,
  chatCreateGroup,
  chatMarkUnread,
  chatPinRoom,
  chatUnpinRoom,
  chatLeaveRoom,
  chatMuteRoom,
  chatUnmuteRoom,
  chatRoomLabel,
  chatRoomIsMuted,
  chatGroupHeaderMembersBatch,
  enrichChatRoomRow,
  chatFetchRoomForViewer,
  chatSetReadReceiptsEnabled,
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
 *   onViewProfile?: ((userId: string) => void) | null,
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
  onViewProfile = null,
}) {
  const [viewerUserId, setViewerUserId] = useState('')
  const [viewerProfile, setViewerProfile] = useState(null)
  const [viewerReadReceiptsEnabled, setViewerReadReceiptsEnabled] = useState(true)
  const [readReceiptsToggleBusy, setReadReceiptsToggleBusy] = useState(false)
  const [rooms, setRooms] = useState(/** @type {any[]} */ ([]))
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsErr, setRoomsErr] = useState('')
  const [activeRoomId, setActiveRoomId] = useState(/** @type {string | null} */ (null))
  const [iosResumeCount, setIosResumeCount] = useState(0)
  const [tab, setTab] = useState(/** @type {'inbox' | 'topics'} */ ('inbox'))
  const [actionErr, setActionErr] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(/** @type {any[]} */ ([]))
  const [searchBusy, setSearchBusy] = useState(false)
  const searchTimerRef = useRef(null)

  // Long-press context menu on room rows
  const [roomMenu, setRoomMenu] = useState(/** @type {{ room: any, y: number, x: number } | null} */ (null))
  const inboxRootRef = useRef(null)
  const showInboxList = browseMode !== 'anonymous' && !activeRoomId

  // Group creation
  const [showGroupCreate, setShowGroupCreate] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')
  const [groupMembers, setGroupMembers] = useState(/** @type {any[]} */ ([]))
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSearchResults, setGroupSearchResults] = useState(/** @type {any[]} */ ([]))
  const [groupSearchBusy, setGroupSearchBusy] = useState(false)
  const groupSearchTimerRef = useRef(null)
  const [groupHeaderByRoomId, setGroupHeaderByRoomId] = useState(/** @type {Record<string, any[]>} */ ({}))
  /** Room metadata when opening by id before/without inbox row (dock deep-link). */
  const [hydratedOpenRoom, setHydratedOpenRoom] = useState(/** @type {any | null} */ (null))
  const [hydrateOpenRoomDone, setHydrateOpenRoomDone] = useState(false)
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const profilesCacheRef = useRef({})

  const subscriberOk = Boolean(hasActiveSubscription || isStaff)

  // On iOS, app resume with the keyboard open can corrupt the visual viewport layout.
  // Force a full remount of the conversation by bumping the key.
  useEffect(() => {
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (!isIos || !activeRoomId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') setIosResumeCount((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeRoomId])

  // Inbox: block native text selection during long-press (same approach as ChatConversation).
  useEffect(() => {
    if (!showInboxList) return
    const { style } = document.body
    style.webkitUserSelect = 'none'
    style.userSelect = 'none'
    style.webkitTouchCallout = 'none'
    return () => {
      style.webkitUserSelect = ''
      style.userSelect = ''
      style.webkitTouchCallout = ''
    }
  }, [showInboxList])

  useEffect(() => {
    if (!showInboxList) return
    const chatRoot = inboxRootRef.current

    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const anchor = sel.anchorNode
      if (chatRoot && anchor && chatRoot.contains(anchor)) {
        sel.removeAllRanges()
        return
      }
      // Portaled room menu is outside [data-chat-feature].
      if (roomMenu && anchor && document.body.contains(anchor)) {
        sel.removeAllRanges()
      }
    }

    const onContextMenu = (e) => {
      const t = e.target
      if (chatRoot && t instanceof Node && chatRoot.contains(t)) {
        e.preventDefault()
      }
    }

    document.addEventListener('selectionchange', onSelChange)
    document.addEventListener('contextmenu', onContextMenu, { passive: false })
    return () => {
      document.removeEventListener('selectionchange', onSelChange)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [showInboxList, roomMenu])

  useEffect(() => {
    if (roomMenu) window.getSelection()?.removeAllRanges()
  }, [roomMenu])

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
        .select('user_id, handle, display_name, avatar_url, chat_read_receipts_enabled')
        .eq('user_id', uid)
        .maybeSingle()
      if (prof) {
        setViewerProfile(prof)
        setViewerReadReceiptsEnabled(prof.chat_read_receipts_enabled !== false)
      }
    })()
  }, [supabaseClient])

  const handleViewerReadReceiptsChange = useCallback(async (enabled) => {
    if (!viewerUserId || !supabaseClient) return
    setReadReceiptsToggleBusy(true)
    try {
      await chatSetReadReceiptsEnabled(supabaseClient, viewerUserId, enabled)
      setViewerReadReceiptsEnabled(enabled)
      setViewerProfile((prev) => (prev ? { ...prev, chat_read_receipts_enabled: enabled } : prev))
    } catch (e) {
      setActionErr(e?.message || 'Could not update read receipts.')
    } finally {
      setReadReceiptsToggleBusy(false)
    }
  }, [viewerUserId, supabaseClient])

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
      // Single RPC - replaces 3 sequential client-side queries
      const { data, error } = await supabaseClient.rpc('chat_rooms_for_user', {
        p_user_id: viewerUserId,
      })
      if (error) throw error

      const enriched = (data || []).map((r) => {
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
            ...profilesCacheRef.current[r.last_message_sender_id],
            user_id: r.last_message_sender_id,
            handle: r.sender_handle,
            display_name: r.sender_display_name,
          }
        }
        return enrichChatRoomRow(r, viewerUserId)
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
      setRoomsErr(e?.message || 'Could not load conversations.')
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  // ── Realtime - refresh inbox on new messages + group room updates ───────────
  // postgres_changes is filtered by RLS, so only rows the viewer can SELECT
  // come through.
  // • chat_messages INSERT  → refresh unread badge, preview, timestamp
  // • chat_rooms UPDATE     → refresh group photo / name / description for all
  //   members immediately (requires chat_rooms in supabase_realtime publication
  //   - migration 20260603160000_chat_group_full_repair.sql adds it)
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return
    const channel = supabaseClient
      .channel(`chat-inbox-${viewerUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => { void loadRooms() },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_rooms' },
        () => { void loadRooms() },
      )
      .subscribe()
    return () => { void supabaseClient.removeChannel(channel) }
  }, [supabaseClient, viewerUserId, loadRooms])

  // ── Handle initialPeerUserId (from profile Message tap) ──────────────────
  // Use a ref so we don't re-fire when loadRooms/supabaseClient identity changes.
  const handledPeerRef = useRef(/** @type {string|null} */ (null))

  useEffect(() => {
    // Wait until both the intent and the viewer session are ready,
    // and only fire once per distinct peerUserId value.
    if (!initialPeerUserId || !viewerUserId || !supabaseClient) return
    if (handledPeerRef.current === initialPeerUserId) return
    handledPeerRef.current = initialPeerUserId
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
  }, [initialPeerUserId, viewerUserId, supabaseClient, onInitialPeerConsumed, loadRooms])

  // ── Handle initialRoomId (from deep link / push tap) ─────────────────────

  useEffect(() => {
    if (!initialRoomId || !viewerUserId || !supabaseClient) return
    let cancelled = false
    void (async () => {
      await loadRooms()
      if (cancelled) return
      setActiveRoomId(initialRoomId)
      onInitialRoomConsumed?.()
    })()
    return () => { cancelled = true }
  }, [initialRoomId, viewerUserId, supabaseClient, loadRooms, onInitialRoomConsumed])

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

  // ── User search (new DM) ─────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      if (!supabaseClient) return
      setSearchBusy(true)
      try {
        const term = q.replace(/^@/, '')
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url, role')
          .is('banned_at', null)
          .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
          .neq('user_id', viewerUserId)
          .limit(8)
        if (error) throw error
        setSearchResults(data || [])
      } catch { setSearchResults([]) }
      finally { setSearchBusy(false) }
    }, 200)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, supabaseClient, viewerUserId])

  const startDmFromSearch = useCallback(async (userId) => {
    setSearchQuery('')
    setSearchResults([])
    setActionErr('')
    setActionBusy(true)
    try {
      const res = await chatOpenDm(supabaseClient, userId)
      if (res?.room_id) {
        await loadRooms()
        setActiveRoomId(res.room_id)
        setTab('inbox')
      }
    } catch (e) {
      setActionErr(e?.message || 'Could not open conversation.')
    } finally {
      setActionBusy(false)
    }
  }, [supabaseClient, loadRooms])

  const openDmWithUser = useCallback(async (userId) => {
    if (!userId) return
    setActionErr('')
    setActionBusy(true)
    try {
      const res = await chatOpenDm(supabaseClient, userId)
      if (res?.room_id) {
        await loadRooms()
        setActiveRoomId(res.room_id)
      }
    } catch (e) {
      setActionErr(e?.message || 'Could not open conversation.')
    } finally {
      setActionBusy(false)
    }
  }, [supabaseClient, loadRooms])

  // ── Room long-press actions ───────────────────────────────────────────────

  const handleRoomAction = useCallback(async (action, room) => {
    setRoomMenu(null)
    try {
      if (action === 'mark_unread') await chatMarkUnread(supabaseClient, room.id)
      else if (action === 'pin')    await chatPinRoom(supabaseClient, room.id)
      else if (action === 'unpin')  await chatUnpinRoom(supabaseClient, room.id)
      else if (action === 'mute')   await chatMuteRoom(supabaseClient, room.id)
      else if (action === 'unmute') await chatUnmuteRoom(supabaseClient, room.id)
      else if (action === 'delete') await chatLeaveRoom(supabaseClient, room.id)
      void loadRooms()
    } catch (e) {
      setActionErr(e?.message || 'Action failed.')
    }
  }, [supabaseClient, loadRooms])

  // ── Group creation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
    const q = groupSearch.trim()
    if (q.length < 2) { setGroupSearchResults([]); return }
    groupSearchTimerRef.current = setTimeout(async () => {
      if (!supabaseClient) return
      setGroupSearchBusy(true)
      try {
        const term = q.replace(/^@/, '')
        const excludeIds = [viewerUserId, ...groupMembers.map(m => m.user_id)]
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .is('banned_at', null)
          .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
          .not('user_id', 'in', `(${excludeIds.join(',')})`)
          .limit(6)
        if (error) throw error
        setGroupSearchResults(data || [])
      } catch { setGroupSearchResults([]) }
      finally { setGroupSearchBusy(false) }
    }, 200)
    return () => { if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current) }
  }, [groupSearch, supabaseClient, viewerUserId, groupMembers])

  const createGroup = useCallback(async () => {
    if (!groupTitle.trim() || groupMembers.length < 1) return
    setActionErr('')
    setActionBusy(true)
    try {
      const res = await chatCreateGroup(supabaseClient, {
        title: groupTitle.trim(),
        memberUserIds: [viewerUserId, ...groupMembers.map(m => m.user_id)],
      })
      if (res?.room_id) {
        setShowGroupCreate(false)
        setGroupTitle('')
        setGroupMembers([])
        setGroupSearch('')
        await loadRooms()
        setActiveRoomId(res.room_id)
        setTab('inbox')
      }
    } catch (e) {
      setActionErr(e?.message || 'Could not create group.')
    } finally {
      setActionBusy(false)
    }
  }, [supabaseClient, groupTitle, groupMembers, viewerUserId, loadRooms])

  // ── Active room data ──────────────────────────────────────────────────────

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || hydratedOpenRoom || null,
    [rooms, activeRoomId, hydratedOpenRoom]
  )

  useEffect(() => {
    if (!activeRoomId || !viewerUserId || !supabaseClient) {
      setHydratedOpenRoom(null)
      setHydrateOpenRoomDone(false)
      return undefined
    }
    if (rooms.some((r) => r.id === activeRoomId)) {
      setHydratedOpenRoom(null)
      setHydrateOpenRoomDone(true)
      return undefined
    }
    setHydrateOpenRoomDone(false)
    let cancelled = false
    void (async () => {
      try {
        const row = await chatFetchRoomForViewer(supabaseClient, activeRoomId, viewerUserId)
        if (!cancelled) setHydratedOpenRoom(row)
      } catch {
        if (!cancelled) setHydratedOpenRoom(null)
      } finally {
        if (!cancelled) setHydrateOpenRoomDone(true)
      }
    })()
    return () => { cancelled = true }
  }, [activeRoomId, rooms, supabaseClient, viewerUserId])

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

  if (activeRoomId) {
    const room = activeRoom || hydratedOpenRoom
    const resolvingRoom = !room && (roomsLoading || !hydrateOpenRoomDone)
    if (resolvingRoom) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center text-[14px] text-zinc-500">
          Opening conversation…
        </div>
      )
    }
    if (!room) {
      return (
        <div className="px-4 py-8 text-center">
          <p className="text-[14px] text-rose-300">Could not open this chat.</p>
          <button
            type="button"
            className="mt-4 text-[14px] font-semibold text-cyan-400 touch-manipulation"
            onClick={() => setActiveRoomId(null)}
          >
            Back to inbox
          </button>
        </div>
      )
    }
    const otherUnreadCount = rooms.filter((r) => r.id !== activeRoomId && r.hasUnread).length
    return (
      <ChatConversation
        key={`${activeRoomId}-${iosResumeCount}`}
        supabaseClient={supabaseClient}
        room={room}
        viewerUserId={viewerUserId}
        viewerProfile={viewerProfile}
        profilesById={profilesById}
        otherUnreadCount={otherUnreadCount}
        onBack={() => { setActiveRoomId(null); setHydratedOpenRoom(null); void loadRooms() }}
        onViewProfile={onViewProfile}
        onOpenDm={openDmWithUser}
        onRoomUpdated={(patch) => {
          setRooms((prev) => prev.map((r) => r.id === activeRoomId ? { ...r, ...patch } : r))
          setHydratedOpenRoom((prev) => prev?.id === activeRoomId ? { ...prev, ...patch } : prev)
        }}
        viewerReadReceiptsEnabled={viewerReadReceiptsEnabled}
        onViewerReadReceiptsEnabledChange={handleViewerReadReceiptsChange}
        readReceiptsBusy={readReceiptsToggleBusy}
      />
    )
  }

  // ── Conversation list ─────────────────────────────────────────────────────

  return (
    <>
    <div ref={inboxRootRef} data-chat-feature className="select-none">
    <ScrollLinkedEdgeTitleBarShell
      titleBarNavSlot={titleBarNavSlot}
      contentClassName="pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
    >
      {/* Quick link toggle */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <div>
          <div className="text-2xl font-black tracking-tight text-zinc-100">Chat</div>
          <div className="text-sm text-zinc-500 mt-0.5">
            Messages &amp; topic rooms
            {import.meta.env.VITE_BUILD_SHA ? (
              <span className="ml-1 text-[10px] text-zinc-600">· {import.meta.env.VITE_BUILD_SHA}</span>
            ) : null}
          </div>
        </div>
        <QuickLinkPageToggle destinationId="chat" />
      </div>

      {/* New message search + New group button */}
      <div className="relative px-3 pb-2">
        <div className="flex items-center gap-2">
          {/* DM search input */}
          <div className="flex flex-1 items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900/80 px-3 py-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-500">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="New message…"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-zinc-100 placeholder-zinc-500 outline-none"
            />
            {searchQuery.length > 0 && (
              <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="shrink-0 text-zinc-500 touch-manipulation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* New group button */}
          <button
            type="button"
            onClick={() => { setShowGroupCreate(v => !v); setSearchQuery(''); setSearchResults([]) }}
            aria-label="New group chat"
            className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-full border touch-manipulation transition-colors ${
              showGroupCreate ? 'border-cyan-600 bg-cyan-900/40 text-cyan-400' : 'border-zinc-700/60 bg-zinc-900/80 text-zinc-400'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              {/* center person */}
              <circle cx="12" cy="6.5" r="3.5"/>
              <path d="M5.5 21v-1a6.5 6.5 0 0 1 13 0v1"/>
              {/* left person */}
              <circle cx="3.5" cy="9" r="2.5"/>
              <path d="M0 21v-1a4.5 4.5 0 0 1 6.2-4.1"/>
              {/* right person */}
              <circle cx="20.5" cy="9" r="2.5"/>
              <path d="M24 21v-1a4.5 4.5 0 0 0-6.2-4.1"/>
            </svg>
          </button>
        </div>

        {/* DM search results dropdown */}
        {(searchResults.length > 0 || searchBusy) && (
          <div className="absolute inset-x-3 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900 shadow-2xl">
            {searchBusy && searchResults.length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-zinc-500">Searching…</div>
            ) : searchResults.map(p => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => void startDmFromSearch(p.user_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left touch-manipulation hover:bg-zinc-800/60 active:bg-zinc-800"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-700 text-[13px] font-bold text-zinc-300">
                    {(p.handle?.[0] || p.display_name?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  {p.display_name && <div className="truncate text-[14px] font-semibold text-zinc-100">{p.display_name}</div>}
                  <div className="truncate text-[13px] text-zinc-400">@{p.handle}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New group creation panel */}
      {showGroupCreate && (
        <div className="mx-3 mb-2 rounded-2xl border border-zinc-700/50 bg-zinc-900 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-zinc-300">New group chat</span>
            <button type="button" onClick={() => { setShowGroupCreate(false); setGroupTitle(''); setGroupMembers([]); setGroupSearch('') }}
              className="text-zinc-500 touch-manipulation">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Group name */}
          <input
            type="text"
            value={groupTitle}
            onChange={e => setGroupTitle(e.target.value)}
            placeholder="Group name…"
            maxLength={80}
            className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-[14px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-600"
          />

          {/* Member search */}
          <div className="relative">
            <input
              type="text"
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
              placeholder="Add members…"
              className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-[14px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-600"
            />
            {(groupSearchResults.length > 0 || groupSearchBusy) && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-xl">
                {groupSearchBusy && groupSearchResults.length === 0 ? (
                  <div className="px-3 py-2 text-[13px] text-zinc-500">Searching…</div>
                ) : groupSearchResults.map(p => (
                  <button key={p.user_id} type="button"
                    onClick={() => { setGroupMembers(prev => [...prev, p]); setGroupSearch(''); setGroupSearchResults([]) }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left touch-manipulation hover:bg-zinc-800">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      : <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-300">{(p.handle?.[0] || '?').toUpperCase()}</div>
                    }
                    <div className="min-w-0">
                      {p.display_name && <span className="truncate text-[13px] font-semibold text-zinc-100">{p.display_name} </span>}
                      <span className="text-[12px] text-zinc-400">@{p.handle}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected members chips */}
          {groupMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groupMembers.map(m => (
                <span key={m.user_id} className="flex items-center gap-1 rounded-full bg-cyan-900/50 border border-cyan-700/40 px-2.5 py-1 text-[12px] text-cyan-200">
                  @{m.handle}
                  <button type="button" onClick={() => setGroupMembers(prev => prev.filter(x => x.user_id !== m.user_id))}
                    className="text-cyan-400 touch-manipulation leading-none">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Create button */}
          <button
            type="button"
            disabled={!groupTitle.trim() || groupMembers.length < 1 || actionBusy}
            onClick={() => void createGroup()}
            className="w-full rounded-xl bg-cyan-700 py-2.5 text-[14px] font-bold text-white touch-manipulation hover:bg-cyan-600 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {actionBusy ? 'Creating…' : `Create group${groupMembers.length > 0 ? ` · ${groupMembers.length + 1} members` : ''}`}
          </button>
        </div>
      )}

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
          {rooms.map((room) => (
            <ChatRoomListRow
              key={room.id}
              room={room}
              label={chatRoomLabel(room)}
              groupHeaderMembers={groupHeaderByRoomId[room.id] || []}
              onOpen={(roomId) => setActiveRoomId(roomId)}
              onLongPress={(r, x, y) => setRoomMenu({ room: r, x, y })}
            />
          ))}
        </ul>
      )}
    </ScrollLinkedEdgeTitleBarShell>
    </div>

    {roomMenu && createPortal(
      <RoomContextMenu
        room={roomMenu.room}
        anchorY={roomMenu.y}
        anchorX={roomMenu.x}
        onAction={handleRoomAction}
        onClose={() => setRoomMenu(null)}
      />,
      document.body,
    )}
    </>
  )
}

const ROOM_LONG_PRESS_MS = 380
const ROOM_LONG_PRESS_MOVE_PX = 10

/** Inbox row with touch + mouse long-press (pointer-only fails on iOS/Android in scroll lists). */
function ChatRoomListRow({ room, label, groupHeaderMembers = [], onOpen, onLongPress }) {
  const timerRef = useRef(null)
  const suppressClickRef = useRef(false)
  const touchRef = useRef({ startX: 0, startY: 0, cancelled: false })

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const fireLongPress = useCallback((x, y) => {
    clearTimer()
    touchRef.current.cancelled = true
    suppressClickRef.current = true
    window.getSelection()?.removeAllRanges()
    onLongPress(room, x, y)
  }, [room, onLongPress, clearTimer])

  const onTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return
    window.getSelection()?.removeAllRanges()
    touchRef.current.cancelled = false
    touchRef.current.startX = e.touches[0].clientX
    touchRef.current.startY = e.touches[0].clientY
    clearTimer()
    timerRef.current = setTimeout(() => {
      if (!touchRef.current.cancelled) {
        fireLongPress(touchRef.current.startX, touchRef.current.startY)
      }
    }, ROOM_LONG_PRESS_MS)
  }, [clearTimer, fireLongPress])

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 1 || touchRef.current.cancelled) return
    window.getSelection()?.removeAllRanges()
    const dx = Math.abs(e.touches[0].clientX - touchRef.current.startX)
    const dy = Math.abs(e.touches[0].clientY - touchRef.current.startY)
    if (dx > ROOM_LONG_PRESS_MOVE_PX || dy > ROOM_LONG_PRESS_MOVE_PX) {
      touchRef.current.cancelled = true
      clearTimer()
    }
  }, [clearTimer])

  const onTouchEnd = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerDown = useCallback((e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    let cancelled = false
    const startX = e.clientX
    const startY = e.clientY
    clearTimer()
    timerRef.current = setTimeout(() => {
      if (!cancelled) fireLongPress(startX, startY)
    }, ROOM_LONG_PRESS_MS)
    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > ROOM_LONG_PRESS_MOVE_PX || Math.abs(ev.clientY - startY) > ROOM_LONG_PRESS_MOVE_PX) {
        cancelled = true
        clearTimer()
        document.removeEventListener('pointermove', onMove)
      }
    }
    const onUp = () => {
      clearTimer()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
  }, [clearTimer, fireLongPress])

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onOpen(room.id)
  }, [onOpen, room.id])

  return (
    <li className="relative">
      <button
        type="button"
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className="flex w-full select-none items-center gap-3 px-4 py-3.5 text-left touch-manipulation hover:bg-zinc-900/60 active:bg-zinc-900 [-webkit-tap-highlight-color:transparent]"
        style={{ touchAction: 'pan-y', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        <div className="relative shrink-0 flex h-11 w-11 items-center justify-center">
          {room.kind === 'dm' && room.peerAvatarUrl ? (
            <img
              src={room.peerAvatarUrl}
              alt=""
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : room.kind === 'group' ? (
            <ChatGroupHeaderStack
              groupAvatarUrl={room.avatar_url}
              members={groupHeaderMembers}
              size={44}
            />
          ) : (
            <div className={`grid h-11 w-11 place-items-center rounded-full text-[18px] ${
              room.kind === 'channel' ? 'bg-violet-900/60' : 'bg-zinc-800'
            }`}>
              {room.kind === 'channel' ? '#' : (room.peer_display_name?.[0] || room.peer_handle?.[0] || '?').toUpperCase()}
            </div>
          )}
          {room.hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 bg-cyan-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {room.pinned && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0 text-cyan-500" aria-hidden>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <span className={`truncate text-[15px] font-semibold ${room.hasUnread ? 'text-zinc-100' : 'text-zinc-300'}`}>
                {label}
              </span>
              {room.isMuted && (
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="block h-4 w-4"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </span>
              )}
            </div>
          </div>
          {room.previewText ? (
            <div className={`truncate text-[13px] ${room.hasUnread ? 'font-medium text-zinc-300' : 'text-zinc-500'}`}>
              {room.previewText}
            </div>
          ) : (
            <div className="text-[13px] text-zinc-600">No messages yet</div>
          )}
        </div>

        {room.last_message_at && (
          <div className="shrink-0 text-[11px] text-zinc-600">
            {formatChatTimestamp(room.last_message_at)}
          </div>
        )}
      </button>
    </li>
  )
}

// ── RoomContextMenu ────────────────────────────────────────────────────────

function RoomContextMenu({ room, anchorY, anchorX, onAction, onClose }) {
  const menuRef = useRef(null)

  // Position: prefer showing below touch point; if near bottom, flip up.
  const MENU_H = 200
  const top = anchorY + MENU_H > window.innerHeight - 16
    ? anchorY - MENU_H
    : anchorY

  // Dismiss on outside tap
  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [onClose])

  const isMuted = chatRoomIsMuted(room)
  const isPinned = !!room.pinned

  const rowBase =
    'flex w-full items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-semibold touch-manipulation transition-colors active:bg-white/10'

  return (
    <div
      className="select-none"
      style={{
        position: 'fixed',
        top: Math.max(8, Math.min(top, window.innerHeight - MENU_H - 8)),
        left: Math.max(8, Math.min(anchorX, window.innerWidth - 228)),
        zIndex: 200,
        width: 220,
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="chat-room-menu-glass overflow-hidden rounded-2xl shadow-2xl">
        <button
          type="button"
          className={`${rowBase} text-zinc-100`}
          onClick={() => onAction('mark_unread', room)}
        >
          <span>Mark as unread</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0 opacity-75">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/>
            <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
          </svg>
        </button>

        <RoomMenuDivider />

        <button
          type="button"
          className={`${rowBase} text-zinc-100`}
          onClick={() => onAction(isPinned ? 'unpin' : 'pin', room)}
        >
          <span>{isPinned ? 'Unpin conversation' : 'Pin conversation'}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke={isPinned ? 'none' : 'currentColor'} strokeWidth="1.75" className="shrink-0 opacity-75">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
        </button>

        <RoomMenuDivider />

        <button
          type="button"
          className={`${rowBase} text-zinc-100`}
          onClick={() => onAction(isMuted ? 'unmute' : 'mute', room)}
        >
          <span>{isMuted ? 'Unmute conversation' : 'Mute conversation'}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0 opacity-75">
            {isMuted
              ? <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></>
              : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8"/></>
            }
          </svg>
        </button>

        <RoomMenuDivider />

        <button
          type="button"
          className={`${rowBase} chat-room-menu-danger`}
          onClick={() => onAction('delete', room)}
        >
          <span>Delete conversation</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

function RoomMenuDivider() {
  return <div className="chat-room-menu-divider mx-4 h-px" />
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
