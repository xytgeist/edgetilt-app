import { useEffect, useRef, useState } from 'react'
import { CHAT_MESSAGE_COLUMN_WIDTH_CLASS } from './chatVideoTileLayout.js'

/**
 * @typedef {{
 *   user_id: string,
 *   display_name?: string | null,
 *   handle?: string | null,
 *   avatar_url?: string | null,
 * }} CallRecordingParticipant
 *
 * @typedef {{
 *   kind?: string,
 *   call_id?: string,
 *   media_mode?: 'audio' | 'video',
 *   duration_seconds?: number,
 *   started_at?: string | null,
 *   ended_at?: string,
 *   started_by?: string | null,
 *   participants?: CallRecordingParticipant[],
 * }} CallRecordingMeta
 */

/**
 * Rich in-thread card for LiveKit call recordings.
 * @param {{
 *   message: {
 *     id: string,
 *     body?: string | null,
 *     video_url?: string | null,
 *     stream_poster_url?: string | null,
 *     created_at?: string | null,
 *     link_preview?: CallRecordingMeta | null,
 *     sender_id?: string | null,
 *   },
 *   isMine?: boolean,
 *   onOpen: () => void,
 * }} props
 */
export default function ChatCallRecordingCard({ message, isMine = false, onOpen }) {
  const videoUrl = String(message.video_url || '').trim()
  const storedPoster = String(message.stream_poster_url || '').trim()
  const meta = parseCallRecordingMeta(message.link_preview)
  const [framePoster, setFramePoster] = useState(/** @type {string | null} */ (null))
  const captureRef = useRef(/** @type {HTMLVideoElement | null} */ (null))

  useEffect(() => {
    if (storedPoster || !videoUrl || framePoster) return undefined
    const video = document.createElement('video')
    captureRef.current = video
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    let cancelled = false

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
      captureRef.current = null
    }

    const capture = () => {
      if (cancelled || !video.videoWidth || !video.videoHeight) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        if (!cancelled && dataUrl.startsWith('data:image')) setFramePoster(dataUrl)
      } catch {
        /* CORS / tainted canvas — fall back to live video thumb */
      }
    }

    const onLoaded = () => {
      try {
        video.currentTime = Math.min(0.35, Math.max(0.05, (video.duration || 1) * 0.02))
      } catch {
        capture()
      }
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('seeked', capture)
    video.src = videoUrl

    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('seeked', capture)
      cleanup()
    }
  }, [videoUrl, storedPoster, framePoster])

  const posterUrl = storedPoster || framePoster
  const durationSec = Number(meta?.duration_seconds) || 0
  const durationLabel = durationSec > 0 ? formatDuration(durationSec) : null
  const whenLabel = formatWhen(meta?.started_at || message.created_at)
  const participants = Array.isArray(meta?.participants) ? meta.participants : []
  const starterId = meta?.started_by || message.sender_id || null
  const starter = participants.find((p) => p.user_id === starterId) || null
  const starterLabel = participantLabel(starter)
  const mediaLabel = meta?.media_mode === 'audio' ? 'Voice' : 'Video'
  const shown = participants.slice(0, 5)
  const overflow = Math.max(0, participants.length - shown.length)

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-1 py-1`}>
      <div
        className={`${CHAT_MESSAGE_COLUMN_WIDTH_CLASS} overflow-hidden rounded-2xl border border-zinc-700/80 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-lg shadow-black/20`}
      >
        <button
          type="button"
          onClick={onOpen}
          disabled={!videoUrl}
          className="relative block w-full touch-manipulation active:opacity-90 disabled:opacity-60"
          aria-label="Play call recording"
          style={{ aspectRatio: '16 / 10' }}
        >
          {posterUrl ? (
            <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : videoUrl ? (
            <video
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
          ) : (
            <div className="absolute inset-0 bg-zinc-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/25" />
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ea4335]" aria-hidden />
            Rec
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden className="ml-0.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        </button>

        <div className="space-y-2.5 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-zinc-50">Call recording</p>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                {mediaLabel}
                {whenLabel ? ` · ${whenLabel}` : ''}
              </p>
            </div>
            {durationLabel ? (
              <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200">
                {durationLabel}
              </span>
            ) : null}
          </div>

          {shown.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {shown.map((p) => (
                  <ParticipantAvatar key={p.user_id} participant={p} />
                ))}
                {overflow > 0 ? (
                  <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-zinc-950 bg-zinc-700 text-[10px] font-bold text-zinc-100">
                    +{overflow}
                  </div>
                ) : null}
              </div>
              <p className="min-w-0 truncate text-[12px] text-zinc-400">
                {participants.length === 1
                  ? participantLabel(participants[0])
                  : `${participants.length} people`}
              </p>
            </div>
          ) : null}

          {starterLabel ? (
            <p className="text-[11px] text-zinc-500">
              Recorded by <span className="font-medium text-zinc-300">{starterLabel}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** @param {unknown} raw */
export function parseCallRecordingMeta(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  if (obj.kind !== 'call_recording') return null
  return /** @type {CallRecordingMeta} */ (obj)
}

/** @param {number} totalSec */
function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** @param {string | null | undefined} iso */
function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** @param {CallRecordingParticipant | null | undefined} p */
function participantLabel(p) {
  if (!p) return ''
  const name = String(p.display_name || '').trim()
  if (name) return name
  const handle = String(p.handle || '').trim().replace(/^@/, '')
  return handle ? `@${handle}` : ''
}

/** @param {{ participant: CallRecordingParticipant }} props */
function ParticipantAvatar({ participant }) {
  const label = participantLabel(participant) || '?'
  const initial = label.replace(/^@/, '').charAt(0).toUpperCase() || '?'
  return (
    <div
      className="h-7 w-7 overflow-hidden rounded-full border-2 border-zinc-950 bg-zinc-700"
      title={label}
    >
      {participant.avatar_url ? (
        <img src={participant.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[11px] font-bold text-zinc-200">
          {initial}
        </div>
      )}
    </div>
  )
}
