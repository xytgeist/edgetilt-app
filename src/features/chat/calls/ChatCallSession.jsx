import { useEffect, useMemo, useState } from 'react'
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

/**
 * @param {{
 *   token: string,
 *   serverUrl: string,
 *   mediaMode: 'audio' | 'video',
 *   kind: 'dm_av' | 'group_audio',
 *   title: string,
 *   onDisconnected: () => void,
 *   onHangup: () => void,
 * }} props
 */
export default function ChatCallSession({
  token,
  serverUrl,
  mediaMode,
  kind,
  title,
  onDisconnected,
  onHangup,
}) {
  const videoEnabled = kind === 'dm_av' && mediaMode === 'video'

  return (
    <div
      className="fixed inset-0 z-[128] flex flex-col bg-zinc-950"
      data-chat-feature
      data-lk-theme="default"
    >
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={videoEnabled}
        onDisconnected={onDisconnected}
        className="flex h-full min-h-0 flex-col"
      >
        <CallChrome title={title} videoEnabled={videoEnabled} isGroup={kind === 'group_audio'} onHangup={onHangup} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

function CallChrome({ title, videoEnabled, isGroup, onHangup }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(videoEnabled)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  )

  const cameraTracks = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera && t.publication?.track),
    [tracks],
  )

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <>
      <div
        className="flex shrink-0 items-center justify-between px-4 pb-3 pt-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold text-zinc-50">{title}</p>
          <p className="text-[12px] text-zinc-400">
            {mm}:{ss}
            {isGroup ? ` · ${participants.length} in call` : ''}
          </p>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-3 pb-3">
        {videoEnabled && cameraTracks.length > 0 ? (
          <div
            className={`grid h-full gap-2 ${cameraTracks.length > 1 ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1' : 'grid-cols-1'}`}
          >
            {cameraTracks.map((trackRef) => (
              <div
                key={trackRef.participant.identity + (trackRef.publication?.trackSid || '')}
                className="relative overflow-hidden rounded-2xl bg-zinc-900"
              >
                <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-zinc-100">
                  {trackRef.participant.name || trackRef.participant.identity.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-4">
            <p className="text-[14px] text-zinc-400">{isGroup ? 'Group voice call' : 'Voice call'}</p>
            <ul className="flex max-h-[50vh] w-full max-w-sm flex-col gap-2 overflow-y-auto">
              {participants.map((p) => (
                <li
                  key={p.identity}
                  className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5 text-[14px] text-zinc-100"
                >
                  <span className="truncate font-medium">{p.name || p.identity.slice(0, 8)}</span>
                  <span className="text-[11px] text-zinc-500">
                    {p.isSpeaking ? 'Speaking' : p.isMicrophoneEnabled ? 'Mic on' : 'Muted'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-4 px-4 pb-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <button
          type="button"
          className={`flex h-14 w-14 items-center justify-center rounded-full touch-manipulation ${micOn ? 'bg-zinc-800 text-zinc-50' : 'bg-rose-600 text-white'}`}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => {
            const next = !micOn
            setMicOn(next)
            void localParticipant.setMicrophoneEnabled(next)
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {micOn ? (
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
              </>
            ) : (
              <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2M12 19v4M8 23h8" />
              </>
            )}
          </svg>
        </button>

        {videoEnabled ? (
          <button
            type="button"
            className={`flex h-14 w-14 items-center justify-center rounded-full touch-manipulation ${camOn ? 'bg-zinc-800 text-zinc-50' : 'bg-rose-600 text-white'}`}
            aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
            onClick={() => {
              const next = !camOn
              setCamOn(next)
              void localParticipant.setCameraEnabled(next)
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white touch-manipulation active:opacity-80"
          aria-label="Hang up"
          onClick={() => {
            try {
              room?.disconnect()
            } catch {
              /* ignore */
            }
            onHangup()
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16.7 13.3c-.4-.4-1-.5-1.5-.3l-2.1.7c-1.7-.9-3.1-2.3-4-4l.7-2.1c.2-.5.1-1.1-.3-1.5L7.3 3.9c-.5-.5-1.3-.5-1.8 0L3.9 5.5c-.4.4-.6 1-.5 1.6 1.1 6.2 6.1 11.1 12.3 12.3.6.1 1.2-.1 1.6-.5l1.6-1.6c.5-.5.5-1.3 0-1.8l-2.2-2.2z" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </div>
    </>
  )
}
