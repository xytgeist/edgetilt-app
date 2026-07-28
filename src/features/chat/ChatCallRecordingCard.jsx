import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureCallRecordingPosterPersisted } from '../../utils/chatCallRecordingPoster.js'
import ChatCallTranscriptModal from './ChatCallTranscriptModal.jsx'
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
 * Long-press → Copy link / Share / Delete (owner or recorder).
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
 *   canDelete?: boolean,
 *   onDelete?: (() => void) | null,
 *   onTranscriptUpdated?: (messageId: string, preview: object) => void,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onOpen: () => void,
 * }} props
 */
export default function ChatCallRecordingCard({
  message,
  isMine = false,
  canDelete = false,
  onDelete = null,
  onTranscriptUpdated = null,
  supabaseClient = null,
  onOpen,
}) {
  const videoUrl = String(message.video_url || '').trim()
  const storedPoster = String(message.stream_poster_url || '').trim()
  const meta = parseCallRecordingMeta(message.link_preview)
  const [posterUrl, setPosterUrl] = useState(storedPoster)
  const [frameSize, setFrameSize] = useState(() => ({
    w: Number(message.stream_video_width) || 0,
    h: Number(message.stream_video_height) || 0,
  }))
  const videoW = Number(message.stream_video_width) || frameSize.w || 0
  const videoH = Number(message.stream_video_height) || frameSize.h || 0
  // New call recordings are portrait; fall back to 9:16 when dims are not on the row yet.
  const isPortrait = !(videoW > 0 && videoH > 0) || videoH >= videoW
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(/** @type {{ top: number, left: number } | null} */ (null))
  const [linkCopied, setLinkCopied] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const cardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const longPressTimer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const suppressClickRef = useRef(false)

  useEffect(() => {
    setPosterUrl(storedPoster)
  }, [storedPoster])

  useEffect(() => {
    setFrameSize({
      w: Number(message.stream_video_width) || 0,
      h: Number(message.stream_video_height) || 0,
    })
  }, [message.stream_video_width, message.stream_video_height])

  useEffect(() => {
    if (storedPoster || !videoUrl || !supabaseClient || !message?.id) return undefined
    let cancelled = false
    void (async () => {
      const saved = await ensureCallRecordingPosterPersisted(supabaseClient, {
        id: message.id,
        video_url: videoUrl,
        stream_poster_url: storedPoster || null,
      })
      if (cancelled || !saved?.posterUrl) return
      setPosterUrl(saved.posterUrl)
      if (saved.width && saved.height) {
        setFrameSize({ w: saved.width, h: saved.height })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient, message?.id, storedPoster, videoUrl])

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const openShareMenu = useCallback(() => {
    if (!videoUrl || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const menuW = 220
    const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    const rows = 2 + (nativeShare ? 1 : 0) + (canDelete && onDelete ? 1 : 0) + (supabaseClient ? 1 : 0)
    const menuH = 48 * rows + 16
    const left = Math.max(12, Math.min(rect.left + 8, window.innerWidth - menuW - 12))
    const top = Math.min(rect.bottom - 8, window.innerHeight - menuH)
    setMenuPos({ top: Math.max(12, top - (menuH - 40)), left })
    setLinkCopied(false)
    setMenuOpen(true)
    suppressClickRef.current = true
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12)
      }
    } catch {
      /* ignore */
    }
  }, [videoUrl, canDelete, onDelete, supabaseClient])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuPos(null)
    setLinkCopied(false)
  }, [])

  useEffect(() => {
    const el = cardRef.current
    if (!el || !videoUrl) return undefined

    let startX = 0
    let startY = 0
    let cancelled = false

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      cancelled = false
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      clearLongPressTimer()
      longPressTimer.current = setTimeout(() => {
        if (cancelled) return
        openShareMenu()
      }, 380)
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 1 || cancelled) return
      if (
        Math.abs(e.touches[0].clientX - startX) > 8 ||
        Math.abs(e.touches[0].clientY - startY) > 8
      ) {
        cancelled = true
        clearLongPressTimer()
      }
    }

    const onTouchEnd = () => {
      clearLongPressTimer()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      clearLongPressTimer()
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [videoUrl, clearLongPressTimer, openShareMenu])

  const copyLink = useCallback(async () => {
    if (!videoUrl) return
    try {
      await navigator.clipboard?.writeText(videoUrl)
      setLinkCopied(true)
      window.setTimeout(() => closeMenu(), 700)
    } catch {
      closeMenu()
    }
  }, [videoUrl, closeMenu])

  const shareLink = useCallback(async () => {
    if (!videoUrl) return
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Call recording',
          url: videoUrl,
        })
        closeMenu()
        return
      }
    } catch (err) {
      // User cancelled share sheet — keep menu closed either way.
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        closeMenu()
        return
      }
    }
    await copyLink()
  }, [videoUrl, closeMenu, copyLink])

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
  const canShareNative =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-1 py-1`}>
      <div
        ref={cardRef}
        className={`${CHAT_MESSAGE_COLUMN_WIDTH_CLASS} overflow-hidden rounded-2xl border border-zinc-700/80 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-lg shadow-black/20`}
        onContextMenu={(e) => {
          if (!videoUrl) return
          e.preventDefault()
          openShareMenu()
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            onOpen()
          }}
          disabled={!videoUrl}
          className={`relative mx-auto block overflow-hidden touch-manipulation active:opacity-90 disabled:opacity-60 ${
            isPortrait ? 'aspect-[9/16] w-[min(100%,12rem)]' : 'aspect-[16/10] w-full'
          }`}
          aria-label="Play call recording"
        >
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
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

      {menuOpen && menuPos
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[108] bg-black/30" onClick={closeMenu} />
              <div
                className="chat-menu-glass fixed z-[109] w-[220px] overflow-hidden rounded-2xl"
                style={{ top: menuPos.top, left: menuPos.left }}
                onClick={(e) => e.stopPropagation()}
              >
                {canShareNative ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-zinc-50 touch-manipulation active:bg-zinc-800/80"
                    onClick={() => void shareLink()}
                  >
                    <ShareIcon />
                    Share
                  </button>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-zinc-50 touch-manipulation active:bg-zinc-800/80"
                  onClick={() => void copyLink()}
                >
                  <LinkIcon />
                  {linkCopied ? 'Copied' : 'Copy link'}
                </button>
                {supabaseClient ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-zinc-50 touch-manipulation active:bg-zinc-800/80"
                    onClick={() => {
                      closeMenu()
                      setTranscriptOpen(true)
                    }}
                  >
                    <TranscriptIcon />
                    View transcript
                  </button>
                ) : null}
                {canDelete && onDelete ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-red-400 touch-manipulation active:bg-zinc-800/80"
                    onClick={() => {
                      closeMenu()
                      onDelete()
                    }}
                  >
                    <TrashIcon />
                    Delete
                  </button>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}

      {transcriptOpen && supabaseClient ? (
        <ChatCallTranscriptModal
          open={transcriptOpen}
          onClose={() => setTranscriptOpen(false)}
          message={message}
          supabaseClient={supabaseClient}
          onPreviewUpdated={onTranscriptUpdated || undefined}
        />
      ) : null}
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

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function TranscriptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  )
}
