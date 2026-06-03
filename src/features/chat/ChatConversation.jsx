import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatBubble from './ChatBubble.jsx'
import ChatComposer from './ChatComposer.jsx'
import ChatGroupHeaderStack from './ChatGroupHeaderStack.jsx'
import ChatGroupSettingsSheet from './ChatGroupSettingsSheet.jsx'
import {
  chatSendMessage,
  chatDeleteMessage,
  chatAddReaction,
  chatRemoveReaction,
  chatUpdateLastRead,
  chatMuteRoom,
  chatUnmuteRoom,
  chatRoomIsMuted,
  chatGroupHeaderMembersResolved,
  chatStarredMessageIds,
  chatStarMessage,
  chatUnstarMessage,
  chatPinnedMessageIds,
  chatPinMessage,
  chatUnpinMessage,
  chatMessagesWindow,
  chatIsGroupOwner,
} from './chatApi.js'
import { subscribeToTyping } from './chatTypingBroadcast.js'
import { notifyLoungeDockSuppress } from '../lounge/loungeDockSuppressRegistry.js'
import { useLoungeKeyboardOverlapPx, LOUNGE_IOS_KEYBOARD_SMOOTH_MS, loungeComposerFooterPaddingBottom, useLoungeIosSafeBottomPx } from '../lounge/useLoungeKeyboardOverlapPx.js'

// Glass styles are defined in index.css as .chat-header-glass / .chat-menu-glass
// with html.light overrides — do not use inline styles for these.

const PAGE_SIZE = 50
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
const IS_IOS =
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
/** Extra grab area above composer for iOS keyboard dismiss (px). */
const IOS_COMPOSER_DISMISS_PAD_PX = 32
/** Show scroll-to-bottom when this many newer messages are off-screen. */
const SCROLL_UP_MSG_THRESHOLD = 20
const JUMP_BTN_ABOVE_COMPOSER_PX = 8
/** Last message must sit this far below the composer top before we auto-scroll. */
const COMPOSER_SCROLL_GAP_PX = 8
/** Message stack shorter than this gap under the composer viewport → treat as "fits" (no push). */
const LIST_CONTENT_FITS_GAP_PX = 24
/** iOS keyboard dismiss: wait for viewport settle, then one smooth list scroll. */
const IOS_KEYBOARD_DISMISS_SCROLL_SETTLE_MS = 100
const IOS_KEYBOARD_DISMISS_SCROLL_MAX_WAIT_MS = 420
/** Tail-pin rAF follow while iOS keyboard animates open/closed. */
const IOS_KEYBOARD_TAIL_PIN_MS = 240

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
    supabaseClient.from('chat_messages').select('id, body, image_urls, sender_id, created_at, deleted_at, reply_to_message_id, reply_to_preview, reply_to_sender_id, link_preview')
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
 *   onRoomUpdated?: ((patch: Record<string, unknown>) => void) | null,
 * }} props
 */
