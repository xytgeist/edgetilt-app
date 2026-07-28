import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_MESSAGE_COLUMN_WIDTH_CLASS } from './chatVideoTileLayout.js'
import ChatCallTranscriptModal from './ChatCallTranscriptModal.jsx'

/**
 * @typedef {{
 *   user_id: string,
 *   display_name?: string | null,
 *   handle?: string | null,
 *   avatar_url?: string | null,
 * }} CallSummaryParticipant
 *
 * @typedef {{
 *   kind?: string,
 *   call_id?: string,
 *   media_mode?: 'audio' | 'video',
 *   status?: 'ended' | 'missed' | 'declined' | string,
 *   duration_seconds?: number,
 *   started_at?: string | null,
 *   answered_at?: string | null,
 *   ended_at?: string | null,
 *   started_by?: string | null,
 *   participants?: CallSummaryParticipant[],
 *   transcript_status?: string,
 *   transcript_error?: string | null,
 *   transcript?: object | null,
 * }} CallSummaryMeta
 */

/**
 * Durable in-thread card for finished chat calls (group + DM).
 * Voice: long-press → View transcript (live STT; no recording card).
 * @param {{
 *   message: {
 *     id: string,
 *     body?: string | null,
 *     created_at?: string | null,
 *     content_encoding?: string | null,
 *     link_preview?: CallSummaryMeta | null,
 *   },
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   onTranscriptUpdated?: (messageId: string, preview: object) => void,
 * }} props
 */
export default function ChatCallSummaryCard({
  message,
  supabaseClient = null,
  onTranscriptUpdated = null,
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(/** @type {{ top: number, left: number } | null} */ (null))
  const cardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const longPressTimer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))

  const meta = parseCallSummaryMeta(message.link_preview)
  const fallback = parseCallSummaryBody(message.body)
  const status = meta?.status || fallback.status
  const mediaMode = meta?.media_mode || fallback.mediaMode
  const durationSec =
    Number(meta?.duration_seconds) > 0
      ? Number(meta.duration_seconds)
      : fallback.durationSeconds
  const durationLabel = durationSec > 0 ? formatDuration(durationSec) : null
  const whenLabel = formatWhen(meta?.ended_at || meta?.started_at || message.created_at)
  const participants = Array.isArray(meta?.participants) ? meta.participants : []
  const shown = participants.slice(0, 5)
  const overflow = Math.max(0, participants.length - shown.length)

  const title = mediaMode === 'video' ? 'Video call' : 'Voice call'
  const outcomeLabel = (() => {
    if (status === 'missed') return 'Missed call'
    if (status === 'declined') return 'Call declined'
    if (durationLabel) return durationLabel
    if (message.body) return String(message.body)
    return 'Call ended'
  })()

  const isMissedOrDeclined = status === 'missed' || status === 'declined'
  const iconClass = isMissedOrDeclined
    ? 'bg-amber-500/15 text-amber-300'
    : 'bg-[#25d366]/15 text-[#25d366]'

  const canOpenTranscript =
    Boolean(supabaseClient) && mediaMode === 'audio' && status === 'ended'

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    if (!canOpenTranscript || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const menuW = 220
    const menuH = 48 + 16
    const left = Math.max(12, Math.min(rect.left + 8, window.innerWidth - menuW - 12))
    const top = Math.min(rect.bottom - 8, window.innerHeight - menuH)
    setMenuPos({ top: Math.max(12, top - (menuH - 40)), left })
    setMenuOpen(true)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12)
      }
    } catch {
      /* ignore */
    }
  }, [canOpenTranscript])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuPos(null)
  }, [])

  useEffect(() => {
    const el = cardRef.current
    if (!el || !canOpenTranscript) return undefined

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
        openMenu()
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
  }, [canOpenTranscript, clearLongPressTimer, openMenu])

  return (
    <div className="flex justify-center px-3 py-2">
      <div
        ref={cardRef}
        className={`${CHAT_MESSAGE_COLUMN_WIDTH_CLASS} overflow-hidden rounded-2xl border border-zinc-700/80 bg-gradient-to-b from-zinc-900 to-zinc-950 px-3 py-3 shadow-lg shadow-black/20 ${
          canOpenTranscript ? 'touch-manipulation' : ''
        }`}
        onContextMenu={(e) => {
          if (!canOpenTranscript) return
          e.preventDefault()
          openMenu()
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
            {mediaMode === 'video' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-50">{title}</p>
              {whenLabel ? (
                <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-zinc-200">
                  {whenLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-zinc-400">{outcomeLabel}</p>
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="mt-2.5 flex items-center gap-2">
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
          liveSummary
        />
      ) : null}
    </div>
  )
}

/** @param {unknown} raw */
export function parseCallSummaryMeta(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  if (obj.kind !== 'call_summary') return null
  return /** @type {CallSummaryMeta} */ (obj)
}

/** @param {string | null | undefined} body */
function parseCallSummaryBody(body) {
  const text = String(body || '').trim()
  let status = 'ended'
  if (/^Missed/i.test(text)) status = 'missed'
  else if (/declined/i.test(text)) status = 'declined'
  const mediaMode = /video/i.test(text) ? 'video' : 'audio'
  let durationSeconds = 0
  const m = text.match(/(\d+):(\d{2})\s*$/)
  if (m) durationSeconds = Number(m[1]) * 60 + Number(m[2])
  return { status, mediaMode, durationSeconds }
}

function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function participantLabel(p) {
  const name = String(p?.display_name || '').trim()
  if (name) return name
  const handle = String(p?.handle || '').trim()
  if (handle) return handle.startsWith('@') ? handle : `@${handle}`
  return 'Participant'
}

function ParticipantAvatar({ participant }) {
  const label = participantLabel(participant)
  const url = String(participant?.avatar_url || '').trim()
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-7 w-7 rounded-full border-2 border-zinc-950 object-cover"
      />
    )
  }
  const initial = label.replace(/^@/, '').slice(0, 1).toUpperCase() || '?'
  return (
    <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-zinc-950 bg-zinc-700 text-[10px] font-bold text-zinc-100">
      {initial}
    </div>
  )
}

function TranscriptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
    </svg>
  )
}
