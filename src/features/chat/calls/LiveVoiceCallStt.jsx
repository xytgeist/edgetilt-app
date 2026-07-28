import { useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import {
  chatAppendLiveCallTranscript,
  chatMintLiveCallSttGrant,
} from '../../../utils/chatCallTranscribeApi.js'
import { createLiveCallSttSession } from './liveCallStt.js'

const FLUSH_MS = 2_000
const MAX_BATCH = 12

/**
 * Auto-starts Deepgram live STT for voice calls once a remote participant joins
 * and call audio playback is unlocked (avoids racing iPhone AudioContext).
 * Streams only the local mic; Edge stamps user_id from the JWT.
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
  const [audioReady, setAudioReady] = useState(() => Boolean(room?.canPlaybackAudio))
  const sessionRef = useRef(/** @type {ReturnType<typeof createLiveCallSttSession> | null} */ (null))
  const pendingRef = useRef(
    /** @type {Array<{ id: string, start_ms: number, end_ms: number, text: string }> } */ ([]),
  )
  const flushTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!room) {
      setAudioReady(false)
      return undefined
    }
    const sync = () => setAudioReady(Boolean(room.canPlaybackAudio))
    sync()
    const onChange = () => sync()
    room.on?.('audioPlaybackStatusChanged', onChange)
    // Poll briefly... some iOS builds fire late without the event.
    const id = window.setInterval(sync, 1000)
    return () => {
      room.off?.('audioPlaybackStatusChanged', onChange)
      window.clearInterval(id)
    }
  }, [room])

  useEffect(() => {
    stoppedRef.current = false
    if (!enabled || !callId || !supabaseClient || awaitingAnswer || !audioReady) {
      return undefined
    }

    const getMicTrack = () => {
      const pub =
        localParticipant?.getTrackPublication?.(Track.Source.Microphone) ||
        localParticipant?.getTrackPublications?.()?.find(
          (p) => p.source === Track.Source.Microphone || p.kind === Track.Kind.Audio,
        )
      return pub?.track?.mediaStreamTrack || null
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
    void (async () => {
      try {
        await session.connect()
        if (cancelled) {
          await session.stop()
          return
        }
        session.syncTrack()
      } catch (err) {
        console.warn('Live voice STT connect failed', err)
      }
    })()

    const syncTimer = window.setInterval(() => {
      if (!cancelled) session.syncTrack()
    }, 2000)

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
  }, [enabled, callId, supabaseClient, awaitingAnswer, audioReady, localParticipant])

  return null
}
