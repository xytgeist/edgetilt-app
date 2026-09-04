import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useSpeakingParticipants,
  useStartAudio,
  VideoTrack,
  useRoomContext,
} from '@livekit/components-react'
import { Track, Room, facingModeFromLocalTrack } from 'livekit-client'
import '@livekit/components-styles'
import { applyCallAudioOutput, canToggleCallAudioRoute } from './chatCallAudioOutput.js'
import { enterCallAudioSession, exitCallAudioSession } from './chatCallAudioSession.js'
import { playChatCallRecordingCue } from './chatCallRecordingTone.js'
import {
  startOutgoingRingback,
  stopOutgoingRingback,
  unlockChatCallAudio,
} from './chatCallRingTone.js'
import { CHAT_CALL_RECORDING_MAX_SECONDS } from '../../../utils/chatCallsApi.js'
import { isIosDevice } from '../../../utils/pwaNotificationPrompt.js'
import { isEdgeiOSShell } from '../../../utils/edgeNative.js'
import {
  getNativeCallState,
  markEdgeCallKitDidConnect,
  setNativeCallCamera,
  setNativeCallChrome,
  setNativeCallMute,
  setNativeCallSpeaker,
  setNativeCallStreamFocus,
} from '../../../utils/edgeCallKit.js'
import { CALL_STREAM_DOUBLE_TAP_MS, planCallVideoLayout } from './callVideoLayout.js'

const EMPTY_CAMERA_BY_IDENTITY = new Map()

function useCallStreamTap({ controlsHidden, onReveal, onFocus }) {
  const lastRef = useRef({ at: 0, id: '' })
  return useCallback(
    (identity, event) => {
      event?.stopPropagation?.()
      const now = Date.now()
      const prev = lastRef.current
      const isDouble =
        Boolean(identity) && identity === prev.id && now - prev.at < CALL_STREAM_DOUBLE_TAP_MS
      lastRef.current = { at: now, id: identity || '' }
      if (isDouble) {
        onFocus?.(identity)
        return
      }
      if (controlsHidden) {
        onReveal?.()
        return
      }
      onFocus?.(identity)
    },
    [controlsHidden, onFocus, onReveal],
  )
}

const CALL_PILL_POS_KEY = 'edge_chat_call_pill_pos_v1'
const CALL_PILL_DRAG_THRESHOLD_PX = 8
/** Above incoming overlay (130) / most chrome so the minimized pill floats app-wide. */
const CALL_MINIMIZED_Z = 140

function readStoredPillPos() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CALL_PILL_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.left) || !Number.isFinite(parsed?.top)) return null
    return { left: parsed.left, top: parsed.top }
  } catch {
    return null
  }
}

function writeStoredPillPos(pos) {
  if (typeof window === 'undefined' || !pos) return
  try {
    window.sessionStorage.setItem(CALL_PILL_POS_KEY, JSON.stringify(pos))
  } catch {
    /* private mode */
  }
}

function clampPillPos(left, top, width, height) {
  const margin = 8
  // Approximate safe areas (env() is not readable via getComputedStyle).
  const safeTop = 44
  const safeBottom = 28
  const vw = window.visualViewport?.width || window.innerWidth
  const vh = window.visualViewport?.height || window.innerHeight
  const maxLeft = Math.max(margin, vw - width - margin)
  const maxTop = Math.max(margin + safeTop, vh - height - margin - safeBottom)
  return {
    left: Math.min(maxLeft, Math.max(margin, left)),
    top: Math.min(maxTop, Math.max(margin + safeTop, top)),
  }
}

function defaultPillPos(width, height) {
  const vw = window.visualViewport?.width || window.innerWidth
  const vh = window.visualViewport?.height || window.innerHeight
  return clampPillPos((vw - width) / 2, vh - height - 28, width, height)
}

/**
 * Floating minimized call controls... draggable, app-wide (ChatCallProvider in AppShell).
 */
