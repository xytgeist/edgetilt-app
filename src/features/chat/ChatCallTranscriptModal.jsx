import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  chatRemapCallTranscriptSpeakers,
  chatTranscribeCallRecording,
} from '../../utils/chatCallTranscribeApi.js'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   message: {
 *     id: string,
 *     link_preview?: object | null,
 *   },
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onPreviewUpdated?: (messageId: string, preview: object) => void,
 * }} props
 */
export default function ChatCallTranscriptModal({
  open,
  onClose,
  message,
  supabaseClient,
  onPreviewUpdated,
}) {
  const [preview, setPreview] = useState(/** @type {any} */ (message?.link_preview || null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assignSpeaker, setAssignSpeaker] = useState(/** @type {number | null} */ (null))
  const [remapBusy, setRemapBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPreview(message?.link_preview || null)
    setError('')
    setAssignSpeaker(null)
  }, [open, message?.id, message?.link_preview])

  const participants = Array.isArray(preview?.participants) ? preview.participants : []
  const status = String(preview?.transcript_status || '')
  const transcript = preview?.transcript && typeof preview.transcript === 'object'
    ? preview.transcript
    : null
  const utterances = Array.isArray(transcript?.utterances) ? transcript.utterances : []
  const speakerMap = transcript?.speaker_map && typeof transcript.speaker_map === 'object'
    ? transcript.speaker_map
    : {}

  const speakerIds = useMemo(() => {
    const ids = new Set()
    for (const u of utterances) {
      if (Number.isFinite(Number(u.speaker))) ids.add(Number(u.speaker))
    }
    return Array.from(ids).sort((a, b) => a - b)
  }, [utterances])

  const participantById = useMemo(() => {
    const m = new Map()
    for (const p of participants) m.set(String(p.user_id), p)
    return m
  }, [participants])

  const applyPreview = useCallback(
    (next) => {
      if (!next || typeof next !== 'object') return
      setPreview(next)
      onPreviewUpdated?.(message.id, next)
    },
    [message?.id, onPreviewUpdated],
  )

  const runTranscribe = useCallback(
    async (force = false) => {
      if (!supabaseClient || !message?.id) return
      setLoading(true)
      setError('')
      try {
        const res = await chatTranscribeCallRecording(supabaseClient, message.id, { force })
        if (res?.link_preview) applyPreview(res.link_preview)
        if (res?.pending) {
          setError('')
          // Poll briefly for callback completion.
          for (let i = 0; i < 12; i += 1) {
            await new Promise((r) => setTimeout(r, 2500))
            const again = await chatTranscribeCallRecording(supabaseClient, message.id, {
              force: false,
            })
            if (again?.link_preview) {
              applyPreview(again.link_preview)
              if (again.link_preview.transcript_status === 'ready') break
              if (again.link_preview.transcript_status === 'failed') {
                setError(String(again.link_preview.transcript_error || 'Transcription failed.'))
                break
              }
            }
          }
        }
      } catch (e) {
        if (e?.link_preview) applyPreview(e.link_preview)
        setError(e?.message || 'Transcription failed.')
      } finally {
        setLoading(false)
      }
    },
    [supabaseClient, message?.id, applyPreview],
  )

  useEffect(() => {
    if (!open || !supabaseClient || !message?.id) return
    const st = String(message?.link_preview?.transcript_status || '')
    const hasUtterances = Array.isArray(message?.link_preview?.transcript?.utterances)
      && message.link_preview.transcript.utterances.length > 0
    if (st === 'ready' && hasUtterances) return
    void runTranscribe(false)
  }, [open, supabaseClient, message?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- run once on open

  const assignSpeakerToUser = useCallback(
    async (speaker, userId) => {
      if (!supabaseClient || !message?.id) return
      const nextMap = { ...speakerMap, [String(speaker)]: userId }
      setRemapBusy(true)
      setError('')
      try {
        const res = await chatRemapCallTranscriptSpeakers(supabaseClient, message.id, nextMap)
        if (res?.link_preview) applyPreview(res.link_preview)
        setAssignSpeaker(null)
      } catch (e) {
        setError(e?.message || 'Could not update speaker.')
      } finally {
        setRemapBusy(false)
      }
    },
    [supabaseClient, message?.id, speakerMap, applyPreview],
  )

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/70" data-chat-feature>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="relative mx-auto mt-[max(12px,env(safe-area-inset-top))] flex h-[min(88dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl sm:mt-10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold text-zinc-50">Transcript</h2>
            <p className="truncate text-[12px] text-zinc-500">
              {status === 'pending' || loading
                ? 'Transcribing…'
                : status === 'failed'
                  ? 'Transcription failed'
                  : `${utterances.length} line${utterances.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runTranscribe(true)}
            disabled={loading}
            className="rounded-full border border-zinc-600 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 touch-manipulation active:bg-zinc-800 disabled:opacity-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onClose}
            className="chat-header-glass flex h-10 w-10 items-center justify-center rounded-full text-zinc-100 touch-manipulation active:opacity-70"
            aria-label="Close transcript"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {speakerIds.length > 0 ? (
          <div className="shrink-0 border-b border-zinc-800/80 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Speakers · tap to assign
            </p>
            <div className="flex flex-wrap gap-2">
              {speakerIds.map((speaker) => {
                const uid = speakerMap[String(speaker)] || null
                const p = uid ? participantById.get(uid) : null
                return (
                  <button
                    key={speaker}
                    type="button"
                    disabled={remapBusy}
                    onClick={() => setAssignSpeaker(speaker)}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold touch-manipulation active:opacity-80 disabled:opacity-50 ${
                      assignSpeaker === speaker
                        ? 'border-cyan-500 bg-cyan-500/15 text-cyan-100'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-200'
                    }`}
                  >
                    <SpeakerAvatar participant={p} speaker={speaker} />
                    <span className="max-w-[120px] truncate">
                      {participantLabel(p) || `Speaker ${speaker + 1}`}
                    </span>
                  </button>
                )
              })}
            </div>
            {assignSpeaker != null ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[12px] text-zinc-400">
                  Assign Speaker {assignSpeaker + 1} to…
                </p>
                {participants.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    disabled={remapBusy}
                    onClick={() => void assignSpeakerToUser(assignSpeaker, p.user_id)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left touch-manipulation active:bg-zinc-800 disabled:opacity-50"
                  >
                    <SpeakerAvatar participant={p} speaker={assignSpeaker} />
                    <span className="truncate text-[14px] font-medium text-zinc-100">
                      {participantLabel(p) || 'Member'}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
          {error ? <p className="mb-3 text-[13px] text-rose-400">{error}</p> : null}
          {loading && utterances.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Listening to the recording…</p>
          ) : utterances.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              {status === 'failed'
                ? String(preview?.transcript_error || 'No transcript yet.')
                : 'No speech detected yet.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {utterances.map((u, i) => {
                const uid = u.user_id || speakerMap[String(u.speaker)] || null
                const p = uid ? participantById.get(String(uid)) : null
                return (
                  <li key={`${u.start_ms}-${u.speaker}-${i}`} className="flex gap-2.5">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 touch-manipulation"
                      onClick={() => setAssignSpeaker(Number(u.speaker))}
                      aria-label="Assign speaker"
                    >
                      <SpeakerAvatar participant={p} speaker={u.speaker} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <button
                          type="button"
                          onClick={() => setAssignSpeaker(Number(u.speaker))}
                          className="truncate text-[13px] font-semibold text-zinc-100 touch-manipulation"
                        >
                          {participantLabel(p) || `Speaker ${Number(u.speaker) + 1}`}
                        </button>
                        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                          {formatMs(u.start_ms)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-snug text-zinc-300">
                        {u.text}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** @param {{ participant?: any, speaker?: number }} props */
function SpeakerAvatar({ participant, speaker = 0 }) {
  const label = participantLabel(participant) || `S${speaker + 1}`
  const initial = label.replace(/^@/, '').charAt(0).toUpperCase() || '?'
  return (
    <div className="h-8 w-8 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
      {participant?.avatar_url ? (
        <img src={participant.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[11px] font-bold text-zinc-200">
          {initial}
        </div>
      )}
    </div>
  )
}

/** @param {any} p */
function participantLabel(p) {
  if (!p) return ''
  const name = String(p.display_name || '').trim()
  if (name) return name
  const handle = String(p.handle || '').trim().replace(/^@/, '')
  return handle ? `@${handle}` : ''
}

/** @param {number} ms */
function formatMs(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
