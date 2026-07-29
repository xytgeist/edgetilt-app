import { useEffect, useRef } from 'react'
import { ConnectionState, Track } from 'livekit-client'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import {
  chatAppendLiveCallTranscript,
  chatMintLiveCallSttGrant,
} from '../../../utils/chatCallTranscribeApi.js'
import { createLiveCallSttSession } from './liveCallStt.js'

const FLUSH_MS = 2_000
const MAX_BATCH = 12

/**
 * Auto-starts Deepgram live STT for voice calls once answered and the local mic
 * is live. Streams only the local mic; Edge stamps user_id from the JWT.
 *
 * Do not gate on room.canPlaybackAudio... 1:1 voice uses webAudioMix:false and
 * that flag often stays false even when the call is up, which previously meant
 * mint_live_stt_grant never ran (live_transcript stayed {}).
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
  const sessionRef = useRef(/** @type {ReturnType<typeof createLiveCallSttSession> | null} */ (null))
  const pendingRef = useRef(
    /** @type {Array<{ id: string, start_ms: number, end_ms: number, text: string }> } */ ([]),
  )
  const flushTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const stoppedRef = useRef(false)

  useEffect(() => {
    stoppedRef.current = false
    const roomReady =
      Boolean(room) &&
      (room.state === ConnectionState.Connected || String(room.state || '') === 'connected')
    if (!enabled || !callId || !supabaseClient || awaitingAnswer || !roomReady) {
      return undefined
    }

    const getMicTrack = () => {
      const pub =
        localParticipant?.getTrackPublication?.(Track.Source.Microphone) ||
        localParticipant?.getTrackPublications?.()?.find(
          (p) => p.source === Track.Source.Microphone || p.kind === Track.Kind.Audio,
        )
      const track = pub?.track?.mediaStreamTrack || null
      if (!track || track.readyState !== 'live') return null
      return track
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
    sessionRef.current = session

    let cancelled = false
    let started = false

    const tryStart = async () => {
      if (cancelled || started) return
      if (!getMicTrack()) return
      started = true
      try {
        await session.connect()
        if (cancelled) {
          await session.stop()
          return
        }
        session.syncTrack()
      } catch (err) {
        started = false
        console.warn('Live voice STT connect failed', err)
      }
    }

    void tryStart()
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
      void (async () => {
        try {
          await session.stop()
        } catch {
          /* ignore */
        }
        await flush()
      })()
      sessionRef.current = null
    }
  }, [enabled, callId, supabaseClient, awaitingAnswer, localParticipant, room, room?.state])

  return null
}