function DraggableMinimizedCallPill({ avatarUrl, title, onExpand, children }) {
  const pillRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [pos, setPos] = useState(() => readStoredPillPos())
  const posRef = useRef(pos)
  posRef.current = pos
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: /** @type {number | null} */ (null),
    startX: 0,
    startY: 0,
    origLeft: 0,
    origTop: 0,
  })

  const placeDefaultIfNeeded = useCallback(() => {
    const el = pillRef.current
    if (!el) return
    const width = el.offsetWidth || 280
    const height = el.offsetHeight || 64
    setPos((prev) => {
      if (prev) return clampPillPos(prev.left, prev.top, width, height)
      const next = defaultPillPos(width, height)
      writeStoredPillPos(next)
      return next
    })
  }, [])

  useEffect(() => {
    placeDefaultIfNeeded()
    const onResize = () => placeDefaultIfNeeded()
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [placeDefaultIfNeeded])

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return
    const el = pillRef.current
    const current = posRef.current
    if (!el || !current) return
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: current.left,
      origTop: current.top,
    }
    el.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag.active) return
    const el = pillRef.current
    if (!el) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < CALL_PILL_DRAG_THRESHOLD_PX) return
    drag.moved = true
    const width = el.offsetWidth || 280
    const height = el.offsetHeight || 64
    const next = clampPillPos(drag.origLeft + dx, drag.origTop + dy, width, height)
    posRef.current = next
    setPos(next)
  }

  const endDrag = () => {
    const drag = dragRef.current
    if (!drag.active) return
    drag.active = false
    const el = pillRef.current
    if (el && drag.pointerId != null) {
      try {
        el.releasePointerCapture?.(drag.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (drag.moved && posRef.current) writeStoredPillPos(posRef.current)
  }

  const guardClick = (handler) => (event) => {
    if (dragRef.current.moved) {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current.moved = false
      return
    }
    handler?.(event)
  }

  return (
    <div
      ref={pillRef}
      className="pointer-events-auto fixed flex max-w-[min(22rem,calc(100vw-1rem))] cursor-grab items-center justify-between gap-2.5 rounded-[30px] border border-white/20 bg-zinc-900/95 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-2xl active:cursor-grabbing touch-none"
      data-lounge-fab-obstacle=""
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: CALL_MINIMIZED_Z,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="toolbar"
      aria-label="Call controls"
    >
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-zinc-800 touch-manipulation active:opacity-80"
        aria-label="Expand call"
        onClick={guardClick(onExpand)}
      >
        <CallAvatarCircle
          avatarUrl={avatarUrl}
          title={title}
          sizeClass="h-11 w-11"
          textClass="text-[15px]"
        />
      </button>
      <div
        className="flex items-center justify-between gap-2"
        onClickCapture={(event) => {
          if (dragRef.current.moved) {
            event.preventDefault()
            event.stopPropagation()
            dragRef.current.moved = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Floating mini video tile for minimized video calls (WhatsApp style).
 */
function DraggableMinimizedVideoTile({ onExpand, children }) {
  const tileRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [pos, setPos] = useState(() => readStoredPillPos())
  const posRef = useRef(pos)
  posRef.current = pos
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: /** @type {number | null} */ (null),
    startX: 0,
    startY: 0,
    origLeft: 0,
    origTop: 0,
  })

  const placeDefaultIfNeeded = useCallback(() => {
    const el = tileRef.current
    if (!el) return
    const width = el.offsetWidth || 112
    const height = el.offsetHeight || 160
    setPos((prev) => {
      if (prev) return clampPillPos(prev.left, prev.top, width, height)
      const next = defaultPillPos(width, height)
      writeStoredPillPos(next)
      return next
    })
  }, [])

  useEffect(() => {
    placeDefaultIfNeeded()
    const onResize = () => placeDefaultIfNeeded()
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [placeDefaultIfNeeded])

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return
    const el = tileRef.current
    const current = posRef.current
    if (!el || !current) return
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: current.left,
      origTop: current.top,
    }
    el.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag.active) return
    const el = tileRef.current
    if (!el) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < CALL_PILL_DRAG_THRESHOLD_PX) return
    drag.moved = true
    const width = el.offsetWidth || 112
    const height = el.offsetHeight || 160
    const next = clampPillPos(drag.origLeft + dx, drag.origTop + dy, width, height)
    posRef.current = next
    setPos(next)
  }

  const endDrag = () => {
    const drag = dragRef.current
    if (!drag.active) return
    drag.active = false
    const el = tileRef.current
    if (el && drag.pointerId != null) {
      try {
        el.releasePointerCapture?.(drag.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (drag.moved && posRef.current) writeStoredPillPos(posRef.current)
  }

  const guardClick = (handler) => (event) => {
    if (dragRef.current.moved) {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current.moved = false
      return
    }
    handler?.(event)
  }

  return (
    <div
      ref={tileRef}
      className="pointer-events-auto fixed flex h-40 w-28 cursor-grab items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-zinc-950 shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl active:cursor-grabbing touch-none select-none"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: CALL_MINIMIZED_Z,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={guardClick(onExpand)}
      role="button"
      aria-label="Expand video call"
    >
      {children}
    </div>
  )
}

/**
 * Confirmation modal before switching from audio to video (Image 1).
 */
function SwitchToVideoConfirmModal({ onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 px-6 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[20rem] rounded-[28px] border border-white/10 bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[19px] font-semibold tracking-tight text-white">
          Switch to video call?
        </h3>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            className="flex-1 rounded-2xl border border-white/10 bg-zinc-800/90 py-3.5 text-[15px] font-semibold text-zinc-200 transition active:scale-95 touch-manipulation hover:bg-zinc-700/80"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex-1 rounded-2xl bg-white/15 py-3.5 text-[15px] font-semibold text-white shadow-lg transition active:scale-95 touch-manipulation hover:bg-white/20"
            onClick={onConfirm}
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   token: string,
 *   serverUrl: string,
 *   mediaMode: 'audio' | 'video',
 *   kind: 'dm_av' | 'group_audio',
 *   callId?: string | null,
 *   title: string,
 *   initialMinimized?: boolean,
 *   isOutgoing?: boolean,
 *   avatarUrl?: string | null,
 *   viewerAvatarUrl?: string | null,
 *   peerUserId?: string | null,
 *   viewerUserId?: string | null,
 *   callStartedBy?: string | null,
 *   recordingStatus?: 'idle' | 'recording' | 'stopping' | 'ready' | 'failed',
 *   recordingStartedBy?: string | null,
 *   recordingStartedAt?: string | null,
 *   recordingMaxSeconds?: number,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onDisconnected: () => void,
 *   onHangup: () => void,
 *   onStartRecording?: (featuredIdentity?: string | null) => void,
 *   onStopRecording?: () => void,
 *   onError?: (msg: string) => void,
 * }} props
 */
export default function ChatCallSession(props) {
  if (isEdgeiOSShell()) {
    return <NativeIpaCallSession {...props} />
  }
  return <WebLiveKitCallSession {...props} />
}

function WebLiveKitCallSession({
  token,
  serverUrl,
  mediaMode,
  kind,
  callId = null,
  title,
  initialMinimized = false,
  isOutgoing = false,
  avatarUrl = null,
  viewerAvatarUrl = null,
  peerUserId = null,
  viewerUserId = null,
  callStartedBy = null,
  recordingStatus = 'idle',
  recordingStartedBy = null,
  recordingStartedAt = null,
  recordingMaxSeconds = CHAT_CALL_RECORDING_MAX_SECONDS,
  supabaseClient = null,
  onDisconnected,
  onHangup,
  onStartRecording,
  onStopRecording,
  onError,
}) {
  const videoEnabled = mediaMode === 'video'
  const isGroup = kind === 'group_audio'
  // 1:1 voice: HTML <audio> is more reliable on iPhone. Group keeps webAudioMix
  // so multi-remote mics don't stay silent under autoplay.
  const useWebAudioMix = isGroup || videoEnabled
  const [connectError, setConnectError] = useState('')
  const [minimized, setMinimized] = useState(Boolean(initialMinimized))
  const didConnectRef = useRef(false)

  // Ear/cheek against the glass was panning the page under the call overlay.
  useEffect(() => {
    if (minimized) return undefined
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverscroll = html.style.overscrollBehavior
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    const onTouchMove = (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        event.preventDefault()
        return
      }
      if (target.closest('[data-chat-call-interactive]')) return
      event.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.overscrollBehavior = prevHtmlOverscroll
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
    }
  }, [minimized])

  // Reset iOS audio session when the whole session tree unmounts (hangup / drop).
  useEffect(() => {
    return () => {
      exitCallAudioSession()
    }
  }, [])

  return (
    <div
      className={
        minimized
          ? 'pointer-events-none fixed inset-0'
          : 'fixed inset-0 flex flex-col bg-[#0b141a]'
      }
      style={{
        zIndex: minimized ? CALL_MINIMIZED_Z : 128,
        ...(minimized
          ? null
          : {
              width: '100vw',
              height: '100dvh',
              maxHeight: '100dvh',
              touchAction: 'none',
              overscrollBehavior: 'none',
            }),
      }}
      data-chat-feature
      data-chat-call-session
      data-lk-theme="default"
      data-call-minimized={minimized ? '1' : '0'}
    >
      {/* Keep LiveKitRoom mounted on error so we do not unmount→disconnect→silent hangup. */}
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={!connectError}
        audio
        video={videoEnabled}
        options={{ webAudioMix: useWebAudioMix }}
        onConnected={() => {
          didConnectRef.current = true
          setConnectError('')
          void markEdgeCallKitDidConnect()
          unlockChatCallAudio()
          // Matches CallChrome's initial speakerOn intent; CallChrome re-applies the
          // authoritative route once the room exists.
          enterCallAudioSession({ isVideo: videoEnabled, preferSpeaker: Boolean(videoEnabled) })
        }}
        onDisconnected={() => {
          exitCallAudioSession()
          // Only auto-end after a real session. Failed connects stay on the error UI.
          if (didConnectRef.current) onDisconnected?.()
        }}
        onError={(err) => {
          const msg = err instanceof Error ? err.message : String(err || 'LiveKit error')
          setConnectError(msg)
          onError?.(msg)
        }}
        className={minimized ? 'contents' : 'flex h-full min-h-0 flex-col'}
      >
        {connectError ? (
          <div
            data-chat-call-interactive=""
            className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-950 via-[#0a1018] to-zinc-950 px-6 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/30 bg-rose-950/40 text-rose-400 shadow-xl backdrop-blur-md">
              <HangupIcon />
            </div>
            <p className="text-[17px] font-bold text-white tracking-tight">Could not connect to call</p>
            <p className="max-w-sm text-[13px] text-zinc-400">{connectError}</p>
            <p className="max-w-sm text-[12px] text-zinc-500">
              Allow microphone access if prompted. Keep Edge open during calls.
            </p>
            <button
              type="button"
              className="mt-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-2.5 text-[14px] font-semibold text-white shadow-lg backdrop-blur-md transition active:scale-95 touch-manipulation hover:bg-white/15"
              onClick={onHangup}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <CallChrome
              title={title}
              callId={callId}
              videoEnabled={videoEnabled}
              isGroup={isGroup}
              isOutgoing={isOutgoing}
              avatarUrl={avatarUrl}
              viewerAvatarUrl={viewerAvatarUrl}
              peerUserId={peerUserId}
              viewerUserId={viewerUserId}
              callStartedBy={callStartedBy}
              recordingStatus={recordingStatus}
              recordingStartedBy={recordingStartedBy}
              recordingStartedAt={recordingStartedAt}
              recordingMaxSeconds={recordingMaxSeconds}
              supabaseClient={supabaseClient}
              minimized={minimized}
              onMinimize={() => setMinimized(true)}
              onExpand={() => setMinimized(false)}
              onHangup={onHangup}
              onStartRecording={onStartRecording}
              onStopRecording={onStopRecording}
            />
            <RoomAudioRenderer />
            <CallStartAudioGate />
          </>
        )}
      </LiveKitRoom>
    </div>
  )
}

/** Visible only while the browser blocks remote call audio (autoplay). */
function CallStartAudioGate() {
  const room = useRoomContext()
  const { mergedProps, canPlayAudio } = useStartAudio({
    room,
    props: {
      className:
        'pointer-events-auto fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))+6.5rem)] z-[132] mx-auto block max-w-xs rounded-full bg-[#25d366] px-4 py-3 text-center text-[14px] font-semibold text-white shadow-lg touch-manipulation',
      type: 'button',
      'data-chat-call-interactive': '',
    },
  })

  // Keep kicking startAudio while blocked... iPhone often needs a second gesture-adjacent resume.
  useEffect(() => {
    if (!room || canPlayAudio) return undefined
    const kick = () => {
      unlockChatCallAudio()
      void room.startAudio?.().catch(() => {})
    }
    kick()
    const id = window.setInterval(kick, 2000)
    return () => window.clearInterval(id)
  }, [room, canPlayAudio])

  if (canPlayAudio) return null
  return <button {...mergedProps}>Tap for call audio</button>
}

/**
 * IPA chrome only. Media is the native LiveKit room. Do not mount LiveKitRoom here.
 */
function NativeIpaCallSession({
  mediaMode,
  kind,
  callId = null,
  title,
  initialMinimized = false,
  isOutgoing = false,
  avatarUrl = null,
  viewerAvatarUrl = null,
  peerUserId = null,
  viewerUserId = null,
  callStartedBy = null,
  supabaseClient = null,
  recordingStatus = 'idle',
  recordingStartedBy = null,
  recordingStartedAt = null,
  recordingMaxSeconds = CHAT_CALL_RECORDING_MAX_SECONDS,
  onDisconnected,
  onHangup,
  onStartRecording,
  onStopRecording,
  onError,
}) {
  const videoEnabled = mediaMode === 'video'
  const isGroup = kind === 'group_audio'
  const [minimized, setMinimized] = useState(Boolean(initialMinimized))
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(videoEnabled)
  const [hasVideo, setHasVideo] = useState(Boolean(videoEnabled))
  const [remoteHasVideo, setRemoteHasVideo] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(() => Boolean(videoEnabled))
  const [remoteCount, setRemoteCount] = useState(0)
  const [nativeRoster, setNativeRoster] = useState(
    () =>
      /** @type {{ identity: string, name: string, isLocal: boolean, isSpeaking: boolean }[]} */ (
        []
      ),
  )
  const [connected, setConnected] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [recCountdownLabel, setRecCountdownLabel] = useState(/** @type {string | null} */ (null))
  const [pinnedIdentity, setPinnedIdentity] = useState(/** @type {string | null} */ (null))
  const [quadFocus, setQuadFocus] = useState(false)
  const [showVideoConfirmModal, setShowVideoConfirmModal] = useState(false)
  const [controlsHidden, setControlsHidden] = useState(false)
  const hideTimerRef = useRef(/** @type {number | null} */ (null))
  const hadRemoteRef = useRef(false)
  const didConnectRef = useRef(false)
  const recWarn60Ref = useRef(false)
  const recWarn15Ref = useRef(false)
  const recAutoStopRef = useRef(false)

  if (remoteCount > 0) hadRemoteRef.current = true
  // IPA ringback is native (`EdgeOutgoingRingback`). Do not start Web Audio here...
  // CallKit playAndRecord ducks it, and leftover oscillators ding after connect.
  const awaitingAnswer =
    Boolean(isOutgoing) && !hadRemoteRef.current && remoteCount === 0

  const isVideoMode = (videoEnabled || camOn || hasVideo || remoteHasVideo) && !awaitingAnswer

  const resetControlsTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setControlsHidden(false)
    if (isVideoMode) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsHidden(true)
      }, 4500)
    }
  }, [isVideoMode])

  useEffect(() => {
    if (isVideoMode) {
      resetControlsTimer()
    } else {
      setControlsHidden(false)
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [isVideoMode, resetControlsTimer])

  const focusNativeRemote = useCallback((id) => {
    if (id === '__quad_restore__') {
      setQuadFocus(false)
      setPinnedIdentity(null)
      return
    }
    const next = String(id || '').trim()
    if (!next) return
    const localId = nativeRoster.find((p) => p.isLocal)?.identity
    if (localId && next === localId) return
    setPinnedIdentity(next)
    if (nativeRoster.length === 4 || remoteCount + 1 === 4) setQuadFocus(true)
  }, [nativeRoster, remoteCount])

  const onNativeStreamTap = useCallStreamTap({
    controlsHidden,
    onReveal: resetControlsTimer,
    onFocus: focusNativeRemote,
  })

  const recordingActive = recordingStatus === 'recording'
  const recordingSaving = recordingStatus === 'stopping'
  const isRecordingStarter =
    Boolean(viewerUserId) && Boolean(recordingStartedBy) && viewerUserId === recordingStartedBy
  const isCallInitiator =
    Boolean(viewerUserId) && Boolean(callStartedBy) && viewerUserId === callStartedBy
  const canStopRecording = isRecordingStarter || isCallInitiator

  useEffect(() => {
    const apply = (detail) => {
      if (!detail) return
      if (callId && detail.callId && String(detail.callId) !== String(callId)) return
      if (typeof detail.remoteCount === 'number') setRemoteCount(detail.remoteCount)
      if (Array.isArray(detail.participants)) {
        setNativeRoster(
          detail.participants
            .map((row) => {
              const identity = String(row?.identity || '').trim()
              if (!identity) return null
              return {
                identity,
                name: String(row?.name || '').trim(),
                isLocal: Boolean(row?.isLocal),
                isSpeaking: Boolean(row?.isSpeaking),
              }
            })
            .filter(Boolean),
        )
      }
      if (typeof detail.micOn === 'boolean') setMicOn(detail.micOn)
      if (typeof detail.camOn === 'boolean') setCamOn(detail.camOn)
      if (typeof detail.hasVideo === 'boolean') setHasVideo(detail.hasVideo)
      if (typeof detail.remoteHasVideo === 'boolean') setRemoteHasVideo(detail.remoteHasVideo)
      if (typeof detail.speakerOn === 'boolean') setSpeakerOn(detail.speakerOn)
      if (typeof detail.connected === 'boolean') {
        setConnected(detail.connected)
        if (detail.connected) {
          didConnectRef.current = true
          setConnectError('')
          void markEdgeCallKitDidConnect()
        } else if (didConnectRef.current) {
          onDisconnected?.()
        }
      }
      if (detail.error) {
        setConnectError(String(detail.error))
        onError?.(String(detail.error))
      }
    }
    const onState = (event) => apply(event?.detail || {})
    window.addEventListener('edge-native-call-state', onState)
    void getNativeCallState().then(apply)
    return () => {
      window.removeEventListener('edge-native-call-state', onState)
    }
  }, [callId, onDisconnected, onError])

  useEffect(() => {
    const onExpand = (event) => {
      const id = String(event?.detail?.callId || '').trim()
      if (id && callId && id !== String(callId)) return
      setMinimized(false)
    }
    window.addEventListener('edge-native-call-expand', onExpand)
    return () => window.removeEventListener('edge-native-call-expand', onExpand)
  }, [callId])

  useEffect(() => {
    return () => {
      void setNativeCallChrome({ minimized: true, videoVisible: false })
    }
  }, [])

  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (recordingStatus !== 'recording' || !recordingStartedAt) {
      setRecCountdownLabel(null)
      recWarn60Ref.current = false
      recWarn15Ref.current = false
      recAutoStopRef.current = false
      return undefined
    }
    const maxSec = Math.max(1, Number(recordingMaxSeconds) || CHAT_CALL_RECORDING_MAX_SECONDS)
    const startedMs = Date.parse(recordingStartedAt)
    if (!Number.isFinite(startedMs)) return undefined
    const tick = () => {
      const elapsedRec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
      const left = Math.max(0, maxSec - elapsedRec)
      if (left <= 60 && left > 15) {
        setRecCountdownLabel(`Recording ends in ${left}s`)
        if (!recWarn60Ref.current) {
          recWarn60Ref.current = true
          playChatCallRecordingCue('warn_60')
        }
      } else if (left <= 15 && left > 0) {
        setRecCountdownLabel(`Recording ends in ${left}s`)
        if (!recWarn15Ref.current) {
          recWarn15Ref.current = true
          playChatCallRecordingCue('warn_15')
        }
      } else if (left <= 0) {
        setRecCountdownLabel('Stopping recording…')
        if (!recAutoStopRef.current && canStopRecording) {
          recAutoStopRef.current = true
          onStopRecording?.()
        }
      } else {
        setRecCountdownLabel(null)
      }
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [recordingStatus, recordingStartedAt, recordingMaxSeconds, onStopRecording, canStopRecording])

  const participantIds = useMemo(
    () => nativeRoster.map((p) => p.identity).filter(Boolean),
    [nativeRoster],
  )
  const nativeRemotes = useMemo(
    () => nativeRoster.filter((p) => !p.isLocal),
    [nativeRoster],
  )
  const focusedIdentity = useMemo(() => {
    if (pinnedIdentity && nativeRemotes.some((p) => p.identity === pinnedIdentity)) {
      return pinnedIdentity
    }
    return nativeRemotes[0]?.identity || null
  }, [pinnedIdentity, nativeRemotes])
  const nativePeopleCount = nativeRoster.length > 0 ? nativeRoster.length : remoteCount + 1
  const nativeQuadFocus = quadFocus && nativePeopleCount === 4

  useEffect(() => {
    if (nativePeopleCount !== 4) setQuadFocus(false)
  }, [nativePeopleCount])

  useEffect(() => {
    if (!isVideoMode) return
    void setNativeCallStreamFocus({
      isLocalMain: false,
      focusedIdentity: nativeQuadFocus || nativePeopleCount !== 4 ? focusedIdentity || '' : '',
      quadFocus: nativeQuadFocus,
    })
  }, [isVideoMode, focusedIdentity, nativeQuadFocus, nativePeopleCount])
  const profileById = useCallParticipantProfiles(supabaseClient, participantIds)
  const speakingIds = useMemo(() => {
    const set = new Set()
    for (const p of nativeRoster) {
      if (p.isSpeaking && p.identity) set.add(p.identity)
    }
    return set
  }, [nativeRoster])
  const resolveAvatarForParticipant = (participant) => {
    if (!participant) return null
    const fromProfile = profileById.get(participant.identity)?.avatarUrl || null
    if (participant.isLocal) return viewerAvatarUrl || fromProfile
    if (peerUserId && participant.identity === peerUserId) return avatarUrl || fromProfile
    if (!isGroup) return avatarUrl || fromProfile
    return fromProfile
  }
  const resolveNameForParticipant = (participant) => {
    if (!participant) return 'Caller'
    if (participant.isLocal) return 'You'
    const fromProfile = profileById.get(participant.identity)?.title
    if (fromProfile) return fromProfile
    if (participant.name) return participant.name
    if (!isGroup) return title || 'Caller'
    return participant.identity?.slice(0, 8) || 'Caller'
  }
  const showGroupAudioStage =
    isGroup && !awaitingAnswer && !isVideoMode && nativeRoster.length > 0

  useEffect(() => {
    void setNativeCallChrome({
      minimized,
      videoVisible: isVideoMode,
      controlsHidden,
      participantAvatars: nativeRoster.map((p) => ({
        identity: p.identity,
        name: resolveNameForParticipant(p),
        avatarUrl: resolveAvatarForParticipant(p) || '',
      })),
    })
  }, [minimized, isVideoMode, controlsHidden, nativeRoster, profileById, viewerAvatarUrl, avatarUrl])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const inCallCount = nativeRoster.length > 0 ? nativeRoster.length : remoteCount + 1
  const statusLabel = connectError
    ? 'Could not connect'
    : awaitingAnswer
      ? 'Ringing…'
      : !connected
        ? 'Connecting…'
        : `${mm}:${ss}${isGroup ? ` · ${inCallCount} in call` : ''}${
            recordingActive ? ' · REC' : recordingSaving ? ' · Saving recording…' : ''
          }`

  // Only end a ghost group after someone else was actually in the room.
  // Do not fire while the starter is still waiting for the first answer.
  const onHangupRef = useRef(onHangup)
  onHangupRef.current = onHangup
  useEffect(() => {
    if (!isGroup || remoteCount > 0 || !hadRemoteRef.current) return undefined
    const t = window.setTimeout(() => onHangupRef.current?.(), 4000)
    return () => window.clearTimeout(t)
  }, [isGroup, remoteCount])

  const setMicEnabled = (next) => {
    setMicOn(next)
    void setNativeCallMute(!next)
  }
  const setCameraEnabled = (next) => {
    setCamOn(next)
    setHasVideo(next || remoteHasVideo)
    void setNativeCallCamera({ enabled: next })
    if (next) {
      applySpeaker(true)
    }
  }
  const applySpeaker = (next) => {
    setSpeakerOn(next)
    void setNativeCallSpeaker(next)
  }

  const handleVideoDockClick = () => {
    resetControlsTimer()
    if (!camOn && !isVideoMode) {
      setShowVideoConfirmModal(true)
    } else {
      setCameraEnabled(!camOn)
    }
  }

  const showVideoHole = isVideoMode && !minimized

  useEffect(() => {
    const html = document.documentElement
    if (showVideoHole) {
      html.setAttribute('data-edge-video-active', '1')
    } else {
      html.removeAttribute('data-edge-video-active')
    }
    return () => {
      html.removeAttribute('data-edge-video-active')
    }
  }, [showVideoHole])

  if (minimized) {
    if (isVideoMode) {
      // In native iOS shell, the native LiveKit video PiP is brought to front and floating above the webview.
      return null
    }
    return (
      <DraggableMinimizedCallPill avatarUrl={avatarUrl} title={title} onExpand={() => setMinimized(false)}>
        <CallPillButton
          icon={<MicIcon muted={!micOn} />}
          variant={!micOn ? 'danger' : 'default'}
          onClick={() => setMicEnabled(!micOn)}
          ariaLabel={micOn ? 'Mute microphone' : 'Unmute microphone'}
        />
        <CallPillButton
          icon={<VideoIcon off={!camOn} />}
          active={camOn}
          variant={!camOn && remoteHasVideo ? 'active-white' : undefined}
          onClick={() => {
            setMinimized(false)
            if (!camOn && !isVideoMode) {
              setShowVideoConfirmModal(true)
            } else {
              setCameraEnabled(!camOn)
            }
          }}
          ariaLabel={camOn ? 'Turn camera off' : 'Turn camera on'}
        />
        <CallPillButton
          icon={<SpeakerIcon />}
          variant={speakerOn ? 'active-white' : 'default'}
          onClick={() => applySpeaker(!speakerOn)}
          ariaLabel={speakerOn ? 'Speakerphone on' : 'Earpiece'}
        />
        <CallPillButton
          icon={<HangupIcon />}
          variant="danger"
          onClick={() => onHangup?.()}
          ariaLabel="Hang up"
        />
      </DraggableMinimizedCallPill>
    )
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 128,
        backgroundColor: showVideoHole ? 'transparent' : undefined,
        width: '100vw',
        height: '100dvh',
      }}
      data-chat-feature
      data-chat-call-session
      data-native-ipa-call="1"
    >
      {!showVideoHole ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950 via-[#0a1018] to-zinc-950">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 18%, rgba(6,182,212,0.12) 0%, transparent 60%), radial-gradient(circle at 50% 82%, rgba(59,130,246,0.08) 0%, transparent 60%)',
            }}
          />
        </div>
      ) : null}

      {/* Top Header - slides up when controlsHidden in video mode */}
      <div
        className={`relative z-[1] flex shrink-0 items-start justify-between px-4 pb-2 transition-all duration-300 ease-in-out ${
          controlsHidden ? '-translate-y-28 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
        style={{ paddingTop: 'calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px)) + 0.75rem)' }}
      >
        <button
          type="button"
          data-chat-call-interactive=""
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur-xl transition active:scale-95 touch-manipulation hover:bg-white/15"
          aria-label="Minimize call"
          onClick={() => setMinimized(true)}
        >
          <MinimizeIcon />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate text-[20px] font-bold tracking-tight text-white drop-shadow-sm">{title}</p>
          <p className="mt-1 font-mono text-[13px] font-medium tracking-wide text-zinc-300/90">{statusLabel}</p>
          {connectError ? (
            <p className="mt-1.5 text-[12px] font-semibold text-rose-300">{connectError}</p>
          ) : null}
          {!camOn && remoteHasVideo ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/70 px-3 py-0.5 text-[11px] font-bold tracking-wide text-emerald-200 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
              {title} turned on video
            </div>
          ) : null}
          {recordingActive ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-950/60 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-200 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" aria-hidden />
              Recording
            </div>
          ) : null}
          {recCountdownLabel ? (
            <p className="mt-1.5 text-[12px] font-semibold text-amber-300">{recCountdownLabel}</p>
          ) : null}
        </div>
        <div className="h-11 w-11 shrink-0" aria-hidden />
      </div>

      {/* Main Stage */}
      <div className="relative z-[1] min-h-0 flex-1 px-4">
        {showVideoHole ? (
          <VideoCallStage
            hitOnly
            remotes={nativeRemotes}
            localParticipant={nativeRoster.find((p) => p.isLocal) || { identity: viewerUserId, isLocal: true }}
            featuredIdentity={nativeQuadFocus || nativePeopleCount !== 4 ? focusedIdentity : null}
            quadFocus={nativeQuadFocus}
            controlsHidden={controlsHidden}
            cameraByIdentity={EMPTY_CAMERA_BY_IDENTITY}
            participantHasLiveCamera={() => false}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            title={title}
            showLocalFlip={Boolean(camOn)}
            onFlipCamera={() => {
              resetControlsTimer()
              void setNativeCallCamera({ flip: true })
            }}
            onActivateRemote={onNativeStreamTap}
            onActivateMain={(event) => {
              if (nativeQuadFocus) onNativeStreamTap('__quad_restore__', event)
              else if (controlsHidden) resetControlsTimer()
              else setControlsHidden(true)
            }}
            onActivateYou={(event) => {
              event?.stopPropagation?.()
              if (controlsHidden) resetControlsTimer()
              else setControlsHidden(true)
            }}
          />
        ) : showGroupAudioStage ? (
          <GroupAudioStage
            participants={nativeRoster}
            speakingIds={speakingIds}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            resolveNameForParticipant={resolveNameForParticipant}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center pb-6">
            <CallAvatarCircle
              avatarUrl={avatarUrl}
              title={title}
              sizeClass="h-44 w-44"
              textClass="text-[52px]"
              ring
            />
          </div>
        )}
      </div>

      {/* Bottom Controls - slides down when controlsHidden in video mode */}
      <div
        className={`relative z-[1] flex shrink-0 justify-center px-4 pt-2 transition-all duration-300 ease-in-out ${
          controlsHidden
            ? nativePeopleCount >= 5
              ? 'translate-y-24 opacity-0 pointer-events-none'
              : 'translate-y-36 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
        style={{
          paddingBottom:
            nativePeopleCount >= 5
              ? 'max(0.35rem, max(env(safe-area-inset-bottom,0px), var(--edge-sab,0px)))'
              : 'calc(max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)) + 1.25rem)',
        }}
      >
        {isVideoMode ? (
          <div
            data-chat-call-interactive=""
            className={`pointer-events-auto mx-auto flex items-center justify-between rounded-full border border-white/10 bg-zinc-950/85 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150 ${
              nativePeopleCount >= 5
                ? 'w-auto max-w-[16rem] gap-1 px-2 py-1.5'
                : 'w-full max-w-[22.5rem] px-4 py-3'
            }`}
          >
            <VideoRecordDockItem
              compact={nativePeopleCount >= 5}
              recordingActive={recordingActive}
              recordingSaving={recordingSaving}
              canStopRecording={canStopRecording}
              onStart={() => onStartRecording?.(focusedIdentity)}
              onStop={() => onStopRecording?.()}
              onInteract={resetControlsTimer}
            />
            <CallDockItem
              compact={nativePeopleCount >= 5}
              icon={<VideoIcon off={!camOn} />}
              label="Video"
              active={camOn}
              variant={!camOn && remoteHasVideo ? 'active-white' : undefined}
              disabled={false}
              onClick={handleVideoDockClick}
            />
            <CallDockItem
              compact={nativePeopleCount >= 5}
              icon={<SpeakerIcon />}
              label="Speaker"
              active={speakerOn}
              variant={speakerOn ? 'active-white' : 'default'}
              onClick={() => {
                resetControlsTimer()
                applySpeaker(!speakerOn)
              }}
            />
            <CallDockItem
              compact={nativePeopleCount >= 5}
              icon={<MicIcon muted={!micOn} />}
              label="Mute"
              active={!micOn}
              variant={!micOn ? 'danger' : 'default'}
              onClick={() => {
                resetControlsTimer()
                setMicEnabled(!micOn)
              }}
            />
            <CallDockItem
              compact={nativePeopleCount >= 5}
              icon={<HangupIcon />}
              label="End"
              variant="danger"
              onClick={() => {
                resetControlsTimer()
                onHangup?.()
              }}
            />
          </div>
        ) : (
          /* Same one-row pill as video, minus Record. Flip is not on voice. */
          <div
            data-chat-call-interactive=""
            className="pointer-events-auto mx-auto flex w-full max-w-[22.5rem] items-center justify-between rounded-full border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150"
          >
            <CallDockItem
              icon={<VideoIcon off={!camOn} />}
              label="Video"
              active={camOn}
              variant={!camOn && remoteHasVideo ? 'active-white' : undefined}
              disabled={false}
              onClick={handleVideoDockClick}
            />
            <CallDockItem
              icon={<SpeakerIcon />}
              label="Speaker"
              active={speakerOn}
              variant={speakerOn ? 'active-white' : 'default'}
              onClick={() => applySpeaker(!speakerOn)}
            />
            <CallDockItem
              icon={<MicIcon muted={!micOn} />}
              label="Mute"
              active={!micOn}
              variant={!micOn ? 'danger' : 'default'}
              onClick={() => setMicEnabled(!micOn)}
            />
            <CallDockItem
              icon={<HangupIcon />}
              label="End"
              variant="danger"
              onClick={() => onHangup?.()}
            />
          </div>
        )}
      </div>

      {showVideoConfirmModal ? (
        <SwitchToVideoConfirmModal
          onCancel={() => setShowVideoConfirmModal(false)}
          onConfirm={() => {
            setShowVideoConfirmModal(false)
            setCameraEnabled(true)
          }}
        />
      ) : null}
    </div>
  )
}

