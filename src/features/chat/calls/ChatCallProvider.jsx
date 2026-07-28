import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  chatAcceptCall,
  chatDeclineCall,
  chatEndCall,
  chatGetCall,
  chatJoinCall,
  chatStartCall,
} from '../../../utils/chatCallsApi.js'
import { chatSendMessage } from '../chatApi.js'
import { subscribeToChatCallBroadcast } from './chatCallBroadcast.js'
import ChatIncomingCallOverlay from './ChatIncomingCallOverlay.jsx'
import ChatMissedCallCallbackOverlay from './ChatMissedCallCallbackOverlay.jsx'
import {
  clearPendingChatCallDeepLink,
  peekPendingChatCallDeepLink,
} from '../../../utils/pendingChatCallDeepLink.js'
import { installChatCallAudioUnlock, unlockChatCallAudio } from './chatCallRingTone.js'

const ChatCallSession = lazy(() => import('./ChatCallSession.jsx'))

/** @typedef {'audio' | 'video'} ChatCallMediaMode */
/** @typedef {'dm_av' | 'group_audio'} ChatCallKind */

/**
 * @typedef {{
 *   callId: string,
 *   roomId: string,
 *   kind: ChatCallKind,
 *   mediaMode: ChatCallMediaMode,
 *   token: string,
 *   livekitUrl: string,
 *   title: string,
 *   isOutgoing?: boolean,
 * }} ActiveChatCall
 */

/**
 * @typedef {{
 *   callId: string,
 *   roomId: string,
 *   kind: ChatCallKind,
 *   mediaMode: ChatCallMediaMode,
 *   fromUserId: string,
 *   title: string,
 *   avatarUrl?: string | null,
 * }} IncomingChatCall
 */

/**
 * @typedef {{ title: string, avatarUrl: string | null }} CallerProfileSnap
 */

const ChatCallContext = createContext(null)

/** Bottom toast for call status / soft errors (no dismiss button). */
const CALL_STATUS_TOAST_MS = 3500

/** LiveKit hangup noise... not worth a toast. */
function shouldShowCallStatusToast(message) {
  const text = String(message || '').trim()
  if (!text) return false
  if (/^client initiated disconnect$/i.test(text)) return false
  return true
}

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   viewerUserId: string,
 *   profilesById?: Record<string, { display_name?: string, handle?: string, avatar_url?: string | null }>,
 *   roomTitleById?: (roomId: string) => string,
 *   initialCallId?: string | null,
 *   initialCallIntent?: 'ring' | 'callback',
 *   onInitialCallConsumed?: () => void,
 *   onOpenRoom?: (roomId: string) => void,
 *   children: import('react').ReactNode,
 * }} props
 */
