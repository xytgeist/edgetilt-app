/**
 * Call recording transcript helpers (Deepgram diarization → participant labels).
 */

export type CallTranscriptParticipant = {
  user_id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
}

export type CallTranscriptUtterance = {
  start_ms: number
  end_ms: number
  text: string
  speaker: number
  user_id: string | null
}

export type CallTranscriptPayload = {
  provider: 'deepgram' | 'deepgram_live'
  language: string | null
  utterances: CallTranscriptUtterance[]
  speaker_map: Record<string, string>
}

/** Draft stored on chat_calls.live_transcript during / after a voice call. */
export type LiveCallTranscriptDraft = {
  status?: 'pending' | 'ready' | 'failed' | string
  language?: string | null
  error?: string | null
  updated_at?: string
  utterances?: Array<{
    id?: string
    start_ms?: number
    end_ms?: number
    text?: string
    user_id?: string
    speaker?: number
  }>
}

export type CallRecordingPreviewWithTranscript = {
  kind?: string
  participants?: CallTranscriptParticipant[]
  transcript_status?: 'pending' | 'ready' | 'failed' | string
  transcript_error?: string | null
  transcript?: CallTranscriptPayload | null
  [key: string]: unknown
}

/** Keep transcript fields when re-finalizing recording metadata. */
export function pickTranscriptFields(
  preview: unknown,
): Pick<CallRecordingPreviewWithTranscript, 'transcript_status' | 'transcript_error' | 'transcript'> {
  if (!preview || typeof preview !== 'object') return {}
  const p = preview as CallRecordingPreviewWithTranscript
  const out: Pick<
    CallRecordingPreviewWithTranscript,
    'transcript_status' | 'transcript_error' | 'transcript'
  > = {}
  if (p.transcript_status) out.transcript_status = p.transcript_status
  if (p.transcript_error != null) out.transcript_error = p.transcript_error
  if (p.transcript && typeof p.transcript === 'object') out.transcript = p.transcript
  return out
}

export function mergePreviewPreservingTranscript(
  nextPreview: Record<string, unknown>,
  existingPreview: unknown,
): Record<string, unknown> {
  return { ...nextPreview, ...pickTranscriptFields(existingPreview) }
}

/**
 * Map diarized speaker indices → participant user_ids.
 * Order: first appearance in the recording → participants by joined order.
 */
export function buildSpeakerMap(
  speakerIds: number[],
  participants: CallTranscriptParticipant[],
  existingMap?: Record<string, string> | null,
): Record<string, string> {
  const map: Record<string, string> = {}
  if (existingMap && typeof existingMap === 'object') {
    for (const [k, v] of Object.entries(existingMap)) {
      const uid = String(v || '').trim()
      if (uid && participants.some((p) => p.user_id === uid)) map[String(k)] = uid
    }
  }

  const orderedSpeakers = Array.from(new Set(speakerIds.filter((n) => Number.isFinite(n)))).sort(
    (a, b) => a - b,
  )
  const used = new Set(Object.values(map))
  let pIdx = 0
  for (const speaker of orderedSpeakers) {
    const key = String(speaker)
    if (map[key]) continue
    while (pIdx < participants.length && used.has(participants[pIdx].user_id)) pIdx += 1
    if (pIdx >= participants.length) break
    const uid = participants[pIdx].user_id
    map[key] = uid
    used.add(uid)
    pIdx += 1
  }
  return map
}

export function applySpeakerMapToUtterances(
  utterances: CallTranscriptUtterance[],
  speakerMap: Record<string, string>,
): CallTranscriptUtterance[] {
  return utterances.map((u) => ({
    ...u,
    user_id: speakerMap[String(u.speaker)] || null,
  }))
}

type DeepgramUtterance = {
  start?: number
  end?: number
  transcript?: string
  speaker?: number
}

type DeepgramListenResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string
        words?: Array<{ speaker?: number }>
      }>
    }>
    utterances?: DeepgramUtterance[]
  }
  metadata?: { language?: string; language_code?: string }
}

/** Parse Deepgram pre-recorded listen JSON into our transcript payload. */
export function transcriptFromDeepgram(
  dg: DeepgramListenResponse,
  participants: CallTranscriptParticipant[],
  existingMap?: Record<string, string> | null,
): CallTranscriptPayload {
  const raw = Array.isArray(dg?.results?.utterances) ? dg.results!.utterances! : []
  let utterances: CallTranscriptUtterance[] = raw
    .map((u) => {
      const text = String(u.transcript || '').trim()
      if (!text) return null
      const startSec = Number(u.start)
      const endSec = Number(u.end)
      const speaker = Number.isFinite(Number(u.speaker)) ? Math.max(0, Math.floor(Number(u.speaker))) : 0
      return {
        start_ms: Number.isFinite(startSec) ? Math.max(0, Math.round(startSec * 1000)) : 0,
        end_ms: Number.isFinite(endSec) ? Math.max(0, Math.round(endSec * 1000)) : 0,
        text,
        speaker,
        user_id: null as string | null,
      }
    })
    .filter(Boolean) as CallTranscriptUtterance[]

  // Fallback: single blob if utterances empty but full transcript exists.
  if (utterances.length === 0) {
    const alt = dg?.results?.channels?.[0]?.alternatives?.[0]
    const text = String(alt?.transcript || '').trim()
    if (text) {
      utterances = [{ start_ms: 0, end_ms: 0, text, speaker: 0, user_id: null }]
    }
  }

  const speakerMap = buildSpeakerMap(
    utterances.map((u) => u.speaker),
    participants,
    existingMap,
  )
  utterances = applySpeakerMapToUtterances(utterances, speakerMap)

  const language =
    String(dg?.metadata?.language_code || dg?.metadata?.language || '').trim() || null

  return {
    provider: 'deepgram',
    language,
    utterances,
    speaker_map: speakerMap,
  }
}

