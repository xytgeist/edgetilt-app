import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import EgressHelper from '@livekit/egress-sdk'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'
import '@livekit/components-styles'
import './callEgress.css'

function parseFeaturedIdentity(layout) {
  const raw = String(layout || '').trim()
  if (raw.startsWith('focus:')) {
    const id = raw.slice('focus:'.length).trim()
    return id || null
  }
  return null
}

function CallEgressApp() {
  const [layout, setLayout] = useState(() => EgressHelper.getLayout())
  const url = EgressHelper.getLiveKitURL()
  const token = EgressHelper.getAccessToken()
  const featuredIdentity = useMemo(() => parseFeaturedIdentity(layout), [layout])

  useEffect(() => {
    EgressHelper.onLayoutChanged((next) => setLayout(String(next || '')))
  }, [])

  if (!url || !token) {
    return <div className="ce-fallback">Missing LiveKit egress url/token.</div>
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      video={false}
      audio={false}
      style={{ width: '100%', height: '100%' }}
    >
      <RoomAudioRenderer />
      <FocusComposite featuredIdentity={featuredIdentity} />
    </LiveKitRoom>
  )
}

/**
 * Featured camera/screen large; remaining video tracks as bottom PiPs; EDGE watermark.
 * Signals START_RECORDING as soon as the room is Connected (headless Chrome often never decodes frames).
 */
function FocusComposite({ featuredIdentity }) {
  const room = useRoomContext()
  const startedRef = useRef(false)
  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Unknown],
    { onlySubscribed: true },
  )

  const videoTracks = useMemo(
    () =>
      tracks.filter(
        (tr) =>
          tr.publication?.kind === Track.Kind.Video &&
          tr.participant?.identity &&
          tr.participant.identity !== room?.localParticipant?.identity,
      ),
    [tracks, room?.localParticipant?.identity],
  )

  const { featured, others } = useMemo(() => {
    if (!videoTracks.length) return { featured: null, others: [] }
    const want = String(featuredIdentity || '').trim()
    const screen =
      want &&
      videoTracks.find(
        (tr) => tr.participant.identity === want && tr.source === Track.Source.ScreenShare,
      )
    const cam =
      want &&
      videoTracks.find(
        (tr) => tr.participant.identity === want && tr.source === Track.Source.Camera,
      )
    const main = screen || cam || videoTracks[0]
    const rest = videoTracks.filter((tr) => tr !== main)
    return { featured: main, others: rest }
  }, [videoTracks, featuredIdentity])

  useEffect(() => {
    if (!room) return undefined
    EgressHelper.setRoom(room)
  }, [room])

  useEffect(() => {
    if (!room || startedRef.current) return undefined

    const start = () => {
      if (startedRef.current) return
      startedRef.current = true
      try {
        EgressHelper.startRecording()
      } catch {
        /* ignore */
      }
    }

    // Immediate path once Connected.
    if (room.state === ConnectionState.Connected) {
      const t = window.setTimeout(start, 250)
      return () => window.clearTimeout(t)
    }

    const onChange = (state) => {
      if (state === ConnectionState.Connected) start()
    }
    room.on('connectionStateChanged', onChange)
    // Absolute failsafe... never leave LiveKit waiting forever.
    const failsafe = window.setTimeout(start, 2500)
    return () => {
      room.off('connectionStateChanged', onChange)
      window.clearTimeout(failsafe)
    }
  }, [room])

  if (room.state === ConnectionState.Disconnected) {
    return <div className="ce-fallback">Disconnected</div>
  }

  const MAX_PIP = 6
  const pipTracks = others.slice(0, MAX_PIP)
  const pipOverflow = Math.max(0, others.length - pipTracks.length)

  return (
    <div className="ce-root">
      <div className="ce-main">
        {featured ? (
          <VideoTrack
            trackRef={featured}
            className="ce-video"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="ce-waiting">Waiting for video…</div>
        )}
        <div className="ce-brand" aria-hidden>
          <img
            src={new URL('edge-lounge-logo-transparent.png', window.location.href).href}
            alt=""
            className="ce-brand-logo"
          />
        </div>
        {pipTracks.length > 0 ? (
          <div className="ce-strip" aria-hidden>
            {pipTracks.map((tr) => (
              <div key={`${tr.participant.identity}-${tr.source}`} className="ce-strip-tile">
                <VideoTrack
                  trackRef={tr}
                  className="ce-video"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
            {pipOverflow > 0 ? (
              <div className="ce-strip-more">+{pipOverflow}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<CallEgressApp />)