export default function ChatConversation({
  supabaseClient,
  room,
  viewerUserId,
  viewerProfile,
  profilesById,
  otherUnreadCount = 0,
  onBack,
  onViewProfile = null,
  onRoomUpdated = null,
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
  /** Newer messages below the viewport (for scroll-to-bottom affordance). */
  const [scrolledUpCount, setScrolledUpCount] = useState(0)
  const [error, setError] = useState('')
  const [replyTarget, setReplyTarget] = useState(/** @type {any | null} */ (null))
  const [typingUsers, setTypingUsers] = useState(/** @type {{ userId: string, displayName: string }[]} */ ([]))
  const [muted, setMuted] = useState(() => chatRoomIsMuted(room.muted_until))
  const [muteMenuOpen, setMuteMenuOpen] = useState(false)
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false)
  const [roomMeta, setRoomMeta] = useState(() => ({ ...room }))
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false)
  const [groupHeaderMembers, setGroupHeaderMembers] = useState(/** @type {any[]} */ ([]))
  const [groupHeaderErr, setGroupHeaderErr] = useState('')
  const [starredIds, setStarredIds] = useState(() => new Set())
  const [pinnedIds, setPinnedIds] = useState(() => new Set())
  const [highlightMessageId, setHighlightMessageId] = useState(/** @type {string | null} */ (null))

  // DOM refs
  const listRef = useRef(null)
  const atBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const typingRef = useRef(null)
  const lastReadDebounceRef = useRef(null)
  const composerBarRef = useRef(null)
  const composerTouchRef = useRef(null)
  /** Android: bottom gap (px) to restore after swipe keyboard dismiss — shared with RO. */
  const keyboardDismissPreserveRef = useRef(/** @type {number | null} */ (null))
  const iosKeyboardDismissScrollTimerRef = useRef(0)
  const iosKeyboardDismissVvHandlerRef = useRef(/** @type {(() => void) | null} */ (null))
  const tailPinFollowRafRef = useRef(0)
  const tailPinFollowUntilRef = useRef(0)
  const kbOverlapPrevRef = useRef(0)
  const kbClosingRef = useRef(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const iosSafeBottomPx = useLoungeIosSafeBottomPx(IS_IOS)
  const kbOverlapPx = useLoungeKeyboardOverlapPx(true, { smooth: IS_IOS, smoothMs: LOUNGE_IOS_KEYBOARD_SMOOTH_MS })

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
  const activeRoom = {
    ...room,
    ...roomMeta,
    member_role: roomMeta.member_role ?? room.member_role ?? room.memberRole,
    memberRole: roomMeta.memberRole ?? room.memberRole ?? room.member_role,
    created_by: roomMeta.created_by ?? room.created_by,
  }
  const isGroupRoom = activeRoom.kind === 'group'
  const isGroupOwner = chatIsGroupOwner(activeRoom, viewerUserId)

  useEffect(() => {
    setRoomMeta({ ...room })
  }, [room])

  useEffect(() => {
    if (!isGroupRoom || !room.id) {
      setGroupHeaderMembers([])
      setGroupHeaderErr('')
      setStarredIds(new Set())
      setPinnedIds(new Set())
      return undefined
    }
    let cancelled = false
    void (async () => {
      const { members, error: memberErr } = await chatGroupHeaderMembersResolved(supabaseClient, room.id)
      if (cancelled) return
      setGroupHeaderMembers(members)
      setGroupHeaderErr(
        memberErr
        || (members.length === 0 && !String(room.avatar_url || roomMeta.avatar_url || '').trim()
          ? 'Could not load member avatars for this group.'
          : ''),
      )
      const [stars, pins] = await Promise.all([
        chatStarredMessageIds(supabaseClient, room.id),
        chatPinnedMessageIds(supabaseClient, room.id),
      ])
      if (!cancelled) {
        setStarredIds(stars)
        setPinnedIds(pins)
      }
    })()
    return () => { cancelled = true }
  }, [isGroupRoom, room.id, room.avatar_url, roomMeta.avatar_url, supabaseClient])

  const refreshPinnedIds = useCallback(async () => {
    if (!isGroupRoom || !room.id) return
    try {
      const pins = await chatPinnedMessageIds(supabaseClient, room.id)
      setPinnedIds(pins)
    } catch {
      setPinnedIds(new Set())
    }
  }, [isGroupRoom, room.id, supabaseClient])

  const handleToggleStar = useCallback(async (messageId, starred) => {
    try {
      if (starred) await chatStarMessage(supabaseClient, messageId)
      else await chatUnstarMessage(supabaseClient, messageId)
      setStarredIds((prev) => {
        const next = new Set(prev)
        if (starred) next.add(messageId)
        else next.delete(messageId)
        return next
      })
    } catch {
      // ignore
    }
  }, [supabaseClient])

  const handleTogglePin = useCallback(async (messageId, pinned) => {
    if (!isGroupOwner) return
    try {
      if (pinned) await chatPinMessage(supabaseClient, room.id, messageId)
      else await chatUnpinMessage(supabaseClient, room.id, messageId)
      setPinnedIds((prev) => {
        const next = new Set(prev)
        if (pinned) next.add(messageId)
        else next.delete(messageId)
        return next
      })
    } catch {
      // ignore
    }
  }, [isGroupOwner, supabaseClient, room.id])

  const scrollMessageIntoView = useCallback((messageId) => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-chat-message-id="${messageId}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setHighlightMessageId(messageId)
      window.setTimeout(() => setHighlightMessageId(null), 2000)
    })
  }, [])

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

  const jumpToMessage = useCallback(async (messageId) => {
    if (!messageId) return
    setGroupSettingsOpen(false)
    const inDom = messagesRef.current.some((m) => m.id === messageId)
    if (inDom) {
      scrollMessageIntoView(messageId)
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await chatMessagesWindow(supabaseClient, room.id, messageId, 40)
      const ordered = [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          || String(a.id).localeCompare(String(b.id)),
      )
      setMessages(ordered)
      setHasMore(true)
      hasMoreRef.current = true
      setHasNewer(true)
      hasNewerRef.current = true
      setNewMsgCount(0)
      if (ordered.length > 0) {
        await loadReactionsForMessages(ordered.map((m) => m.id))
      }
      requestAnimationFrame(() => scrollMessageIntoView(messageId))
    } catch (e) {
      setError(e?.message || 'Could not open that message.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, room.id, loadReactionsForMessages, scrollMessageIntoView])

  // ── Suppress the Lounge dock FAB while this conversation is on screen ────
  // The dock portals to document.body and would otherwise float over the chat.
  // The title-bar nav icon calls temporaryRevealLoungeDock() to briefly surface it.
  useEffect(() => {
    notifyLoungeDockSuppress(true)
    return () => notifyLoungeDockSuppress(false)
  }, [])

  // Lock the entire document body against text selection while chat is mounted.
  // Portal elements (long-press menu, emoji strip) render into document.body and
  // are outside [data-chat-feature], so the body-level lock is necessary.
  useEffect(() => {
    const { style } = document.body
    style.webkitUserSelect = 'none'
    style.userSelect = 'none'
    style.webkitTouchCallout = 'none'
    return () => {
      style.webkitUserSelect = ''
      style.userSelect = ''
      style.webkitTouchCallout = ''
    }
  }, [])

  // Belt-and-suspenders iOS selection kill.
  // CSS user-select:none on [data-chat-feature] is the primary guard.
  // selectionchange + contextmenu are the fallback for the ~25% iOS races.
  useEffect(() => {
    const chatRoot = document.querySelector('[data-chat-feature]')

    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      if (chatRoot && sel.anchorNode && chatRoot.contains(sel.anchorNode)) {
        sel.removeAllRanges()
      }
    }

    const onContextMenu = (e) => {
      if (chatRoot && chatRoot.contains(e.target)) {
        e.preventDefault()
      }
    }

    document.addEventListener('selectionchange', onSelChange)
    document.addEventListener('contextmenu', onContextMenu, { passive: false })
    return () => {
      document.removeEventListener('selectionchange', onSelChange)
      document.removeEventListener('contextmenu', onContextMenu)
    }
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
    if (!loading) {
      scrollToBottom('instant')
      atBottomRef.current = true
      setIsAtBottom(true)
    }
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

  /** True when the message stack fits in the list without needing tail scroll (ignores bottom padding). */
  const listContentFitsInView = useCallback(() => {
    const list = listRef.current
    const layer = translateLayerRef.current
    if (!list || !layer) return true
    const nodes = list.querySelectorAll('[data-chat-message-id]')
    if (nodes.length === 0) return true
    return layer.offsetHeight <= list.clientHeight - LIST_CONTENT_FITS_GAP_PX
  }, [])

  /** True when the tail message sits under (or would sit under) the floating composer. */
  const contentExtendsBelowComposer = useCallback(() => {
    if (listContentFitsInView()) return false
    const list = listRef.current
    const composer = composerBarRef.current
    if (!list || !composer) return false
    const nodes = list.querySelectorAll('[data-chat-message-id]')
    if (nodes.length === 0) return false
    const last = nodes[nodes.length - 1]
    const composerTop = composer.getBoundingClientRect().top
    const lastBottom = last.getBoundingClientRect().bottom
    return lastBottom > composerTop - COMPOSER_SCROLL_GAP_PX
  }, [listContentFitsInView])

  const scrollToBottom = useCallback((behavior = 'instant', { force = false } = {}) => {
    const el = listRef.current
    if (!el) return
    if (!force && (listContentFitsInView() || !contentExtendsBelowComposer())) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [contentExtendsBelowComposer, listContentFitsInView])

  /** Pin tail above composer when keyboard resizes the list (iOS + Android). */
  const pinListToTail = useCallback(({ force = false } = {}) => {
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    const tag = document.activeElement?.tagName
    const inputFocused = tag === 'TEXTAREA' || tag === 'INPUT'
    if (!force && !atBottomRef.current && !nearBottom && !inputFocused) return
    list.scrollTop = list.scrollHeight
  }, [])

  /** iOS: pin each animation frame while keyboard slides; Android: one snap. */
  const runTailPinFollow = useCallback(() => {
    if (!IS_IOS) {
      pinListToTail({ force: true })
      return
    }
    tailPinFollowUntilRef.current = performance.now() + IOS_KEYBOARD_TAIL_PIN_MS
    if (tailPinFollowRafRef.current) return

    const tick = () => {
      pinListToTail({ force: true })
      if (performance.now() < tailPinFollowUntilRef.current) {
        tailPinFollowRafRef.current = requestAnimationFrame(tick)
      } else {
        tailPinFollowRafRef.current = 0
        pinListToTail({ force: true })
      }
    }
    tailPinFollowRafRef.current = requestAnimationFrame(tick)
  }, [pinListToTail])

  useEffect(() => () => {
    if (tailPinFollowRafRef.current) cancelAnimationFrame(tailPinFollowRafRef.current)
  }, [])

  const measureScrolledUpCount = useCallback(() => {
    const list = listRef.current
    if (!list) return 0
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    if (atBottom) return 0

    const listRect = list.getBoundingClientRect()
    const viewBottom = listRect.bottom - 8
    const nodes = list.querySelectorAll('[data-chat-message-id]')
    let lastVisibleIdx = -1
    nodes.forEach((node, idx) => {
      const r = node.getBoundingClientRect()
      if (r.top < viewBottom && r.bottom > listRect.top) lastVisibleIdx = idx
    })

    if (lastVisibleIdx === -1) return messagesRef.current.length
    return Math.max(0, messagesRef.current.length - 1 - lastVisibleIdx)
  }, [])

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

  const goToLatest = useCallback(() => {
    setNewMsgCount(0)
    setScrolledUpCount(0)
    if (hasNewerRef.current) {
      void loadMessages()
    } else {
      atBottomRef.current = true
      setIsAtBottom(true)
      scrollToBottom('smooth', { force: true })
      scheduleMarkLastRead()
    }
  }, [loadMessages, scheduleMarkLastRead, scrollToBottom])

  // ── Scroll helpers ────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    // Trigger older-message load when within 200px of the top
    if (el.scrollTop < 200) void loadMore()
    if (atBottom) {
      setNewMsgCount(0)
      setScrolledUpCount(0)
      scheduleMarkLastRead()
    } else {
      setScrolledUpCount(measureScrolledUpCount())
    }
  }, [loadMore, scheduleMarkLastRead, measureScrolledUpCount])

  useLayoutEffect(() => {
    if (atBottomRef.current) {
      setScrolledUpCount(0)
      return
    }
    setScrolledUpCount(measureScrolledUpCount())
  }, [messages, measureScrolledUpCount])

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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom('smooth'))
    })

    try {
      const res = await chatSendMessage(supabaseClient, { roomId: room.id, body, imageUrls, replyToMessageId })
      if (res?.message_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message_id)) {
            return prev.filter((m) => m.id !== tempId)
          }
          return prev.map((m) =>
            m.id === tempId
              ? { ...optimistic, id: res.message_id, link_preview: res.link_preview || null }
              : m,
          )
        })
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    }
  }, [supabaseClient, room.id, viewerUserId, loadMessages, scrollToBottom])

  const handleLinkPreviewReady = useCallback((messageId, preview) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, link_preview: preview } : m)),
    )
  }, [])

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
    return p?.display_name || (p?.handle ? `@${p.handle}` : 'Member')
  }, [profilesById, localProfiles, viewerUserId])

  const senderAvatarUrl = useCallback((senderId) => {
    if (senderId === viewerUserId) return viewerProfile?.avatar_url || null
    return (profilesById[senderId] || localProfiles[senderId])?.avatar_url || null
  }, [profilesById, localProfiles, viewerUserId, viewerProfile])

  const roomTitle = activeRoom.peerLabel || activeRoom.title || (activeRoom.slug ? `#${activeRoom.slug}` : 'Chat')

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

  // ── Header chrome: DM + group use avatar + pill; channels use compact title ──
  const useRichHeader = activeRoom.kind === 'dm' || isGroupRoom
  const peerUserId = activeRoom.kind === 'dm' ? (activeRoom.peer_user_id ?? null) : null
  const peerProfile = peerUserId ? (profilesById[peerUserId] || localProfiles[peerUserId] || null) : null
  const peerAvatar = peerProfile?.avatar_url || activeRoom.peer_avatar_url || null
  const peerDisplayName = peerProfile?.display_name || activeRoom.peer_display_name || roomTitle
  const headerDisplayName = isGroupRoom
    ? (String(activeRoom.title || '').trim() || 'Group chat')
    : peerDisplayName
  const headerAvatar = activeRoom.kind === 'dm' ? peerAvatar : null
  const headerInitial = (peerDisplayName || '?').replace(/^@/, '')[0]?.toUpperCase() || '?'
  const headerAvatarClass =
    'relative z-10 grid h-16 w-16 place-items-center rounded-full bg-zinc-700 text-[22px] font-bold text-zinc-300 shadow-lg ring-2 ring-white/15'
  // Track composer textarea focus — extends iOS dismiss grab strip above composer.
  useEffect(() => {
    const composer = composerBarRef.current
    if (!composer) return
    const sync = () => {
      setComposerFocused(Boolean(composer.querySelector('textarea:focus, input:focus')))
    }
    const onFocusOut = () => requestAnimationFrame(sync)
    composer.addEventListener('focusin', sync)
    composer.addEventListener('focusout', onFocusOut)
    return () => {
      composer.removeEventListener('focusin', sync)
      composer.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Composer focus / keyboard: keep the latest messages riding above the composer.
  useEffect(() => {
    const composer = composerBarRef.current
    if (!composer) return undefined

    const onFocusIn = (e) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        runTailPinFollow()
      }
    }

    composer.addEventListener('focusin', onFocusIn, true)

    const vv = window.visualViewport
    const onVvResize = () => {
      if (!composer.querySelector('textarea:focus, input:focus')) return
      runTailPinFollow()
    }
    vv?.addEventListener('resize', onVvResize)

    return () => {
      composer.removeEventListener('focusin', onFocusIn, true)
      vv?.removeEventListener('resize', onVvResize)
    }
  }, [runTailPinFollow])

  useEffect(() => {
    const prev = kbOverlapPrevRef.current
    kbOverlapPrevRef.current = kbOverlapPx
    kbClosingRef.current = kbOverlapPx < prev - 2
    if (kbOverlapPx <= iosSafeBottomPx + 0.5) {
      kbClosingRef.current = false
      return undefined
    }
    // Tail-pin only while keyboard is opening — dismiss uses overlap lerp + safe-area floor.
    if (kbOverlapPx > prev + 2) runTailPinFollow()
    return undefined
  }, [iosSafeBottomPx, kbOverlapPx, runTailPinFollow])

  useEffect(() => {
    const composer = composerBarRef.current
    if (!composer) return undefined
    const ro = new ResizeObserver(() => {
      if (!composer.querySelector('textarea:focus, input:focus')) return
      if (IS_IOS) runTailPinFollow()
      else pinListToTail({ force: true })
    })
    ro.observe(composer)
    return () => ro.disconnect()
  }, [pinListToTail, runTailPinFollow])

  // resizes-content: when the keyboard opens/closes the list height changes — pin tail.
  useEffect(() => {
    const container = listRef.current
    if (!container) return undefined
    let prevH = container.clientHeight

    const ro = new ResizeObserver(() => {
      const h = container.clientHeight
      const growing = h > prevH
      const shrinking = h < prevH
      const preservedGap = keyboardDismissPreserveRef.current
      const tag = document.activeElement?.tagName
      const inputFocused = tag === 'TEXTAREA' || tag === 'INPUT'

      if (growing && preservedGap != null) {
        container.scrollTop = container.scrollHeight - container.clientHeight - preservedGap
      } else if (shrinking && (atBottomRef.current || inputFocused)) {
        if (IS_IOS && kbClosingRef.current) { /* overlap lerp handles dismiss */ }
        else if (IS_IOS) runTailPinFollow()
        else pinListToTail({ force: true })
      } else if (growing && (atBottomRef.current || inputFocused)) {
        if (IS_IOS && kbClosingRef.current) { /* avoid scroll overshoot on keyboard close */ }
        else if (IS_IOS) runTailPinFollow()
        else pinListToTail({ force: true })
      } else if (IS_ANDROID && contentExtendsBelowComposer()) {
        if (growing || (shrinking && (atBottomRef.current || inputFocused))) {
          container.scrollTop = container.scrollHeight
        }
      }
      prevH = h
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [contentExtendsBelowComposer, pinListToTail, runTailPinFollow])

  // Android: swipe-down dismiss on message list — lock scroll at tail + preserve position.
  // iOS: messages scroll freely; dismiss only from composer strip (see below).
  useEffect(() => {
    if (!IS_ANDROID) return
    const el = listRef.current
    if (!el) return
    const dismissDyPx = 50
    let startY = 0
    let startX = 0
    let startScrollTop = 0
    let keyboardWasOpen = false
    let dismissActive = false

    const bottomGap = () => el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = () => bottomGap() < 80

    const restorePreservedScroll = () => {
      const gap = keyboardDismissPreserveRef.current
      if (gap == null) return
      el.scrollTop = el.scrollHeight - el.clientHeight - gap
    }

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

    const onStart = (e) => {
      dismissActive = false
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
      if (!dismissActive) {
        if (dy > 10 && dy > Math.abs(dx) && nearBottom()) {
          dismissActive = true
        } else {
          return
        }
      }
      e.preventDefault()
      el.scrollTop = startScrollTop
    }

    const onEnd = (e) => {
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startY
      if (dy > dismissDyPx && keyboardWasOpen) {
        document.activeElement?.blur?.()
        keyboardDismissPreserveRef.current = bottomGap()
        schedulePreserveRestore()
      }
      dismissActive = false
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

  // Composer (+ optional strip above): iOS keyboard dismiss; Android also uses message list.
  useEffect(() => {
    const composer = composerTouchRef.current
    const listEl = listRef.current
    if (!composer || !listEl) return
    const dismissDyPx = IS_ANDROID ? 50 : 18
    let startY = 0
    let startX = 0
    let startScrollTop = 0
    let keyboardWasOpen = false
    let dismissedThisGesture = false

    const nearBottom = () => listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80

    const clearIosKeyboardDismissScroll = () => {
      if (iosKeyboardDismissScrollTimerRef.current) {
        clearTimeout(iosKeyboardDismissScrollTimerRef.current)
        iosKeyboardDismissScrollTimerRef.current = 0
      }
      const vv = window.visualViewport
      const handler = iosKeyboardDismissVvHandlerRef.current
      if (vv && handler) {
        vv.removeEventListener('resize', handler)
        iosKeyboardDismissVvHandlerRef.current = null
      }
    }

    const snapBottomAfterKeyboardCloseIOS = () => {
      clearIosKeyboardDismissScroll()

      let finished = false
      const finishSmoothScroll = () => {
        if (finished) return
        finished = true
        clearIosKeyboardDismissScroll()
        if (listContentFitsInView()) {
          listEl.scrollTo({ top: 0, behavior: 'instant' })
          return
        }
        if (!nearBottom()) return
        atBottomRef.current = true
        setIsAtBottom(true)
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: 'instant' })
      }

      const scheduleFinish = () => {
        clearTimeout(iosKeyboardDismissScrollTimerRef.current)
        iosKeyboardDismissScrollTimerRef.current = setTimeout(
          finishSmoothScroll,
          IOS_KEYBOARD_DISMISS_SCROLL_SETTLE_MS,
        )
      }

      const vv = window.visualViewport
      if (vv) {
        const onResize = () => scheduleFinish()
        iosKeyboardDismissVvHandlerRef.current = onResize
        vv.addEventListener('resize', onResize, { passive: true })
        iosKeyboardDismissScrollTimerRef.current = setTimeout(
          finishSmoothScroll,
          IOS_KEYBOARD_DISMISS_SCROLL_MAX_WAIT_MS,
        )
        scheduleFinish()
      } else {
        iosKeyboardDismissScrollTimerRef.current = setTimeout(
          finishSmoothScroll,
          IOS_KEYBOARD_DISMISS_SCROLL_SETTLE_MS,
        )
      }
    }

    const blurComposer = () => {
      const ae = document.activeElement
      if (ae instanceof HTMLElement && composerBarRef.current?.contains(ae)) ae.blur()
    }

    const onStart = (e) => {
      dismissedThisGesture = false
      startScrollTop = listEl.scrollTop
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
      if (dy <= 8 || dy <= Math.abs(dx)) return
      e.preventDefault()
      if (IS_ANDROID) listEl.scrollTop = startScrollTop
      if (!dismissedThisGesture && dy > 10) {
        dismissedThisGesture = true
        blurComposer()
        if (!IS_ANDROID) snapBottomAfterKeyboardCloseIOS()
      }
    }

    const onEnd = (e) => {
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startY
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX
      const downwardDismiss = IS_ANDROID
        ? dy > dismissDyPx
        : dy > dismissDyPx && dy > Math.abs(dx)
      if (downwardDismiss && keyboardWasOpen && !dismissedThisGesture) {
        blurComposer()
        if (!IS_ANDROID) snapBottomAfterKeyboardCloseIOS()
      }
      dismissedThisGesture = false
      keyboardWasOpen = false
    }

    composer.addEventListener('touchstart', onStart, { passive: true })
    composer.addEventListener('touchmove', onMove, { passive: false })
    composer.addEventListener('touchend', onEnd, { passive: true })
    composer.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      clearIosKeyboardDismissScroll()
      composer.removeEventListener('touchstart', onStart)
      composer.removeEventListener('touchmove', onMove)
      composer.removeEventListener('touchend', onEnd)
      composer.removeEventListener('touchcancel', onEnd)
    }
  }, [contentExtendsBelowComposer, listContentFitsInView])

  const listPaddingTop = useRichHeader
    ? 'calc(env(safe-area-inset-top, 0px) + 11rem)'
    : 'calc(env(safe-area-inset-top, 0px) + 4.5rem)'
  const composerPadBottom = loungeComposerFooterPaddingBottom(kbOverlapPx, iosSafeBottomPx, {
    ios: IS_IOS,
  })

  return (
    <div
      className="fixed inset-0 z-[90] flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950"
      data-chat-feature
    >

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
          className="chat-header-glass relative shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70 transition-opacity"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {otherUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold leading-none text-zinc-950">
              {otherUnreadCount > 99 ? '99+' : otherUnreadCount}
            </span>
          )}
        </button>

        {/* Center — avatar + pill (DM + group); compact title (channels) */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          {useRichHeader ? (
            <>
              {isGroupRoom ? (
                <ChatGroupHeaderStack
                  groupAvatarUrl={activeRoom.avatar_url}
                  members={groupHeaderMembers}
                  size={64}
                />
              ) : headerAvatar ? (
                <img
                  src={headerAvatar}
                  alt={headerDisplayName}
                  className="relative z-10 h-16 w-16 rounded-full object-cover shadow-lg ring-2 ring-white/20"
                />
              ) : (
                <div className={headerAvatarClass}>{headerInitial}</div>
              )}
              {activeRoom.kind === 'dm' ? (
                <button
                  type="button"
                  onClick={() => peerUserId && onViewProfile?.(peerUserId)}
                  disabled={!peerUserId || !onViewProfile}
                  className="chat-header-glass -mt-1 flex items-center gap-1 rounded-full px-4 py-1.5 touch-manipulation transition-opacity active:opacity-75"
                  aria-label={peerUserId ? `View ${headerDisplayName}'s profile` : undefined}
                >
                  <span className="text-[16px] font-bold text-zinc-50">{headerDisplayName}</span>
                  {peerUserId && <span className="text-[15px] font-normal text-zinc-300">›</span>}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setGroupSettingsOpen(true)}
                  className="chat-header-glass -mt-1 flex max-w-full items-center gap-1 rounded-full px-4 py-1.5 touch-manipulation transition-opacity active:opacity-75"
                  aria-label="Group settings"
                >
                  <span className="truncate text-[16px] font-bold text-zinc-50">{headerDisplayName}</span>
                  <span className="text-[15px] font-normal text-zinc-300">›</span>
                </button>
              )}
              {groupHeaderErr ? (
                <p className="mt-1 max-w-[300px] px-2 text-center text-[11px] leading-snug text-amber-400/90">
                  {groupHeaderErr}
                </p>
              ) : null}
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
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

            {isGroupRoom && (
              <>
                <OptionsRow
                  label="Group settings"
                  icon={<GroupSettingsIcon />}
                  onClick={() => { setOptionsMenuOpen(false); setGroupSettingsOpen(true) }}
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

      {/* ── Body + composer (post-detail flex column — footer host owns kb overlap) ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

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

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
          style={{ touchAction: 'pan-y', paddingTop: listPaddingTop }}
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
            <div ref={translateLayerRef} className="pb-2 will-change-transform select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
              {messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null
                const isGroupStart = !prev || prev.sender_id !== msg.sender_id
                const topMargin = idx === 0 ? 0 : isGroupStart ? 12 : 2
                return (
                  <div
                    key={msg.id}
                    style={{ marginTop: topMargin }}
                    className={highlightMessageId === msg.id ? 'rounded-2xl ring-2 ring-cyan-500/60 ring-offset-2 ring-offset-zinc-950' : undefined}
                  >
                    <ChatBubble
                      message={msg}
                      senderLabel={senderLabel(msg.sender_id)}
                      senderAvatarUrl={senderAvatarUrl(msg.sender_id)}
                      isMine={msg.sender_id === viewerUserId}
                      reactions={reactions[msg.id] || []}
                      viewerUserId={viewerUserId}
                      hideSenderInfo={activeRoom.kind === 'dm'}
                      isGroupStart={isGroupStart}
                      enableStar={isGroupRoom}
                      isStarred={starredIds.has(msg.id)}
                      onToggleStar={handleToggleStar}
                      enablePin={isGroupRoom && isGroupOwner}
                      isPinned={pinnedIds.has(msg.id)}
                      onTogglePin={handleTogglePin}
                      onReply={setReplyTarget}
                      onDeleteMessage={handleDelete}
                      onAddReaction={handleAddReaction}
                      onRemoveReaction={handleRemoveReaction}
                      supabaseClient={supabaseClient}
                      onLinkPreviewReady={handleLinkPreviewReady}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div
        ref={composerBarRef}
        data-chat-composer-host
        className="relative z-20 shrink-0 bg-zinc-950/95 px-3 pt-2.5 pb-0 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/80"
        style={{ paddingBottom: composerPadBottom }}
      >
        {(newMsgCount > 0 || hasNewer || scrolledUpCount >= SCROLL_UP_MSG_THRESHOLD) && (
          <div
            className="absolute inset-x-0 bottom-full flex justify-center pointer-events-none"
            style={{ paddingBottom: JUMP_BTN_ABOVE_COMPOSER_PX }}
          >
            <button
              type="button"
              onClick={goToLatest}
              aria-label={
                newMsgCount > 0
                  ? `${newMsgCount} new message${newMsgCount === 1 ? '' : 's'}`
                  : hasNewer
                    ? 'Jump to latest messages'
                    : 'Scroll to bottom'
              }
              className={`chat-header-glass pointer-events-auto touch-manipulation transition-transform active:scale-95 active:opacity-70 ${
                newMsgCount > 0 || hasNewer
                  ? 'rounded-full px-4 py-2 text-[13px] font-semibold text-cyan-300'
                  : 'flex h-10 w-10 items-center justify-center rounded-full text-zinc-100'
              }`}
            >
              {newMsgCount > 0 ? (
                `↓ ${newMsgCount} new message${newMsgCount === 1 ? '' : 's'}`
              ) : hasNewer ? (
                '↓ Jump to latest'
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>
          </div>
        )}
        <div
          ref={composerTouchRef}
          style={
            composerFocused && !IS_ANDROID
              ? { paddingTop: IOS_COMPOSER_DISMISS_PAD_PX }
              : undefined
          }
        >
          {typingUsers.length > 0 && isAtBottom && (
            <div className="pb-1 text-[12px] text-zinc-500">
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
            footerHost
          />
        </div>
      </div>
      </div>

      {isGroupRoom ? (
        <ChatGroupSettingsSheet
          open={groupSettingsOpen}
          onClose={() => setGroupSettingsOpen(false)}
          supabaseClient={supabaseClient}
          room={activeRoom}
          viewerUserId={viewerUserId}
          headerMembers={groupHeaderMembers}
          onRoomUpdated={(patch) => {
            setRoomMeta((prev) => ({ ...prev, ...patch }))
            onRoomUpdated?.(patch)
          }}
          onLeftGroup={onBack}
          onJumpToMessage={jumpToMessage}
          onPinsChanged={refreshPinnedIds}
        />
      ) : null}
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
function GroupSettingsIcon() {
  return (
    <svg {...OS}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