/**
 * Build the durable transcript payload from a live STT draft.
 * Speakers are allocated by first-appearance of each user_id (identity known from LiveKit).
 */
export function transcriptFromLiveDraft(
  draft: LiveCallTranscriptDraft | null | undefined,
  participants: CallTranscriptParticipant[],
  existingMap?: Record<string, string> | null,
): CallTranscriptPayload | null {
  const raw = Array.isArray(draft?.utterances) ? draft!.utterances! : []
  const cleaned = raw
    .map((u) => {
      const text = String(u?.text || '').trim()
      const userId = String(u?.user_id || '').trim()
      if (!text || !userId) return null
      const startMs = Number(u.start_ms)
      const endMs = Number(u.end_ms)
      return {
        start_ms: Number.isFinite(startMs) ? Math.max(0, Math.round(startMs)) : 0,
        end_ms: Number.isFinite(endMs) ? Math.max(0, Math.round(endMs)) : 0,
        text,
        user_id: userId,
        speaker: Number.isFinite(Number(u.speaker)) ? Math.max(0, Math.floor(Number(u.speaker))) : -1,
      }
    })
    .filter(Boolean) as Array<CallTranscriptUtterance & { speaker: number }>

  if (cleaned.length === 0) return null

  cleaned.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)

  const speakerMap: Record<string, string> = {}
  if (existingMap && typeof existingMap === 'object') {
    for (const [k, v] of Object.entries(existingMap)) {
      const uid = String(v || '').trim()
      if (uid && participants.some((p) => p.user_id === uid)) speakerMap[String(k)] = uid
    }
  }

  const userToSpeaker = new Map<string, number>()
  for (const [k, uid] of Object.entries(speakerMap)) {
    if (!userToSpeaker.has(uid)) userToSpeaker.set(uid, Number(k))
  }

  let nextSpeaker = 0
  for (const n of Object.keys(speakerMap).map(Number)) {
    if (Number.isFinite(n) && n >= nextSpeaker) nextSpeaker = n + 1
  }

  const utterances: CallTranscriptUtterance[] = cleaned.map((u) => {
    let speaker = userToSpeaker.get(u.user_id || '')
    if (speaker == null) {
      if (u.speaker >= 0 && !Object.values(speakerMap).includes(u.user_id || '')) {
        // Prefer client-provided index when free.
        const key = String(u.speaker)
        if (!speakerMap[key] || speakerMap[key] === u.user_id) {
          speaker = u.speaker
        }
      }
      if (speaker == null) {
        speaker = nextSpeaker
        nextSpeaker += 1
      }
      userToSpeaker.set(u.user_id || '', speaker)
      speakerMap[String(speaker)] = u.user_id || ''
    }
    return {
      start_ms: u.start_ms,
      end_ms: u.end_ms,
      text: u.text,
      speaker,
      user_id: u.user_id,
    }
  })

  // Ensure map covers every speaker and stays within known participants when possible.
  const finalMap = buildSpeakerMap(
    utterances.map((u) => u.speaker),
    participants,
    speakerMap,
  )

  return {
    provider: 'deepgram_live',
    language: draft?.language ? String(draft.language) : null,
    speaker_map: finalMap,
    utterances: applySpeakerMapToUtterances(utterances, finalMap),
  }
}

/** Merge new live utterances into a draft (dedupe by id). */
export function mergeLiveTranscriptUtterances(
  draft: LiveCallTranscriptDraft | null | undefined,
  incoming: Array<{
    id?: string
    start_ms: number
    end_ms: number
    text: string
    user_id: string
    speaker?: number
  }>,
  language?: string | null,
): LiveCallTranscriptDraft {
  const prev = draft && typeof draft === 'object' ? draft : {}
  const byId = new Map<string, NonNullable<LiveCallTranscriptDraft['utterances']>[number]>()
  for (const u of Array.isArray(prev.utterances) ? prev.utterances : []) {
    const id = String(u?.id || '').trim()
    if (id) byId.set(id, u)
  }
  for (const u of incoming) {
    const text = String(u.text || '').trim()
    const userId = String(u.user_id || '').trim()
    if (!text || !userId) continue
    const startMs = Math.max(0, Math.round(Number(u.start_ms) || 0))
    const endMs = Math.max(startMs, Math.round(Number(u.end_ms) || startMs))
    const id = String(u.id || `${userId}:${startMs}:${endMs}:${text.slice(0, 32)}`).trim()
    byId.set(id, {
      id,
      start_ms: startMs,
      end_ms: endMs,
      text,
      user_id: userId,
      speaker: Number.isFinite(Number(u.speaker)) ? Math.max(0, Math.floor(Number(u.speaker))) : undefined,
    })
  }
  const utterances = Array.from(byId.values()).sort(
    (a, b) => Number(a.start_ms || 0) - Number(b.start_ms || 0),
  )
  return {
    status: utterances.length ? 'ready' : String(prev.status || 'pending'),
    language: language != null ? language : prev.language ?? null,
    error: null,
    updated_at: new Date().toISOString(),
    utterances,
  }
}
