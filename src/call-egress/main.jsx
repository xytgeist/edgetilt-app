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

/** Match LiveKit default template; hard-start so Stop never races an endless wait. */
const FRAME_DECODE_TIMEOUT_MS = 5000
const HARD_START_MS = 4000

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
 * Featured camera/screen large; remaining video tracks in a strip; audio via RoomAudioRenderer.
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
    if (!room) return undefined
    if (startedRef.current) return undefined

    const startTime = Date.now()
    const markStarted = () => {
      if (startedRef.current) return
      startedRef.current = true
      EgressHelper.startRecording()
    }

    // Fire as soon as Connected... don't wait on decode stats (headless Chrome often stalls).
    if (room.state === ConnectionState.Connected) {
      window.setTimeout(markStarted, 300)
    }

    const interval = window.setInterval(async () => {
      if (startedRef.current) {
        window.clearInterval(interval)
        return
      }
      if (room.state === ConnectionState.Disconnected) return
      if (room.state === ConnectionState.Connected && Date.now() - startTime > 300) {
        window.clearInterval(interval)
        markStarted()
        return
      }

      let hasSubscribed = false
      let hasVideo = false
      let hasDecoded = false

      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.isSubscribed) hasSubscribed = true
          if (pub.kind === Track.Kind.Video && pub.videoTrack) {
            hasVideo = true
            try {
              const stats = await pub.videoTrack.getRTCStatsReport()
              if (stats) {
                hasDecoded = Array.from(stats).some(
                  (item) => item[1].type === 'inbound-rtp' && item[1].framesDecoded > 0,
                )
              }
            } catch {
              /* ignore */
            }
          }
        }
      }

      const elapsed = Date.now() - startTime
      const ready =
        hasDecoded ||
        (!hasVideo && hasSubscribed && elapsed > 500) ||
        (hasSubscribed && elapsed > FRAME_DECODE_TIMEOUT_MS) ||
        elapsed > HARD_START_MS

      if (ready) {
        window.clearInterval(interval)
        markStarted()
      }
    }, 100)

    return () => window.clearInterval(interval)
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
            src="/edge-lounge-logo-transparent.png"
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

// No StrictMode: LiveKit egress waits on a single START_RECORDING console signal.
createRoot(document.getElementById('root')).render(<CallEgressApp />)
