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
  /** `deepgram_live` may appear on legacy voice-summary rows; product no longer writes it. */
  provider: 'deepgram' | 'deepgram_live'
  language: string | null
  utterances: CallTranscriptUtterance[]
  speaker_map: Record<string, string>
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

