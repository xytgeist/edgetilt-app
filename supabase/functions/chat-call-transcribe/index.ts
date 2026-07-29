/**
 * Transcribe call recordings (Deepgram diarization) and live voice-call STT.
 *
 * Actions:
 * - transcribe (user JWT or service role) — run / resume STT for a call_recording message
 * - remap_speakers (user JWT) — assign speaker indices to participant user_ids (recording or summary)
 * - deepgram_callback (callback secret) — async Deepgram completion
 * - mint_live_stt_grant (user JWT) — short-lived Deepgram token for browser live listen (audio calls)
 * - append_live_transcript (user JWT) — merge per-participant finals into chat_calls.live_transcript
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  applySpeakerMapToUtterances,
  buildSpeakerMap,
  mergeLiveTranscriptUtterances,
  transcriptFromDeepgram,
  transcriptFromLiveDraft,
  type CallRecordingPreviewWithTranscript,
  type CallTranscriptParticipant,
  type CallTranscriptPayload,
  type LiveCallTranscriptDraft,
} from '../_shared/chatCallTranscript.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isServiceRole(authHeader: string, serviceKey: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  return Boolean(token && serviceKey && token === serviceKey)
}

async function requireRoomMember(
  admin: ReturnType<typeof createClient>,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('chat_room_members')
    .select('room_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.room_id)
}

function participantsFromPreview(preview: CallRecordingPreviewWithTranscript): CallTranscriptParticipant[] {
  const list = Array.isArray(preview.participants) ? preview.participants : []
  return list
    .map((p) => ({
      user_id: String(p?.user_id || '').trim(),
      display_name: p?.display_name ? String(p.display_name) : null,
      handle: p?.handle ? String(p.handle) : null,
      avatar_url: p?.avatar_url ? String(p.avatar_url) : null,
    }))
    .filter((p) => p.user_id)
}

async function patchMessagePreview(
  admin: ReturnType<typeof createClient>,
  messageId: string,
  existingPreview: unknown,
  patch: Record<string, unknown>,
): Promise<CallRecordingPreviewWithTranscript> {
  const base =
    existingPreview && typeof existingPreview === 'object'
      ? { ...(existingPreview as Record<string, unknown>) }
      : {}
  const next = { ...base, ...patch } as CallRecordingPreviewWithTranscript
  const { error } = await admin
    .from('chat_messages')
    .update({ link_preview: next })
    .eq('id', messageId)
  if (error) throw new Error(error.message)
  return next
}

async function loadTranscriptMessage(
  admin: ReturnType<typeof createClient>,
  messageId: string,
) {
  const { data, error } = await admin
    .from('chat_messages')
    .select('id, room_id, deleted_at, content_encoding, video_url, link_preview')
    .eq('id', messageId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function loadRecordingMessage(
  admin: ReturnType<typeof createClient>,
  messageId: string,
) {
  return loadTranscriptMessage(admin, messageId)
}

async function requireCallParticipant(
  admin: ReturnType<typeof createClient>,
  callId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('chat_call_participants')
    .select('user_id')
    .eq('call_id', callId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.user_id)
}

async function syncCallSummaryLiveTranscript(
  admin: ReturnType<typeof createClient>,
  callId: string,
  draft: LiveCallTranscriptDraft,
): Promise<CallRecordingPreviewWithTranscript | null> {
  const { data: msg } = await admin
    .from('chat_messages')
    .select('id, link_preview')
    .eq('content_encoding', 'call_summary')
    .contains('link_preview', { kind: 'call_summary', call_id: callId })
    .limit(1)
    .maybeSingle()
  if (!msg?.id) return null

  const preview = (msg.link_preview || {}) as CallRecordingPreviewWithTranscript
  const participants = participantsFromPreview(preview)
  const existingMap =
    preview.transcript && typeof preview.transcript === 'object'
      ? preview.transcript.speaker_map
      : null
  const transcript = transcriptFromLiveDraft(draft, participants, existingMap)
  if (!transcript) return preview

  return patchMessagePreview(admin, msg.id, preview, {
    transcript_status: 'ready',
    transcript_error: null,
    transcript,
  })
}

async function runDeepgramSync(videoUrl: string, apiKey: string): Promise<unknown> {
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    utterances: 'true',
    diarize_model: 'latest',
  })
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: videoUrl }),
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { error: text }
  }
  if (!res.ok) {
    const errMsg =
      body && typeof body === 'object' && body !== null && 'err_msg' in body
        ? String((body as { err_msg?: string }).err_msg)
        : text.slice(0, 240) || `Deepgram HTTP ${res.status}`
    throw new Error(errMsg)
  }
  return body
}

async function startDeepgramCallback(
  videoUrl: string,
  apiKey: string,
  callbackUrl: string,
): Promise<void> {
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    utterances: 'true',
    diarize_model: 'latest',
    callback: callbackUrl,
  })
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: videoUrl }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.slice(0, 240) || `Deepgram callback HTTP ${res.status}`)
  }
}

function applyTranscriptToPreview(
  preview: CallRecordingPreviewWithTranscript,
  transcript: CallTranscriptPayload,
): Record<string, unknown> {
  return {
    ...preview,
    transcript_status: 'ready',
    transcript_error: null,
    transcript,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY')?.trim() || ''
  const callbackSecret = Deno.env.get('CHAT_CALL_TRANSCRIBE_CALLBACK_SECRET')?.trim() || ''
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const authHeader = req.headers.get('Authorization') || ''
  const url = new URL(req.url)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const action =
    String(body?.action || url.searchParams.get('action') || '').trim() || 'transcribe'

  // ── deepgram_callback ────────────────────────────────────────────────────
  if (action === 'deepgram_callback') {
    const token = String(url.searchParams.get('token') || body?.token || '').trim()
    const messageId = String(url.searchParams.get('message_id') || body?.message_id || '').trim()
    if (!callbackSecret || token !== callbackSecret) {
      return json(401, { error: 'Invalid callback token.' })
    }
    if (!messageId) return json(400, { error: 'message_id is required.' })

    const msg = await loadRecordingMessage(admin, messageId)
    if (!msg || msg.deleted_at || msg.content_encoding !== 'call_recording') {
      return json(404, { error: 'Recording message not found.' })
    }
    const preview = (msg.link_preview || {}) as CallRecordingPreviewWithTranscript
    const participants = participantsFromPreview(preview)
    try {
      const existingMap =
        preview.transcript && typeof preview.transcript === 'object'
          ? preview.transcript.speaker_map
          : null
      const transcript = transcriptFromDeepgram(
        body as Parameters<typeof transcriptFromDeepgram>[0],
        participants,
        existingMap,
      )
      const next = await patchMessagePreview(
        admin,
        messageId,
        preview,
        applyTranscriptToPreview(preview, transcript),
      )
      return json(200, { ok: true, link_preview: next })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const next = await patchMessagePreview(admin, messageId, preview, {
        transcript_status: 'failed',
        transcript_error: errMsg.slice(0, 500),
      })
      return json(200, { ok: false, error: errMsg, link_preview: next })
    }
  }

  // Auth: service role OR user JWT
  let actorUserId: string | null = null
  const service = isServiceRole(authHeader, serviceKey)
  if (!service) {
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json(401, { error: 'Missing Authorization bearer token.' })
    }
    const jwt = authHeader.slice(7).trim()
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt)
    if (userErr || !user?.id) return json(401, { error: 'Invalid session.' })
    actorUserId = user.id
  }

  // ── mint_live_stt_grant ──────────────────────────────────────────────────
  if (action === 'mint_live_stt_grant') {
    if (!actorUserId) return json(403, { error: 'User session required.' })
    if (!deepgramKey) {
      return json(500, { error: 'DEEPGRAM_API_KEY is not configured.' })
    }
    const callId = String(body?.call_id || '').trim()
    if (!callId) return json(400, { error: 'call_id is required.' })

    const { data: call, error: callErr } = await admin
      .from('chat_calls')
      .select('id, chat_room_id, media_mode, status')
      .eq('id', callId)
      .maybeSingle()
    if (callErr) return json(500, { error: callErr.message })
    if (!call) return json(404, { error: 'Call not found.' })
    if (call.media_mode !== 'audio') {
      return json(400, { error: 'Live STT is only available on voice calls.' })
    }
    if (!['ringing', 'active'].includes(String(call.status))) {
      return json(400, { error: 'Call is not active.' })
    }
    if (!(await requireRoomMember(admin, call.chat_room_id, actorUserId))) {
      return json(403, { error: 'Not a room member.' })
    }
    if (!(await requireCallParticipant(admin, callId, actorUserId))) {
      return json(403, { error: 'Join the call before starting live STT.' })
    }

    // Mark draft as soon as mint is attempted so empty `{}` means "client never called".
    const { data: existing } = await admin
      .from('chat_calls')
      .select('live_transcript')
      .eq('id', callId)
      .maybeSingle()
    const prev = (existing?.live_transcript || {}) as LiveCallTranscriptDraft
    const baseDraft: LiveCallTranscriptDraft = {
      ...prev,
      status: prev.status === 'ready' ? 'ready' : 'pending',
      error: null,
      updated_at: new Date().toISOString(),
      utterances: Array.isArray(prev.utterances) ? prev.utterances : [],
    }
    await admin.from('chat_calls').update({ live_transcript: baseDraft }).eq('id', callId)

    const grantRes = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    })
    const grantText = await grantRes.text()
    let grantBody: { access_token?: string; expires_in?: number; err_msg?: string } = {}
    try {
      grantBody = grantText ? JSON.parse(grantText) : {}
    } catch {
      grantBody = {}
    }
    if (!grantRes.ok || !grantBody.access_token) {
      const errMsg = grantBody.err_msg || grantText.slice(0, 240) || `Deepgram grant HTTP ${grantRes.status}`
      await admin
        .from('chat_calls')
        .update({
          live_transcript: {
            ...baseDraft,
            status: 'failed',
            error: errMsg.slice(0, 500),
            updated_at: new Date().toISOString(),
          },
        })
        .eq('id', callId)
      return json(502, { error: errMsg })
    }

    return json(200, {
      ok: true,
      access_token: grantBody.access_token,
      expires_in: grantBody.expires_in ?? 30,
      call_id: callId,
    })
  }

  // ── append_live_transcript ───────────────────────────────────────────────
  if (action === 'append_live_transcript') {
    if (!actorUserId) return json(403, { error: 'User session required.' })
    const callId = String(body?.call_id || '').trim()
    if (!callId) return json(400, { error: 'call_id is required.' })

    const rawUtterances = Array.isArray(body?.utterances) ? body.utterances : []
    if (!rawUtterances.length) return json(400, { error: 'utterances are required.' })

    const { data: call, error: callErr } = await admin
      .from('chat_calls')
      .select('id, chat_room_id, media_mode, status, ended_at, live_transcript')
      .eq('id', callId)
      .maybeSingle()
    if (callErr) return json(500, { error: callErr.message })
    if (!call) return json(404, { error: 'Call not found.' })
    if (call.media_mode !== 'audio') {
      return json(400, { error: 'Live STT is only available on voice calls.' })
    }
    if (!(await requireRoomMember(admin, call.chat_room_id, actorUserId))) {
      return json(403, { error: 'Not a room member.' })
    }
    if (!(await requireCallParticipant(admin, callId, actorUserId))) {
      return json(403, { error: 'Not a call participant.' })
    }

    // Allow a short post-hangup flush window so finals land on the summary.
    if (['ended', 'missed', 'declined'].includes(String(call.status))) {
      const endedMs = call.ended_at ? Date.parse(String(call.ended_at)) : NaN
      if (!Number.isFinite(endedMs) || Date.now() - endedMs > 90_000) {
        return json(400, { error: 'Call transcript flush window has closed.' })
      }
    }

    const incoming = rawUtterances
      .map((u) => {
        if (!u || typeof u !== 'object') return null
        const row = u as Record<string, unknown>
        return {
          id: row.id != null ? String(row.id) : undefined,
          start_ms: Number(row.start_ms),
          end_ms: Number(row.end_ms),
          text: String(row.text || ''),
          // Identity is always the authenticated participant (do not trust client user_id).
          user_id: actorUserId,
          speaker: row.speaker != null ? Number(row.speaker) : undefined,
        }
      })
      .filter(Boolean) as Array<{
      id?: string
      start_ms: number
      end_ms: number
      text: string
      user_id: string
      speaker?: number
    }>

    if (!incoming.length) return json(400, { error: 'No valid utterances.' })

    const language =
      body?.language != null && String(body.language).trim()
        ? String(body.language).trim()
        : null
    const nextDraft = mergeLiveTranscriptUtterances(
      (call.live_transcript || {}) as LiveCallTranscriptDraft,
      incoming,
      language,
    )

    const { error: upErr } = await admin
      .from('chat_calls')
      .update({ live_transcript: nextDraft })
      .eq('id', callId)
    if (upErr) return json(500, { error: upErr.message })

    let linkPreview: CallRecordingPreviewWithTranscript | null = null
    try {
      linkPreview = await syncCallSummaryLiveTranscript(admin, callId, nextDraft)
    } catch (err) {
      console.warn('chat-call-transcribe: summary sync failed', err)
    }

    return json(200, {
      ok: true,
      live_transcript: nextDraft,
      link_preview: linkPreview,
      utterance_count: nextDraft.utterances?.length || 0,
    })
  }

  // ── remap_speakers ───────────────────────────────────────────────────────
  if (action === 'remap_speakers') {
    if (!actorUserId) return json(403, { error: 'User session required.' })
    const messageId = String(body?.message_id || '').trim()
    const rawMap = body?.speaker_map
    if (!messageId) return json(400, { error: 'message_id is required.' })
    if (!rawMap || typeof rawMap !== 'object') {
      return json(400, { error: 'speaker_map is required.' })
    }

    const msg = await loadTranscriptMessage(admin, messageId)
    const encoding = String(msg?.content_encoding || '')
    if (
      !msg ||
      msg.deleted_at ||
      (encoding !== 'call_recording' && encoding !== 'call_summary')
    ) {
      return json(404, { error: 'Transcript message not found.' })
    }
    if (!(await requireRoomMember(admin, msg.room_id, actorUserId))) {
      return json(403, { error: 'Not a room member.' })
    }

    const preview = (msg.link_preview || {}) as CallRecordingPreviewWithTranscript
    const participants = participantsFromPreview(preview)
    const transcript = preview.transcript
    if (!transcript || !Array.isArray(transcript.utterances)) {
      return json(400, { error: 'No transcript to remap yet.' })
    }

    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      const uid = String(v || '').trim()
      if (!uid) continue
      if (!participants.some((p) => p.user_id === uid)) continue
      cleaned[String(k)] = uid
    }
    const speakerMap = buildSpeakerMap(
      transcript.utterances.map((u) => u.speaker),
      participants,
      cleaned,
    )
    const nextTranscript: CallTranscriptPayload = {
      ...transcript,
      speaker_map: speakerMap,
      utterances: applySpeakerMapToUtterances(transcript.utterances, speakerMap),
    }
    const next = await patchMessagePreview(admin, messageId, preview, {
      transcript_status: 'ready',
      transcript: nextTranscript,
      transcript_error: null,
    })
    return json(200, { ok: true, link_preview: next })
  }

  // ── transcribe ───────────────────────────────────────────────────────────
  if (action === 'transcribe') {
    if (!deepgramKey) {
      return json(500, { error: 'DEEPGRAM_API_KEY is not configured.' })
    }
    const messageId = String(body?.message_id || '').trim()
    if (!messageId) return json(400, { error: 'message_id is required.' })

    const msg = await loadRecordingMessage(admin, messageId)
    if (!msg || msg.deleted_at || msg.content_encoding !== 'call_recording') {
      return json(404, { error: 'Recording message not found.' })
    }
    if (actorUserId && !(await requireRoomMember(admin, msg.room_id, actorUserId))) {
      return json(403, { error: 'Not a room member.' })
    }

    const videoUrl = String(msg.video_url || '').trim()
    if (!videoUrl) return json(400, { error: 'Recording has no video_url yet.' })

    const preview = (msg.link_preview || {}) as CallRecordingPreviewWithTranscript
    if (preview.transcript_status === 'ready' && preview.transcript?.utterances?.length && !body?.force) {
      return json(200, { ok: true, link_preview: preview, cached: true })
    }

    await patchMessagePreview(admin, messageId, preview, {
      transcript_status: 'pending',
      transcript_error: null,
    })

    const participants = participantsFromPreview(preview)
    const publicBase = Deno.env.get('CHAT_CALL_TRANSCRIBE_PUBLIC_URL')?.trim() || ''
    // Prefer Deepgram callback when explicitly async AND callback URL/secret are configured.
    const useCallback = body?.async === true && Boolean(publicBase && callbackSecret)

    try {
      if (useCallback) {
        const cb = new URL(publicBase)
        cb.searchParams.set('action', 'deepgram_callback')
        cb.searchParams.set('message_id', messageId)
        cb.searchParams.set('token', callbackSecret)
        await startDeepgramCallback(videoUrl, deepgramKey, cb.toString())
        const pending = await patchMessagePreview(admin, messageId, preview, {
          transcript_status: 'pending',
          transcript_error: null,
        })
        return json(200, { ok: true, pending: true, link_preview: pending })
      }

      const dg = await runDeepgramSync(videoUrl, deepgramKey)
      const existingMap =
        preview.transcript && typeof preview.transcript === 'object'
          ? preview.transcript.speaker_map
          : null
      const transcript = transcriptFromDeepgram(
        dg as Parameters<typeof transcriptFromDeepgram>[0],
        participants,
        existingMap,
      )
      const next = await patchMessagePreview(
        admin,
        messageId,
        preview,
        applyTranscriptToPreview(preview, transcript),
      )
      return json(200, { ok: true, link_preview: next })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const next = await patchMessagePreview(admin, messageId, preview, {
        transcript_status: 'failed',
        transcript_error: errMsg.slice(0, 500),
      })
      return json(500, { error: errMsg, link_preview: next })
    }
  }

  return json(400, { error: `Unknown action: ${action}` })
})
