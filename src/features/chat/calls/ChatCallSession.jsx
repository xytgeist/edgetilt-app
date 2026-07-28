import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  VideoTrack,
  useRoomContext,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { startChatCallTone, stopChatCallTone, unlockChatCallAudio } from './chatCallRingTone.js'

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
 *   onDisconnected: () => void,
 *   onHangup: () => void,
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
  onDisconnected,
  onHangup,
  onError,
}) {
  const videoEnabled = kind === 'dm_av' && mediaMode === 'video'
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
              minimized={minimized}
              onMinimize={() => setMinimized(true)}
              onExpand={() => setMinimized(false)}
              onHangup={onHangup}
            />
            <RoomAudioRenderer />
          </>
        )}
      </LiveKitRoom>
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
  minimized,
  onMinimize,
  onExpand,
  onHangup,
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(videoEnabled)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [pinnedIdentity, setPinnedIdentity] = useState(/** @type {string | null} */ (null))

  const remoteCount = participants.filter((p) => !p.isLocal).length
  const hadRemoteRef = useRef(false)
  if (remoteCount > 0) hadRemoteRef.current = true
  // Only ringback while waiting for first answer... never again after a remote joined
  // (callee hangup briefly drops remoteCount to 0 before we tear down).
  const awaitingAnswer = Boolean(isOutgoing) && !hadRemoteRef.current && remoteCount === 0

  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

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
      map.set(trackRef.participant.identity, trackRef)
    }
    return map
  }, [tracks])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const statusLabel = awaitingAnswer
    ? 'Ringing…'
    : `${mm}:${ss}${!awaitingAnswer && isGroup ? ` · ${participants.length} in call` : ''}`

  const resolveAvatarForParticipant = (participant) => {
    if (!participant) return null
    if (participant.isLocal) return viewerAvatarUrl
    if (peerUserId && participant.identity === peerUserId) return avatarUrl
    // DM: any remote uses the peer avatar we already resolved.
    if (!isGroup) return avatarUrl
    return null
  }

  const participantHasLiveCamera = (participant) => {
    if (!participant) return false
    const pub = participant.getTrackPublication?.(Track.Source.Camera)
    if (pub && pub.isMuted === false && pub.track) return true
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
      const audios = document.querySelectorAll('[data-chat-call-session] audio')
      for (const el of audios) {
        if (el && typeof el.setSinkId === 'function') {
          // Default device when "speaker on"; empty string is the browser default output.
          await el.setSinkId('').catch(() => {})
        }
      }
    } catch {
      /* iOS / unsupported — UI state still toggles */
    }
    void nextOn
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

      <button
        type="button"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full touch-manipulation ${
          speakerOn ? 'bg-[#2a3942] text-[#f4f4f5]' : 'bg-[#2a3942] text-[#a1a1aa]'
        }`}
        aria-label={speakerOn ? 'Speaker on' : 'Speaker off'}
        aria-pressed={speakerOn}
        onClick={() => void applySpeakerSink(!speakerOn)}
      >
        <SpeakerIcon on={speakerOn} />
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
        ) : (
          <div className="flex h-full flex-col items-center justify-center pb-8">
            <CallAvatarCircle
              avatarUrl={avatarUrl}
              title={title}
              sizeClass="h-40 w-40"
              textClass="text-[48px]"
              ring
            />
            {isGroup && !awaitingAnswer ? (
              <p className="mt-6 max-w-xs text-center text-[13px] text-[#a1a1aa]">
                {participants.length} in call
              </p>
            ) : null}
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

  const localIsFullscreen = Boolean(localParticipant && fullId === localParticipant.identity)
  const showLocalPip =
    Boolean(localParticipant) && !localIsFullscreen && remotes.length <= 1

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-[#111b21]">
      <div className="absolute inset-0">
        {fullHasCam && fullTrack ? (
          <VideoTrack trackRef={fullTrack} className="h-full w-full object-cover" />
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

      {showLocalPip ? (
        <button
          type="button"
          className="absolute bottom-3 right-3 z-[2] h-[7.5rem] w-[7.5rem] overflow-hidden rounded-full border-2 border-white/35 bg-[#1f2c34] shadow-lg touch-manipulation active:opacity-90"
          aria-label="Show your video fullscreen"
          onClick={() => onPinIdentity(localParticipant.identity)}
        >
          {participantHasLiveCamera(localParticipant) &&
          cameraByIdentity.get(localParticipant.identity) ? (
            <VideoTrack
              trackRef={cameraByIdentity.get(localParticipant.identity)}
              className="h-full w-full object-cover"
            />
          ) : (
            <CallAvatarCircle
              avatarUrl={resolveAvatarForParticipant(localParticipant)}
              title="You"
              sizeClass="h-full w-full"
              textClass="text-[28px]"
            />
          )}
        </button>
      ) : null}

      {stripParticipants.length > 1 || (remotes.length > 1 && stripParticipants.length > 0) ? (
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
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 bg-[#1f2c34] touch-manipulation ${
                    active ? 'border-[#25d366]' : 'border-white/25'
                  }`}
                  aria-label={`Show ${label} fullscreen`}
                  onClick={() => onPinIdentity(p.identity)}
                >
                  {hasCam && track ? (
                    <VideoTrack trackRef={track} className="h-full w-full object-cover" />
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
}) {
  const initial = (title || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full bg-[#2a3942] ${sizeClass}${
        ring ? ' shadow-[0_0_0_3px_rgba(255,255,255,0.12)]' : ''
      }`}
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

function SpeakerIcon({ on }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      ) : (
        <line x1="23" y1="9" x2="17" y2="15" />
      )}
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