export function ChatCallProvider({
  supabaseClient,
  viewerUserId,
  profilesById = {},
  roomTitleById,
  initialCallId = null,
  initialCallIntent = 'ring',
  onInitialCallConsumed,
  onOpenRoom,
  children,
}) {
  const [activeCall, setActiveCall] = useState(/** @type {ActiveChatCall | null} */ (null))
  const [incoming, setIncoming] = useState(/** @type {IncomingChatCall | null} */ (null))
  /** @type {[{ roomId: string, mediaMode: ChatCallMediaMode, title: string, isVideo: boolean } | null, Function]} */
  const [callbackPrompt, setCallbackPrompt] = useState(
    /** @type {{ roomId: string, mediaMode: ChatCallMediaMode, title: string, isVideo: boolean } | null} */ (null),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const broadcastByRoomRef = useRef(/** @type {Map<string, ReturnType<typeof subscribeToChatCallBroadcast>>} */ (new Map()))

  const showCallStatusToast = useCallback((message) => {
    const text = String(message || '').trim()
    if (!shouldShowCallStatusToast(text)) return
    setError(text)
  }, [])

  useEffect(() => {
    if (!error) return undefined
    const timer = window.setTimeout(() => setError(''), CALL_STATUS_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [error])
  const activeCallRef = useRef(activeCall)
  const incomingRef = useRef(incoming)
  const endingRef = useRef(false)
  const callerProfileCacheRef = useRef(/** @type {Map<string, CallerProfileSnap>} */ (new Map()))
  const callerProfileFetchedRef = useRef(/** @type {Set<string>} */ (new Set()))
  activeCallRef.current = activeCall
  incomingRef.current = incoming

  const resolveCallerProfile = useCallback(
    (roomId, fromUserId) => {
      if (fromUserId && callerProfileCacheRef.current.has(fromUserId)) {
        return callerProfileCacheRef.current.get(fromUserId) || { title: 'Chat call', avatarUrl: null }
      }
      if (fromUserId && profilesById[fromUserId]) {
        const p = profilesById[fromUserId]
        const title = String(p.display_name || p.handle || 'Member').trim() || 'Member'
        const avatarUrl = typeof p.avatar_url === 'string' && p.avatar_url.trim() ? p.avatar_url.trim() : null
        const snap = { title, avatarUrl }
        callerProfileCacheRef.current.set(fromUserId, snap)
        return snap
      }
      if (typeof roomTitleById === 'function') {
        const t = roomTitleById(roomId)
        if (t) return { title: t, avatarUrl: null }
      }
      return { title: 'Incoming call', avatarUrl: null }
    },
    [profilesById, roomTitleById],
  )

  /** When provider lives above ChatTab, profilesById is often empty... fetch caller name + avatar. */
  const resolveCallerProfileAsync = useCallback(
    async (roomId, fromUserId) => {
      const sync = resolveCallerProfile(roomId, fromUserId)
      if (!supabaseClient || !fromUserId) return sync
      if (callerProfileFetchedRef.current.has(fromUserId)) {
        return callerProfileCacheRef.current.get(fromUserId) || sync
      }
      try {
        const { data } = await supabaseClient
          .from('profiles')
          .select('display_name, handle, avatar_url')
          .eq('user_id', fromUserId)
          .maybeSingle()
        const title = String(data?.display_name || data?.handle || sync.title).trim() || sync.title
        const avatarUrl =
          typeof data?.avatar_url === 'string' && data.avatar_url.trim()
            ? data.avatar_url.trim()
            : sync.avatarUrl
        const snap = { title, avatarUrl }
        callerProfileCacheRef.current.set(fromUserId, snap)
        callerProfileFetchedRef.current.add(fromUserId)
        return snap
      } catch {
        callerProfileFetchedRef.current.add(fromUserId)
        return sync
      }
    },
    [supabaseClient, resolveCallerProfile],
  )

  const resolveTitleAsync = useCallback(
    async (roomId, fromUserId) => {
      const snap = await resolveCallerProfileAsync(roomId, fromUserId)
      return snap.title
    },
    [resolveCallerProfileAsync],
  )

  const presentIncomingRef = useRef(/** @type {(row: Record<string, unknown>) => void} */ (() => {}))

  const ensureBroadcast = useCallback(
    (roomId) => {
      if (!supabaseClient || !viewerUserId || !roomId) return null
      const existing = broadcastByRoomRef.current.get(roomId)
      if (existing) return existing
      const sub = subscribeToChatCallBroadcast(supabaseClient, roomId, viewerUserId, (event, payload) => {
        const callId = String(payload.callId || '').trim()
        const fromUserId = String(payload.fromUserId || '').trim()
        if (!callId) return

        if (event === 'invite') {
          presentIncomingRef.current({
            id: callId,
            chat_room_id: roomId,
            started_by: fromUserId,
            kind: payload.kind,
            media_mode: payload.mediaMode,
          })
          return
        }

        if (event === 'decline' || event === 'end') {
          if (incomingRef.current?.callId === callId) setIncoming(null)
          if (activeCallRef.current?.callId === callId) {
            setActiveCall(null)
          }
        }
      })
      broadcastByRoomRef.current.set(roomId, sub)
      return sub
    },
    [supabaseClient, viewerUserId],
  )

  const presentIncoming = useCallback(
    (row) => {
      if (!row?.id) return
      if (activeCallRef.current || incomingRef.current?.callId === row.id) return
      const roomId = String(row.chat_room_id || row.roomId || '')
      const fromUserId = String(row.started_by || row.fromUserId || '')
      const kind = row.kind === 'group_audio' ? 'group_audio' : 'dm_av'
      const mediaMode = (row.media_mode || row.mediaMode) === 'video' ? 'video' : 'audio'
      if (roomId) ensureBroadcast(roomId)
      const profile = resolveCallerProfile(roomId, fromUserId)
      setIncoming({
        callId: row.id,
        roomId,
        kind,
        mediaMode,
        fromUserId,
        title: profile.title,
        avatarUrl: profile.avatarUrl,
      })
      void resolveCallerProfileAsync(roomId, fromUserId).then((next) => {
        setIncoming((prev) =>
          prev?.callId === row.id ? { ...prev, title: next.title, avatarUrl: next.avatarUrl } : prev,
        )
      })
    },
    [ensureBroadcast, resolveCallerProfile, resolveCallerProfileAsync],
  )
  presentIncomingRef.current = presentIncoming

  const releaseBroadcast = useCallback((roomId) => {
    const sub = broadcastByRoomRef.current.get(roomId)
    if (!sub) return
    sub.cleanup()
    broadcastByRoomRef.current.delete(roomId)
  }, [])

  useEffect(() => {
    return () => {
      for (const sub of broadcastByRoomRef.current.values()) sub.cleanup()
      broadcastByRoomRef.current.clear()
    }
  }, [])

  // Prime Web Audio from normal taps so incoming ringtone isn't stuck until Accept.
  useEffect(() => {
    installChatCallAudioUnlock()
  }, [])

  // App-wide Realtime invites (provider should live above ChatTab so any screen rings).
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return undefined
    const channel = supabaseClient
      .channel(`chat-calls-pg-${viewerUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_calls' },
        (payload) => {
          const row = payload.new
          if (!row?.id || row.started_by === viewerUserId) return
          if (!['ringing', 'active'].includes(row.status)) return
          presentIncoming(row)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_calls' },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          if (['ended', 'missed', 'declined'].includes(row.status)) {
            if (incomingRef.current?.callId === row.id) setIncoming(null)
            if (activeCallRef.current?.callId === row.id) setActiveCall(null)
          }
        },
      )
      .subscribe()

    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [supabaseClient, viewerUserId, presentIncoming])

  const onOpenRoomRef = useRef(onOpenRoom)
  onOpenRoomRef.current = onOpenRoom
  const onInitialCallConsumedRef = useRef(onInitialCallConsumed)
  onInitialCallConsumedRef.current = onInitialCallConsumed
  // presentIncomingRef already declared above (realtime + deep link share it).
  const resolveTitleAsyncRef = useRef(resolveTitleAsync)
  resolveTitleAsyncRef.current = resolveTitleAsync

  // SW push backup when Edge is visible (Realtime RLS can miss on some projects).
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return undefined
    const onSwInvite = (event) => {
      const detail = event?.detail || {}
      if (detail.eventType === 'chat_call_missed') return
      const callId = String(detail.chatCallId || '').trim()
      if (!callId) return
      if (activeCallRef.current || incomingRef.current?.callId === callId) return
      void (async () => {
        try {
          const res = await chatGetCall(supabaseClient, callId)
          const call = res?.call
          if (!call?.id || call.started_by === viewerUserId) return
          if (!['ringing', 'active'].includes(call.status)) return
          presentIncoming(call)
        } catch {
          /* ignore transient */
        }
      })()
    }
    const onSwMissed = (event) => {
      const detail = event?.detail || {}
      const callId = String(detail.chatCallId || '').trim()
      if (!callId) return
      // Clear ringing UI; open Call back (same as missedCall= deep link).
      setIncoming((prev) => (prev?.callId === callId ? null : prev))
      const roomFromPush = String(detail.roomId || '').trim()
      void (async () => {
        try {
          const res = await chatGetCall(supabaseClient, callId)
          const call = res?.call
          if (!call?.id || call.started_by === viewerUserId) {
            if (roomFromPush) onOpenRoomRef.current?.(roomFromPush)
            return
          }
          const roomId = String(call.chat_room_id || roomFromPush || '')
          const title = await resolveTitleAsyncRef.current(roomId, call.started_by)
          onOpenRoomRef.current?.(roomId)
          const mediaMode = call.media_mode === 'video' ? 'video' : 'audio'
          setCallbackPrompt({
            roomId,
            mediaMode,
            title,
            isVideo: call.kind === 'dm_av' && mediaMode === 'video',
          })
        } catch {
          if (roomFromPush) onOpenRoomRef.current?.(roomFromPush)
        }
      })()
    }
    window.addEventListener('edge-chat-call-invite', onSwInvite)
    window.addEventListener('edge-chat-call-missed', onSwMissed)
    return () => {
      window.removeEventListener('edge-chat-call-invite', onSwInvite)
      window.removeEventListener('edge-chat-call-missed', onSwMissed)
    }
  }, [supabaseClient, viewerUserId, presentIncoming])

  const [deepLinkRetry, setDeepLinkRetry] = useState(0)

  // iOS PWA: notificationclick often lands before auth/provider is ready, or drops
  // postMessage... re-peek session stash when the page becomes visible again.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onResume = () => {
      if (document.visibilityState === 'hidden') return
      if (callbackPrompt || incoming || activeCall) return
      const stashed = peekPendingChatCallDeepLink()
      if (!stashed?.callId) return
      setDeepLinkRetry((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [callbackPrompt, incoming, activeCall])

  // Deep link ?call= / ?missedCall= (prop and/or sessionStorage stash).
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return
    const stashed = peekPendingChatCallDeepLink()
    const callId = String(initialCallId || stashed?.callId || '').trim()
    if (!callId) return
    const intent =
      initialCallIntent === 'callback' || stashed?.intent === 'callback' ? 'callback' : 'ring'
    let cancelled = false
    ;(async () => {
      /** Only clear pending after UI actually opened (or call is gone). Keeps iOS retries alive. */
      let shouldClear = false
      try {
        const res = await chatGetCall(supabaseClient, callId)
        if (cancelled) return
        const call = res?.call
        if (!call?.id) {
          showCallStatusToast('That call is no longer available.')
          shouldClear = true
          return
        }
        const roomId = String(call.chat_room_id || stashed?.roomId || '')
        const title = await resolveTitleAsyncRef.current(roomId, call.started_by)
        if (cancelled) return

        // Live invite → accept UI (unless this was an explicit missed-call tap).
        if (['ringing', 'active'].includes(call.status) && intent !== 'callback') {
          if (call.started_by === viewerUserId) {
            shouldClear = true
            return
          }
          presentIncomingRef.current(call)
          onOpenRoomRef.current?.(roomId)
          shouldClear = true
          return
        }

        // Missed / ended / declined (or missedCall= deep link) → DM + call-back prompt.
        if (call.started_by === viewerUserId) {
          onOpenRoomRef.current?.(roomId)
          shouldClear = true
          return
        }
        onOpenRoomRef.current?.(roomId)
        const mediaMode = call.media_mode === 'video' ? 'video' : 'audio'
        setCallbackPrompt({
          roomId,
          mediaMode,
          title,
          isVideo: call.kind === 'dm_av' && mediaMode === 'video',
        })
        shouldClear = true
      } catch (err) {
        // Leave stash for visibility retry (common on iOS wake before session is ready).
        if (!cancelled) {
          showCallStatusToast(err instanceof Error ? err.message : 'Could not open call')
        }
      } finally {
        if (!cancelled && shouldClear) {
          clearPendingChatCallDeepLink()
          onInitialCallConsumedRef.current?.()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialCallId, initialCallIntent, supabaseClient, viewerUserId, deepLinkRetry, showCallStatusToast])

  const startCall = useCallback(
    async (roomId, mediaMode = 'audio', title = 'Chat call') => {
      if (!supabaseClient || !viewerUserId) throw new Error('Sign in to call.')
      if (activeCallRef.current) throw new Error('Already in a call.')
      unlockChatCallAudio()
      setBusy(true)
      setError('')
      try {
        const res = await chatStartCall(supabaseClient, roomId, mediaMode)
        const call = res.call
        const sub = ensureBroadcast(roomId)
        sub?.emit('invite', {
          callId: call.id,
          kind: call.kind,
          mediaMode: call.media_mode,
        })
        setIncoming(null)
        endingRef.current = false
        setActiveCall({
          callId: call.id,
          roomId,
          kind: call.kind,
          mediaMode: call.media_mode,
          token: res.token,
          livekitUrl: res.livekit_url,
          title,
          isOutgoing: true,
        })
        return call
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not start call'
        showCallStatusToast(msg)
        return null
      } finally {
        setBusy(false)
      }
    },
    [supabaseClient, viewerUserId, ensureBroadcast, showCallStatusToast],
  )

  const acceptIncoming = useCallback(async () => {
    if (!supabaseClient || !incoming) return
    const snap = incoming
    // Clear overlay (stops ringtone) before unlocking audio for LiveKit.
    setIncoming(null)
    unlockChatCallAudio()
    setBusy(true)
    setError('')
    try {
      const action = snap.kind === 'group_audio' ? chatJoinCall : chatAcceptCall
      const res = await action(supabaseClient, snap.callId)
      ensureBroadcast(snap.roomId)?.emit('accept', { callId: snap.callId })
      onOpenRoom?.(snap.roomId)
      setActiveCall({
        callId: res.call.id,
        roomId: res.call.chat_room_id,
        kind: res.call.kind,
        mediaMode: res.call.media_mode,
        token: res.token,
        livekitUrl: res.livekit_url,
        title: snap.title,
        isOutgoing: false,
      })
    } catch (err) {
      showCallStatusToast(err instanceof Error ? err.message : 'Could not join call')
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, incoming, ensureBroadcast, onOpenRoom, showCallStatusToast])

  /**
   * @param {{ message?: string }} [opts]
   * DM only: optional `message` is sent as a normal chat text after decline.
   */
  const declineIncoming = useCallback(async (opts = {}) => {
    if (!supabaseClient || !incoming) return
    const snap = incoming
    const message = typeof opts?.message === 'string' ? opts.message.trim() : ''
    setBusy(true)
    try {
      if (snap.kind === 'dm_av') {
        await chatDeclineCall(supabaseClient, snap.callId)
        ensureBroadcast(snap.roomId)?.emit('decline', { callId: snap.callId })
        if (message) {
          try {
            await chatSendMessage(supabaseClient, {
              roomId: snap.roomId,
              body: message,
            })
          } catch {
            // Call already declined; do not block dismiss on message failure.
          }
        }
      }
      setIncoming(null)
    } catch (err) {
      showCallStatusToast(err instanceof Error ? err.message : 'Could not decline')
      setIncoming(null)
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, incoming, ensureBroadcast, showCallStatusToast])

  const hangup = useCallback(async () => {
    const current = activeCallRef.current
    if (!current) {
      setActiveCall(null)
      return
    }
    if (endingRef.current) {
      setActiveCall(null)
      return
    }
    endingRef.current = true
    setBusy(true)
    try {
      if (supabaseClient) {
        await chatEndCall(supabaseClient, current.callId)
        ensureBroadcast(current.roomId)?.emit('end', { callId: current.callId })
      }
    } catch {
      /* still clear local */
    } finally {
      setActiveCall(null)
      setBusy(false)
      endingRef.current = false
    }
  }, [supabaseClient, ensureBroadcast])

  const watchRoom = useCallback(
    (roomId) => {
      if (!roomId) return () => {}
      ensureBroadcast(roomId)
      return () => {
        // Keep broadcast while provider lives so inbox can still get invites for recently opened rooms.
      }
    },
    [ensureBroadcast],
  )

  const value = useMemo(
    () => ({
      activeCall,
      incoming,
      busy,
      error,
      clearError: () => setError(''),
      startCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      watchRoom,
      releaseBroadcast,
    }),
    [
      activeCall,
      incoming,
      busy,
      error,
      startCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      watchRoom,
      releaseBroadcast,
    ],
  )

  return (
    <ChatCallContext.Provider value={value}>
      {children}
      <ChatIncomingCallOverlay
        open={Boolean(incoming) && !activeCall && !callbackPrompt}
        title={incoming?.title || 'Incoming call'}
        avatarUrl={incoming?.avatarUrl || null}
        subtitle={
          incoming?.kind === 'group_audio'
            ? 'Group voice call'
            : incoming?.mediaMode === 'video'
              ? 'Incoming video call'
              : 'Incoming voice call'
        }
        isVideo={incoming?.mediaMode === 'video'}
        busy={busy}
        showDeclineQuickReplies={incoming?.kind === 'dm_av'}
        onAccept={() => void acceptIncoming()}
        onDecline={() => void declineIncoming()}
        onDeclineWithMessage={(message) => void declineIncoming({ message })}
      />
      <ChatMissedCallCallbackOverlay
        open={Boolean(callbackPrompt) && !activeCall && !incoming}
        title={callbackPrompt?.title || 'Missed call'}
        isVideo={Boolean(callbackPrompt?.isVideo)}
        busy={busy}
        onDismiss={() => setCallbackPrompt(null)}
        onCallBack={() => {
          const prompt = callbackPrompt
          if (!prompt?.roomId) return
          setCallbackPrompt(null)
          void startCall(prompt.roomId, prompt.mediaMode, prompt.title)
        }}
      />
      {activeCall ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[128] flex items-center justify-center bg-zinc-950 text-zinc-300">
              Connecting...
            </div>
          }
        >
          <ChatCallSession
            key={activeCall.callId}
            token={activeCall.token}
            serverUrl={activeCall.livekitUrl}
            mediaMode={activeCall.mediaMode}
            kind={activeCall.kind}
            title={activeCall.title}
            isOutgoing={Boolean(activeCall.isOutgoing)}
            onError={(msg) => showCallStatusToast(msg || 'Call connection failed')}
            onDisconnected={() => {
              // End DB call so a drop/disconnect cannot leave a stuck ringing row.
              void hangup()
            }}
            onHangup={() => void hangup()}
          />
        </Suspense>
      ) : null}
      {error ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-[131] flex justify-center px-4">
          <div
            className="max-w-sm rounded-xl border border-rose-500/40 bg-zinc-950/95 px-3 py-2 text-center text-[13px] text-rose-200 shadow-lg"
            role="status"
          >
            {error}
          </div>
        </div>
      ) : null}
    </ChatCallContext.Provider>
  )
}

export function useChatCall() {
  const ctx = useContext(ChatCallContext)
  if (!ctx) {
    throw new Error('useChatCall must be used within ChatCallProvider')
  }
  return ctx
}

/** Safe hook when provider may be absent (e.g. story). */
export function useChatCallOptional() {
  return useContext(ChatCallContext)
}
