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
import { playChatCallRecordingCue } from './chatCallRecordingTone.js'
import { startChatCallTone, stopChatCallTone, unlockChatCallAudio } from './chatCallRingTone.js'
import { CHAT_CALL_RECORDING_MAX_SECONDS } from '../../../utils/chatCallsApi.js'

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
      className="pointer-events-auto fixed flex max-w-[min(22rem,calc(100vw-1rem))] cursor-grab items-center justify-between gap-2 rounded-[28px] bg-[#1f2c34]/95 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md active:cursor-grabbing touch-none"
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
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a3942] touch-manipulation active:opacity-80"
        aria-label="Expand call"
        onClick={guardClick(onExpand)}
      >
        <CallAvatarCircle
          avatarUrl={avatarUrl}
          title={title}
          sizeClass="h-12 w-12"
          textClass="text-[16px]"
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
 * @param {{
 *   token: string,
 *   serverUrl: string,
 *   mediaMode: 'audio' | 'video',
 *   kind: 'dm_av' | 'group_audio',
 *   title: string,
 *   isOutgoing?: boolean,
 *   avatarUrl?: string | null,
 *   viewerAvatarUrl?: string | null,
 *   peerUserId?: string | null,
 *   viewerUserId?: string | null,
 *   recordingStatus?: 'idle' | 'recording' | 'stopping' | 'ready' | 'failed',
 *   recordingStartedBy?: string | null,
 *   recordingStartedAt?: string | null,
 *   recordingMaxSeconds?: number,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onDisconnected: () => void,
 *   onHangup: () => void,
 *   onStartRecording?: () => void,
 *   onStopRecording?: () => void,
 *   onError?: (msg: string) => void,
 * }} props
 */
