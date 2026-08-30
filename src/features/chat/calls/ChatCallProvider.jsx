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
  CHAT_CALL_RECORDING_MAX_SECONDS,
  chatAcceptCall,
  chatDeclineCall,
  chatFetchActiveRoomCall,
  chatGetCall,
  chatJoinCall,
  chatLeaveCall,
  chatStartCall,
  chatStartRecording,
  chatStopRecording,
} from '../../../utils/chatCallsApi.js'
import { playChatCallRecordingCue } from './chatCallRecordingTone.js'
import { chatSendMessage } from '../chatApi.js'
import { subscribeToChatCallBroadcast } from './chatCallBroadcast.js'
import ChatIncomingCallOverlay from './ChatIncomingCallOverlay.jsx'
import ChatMissedCallCallbackOverlay from './ChatMissedCallCallbackOverlay.jsx'
import {
  clearPendingChatCallDeepLink,
  peekPendingChatCallDeepLink,
} from '../../../utils/pendingChatCallDeepLink.js'
import { enterCallAudioSession } from './chatCallAudioSession.js'
import { installChatCallAudioUnlock, stopAllChatCallTones, unlockChatCallAudio } from './chatCallRingTone.js'
import { acceptNativeCall, dismissEdgeCallKeyboard, endEdgeNativeCall, getEdgeVoIPPushToken, installEdgeCallKitListeners, markEdgeCallKitWebReady, preloadEdgeAvatar, reportEdgeIncomingCall, startNativeCall } from '../../../utils/edgeCallKit.js'
import { getEdgeiOSPushToken, isEdgeiOSShell } from '../../../utils/edgeNative.js'
import { upsertMyApnsDeviceToken } from '../../../utils/apnsDeviceTokenApi.js'

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
 *   avatarUrl?: string | null,
 *   viewerAvatarUrl?: string | null,
 *   peerUserId?: string | null,
 *   callStartedBy?: string | null,
 *   recordingStatus?: 'idle' | 'recording' | 'stopping' | 'ready' | 'failed',
 *   recordingStartedBy?: string | null,
 *   recordingStartedAt?: string | null,
 *   recordingMaxSeconds?: number,
 * }} ActiveChatCall
 */

function recordingFieldsFromCall(call) {
  const status = String(call?.recording_status || 'idle')
  const ok = ['idle', 'recording', 'stopping', 'ready', 'failed'].includes(status)
  return {
    recordingStatus: /** @type {ActiveChatCall['recordingStatus']} */ (ok ? status : 'idle'),
    recordingStartedBy: call?.recording_started_by ? String(call.recording_started_by) : null,
    recordingStartedAt: call?.recording_started_at ? String(call.recording_started_at) : null,
    recordingMaxSeconds: CHAT_CALL_RECORDING_MAX_SECONDS,
  }
}

