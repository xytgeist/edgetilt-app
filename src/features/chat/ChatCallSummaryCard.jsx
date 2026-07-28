import { useState } from 'react'
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

  const transcriptStatus = String(meta?.transcript_status || '')
  const hasTranscriptLines = Array.isArray(meta?.transcript?.utterances)
    && meta.transcript.utterances.length > 0
  const showTranscriptCta =
    mediaMode === 'audio' &&
    status === 'ended' &&
    (hasTranscriptLines || transcriptStatus === 'ready' || transcriptStatus === 'pending' || transcriptStatus === 'failed')

  return (
    <div className="flex justify-center px-3 py-2">
      <div
        className={`${CHAT_MESSAGE_COLUMN_WIDTH_CLASS} overflow-hidden rounded-2xl border border-zinc-700/80 bg-gradient-to-b from-zinc-900 to-zinc-950 px-3 py-3 shadow-lg shadow-black/20`}
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

        {showTranscriptCta ? (
          <button
            type="button"
            className="mt-2.5 w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-[12px] font-semibold text-zinc-100 touch-manipulation active:bg-zinc-800"
            onClick={() => setTranscriptOpen(true)}
          >
            {transcriptStatus === 'pending' && !hasTranscriptLines
              ? 'Transcript pending…'
              : transcriptStatus === 'failed' && !hasTranscriptLines
                ? 'Transcript unavailable'
                : 'View transcript'}
          </button>
        ) : null}
      </div>

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
