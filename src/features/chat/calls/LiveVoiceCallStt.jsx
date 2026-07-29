import { useEffect, useRef } from 'react'
import { ConnectionState, RoomEvent, Track } from 'livekit-client'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import {
  chatAppendLiveCallTranscript,
  chatMintLiveCallSttGrant,
} from '../../../utils/chatCallTranscribeApi.js'
import { createLiveCallSttSession } from './liveCallStt.js'

const FLUSH_MS = 2_000
const MAX_BATCH = 12

/**
 * Auto-starts Deepgram live STT for voice calls once answered.
 * Mints the grant as soon as the room is connected (does not wait for mic
 * publication), then attaches the local mic when it appears.
 *
 * @param {{
 *   enabled: boolean,
 *   callId: string | null | undefined,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient | null | undefined,
 *   awaitingAnswer?: boolean,
 * }} props
 */
export default function LiveVoiceCallStt({
  enabled,
  callId,
  supabaseClient,
  awaitingAnswer = false,
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const localParticipantRef = useRef(localParticipant)
  localParticipantRef.current = localParticipant

  const pendingRef = useRef(
    /** @type {Array<{ id: string, start_ms: number, end_ms: number, text: string }> } */ ([]),
  )
  const flushTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const stoppedRef = useRef(false)

  useEffect(() => {
    stoppedRef.current = false
    if (!enabled || !callId || !supabaseClient || awaitingAnswer || !room) {
      return undefined
    }

    const getMicTrack = () => {
      const lp = localParticipantRef.current
      if (!lp) return null
      const pub =
        lp.getTrackPublication?.(Track.Source.Microphone) ||
        [...(lp.audioTrackPublications?.values?.() || [])][0] ||
        null
      const track = pub?.track
      const mst =
        track?.mediaStreamTrack ||
        track?.mediaStream?.getAudioTracks?.()?.[0] ||
        null
      if (!mst || mst.readyState === 'ended') return null
      return mst
    }

    const flush = async () => {
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      const batch = pendingRef.current.splice(0, MAX_BATCH)
      if (!batch.length) return
      try {
        await chatAppendLiveCallTranscript(supabaseClient, callId, batch)
      } catch (err) {
        pendingRef.current = [...batch, ...pendingRef.current].slice(0, 80)
        console.warn('Live voice STT flush failed', err)
      }
    }

    const scheduleFlush = () => {
      if (flushTimerRef.current != null) return
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        void flush()
      }, FLUSH_MS)
    }

    const session = createLiveCallSttSession({
      getAccessToken: async () => {
        const res = await chatMintLiveCallSttGrant(supabaseClient, callId)
        return String(res?.access_token || '')
      },
      getMediaStreamTrack: getMicTrack,
      onFinalUtterance: (u) => {
        if (stoppedRef.current) return
        pendingRef.current.push(u)
        if (pendingRef.current.length >= MAX_BATCH) void flush()
        else scheduleFlush()
      },
      onError: (msg) => console.warn('Live voice STT:', msg),
    })

    let cancelled = false
    let started = false
    let starting = false

    const roomIsConnected = () => {
      const state = room.state
      return state === ConnectionState.Connected || String(state || '') === 'connected'
    }

    const tryStart = async () => {
      if (cancelled || started || starting) return
      if (!roomIsConnected()) return
      starting = true
      try {
        // Mint even if mic track is not published yet... empty live_transcript
        // in DB meant we never reached Edge before.
        await session.connect()
        if (cancelled) {
          await session.stop()
          return
        }
        started = true
        session.syncTrack()
      } catch (err) {
        console.warn('Live voice STT connect failed', err)
      } finally {
        starting = false
      }
    }

    void tryStart()

    const onConnected = () => {
      void tryStart()
    }
    const onTrack = () => {
      if (started) session.syncTrack()
      else void tryStart()
    }

    room.on?.(RoomEvent.Connected, onConnected)
    room.on?.(RoomEvent.LocalTrackPublished, onTrack)
    room.on?.(RoomEvent.TrackSubscribed, onTrack)

    const syncTimer = window.setInterval(() => {
      if (cancelled) return
      if (!started) {
        void tryStart()
        return
      }
      session.syncTrack()
    }, 1500)

    return () => {
      cancelled = true
      stoppedRef.current = true
      window.clearInterval(syncTimer)
      room.off?.(RoomEvent.Connected, onConnected)
      room.off?.(RoomEvent.LocalTrackPublished, onTrack)
      room.off?.(RoomEvent.TrackSubscribed, onTrack)
      void (async () => {
        try {
          await session.stop()
        } catch {
          /* ignore */
        }
        await flush()
      })()
    }
    // Intentionally omit localParticipant from deps... use a ref so identity
    // churn does not tear down the Deepgram session every render.
  }, [enabled, callId, supabaseClient, awaitingAnswer, room])

  return null
}