function patchActiveRecording(prev, patch) {
  if (!prev) return prev
  return { ...prev, ...patch }
}

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
  /** @type {[{ roomId: string, mediaMode: ChatCallMediaMode, title: string, isVideo: boolean, avatarUrl?: string | null } | null, Function]} */
  const [callbackPrompt, setCallbackPrompt] = useState(
    /** @type {{ roomId: string, mediaMode: ChatCallMediaMode, title: string, isVideo: boolean, avatarUrl?: string | null } | null} */ (
      null
    ),
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
          void endEdgeNativeCall({ callId, reason: 'remote' })
          return
        }

        if (
          event === 'recording_started' ||
          event === 'recording_stopping' ||
          event === 'recording_ready' ||
          event === 'recording_failed'
        ) {
          if (activeCallRef.current?.callId !== callId) return
          const status =
            event === 'recording_started'
              ? 'recording'
              : event === 'recording_stopping'
                ? 'stopping'
                : event === 'recording_ready'
                  ? 'ready'
                  : 'failed'
          setActiveCall((prev) =>
            patchActiveRecording(prev, {
              recordingStatus: status,
              recordingStartedBy:
                payload.startedBy != null ? String(payload.startedBy) : prev?.recordingStartedBy || null,
              recordingStartedAt:
                payload.startedAt != null ? String(payload.startedAt) : prev?.recordingStartedAt || null,
              recordingMaxSeconds:
                Number(payload.maxSeconds) > 0
                  ? Number(payload.maxSeconds)
                  : prev?.recordingMaxSeconds || CHAT_CALL_RECORDING_MAX_SECONDS,
            }),
          )
          if (event === 'recording_started') playChatCallRecordingCue('started')
          if (event === 'recording_ready' || event === 'recording_failed') {
            playChatCallRecordingCue('stopped')
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
      void reportEdgeIncomingCall({
        callId: String(row.id),
        roomId,
        handle: profile.title || 'Incoming call',
        hasVideo: mediaMode === 'video',
        avatarUrl: profile.avatarUrl,
      })
      void resolveCallerProfileAsync(roomId, fromUserId).then((next) => {
        setIncoming((prev) =>
          prev?.callId === row.id ? { ...prev, title: next.title, avatarUrl: next.avatarUrl } : prev,
        )
        setActiveCall((prev) => {
          if (!prev || prev.callId !== row.id) return prev
          return {
            ...prev,
            title: (!prev.title || prev.title === 'Chat call' || prev.title === 'Incoming call') ? next.title : prev.title,
            avatarUrl: prev.avatarUrl || next.avatarUrl,
          }
        })
        if (next.avatarUrl) {
          void preloadEdgeAvatar(next.avatarUrl)
          void reportEdgeIncomingCall({
            callId: String(row.id),
            roomId,
            handle: next.title || 'Incoming call',
            hasVideo: mediaMode === 'video',
            avatarUrl: next.avatarUrl,
          })
        }
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

  // Upload PushKit VoIP token & APNs alert token for CallKit background ring and cancellation.
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return undefined
    let cancelled = false
    const syncTokens = async () => {
      const { token: voipToken } = await getEdgeVoIPPushToken()
      if (!cancelled && voipToken) {
        await upsertMyApnsDeviceToken(supabaseClient, voipToken, { pushChannel: 'voip' })
      }
      const { token: alertToken } = await getEdgeiOSPushToken()
      if (!cancelled && alertToken) {
        await upsertMyApnsDeviceToken(supabaseClient, alertToken, { pushChannel: 'alert' })
      }
    }
    void syncTokens()
    const onVoipToken = (event) => {
      const token = event?.detail?.token
      if (token) void upsertMyApnsDeviceToken(supabaseClient, token, { pushChannel: 'voip' })
    }
    const onAlertToken = (event) => {
      const token = event?.detail?.token
      if (token) void upsertMyApnsDeviceToken(supabaseClient, token, { pushChannel: 'alert' })
    }
    window.addEventListener('edge-voip-token', onVoipToken)
    window.addEventListener('edge-push-token', onAlertToken)
    const interval = window.setInterval(() => void syncTokens(), 15000)
    return () => {
      cancelled = true
      window.removeEventListener('edge-voip-token', onVoipToken)
      window.removeEventListener('edge-push-token', onAlertToken)
      window.clearInterval(interval)
    }
  }, [supabaseClient, viewerUserId])

  // Active ring watcher: poll call status every 1.5s while ringing so caller cancellations
  // dismiss incoming UI and CallKit immediately even if Realtime / WebSockets blip.
  useEffect(() => {
    if (!supabaseClient || !incoming?.callId) return undefined
    let cancelled = false
    const callId = incoming.callId
    const checkStatus = async () => {
      try {
        const res = await chatGetCall(supabaseClient, callId)
        const call = res?.call
        if (cancelled) return
        if (!call || ['ended', 'missed', 'declined'].includes(call.status)) {
          setIncoming((prev) => (prev?.callId === callId ? null : prev))
          void endEdgeNativeCall({ callId, reason: 'remote' })
        }
      } catch {
        /* ignore */
      }
    }
    const interval = window.setInterval(() => void checkStatus(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [supabaseClient, incoming?.callId])

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
            void endEdgeNativeCall({ callId: row.id, reason: 'remote' })
            return
          }
          if (activeCallRef.current?.callId === row.id && row.recording_status) {
            setActiveCall((prev) => patchActiveRecording(prev, recordingFieldsFromCall(row)))
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
  const resolveCallerProfileAsyncRef = useRef(resolveCallerProfileAsync)
  resolveCallerProfileAsyncRef.current = resolveCallerProfileAsync

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
      void endEdgeNativeCall({ callId, reason: 'remote' })
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
          const profile = await resolveCallerProfileAsyncRef.current(roomId, call.started_by)
          onOpenRoomRef.current?.(roomId)
          const mediaMode = call.media_mode === 'video' ? 'video' : 'audio'
          setCallbackPrompt({
            roomId,
            mediaMode,
            title: profile.title,
            avatarUrl: profile.avatarUrl,
            isVideo: mediaMode === 'video',
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
    // Clear stash and consume prop immediately so background resume / visibilitychange
    // loops don't re-trigger navigation or missed call prompts repeatedly.
    clearPendingChatCallDeepLink()
    onInitialCallConsumedRef.current?.()

    const intent =
      initialCallIntent === 'callback' || stashed?.intent === 'callback' ? 'callback' : 'ring'
    let cancelled = false
    ;(async () => {
      try {
        const res = await chatGetCall(supabaseClient, callId)
        if (cancelled) return
        const call = res?.call
        if (!call?.id) {
          // Room-only push handoff: try open call for the stashed room.
          const roomFallback = String(stashed?.roomId || '').trim()
          if (roomFallback && intent !== 'callback') {
            try {
              const open = await chatFetchActiveRoomCall(supabaseClient, roomFallback)
              if (!cancelled && open?.id && open.started_by !== viewerUserId) {
                presentIncomingRef.current(open)
                onOpenRoomRef.current?.(roomFallback)
                return
              }
            } catch {
              /* fall through */
            }
          }
          showCallStatusToast('That call is no longer available.')
          void endEdgeNativeCall({ callId, reason: 'remote' })
          return
        }
        const roomId = String(call.chat_room_id || stashed?.roomId || '')

        // Live invite → accept UI ASAP (do NOT await profile first).
        // Waiting on profiles was cancellable on PWA wake → DM opened, overlay never showed.
        if (['ringing', 'active'].includes(call.status) && intent !== 'callback') {
          if (call.started_by === viewerUserId) {
            void endEdgeNativeCall({ callId, reason: 'remote' })
            return
          }
          presentIncomingRef.current(call)
          onOpenRoomRef.current?.(roomId)
          return
        }

        // Missed / ended / declined (or missedCall= deep link) → DM + call-back prompt.
        void endEdgeNativeCall({ callId, reason: 'remote' })
        if (call.started_by === viewerUserId) {
          onOpenRoomRef.current?.(roomId)
          return
        }
        onOpenRoomRef.current?.(roomId)
        const mediaMode = call.media_mode === 'video' ? 'video' : 'audio'
        const profile = await resolveCallerProfileAsyncRef.current(roomId, call.started_by)
        if (cancelled) return
        setCallbackPrompt({
          roomId,
          mediaMode,
          title: profile.title,
          avatarUrl: profile.avatarUrl,
          isVideo: mediaMode === 'video',
        })
      } catch (err) {
        if (!cancelled) {
          showCallStatusToast(err instanceof Error ? err.message : 'Could not open call')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialCallId, initialCallIntent, supabaseClient, viewerUserId, deepLinkRetry, showCallStatusToast])

  /**
   * Join an existing ringing/active call by id (group late-join + accept path).
   * @param {string} callId
   * @param {{
   *   title?: string,
   *   avatarUrl?: string | null,
   *   viewerAvatarUrl?: string | null,
   *   peerUserId?: string | null,
   *   openRoom?: boolean,
   *   preferAccept?: boolean,
   *   startMinimized?: boolean,
   * }} [opts]
   */
  const joinCall = useCallback(
    async (callId, opts = {}) => {
      if (!supabaseClient || !viewerUserId) throw new Error('Sign in to call.')
      const id = String(callId || '').trim()
      if (!id) throw new Error('Missing call.')
      if (activeCallRef.current && activeCallRef.current.callId !== id) {
        throw new Error('Already in a call.')
      }
      if (activeCallRef.current?.callId === id) {
        unlockChatCallAudio()
        enterCallAudioSession()
        const roomId = String(opts.roomId || activeCallRef.current.roomId || '').trim()
        if (roomId && roomId !== activeCallRef.current.roomId) {
          setActiveCall((prev) => (prev ? { ...prev, roomId } : prev))
        }
        // Remounting LiveKitRoom was a wrapper-era unlock retry. IPA media is native.
        if (!isEdgeiOSShell()) {
          setActiveCall((prev) => (prev ? { ...prev, connectNonce: Date.now() } : prev))
        }
        if (opts.openRoom !== false) onOpenRoom?.(roomId || activeCallRef.current.roomId)
        return activeCallRef.current
      }
      unlockChatCallAudio()
      enterCallAudioSession()
      dismissEdgeCallKeyboard()
      setBusy(true)
      setError('')
      try {
        const incomingSnap = incomingRef.current
        const optimisticRoomId = String(opts.roomId || incomingSnap?.roomId || '')
        const optimisticMedia =
          opts.hasVideo || incomingSnap?.mediaMode === 'video' ? 'video' : 'audio'
        if (isEdgeiOSShell()) {
          // Show in-call chrome on answer. Native connect can take a beat.
          const optimistic = {
            callId: id,
            roomId: optimisticRoomId,
            kind: incomingSnap?.kind === 'group_audio' ? 'group_audio' : 'dm_av',
            mediaMode: /** @type {'audio' | 'video'} */ (optimisticMedia),
            token: 'native',
            livekitUrl: 'native',
            viaNative: true,
            title: opts.title || incomingSnap?.title || 'Chat call',
            isOutgoing: false,
            avatarUrl:
              typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim()
                ? opts.avatarUrl.trim()
                : incomingSnap?.avatarUrl || null,
            viewerAvatarUrl:
              typeof opts.viewerAvatarUrl === 'string' && opts.viewerAvatarUrl.trim()
                ? opts.viewerAvatarUrl.trim()
                : null,
            peerUserId:
              typeof opts.peerUserId === 'string' && opts.peerUserId.trim()
                ? opts.peerUserId.trim()
                : incomingSnap?.fromUserId || null,
            callStartedBy: null,
            startMinimized: Boolean(opts.startMinimized),
            ...recordingFieldsFromCall(null),
          }
          endingRef.current = false
          activeCallRef.current = optimistic
          setActiveCall(optimistic)
          setIncoming(null)
          if (opts.openRoom !== false && optimisticRoomId) onOpenRoom?.(optimisticRoomId)
        }
        let res
        if (isEdgeiOSShell()) {
          res = await acceptNativeCall({
            callId: id,
            roomId: opts.roomId,
            hasVideo: opts.hasVideo,
          })
          if (!res.ok) throw new Error(res.error || 'Could not join call')
          if (!res.call) {
            try {
              const fetched = await chatGetCall(supabaseClient, id)
              res = { ...res, call: fetched?.call || fetched }
            } catch {
              /* chrome is already up */
            }
          }
        } else {
          const action = opts.preferAccept ? chatAcceptCall : chatJoinCall
          res = await action(supabaseClient, id)
        }
        const call = res.call
        const roomId = String(call?.chat_room_id || res.roomId || opts.roomId || optimisticRoomId || '')
        if (!call?.id && !(isEdgeiOSShell() && (roomId || id))) {
          throw new Error('Could not join call')
        }
        const resolvedCallId = String(call?.id || id)
        ensureBroadcast(roomId)?.emit('accept', { callId: resolvedCallId })
        let viewerAvatarUrl =
          typeof opts.viewerAvatarUrl === 'string' && opts.viewerAvatarUrl.trim()
            ? opts.viewerAvatarUrl.trim()
            : null
        if (!viewerAvatarUrl) {
          try {
            const viewerSnap = await resolveCallerProfileAsync(roomId, viewerUserId)
            viewerAvatarUrl = viewerSnap.avatarUrl
          } catch {
            /* optional */
          }
        }
        const avatarUrl =
          typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim()
            ? opts.avatarUrl.trim()
            : incomingSnap?.avatarUrl || null
        const callerUserId = call?.started_by
          ? String(call.started_by)
          : (typeof opts.peerUserId === 'string' && opts.peerUserId.trim()
              ? opts.peerUserId.trim()
              : incomingSnap?.fromUserId || null)
        const initialTitle = (opts.title && opts.title !== 'Chat call')
          ? opts.title
          : (incomingSnap?.title && incomingSnap.title !== 'Chat call')
            ? incomingSnap.title
            : 'Chat call'
        endingRef.current = false
        const next = {
          callId: resolvedCallId,
          roomId,
          kind: call?.kind === 'group_audio' ? 'group_audio' : 'dm_av',
          mediaMode: call?.media_mode === 'video' || res.hasVideo ? 'video' : 'audio',
          token: res.token || 'native',
          livekitUrl: res.livekit_url || res.livekitUrl || 'native',
          viaNative: isEdgeiOSShell(),
          title: initialTitle,
          isOutgoing: false,
          avatarUrl,
          viewerAvatarUrl,
          peerUserId: callerUserId,
          callStartedBy: call?.started_by ? String(call.started_by) : null,
          startMinimized: Boolean(opts.startMinimized),
          ...recordingFieldsFromCall(call),
        }
        stopAllChatCallTones()
        activeCallRef.current = next
        setActiveCall(next)
        setIncoming(null)
        if (opts.openRoom !== false) onOpenRoom?.(roomId)

        if (callerUserId && (!avatarUrl || initialTitle === 'Chat call' || initialTitle === 'Incoming call')) {
          void resolveCallerProfileAsync(roomId, callerUserId).then((profile) => {
            if (!profile) return
            setActiveCall((prev) => {
              if (!prev || prev.callId !== resolvedCallId) return prev
              return {
                ...prev,
                title: (!prev.title || prev.title === 'Chat call' || prev.title === 'Incoming call') ? profile.title : prev.title,
                avatarUrl: prev.avatarUrl || profile.avatarUrl,
                peerUserId: prev.peerUserId || callerUserId,
              }
            })
            if (profile.avatarUrl) {
              void preloadEdgeAvatar(profile.avatarUrl)
            }
          })
        }
        return call || { id: resolvedCallId, chat_room_id: roomId }
      } catch (err) {
        if (isEdgeiOSShell()) {
          if (activeCallRef.current?.callId === id) {
            activeCallRef.current = null
            setActiveCall(null)
          }
          void endEdgeNativeCall({ callId: id, reason: 'remote' })
        }
        showCallStatusToast(err instanceof Error ? err.message : 'Could not join call')
        return null
      } finally {
        setBusy(false)
      }
    },
    [
      supabaseClient,
      viewerUserId,
      ensureBroadcast,
      onOpenRoom,
      showCallStatusToast,
      resolveCallerProfileAsync,
    ],
  )

  /**
   * @param {string} roomId
   * @param {'audio' | 'video'} [mediaMode]
   * @param {string} [title]
   * @param {{ avatarUrl?: string | null, viewerAvatarUrl?: string | null, peerUserId?: string | null }} [opts]
   */
  const startCall = useCallback(
    async (roomId, mediaMode = 'audio', title = 'Chat call', opts = {}) => {
      if (!supabaseClient || !viewerUserId) throw new Error('Sign in to call.')
      if (activeCallRef.current) throw new Error('Already in a call.')
      unlockChatCallAudio()
      enterCallAudioSession()
      dismissEdgeCallKeyboard()
      setBusy(true)
      setError('')
      const avatarFromOpts =
        typeof opts?.avatarUrl === 'string' && opts.avatarUrl.trim() ? opts.avatarUrl.trim() : null
      const viewerAvatarFromOpts =
        typeof opts?.viewerAvatarUrl === 'string' && opts.viewerAvatarUrl.trim()
          ? opts.viewerAvatarUrl.trim()
          : null
      const peerUserId =
        typeof opts?.peerUserId === 'string' && opts.peerUserId.trim() ? opts.peerUserId.trim() : null
      try {
        let res
        if (isEdgeiOSShell()) {
          res = await startNativeCall({ roomId, mediaMode, title })
          if (!res.ok) throw new Error(res.error || 'Could not start call')
        } else {
          res = await chatStartCall(supabaseClient, roomId, mediaMode)
        }
        const call = res.call
        if (!call?.id) throw new Error('Could not start call')
        const sub = ensureBroadcast(roomId)
        sub?.emit('invite', {
          callId: call.id,
          kind: call.kind,
          mediaMode: call.media_mode,
        })
        setIncoming(null)
        endingRef.current = false
        let avatarUrl = avatarFromOpts
        if (!avatarUrl && peerUserId) {
          const profile = await resolveCallerProfileAsync(roomId, peerUserId)
          avatarUrl = profile.avatarUrl
        }
        let viewerAvatarUrl = viewerAvatarFromOpts
        if (!viewerAvatarUrl && viewerUserId) {
          try {
            const viewerSnap = await resolveCallerProfileAsync(roomId, viewerUserId)
            viewerAvatarUrl = viewerSnap.avatarUrl
          } catch {
            /* optional */
          }
        }
        stopAllChatCallTones()
        setActiveCall({
          callId: call.id,
          roomId,
          kind: call.kind === 'group_audio' ? 'group_audio' : 'dm_av',
          mediaMode: call.media_mode === 'video' ? 'video' : 'audio',
          token: res.token || 'native',
          livekitUrl: res.livekit_url || res.livekitUrl || 'native',
          viaNative: isEdgeiOSShell(),
          title,
          isOutgoing: true,
          avatarUrl,
          viewerAvatarUrl,
          peerUserId,
          callStartedBy: call.started_by ? String(call.started_by) : viewerUserId,
          ...recordingFieldsFromCall(call),
        })
        return call
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not start call'
        // Group: call already open → join instead of dead-end 409 toast.
        if (/already in progress|in progress/i.test(msg)) {
          try {
            const open = await chatFetchActiveRoomCall(supabaseClient, roomId)
            if (open?.id) {
              setBusy(false)
              return await joinCall(open.id, {
                title,
                avatarUrl: avatarFromOpts,
                viewerAvatarUrl: viewerAvatarFromOpts,
                openRoom: false,
              })
            }
          } catch {
            /* fall through to toast */
          }
        }
        showCallStatusToast(msg)
        return null
      } finally {
        setBusy(false)
      }
    },
    [
      supabaseClient,
      viewerUserId,
      ensureBroadcast,
      showCallStatusToast,
      resolveCallerProfileAsync,
      joinCall,
    ],
  )

  const acceptIncoming = useCallback(async () => {
    stopAllChatCallTones()
    if (!incoming) return
    const snap = incoming
    // Keep the incoming chrome up until joinCall mounts ChatCallSession...
    // clearing early flashes whatever app screen was underneath.
    await joinCall(snap.callId, {
      title: snap.title,
      avatarUrl: snap.avatarUrl || null,
      peerUserId: snap.fromUserId || null,
      preferAccept: snap.kind === 'dm_av',
      openRoom: true,
    })
  }, [incoming, joinCall])

  /**
   * @param {{ message?: string }} [opts]
   * DM only: optional `message` is sent as a normal chat text after decline.
   */
  const declineIncoming = useCallback(async (opts = {}) => {
    stopAllChatCallTones()
    const callId = String(opts.callId || incomingRef.current?.callId || incoming?.callId || '').trim()
    if (!supabaseClient || !callId) return
    if (activeCallRef.current && activeCallRef.current.callId === callId) {
      await hangupRef.current?.()
      return
    }
    const snap = incomingRef.current?.callId === callId ? incomingRef.current : incoming
    const roomId = String(opts.roomId || snap?.roomId || '').trim()
    const kind = snap?.kind === 'group_audio' ? 'group_audio' : 'dm_av'
    const message = typeof opts?.message === 'string' ? opts.message.trim() : ''
    setBusy(true)
    try {
      if (kind === 'dm_av') {
        await chatDeclineCall(supabaseClient, callId)
        if (roomId) ensureBroadcast(roomId)?.emit('decline', { callId })
        if (message) {
          try {
            await chatSendMessage(supabaseClient, {
              roomId,
              body: message,
            })
          } catch {
            // Call already declined; do not block dismiss on message failure.
          }
        }
      }
      if (incomingRef.current?.callId === callId) setIncoming(null)
      void endEdgeNativeCall({ callId })
    } catch (err) {
      showCallStatusToast(err instanceof Error ? err.message : 'Could not decline')
      if (incomingRef.current?.callId === callId) setIncoming(null)
      void endEdgeNativeCall({ callId })
    } finally {
      setBusy(false)
    }
  }, [supabaseClient, incoming, ensureBroadcast, showCallStatusToast])

  const acceptIncomingRef = useRef(acceptIncoming)
  acceptIncomingRef.current = acceptIncoming
  const declineIncomingRef = useRef(declineIncoming)
  declineIncomingRef.current = declineIncoming
  const joinCallRef = useRef(joinCall)
  joinCallRef.current = joinCall
  const hangupRef = useRef(/** @type {(() => Promise<void>) | null} */ (null))

  useEffect(() => {
    return installEdgeCallKitListeners({
      onAnswer: (detail) => {
        stopAllChatCallTones()
        const callId = String(detail?.callId || '').trim()
        if (!callId) return
        if (activeCallRef.current && activeCallRef.current.callId !== callId) return
        const snap = incomingRef.current
        if (snap?.callId && snap.callId !== callId) return
        const callerName = String(detail?.callerName || '').trim()
        const avatarUrl = String(detail?.avatarUrl || '').trim() || null
        const initialTitle = (callerName && callerName !== 'Chat call')
          ? callerName
          : (snap?.title && snap.title !== 'Chat call')
            ? snap.title
            : 'Chat call'
        void joinCallRef.current?.(callId, {
          title: initialTitle,
          avatarUrl: avatarUrl || snap?.avatarUrl || null,
          peerUserId: snap?.fromUserId || null,
          roomId: snap?.roomId || detail?.roomId || '',
          hasVideo: Boolean(detail?.hasVideo),
          preferAccept: true,
          openRoom: true,
          startMinimized: false,
        })
      },
      onEnd: (detail) => {
        const callId = String(detail?.callId || '').trim()
        if (activeCallRef.current && (!callId || activeCallRef.current.callId === callId)) {
          void hangupRef.current?.()
        }
      },
      onDecline: (detail) => {
        const callId = String(detail?.callId || '').trim()
        if (!callId) return
        if (activeCallRef.current && activeCallRef.current.callId === callId) {
          void hangupRef.current?.()
          return
        }
        void declineIncomingRef.current?.({
          callId,
          roomId: String(detail?.roomId || incomingRef.current?.roomId || ''),
        })
      },
      onReveal: (detail) => {
        const callId = String(detail?.callId || '').trim()
        if (!callId) return
        if (activeCallRef.current && activeCallRef.current.callId !== callId) return
        window.dispatchEvent(new CustomEvent('edge-native-call-expand', { detail: { callId } }))
        const snap = incomingRef.current
        const callerName = String(detail?.callerName || '').trim()
        const avatarUrl = String(detail?.avatarUrl || '').trim() || null
        const initialTitle = (callerName && callerName !== 'Chat call')
          ? callerName
          : (snap?.title && snap.title !== 'Chat call')
            ? snap.title
            : 'Chat call'
        void joinCallRef.current?.(callId, {
          title: initialTitle,
          avatarUrl: avatarUrl || snap?.avatarUrl || null,
          peerUserId: snap?.fromUserId || null,
          roomId: snap?.roomId || detail?.roomId || '',
          hasVideo: Boolean(detail?.hasVideo),
          preferAccept: true,
          openRoom: true,
          startMinimized: false,
        })
      },
    })
  }, [])

  // Gate the native replay on a usable session: `joinCall` throws "Sign in to call."
  // without one, and a replayed cold-start answer has no second chance.
  useEffect(() => {
    if (!supabaseClient || !viewerUserId) return
    void markEdgeCallKitWebReady()
  }, [supabaseClient, viewerUserId])

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
        // leave_call: group member exits alone; DM / last participant ends the room.
        const result = await chatLeaveCall(supabaseClient, current.callId)
        if (result?.call_ended !== false) {
          ensureBroadcast(current.roomId)?.emit('end', { callId: current.callId })
        }
      }
    } catch {
      /* still clear local */
    } finally {
      setActiveCall(null)
      setBusy(false)
      endingRef.current = false
      void endEdgeNativeCall({ callId: current.callId })
    }
  }, [supabaseClient, ensureBroadcast])
  hangupRef.current = hangup

  const startRecording = useCallback(async (featuredIdentity = null) => {
    const current = activeCallRef.current
    if (!supabaseClient || !current) return null
    if (current.mediaMode !== 'video') {
      showCallStatusToast('Recording is only available on video calls.')
      return null
    }
    const featured = String(featuredIdentity || '').trim() || null
    try {
      const res = await chatStartRecording(supabaseClient, current.callId, {
        featuredIdentity: featured,
      })
      const call = res?.call || res
      const fields = recordingFieldsFromCall(call)
      setActiveCall((prev) => patchActiveRecording(prev, fields))
      ensureBroadcast(current.roomId)?.emit('recording_started', {
        callId: current.callId,
        startedBy: fields.recordingStartedBy || viewerUserId,
        startedAt: fields.recordingStartedAt,
        maxSeconds: fields.recordingMaxSeconds,
        featuredIdentity: res?.featured_identity || featured,
      })
      playChatCallRecordingCue('started')
      const featuredLabel = String(res?.featured_identity || featured || '').trim()
      if (featuredLabel && featuredLabel === viewerUserId) {
        showCallStatusToast('Recording featuring your camera')
      } else if (featuredLabel) {
        showCallStatusToast('Recording featuring pinned camera')
      }
      return res
    } catch (err) {
      showCallStatusToast(err instanceof Error ? err.message : 'Could not start recording')
      return null
    }
  }, [supabaseClient, ensureBroadcast, showCallStatusToast, viewerUserId])

  const stopRecording = useCallback(async () => {
    const current = activeCallRef.current
    if (!supabaseClient || !current) return null
    // Optimistic: clear the red REC state immediately so Stop feels instant.
    setActiveCall((prev) =>
      patchActiveRecording(prev, {
        recordingStatus: 'stopping',
      }),
    )
    ensureBroadcast(current.roomId)?.emit('recording_stopping', {
      callId: current.callId,
    })
    try {
      const res = await chatStopRecording(supabaseClient, current.callId)
      const call = res?.call || res
      const fields = recordingFieldsFromCall(call)
      setActiveCall((prev) => patchActiveRecording(prev, fields))
      if (fields.recordingStatus === 'ready' || fields.recordingStatus === 'failed') {
        playChatCallRecordingCue('stopped')
        ensureBroadcast(current.roomId)?.emit(
          fields.recordingStatus === 'ready' ? 'recording_ready' : 'recording_failed',
          { callId: current.callId },
        )
        showCallStatusToast(
          fields.recordingStatus === 'ready'
            ? 'Recording saved to chat.'
            : 'Recording failed to save.',
        )
      } else {
        showCallStatusToast('Stopping recording… it will appear in chat shortly.')
      }
      return res
    } catch (err) {
      // Roll back to recording so the starter can tap Stop again.
      setActiveCall((prev) =>
        patchActiveRecording(prev, {
          recordingStatus: 'recording',
        }),
      )
      showCallStatusToast(err instanceof Error ? err.message : 'Could not stop recording')
      return null
    }
  }, [supabaseClient, ensureBroadcast, showCallStatusToast])

  // Webhook / finalize backup while LiveKit is uploading the MP4.
  useEffect(() => {
    if (!supabaseClient || activeCall?.recordingStatus !== 'stopping' || !activeCall?.callId) {
      return undefined
    }
    const callId = activeCall.callId
    let cancelled = false
    const tick = async () => {
      try {
        const res = await chatGetCall(supabaseClient, callId)
        if (cancelled) return
        const call = res?.call || res
        const fields = recordingFieldsFromCall(call)
        setActiveCall((prev) => {
          if (!prev || prev.callId !== callId) return prev
          return patchActiveRecording(prev, fields)
        })
        if (fields.recordingStatus === 'ready' || fields.recordingStatus === 'failed') {
          playChatCallRecordingCue('stopped')
          showCallStatusToast(
            fields.recordingStatus === 'ready'
              ? 'Recording saved to chat.'
              : 'Recording failed to save.',
          )
        }
      } catch {
        /* ignore transient poll errors */
      }
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [supabaseClient, activeCall?.recordingStatus, activeCall?.callId, showCallStatusToast])

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
      joinCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      startRecording,
      stopRecording,
      watchRoom,
      releaseBroadcast,
    }),
    [
      activeCall,
      incoming,
      busy,
      error,
      startCall,
      joinCall,
      acceptIncoming,
      declineIncoming,
      hangup,
      startRecording,
      stopRecording,
      watchRoom,
      releaseBroadcast,
    ],
  )

  return (
    <ChatCallContext.Provider value={value}>
      {children}
      <ChatIncomingCallOverlay
        open={Boolean(incoming) && !activeCall && !callbackPrompt && !isEdgeiOSShell()}
        title={incoming?.title || 'Incoming call'}
        avatarUrl={incoming?.avatarUrl || null}
        subtitle={
          busy
            ? 'Connecting…'
            : incoming?.kind === 'group_audio'
              ? incoming?.mediaMode === 'video'
                ? 'Group video call'
                : 'Group voice call'
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
          void startCall(prompt.roomId, prompt.mediaMode, prompt.title, {
            avatarUrl: prompt.avatarUrl || null,
          })
        }}
      />
      {activeCall ? (
        <Suspense
          fallback={
            activeCall.startMinimized ? null : (
              <div className="fixed inset-0 z-[128] flex items-center justify-center bg-[#09090b] text-[#a1a1aa]">
                Connecting...
              </div>
            )
          }
        >
          <ChatCallSession
            key={`${activeCall.callId}:${activeCall.connectNonce || 0}`}
            initialMinimized={Boolean(activeCall.startMinimized)}
            callId={activeCall.callId}
            token={activeCall.token}
            serverUrl={activeCall.livekitUrl}
            mediaMode={activeCall.mediaMode}
            kind={activeCall.kind}
            title={activeCall.title}
            isOutgoing={Boolean(activeCall.isOutgoing)}
            avatarUrl={activeCall.avatarUrl || null}
            viewerAvatarUrl={activeCall.viewerAvatarUrl || null}
            peerUserId={activeCall.peerUserId || null}
            viewerUserId={viewerUserId}
            callStartedBy={activeCall.callStartedBy || null}
            recordingStatus={activeCall.recordingStatus || 'idle'}
            recordingStartedBy={activeCall.recordingStartedBy || null}
            recordingStartedAt={activeCall.recordingStartedAt || null}
            recordingMaxSeconds={activeCall.recordingMaxSeconds || CHAT_CALL_RECORDING_MAX_SECONDS}
            supabaseClient={supabaseClient}
            onError={(msg) => showCallStatusToast(msg || 'Call connection failed')}
            onDisconnected={() => {
              // End DB call so a drop/disconnect cannot leave a stuck ringing row.
              void hangup()
            }}
            onHangup={() => void hangup()}
            onStartRecording={(featuredIdentity) => void startRecording(featuredIdentity)}
            onStopRecording={() => void stopRecording()}
          />
        </Suspense>
      ) : null}
      {error ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))+5rem)] z-[131] flex justify-center px-4">
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