function CallChrome({
  title,
  videoEnabled,
  isGroup,
  isOutgoing,
  avatarUrl,
  viewerAvatarUrl,
  peerUserId,
  viewerUserId,
  callStartedBy = null,
  recordingStatus = 'idle',
  recordingStartedBy = null,
  recordingStartedAt = null,
  recordingMaxSeconds = CHAT_CALL_RECORDING_MAX_SECONDS,
  supabaseClient,
  minimized,
  onMinimize,
  onExpand,
  onHangup,
  onStartRecording,
  onStopRecording,
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const speakingParticipants = useSpeakingParticipants()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(videoEnabled)
  /** Voice defaults earpiece; video defaults speakerphone. */
  const [speakerOn, setSpeakerOn] = useState(() => Boolean(videoEnabled))
  /** Starts false; Android may enable after probe. iPhone always stays false. */
  const [audioRouteSupported, setAudioRouteSupported] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recCountdownLabel, setRecCountdownLabel] = useState(/** @type {string | null} */ (null))
  const [pinnedIdentity, setPinnedIdentity] = useState(/** @type {string | null} */ (null))
  const [quadFocus, setQuadFocus] = useState(false)
  /** Last pinned participant object so active-speaker cannot steal if the pin blips out of the roster. */
  /** User manually toggled speaker... ignore cam-off / cam-on auto route flips. */
  const speakerManualOverrideRef = useRef(false)
  const [showVideoConfirmModal, setShowVideoConfirmModal] = useState(false)
  const [controlsHidden, setControlsHidden] = useState(false)
  const hideTimerRef = useRef(/** @type {number | null} */ (null))
  const recWarn60Ref = useRef(false)
  const recWarn15Ref = useRef(false)
  const recAutoStopRef = useRef(false)

  const recordingActive = recordingStatus === 'recording'
  const recordingSaving = recordingStatus === 'stopping'
  const isRecordingStarter =
    Boolean(viewerUserId) && Boolean(recordingStartedBy) && viewerUserId === recordingStartedBy
  const isCallInitiator =
    Boolean(viewerUserId) && Boolean(callStartedBy) && viewerUserId === callStartedBy
  /** Recording starter can stop their segment; call initiator can always kill recording. */
  const canStopRecording = isRecordingStarter || isCallInitiator

  const remoteCount = participants.filter((p) => !p.isLocal).length
  const hadRemoteRef = useRef(false)
  if (remoteCount > 0) hadRemoteRef.current = true
  // Only ringback while waiting for first answer... never again after a remote joined
  // (callee hangup briefly drops remoteCount to 0 before we tear down).
  const awaitingAnswer = Boolean(isOutgoing) && !hadRemoteRef.current && remoteCount === 0

  // Voice only: live STT after answer (no recording card).
  const participantIds = useMemo(
    () => participants.map((p) => p.identity).filter(Boolean),
    [participants],
  )
  const profileById = useCallParticipantProfiles(supabaseClient, participantIds)

  const speakingIds = useMemo(() => {
    const set = new Set()
    for (const p of speakingParticipants || []) {
      if (p?.identity) set.add(p.identity)
    }
    for (const p of participants) {
      if (p?.isSpeaking && p.identity) set.add(p.identity)
    }
    return set
  }, [speakingParticipants, participants])

  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (recordingStatus !== 'recording' || !recordingStartedAt) {
      setRecCountdownLabel(null)
      recWarn60Ref.current = false
      recWarn15Ref.current = false
      recAutoStopRef.current = false
      return undefined
    }
    const maxSec = Math.max(1, Number(recordingMaxSeconds) || CHAT_CALL_RECORDING_MAX_SECONDS)
    const startedMs = Date.parse(recordingStartedAt)
    if (!Number.isFinite(startedMs)) return undefined

    const tick = () => {
      const elapsedRec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
      const left = Math.max(0, maxSec - elapsedRec)
      if (left <= 60 && left > 15) {
        setRecCountdownLabel(`Recording ends in ${left}s`)
        if (!recWarn60Ref.current) {
          recWarn60Ref.current = true
          playChatCallRecordingCue('warn_60')
        }
      } else if (left <= 15 && left > 0) {
        setRecCountdownLabel(`Recording ends in ${left}s`)
        if (!recWarn15Ref.current) {
          recWarn15Ref.current = true
          playChatCallRecordingCue('warn_15')
        }
      } else if (left <= 0) {
        setRecCountdownLabel('Stopping recording…')
        if (!recAutoStopRef.current && canStopRecording) {
          recAutoStopRef.current = true
          onStopRecording?.()
        }
      } else {
        setRecCountdownLabel(null)
      }
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [recordingStatus, recordingStartedAt, recordingMaxSeconds, onStopRecording, canStopRecording])

  const roomState = room?.state
  useEffect(() => {
    if (!awaitingAnswer || isEdgeiOSShell()) return undefined
    unlockChatCallAudio()
    startOutgoingRingback()
    return () => stopOutgoingRingback()
  }, [awaitingAnswer, roomState])

  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  )

  const cameraByIdentity = useMemo(() => {
    /** @type {Map<string, (typeof tracks)[number]>} */
    const map = new Map()
    for (const trackRef of tracks) {
      if (trackRef.source !== Track.Source.Camera) continue
      if (!trackRef.publication?.track) continue
      // Muted / camera-off still publishes a track... omit so UI can show avatars.
      if (trackRef.publication.isMuted) continue
      map.set(trackRef.participant.identity, trackRef)
    }
    return map
  }, [tracks])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const statusLabel = awaitingAnswer
    ? 'Ringing…'
    : `${mm}:${ss}${!awaitingAnswer && isGroup ? ` · ${participants.length} in call` : ''}${
        recordingActive ? ' · REC' : recordingSaving ? ' · Saving recording…' : ''
      }`

  const resolveAvatarForParticipant = (participant) => {
    if (!participant) return null
    const fromProfile = profileById.get(participant.identity)?.avatarUrl || null
    if (participant.isLocal) return viewerAvatarUrl || fromProfile
    if (peerUserId && participant.identity === peerUserId) return avatarUrl || fromProfile
    // DM: any remote uses the peer avatar we already resolved.
    if (!isGroup) return avatarUrl || fromProfile
    return fromProfile
  }

  const resolveNameForParticipant = (participant) => {
    if (!participant) return 'Caller'
    if (participant.isLocal) return 'You'
    const fromProfile = profileById.get(participant.identity)?.title
    if (fromProfile) return fromProfile
    if (participant.name) return participant.name
    if (!isGroup) return title || 'Caller'
    return participant.identity?.slice(0, 8) || 'Caller'
  }

  const participantHasLiveCamera = (participant) => {
    if (!participant) return false
    const pub = participant.getTrackPublication?.(Track.Source.Camera)
    if (!pub?.track || pub.isMuted) return false
    return cameraByIdentity.has(participant.identity)
  }

  const remotes = participants.filter((p) => !p.isLocal)
  const peopleCount = remotes.length + (localParticipant ? 1 : 0)
  const webQuadFocus = quadFocus && peopleCount === 4

  useEffect(() => {
    if (peopleCount !== 4) setQuadFocus(false)
  }, [peopleCount])

  const fullscreenParticipant = useMemo(() => {
    if (pinnedIdentity) {
      const pinnedRemote = remotes.find((p) => p.identity === pinnedIdentity)
      if (pinnedRemote) return pinnedRemote
    }
    if (remotes[0]) return remotes[0]
    return localParticipant || null
  }, [pinnedIdentity, remotes, localParticipant])

  const anyParticipantHasCamera =
    participantHasLiveCamera(localParticipant) || remotes.some(participantHasLiveCamera)
  const showVideoStage = (videoEnabled || camOn || anyParticipantHasCamera) && !awaitingAnswer
  const isVideoMode = Boolean(showVideoStage)

  const resetControlsTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setControlsHidden(false)
    if (isVideoMode) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsHidden(true)
      }, 4500)
    }
  }, [isVideoMode])

  useEffect(() => {
    if (isVideoMode) {
      resetControlsTimer()
    } else {
      setControlsHidden(false)
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [isVideoMode, resetControlsTimer])

  const focusWebRemote = useCallback((id) => {
    if (id === '__quad_restore__') {
      setQuadFocus(false)
      setPinnedIdentity(null)
      return
    }
    const next = String(id || '').trim()
    if (!next || (localParticipant && next === localParticipant.identity)) return
    setPinnedIdentity(next)
    if (peopleCount === 4) setQuadFocus(true)
  }, [localParticipant, peopleCount])

  const onWebStreamTap = useCallStreamTap({
    controlsHidden,
    onReveal: resetControlsTimer,
    onFocus: focusWebRemote,
  })

  const applySpeakerSink = async (nextOn, { manual = false } = {}) => {
    if (!audioRouteSupported && manual) return
    if (manual) speakerManualOverrideRef.current = true
    setSpeakerOn(nextOn)
    try {
      const result = await applyCallAudioOutput({ room, speakerphoneOn: nextOn })
      if (result?.canRoute) setAudioRouteSupported(true)
      else if (manual) setAudioRouteSupported(false)
    } catch {
      /* unsupported */
    }
  }

  // Unlock remote playback after connect / when roster changes (autoplay policies).
  useEffect(() => {
    if (!room) return undefined
    const kick = () => {
      unlockChatCallAudio()
      enterCallAudioSession()
      void room.startAudio?.().catch(() => {})
    }
    kick()
    const t = window.setTimeout(kick, 250)
    const t2 = window.setTimeout(kick, 1000)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [room, remoteCount])

  // Probe real sink switching once the room is up (not on every join/leave).
  useEffect(() => {
    if (!room) return undefined
    if (isIosDevice() && !isEdgeiOSShell()) {
      setAudioRouteSupported(false)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      const ok = await canToggleCallAudioRoute()
      if (!cancelled) setAudioRouteSupported(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [room])

  useEffect(() => {
    if (!room || !audioRouteSupported) return undefined
    let cancelled = false
    const run = async () => {
      try {
        await applyCallAudioOutput({ room, speakerphoneOn: speakerOn })
      } catch {
        /* ignore */
      }
    }
    void run()
    const t1 = window.setTimeout(() => {
      if (!cancelled) void run()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
    }
  }, [room, speakerOn, audioRouteSupported])

  const flipCamera = async () => {
    if (!localParticipant || !camOn || cameraBusy) return
    setCameraBusy(true)
    try {
      const pub = localParticipant.getTrackPublication?.(Track.Source.Camera)
      const track = pub?.track
      if (track && typeof track.restartTrack === 'function') {
        const { facingMode: current } = facingModeFromLocalTrack(track)
        const next = current === 'environment' ? 'user' : 'environment'
        await track.restartTrack({ facingMode: next })
        return
      }
      const devices = await Room.getLocalDevices('videoinput')
      if (!room || devices.length < 2) return
      const currentId =
        room.getActiveDevice?.('videoinput') ||
        track?.mediaStreamTrack?.getSettings?.()?.deviceId ||
        ''
      const idx = Math.max(
        0,
        devices.findIndex((d) => d.deviceId === currentId),
      )
      const nextDevice = devices[(idx + 1) % devices.length]
      if (nextDevice?.deviceId) {
        await room.switchActiveDevice('videoinput', nextDevice.deviceId)
      }
    } catch {
      /* single camera / permission / unsupported */
    } finally {
      setCameraBusy(false)
    }
  }

  const hangup = () => {
    exitCallAudioSession()
    try {
      room?.disconnect()
    } catch {
      /* ignore */
    }
    onHangup()
  }
  const hangupRef = useRef(hangup)
  hangupRef.current = hangup

  useEffect(() => {
    if (!isGroup || remoteCount > 0 || !hadRemoteRef.current) return undefined
    const t = window.setTimeout(() => hangupRef.current(), 4000)
    return () => window.clearTimeout(t)
  }, [isGroup, remoteCount])

  const setCameraEnabled = async (next) => {
    setCamOn(next)
    if (!localParticipant) return
    try {
      await localParticipant.setCameraEnabled(next)
      if (next && audioRouteSupported && !speakerManualOverrideRef.current) {
        void applySpeakerSink(true, { manual: false })
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Mute without tearing down the capture device when Android speaker routing
   * depends on the phantom Speakerphone / Headset earpiece audioinput staying open.
   * setMicrophoneEnabled(false) was forcing earpiece even with speaker UI still on.
   */
  const setMicEnabled = async (next) => {
    setMicOn(next)
    if (!localParticipant) return
    try {
      if (audioRouteSupported) {
        const pub = localParticipant.getTrackPublication?.(Track.Source.Microphone)
        const track = pub?.track
        if (track && typeof track.mute === 'function' && typeof track.unmute === 'function') {
          if (next) await track.unmute()
          else await track.mute()
        } else if (pub && typeof pub.mute === 'function' && typeof pub.unmute === 'function') {
          if (next) await pub.unmute()
          else await pub.mute()
        } else {
          await localParticipant.setMicrophoneEnabled(next)
        }
        // Re-assert route after mute/unmute... Chrome drops Speakerphone when capture blips.
        if (speakerOn) {
          await applyCallAudioOutput({ room, speakerphoneOn: true })
        }
        return
      }
      await localParticipant.setMicrophoneEnabled(next)
    } catch {
      try {
        await localParticipant.setMicrophoneEnabled(next)
      } catch {
        /* ignore */
      }
    }
  }

  const handleVideoDockClick = () => {
    resetControlsTimer()
    if (!camOn && !showVideoStage) {
      setShowVideoConfirmModal(true)
    } else {
      void setCameraEnabled(!camOn)
    }
  }

  if (minimized) {
    if (showVideoStage) {
      const activeVideoParticipant = fullscreenParticipant || remotes[0] || localParticipant
      const hasCam = participantHasLiveCamera(activeVideoParticipant)
      return (
        <DraggableMinimizedVideoTile onExpand={onExpand}>
          {hasCam && activeVideoParticipant ? (
            <div className="relative h-full w-full bg-black">
              <VideoTrack
                trackRef={{
                  participant: activeVideoParticipant,
                  source: Track.Source.Camera,
                  publication: activeVideoParticipant.getTrackPublication?.(Track.Source.Camera),
                }}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <CallAvatarCircle
              avatarUrl={avatarUrl}
              title={title}
              sizeClass="h-16 w-16"
              textClass="text-[20px]"
            />
          )}
        </DraggableMinimizedVideoTile>
      )
    }
    return (
      <DraggableMinimizedCallPill
        avatarUrl={avatarUrl}
        title={title}
        onExpand={onExpand}
      >
        <CallPillButton
          icon={<MicIcon muted={!micOn} />}
          variant={!micOn ? 'danger' : 'default'}
          onClick={() => void setMicEnabled(!micOn)}
          ariaLabel={micOn ? 'Mute microphone' : 'Unmute microphone'}
        />
        <CallPillButton
          icon={<VideoIcon off={!camOn} />}
          active={camOn}
          onClick={() => {
            onExpand?.()
            if (!camOn && !showVideoStage) {
              setShowVideoConfirmModal(true)
            } else {
              void setCameraEnabled(!camOn)
            }
          }}
          ariaLabel={camOn ? 'Turn camera off' : 'Turn camera on'}
        />
        {audioRouteSupported && (!isIosDevice() || isEdgeiOSShell()) ? (
          <CallPillButton
            icon={<SpeakerIcon />}
            variant={speakerOn ? 'active-white' : 'default'}
            onClick={() => void applySpeakerSink(!speakerOn, { manual: true })}
            ariaLabel={speakerOn ? 'Speakerphone on' : 'Earpiece'}
          />
        ) : null}
        <CallPillButton
          icon={<HangupIcon />}
          variant="danger"
          onClick={hangup}
          ariaLabel="Hang up"
        />
      </DraggableMinimizedCallPill>
    )
  }

  const controlPill = showVideoStage ? (
    <div
      data-chat-call-interactive=""
      className={`pointer-events-auto mx-auto flex items-center justify-between rounded-full border border-white/10 bg-zinc-950/85 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150 ${
        peopleCount >= 5 ? 'w-auto max-w-[16rem] gap-1 px-2 py-1.5' : 'w-full max-w-[22.5rem] px-4 py-3'
      }`}
    >
      <VideoRecordDockItem
        compact={peopleCount >= 5}
        recordingActive={recordingActive}
        recordingSaving={recordingSaving}
        canStopRecording={canStopRecording}
        onStart={() =>
          onStartRecording?.(
            fullscreenParticipant && !fullscreenParticipant.isLocal
              ? fullscreenParticipant.identity
              : pinnedIdentity,
          )
        }
        onStop={() => onStopRecording?.()}
        onInteract={resetControlsTimer}
      />
      <CallDockItem
        compact={peopleCount >= 5}
        icon={<VideoIcon off={!camOn} />}
        label="Video"
        active={camOn}
        disabled={false}
        onClick={handleVideoDockClick}
      />
      <CallDockItem
        compact={peopleCount >= 5}
        icon={<SpeakerIcon />}
        label="Speaker"
        active={speakerOn}
        variant={speakerOn ? 'active-white' : 'default'}
        disabled={!audioRouteSupported && isIosDevice() && !isEdgeiOSShell()}
        onClick={() => {
          resetControlsTimer()
          void applySpeakerSink(!speakerOn, { manual: true })
        }}
      />
      <CallDockItem
        compact={peopleCount >= 5}
        icon={<MicIcon muted={!micOn} />}
        label="Mute"
        active={!micOn}
        variant={!micOn ? 'danger' : 'default'}
        onClick={() => {
          resetControlsTimer()
          void setMicEnabled(!micOn)
        }}
      />
      <CallDockItem
        compact={peopleCount >= 5}
        icon={<HangupIcon />}
        label="End"
        variant="danger"
        onClick={() => {
          resetControlsTimer()
          hangup()
        }}
      />
    </div>
  ) : (
    /* Same one-row pill as video, minus Flip. */
    <div
      data-chat-call-interactive=""
      className="pointer-events-auto mx-auto flex w-full max-w-[22.5rem] items-center justify-between rounded-full border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl backdrop-saturate-150"
    >
      <CallDockItem
        icon={<VideoIcon off={!camOn} />}
        label="Video"
        active={camOn}
        disabled={false}
        onClick={handleVideoDockClick}
      />
      <CallDockItem
        icon={<SpeakerIcon />}
        label="Speaker"
        active={speakerOn}
        variant={speakerOn ? 'active-white' : 'default'}
        disabled={!audioRouteSupported && isIosDevice() && !isEdgeiOSShell()}
        onClick={() => void applySpeakerSink(!speakerOn, { manual: true })}
      />
      <CallDockItem
        icon={<MicIcon muted={!micOn} />}
        label="Mute"
        active={!micOn}
        variant={!micOn ? 'danger' : 'default'}
        onClick={() => void setMicEnabled(!micOn)}
      />
      <CallDockItem
        icon={<HangupIcon />}
        label="End"
        variant="danger"
        onClick={hangup}
      />
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950 via-[#0a1018] to-zinc-950">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 18%, rgba(6,182,212,0.12) 0%, transparent 60%), radial-gradient(circle at 50% 82%, rgba(59,130,246,0.08) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Top Header - slides up when controlsHidden in video mode */}
      <div
        className={`relative z-[1] flex shrink-0 items-start justify-between px-4 pb-2 transition-all duration-300 ease-in-out ${
          controlsHidden ? '-translate-y-28 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
        style={{ paddingTop: 'calc(max(env(safe-area-inset-top,0px),var(--edge-sat,0px)) + 0.75rem)' }}
      >
        <button
          type="button"
          data-chat-call-interactive=""
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur-xl transition active:scale-95 touch-manipulation hover:bg-white/15"
          aria-label="Minimize call"
          onClick={onMinimize}
        >
          <MinimizeIcon />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate text-[20px] font-bold tracking-tight text-white drop-shadow-sm">{title}</p>
          <p className="mt-1 font-mono text-[13px] font-medium tracking-wide text-zinc-300/90">{statusLabel}</p>
          {recordingActive ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-950/60 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-200 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" aria-hidden />
              Recording
            </div>
          ) : null}
          {recordingSaving ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/60 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur-md">
              Saving recording…
            </div>
          ) : null}
          {recCountdownLabel ? (
            <p className="mt-1.5 text-[12px] font-semibold text-amber-300">{recCountdownLabel}</p>
          ) : null}
        </div>
        <div className="h-11 w-11 shrink-0" aria-hidden />
      </div>

      <div className="relative z-[1] min-h-0 flex-1 px-4">
        {showVideoStage ? (
          <VideoCallStage
            remotes={remotes}
            localParticipant={localParticipant}
            featuredIdentity={webQuadFocus || peopleCount !== 4 ? fullscreenParticipant?.identity : null}
            quadFocus={webQuadFocus}
            controlsHidden={controlsHidden}
            cameraByIdentity={cameraByIdentity}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            participantHasLiveCamera={participantHasLiveCamera}
            title={title}
            showLocalFlip={Boolean(camOn && !cameraBusy)}
            onFlipCamera={() => {
              resetControlsTimer()
              void flipCamera()
            }}
            onActivateRemote={onWebStreamTap}
            onActivateMain={(event) => {
              if (webQuadFocus) onWebStreamTap('__quad_restore__', event)
              else if (controlsHidden) resetControlsTimer()
              else setControlsHidden(true)
            }}
            onActivateYou={(event) => {
              event?.stopPropagation?.()
              if (controlsHidden) resetControlsTimer()
              else setControlsHidden(true)
            }}
          />
        ) : isGroup && !awaitingAnswer ? (
          <GroupAudioStage
            participants={participants}
            speakingIds={speakingIds}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            resolveNameForParticipant={resolveNameForParticipant}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center pb-6">
            <CallAvatarCircle
              avatarUrl={avatarUrl}
              title={title}
              sizeClass="h-44 w-44"
              textClass="text-[52px]"
              ring
            />
          </div>
        )}
      </div>

      {/* Bottom Controls - slides down when controlsHidden in video mode */}
      <div
        className={`relative z-[1] flex shrink-0 justify-center px-4 pt-2 transition-all duration-300 ease-in-out ${
          controlsHidden
            ? peopleCount >= 5
              ? 'translate-y-24 opacity-0 pointer-events-none'
              : 'translate-y-36 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
        style={{
          paddingBottom:
            peopleCount >= 5
              ? 'max(0.35rem, max(env(safe-area-inset-bottom,0px), var(--edge-sab,0px)))'
              : 'calc(max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)) + 1.25rem)',
        }}
      >
        {controlPill}
      </div>

      {showVideoConfirmModal ? (
        <SwitchToVideoConfirmModal
          onCancel={() => setShowVideoConfirmModal(false)}
          onConfirm={() => {
            setShowVideoConfirmModal(false)
            void setCameraEnabled(true)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string[]} identities
 */
function useCallParticipantProfiles(supabaseClient, identities) {
  const [map, setMap] = useState(
    () => /** @type {Map<string, { title: string | null, avatarUrl: string | null }>} */ (new Map()),
  )
  const idsKey = useMemo(() => [...new Set(identities.filter(Boolean))].sort().join(','), [identities])

  useEffect(() => {
    if (!supabaseClient || !idsKey) return undefined
    const ids = idsKey.split(',').filter(Boolean)
    let cancelled = false
    ;(async () => {
      // LiveKit identity = auth uid = profiles.user_id (not profiles.id).
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('user_id, display_name, handle, avatar_url')
        .in('user_id', ids)
      if (cancelled || error || !data) return
      setMap((prev) => {
        const next = new Map(prev)
        for (const row of data) {
          const key = String(row.user_id || '').trim()
          if (!key) continue
          const title = String(row.display_name || row.handle || '').trim() || null
          const avatarUrl =
            typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null
          next.set(key, { title, avatarUrl })
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient, idsKey])

  return map
}

function GroupAudioStage({
  participants,
  speakingIds,
  resolveAvatarForParticipant,
  resolveNameForParticipant,
}) {
  const count = participants.length
  const sizeClass = count <= 2 ? 'h-36 w-36' : count <= 4 ? 'h-28 w-28' : 'h-24 w-24'
  const textClass = count <= 2 ? 'text-[42px]' : count <= 4 ? 'text-[32px]' : 'text-[26px]'
  const tileWidth =
    count <= 2 ? 'w-[45%] max-w-[12rem]' : count <= 4 ? 'w-[42%] max-w-[10rem]' : 'w-[30%] max-w-[8rem]'

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto px-2 py-4">
      <div className="flex w-full max-w-lg flex-wrap content-center justify-center gap-x-4 gap-y-6">
        {participants.map((p) => {
          const name = resolveNameForParticipant(p)
          const speaking = speakingIds.has(p.identity)
          return (
            <div
              key={p.identity}
              className={`flex flex-col items-center gap-2.5 ${tileWidth}`}
            >
              <CallAvatarCircle
                avatarUrl={resolveAvatarForParticipant(p)}
                title={name}
                sizeClass={sizeClass}
                textClass={textClass}
                speaking={speaking}
                ring
              />
              <p className="w-full truncate text-center text-[13px] font-semibold text-zinc-200 drop-shadow-sm">
                {name}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VideoCallStage({
  remotes = [],
  localParticipant = null,
  featuredIdentity = null,
  quadFocus = false,
  controlsHidden = false,
  cameraByIdentity,
  resolveAvatarForParticipant,
  participantHasLiveCamera,
  title,
  showLocalFlip = false,
  onFlipCamera,
  onActivateRemote,
  onActivateMain,
  onActivateYou,
  hitOnly = false,
}) {
  const plan = planCallVideoLayout({
    remoteIds: remotes.map((p) => p.identity),
    localId: localParticipant?.identity || null,
    featuredId: featuredIdentity,
    quadFocus,
  })
  const byId = new Map()
  for (const p of remotes) byId.set(p.identity, p)
  if (localParticipant) byId.set(localParticipant.identity, localParticipant)

  const renderFill = (participant, { label, textClass, roundedClass = '' }) => {
    if (hitOnly || !participant) return null
    const track = cameraByIdentity.get(participant.identity)
    const hasCam = participantHasLiveCamera(participant)
    if (hasCam && track) {
      return (
        <VideoTrack
          trackRef={track}
          className={`absolute inset-0 h-full w-full object-cover ${roundedClass}`}
          style={{ objectFit: 'cover' }}
        />
      )
    }
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-950 via-[#0a1018] to-zinc-950">
        <CallAvatarCircle
          avatarUrl={resolveAvatarForParticipant(participant)}
          title={label}
          sizeClass="h-[70%] w-[70%] max-h-40 max-w-40"
          textClass={textClass}
          ring
        />
      </div>
    )
  }

  const youFlip =
    showLocalFlip && localParticipant ? (
      <LocalFlipChip className="top-1.5 right-1.5" size="sm" onFlip={onFlipCamera} />
    ) : null

  const remoteTile = (id, extraClass = '') => {
    const p = byId.get(id)
    const label = p?.name || title || id.slice(0, 8)
    return (
      <button
        key={id}
        type="button"
        data-chat-call-interactive=""
        data-chat-call-round-video=""
        className={`relative min-h-0 min-w-0 overflow-hidden bg-zinc-950/80 touch-manipulation ${extraClass}`}
        aria-label={`Focus ${label}`}
        onClick={(event) => onActivateRemote?.(id, event)}
      >
        {renderFill(p, { label, textClass: 'text-[22px]', roundedClass: 'rounded-[10px]' })}
      </button>
    )
  }

  const youTile = (extraClass = '') => {
    if (!plan.youId) return null
    return (
      <button
        key={plan.youId}
        type="button"
        data-chat-call-interactive=""
        data-chat-call-round-video=""
        className={`relative min-h-0 min-w-0 overflow-hidden bg-zinc-950/80 touch-manipulation ${extraClass}`}
        aria-label="You"
        onClick={(event) => onActivateYou?.(event)}
      >
        {renderFill(localParticipant, { label: 'You', textClass: 'text-[22px]', roundedClass: 'rounded-[10px]' })}
        {youFlip}
      </button>
    )
  }

  const featured = plan.featuredId ? byId.get(plan.featuredId) : null
  const featuredLabel =
    featured?.isLocal ? 'You' : featured?.name || title || 'Call'
  const shellClass = hitOnly
    ? 'relative h-full min-h-0 overflow-hidden'
    : 'relative h-full min-h-0 overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950/80 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl'

  if (plan.mode === 'solo') {
    return (
      <div className={shellClass}>
        <button
          type="button"
          data-chat-call-main-video=""
          className="absolute inset-0 overflow-hidden border-0 bg-transparent"
          aria-label="You"
          onClick={(event) => onActivateYou?.(event)}
        >
          {renderFill(localParticipant, { label: 'You', textClass: 'text-[48px]' })}
        </button>
        {youFlip}
      </div>
    )
  }

  if (plan.mode === 'duo') {
    return (
      <div className={shellClass}>
        <button
          type="button"
          data-chat-call-main-video=""
          className="absolute inset-0 overflow-hidden border-0 bg-transparent"
          aria-label={featuredLabel}
          onClick={(event) => onActivateMain?.(event)}
        >
          {renderFill(featured, { label: featuredLabel, textClass: 'text-[48px]' })}
        </button>
        <div
          className={`absolute right-4 z-[2] h-[8rem] w-[5.5rem] transition-all duration-300 ease-in-out ${
            controlsHidden ? 'bottom-4' : 'bottom-[7.25rem]'
          }`}
        >
          {youTile('h-full w-full rounded-2xl border-2 border-white/30 shadow-2xl')}
        </div>
      </div>
    )
  }

  if (plan.mode === 'trio') {
    const otherId = plan.bottomIds?.find((id) => id !== plan.youId)
    return (
      <div className={`${shellClass} flex flex-col gap-[3px]`}>
        <button
          type="button"
          data-chat-call-main-video=""
          className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] border-0 bg-transparent"
          aria-label={featuredLabel}
          onClick={(event) => onActivateRemote?.(plan.featuredId, event)}
        >
          {renderFill(featured, { label: featuredLabel, textClass: 'text-[40px]' })}
        </button>
        <div className="flex min-h-0 flex-1 gap-[3px]">
          {otherId ? remoteTile(otherId, 'flex-1 rounded-[10px]') : <div className="flex-1" />}
          {youTile('flex-1 rounded-[10px]')}
        </div>
      </div>
    )
  }

  if (plan.mode === 'quad') {
    return (
      <div className={`${shellClass} grid grid-cols-2 grid-rows-2 gap-[3px]`}>
        {(plan.quadIds || []).map((id) =>
          id === plan.youId ? youTile('rounded-[10px]') : remoteTile(id, 'rounded-[10px]'),
        )}
      </div>
    )
  }

  if (plan.mode === 'quadFocus') {
    return (
      <div className={shellClass}>
        <button
          type="button"
          data-chat-call-main-video=""
          className="absolute inset-0 overflow-hidden border-0 bg-transparent"
          aria-label={featuredLabel}
          onClick={(event) => onActivateMain?.(event)}
        >
          {renderFill(featured, { label: featuredLabel, textClass: 'text-[48px]' })}
        </button>
        <div className="absolute bottom-4 right-4 z-[2] flex flex-col items-end gap-2.5">
          {(plan.stackIds || []).map((id) =>
            id === plan.youId
              ? youTile('h-20 w-20 rounded-2xl border-2 border-white/30 shadow-lg')
              : remoteTile(id, 'h-20 w-20 rounded-2xl border-2 border-white/25 shadow-lg'),
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`${shellClass} flex flex-col gap-[3px]`}>
      <button
        type="button"
        data-chat-call-main-video=""
        className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] border-0 bg-transparent"
        aria-label={featuredLabel}
        onClick={(event) => onActivateRemote?.(plan.featuredId, event)}
      >
        {renderFill(featured, { label: featuredLabel, textClass: 'text-[40px]' })}
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-[3px]">
        {plan.row0?.length ? (
          <div className="flex min-h-0 flex-1 gap-[3px]">
            {plan.row0.map((id) => remoteTile(id, 'flex-1 rounded-[10px]'))}
          </div>
        ) : null}
        {plan.row1?.length ? (
          <div className="flex min-h-0 flex-1 gap-[3px]">
            {plan.row1.map((id) =>
              id === plan.youId ? youTile('flex-1 rounded-[10px]') : remoteTile(id, 'flex-1 rounded-[10px]'),
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CallAvatarCircle({
  avatarUrl,
  title,
  sizeClass = 'h-36 w-36',
  textClass = 'text-[44px]',
  ring = false,
  speaking = false,
}) {
  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const haloClass = speaking
    ? ' ring-4 ring-emerald-400 shadow-[0_0_28px_rgba(52,211,153,0.55)]'
    : ring
      ? ' ring-2 ring-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.65)]'
      : ''
  return (
    <div
      className={`relative flex items-center justify-center rounded-full ${sizeClass}${haloClass} transition-shadow duration-200`}
      aria-label={speaking ? `${title || 'Caller'} speaking` : undefined}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-zinc-800/90 backdrop-blur-md">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover rounded-full" />
        ) : (
          <span className={`font-bold uppercase tracking-tight text-zinc-100 ${textClass}`} aria-hidden>
            {initial}
          </span>
        )}
      </div>
    </div>
  )
}

function LocalFlipChip({ className = '', size = 'md', onFlip }) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  return (
    <button
      type="button"
      data-chat-call-interactive=""
      className={`absolute z-[4] flex ${dim} items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur-md touch-manipulation active:scale-95 ${className}`}
      aria-label="Flip camera"
      onClick={(event) => {
        event.stopPropagation()
        onFlip?.()
      }}
    >
      <span className={size === 'sm' ? 'scale-75' : 'scale-90'}>
        <FlipCameraIcon />
      </span>
    </button>
  )
}

function VideoRecordDockItem({
  recordingActive,
  recordingSaving,
  canStopRecording,
  onStart,
  onStop,
  onInteract,
  compact = false,
}) {
  const dimmed = recordingActive && !canStopRecording
  const canStop = recordingActive && canStopRecording
  const canStart = !recordingActive && !recordingSaving
  return (
    <CallDockItem
      compact={compact}
      icon={canStop ? <RecordStopIcon /> : <RecordDotIcon dimmed={dimmed || recordingSaving} />}
      label={canStop ? 'Stop' : recordingSaving ? 'Saving' : 'Record'}
      variant={canStop ? 'danger' : 'default'}
      disabled={recordingSaving || dimmed || (!canStart && !canStop)}
      onClick={() => {
        onInteract?.()
        if (canStop) onStop?.()
        else if (canStart) onStart?.()
      }}
    />
  )
}

function CallDockItem({
  onClick,
  icon,
  label,
  variant = 'default',
  active = false,
  disabled = false,
  ariaLabel,
  title,
  compact = false,
}) {
  const baseBtnStyle = compact
    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95 touch-manipulation'
    : 'flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95 touch-manipulation'
  let variantStyle = 'bg-white/10 hover:bg-white/15 border border-white/10 text-white shadow-md backdrop-blur-md'

  if (variant === 'active-white' || (active && variant === 'default')) {
    variantStyle = 'bg-white text-zinc-950 shadow-[0_0_24px_rgba(255,255,255,0.35)] font-bold'
  } else if (variant === 'danger') {
    variantStyle = 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_8px_24px_rgba(225,29,72,0.45)]'
  } else if (variant === 'warning') {
    variantStyle = 'bg-amber-500 text-zinc-950 shadow-[0_6px_20px_rgba(245,158,11,0.35)]'
  } else if (variant === 'disabled' || disabled) {
    variantStyle = 'bg-white/5 border border-white/5 text-zinc-600 cursor-not-allowed opacity-40 shadow-none'
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        type="button"
        disabled={disabled}
        className={`${baseBtnStyle} ${variantStyle}`}
        onClick={onClick}
        aria-label={ariaLabel || label}
        title={title || label}
      >
        {icon}
      </button>
      {compact ? null : (
        <span className="mt-1.5 text-[11px] font-medium tracking-tight text-zinc-300/90 text-center select-none leading-none">
          {label}
        </span>
      )}
    </div>
  )
}

function CallPillButton({
  onClick,
  icon,
  variant = 'default',
  active = false,
  disabled = false,
  ariaLabel,
}) {
  const baseBtnStyle =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95 touch-manipulation'
  let variantStyle = 'bg-white/10 hover:bg-white/15 border border-white/10 text-white shadow-sm'

  if (variant === 'active-white' || (active && variant === 'default')) {
    variantStyle = 'bg-white text-zinc-950 font-bold shadow-md'
  } else if (variant === 'danger') {
    variantStyle = 'bg-rose-600 hover:bg-rose-500 text-white shadow-md'
  } else if (variant === 'disabled' || disabled) {
    variantStyle = 'bg-white/5 text-zinc-600 opacity-40 cursor-not-allowed shadow-none'
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={`${baseBtnStyle} ${variantStyle}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon}
    </button>
  )
}

function MinimizeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MoreOptionsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

function ShareScreenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="m17 8 5-5m0 0h-4m4 0v4" />
    </svg>
  )
}

function MicIcon({ muted }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {muted ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2M12 19v4M8 23h8" />
        </>
      ) : (
        <>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </>
      )}
    </svg>
  )
}

function VideoIcon({ off }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {off ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <path d="M2 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4" />
        </>
      ) : (
        <>
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </>
      )}
    </svg>
  )
}

function FlipCameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 8 3-3-3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m6 16-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** @param {{ dimmed?: boolean }} props */
function RecordDotIcon({ dimmed = false }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="7"
        fill={dimmed ? 'currentColor' : '#ea4335'}
        opacity={dimmed ? 0.55 : 1}
      />
    </svg>
  )
}

function RecordStopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function HangupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        d="M16.7 13.3c-.4-.4-1-.5-1.5-.3l-2.1.7c-1.7-.9-3.1-2.3-4-4l.7-2.1c.2-.5.1-1.1-.3-1.5L7.3 3.9c-.5-.5-1.3-.5-1.8 0L3.9 5.5c-.4.4-.6 1-.5 1.6 1.1 6.2 6.1 11.1 12.3 12.3.6.1 1.2-.1 1.6-.5l1.6-1.6c.5-.5.5-1.3 0-1.8l-2.2-2.2z"
        transform="rotate(135 12 12)"
      />
    </svg>
  )
}