export default function ChatCallSession({
  token,
  serverUrl,
  mediaMode,
  kind,
  title,
  isOutgoing = false,
  avatarUrl = null,
  viewerAvatarUrl = null,
  peerUserId = null,
  viewerUserId = null,
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
  const [connectError, setConnectError] = useState('')
  const [minimized, setMinimized] = useState(false)
  const didConnectRef = useRef(false)

  return (
    <div
      className={
        minimized
          ? 'pointer-events-none fixed inset-0'
          : 'fixed inset-0 flex flex-col bg-[#0b141a]'
      }
      style={{ zIndex: minimized ? CALL_MINIMIZED_Z : 128 }}
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
        // Mix remote mics in one AudioContext... avoids multi-<audio> autoplay where
        // some group participants stay silent until someone leaves.
        options={{ webAudioMix: true }}
        onConnected={() => {
          didConnectRef.current = true
          setConnectError('')
          unlockChatCallAudio()
        }}
        onDisconnected={() => {
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
          <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-4 bg-[#0b141a] px-6 text-center">
            <p className="text-[15px] font-semibold text-[#fca5a5]">Could not connect to call</p>
            <p className="max-w-sm text-[13px] text-[#a1a1aa]">{connectError}</p>
            <p className="max-w-sm text-[12px] text-[#71717a]">
              Allow microphone access if prompted. Keep Edge open during calls.
            </p>
            <button
              type="button"
              className="rounded-xl bg-[#f4f4f5] px-4 py-2 text-[14px] font-semibold text-[#09090b] touch-manipulation"
              onClick={onHangup}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <CallChrome
              title={title}
              videoEnabled={videoEnabled}
              isGroup={kind === 'group_audio'}
              isOutgoing={isOutgoing}
              avatarUrl={avatarUrl}
              viewerAvatarUrl={viewerAvatarUrl}
              peerUserId={peerUserId}
              viewerUserId={viewerUserId}
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
        'pointer-events-auto fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] z-[132] mx-auto block max-w-xs rounded-full bg-[#25d366] px-4 py-3 text-center text-[14px] font-semibold text-white shadow-lg touch-manipulation',
      type: 'button',
    },
  })
  if (canPlayAudio) return null
  return <button {...mergedProps}>Tap for call audio</button>
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
  /** false = earpiece (default); true = speakerphone */
  const [speakerOn, setSpeakerOn] = useState(false)
  const [audioRouteSupported, setAudioRouteSupported] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recCountdownLabel, setRecCountdownLabel] = useState(/** @type {string | null} */ (null))
  const [pinnedIdentity, setPinnedIdentity] = useState(/** @type {string | null} */ (null))
  const recWarn60Ref = useRef(false)
  const recWarn15Ref = useRef(false)
  const recAutoStopRef = useRef(false)

  const recordingActive = recordingStatus === 'recording'
  const recordingSaving = recordingStatus === 'stopping'
  const isRecordingStarter =
    Boolean(viewerUserId) && Boolean(recordingStartedBy) && viewerUserId === recordingStartedBy

  const remoteCount = participants.filter((p) => !p.isLocal).length
  const hadRemoteRef = useRef(false)
  if (remoteCount > 0) hadRemoteRef.current = true
  // Only ringback while waiting for first answer... never again after a remote joined
  // (callee hangup briefly drops remoteCount to 0 before we tear down).
  const awaitingAnswer = Boolean(isOutgoing) && !hadRemoteRef.current && remoteCount === 0

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
        if (!recAutoStopRef.current) {
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
  }, [recordingStatus, recordingStartedAt, recordingMaxSeconds, onStopRecording])

  useEffect(() => {
    if (!awaitingAnswer) return undefined
    unlockChatCallAudio()
    const tone = startChatCallTone('ringback')
    return () => stopChatCallTone(tone)
  }, [awaitingAnswer])

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
  const speakingRemote = remotes.find((p) => p.isSpeaking) || null

  const fullscreenParticipant = useMemo(() => {
    if (pinnedIdentity) {
      const pinned = participants.find((p) => p.identity === pinnedIdentity)
      if (pinned) return pinned
    }
    if (speakingRemote) return speakingRemote
    if (remotes[0]) return remotes[0]
    return localParticipant || null
  }, [pinnedIdentity, participants, speakingRemote, remotes, localParticipant])

  const showVideoStage = videoEnabled && !awaitingAnswer

  const applySpeakerSink = async (nextOn) => {
    setSpeakerOn(nextOn)
    try {
      const result = await applyCallAudioOutput({ room, speakerphoneOn: nextOn })
      if (result?.canRoute) setAudioRouteSupported(true)
    } catch {
      /* iOS / unsupported — UI state still toggles */
    }
  }

  // Unlock remote playback after connect / when roster changes (autoplay policies).
  useEffect(() => {
    if (!room) return undefined
    const kick = () => {
      unlockChatCallAudio()
      void room.startAudio?.().catch(() => {})
    }
    kick()
    const t = window.setTimeout(kick, 250)
    return () => window.clearTimeout(t)
  }, [room, remoteCount])

  // Probe Android phantom routes once the room is up (not on every join/leave).
  useEffect(() => {
    if (!room) return undefined
    let cancelled = false
    ;(async () => {
      const ok = await canToggleCallAudioRoute()
      if (!cancelled) setAudioRouteSupported(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [room])

  // Apply earpiece/speakerphone only on connect + speaker toggle.
  // Do NOT re-run when remotes join/leave... that was restarting the mic mid-call
  // and made group audio flaky (silent until someone dropped).
  useEffect(() => {
    if (!room) return undefined
    let cancelled = false
    const run = async () => {
      try {
        const result = await applyCallAudioOutput({ room, speakerphoneOn: speakerOn })
        if (!cancelled && result?.canRoute) setAudioRouteSupported(true)
      } catch {
        /* ignore */
      }
    }
    void run()
    // One short retry after local mic publish settles... not a join/leave loop.
    const t1 = window.setTimeout(() => {
      if (!cancelled) void run()
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
    }
  }, [room, speakerOn])

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
    try {
      room?.disconnect()
    } catch {
      /* ignore */
    }
    onHangup()
  }

  const controlButtons = (
    <>
      <button
        type="button"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full touch-manipulation ${
          micOn ? 'bg-[#2a3942] text-[#f4f4f5]' : 'bg-[#ea4335] text-white'
        }`}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        onClick={() => {
          const next = !micOn
          setMicOn(next)
          void localParticipant.setMicrophoneEnabled(next)
        }}
      >
        <MicIcon muted={!micOn} />
      </button>

      {videoEnabled ? (
        <button
          type="button"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full touch-manipulation ${
            camOn ? 'bg-[#2a3942] text-[#f4f4f5]' : 'bg-[#ea4335] text-white'
          }`}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          onClick={() => {
            const next = !camOn
            setCamOn(next)
            void localParticipant.setCameraEnabled(next)
          }}
        >
          <VideoIcon off={!camOn} />
        </button>
      ) : null}

      {videoEnabled ? (
        <button
          type="button"
          disabled={!camOn || cameraBusy}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full touch-manipulation ${
            camOn && !cameraBusy
              ? 'bg-[#2a3942] text-[#f4f4f5] active:opacity-80'
              : 'bg-[#2a3942]/50 text-[#71717a]'
          }`}
          aria-label="Switch camera"
          onClick={() => void flipCamera()}
        >
          <FlipCameraIcon />
        </button>
      ) : null}

      {videoEnabled && !awaitingAnswer ? (
        recordingActive ? (
          isRecordingStarter ? (
            <button
              type="button"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ea4335] text-white touch-manipulation active:opacity-80"
              aria-label="Stop recording"
              title="Stop recording"
              onClick={() => onStopRecording?.()}
            >
              <RecordStopIcon />
            </button>
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2a3942]/40 text-[#71717a]"
              aria-hidden
              title="Recording in progress"
            >
              <RecordDotIcon dimmed />
            </div>
          )
        ) : recordingSaving ? (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2a3942]/50 text-[#fbbf24]"
            aria-label="Saving recording"
            title="Saving recording"
          >
            <RecordStopIcon />
          </div>
        ) : (
          <button
            type="button"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2a3942] text-[#f4f4f5] touch-manipulation active:opacity-80"
            aria-label="Start recording"
            title="Record call"
            onClick={() => onStartRecording?.()}
          >
            <RecordDotIcon />
          </button>
        )
      ) : null}

      <button
        type="button"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full touch-manipulation ${
          speakerOn ? 'bg-[#25d366] text-white' : 'bg-[#2a3942] text-[#a1a1aa]'
        }`}
        aria-label={
          speakerOn
            ? 'Speakerphone on, tap for earpiece'
            : audioRouteSupported
              ? 'Earpiece, tap for speakerphone'
              : 'Speaker (routing may be limited on this device)'
        }
        aria-pressed={speakerOn}
        title={
          audioRouteSupported
            ? undefined
            : 'This browser may not support earpiece vs speakerphone switching'
        }
        onClick={() => void applySpeakerSink(!speakerOn)}
      >
        <SpeakerIcon />
      </button>

      <button
        type="button"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ea4335] text-white touch-manipulation active:opacity-80"
        aria-label="Hang up"
        onClick={hangup}
      >
        <HangupIcon />
      </button>
    </>
  )

  if (minimized) {
    return (
      <DraggableMinimizedCallPill
        avatarUrl={avatarUrl}
        title={title}
        onExpand={onExpand}
      >
        {controlButtons}
      </DraggableMinimizedCallPill>
    )
  }

  const controlPill = (
    <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-2 rounded-[28px] bg-[#1f2c34]/95 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
      {controlButtons}
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #fff 0.6px, transparent 0.7px), radial-gradient(circle at 80% 40%, #fff 0.5px, transparent 0.6px), radial-gradient(circle at 40% 80%, #fff 0.55px, transparent 0.65px)',
          backgroundSize: '28px 28px, 36px 36px, 22px 22px',
        }}
        aria-hidden
      />

      <div
        className="relative z-[1] flex shrink-0 items-start justify-between px-3 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f2c34]/90 text-[#f4f4f5] touch-manipulation active:opacity-80"
          aria-label="Minimize call"
          onClick={onMinimize}
        >
          <MinimizeIcon />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate text-[18px] font-semibold text-[#fafafa]">{title}</p>
          <p className="mt-0.5 text-[13px] text-[#a1a1aa]">{statusLabel}</p>
          {recordingActive ? (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#ea4335]/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#fca5a5]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ea4335]" aria-hidden />
              Recording
            </p>
          ) : null}
          {recordingSaving ? (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#fbbf24]">
              Saving recording…
            </p>
          ) : null}
          {recCountdownLabel ? (
            <p className="mt-1 text-[12px] font-semibold text-[#fbbf24]">{recCountdownLabel}</p>
          ) : null}
        </div>
        <div className="h-10 w-10 shrink-0" aria-hidden />
      </div>

      <div className="relative z-[1] min-h-0 flex-1 px-3">
        {showVideoStage ? (
          <VideoCallStage
            fullscreenParticipant={fullscreenParticipant}
            localParticipant={localParticipant}
            remotes={remotes}
            cameraByIdentity={cameraByIdentity}
            pinnedIdentity={pinnedIdentity}
            onPinIdentity={(id) => {
              setPinnedIdentity((prev) => (prev === id ? null : id))
            }}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            participantHasLiveCamera={participantHasLiveCamera}
            title={title}
          />
        ) : isGroup && !awaitingAnswer ? (
          <GroupAudioStage
            participants={participants}
            speakingIds={speakingIds}
            resolveAvatarForParticipant={resolveAvatarForParticipant}
            resolveNameForParticipant={resolveNameForParticipant}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center pb-8">
            <CallAvatarCircle
              avatarUrl={avatarUrl}
              title={title}
              sizeClass="h-40 w-40"
              textClass="text-[48px]"
              ring
            />
          </div>
        )}
      </div>

      <div
        className="relative z-[1] flex shrink-0 justify-center px-4 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        {controlPill}
      </div>
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
  const sizeClass = count <= 2 ? 'h-32 w-32' : count <= 4 ? 'h-28 w-28' : 'h-24 w-24'
  const textClass = count <= 2 ? 'text-[36px]' : count <= 4 ? 'text-[30px]' : 'text-[26px]'
  const tileWidth =
    count <= 2 ? 'w-[42%] max-w-[11rem]' : count <= 4 ? 'w-[40%] max-w-[9.5rem]' : 'w-[30%] max-w-[7.5rem]'

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto px-1 py-4">
      <div className="flex w-full max-w-lg flex-wrap content-center justify-center gap-x-4 gap-y-5">
        {participants.map((p) => {
          const name = resolveNameForParticipant(p)
          const speaking = speakingIds.has(p.identity)
          return (
            <div
              key={p.identity}
              className={`flex flex-col items-center gap-2 ${tileWidth}`}
            >
              <CallAvatarCircle
                avatarUrl={resolveAvatarForParticipant(p)}
                title={name}
                sizeClass={sizeClass}
                textClass={textClass}
                speaking={speaking}
              />
              <p className="w-full truncate text-center text-[13px] font-medium text-[#e4e4e7]">
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
  fullscreenParticipant,
  localParticipant,
  remotes,
  cameraByIdentity,
  pinnedIdentity,
  onPinIdentity,
  resolveAvatarForParticipant,
  participantHasLiveCamera,
  title,
}) {
  const fullId = fullscreenParticipant?.identity || null
  const fullTrack = fullId ? cameraByIdentity.get(fullId) : null
  const fullHasCam = participantHasLiveCamera(fullscreenParticipant)
  const fullAvatar = resolveAvatarForParticipant(fullscreenParticipant)
  const fullName =
    fullscreenParticipant?.name ||
    (fullscreenParticipant?.isLocal ? 'You' : title) ||
    'Call'

  const stripParticipants = useMemo(() => {
    const others = remotes.filter((p) => p.identity !== fullId)
    // Keep local in strip only when not already the fullscreen subject.
    if (localParticipant && localParticipant.identity !== fullId) {
      return [...others, localParticipant]
    }
    return others
  }, [remotes, localParticipant, fullId])

  // 1:1: always show the non-fullscreen person as the round PiP so you can switch back.
  const duoPipParticipant = useMemo(() => {
    if (remotes.length !== 1) return null
    const remote = remotes[0]
    if (!fullId) return localParticipant || null
    if (localParticipant && fullId === localParticipant.identity) return remote
    if (fullId === remote.identity) return localParticipant || null
    return localParticipant && localParticipant.identity !== fullId ? localParticipant : remote
  }, [remotes, localParticipant, fullId])

  const showDuoPip = Boolean(duoPipParticipant)
  const showStrip = !showDuoPip && stripParticipants.length > 0

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-[#111b21]">
      <div className="absolute inset-0 overflow-hidden" data-chat-call-main-video="">
        {fullHasCam && fullTrack ? (
          <VideoTrack
            trackRef={fullTrack}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#111b21]">
            <CallAvatarCircle
              avatarUrl={fullAvatar}
              title={fullName}
              sizeClass="h-36 w-36"
              textClass="text-[42px]"
              ring
            />
          </div>
        )}
      </div>

      {showDuoPip ? (
        <button
          type="button"
          data-chat-call-round-video=""
          className="absolute bottom-3 right-3 z-[2] h-[7.5rem] w-[7.5rem] overflow-hidden rounded-full border-2 border-white/35 bg-[#1f2c34] shadow-lg touch-manipulation active:opacity-90"
          aria-label={
            duoPipParticipant.isLocal
              ? 'Show your video fullscreen'
              : `Show ${duoPipParticipant.name || title || 'caller'} fullscreen`
          }
          onClick={() => onPinIdentity(duoPipParticipant.identity)}
        >
          {participantHasLiveCamera(duoPipParticipant) &&
          cameraByIdentity.get(duoPipParticipant.identity) ? (
            <VideoTrack
              trackRef={cameraByIdentity.get(duoPipParticipant.identity)}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <CallAvatarCircle
              avatarUrl={resolveAvatarForParticipant(duoPipParticipant)}
              title={duoPipParticipant.isLocal ? 'You' : duoPipParticipant.name || title || '?'}
              sizeClass="h-full w-full"
              textClass="text-[28px]"
            />
          )}
        </button>
      ) : null}

      {showStrip ? (
        <div className="absolute bottom-3 left-0 right-0 z-[2] flex justify-center px-3">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stripParticipants.map((p) => {
              const active = pinnedIdentity === p.identity || (!pinnedIdentity && fullId === p.identity)
              const track = cameraByIdentity.get(p.identity)
              const hasCam = participantHasLiveCamera(p)
              const label = p.isLocal ? 'You' : p.name || p.identity.slice(0, 8)
              return (
                <button
                  key={p.identity}
                  type="button"
                  data-chat-call-round-video=""
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 bg-[#1f2c34] touch-manipulation ${
                    active ? 'border-[#25d366]' : 'border-white/25'
                  }`}
                  aria-label={`Show ${label} fullscreen`}
                  onClick={() => onPinIdentity(p.identity)}
                >
                  {hasCam && track ? (
                    <VideoTrack
                      trackRef={track}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <CallAvatarCircle
                      avatarUrl={resolveAvatarForParticipant(p)}
                      title={label}
                      sizeClass="h-full w-full"
                      textClass="text-[18px]"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CallAvatarCircle({
  avatarUrl,
  title,
  sizeClass = 'h-28 w-28',
  textClass = 'text-[32px]',
  ring = false,
  speaking = false,
}) {
  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  const ringClass = speaking
    ? ' shadow-[0_0_0_3px_#25d366]'
    : ring
      ? ' shadow-[0_0_0_3px_rgba(255,255,255,0.12)]'
      : ''
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full bg-[#2a3942] transition-[box-shadow] duration-150 ${sizeClass}${ringClass}`}
      aria-label={speaking ? `${title || 'Caller'} speaking` : undefined}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`font-bold uppercase tracking-tight text-[#e4e4e7] ${textClass}`} aria-hidden>
          {initial}
        </span>
      )}
    </div>
  )
}

function MinimizeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" strokeLinecap="round" strokeLinejoin="round" />
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
