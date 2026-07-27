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
import { subscribeToChatCallBroadcast } from './chatCallBroadcast.js'
import ChatIncomingCallOverlay from './ChatIncomingCallOverlay.jsx'

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
 * }} IncomingChatCall
 */

const ChatCallContext = createContext(null)

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null,
 *   viewerUserId: string,
 *   profilesById?: Record<string, { display_name?: string, handle?: string }>,
 *   roomTitleById?: (roomId: string) => string,
 *   initialCallId?: string | null,
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
  onInitialCallConsumed,
  onOpenRoom,
  children,
}) {
  const [activeCall, setActiveCall] = useState(/** @type {ActiveChatCall | null} */ (null))
  const [incoming, setIncoming] = useState(/** @type {IncomingChatCall | null} */ (null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const broadcastByRoomRef = useRef(/** @type {Map<string, ReturnType<typeof subscribeToChatCallBroadcast>>} */ (new Map()))
  const activeCallRef = useRef(activeCall)
  const incomingRef = useRef(incoming)
  const endingRef = useRef(false)
  activeCallRef.current = activeCall
  incomingRef.current = incoming

  const resolveTitle = useCallback(
    (roomId, fromUserId) => {
      if (fromUserId && profilesById[fromUserId]) {
        const p = profilesById[fromUserId]
        return String(p.display_name || p.handle || 'Member').trim() || 'Member'
      }
      if (typeof roomTitleById === 'function') {
        const t = roomTitleById(roomId)
        if (t) return t
      }
      return 'Chat call'
    },
    [profilesById, roomTitleById],
  )

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
          if (activeCallRef.current?.callId === callId) return
          if (incomingRef.current?.callId === callId) return
          const kind = payload.kind === 'group_audio' ? 'group_audio' : 'dm_av'
          const mediaMode = payload.mediaMode === 'video' ? 'video' : 'audio'
          setIncoming({
            callId,
            roomId,
            kind,
            mediaMode,
            fromUserId,
            title: resolveTitle(roomId, fromUserId),
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
    [supabaseClient, viewerUserId, resolveTitle],
  )

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

  // Realtime postgres_changes for invites while browsing inbox / other rooms.
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
          if (activeCallRef.current || incomingRef.current?.callId === row.id) return
          const roomId = String(row.chat_room_id || '')
          ensureBroadcast(roomId)
          setIncoming({
            callId: row.id,
            roomId,
            kind: row.kind === 'group_audio' ? 'group_audio' : 'dm_av',
            mediaMode: row.media_mode === 'video' ? 'video' : 'audio',
            fromUserId: row.started_by,
            title: resolveTitle(roomId, row.started_by),
          })
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
  }, [supabaseClient, viewerUserId, ensureBroadcast, resolveTitle])

  // Deep link ?call=
  useEffect(() => {
    if (!initialCallId || !supabaseClient || !viewerUserId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await chatGetCall(supabaseClient, initialCallId)
        if (cancelled) return
        const call = res?.call
        if (!call?.id || !['ringing', 'active'].includes(call.status)) {
          onInitialCallConsumed?.()
          return
        }
        if (call.started_by === viewerUserId) {
          onInitialCallConsumed?.()
          return
        }
        setIncoming({
          callId: call.id,
          roomId: call.chat_room_id,
          kind: call.kind === 'group_audio' ? 'group_audio' : 'dm_av',
          mediaMode: call.media_mode === 'video' ? 'video' : 'audio',
          fromUserId: call.started_by,
          title: resolveTitle(call.chat_room_id, call.started_by),
        })
        onOpenRoom?.(call.chat_room_id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open call')
      } finally {
        onInitialCallConsumed?.()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    initialCallId,
    supabaseClient,
    viewerUserId,
    onInitialCallConsumed,
    onOpenRoom,
    resolveTitle,
  ])

  const startCall = useCallback(
    async (roomId, mediaMode = 'audio', title = 'Chat call') => {
      if (!supabaseClient || !viewerUserId) throw new Error('Sign in to call.')
      if (activeCallRef.current) throw new Error('Already in a call.')
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
        })
        return call
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not start call'
        setError(msg)
        return null
      } finally {
        setBusy(false)
      }
    },
    [supabaseClient, viewerUserId, ensureBroadcast],
  )

  const acceptIncoming = useCallback(async () => {
    if (!supabaseClient || !incoming) return
    setBusy(true)
    setError('')
    try {
      const action = incoming.kind === 'group_audio' ? chatJoinCall : chatAcceptCall
      const res = await action(supabaseClient, incoming.callId)
      ensureBroadcast(incoming.roomId)?.emit('accept', { callId: incoming.callId })
      onOpenRoom?.(incoming.roomId)
      setActiveCall({
        callId: res.call.id,
        roomId: res.call.chat_room_id,
        kind: res.call.kind,
        mediaMode: res.call.media_mode,
        token: res.token,
        livekitUrl: res.livekit_url,
        title: incoming.title,
      })
      setIncoming(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join call')
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, incoming, ensureBroadcast, onOpenRoom])

  const declineIncoming = useCallback(async () => {
    if (!supabaseClient || !incoming) return
    setBusy(true)
    try {
      if (incoming.kind === 'dm_av') {
        await chatDeclineCall(supabaseClient, incoming.callId)
        ensureBroadcast(incoming.roomId)?.emit('decline', { callId: incoming.callId })
      }
      setIncoming(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline')
      setIncoming(null)
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, incoming, ensureBroadcast])

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
        open={Boolean(incoming) && !activeCall}
        title={incoming?.title || 'Incoming call'}
        subtitle={
          incoming?.kind === 'group_audio'
            ? 'Group voice call'
            : incoming?.mediaMode === 'video'
              ? 'Incoming video call'
              : 'Incoming voice call'
        }
        isVideo={incoming?.mediaMode === 'video'}
        busy={busy}
        onAccept={() => void acceptIncoming()}
        onDecline={() => void declineIncoming()}
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
            onError={(msg) => setError(msg || 'Call connection failed')}
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
          <div className="pointer-events-auto max-w-sm rounded-xl border border-rose-500/40 bg-zinc-950/95 px-3 py-2 text-[13px] text-rose-200 shadow-lg">
            {error}
            <button
              type="button"
              className="ml-2 font-semibold text-zinc-100 underline"
              onClick={() => setError('')}
            >
              Dismiss
            </button>
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
